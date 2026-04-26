// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/discover.mjs
 *
 * Implements `testnux discover <url>`.
 *
 * v0.2 ALPHA — wired to Claude API (claude-sonnet-4-6 by default).
 *
 * Browses the page at <url>, extracts a lightweight DOM summary (title,
 * headings, interactive elements, ARIA labels) using regex-based extraction,
 * sends it to the Anthropic Messages API, and writes a scenarios.md file with
 * Given/When/Then test cases — every LLM-generated cell tagged [VERIFY].
 *
 * Usage:
 *   testnux discover <url> [--output <path>] [--model <model>]
 *                               [--max-tokens <n>] [--dry-run]
 *
 * Requires:
 *   CLAUDE_API_KEY environment variable (Anthropic API key).
 *   @anthropic-ai/sdk — optional peer dep: npm install @anthropic-ai/sdk
 *
 * Cost estimate: ~$0.04–$0.35 per page depending on DOM complexity.
 * See docs/costs.md for the full per-stage cost table.
 *
 * Exit codes:
 *   0  success (scenarios.md written, or dry-run printed)
 *   1  configuration error (missing API key, missing SDK, bad URL)
 *   2  API error (401, 429, 5xx)
 *   3  LLM response parse error (raw response saved to scenarios.raw.txt)
 */

import path from 'path';
import fs from 'fs';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL      = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 8000;
const FETCH_TIMEOUT_MS   = 30_000;
const API_TIMEOUT_MS     = 60_000;

/**
 * Pricing as of April 2026 — claude-sonnet-4-6.
 * Source: https://docs.anthropic.com/en/docs/models-overview
 * Units: USD per 1M tokens.
 */
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80, output:  4.00 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00 },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} url  Target page URL
 * @param {{
 *   slug?:      string,
 *   output?:    string,
 *   model?:     string,
 *   maxTokens?: number,
 *   dryRun?:    boolean,
 *   json?:      boolean,
 * }} opts
 */
export async function runDiscover(url, opts = {}) {
  const {
    slug      = deriveSlug(url),
    output    = '.',
    model     = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    dryRun    = false,
    json      = false,
    maxSpend  = null,
  } = opts;

  // ── Step 0: Validate URL scheme (SSRF / file:// guard) ───────────────────

  {
    let parsed;
    try { parsed = new URL(url); } catch {
      printError(json, `Invalid URL: ${url}\n\n  discover only accepts http:// or https:// URLs.`);
      const err = new Error('Invalid URL');
      err.exitCode = 1;
      throw err;
    }
    // Reject non-HTTP schemes (file://, data:, javascript:, etc.)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      printError(json,
        `URL scheme "${parsed.protocol}" is not allowed.\n\n` +
        '  discover only fetches http:// or https:// URLs.\n' +
        '  file://, data:, javascript: and other schemes are rejected.',
      );
      const err = new Error(`Disallowed URL scheme: ${parsed.protocol}`);
      err.exitCode = 1;
      throw err;
    }
    // Reject AWS metadata IP and other link-local addresses (basic SSRF guard)
    const host = parsed.hostname.toLowerCase();
    const BLOCKED_HOSTS = ['169.254.169.254', 'metadata.google.internal', 'metadata.internal'];
    if (BLOCKED_HOSTS.includes(host)) {
      printError(json, `URL host "${parsed.hostname}" is blocked (SSRF protection).`);
      const err = new Error(`Blocked host: ${parsed.hostname}`);
      err.exitCode = 1;
      throw err;
    }
  }

  // ── Step 1: Check CLAUDE_API_KEY ──────────────────────────────────────────

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    printError(json,
      'CLAUDE_API_KEY is not set.\n\n' +
      '  Get your API key at: https://console.anthropic.com/\n' +
      '  Then set it:\n\n' +
      '    export CLAUDE_API_KEY=sk-ant-...\n\n' +
      '  Or add it to .env.local:\n\n' +
      '    echo "CLAUDE_API_KEY=sk-ant-..." >> .env.local\n\n' +
      '  Run without an API key: testnux init <slug>  (scaffolds templates manually)',
    );
    const err = new Error('CLAUDE_API_KEY not set');
    err.exitCode = 1;
    throw err;
  }

  // ── Step 2: Dynamically import @anthropic-ai/sdk ──────────────────────────

  let Anthropic;
  if (!dryRun) {
    try {
      const mod = await import('@anthropic-ai/sdk');
      Anthropic = mod.default ?? mod.Anthropic;
    } catch (importErr) {
      if (importErr.code === 'ERR_MODULE_NOT_FOUND' || importErr.code === 'MODULE_NOT_FOUND') {
        printError(json,
          '@anthropic-ai/sdk is not installed.\n\n' +
          '  Install with:\n\n' +
          '    npm install @anthropic-ai/sdk\n\n' +
          '  Then re-run: testnux discover ' + url,
        );
        const err = new Error('@anthropic-ai/sdk not installed');
        err.exitCode = 1;
        throw err;
      }
      throw importErr;
    }
  }

  // ── Step 3: Fetch the URL and extract DOM summary ─────────────────────────

  if (!json) {
    console.log('');
    console.log('  testnux discover — v0.2 ALPHA');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  URL   : ${url}`);
    console.log(`  Slug  : ${slug}`);
    console.log(`  Model : ${model}`);
    console.log(`  Output: ${path.resolve(output)}`);
    if (dryRun) console.log('  Mode  : --dry-run (no API call will be made)');
    console.log('');
  }

  if (!json) console.log('  [1/4] Fetching page HTML...');

  let domSummary;
  let pageTitle;
  try {
    const html = await fetchHtml(url);
    pageTitle  = extractTitle(html);
    domSummary = extractDomSummary(html);
  } catch (fetchErr) {
    printError(json,
      `Failed to fetch ${url}:\n\n  ${fetchErr.message}\n\n` +
      '  Check:\n' +
      '    - URL is reachable from your machine\n' +
      '    - The page returns Content-Type: text/html\n' +
      '    - No VPN/firewall is blocking the request',
    );
    const err = new Error(`URL fetch failed: ${fetchErr.message}`);
    err.exitCode = 1;
    throw err;
  }

  if (!json) console.log(`  [1/4] Done — title: "${pageTitle}"`);

  // ── Step 4: Build the prompt ──────────────────────────────────────────────

  if (!json) console.log('  [2/4] Building prompt...');

  const timestamp = new Date().toISOString();
  const { systemPrompt, userPrompt } = buildPrompt({
    url,
    slug,
    domSummary,
    timestamp,
  });

  // Cost estimate (pre-call)
  const inputTokenEstimate  = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  const outputTokenEstimate = maxTokens;
  const pricing             = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  const costEstimate        =
    (inputTokenEstimate  / 1_000_000) * pricing.input +
    (outputTokenEstimate / 1_000_000) * pricing.output;

  if (!json) {
    console.log(`  [2/4] Prompt built`);
    console.log(`        Est. input tokens : ~${inputTokenEstimate.toLocaleString()}`);
    console.log(`        Max output tokens : ${outputTokenEstimate.toLocaleString()}`);
    console.log(`        Est. cost (upper) : ~$${costEstimate.toFixed(4)}`);
    console.log('');
  }

  // ── Dry-run: print prompt + cost and exit ─────────────────────────────────

  if (dryRun) {
    if (json) {
      process.stdout.write(JSON.stringify({
        event:              'discover.dry-run',
        url,
        slug,
        model,
        inputTokenEstimate,
        outputTokenEstimate,
        costEstimateUsd:    costEstimate,
        systemPrompt,
        userPrompt,
      }) + '\n');
    } else {
      console.log('  ── SYSTEM PROMPT ──────────────────────────────────────────');
      console.log('');
      console.log(systemPrompt);
      console.log('');
      console.log('  ── USER PROMPT ────────────────────────────────────────────');
      console.log('');
      console.log(userPrompt);
      console.log('');
      console.log('  ── DRY-RUN COMPLETE ───────────────────────────────────────');
      console.log(`  No API call made. Estimated cost: ~$${costEstimate.toFixed(4)}`);
      console.log('  Remove --dry-run to run for real.');
      console.log('');
    }
    return;
  }

  // ── Step 4b: Enforce --max-spend BEFORE API call ──────────────────────────

  if (maxSpend !== null) {
    if (costEstimate > maxSpend) {
      const msg =
        `Estimated cost ($${costEstimate.toFixed(2)}) exceeds --max-spend ($${maxSpend.toFixed(2)}). ` +
        `Aborting before API call. Re-run with higher --max-spend or --dry-run to inspect.`;
      printError(json, msg);
      const err = new Error('Cost estimate exceeds --max-spend');
      err.exitCode = 1;
      throw err;
    } else {
      if (!json) {
        console.log(`  ✓ Estimated cost ($${costEstimate.toFixed(2)}) within --max-spend ($${maxSpend.toFixed(2)}). Proceeding.`);
        console.log('');
      }
    }
  }

  // ── Step 5: Call Claude API ───────────────────────────────────────────────

  if (!json) console.log('  [3/4] Calling Claude API...');

  let rawResponse;
  let usage;
  try {
    rawResponse = await callClaude({
      Anthropic,
      apiKey,
      model,
      maxTokens,
      systemPrompt,
      userPrompt,
    });
    usage = rawResponse.usage;
  } catch (apiErr) {
    handleApiError(apiErr, json, url);
    // handleApiError always throws
  }

  const responseText = rawResponse.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // ── Step 6 & 7: Parse response + inject [VERIFY] markers ─────────────────

  if (!json) console.log('  [3/4] Response received — parsing...');

  let scenariosContent;
  try {
    scenariosContent = ensureVerifyMarkers(responseText);
  } catch (parseErr) {
    // Save raw response for debugging
    const rawPath = path.resolve(output, 'scenarios.raw.txt');
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, responseText, 'utf-8');

    printError(json,
      `LLM response could not be parsed as scenarios.md:\n\n  ${parseErr.message}\n\n` +
      `  Raw response saved to: ${rawPath}\n` +
      '  Review the raw file and re-run, or file a bug at:\n' +
      '  https://github.com/StillNotBald/testnux/issues',
    );
    const err = new Error('LLM response parse error');
    err.exitCode = 3;
    throw err;
  }

  // ── Step 8: Write scenarios.md ────────────────────────────────────────────

  if (!json) console.log('  [4/4] Writing scenarios.md...');

  const outDir  = path.resolve(output);
  const outFile = path.join(outDir, 'scenarios.md');
  fs.mkdirSync(outDir, { recursive: true });

  // Atomic write: temp file → rename (preserves previous file on interruption)
  const tmpFile = outFile + '.tmp';
  fs.writeFileSync(tmpFile, scenariosContent, 'utf-8');
  fs.renameSync(tmpFile, outFile);

  // ── Step 9: Summary ───────────────────────────────────────────────────────

  const tcCount       = countTCs(scenariosContent);
  const actualInput   = usage?.input_tokens  ?? inputTokenEstimate;
  const actualOutput  = usage?.output_tokens ?? 0;
  const actualCost    =
    (actualInput  / 1_000_000) * pricing.input +
    (actualOutput / 1_000_000) * pricing.output;

  if (json) {
    process.stdout.write(JSON.stringify({
      event:          'discover.done',
      url,
      slug,
      model,
      outFile,
      tcCount,
      tokensIn:       actualInput,
      tokensOut:      actualOutput,
      costUsd:        actualCost,
    }) + '\n');
  } else {
    console.log('');
    console.log('  ── discover complete ───────────────────────────────────────');
    console.log(`  scenarios.md : ${outFile}`);
    console.log(`  TC count     : ${tcCount}`);
    console.log(`  Tokens in    : ${actualInput.toLocaleString()}`);
    console.log(`  Tokens out   : ${actualOutput.toLocaleString()}`);
    console.log(`  Actual cost  : ~$${actualCost.toFixed(4)}`);
    console.log('');
    console.log('  Next steps:');
    console.log(`    1. Review ${outFile} — remove [VERIFY] as you confirm each TC`);
    console.log(`    2. Run: testnux plan ${slug}`);
    console.log('');
  }
}

// ── DOM Extraction ───────────────────────────────────────────────────────────

/**
 * Fetches a URL and returns raw HTML.
 * Validates Content-Type and enforces a timeout.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'testnux/0.0.1 (+https://github.com/StillNotBald/testnux)',
        'Accept':     'text/html,application/xhtml+xml',
      },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  }

  const contentType = resp.headers.get('content-type') ?? '';
  if (!contentType.includes('html') && !contentType.includes('xml')) {
    throw new Error(
      `Expected HTML response but got Content-Type: ${contentType}. ` +
      'Only HTML pages are supported by discover.',
    );
  }

  return resp.text();
}

/**
 * Extracts the page <title> from raw HTML.
 * @param {string} html
 * @returns {string}
 */
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()).slice(0, 120) : '(no title)';
}

/**
 * Extracts a structured DOM summary from raw HTML using regex.
 * Strips <script> and <style> blocks first, then captures:
 *   - Page title
 *   - All heading text (h1–h6)
 *   - All interactive element summaries (input, button, a, form, select, textarea)
 *   - All aria-label / aria-labelledby / placeholder values
 *
 * This is intentionally lightweight — no heavy HTML parser dependency.
 * @param {string} html
 * @returns {string}  structured text summary for the prompt
 */
function extractDomSummary(html) {
  // Strip script and style blocks
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const title    = extractTitle(html);
  const headings = extractHeadings(clean);
  const elements = extractInteractiveElements(clean);
  const forms    = extractForms(clean);
  const ariaInfo = extractAriaLabels(clean);

  const parts = [
    `PAGE TITLE: ${title}`,
    '',
    '=== HEADINGS ===',
    headings.length > 0
      ? headings.map((h) => `${h.level}: ${h.text}`).join('\n')
      : '(none found)',
    '',
    '=== INTERACTIVE ELEMENTS ===',
    elements.length > 0
      ? elements.map(formatElement).join('\n')
      : '(none found)',
    '',
    '=== FORMS ===',
    forms.length > 0
      ? forms.map(formatForm).join('\n')
      : '(none found)',
    '',
    '=== ARIA LABELS / ROLES ===',
    ariaInfo.length > 0
      ? ariaInfo.map((a) => `  ${a}`).join('\n')
      : '(none found)',
  ];

  return parts.join('\n');
}

/** @returns {{ level: string, text: string }[]} */
function extractHeadings(html) {
  const results = [];
  const re = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripTags(m[2]).trim();
    if (text) results.push({ level: m[1].toUpperCase(), text: text.slice(0, 120) });
    if (results.length >= 30) break;
  }
  return results;
}

/**
 * Captures input, button, a, select, textarea, summary elements.
 * @returns {Array<{tag: string, type?: string, name?: string, id?: string, aria?: string, text?: string, href?: string}>}
 */
function extractInteractiveElements(html) {
  const results = [];

  // Inputs, selects, textareas
  const fieldRe = /<(input|select|textarea)([^>]*?)(?:>([\s\S]*?)<\/\1>|\/?>)/gi;
  let m;
  while ((m = fieldRe.exec(html)) !== null) {
    const attrs = parseAttrs(m[2]);
    const inner = m[3] ? stripTags(m[3]).trim() : '';
    if (attrs.type === 'hidden') continue;
    results.push({
      tag:         m[1].toLowerCase(),
      type:        attrs.type,
      name:        attrs.name,
      id:          attrs.id,
      placeholder: attrs.placeholder,
      aria:        attrs['aria-label'] ?? attrs['aria-labelledby'],
      required:    'required' in attrs || attrs.required === 'true',
      text:        inner.slice(0, 80) || undefined,
    });
    if (results.length >= 60) break;
  }

  // Buttons
  const btnRe = /<button([^>]*?)>([\s\S]*?)<\/button>/gi;
  while ((m = btnRe.exec(html)) !== null) {
    const attrs = parseAttrs(m[1]);
    const text  = stripTags(m[2]).trim();
    results.push({
      tag:  'button',
      type: attrs.type ?? 'submit',
      id:   attrs.id,
      aria: attrs['aria-label'],
      text: text.slice(0, 80),
    });
    if (results.length >= 80) break;
  }

  // Anchor links (only those with meaningful href or aria)
  const aRe = /<a([^>]*?)>([\s\S]*?)<\/a>/gi;
  while ((m = aRe.exec(html)) !== null) {
    const attrs = parseAttrs(m[1]);
    const text  = stripTags(m[2]).trim();
    const href  = attrs.href;
    if (!href || href === '#' || href.startsWith('javascript:')) continue;
    results.push({
      tag:  'a',
      href: href.slice(0, 120),
      aria: attrs['aria-label'],
      text: text.slice(0, 80),
    });
    if (results.length >= 100) break;
  }

  return results;
}

/** @returns {Array<{action?: string, method?: string, fields: string[]}>} */
function extractForms(html) {
  const results = [];
  const formRe = /<form([^>]*?)>([\s\S]*?)<\/form>/gi;
  let m;
  while ((m = formRe.exec(html)) !== null) {
    const attrs  = parseAttrs(m[1]);
    const body   = m[2];
    const fields = [];
    const fieldRe2 = /<(input|select|textarea)([^>]*?)\/?>/gi;
    let f;
    while ((f = fieldRe2.exec(body)) !== null) {
      const fAttrs = parseAttrs(f[2]);
      if (fAttrs.type !== 'hidden') {
        fields.push(
          [fAttrs.type ?? f[1], fAttrs.name, fAttrs.placeholder, fAttrs['aria-label']]
            .filter(Boolean).join('|'),
        );
      }
    }
    results.push({
      action: attrs.action,
      method: attrs.method ?? 'GET',
      fields,
    });
    if (results.length >= 10) break;
  }
  return results;
}

/** @returns {string[]} */
function extractAriaLabels(html) {
  const results = new Set();
  const re = /aria-label="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    results.add(m[1].trim());
    if (results.size >= 40) break;
  }
  const roleRe = /role="([^"]+)"/gi;
  while ((m = roleRe.exec(html)) !== null) {
    results.add(`role=${m[1]}`);
    if (results.size >= 60) break;
  }
  return [...results];
}

/** Formats a single interactive element for the prompt. */
function formatElement(el) {
  const parts = [`  <${el.tag}`];
  if (el.type)        parts.push(`type="${el.type}"`);
  if (el.name)        parts.push(`name="${el.name}"`);
  if (el.id)          parts.push(`id="${el.id}"`);
  if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
  if (el.aria)        parts.push(`aria-label="${el.aria}"`);
  if (el.required)    parts.push('required');
  if (el.href)        parts.push(`href="${el.href}"`);
  const base = parts.join(' ') + '>';
  return el.text ? `${base} ${el.text}` : base;
}

/** Formats a form summary for the prompt. */
function formatForm(form) {
  const header = `  <form action="${form.action ?? ''}" method="${form.method}">`;
  const fields = form.fields.map((f) => `    field: ${f}`).join('\n');
  return fields ? `${header}\n${fields}` : header;
}

// ── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Builds the system + user prompts from the DOM summary.
 * Derived from the v0.1 prompt template.
 *
 * @param {{ url: string, slug: string, domSummary: string, timestamp: string }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildPrompt({ url, slug, domSummary, timestamp }) {
  const systemPrompt = `You are a senior QA engineer specializing in regulated web applications.
You write test cases in Given/When/Then format following ISTQB and OWASP ASVS 4.0 testing principles.
Every test case you produce is tagged:
  - Priority: P0 (smoke/blocker), P1 (critical path), P2 (edge case)
  - Category: FUNCTIONAL | SECURITY | ACCESSIBILITY | PERFORMANCE | ERROR-HANDLING
  - Standards: list applicable NIST, OWASP, WCAG references (e.g. OWASP ASVS 2.1.1, WCAG 2.2 SC 1.3.1, NIST SP 800-63B 5.1)

You ALWAYS add [VERIFY] to LLM-generated content that requires human confirmation.
You NEVER invent behavior. If you are uncertain about the expected outcome, emit a [VERIFY] marker.
You are concise but thorough. Never add introductory prose — output only the YAML frontmatter + TC blocks.`;

  const userPrompt = `I am auditing the page at: ${url}

Below is the DOM snapshot (title, headings, interactive elements, ARIA tree):
\`\`\`
${domSummary}
\`\`\`

TASK: Generate a comprehensive set of test scenarios for this page.

For EACH interactive element (inputs, buttons, links, dropdowns, forms, selects, textareas):

  1. Write a TC-XX entry in this EXACT format:

     ## TC-01 — [Short descriptive title]
     **Priority**: P0 | P1 | P2
     **Category**: FUNCTIONAL | SECURITY | ACCESSIBILITY | PERFORMANCE | ERROR-HANDLING
     **Standards**: [e.g. OWASP ASVS 2.1.1, WCAG 2.2 SC 1.3.1, NIST SP 800-63B 5.1]

     **Given** [precondition: user role, auth state, data state]
     **When** [specific action — be precise about input values and sequences]
     **Then** [expected outcome — be specific about UI state, API calls, data changes]

     > [VERIFY] Confirm behavior matches product specification before execution.

  2. Cover ALL of these test categories before moving to the next element:
     - Happy path (P0/P1)
     - Boundary values (P1/P2)
     - Invalid/error inputs (P1)
     - Empty/null states (P1)
     - Permission edge cases (P0 if auth-gated)
     - Accessibility: keyboard navigation, screen reader, focus management (P1)
     - Security: XSS input attempt, SQL injection attempt, CSRF token presence (P1 for forms)

  3. After all per-element scenarios, add a GLOBAL section:
     ## Global Scenarios

     ### TC-GX-01 — Page load within SLA
     **Priority**: P0
     **Category**: PERFORMANCE
     **Standards**: WCAG 2.2 SC 2.2.1

     **Given** the user has a stable broadband connection
     **When** they navigate to \`${url}\`
     **Then** the page is interactive (LCP) within 2.5 seconds

     > [VERIFY] Confirm SLA matches product spec.

     Also add: browser back/forward navigation (P1), mobile viewport 375px layout (P1),
     session expiry while on page (P0 if authenticated), network error / 500 response (P1).

OUTPUT FORMAT: Pure markdown. Start with this YAML frontmatter block:
---
slug: ${slug}
url: ${url}
generated_by: testnux discover v0.2
generated_at: ${timestamp}
tc_count: [TOTAL NUMBER — fill in before outputting]
review_required: true
---

Then emit each TC block in order. No introductory prose. Just the frontmatter + TCs.`;

  return { systemPrompt, userPrompt };
}

// ── Claude API Call ──────────────────────────────────────────────────────────

/**
 * Calls the Anthropic Messages API with an AbortController timeout.
 * @returns {Promise<import('@anthropic-ai/sdk').Message>}
 */
async function callClaude({ Anthropic, apiKey, model, maxTokens, systemPrompt, userPrompt }) {
  const client = new Anthropic({ apiKey });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const message = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal },
    );
    return message;
  } finally {
    clearTimeout(timer);
  }
}

// ── Error Handling ───────────────────────────────────────────────────────────

/**
 * Handles Anthropic API errors with user-friendly messages.
 * Always throws with an appropriate exitCode.
 */
function handleApiError(err, json, url) {
  const status = err.status ?? err.statusCode;

  if (status === 401) {
    printError(json,
      'API key is invalid (401 Unauthorized).\n\n' +
      '  Check that CLAUDE_API_KEY is set correctly.\n' +
      '  Get a new key at: https://console.anthropic.com/',
    );
    const e = new Error('API 401 Unauthorized');
    e.exitCode = 2;
    throw e;
  }

  if (status === 429) {
    const retryAfter = err.headers?.['retry-after'] ?? '60';
    printError(json,
      `Rate limit exceeded (429 Too Many Requests).\n\n` +
      `  Retry after: ${retryAfter}s\n\n` +
      '  Options:\n' +
      '    - Wait and re-run: testnux discover ' + url + '\n' +
      '    - Use --max-tokens to reduce response size\n' +
      '    - Spread requests across multiple sessions',
    );
    const e = new Error('API 429 Rate Limit');
    e.exitCode = 2;
    throw e;
  }

  if (status >= 500) {
    printError(json,
      `Anthropic API server error (${status}).\n\n` +
      '  This is a transient error. Retry in a few minutes.\n' +
      '  Status page: https://status.anthropic.com/',
    );
    const e = new Error(`API ${status} Server Error`);
    e.exitCode = 2;
    throw e;
  }

  if (err.name === 'AbortError' || err.message?.includes('abort')) {
    printError(json,
      `API call timed out after ${API_TIMEOUT_MS / 1000}s.\n\n` +
      '  Try:\n' +
      '    - Reducing --max-tokens to shorten the response\n' +
      '    - Re-running when the API is less loaded',
    );
    const e = new Error('API call timed out');
    e.exitCode = 2;
    throw e;
  }

  // Unknown API error
  printError(json, `Anthropic API error: ${err.message ?? String(err)}`);
  const e = new Error(`API error: ${err.message}`);
  e.exitCode = 2;
  throw e;
}

// ── [VERIFY] Marker Enforcement ──────────────────────────────────────────────

/**
 * Ensures every TC block in the response ends with a [VERIFY] blockquote.
 * If a TC block is missing the marker, it is appended.
 * Also validates that the response looks like valid scenarios.md content.
 *
 * @param {string} text  raw LLM response text
 * @returns {string}     text with [VERIFY] markers guaranteed on all TCs
 */
function ensureVerifyMarkers(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('LLM returned an empty response');
  }

  // Ensure the response has at least one TC heading
  if (!/^##\s+TC-/m.test(text)) {
    // Allow "## Global Scenarios" as a fallback indicator
    if (!/^##\s+Global\s+Scenarios/m.test(text)) {
      throw new Error(
        'Response does not contain any TC-XX headings. ' +
        'The LLM may have returned unexpected content.',
      );
    }
  }

  // Split on TC headings to process each block
  // Pattern: ## TC-XX or ### TC-XX (for sub-TCs like TC-GX-01)
  const VERIFY_RE = /\[VERIFY\]/i;
  const TC_HEADING_RE = /^(#{2,3}\s+TC-)/m;

  if (!TC_HEADING_RE.test(text)) return text;

  // For each TC block, ensure it ends with a [VERIFY] blockquote
  // We do a simple pass: split on TC headings, check/append per block
  const blocks = text.split(/(?=^#{2,3}\s+TC-)/m);
  const ensured = blocks.map((block) => {
    // Only process blocks that start with a TC heading
    if (!block.match(/^#{2,3}\s+TC-/)) return block;

    if (VERIFY_RE.test(block)) return block;

    // Append [VERIFY] blockquote
    return block.trimEnd() + '\n\n> [VERIFY] Confirm behavior matches product specification before execution.\n';
  });

  return ensured.join('');
}

// ── TC Counter ───────────────────────────────────────────────────────────────

/**
 * Counts the number of TC-XX headings in the content.
 * @param {string} content
 * @returns {number}
 */
function countTCs(content) {
  const matches = content.match(/^#{2,3}\s+TC-/gm);
  return matches ? matches.length : 0;
}

// ── Utility Helpers ───────────────────────────────────────────────────────────

/**
 * Derives a URL slug for file naming.
 * E.g. https://example.com/login/mfa → "login-mfa"
 * @param {string} url
 * @returns {string}
 */
function deriveSlug(url) {
  try {
    const u        = new URL(url);
    const segments = u.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
    const slug     = segments.length > 0
      ? segments.join('-')
      : u.hostname.replace(/\./g, '-');
    return slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40) || 'page';
  } catch {
    return 'page';
  }
}

/**
 * Parses HTML tag attribute string into an object.
 * Handles both quoted (`attr="val"`) and boolean (`required`) attributes.
 * @param {string} attrStr
 * @returns {Record<string, string>}
 */
function parseAttrs(attrStr) {
  const result = {};
  const re = /([a-z][a-z0-9-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]*))|(?=\s|$))/gi;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    result[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return result;
}

/**
 * Strips HTML tags from a string.
 * @param {string} html
 * @returns {string}
 */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Decodes common HTML entities.
 * @param {string} str
 * @returns {string}
 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Prints an error message in either JSON or human-readable format.
 * @param {boolean} json
 * @param {string} message
 */
function printError(json, message) {
  if (json) {
    process.stderr.write(JSON.stringify({ event: 'discover.error', message }) + '\n');
  } else {
    console.error('');
    console.error('  ERROR: ' + message.split('\n').join('\n  '));
    console.error('');
  }
}

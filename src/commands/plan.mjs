// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/plan.mjs
 *
 * Implements `testnux plan <slug>`.
 *
 * v0.2 ALPHA — wired to Claude API (claude-sonnet-4-6 by default).
 *
 * Reads scenarios.md (produced by `testnux discover`), sends it to the
 * Anthropic Messages API with a structured prompt, and writes a test-plan.md
 * conforming to the TestNUX schema (YAML frontmatter + TC table format).
 * Every LLM-generated cell is tagged [VERIFY].
 *
 * Usage:
 *   testnux plan <slug> [--url <url>] [--industry <industry>]
 *                       [--out <path>] [--model <model>]
 *                       [--max-tokens <n>] [--dry-run] [--max-spend <n>]
 *
 * Requires:
 *   CLAUDE_API_KEY environment variable (Anthropic API key).
 *   @anthropic-ai/sdk — optional peer dep: npm install @anthropic-ai/sdk
 *
 * Cost estimate: ~$0.30–$0.80 per page depending on scenarios complexity.
 * See docs/costs.md for the full per-stage cost table.
 *
 * Exit codes:
 *   0  success (test-plan.md written, or dry-run printed)
 *   1  configuration error (missing scenarios, missing API key, missing SDK)
 *   2  API error (401, 429, 5xx, timeout)
 *   3  LLM response parse error (raw response saved to test-plan.raw.txt)
 *
 * =============================================================================
 * PROMPTS USED BY THIS COMMAND (for reference / customization):
 * =============================================================================
 *
 * SYSTEM:
 *   You are a senior QA engineer who writes structured test plans for regulated
 *   web applications. Your output must conform exactly to the TestNUX
 *   test-plan.md schema (YAML frontmatter + markdown body). You write
 *   deterministically: same input → same structure every time.
 *   You never invent requirements. If you cannot map a scenario to an R-ID,
 *   you emit r_ids: [] and add [VERIFY] for the human to fill in.
 *   Every cell you generate that requires human verification carries [VERIFY].
 *
 * USER:
 *   Surface slug: {{slug}}
 *   Industry: {{industry}}
 *   R-IDs in scope (from REQUIREMENTS.md grep): {{r_ids_json}}
 *
 *   Scenarios document:
 *   ---
 *   {{scenarios_md}}
 *   ---
 *
 *   DOM context (optional — omit if not captured):
 *   {{dom_snapshot_or_NONE}}
 *
 *   TASK: Convert the scenarios above into a TestNUX test-plan.md.
 *
 *   OUTPUT REQUIREMENTS:
 *
 *   1. YAML frontmatter (required keys):
 *      ---
 *      slug: {{slug}}
 *      title: [human-readable page title]
 *      industry: {{industry}}
 *      status: DRAFT
 *      r_ids: [R-XX, ...]   # map each TC to requirements; use [] if unknown
 *      tc_prefix: {{TC_PREFIX}}  # from slug: "login" → "LOGIN"
 *      standards:
 *        - [e.g. "OWASP ASVS 4.0 v2.1.1"]
 *      review_required: true
 *      ---
 *
 *   2. Body: one section per TC-XX from the scenarios document.
 *      Format each TC as:
 *
 *      ## {{TC_PREFIX}}-01 — [Title from scenario]
 *
 *      | Field       | Value |
 *      |-------------|-------|
 *      | R-ID        | R-XX [VERIFY] |
 *      | Priority    | P0 / P1 / P2 |
 *      | Category    | FUNCTIONAL / SECURITY / ACCESSIBILITY / PERFORMANCE / ERROR-HANDLING |
 *      | Standards   | [NIST / OWASP / WCAG refs] |
 *      | Status      | DRAFT |
 *
 *      **Preconditions**
 *      - [list]
 *
 *      **Steps**
 *      1. [step]
 *      2. [step]
 *
 *      **Expected Result**
 *      [expected outcome]
 *
 *      **Evidence**
 *      - [ ] Screenshot: `evidence/{{TC_PREFIX}}-01-[descriptor].png`
 *
 *      > [VERIFY] Confirm R-ID mapping and expected result before execution.
 *
 *   3. After all TCs, add a ## Summary section:
 *      - Total TCs: N
 *      - P0: N | P1: N | P2: N
 *      - Standards covered: [list]
 *
 *   CRITICAL RULES:
 *   - Do NOT add TCs not present in the scenarios document.
 *   - Do NOT remove [VERIFY] markers.
 *   - Do NOT invent R-IDs. Use [] and [VERIFY] if mapping is uncertain.
 *   - Preserve Given/When/Then logic but restructure to Steps format.
 *   - Number TCs sequentially: {{TC_PREFIX}}-01, {{TC_PREFIX}}-02, ...
 *
 * =============================================================================
 */

import path from 'path';
import fs from 'fs';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL      = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 10000;
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
 * @param {string} slug  Surface slug (e.g. "login", "dashboard")
 * @param {{
 *   url?:       string,
 *   industry?:  string,
 *   out?:       string,
 *   json?:      boolean,
 *   dryRun?:    boolean,
 *   maxSpend?:  number | null,
 *   model?:     string,
 *   maxTokens?: number,
 * }} opts
 */
export async function runPlan(slug, opts = {}) {
  const {
    url       = undefined,
    industry  = 'general',
    out       = './testing-log',
    json      = false,
    dryRun    = false,
    maxSpend  = null,
    model     = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = opts;

  // ── Header ────────────────────────────────────────────────────────────────

  if (!json) {
    console.log('');
    console.log('  testnux plan — v0.2 ALPHA');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  Slug     : ${slug}`);
    console.log(`  Industry : ${industry}`);
    console.log(`  Model    : ${model}`);
    console.log(`  Output   : ${path.resolve(out)}`);
    if (url)    console.log(`  URL      : ${url}`);
    if (dryRun) console.log('  Mode     : --dry-run (no API call will be made)');
    console.log('');
  }

  // ── Step 1: Check CLAUDE_API_KEY ──────────────────────────────────────────

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    printError(json, slug,
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
        printError(json, slug,
          '@anthropic-ai/sdk is not installed.\n\n' +
          '  Install with:\n\n' +
          '    npm install @anthropic-ai/sdk\n\n' +
          '  Then re-run: testnux plan ' + slug,
        );
        const err = new Error('@anthropic-ai/sdk not installed');
        err.exitCode = 1;
        throw err;
      }
      throw importErr;
    }
  }

  // ── Step 3: Find and read scenarios.md ───────────────────────────────────

  if (!json) console.log('  [1/5] Locating scenarios.md...');

  const scenariosFile = findScenariosFile(slug, out);
  if (!scenariosFile) {
    printError(json, slug,
      `No scenarios file found for slug "${slug}".\n\n` +
      '  Run discover first to generate one:\n\n' +
      `    testnux discover <url>   # creates scenarios.md for "${slug}"\n\n` +
      '  Or place one manually at any of these paths:\n' +
      `    ./${slug}-scenarios.md\n` +
      `    ./scenarios/${slug}.md\n` +
      `    ${path.resolve(out)}/<date>_${slug}/scenarios.md`,
    );
    const err = new Error(`No scenarios file found for slug "${slug}"`);
    err.exitCode = 1;
    throw err;
  }

  if (!json) console.log(`  [1/5] Found: ${scenariosFile}`);

  let scenariosMd;
  try {
    scenariosMd = fs.readFileSync(scenariosFile, 'utf-8');
  } catch (readErr) {
    printError(json, slug,
      `Failed to read scenarios file: ${scenariosFile}\n\n  ${readErr.message}`,
    );
    const err = new Error(`Cannot read scenarios file: ${readErr.message}`);
    err.exitCode = 1;
    throw err;
  }

  // ── Step 4: Compute tc_prefix and find R-IDs ─────────────────────────────

  const tcPrefix = slug.toUpperCase().replace(/[^A-Z0-9]/g, '-');

  let rIds = [];
  try {
    const reqFile = path.resolve('requirements/REQUIREMENTS.md');
    if (fs.existsSync(reqFile)) {
      const reqContent = fs.readFileSync(reqFile, 'utf-8');
      const matches    = reqContent.match(/\bR-\d{2,3}\b/g) ?? [];
      rIds = [...new Set(matches)].sort();
    }
  } catch {
    // Non-fatal: R-IDs are optional context
  }

  if (!json) {
    console.log(`  [1/5] TC prefix  : ${tcPrefix}`);
    console.log(`  [1/5] R-IDs found: ${rIds.length > 0 ? rIds.slice(0, 8).join(', ') + (rIds.length > 8 ? ` … (${rIds.length} total)` : '') : 'none (REQUIREMENTS.md not found)'}`);
  }

  // ── Step 5: Build prompts ─────────────────────────────────────────────────

  if (!json) console.log('  [2/5] Building prompt...');

  const { systemPrompt, userPrompt } = buildPrompt({
    slug,
    industry,
    rIds,
    scenariosMd,
    tcPrefix,
  });

  // Cost estimate (pre-call)
  const inputTokenEstimate  = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  const outputTokenEstimate = maxTokens;
  const pricing             = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  const costEstimate        =
    (inputTokenEstimate  / 1_000_000) * pricing.input +
    (outputTokenEstimate / 1_000_000) * pricing.output;

  if (!json) {
    console.log(`  [2/5] Prompt built`);
    console.log(`        Est. input tokens : ~${inputTokenEstimate.toLocaleString()}`);
    console.log(`        Max output tokens : ${outputTokenEstimate.toLocaleString()}`);
    console.log(`        Est. cost (upper) : ~$${costEstimate.toFixed(4)}`);
    console.log('');
  }

  // ── Dry-run: print prompts + cost and exit ────────────────────────────────

  if (dryRun) {
    if (json) {
      process.stdout.write(JSON.stringify({
        event:              'plan.dry-run',
        slug,
        industry,
        tcPrefix,
        model,
        rIdsCount:          rIds.length,
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

  // ── Step 5b: Enforce --max-spend BEFORE API call ──────────────────────────

  if (maxSpend !== null) {
    if (costEstimate > maxSpend) {
      const msg =
        `Estimated cost ($${costEstimate.toFixed(2)}) exceeds --max-spend ($${maxSpend.toFixed(2)}). ` +
        `Aborting before API call. Re-run with higher --max-spend or --dry-run to inspect.`;
      printError(json, slug, msg);
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

  // ── Step 6: Call Claude API ───────────────────────────────────────────────

  if (!json) console.log('  [3/5] Calling Claude API...');

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
    handleApiError(apiErr, json, slug);
    // handleApiError always throws
  }

  const responseText = rawResponse.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (!json) console.log('  [3/5] Response received — parsing...');

  // ── Step 7: Parse response + inject [VERIFY] markers ─────────────────────

  if (!json) console.log('  [4/5] Injecting [VERIFY] markers...');

  let planContent;
  try {
    planContent = ensureVerifyMarkers(responseText, tcPrefix);
  } catch (parseErr) {
    // Compute output folder for raw save even on failure
    const dateStr  = localDateString();
    const outDir   = path.resolve(out, `${dateStr}_${slug}`);
    const rawPath  = path.join(outDir, 'test-plan.raw.txt');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(rawPath, responseText, 'utf-8');

    printError(json, slug,
      `LLM response could not be parsed as test-plan.md:\n\n  ${parseErr.message}\n\n` +
      `  Raw response saved to: ${rawPath}\n` +
      '  Review the raw file and re-run, or file a bug at:\n' +
      '  https://github.com/StillNotBald/testnux/issues',
    );
    const err = new Error('LLM response parse error');
    err.exitCode = 3;
    throw err;
  }

  // ── Step 8: Atomic write to testing-log/<date>_<slug>/test-plan.md ───────

  if (!json) console.log('  [5/5] Writing test-plan.md...');

  const dateStr  = localDateString();
  const outDir   = path.resolve(out, `${dateStr}_${slug}`);
  const outFile  = path.join(outDir, 'test-plan.md');
  fs.mkdirSync(outDir, { recursive: true });

  const tmpFile = outFile + '.tmp';
  fs.writeFileSync(tmpFile, planContent, 'utf-8');
  fs.renameSync(tmpFile, outFile);

  // ── Step 9: Summary ───────────────────────────────────────────────────────

  const tcCount      = countTCs(planContent, tcPrefix);
  const actualInput  = usage?.input_tokens  ?? inputTokenEstimate;
  const actualOutput = usage?.output_tokens ?? 0;
  const actualCost   =
    (actualInput  / 1_000_000) * pricing.input +
    (actualOutput / 1_000_000) * pricing.output;

  if (json) {
    process.stdout.write(JSON.stringify({
      event:     'plan.done',
      slug,
      industry,
      tcPrefix,
      model,
      outFile,
      tcCount,
      tokensIn:  actualInput,
      tokensOut: actualOutput,
      costUsd:   actualCost,
    }) + '\n');
  } else {
    console.log('');
    console.log('  ── plan complete ────────────────────────────────────────────');
    console.log(`  test-plan.md : ${outFile}`);
    console.log(`  TC count     : ${tcCount}`);
    console.log(`  Tokens in    : ${actualInput.toLocaleString()}`);
    console.log(`  Tokens out   : ${actualOutput.toLocaleString()}`);
    console.log(`  Actual cost  : ~$${actualCost.toFixed(4)}`);
    console.log('');
    console.log('  Next steps:');
    console.log(`    1. Review ${outFile} — remove [VERIFY] as you confirm each TC`);
    console.log(`    2. Run: testnux codify ${slug}`);
    console.log('');
  }
}

// ── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Builds the system + user prompts from the scenarios content.
 *
 * @param {{
 *   slug:        string,
 *   industry:    string,
 *   rIds:        string[],
 *   scenariosMd: string,
 *   tcPrefix:    string,
 * }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildPrompt({ slug, industry, rIds, scenariosMd, tcPrefix }) {
  const systemPrompt =
    `You are a senior QA engineer who writes structured test plans for regulated\n` +
    `web applications. Your output must conform exactly to the TestNUX\n` +
    `test-plan.md schema (YAML frontmatter + markdown body). You write\n` +
    `deterministically: same input → same structure every time.\n` +
    `You never invent requirements. If you cannot map a scenario to an R-ID,\n` +
    `you emit r_ids: [] and add [VERIFY] for the human to fill in.\n` +
    `Every cell you generate that requires human verification carries [VERIFY].`;

  const rIdsJson   = JSON.stringify(rIds.length > 0 ? rIds : []);

  const userPrompt =
    `Surface slug: ${slug}\n` +
    `Industry: ${industry}\n` +
    `R-IDs in scope (from REQUIREMENTS.md grep): ${rIdsJson}\n` +
    `\n` +
    `Scenarios document:\n` +
    `---\n` +
    `${scenariosMd}\n` +
    `---\n` +
    `\n` +
    `TASK: Convert the scenarios above into a TestNUX test-plan.md.\n` +
    `\n` +
    `OUTPUT REQUIREMENTS:\n` +
    `\n` +
    `1. YAML frontmatter (required keys):\n` +
    `   ---\n` +
    `   slug: ${slug}\n` +
    `   title: [human-readable page title] [VERIFY]\n` +
    `   industry: ${industry}\n` +
    `   status: DRAFT\n` +
    `   r_ids: [R-XX, ...]   # map each TC to requirements; use [] if unknown\n` +
    `   tc_prefix: ${tcPrefix}\n` +
    `   standards:\n` +
    `     - [e.g. "OWASP ASVS 4.0 v2.1.1"]\n` +
    `   review_required: true\n` +
    `   ---\n` +
    `\n` +
    `2. Body: one section per TC-XX from the scenarios document.\n` +
    `   Format each TC as:\n` +
    `\n` +
    `   ## ${tcPrefix}-01 — [Title from scenario]\n` +
    `\n` +
    `   | Field       | Value |\n` +
    `   |-------------|-------|\n` +
    `   | R-ID        | R-XX [VERIFY] |\n` +
    `   | Priority    | P0 / P1 / P2 |\n` +
    `   | Category    | FUNCTIONAL / SECURITY / ACCESSIBILITY / PERFORMANCE / ERROR-HANDLING |\n` +
    `   | Standards   | [NIST / OWASP / WCAG refs] |\n` +
    `   | Status      | DRAFT |\n` +
    `\n` +
    `   **Preconditions**\n` +
    `   - [list]\n` +
    `\n` +
    `   **Steps**\n` +
    `   1. [step]\n` +
    `   2. [step]\n` +
    `\n` +
    `   **Expected Result**\n` +
    `   [expected outcome]\n` +
    `\n` +
    `   **Evidence**\n` +
    `   - [ ] Screenshot: \`evidence/${tcPrefix}-01-[descriptor].png\`\n` +
    `\n` +
    `   > [VERIFY] Confirm R-ID mapping and expected result before execution.\n` +
    `\n` +
    `3. After all TCs, add a ## Summary section:\n` +
    `   - Total TCs: N\n` +
    `   - P0: N | P1: N | P2: N\n` +
    `   - Standards covered: [list]\n` +
    `\n` +
    `CRITICAL RULES:\n` +
    `- Do NOT add TCs not present in the scenarios document.\n` +
    `- Do NOT remove [VERIFY] markers.\n` +
    `- Do NOT invent R-IDs. Use [] and [VERIFY] if mapping is uncertain.\n` +
    `- Preserve Given/When/Then logic but restructure to Steps format.\n` +
    `- Number TCs sequentially: ${tcPrefix}-01, ${tcPrefix}-02, ...\n` +
    `- Output only the YAML frontmatter + TC blocks + Summary. No introductory prose.`;

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
function handleApiError(err, json, slug) {
  const status = err.status ?? err.statusCode;

  if (status === 401) {
    printError(json, slug,
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
    printError(json, slug,
      `Rate limit exceeded (429 Too Many Requests).\n\n` +
      `  Retry after: ${retryAfter}s\n\n` +
      '  Options:\n' +
      '    - Wait and re-run: testnux plan ' + slug + '\n' +
      '    - Use --max-tokens to reduce response size\n' +
      '    - Spread requests across multiple sessions',
    );
    const e = new Error('API 429 Rate Limit');
    e.exitCode = 2;
    throw e;
  }

  if (status >= 500) {
    printError(json, slug,
      `Anthropic API server error (${status}).\n\n` +
      '  This is a transient error. Retry in a few minutes.\n' +
      '  Status page: https://status.anthropic.com/',
    );
    const e = new Error(`API ${status} Server Error`);
    e.exitCode = 2;
    throw e;
  }

  if (err.name === 'AbortError' || err.message?.includes('abort')) {
    printError(json, slug,
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
  printError(json, slug, `Anthropic API error: ${err.message ?? String(err)}`);
  const e = new Error(`API error: ${err.message}`);
  e.exitCode = 2;
  throw e;
}

// ── [VERIFY] Marker Enforcement ──────────────────────────────────────────────

/**
 * Ensures every TC block in the plan response ends with a [VERIFY] blockquote.
 * Also validates that the response looks like valid test-plan.md content:
 *   - Has YAML frontmatter (--- ... ---)
 *   - Has at least one TC heading (## <TC_PREFIX>-NN)
 *
 * @param {string} text      raw LLM response text
 * @param {string} tcPrefix  e.g. "LOGIN"
 * @returns {string}         text with [VERIFY] markers guaranteed on all TCs
 */
function ensureVerifyMarkers(text, tcPrefix) {
  if (!text || text.trim().length === 0) {
    throw new Error('LLM returned an empty response');
  }

  // Must have YAML frontmatter
  if (!/^---\s*\n[\s\S]*?\n---/m.test(text)) {
    throw new Error(
      'Response does not contain YAML frontmatter (expected --- ... --- block). ' +
      'The LLM may have returned unexpected content.',
    );
  }

  // Must have at least one TC heading for the given prefix
  // Accept both PREFIX-NN and the generic TC- pattern as fallback
  const tcHeadingRe  = new RegExp(`^##\\s+${tcPrefix}-\\d+`, 'm');
  const genericTcRe  = /^##\s+TC-\d+/m;
  if (!tcHeadingRe.test(text) && !genericTcRe.test(text)) {
    throw new Error(
      `Response does not contain any ${tcPrefix}-NN or TC-NN headings. ` +
      'The LLM may have returned unexpected content.',
    );
  }

  // Split on TC headings to process each block; match both PREFIX-NN and TC-NN
  const VERIFY_RE   = /\[VERIFY\]/i;
  const splitRe     = new RegExp(`(?=^##\\s+(?:${tcPrefix}|TC)-\\d+)`, 'm');

  const blocks = text.split(splitRe);
  const ensured = blocks.map((block) => {
    // Only process blocks that start with a TC heading
    if (!block.match(/^##\s+[A-Z]+-\d+/)) return block;

    if (VERIFY_RE.test(block)) return block;

    // Append [VERIFY] blockquote
    return block.trimEnd() + '\n\n> [VERIFY] Confirm R-ID mapping and expected result before execution.\n';
  });

  return ensured.join('');
}

// ── TC Counter ───────────────────────────────────────────────────────────────

/**
 * Counts TC headings in the content.
 * Matches both PREFIX-NN and generic TC-NN patterns.
 * @param {string} content
 * @param {string} tcPrefix
 * @returns {number}
 */
function countTCs(content, tcPrefix) {
  const prefixRe  = new RegExp(`^##\\s+${tcPrefix}-\\d+`, 'gm');
  const genericRe = /^##\s+TC-\d+/gm;
  const byPrefix  = content.match(prefixRe);
  const byGeneric = content.match(genericRe);
  // Prefer prefix matches; fall back to generic if prefix yields nothing
  return byPrefix ? byPrefix.length : (byGeneric ? byGeneric.length : 0);
}

// ── Scenarios File Finder ────────────────────────────────────────────────────

/**
 * Searches for a scenarios.md file for the given slug.
 * Checks well-known paths and scans the testing-log output directory.
 *
 * @param {string} slug
 * @param {string} outDir
 * @returns {string | null}
 */
function findScenariosFile(slug, outDir) {
  const candidates = [
    path.resolve(`./${slug}-scenarios.md`),
    path.resolve(`./scenarios/${slug}.md`),
  ];

  // Also scan testing-log/ for date-prefixed folders
  const testingLog = path.resolve(outDir);
  if (fs.existsSync(testingLog)) {
    let entries;
    try {
      entries = fs.readdirSync(testingLog);
    } catch {
      entries = [];
    }
    // Sort descending so the most recent date-prefixed folder wins first
    for (const entry of entries.sort().reverse()) {
      if (entry.includes(slug)) {
        const f = path.join(testingLog, entry, 'scenarios.md');
        candidates.push(f);
      }
    }
  }

  return candidates.find((f) => fs.existsSync(f)) ?? null;
}

// ── Utility Helpers ──────────────────────────────────────────────────────────

/**
 * Returns the local date as YYYY-MM-DD (for output folder naming).
 * @returns {string}
 */
function localDateString() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Prints an error message in either JSON or human-readable format.
 * @param {boolean} json
 * @param {string}  slug
 * @param {string}  message
 */
function printError(json, slug, message) {
  if (json) {
    process.stderr.write(JSON.stringify({ event: 'plan.error', slug, message }) + '\n');
  } else {
    console.error('');
    console.error('  ERROR: ' + message.split('\n').join('\n  '));
    console.error('');
  }
}

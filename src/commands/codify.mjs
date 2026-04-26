// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/codify.mjs
 *
 * Implements `testnux codify <slug>`.
 *
 * v0.2 ALPHA — wired to Claude API (claude-sonnet-4-6 by default).
 *
 * Reads a test-plan.md from the most recent testing-log/<date>_<slug>/ folder,
 * sends it to the Anthropic Messages API along with the spec.ts template,
 * and writes a working Playwright TypeScript spec.ts — every generated test()
 * block tagged [VERIFY].
 *
 * Usage:
 *   testnux codify <slug> [--folder <path>] [--model <model>]
 *                         [--max-tokens <n>] [--dry-run] [--safe]
 *                         [--base-url <url>] [--max-spend <usd>]
 *
 * Requires:
 *   CLAUDE_API_KEY environment variable (Anthropic API key).
 *   @anthropic-ai/sdk — optional peer dep: npm install @anthropic-ai/sdk
 *   gray-matter       — already a dep; parses test-plan.md YAML frontmatter.
 *
 * Cost estimate: ~$0.20–$0.60 per page depending on test plan size.
 * See docs/costs.md for the full per-stage cost table.
 *
 * Exit codes:
 *   0  success (spec.ts written, or dry-run printed)
 *   1  configuration error (missing API key, missing SDK, missing test-plan.md)
 *   2  API error (401, 429, 5xx)
 *   3  LLM response parse error (raw response saved to spec.raw.txt)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL      = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 10_000;
const API_TIMEOUT_MS     = 60_000;

/**
 * Pricing as of April 2026 — models supported by codify.
 * Source: https://docs.anthropic.com/en/docs/models-overview
 * Units: USD per 1M tokens.
 */
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  output:  4.00 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00 },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} slug  Surface slug (e.g. "login", "dashboard")
 * @param {{
 *   folder?:    string,
 *   json?:      boolean,
 *   dryRun?:    boolean,
 *   maxSpend?:  number | null,
 *   model?:     string,
 *   maxTokens?: number,
 *   baseUrl?:   string,
 *   safe?:      boolean,
 * }} opts
 */
export async function runCodify(slug, opts = {}) {
  const {
    folder    = null,
    json      = false,
    dryRun    = false,
    maxSpend  = null,
    model     = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    baseUrl   = 'http://localhost:3000',
    safe      = false,
  } = opts;

  // ── Step 1: Locate testing-log folder ────────────────────────────────────

  const testingLogDir = path.resolve('./testing-log');
  let resolvedFolder;

  if (folder) {
    resolvedFolder = path.resolve(folder);
  } else {
    resolvedFolder = findLatestSlugFolder(testingLogDir, slug);
  }

  if (!resolvedFolder || !fs.existsSync(resolvedFolder)) {
    printError(json,
      `No testing-log folder found for slug "${slug}".\n\n` +
      '  Searched: ' + testingLogDir + '\n\n' +
      '  Suggested workflow:\n' +
      `    1. testnux discover <url>    # generate scenarios\n` +
      `    2. testnux plan ${slug}      # generate test-plan.md\n` +
      `    3. testnux codify ${slug}    # generate spec.ts (this command)\n\n` +
      '  Or specify the folder directly with --folder <path>.',
    );
    const err = new Error(`No folder found for slug: ${slug}`);
    err.exitCode = 1;
    throw err;
  }

  // ── Step 2: Read and parse test-plan.md ──────────────────────────────────

  const testPlanPath = path.join(resolvedFolder, 'test-plan.md');
  if (!fs.existsSync(testPlanPath)) {
    printError(json,
      `test-plan.md not found at: ${testPlanPath}\n\n` +
      '  Generate it first:\n\n' +
      `    testnux plan ${slug}\n\n` +
      '  Or check that --folder points to the correct testing-log subfolder.',
    );
    const err = new Error('test-plan.md not found');
    err.exitCode = 1;
    throw err;
  }

  const testPlanRaw = fs.readFileSync(testPlanPath, 'utf-8');
  let frontmatter;
  let testPlanBody;
  try {
    ({ frontmatter, body: testPlanBody } = await parseTestPlanAsync(testPlanRaw));
  } catch (parseErr) {
    printError(json,
      `Failed to parse test-plan.md frontmatter:\n\n  ${parseErr.message}\n\n` +
      '  Check that the frontmatter block uses valid YAML (indentation, quoting).',
    );
    const err = new Error('test-plan.md parse error');
    err.exitCode = 1;
    throw err;
  }

  const tcPrefix = frontmatter.tc_prefix ?? slug.toUpperCase();
  const tcList   = extractTcList(testPlanBody, tcPrefix);

  // ── Step 3: Read spec.ts template ────────────────────────────────────────

  const templatePath = resolveTemplatePath();
  if (!fs.existsSync(templatePath)) {
    printError(json,
      `spec.ts template not found at: ${templatePath}\n\n` +
      '  Make sure you are running testnux from the project root and\n' +
      '  the templates/ directory is intact.',
    );
    const err = new Error('spec.ts template not found');
    err.exitCode = 1;
    throw err;
  }
  const specTemplate = fs.readFileSync(templatePath, 'utf-8');

  // ── Step 4: Check CLAUDE_API_KEY ─────────────────────────────────────────

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

  // ── Step 5: Dynamically import @anthropic-ai/sdk ─────────────────────────

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
          `  Then re-run: testnux codify ${slug}`,
        );
        const err = new Error('@anthropic-ai/sdk not installed');
        err.exitCode = 1;
        throw err;
      }
      throw importErr;
    }
  }

  // ── Step 6: Print header ──────────────────────────────────────────────────

  if (!json) {
    console.log('');
    console.log('  testnux codify — v0.2 ALPHA');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  Slug      : ${slug}`);
    console.log(`  Folder    : ${resolvedFolder}`);
    console.log(`  TC prefix : ${tcPrefix}`);
    console.log(`  TCs found : ${tcList.length}`);
    console.log(`  Base URL  : ${baseUrl}`);
    console.log(`  Model     : ${model}`);
    if (safe) console.log('  Mode      : --safe (write spec.generated.ts, not spec.ts)');
    if (dryRun) console.log('  Mode      : --dry-run (no API call will be made)');
    console.log('');
  }

  // ── Step 7: Build prompts ─────────────────────────────────────────────────

  if (!json) console.log('  [1/4] Building prompt...');

  const { systemPrompt, userPrompt } = buildPrompt({
    slug,
    tcPrefix,
    tcList,
    baseUrl,
    testPlanRaw,
    specTemplate,
  });

  // Cost estimate (pre-call)
  const inputTokenEstimate  = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  const outputTokenEstimate = maxTokens;
  const pricing             = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  const costEstimate        =
    (inputTokenEstimate  / 1_000_000) * pricing.input +
    (outputTokenEstimate / 1_000_000) * pricing.output;

  if (!json) {
    console.log(`  [1/4] Prompt built`);
    console.log(`        Est. input tokens : ~${inputTokenEstimate.toLocaleString()}`);
    console.log(`        Max output tokens : ${outputTokenEstimate.toLocaleString()}`);
    console.log(`        Est. cost (upper) : ~$${costEstimate.toFixed(4)}`);
    console.log('');
  }

  // ── Dry-run: print prompts + cost and exit ────────────────────────────────

  if (dryRun) {
    if (json) {
      process.stdout.write(JSON.stringify({
        event:              'codify.dry-run',
        slug,
        folder:             resolvedFolder,
        tcPrefix,
        tcCount:            tcList.length,
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

  // ── Step 7b: Enforce --max-spend BEFORE API call ──────────────────────────

  if (maxSpend !== null) {
    if (costEstimate > maxSpend) {
      const msg =
        `Estimated cost ($${costEstimate.toFixed(4)}) exceeds --max-spend ($${maxSpend.toFixed(4)}). ` +
        `Aborting before API call. Re-run with higher --max-spend or --dry-run to inspect.`;
      printError(json, msg);
      const err = new Error('Cost estimate exceeds --max-spend');
      err.exitCode = 1;
      throw err;
    } else {
      if (!json) {
        console.log(`  ✓ Estimated cost ($${costEstimate.toFixed(4)}) within --max-spend ($${maxSpend.toFixed(4)}). Proceeding.`);
        console.log('');
      }
    }
  }

  // ── Step 8: Call Claude API ───────────────────────────────────────────────

  if (!json) console.log('  [2/4] Calling Claude API...');

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

  if (!json) console.log('  [2/4] Response received — validating...');

  // ── Step 9: Validate response ─────────────────────────────────────────────

  let specContent;
  try {
    specContent = validateAndCleanSpec(responseText, tcList.length);
  } catch (parseErr) {
    // Save raw response for debugging
    const rawPath = path.join(resolvedFolder, 'spec.raw.txt');
    fs.writeFileSync(rawPath, responseText, 'utf-8');

    printError(json,
      `LLM response could not be validated as a Playwright spec:\n\n  ${parseErr.message}\n\n` +
      `  Raw response saved to: ${rawPath}\n` +
      '  Review the raw file and re-run, or file a bug at:\n' +
      '  https://github.com/StillNotBald/testnux/issues',
    );
    const err = new Error('LLM response parse error');
    err.exitCode = 3;
    throw err;
  }

  // ── Step 10: Inject [VERIFY] markers on any test() missing them ───────────

  if (!json) console.log('  [3/4] Injecting [VERIFY] markers...');

  specContent = ensureVerifyMarkers(specContent);

  // ── Step 11: Determine output path + hand-edit detection ─────────────────

  if (!json) console.log('  [4/4] Writing spec file...');

  const specTsPath          = path.join(resolvedFolder, 'spec.ts');
  const specGeneratedTsPath = path.join(resolvedFolder, 'spec.generated.ts');
  let outPath               = specTsPath;
  let warnHandEdited        = false;

  if (fs.existsSync(specTsPath)) {
    const existing = fs.readFileSync(specTsPath, 'utf-8');
    // Heuristic: if spec.ts exists and has NO [VERIFY] markers anywhere,
    // it was written by a human (hand-edited after generation scrubbed markers).
    const isHandEdited = !/\[VERIFY\]/i.test(existing);
    if (isHandEdited || safe) {
      outPath        = specGeneratedTsPath;
      warnHandEdited = isHandEdited;
    }
  }

  // Atomic write: temp → rename
  const tmpPath = outPath + '.tmp';
  fs.writeFileSync(tmpPath, specContent, 'utf-8');
  fs.renameSync(tmpPath, outPath);

  // ── Step 12: Summary ──────────────────────────────────────────────────────

  const testCount    = countTests(specContent);
  const actualInput  = usage?.input_tokens  ?? inputTokenEstimate;
  const actualOutput = usage?.output_tokens ?? 0;
  const actualCost   =
    (actualInput  / 1_000_000) * pricing.input +
    (actualOutput / 1_000_000) * pricing.output;

  if (json) {
    process.stdout.write(JSON.stringify({
      event:       'codify.done',
      slug,
      folder:      resolvedFolder,
      outFile:     outPath,
      tcCount:     tcList.length,
      testCount,
      tokensIn:    actualInput,
      tokensOut:   actualOutput,
      costUsd:     actualCost,
      handEdited:  warnHandEdited,
    }) + '\n');
  } else {
    console.log('');
    console.log('  ── codify complete ─────────────────────────────────────────');
    console.log(`  Output file  : ${outPath}`);
    console.log(`  test() count : ${testCount}`);
    console.log(`  TC IDs codified: ${tcList.join(', ') || '(none parsed)'}`);
    console.log(`  Tokens in    : ${actualInput.toLocaleString()}`);
    console.log(`  Tokens out   : ${actualOutput.toLocaleString()}`);
    console.log(`  Actual cost  : ~$${actualCost.toFixed(4)}`);
    if (warnHandEdited) {
      console.log('');
      console.log('  WARNING: spec.ts already exists with no [VERIFY] markers —');
      console.log('  detected as hand-edited. Wrote to spec.generated.ts instead.');
      console.log('  Review both files and merge if needed.');
    } else if (safe) {
      console.log('');
      console.log('  --safe: wrote to spec.generated.ts (not spec.ts).');
    }
    console.log('');
    console.log('  Next steps:');
    console.log(`    1. Review ${outPath}`);
    console.log(`       — remove [VERIFY] as you confirm each selector and assertion`);
    console.log(`    2. Seed your test users: node scripts/seed-test-users.mjs`);
    console.log(`    3. Run: npx playwright test ${path.relative(process.cwd(), outPath)}`);
    console.log(`    4. Then: testnux report ${slug}`);
    console.log('');
  }
}

// ── Folder Location ───────────────────────────────────────────────────────────

/**
 * Finds the most recent (alphabetically latest = date-prefixed) subfolder of
 * testingLogDir whose name contains slug (case-insensitive).
 *
 * @param {string} testingLogDir  e.g. ./testing-log
 * @param {string} slug
 * @returns {string | null}
 */
function findLatestSlugFolder(testingLogDir, slug) {
  if (!fs.existsSync(testingLogDir)) return null;

  const slugLower = slug.toLowerCase();
  const entries = fs.readdirSync(testingLogDir)
    .filter((e) => {
      if (!e.toLowerCase().includes(slugLower)) return false;
      const full = path.join(testingLogDir, e);
      return fs.statSync(full).isDirectory();
    })
    .sort() // lexicographic — date-prefix makes latest = last
    .reverse();

  if (entries.length === 0) return null;
  return path.join(testingLogDir, entries[0]);
}

// ── Test Plan Parser ──────────────────────────────────────────────────────────

/**
 * Module-level gray-matter cache.
 * gray-matter is a CJS module; we load it once via createRequire and cache it.
 */
let _matter = null;

async function loadMatter() {
  if (_matter) return _matter;
  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    _matter = req('gray-matter');
  } catch {
    _matter = null;
  }
  return _matter;
}

/**
 * Parses the YAML frontmatter from a test-plan.md file using gray-matter.
 * Falls back to empty frontmatter if gray-matter is unavailable (shouldn't happen).
 *
 * @param {string} raw
 * @returns {Promise<{ frontmatter: Record<string, unknown>, body: string }>}
 */
async function parseTestPlanAsync(raw) {
  const matter = await loadMatter();
  if (!matter) return { frontmatter: {}, body: raw };
  try {
    const parsed = matter(raw);
    return { frontmatter: parsed.data ?? {}, body: parsed.content ?? raw };
  } catch {
    return { frontmatter: {}, body: raw };
  }
}

/**
 * Extracts TC IDs from the test plan body.
 * Looks for lines matching "## <TC_PREFIX>-NN" headings.
 *
 * @param {string} body
 * @param {string} tcPrefix
 * @returns {string[]}  e.g. ['LOGIN-01', 'LOGIN-02', ...]
 */
function extractTcList(body, tcPrefix) {
  const re = new RegExp(`^#{1,3}\\s+(${escapeRegex(tcPrefix)}-\\d+)`, 'gim');
  const ids = new Set();
  let m;
  while ((m = re.exec(body)) !== null) {
    ids.add(m[1].toUpperCase());
  }

  // Also check the TC matrix table (| TC-ID | Title | ...)
  const tableRe = new RegExp(`\\|\\s*(${escapeRegex(tcPrefix)}-\\d+)\\s*\\|`, 'gi');
  while ((m = tableRe.exec(body)) !== null) {
    ids.add(m[1].toUpperCase());
  }

  return [...ids].sort();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Template Resolution ───────────────────────────────────────────────────────

/**
 * Resolves the path to templates/spec.ts.
 * Searches relative to this file's location, then relative to cwd.
 *
 * @returns {string}
 */
function resolveTemplatePath() {
  // Primary: <repo-root>/templates/spec.ts
  // This file lives at src/commands/codify.mjs, so go up two levels.
  // fileURLToPath correctly decodes %20 and other URL-encoded characters
  // in the path — plain pathname manipulation leaves them encoded on Windows.
  const fromFile = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..', '..', 'templates', 'spec.ts',
  );
  if (fs.existsSync(fromFile)) return fromFile;

  // Fallback: from cwd (for non-standard install layouts)
  const fromCwd = path.resolve('./templates/spec.ts');
  return fromCwd;
}

// ── Prompt Builder ────────────────────────────────────────────────────────────

/**
 * Builds system + user prompts for the LLM codify call.
 *
 * @param {{
 *   slug:         string,
 *   tcPrefix:     string,
 *   tcList:       string[],
 *   baseUrl:      string,
 *   testPlanRaw:  string,
 *   specTemplate: string,
 * }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildPrompt({ slug, tcPrefix, tcList, baseUrl, testPlanRaw, specTemplate }) {
  const systemPrompt = `You are a senior Playwright TypeScript engineer specializing in audit-ready test automation for regulated software.

You write test code that is:
  - Deterministic: no waitForTimeout() / arbitrary sleeps; use waitForLoadState(), locator.waitFor(), page.waitForURL() only
  - Resilient: prefer getByRole() and getByLabel() over CSS selectors; fall back to locator() only when required
  - Evidence-collecting: afterEach hook captures a screenshot to evidence/<TC-ID>.png after every test
  - Typed: strict TypeScript, no \`any\` except where Playwright types require it

CRITICAL PATTERNS — PRESERVE EXACTLY FROM THE TEMPLATE:

1. XFF rate-limit isolation: every test.describe() block MUST have a test.beforeEach() that calls xffForTest(testInfo.title) and sets context HTTP headers. This prevents sequential auth tests from sharing a rate-limit bucket and causing 429 poisoning.

2. form.requestSubmit() pattern: NEVER use button.click() to submit forms. ALWAYS use:
     await page.evaluate(() => {
       const form = document.querySelector('form') as HTMLFormElement | null;
       form?.requestSubmit();
     });
   Reason: button.click() fires before React hydration attaches the onSubmit handler, causing a native browser GET instead of the POST the app expects.

3. afterEach evidence capture: include the top-level afterEach hook from the template that matches the TC-ID from testInfo.title and calls captureEvidence(). Tests with custom browser contexts MUST call captureEvidence() before ctx.close().

4. waitForNextTotpWindow: include this helper if ANY test in the plan involves TOTP/MFA. It prevents 429 from hitting the challenge endpoint twice in the same 30-second window.

5. [VERIFY] comment: EVERY generated test() block MUST have at least one line:
     // [VERIFY] Selectors and assertions need human confirmation against the live page
   Place it immediately before the first assertion in each test.

6. Base URL: NEVER hardcode URLs. Use the baseUrl variable (default: '${baseUrl}'). Navigate with page.goto(baseUrl + '/path') or via the gotoPage() helper if present.

7. TC ordering: P0 tests first, P1 next, P2 last. Rate-limit / destructive tests (@rate-limit-test) MUST be at the END of the suite — before the closing }). Annotate them with the // @rate-limit-test comment.

8. Output is pure TypeScript starting with:
     import { test, expect } from '@playwright/test';
   No markdown fences. No prose. No explanation. Just code.`;

  const tcBulletList = tcList.length > 0
    ? tcList.map((id) => `  - ${id}`).join('\n')
    : '  (parse from test plan — include all TC-XX found)';

  const userPrompt = `Surface slug: ${slug}
TC prefix: ${tcPrefix}
Base URL: ${baseUrl}

TC IDs to codify (one test() block per ID, in order):
${tcBulletList}

=== TEST PLAN (test-plan.md) ===
${testPlanRaw}

=== REFERENCE TEMPLATE (spec.ts) ===
${specTemplate}

=== TASK ===

Generate a complete, working Playwright TypeScript spec file for the surface "${slug}".

Requirements:
1. File header (REQUIRED — use exactly this):
   // Copyright (c) 2026 TestNUX Contributors
   // SPDX-License-Identifier: Apache-2.0
   // [VERIFY] Generated by testnux codify v0.2 — review all selectors and assertions

2. Import line (REQUIRED, first import):
   import { test, expect, type Page, type Browser } from '@playwright/test';

3. Copy ALL helper code from the template verbatim:
   - xffForTest() function
   - TOTP helpers (base32Decode, totp, waitForNextTotpWindow) — keep even if no TOTP TCs
   - TcResult interface + RESULTS array + record() function
   - EVIDENCE_DIR constant + captureEvidence() function
   - afterEach evidence hook (top-level, matching TC-ID from testInfo.title)
   - afterAll execution-log hook (writes execution-log-auto.md)
   - gotoPage() helper

4. Replace ALL {{placeholder}} tokens:
   - {{slug}} → ${slug}
   - {{tc_prefix}} → ${tcPrefix}
   - {{folder}} → testing-log (resolved folder name)

5. One test() per TC in the list above. Naming: test('${tcPrefix}-NN — [title from plan]', ...)

6. Inside EACH test():
   a. Guard clause with record() + test.skip() if required fixture (user, config) is missing
   b. Navigate: await gotoPage(page, baseUrl + '/path');  OR  await page.goto(baseUrl + '/path');
   c. One comment per step from the plan: // Step N: [step text from plan]
   d. // [VERIFY] Selectors and assertions need human confirmation against the live page
   e. Assertions using expect()
   f. record() call at the end: record('${tcPrefix}-NN', 'PASS', 'brief note');

7. test.describe() block structure:
   - Wrap all tests in: test.describe('${tcPrefix} — full test suite', () => { ... })
   - Include test.beforeEach() with xffForTest() for rate-limit isolation
   - Rate-limit / destructive tests last, annotated // @rate-limit-test

8. P0 tests (serial) wrapped in: test.describe.configure({ mode: 'serial' })
   OR grouped with a comment if the suite is small.

Output ONLY TypeScript code. No commentary. No markdown. No explanation.
Start the output with the file header comment block.`;

  return { systemPrompt, userPrompt };
}

// ── Claude API Call ───────────────────────────────────────────────────────────

/**
 * Calls the Anthropic Messages API with an AbortController timeout.
 * @returns {Promise<import('@anthropic-ai/sdk').Message>}
 */
async function callClaude({ Anthropic, apiKey, model, maxTokens, systemPrompt, userPrompt }) {
  const client = new Anthropic({ apiKey });

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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

// ── Error Handling ────────────────────────────────────────────────────────────

/**
 * Handles Anthropic API errors with user-friendly messages.
 * Always throws with an appropriate exitCode.
 *
 * @param {Error & { status?: number, statusCode?: number, headers?: Record<string, string> }} err
 * @param {boolean} json
 * @param {string} slug
 */
function handleApiError(err, json, slug) {
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
      `    - Wait and re-run: testnux codify ${slug}\n` +
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

// ── Spec Validation ───────────────────────────────────────────────────────────

/**
 * Validates that the LLM response is a plausible Playwright TypeScript spec.
 * Strips any leading/trailing markdown fences the LLM may have added.
 *
 * @param {string} text  raw LLM response text
 * @param {number} expectedTcCount  number of TCs from the plan (>= 1 if known)
 * @returns {string}  cleaned spec content
 * @throws {Error}  if the response is not a valid spec
 */
function validateAndCleanSpec(text, expectedTcCount) {
  if (!text || text.trim().length === 0) {
    throw new Error('LLM returned an empty response.');
  }

  // Strip markdown fences if the LLM wrapped in ```typescript or ```ts
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:typescript|ts)?\r?\n/, '');
  cleaned = cleaned.replace(/\r?\n```\s*$/, '');
  cleaned = cleaned.trim();

  // Must start with an import or a comment block
  const VALID_START = [
    'import ',
    '// Copyright',
    '// SPDX',
    '// [VERIFY]',
    '/**',
  ];
  const firstLine = cleaned.split('\n')[0] ?? '';
  const hasValidStart = VALID_START.some((prefix) => firstLine.startsWith(prefix));
  if (!hasValidStart) {
    throw new Error(
      `Response does not start with a valid TypeScript file header or import.\n` +
      `  First line: "${firstLine.slice(0, 120)}"`,
    );
  }

  // Must contain the Playwright import
  if (!cleaned.includes("import { test, expect }") && !cleaned.includes("from '@playwright/test'")) {
    throw new Error(
      `Response is missing the required Playwright import:\n` +
      `  import { test, expect } from '@playwright/test';\n\n` +
      `  The LLM may have returned prose instead of TypeScript code.`,
    );
  }

  // Must contain at least one test() call
  if (!/\btest\s*\(/.test(cleaned)) {
    throw new Error(
      `Response contains no test() blocks.\n` +
      `  Expected at least one Playwright test() call.\n` +
      `  The LLM may have returned a skeleton or description instead of code.`,
    );
  }

  // Warn (but don't fail) if test count is much lower than expected
  const testCount = countTests(cleaned);
  if (expectedTcCount > 0 && testCount < Math.max(1, Math.floor(expectedTcCount * 0.5))) {
    // Non-fatal: the LLM may have merged or omitted some TCs. We warn via console.
    process.stderr.write(
      `  WARNING: expected ~${expectedTcCount} test() blocks but found ${testCount}.\n` +
      `  Review spec.ts — some TCs may be missing.\n`,
    );
  }

  return cleaned;
}

// ── [VERIFY] Marker Enforcement ───────────────────────────────────────────────

/**
 * Ensures every test() block in the generated spec contains at least one
 * [VERIFY] comment. Injects the marker comment on the first assertion line
 * (await expect(...)) if missing, or at the start of the test body.
 *
 * Strategy: split on test() openings, process each block independently.
 *
 * @param {string} text  validated spec content
 * @returns {string}  spec with [VERIFY] markers guaranteed in every test()
 */
function ensureVerifyMarkers(text) {
  const VERIFY_RE = /\/\/\s*\[VERIFY\]/i;

  // Split on test() call openings (test('...', async ({ ... }) => {)
  // We preserve the delimiters by using a lookahead split.
  const TEST_OPEN_RE = /(?=^\s*(?:\/\/ @rate-limit-test\n\s*)?test\s*\()/m;
  const segments = text.split(TEST_OPEN_RE);

  const ensured = segments.map((segment) => {
    // Only process segments that begin a test() block
    if (!/^\s*(?:\/\/ @rate-limit-test\n\s*)?test\s*\(/.test(segment)) {
      return segment;
    }

    // Already has a [VERIFY] marker — leave it alone
    if (VERIFY_RE.test(segment)) return segment;

    // Find the first `await expect(` line and insert [VERIFY] before it
    const lines  = segment.split('\n');
    let inserted = false;
    const result = [];

    for (const line of lines) {
      if (!inserted && /^\s*await\s+expect\s*\(/.test(line)) {
        // Derive indentation from the assertion line
        const indent = line.match(/^(\s*)/)[1];
        result.push(`${indent}// [VERIFY] Selectors and assertions need human confirmation against the live page`);
        inserted = true;
      }
      result.push(line);
    }

    if (!inserted) {
      // No `await expect(` found — append the marker at the end of the test block
      // Find the closing brace of this test (first `});` at the right indent)
      const closingIdx = result.findLastIndex((l) => /^\s*\}\s*\)\s*;?\s*$/.test(l));
      if (closingIdx > 0) {
        const indent = result[closingIdx].match(/^(\s*)/)[1];
        result.splice(closingIdx, 0,
          `${indent}  // [VERIFY] Selectors and assertions need human confirmation against the live page`,
        );
      } else {
        result.push('  // [VERIFY] Selectors and assertions need human confirmation against the live page');
      }
    }

    return result.join('\n');
  });

  return ensured.join('');
}

// ── test() Counter ────────────────────────────────────────────────────────────

/**
 * Counts the number of test() calls in the spec content.
 * Matches test('...', ...) and test(`...`, ...) forms.
 *
 * @param {string} content
 * @returns {number}
 */
function countTests(content) {
  // Match `test(` at the start of a (possibly indented) line, not inside comments
  const lines   = content.split('\n');
  let count     = 0;
  let inComment = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith('/*')) inComment = true;
    if (inComment && stripped.includes('*/')) { inComment = false; continue; }
    if (inComment) continue;
    if (stripped.startsWith('//')) continue;
    if (/^\s*test\s*\(/.test(line) || /^\s*test\s*\.\s*skip\s*\(/.test(line)) {
      count++;
    }
  }
  return count;
}

// ── Utility Helpers ───────────────────────────────────────────────────────────

/**
 * Prints an error message in either JSON or human-readable format.
 *
 * @param {boolean} json
 * @param {string} message
 */
function printError(json, message) {
  if (json) {
    process.stderr.write(JSON.stringify({ event: 'codify.error', message }) + '\n');
  } else {
    console.error('');
    console.error('  ERROR: ' + message.split('\n').join('\n  '));
    console.error('');
  }
}


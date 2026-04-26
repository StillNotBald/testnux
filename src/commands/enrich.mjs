// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/enrich.mjs
 *
 * Implements `testnux enrich <slug>`.
 *
 * v0.2 ALPHA — wired to Claude API (claude-sonnet-4-6 by default).
 *
 * Reads the most-recent testing-log/<date>_<slug>/test-plan.md and runs up
 * to THREE sequential APPEND-ONLY enrichment passes, each making one Claude
 * API call:
 *
 *   Pass 1 — design-review
 *     WCAG 2.2 AA gaps: contrast, focus, motion, reflow, semantic tokens,
 *     touch targets, heading hierarchy, form labels.
 *
 *   Pass 2 — qa-structural
 *     ISTQB structural gaps: boundary values, equivalence partitioning,
 *     decision tables, null/zero/negative, race conditions, concurrency.
 *
 *   Pass 3 — graph-context
 *     Cross-surface integration gaps: prerequisites, data flows, role
 *     boundaries, idempotency, audit-trail. Includes other test-plan.md
 *     files in the same testing-log/ folder as context.
 *
 * Marker convention (REPLACE-on-rerun, not append):
 *   <!-- testnux:enrich:design-review begin -->
 *   <!-- testnux:enrich:design-review end -->
 *
 *   <!-- testnux:enrich:qa-structural begin -->
 *   <!-- testnux:enrich:qa-structural end -->
 *
 *   <!-- testnux:enrich:graph-context begin -->
 *   <!-- testnux:enrich:graph-context end -->
 *
 * APPEND-ONLY discipline:
 *   All enriched TCs live INSIDE the per-pass marker blocks only.
 *   Content outside those blocks is NEVER touched.
 *
 * Usage:
 *   testnux enrich <slug> [--folder <path>] [--pass design-review|qa-structural|graph-context|all]
 *                         [--model <model>] [--max-tokens <n>] [--max-spend <usd>]
 *                         [--dry-run] [--json]
 *
 * Requires:
 *   CLAUDE_API_KEY environment variable (Anthropic API key).
 *   @anthropic-ai/sdk — optional peer dep: npm install @anthropic-ai/sdk
 *
 * Exit codes:
 *   0  success (all requested passes done, or dry-run printed)
 *   1  configuration error (missing key, missing SDK, missing file, bad args)
 *   2  API error (401, 429, 5xx, timeout)
 *   3  parse error (LLM response contained no TC headings)
 */

import path from 'path';
import fs   from 'fs';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL      = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 10_000;
const API_TIMEOUT_MS     = 60_000;

const ALL_PASSES = ['design-review', 'qa-structural', 'graph-context'];

/**
 * Pricing as of April 2026 — Anthropic published rates.
 * Units: USD per 1M tokens.
 */
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  output:  4.00 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00 },
};

// ── Per-pass marker helpers ──────────────────────────────────────────────────

/** @param {string} passName */
function beginMarker(passName) {
  return `<!-- testnux:enrich:${passName} begin -->`;
}

/** @param {string} passName */
function endMarker(passName) {
  return `<!-- testnux:enrich:${passName} end -->`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} slug  Surface slug (e.g. "login")
 * @param {{
 *   folder?:    string,        // override testing-log root (default: ./testing-log)
 *   pass?:      string,        // 'all' | 'design-review' | 'qa-structural' | 'graph-context'
 *   json?:      boolean,
 *   dryRun?:    boolean,
 *   maxSpend?:  number | null, // USD ceiling across all passes; null = unlimited
 *   model?:     string,
 *   maxTokens?: number,
 * }} opts
 */
export async function runEnrich(slug, opts = {}) {
  const {
    folder    = './testing-log',
    pass      = 'all',
    json      = false,
    dryRun    = false,
    maxSpend  = null,
    model     = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = opts;

  // ── Header ─────────────────────────────────────────────────────────────────

  if (!json) {
    console.log('');
    console.log('  testnux enrich — v0.2 ALPHA');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  Slug     : ${slug}`);
    console.log(`  Pass     : ${pass}`);
    console.log(`  Model    : ${model}`);
    console.log(`  Folder   : ${path.resolve(folder)}`);
    if (dryRun) console.log('  Mode     : --dry-run (no API calls will be made)');
    if (maxSpend !== null) console.log(`  Max spend: $${maxSpend.toFixed(2)}`);
    console.log('');
  }

  // ── Step 1: Validate --pass argument ────────────────────────────────────────

  const passesToRun = resolvePassList(pass);
  if (!passesToRun) {
    printError(json, slug,
      `Unknown --pass value: "${pass}"\n\n` +
      '  Valid values: design-review | qa-structural | graph-context | all',
    );
    const err = new Error(`Unknown pass: ${pass}`);
    err.exitCode = 1;
    throw err;
  }

  // ── Step 2: Locate test-plan.md ─────────────────────────────────────────────

  const testPlanFile = findTestPlanFile(slug, folder);
  if (!testPlanFile) {
    printError(json, slug,
      `No test-plan.md found for slug "${slug}" under ${path.resolve(folder)}\n\n` +
      '  Expected a folder matching: testing-log/<date>_<slug>/test-plan.md\n\n' +
      '  Create one with:\n' +
      `    testnux init ${slug}`,
    );
    const err = new Error('test-plan.md not found');
    err.exitCode = 1;
    throw err;
  }

  if (!json) console.log(`  Found test-plan  : ${testPlanFile}`);

  // ── Step 3: Check CLAUDE_API_KEY ────────────────────────────────────────────

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey && !dryRun) {
    printError(json, slug,
      'CLAUDE_API_KEY is not set.\n\n' +
      '  Get your API key at: https://console.anthropic.com/\n' +
      '  Then set it:\n\n' +
      '    export CLAUDE_API_KEY=sk-ant-...\n\n' +
      '  Or add it to .env.local:\n\n' +
      '    echo "CLAUDE_API_KEY=sk-ant-..." >> .env.local\n\n' +
      '  Inspect prompts without an API key: testnux enrich ' + slug + ' --dry-run',
    );
    const err = new Error('CLAUDE_API_KEY not set');
    err.exitCode = 1;
    throw err;
  }

  // ── Step 4: Dynamically import @anthropic-ai/sdk ────────────────────────────

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
          '  Then re-run: testnux enrich ' + slug,
        );
        const err = new Error('@anthropic-ai/sdk not installed');
        err.exitCode = 1;
        throw err;
      }
      throw importErr;
    }
  }

  // ── Step 5: Read current test-plan.md ───────────────────────────────────────

  let currentPlan = fs.readFileSync(testPlanFile, 'utf-8');
  if (!json) console.log(`  Plan size        : ${currentPlan.length.toLocaleString()} chars`);

  // ── Step 6: Collect sibling test-plan.md files (for graph-context pass) ─────

  const siblingPlans = collectSiblingPlans(testPlanFile, slug);
  if (!json && passesToRun.includes('graph-context')) {
    if (siblingPlans.length > 0) {
      console.log(`  Sibling plans    : ${siblingPlans.length} found (graph-context pass)`);
    } else {
      console.log('  Sibling plans    : none found (graph-context will note [VERIFY])');
    }
  }

  if (!json) console.log('');

  // ── Step 7: Dry-run path ────────────────────────────────────────────────────

  if (dryRun) {
    return runDryRun({
      slug, passesToRun, model, maxTokens, currentPlan, siblingPlans, json, maxSpend, pricing: PRICING,
    });
  }

  // ── Step 8: Sequential passes ────────────────────────────────────────────────

  const pricing  = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  const summary  = [];
  let   cumulativeCost = 0;
  let   completedPasses = 0;

  for (const passName of passesToRun) {
    const passIdx = passesToRun.indexOf(passName) + 1;
    if (!json) {
      console.log(`  ── Pass ${passIdx}/${passesToRun.length}: ${passName} ─────────────────────────────`);
    }

    // Build prompts (pass 2 sees pass 1 output already written, pass 3 sees both)
    const { systemPrompt, userPrompt } = buildPassPrompt({
      passName, slug, currentPlan, siblingPlans,
    });

    // Cost estimate
    const inputEst  = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    const outputEst = maxTokens;
    const costEst   = (inputEst / 1_000_000) * pricing.input + (outputEst / 1_000_000) * pricing.output;

    if (!json) {
      console.log(`  Est. input tokens  : ~${inputEst.toLocaleString()}`);
      console.log(`  Max output tokens  : ${outputEst.toLocaleString()}`);
      console.log(`  Est. cost (upper)  : ~$${costEst.toFixed(4)}`);
      if (maxSpend !== null) {
        console.log(`  Cumul. so far      : ~$${(cumulativeCost + costEst).toFixed(4)} / $${maxSpend.toFixed(2)}`);
      }
      console.log('');
    }

    // --max-spend guard (cumulative)
    if (maxSpend !== null && (cumulativeCost + costEst) > maxSpend) {
      const msg =
        `Cumulative estimated cost ($${(cumulativeCost + costEst).toFixed(4)}) would exceed ` +
        `--max-spend ($${maxSpend.toFixed(2)}) on pass "${passName}". ` +
        `Completed ${completedPasses}/${passesToRun.length} pass(es). ` +
        'Abort before API call. Re-run with higher --max-spend or use --dry-run.';
      printError(json, slug, msg);
      const err = new Error('Cost estimate exceeds --max-spend');
      err.exitCode = 1;
      throw err;
    }

    // API call
    if (!json) console.log(`  [${passIdx}/${passesToRun.length}] Calling Claude API...`);

    let rawResponse;
    let usage;
    try {
      rawResponse = await callClaude({ Anthropic, apiKey, model, maxTokens, systemPrompt, userPrompt });
      usage = rawResponse.usage;
    } catch (apiErr) {
      handleApiError(apiErr, json, slug, passName);
      // handleApiError always throws
    }

    const responseText = rawResponse.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (!json) console.log(`  [${passIdx}/${passesToRun.length}] Response received — validating...`);

    // Validate response: must contain at least one TC heading
    let enrichedBlock;
    try {
      enrichedBlock = validateAndTagResponse(responseText, passName);
    } catch (parseErr) {
      // Save raw response for debugging
      const rawPath = testPlanFile.replace('test-plan.md', `enrich-${passName}.raw.txt`);
      fs.writeFileSync(rawPath, responseText, 'utf-8');
      printError(json, slug,
        `LLM response for pass "${passName}" contains no TC headings:\n\n` +
        `  ${parseErr.message}\n\n` +
        `  Raw response saved to: ${rawPath}\n` +
        '  Review the raw file and re-run, or file a bug at:\n' +
        '  https://github.com/StillNotBald/testnux/issues',
      );
      const err = new Error('LLM response parse error');
      err.exitCode = 3;
      throw err;
    }

    // Wrap in the per-pass marker block
    const timestamp = new Date().toISOString();
    const markedBlock = wrapInMarkers(passName, enrichedBlock, timestamp);

    // Apply to currentPlan (replace existing block or append)
    currentPlan = applyMarkerBlock(currentPlan, passName, markedBlock);

    // Atomic write: temp → rename
    if (!json) console.log(`  [${passIdx}/${passesToRun.length}] Writing test-plan.md...`);
    const tmpFile = testPlanFile + '.tmp';
    fs.writeFileSync(tmpFile, currentPlan, 'utf-8');
    fs.renameSync(tmpFile, testPlanFile);

    // Tally
    const actualIn   = usage?.input_tokens  ?? inputEst;
    const actualOut  = usage?.output_tokens ?? 0;
    const actualCost = (actualIn / 1_000_000) * pricing.input + (actualOut / 1_000_000) * pricing.output;
    cumulativeCost  += actualCost;
    completedPasses++;

    const tcCount = countTCs(enrichedBlock);
    summary.push({ pass: passName, tcCount, tokensIn: actualIn, tokensOut: actualOut, costUsd: actualCost });

    if (json) {
      process.stdout.write(JSON.stringify({
        event:    'enrich.pass.done',
        slug,
        pass:     passName,
        tcCount,
        tokensIn: actualIn,
        tokensOut: actualOut,
        costUsd:  actualCost,
      }) + '\n');
    } else {
      console.log(`  TCs added          : ${tcCount}`);
      console.log(`  Tokens in          : ${actualIn.toLocaleString()}`);
      console.log(`  Tokens out         : ${actualOut.toLocaleString()}`);
      console.log(`  Actual cost        : ~$${actualCost.toFixed(4)}`);
      console.log('');
    }
  }

  // ── Step 9: Final summary ────────────────────────────────────────────────────

  const totalTCs   = summary.reduce((n, s) => n + s.tcCount, 0);
  const totalIn    = summary.reduce((n, s) => n + s.tokensIn, 0);
  const totalOut   = summary.reduce((n, s) => n + s.tokensOut, 0);

  if (json) {
    process.stdout.write(JSON.stringify({
      event:         'enrich.done',
      slug,
      testPlanFile,
      passesRun:     summary.map((s) => s.pass),
      totalTCs,
      totalTokensIn: totalIn,
      totalTokensOut: totalOut,
      totalCostUsd:  cumulativeCost,
      passes:        summary,
    }) + '\n');
  } else {
    console.log('  ── enrich complete ─────────────────────────────────────────');
    console.log(`  test-plan.md  : ${testPlanFile}`);
    console.log(`  Passes run    : ${summary.map((s) => s.pass).join(', ')}`);
    console.log(`  Total TCs     : ${totalTCs}`);
    console.log(`  Total tokens  : ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out`);
    console.log(`  Total cost    : ~$${cumulativeCost.toFixed(4)}`);
    console.log('');
    console.log('  Next steps:');
    console.log(`    1. Review the [VERIFY]-tagged TCs in ${testPlanFile}`);
    console.log('    2. Remove [VERIFY] from each TC once you confirm it is correct');
    console.log(`    3. Run: testnux validate ${slug}`);
    console.log('');
  }
}

// ── Pass list resolver ───────────────────────────────────────────────────────

/**
 * Converts --pass arg to an ordered list of pass names, or null on bad input.
 * @param {string} pass
 * @returns {string[] | null}
 */
function resolvePassList(pass) {
  const p = (pass ?? 'all').trim().toLowerCase();
  if (p === 'all') return [...ALL_PASSES];
  if (ALL_PASSES.includes(p)) return [p];
  return null;
}

// ── File finders ─────────────────────────────────────────────────────────────

/**
 * Finds the most-recent testing-log folder whose name contains the slug.
 * Returns the path to test-plan.md, or null if not found.
 * @param {string} slug
 * @param {string} testingLogRoot
 * @returns {string | null}
 */
function findTestPlanFile(slug, testingLogRoot) {
  const root = path.resolve(testingLogRoot);
  if (!fs.existsSync(root)) return null;

  const entries = fs.readdirSync(root).sort().reverse(); // newest date prefix first
  for (const entry of entries) {
    if (!entry.toLowerCase().includes(slug.toLowerCase())) continue;
    const candidate = path.join(root, entry, 'test-plan.md');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Finds other test-plan.md files in the same testing-log root, excluding the
 * file for the current slug. Used as context for the graph-context pass.
 *
 * @param {string} thisTestPlanFile  absolute path to the current test-plan.md
 * @param {string} slug
 * @returns {{ slug: string, content: string }[]}
 */
function collectSiblingPlans(thisTestPlanFile, slug) {
  const root = path.dirname(path.dirname(thisTestPlanFile)); // testing-log/
  if (!fs.existsSync(root)) return [];

  const results = [];
  const entries = fs.readdirSync(root).sort();
  for (const entry of entries) {
    if (entry.toLowerCase().includes(slug.toLowerCase())) continue; // skip self
    const candidate = path.join(root, entry, 'test-plan.md');
    if (!fs.existsSync(candidate)) continue;
    try {
      const content = fs.readFileSync(candidate, 'utf-8');
      // Derive a readable sibling slug from the folder name
      const siblingSlug = entry.replace(/^\d{4}-\d{2}-\d{2}_/, '');
      results.push({ slug: siblingSlug, content });
    } catch {
      // ignore unreadable files
    }
  }
  return results;
}

// ── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * Builds the system + user prompts for a single enrichment pass.
 *
 * @param {{
 *   passName:     string,
 *   slug:         string,
 *   currentPlan:  string,
 *   siblingPlans: { slug: string, content: string }[],
 * }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildPassPrompt({ passName, slug, currentPlan, siblingPlans }) {
  switch (passName) {
    case 'design-review':
      return buildDesignReviewPrompt({ slug, currentPlan });
    case 'qa-structural':
      return buildQaStructuralPrompt({ slug, currentPlan });
    case 'graph-context':
      return buildGraphContextPrompt({ slug, currentPlan, siblingPlans });
    default:
      throw new Error(`Unknown pass: ${passName}`);
  }
}

// ── Pass 1: design-review ────────────────────────────────────────────────────

function buildDesignReviewPrompt({ slug, currentPlan }) {
  const systemPrompt = `You are a senior UI/UX auditor and accessibility specialist.
You enforce WCAG 2.2 AA, APCA contrast, and design-token discipline on regulated web applications.
Your job is to review an existing test plan and produce ONLY the MISSING test cases — gaps that the
existing plan has not yet covered for visual correctness, accessibility, and design-token compliance.

NAMING CONVENTION: Prefix all TC headings with TC-${slug.toUpperCase().slice(0, 8)}-DR- (design-review).
Example: ## TC-${slug.toUpperCase().slice(0, 8)}-DR-01 — [Title]

FORMAT: Every TC must follow this exact structure:

## TC-XX-DR-NN — [Short descriptive title]
**Priority**: P0 | P1 | P2
**Category**: ACCESSIBILITY | VISUAL | PERFORMANCE
**Standards**: [e.g. WCAG 2.2 SC 1.4.3, WCAG 2.2 SC 2.4.11]

**Given** [precondition: user role, auth state, viewport, OS setting]
**When** [specific action or state to evaluate]
**Then** [precise observable outcome — pixel counts, ratios, element states]

**Pass criteria**:
- [Measurable criterion 1]
- [Measurable criterion 2]

> [VERIFY] Confirm expected values match the design spec before execution.

OUTPUT RULES:
- Output ONLY the new TC blocks. No preamble, no closing prose, no repeating existing TCs.
- Every TC MUST end with the > [VERIFY] blockquote.
- Do NOT output any TC whose semantic intent duplicates one already present in the existing plan.
- If the existing plan already covers a gap fully, skip it silently.
- No hex color literals in TC assertions — reference design tokens or ratios only.
- Sequential TC numbering starting at 01.`;

  const userPrompt = `Surface slug: ${slug}

Existing test plan (READ-ONLY — do not repeat any of these TCs):
\`\`\`markdown
${currentPlan}
\`\`\`

TASK: Identify MISSING accessibility and visual-quality test cases for this surface.

Review the existing plan for gaps in these categories (in order):

1. COLOR CONTRAST
   - Normal text ≥ 4.5:1 (WCAG 2.2 SC 1.4.3)
   - Large text ≥ 3:1, UI components ≥ 3:1 (WCAG 2.2 SC 1.4.3)
   - Non-text contrast for interactive elements (WCAG 2.2 SC 1.4.11)

2. FOCUS INDICATORS
   - Focus ring visible and ≥ 2 CSS px in all directions (WCAG 2.2 SC 2.4.11)
   - Focus not hidden by sticky headers or modals (WCAG 2.2 SC 2.4.12)
   - Keyboard-only navigation covers every interactive element

3. MOTION & ANIMATION
   - prefers-reduced-motion: all animations/transitions disabled (WCAG 2.2 SC 2.3.3)
   - No auto-playing animation that cannot be paused (WCAG 2.2 SC 2.2.2)

4. TOUCH TARGETS
   - Minimum 24×24 CSS px with no less than 24px spacing (WCAG 2.2 SC 2.5.8)
   - Mobile viewport 375px: no overlapping tap targets

5. REFLOW / RESPONSIVE
   - 320px viewport: no horizontal scrollbar, no content clipped (WCAG 2.2 SC 1.4.10)
   - 200% browser zoom: content reflows without loss

6. HEADING HIERARCHY & SEMANTIC STRUCTURE
   - Single h1, logical h2/h3 nesting (WCAG 2.2 SC 1.3.1)
   - Landmark regions: main, nav, aside, footer present (WCAG 2.2 SC 1.3.6)
   - Skip-navigation link functional (WCAG 2.2 SC 2.4.1)

7. FORM LABELS & ERROR MESSAGES
   - Every input has a programmatically associated label (WCAG 2.2 SC 1.3.1, 4.1.2)
   - Error messages use role="alert" and are descriptive (WCAG 2.2 SC 3.3.1, 3.3.2)
   - Required fields marked aria-required="true" (WCAG 2.2 SC 3.3.2)

8. DESIGN TOKEN COMPLIANCE
   - No hex/rgb/hsl color literals in rendered styles — only token references
   - Spacing uses design-system scale (no arbitrary px values outside token set)
   - Typography uses design-system type scale — no orphan font-size declarations

9. SCREEN READER
   - All images have meaningful alt text or alt="" if decorative (WCAG 2.2 SC 1.1.1)
   - Dynamic content changes announced via aria-live regions
   - Modal dialogs trap focus and have aria-modal="true" (WCAG 2.2 SC 4.1.2)

10. MOBILE VIEWPORT AT 375px
    - Primary CTA visible without scrolling on iPhone SE form factor
    - Text remains readable (≥ 16 CSS px equivalent)
    - No content hidden behind fixed headers

Emit ONLY the new TC blocks. Start immediately with ## TC-XX-DR-01.`;

  return { systemPrompt, userPrompt };
}

// ── Pass 2: qa-structural ────────────────────────────────────────────────────

function buildQaStructuralPrompt({ slug, currentPlan }) {
  const systemPrompt = `You are a senior QA engineer specializing in ISTQB-compliant structural testing.
You apply boundary value analysis, equivalence partitioning, decision tables, and exploratory-testing
heuristics (SFDIPOT, CRUD matrix, error-guessing) to find STRUCTURAL GAPS in test plans.
You ONLY suggest new TCs — you never modify existing ones.

NAMING CONVENTION: Prefix all TC headings with TC-${slug.toUpperCase().slice(0, 8)}-QA- (qa-structural).
Example: ## TC-${slug.toUpperCase().slice(0, 8)}-QA-01 — [Title]

FORMAT: Every TC must follow this exact structure:

## TC-XX-QA-NN — [Short descriptive title]
**Priority**: P0 | P1 | P2
**Category**: FUNCTIONAL | ERROR-HANDLING | SECURITY | PERFORMANCE
**Standards**: [e.g. OWASP ASVS 5.1.3, ISTQB BVA, NIST SP 800-63B 5.1]
**Technique**: [BOUNDARY | EQUIVALENCE | ERROR-GUESSING | DECISION-TABLE | STATE-TRANSITION | CRUD | CONCURRENCY]

**Given** [precondition]
**When** [precise action with exact values or state]
**Then** [observable outcome]

**Pass criteria**:
- [Measurable criterion 1]
- [Measurable criterion 2]

> [VERIFY] Confirm expected values match the product spec before execution.

OUTPUT RULES:
- Output ONLY new TCs. No preamble, no prose, no repeating existing TCs.
- Every TC MUST end with the > [VERIFY] blockquote.
- Include the technique tag — it is required for ISTQB traceability.
- Sequential numbering starting at 01.`;

  const userPrompt = `Surface slug: ${slug}

Existing test plan (READ-ONLY — do not repeat any of these TCs):
\`\`\`markdown
${currentPlan}
\`\`\`

TASK: Identify STRUCTURAL GAPS using ISTQB heuristics.

Work through these 8 categories in order and emit a TC for each genuine gap found:

1. BOUNDARY VALUE ANALYSIS (ISTQB BVA)
   For every numeric, date, or length-bounded input, test:
   - Minimum (min), minimum+1, maximum-1, maximum (max)
   - One below minimum (min-1), one above maximum (max+1)
   - Also: zero, negative-1, MAX_SAFE_INTEGER if applicable

2. EQUIVALENCE PARTITIONING
   - Valid partition representative (happy path)
   - Invalid partition: wrong type (e.g. alpha in numeric field)
   - Invalid partition: out-of-range value
   - Null/undefined/empty string for each optional and required field

3. SPECIAL CHARACTER & INJECTION INPUTS
   - XSS probe: '<script>alert(1)</script>' in free-text fields (P1)
   - SQL injection probe: "' OR 1=1 --" (P1)
   - Path traversal: '../../etc/passwd' (P1, OWASP ASVS 5.1.3)
   - Unicode edge cases: emoji, RTL text, zero-width characters
   - Max-length+1 character input (truncation vs rejection)

4. ERROR CONDITIONS
   - API endpoint returns HTTP 422 (validation rejected server-side)
   - API endpoint returns HTTP 500 (server error — UI must not crash)
   - Network offline / request timeout during submit
   - Partial response / empty response body from API

5. CONCURRENCY & RACE CONDITIONS
   - Double-click submit: only one request should fire
   - Simultaneous tab open + submit from both: idempotency
   - Session expires mid-form-fill (submit while auth cookie expired)
   - Browser back after submit: does it re-submit?

6. STATE TRANSITIONS (if the surface has multi-step or stateful flow)
   - Skip a step: navigate directly to step N without completing step N-1
   - Revisit a completed step and change a value — downstream state consistency
   - Abandon mid-flow and resume in a new tab — state restored vs fresh

7. CRUD MATRIX (for any data entity the surface creates/reads/updates/deletes)
   - Create: valid + duplicate + missing required field
   - Read: correct data shown, correct scoping (own data only)
   - Update: optimistic update rollback on server rejection
   - Delete: confirmation prompt, undo window if applicable

8. PERMISSION MATRIX
   - Each action × each defined role (admin / standard user / read-only / anonymous)
   - Accessing the page/action as a role that should be denied → 403 / redirect
   - Privilege escalation via URL manipulation or API direct-call

Do not generate TCs for categories that are already thoroughly covered by the existing plan.
Emit ONLY the new TC blocks. Start immediately with ## TC-XX-QA-01.`;

  return { systemPrompt, userPrompt };
}

// ── Pass 3: graph-context ────────────────────────────────────────────────────

function buildGraphContextPrompt({ slug, currentPlan, siblingPlans }) {
  const hasSiblings = siblingPlans.length > 0;

  const siblingContext = hasSiblings
    ? siblingPlans.map((s) =>
        `### Adjacent surface: ${s.slug}\n\`\`\`markdown\n${s.content.slice(0, 6000)}\n\`\`\``,
      ).join('\n\n')
    : '_(No adjacent test plans were found in the testing-log/ folder.)_';

  const systemPrompt = `You are a QA architect reviewing cross-surface integration dependencies in a web application.
You identify test cases on THIS surface that depend on other surfaces working correctly, and vice versa.
You surface integration-level TCs that are invisible when reviewing a single surface in isolation.

NAMING CONVENTION: Prefix all TC headings with TC-${slug.toUpperCase().slice(0, 8)}-GC- (graph-context).
Example: ## TC-${slug.toUpperCase().slice(0, 8)}-GC-01 — [Title]

FORMAT: Every TC must follow this exact structure:

## TC-XX-GC-NN — [Short descriptive title]
**Priority**: P0 | P1 | P2
**Category**: INTEGRATION | SECURITY | FUNCTIONAL | ERROR-HANDLING
**Surfaces involved**: [this-slug] → [other-slug] (or ← / ↔ for bidirectional)
**Data flow**: [describe what data crosses the surface boundary]

**Given** [precondition — often requires setup on ANOTHER surface]
**When** [action on THIS surface]
**Then** [observable outcome — may span both surfaces]

**Pass criteria**:
- [Measurable criterion 1, may reference data state on another surface]
- [Measurable criterion 2]

> [VERIFY] Confirm cross-surface data flows match the application architecture before execution.

OUTPUT RULES:
- Output ONLY new TCs. No preamble, no prose, no repeating existing TCs.
- Every TC MUST end with the > [VERIFY] blockquote.
- If no adjacent plans are available, still emit TCs for LIKELY integration points based on common
  web application patterns — but mark each with > [VERIFY] No adjacent plan available; inferred from surface name.
- Sequential numbering starting at 01.`;

  const userPrompt = `Surface slug: ${slug}

Existing test plan for "${slug}" (READ-ONLY):
\`\`\`markdown
${currentPlan}
\`\`\`

Adjacent surfaces in testing-log/:
${siblingContext}

TASK: Identify MISSING cross-surface integration test cases.

Work through these categories in order:

1. PREREQUISITES (upstream dependencies)
   - What other surfaces MUST work before a user can reach "${slug}"?
   - Example: if "${slug}" is a settings page, does it require the user to be logged in via an auth surface?
   - TC: auth surface login → navigate to "${slug}" → confirm access granted
   - TC: auth surface session expiry → navigate to "${slug}" → confirm redirect to login

2. DATA FLOWS (what this surface produces / consumes)
   - What data does "${slug}" CREATE that other surfaces will READ?
   - What data does "${slug}" READ that other surfaces have CREATED?
   - TC: create data on surface A → verify it appears correctly on "${slug}"
   - TC: create data on "${slug}" → verify it appears correctly on surface B

3. ROLE BOUNDARIES (authorization across surface pairs)
   - Admin creates X on surface A → standard user on "${slug}" sees only what they should
   - User escalates role → does "${slug}" re-check permissions or cache stale role?

4. IDEMPOTENCY & AUDIT TRAIL
   - Can the same operation be submitted twice (e.g. via browser back or network retry)?
   - Does "${slug}" generate an audit-log entry that is verifiable on an admin/audit surface?
   - TC: submit on "${slug}" → verify audit trail entry on admin surface (if applicable)

5. SHARED STATE (session, cache, notifications)
   - If one tab modifies shared state, does another tab showing "${slug}" reflect it?
   - Does signing out on another tab immediately deny access on "${slug}"?
   - Push notification / real-time update on "${slug}" when another surface triggers an event

6. ROLLBACK & CONSISTENCY
   - If "${slug}" fails mid-flow, is upstream state (created on another surface) left orphaned?
   - TC: simulate failure on "${slug}" → verify no partial state is committed to shared storage

${!hasSiblings ? '\nNOTE: No adjacent test-plan.md files were found. Emit integration TCs based on common patterns for a surface named "' + slug + '" and tag each with [VERIFY] (inferred, not confirmed).' : ''}

Emit ONLY the new TC blocks. Start immediately with ## TC-XX-GC-01.`;

  return { systemPrompt, userPrompt };
}

// ── Claude API Call ──────────────────────────────────────────────────────────

/**
 * Calls the Anthropic Messages API with an AbortController timeout.
 * @returns {Promise<import('@anthropic-ai/sdk').Message>}
 */
async function callClaude({ Anthropic, apiKey, model, maxTokens, systemPrompt, userPrompt }) {
  const client     = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Response Validation & Tagging ────────────────────────────────────────────

/**
 * Validates that the LLM response contains at least one TC heading, then
 * ensures every TC block ends with a [VERIFY] blockquote.
 *
 * @param {string} text      raw LLM response
 * @param {string} passName  used only for error messages
 * @returns {string}         validated + [VERIFY]-tagged markdown
 * @throws {Error}           if no TC headings found
 */
function validateAndTagResponse(text, passName) {
  if (!text || text.trim().length === 0) {
    throw new Error(`LLM returned an empty response for pass "${passName}".`);
  }

  // Accept any TC-XX heading (## TC-... or ### TC-...)
  if (!/^#{2,3}\s+TC-/m.test(text)) {
    throw new Error(
      `Response for pass "${passName}" contains no TC-XX headings. ` +
      'The LLM may have returned explanatory prose instead of test cases.',
    );
  }

  // Split on TC headings and ensure each block ends with [VERIFY]
  const VERIFY_RE = /\[VERIFY\]/i;
  const blocks    = text.split(/(?=^#{2,3}\s+TC-)/m);

  const ensured = blocks.map((block) => {
    if (!block.match(/^#{2,3}\s+TC-/)) return block; // preamble/prose — keep as-is
    if (VERIFY_RE.test(block)) return block;          // already has [VERIFY]
    return block.trimEnd() + '\n\n> [VERIFY] Confirm behavior matches product specification before execution.\n';
  });

  return ensured.join('');
}

// ── Marker Block Application ─────────────────────────────────────────────────

/**
 * Wraps enriched TC content in the per-pass marker block, including a
 * generated-at comment and the [VERIFY] notice.
 *
 * @param {string} passName
 * @param {string} content      validated+tagged TC markdown
 * @param {string} timestamp    ISO timestamp
 * @returns {string}
 */
function wrapInMarkers(passName, content, timestamp) {
  return [
    beginMarker(passName),
    `<!-- Generated: ${timestamp} by testnux enrich pass=${passName} -->`,
    '<!-- All cells in this block carry [VERIFY] markers; review before treating as canonical -->',
    '',
    content.trim(),
    '',
    endMarker(passName),
  ].join('\n');
}

/**
 * Applies the marker block to the test plan content.
 * - If an existing block for this pass is present → replace it entirely.
 * - Otherwise → append at end of file.
 *
 * Content OUTSIDE the marker block is NEVER modified.
 *
 * @param {string} planContent   current test-plan.md content
 * @param {string} passName
 * @param {string} markedBlock   the new complete marker block (begin…end)
 * @returns {string}             updated plan content
 */
function applyMarkerBlock(planContent, passName, markedBlock) {
  const begin = beginMarker(passName);
  const end   = endMarker(passName);

  const beginIdx = planContent.indexOf(begin);
  const endIdx   = planContent.indexOf(end);

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // Replace existing block (include trailing newline after end marker if present)
    const afterEnd = planContent[endIdx + end.length] === '\n'
      ? endIdx + end.length + 1
      : endIdx + end.length;
    return planContent.slice(0, beginIdx) + markedBlock + '\n' + planContent.slice(afterEnd);
  }

  // Append at end, ensuring single trailing newline before block
  const trimmed = planContent.trimEnd();
  return trimmed + '\n\n' + markedBlock + '\n';
}

// ── Dry-run ──────────────────────────────────────────────────────────────────

/**
 * Prints all pass prompts to stdout (or JSON) and exits without making API calls.
 */
function runDryRun({ slug, passesToRun, model, maxTokens, currentPlan, siblingPlans, json, maxSpend, pricing: pricingTable }) {
  const pricing = pricingTable[model] ?? pricingTable[DEFAULT_MODEL];
  let cumulativeEstimate = 0;

  for (const passName of passesToRun) {
    const { systemPrompt, userPrompt } = buildPassPrompt({ passName, slug, currentPlan, siblingPlans });
    const inputEst  = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    const outputEst = maxTokens;
    const costEst   = (inputEst / 1_000_000) * pricing.input + (outputEst / 1_000_000) * pricing.output;
    cumulativeEstimate += costEst;

    if (json) {
      process.stdout.write(JSON.stringify({
        event:              'enrich.dry-run',
        slug,
        pass:               passName,
        model,
        inputTokenEstimate:  inputEst,
        outputTokenEstimate: outputEst,
        costEstimateUsd:     costEst,
        systemPrompt,
        userPrompt,
      }) + '\n');
    } else {
      console.log(`  ── Pass: ${passName} ────────────────────────────────────────`);
      console.log(`  Est. input tokens  : ~${inputEst.toLocaleString()}`);
      console.log(`  Max output tokens  : ${outputEst.toLocaleString()}`);
      console.log(`  Est. cost (upper)  : ~$${costEst.toFixed(4)}`);
      console.log('');
      console.log('  ── SYSTEM PROMPT ──────────────────────────────────────────');
      console.log('');
      console.log(systemPrompt);
      console.log('');
      console.log('  ── USER PROMPT ────────────────────────────────────────────');
      console.log('');
      console.log(userPrompt);
      console.log('');
    }
  }

  if (!json) {
    console.log('  ── DRY-RUN COMPLETE ───────────────────────────────────────');
    console.log(`  Passes      : ${passesToRun.join(', ')}`);
    console.log(`  Total est.  : ~$${cumulativeEstimate.toFixed(4)}`);
    if (maxSpend !== null) {
      const within = cumulativeEstimate <= maxSpend;
      console.log(`  Max spend   : $${maxSpend.toFixed(2)} (${within ? 'within budget' : 'WOULD EXCEED — lower maxTokens or reduce passes'})`);
    }
    console.log('  Remove --dry-run to run for real.');
    console.log('');
  }
}

// ── TC Counter ───────────────────────────────────────────────────────────────

/**
 * Counts TC headings in a block of markdown.
 * @param {string} content
 * @returns {number}
 */
function countTCs(content) {
  const matches = content.match(/^#{2,3}\s+TC-/gm);
  return matches ? matches.length : 0;
}

// ── Error Handling ───────────────────────────────────────────────────────────

/**
 * Handles Anthropic API errors with user-friendly messages.
 * Always throws with an appropriate exitCode.
 *
 * @param {Error}   err
 * @param {boolean} json
 * @param {string}  slug
 * @param {string}  passName
 */
function handleApiError(err, json, slug, passName) {
  const status = err.status ?? err.statusCode;
  const ctx    = `(pass: ${passName})`;

  if (status === 401) {
    printError(json, slug,
      `API key is invalid (401 Unauthorized) ${ctx}.\n\n` +
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
      `Rate limit exceeded (429 Too Many Requests) ${ctx}.\n\n` +
      `  Retry after: ${retryAfter}s\n\n` +
      '  Options:\n' +
      `    - Wait and re-run: testnux enrich ${slug}\n` +
      '    - Use --max-tokens to reduce response size\n' +
      '    - Use --pass to re-run only the failed pass',
    );
    const e = new Error('API 429 Rate Limit');
    e.exitCode = 2;
    throw e;
  }

  if (status >= 500) {
    printError(json, slug,
      `Anthropic API server error (${status}) ${ctx}.\n\n` +
      '  This is a transient error. Retry in a few minutes.\n' +
      '  Status page: https://status.anthropic.com/',
    );
    const e = new Error(`API ${status} Server Error`);
    e.exitCode = 2;
    throw e;
  }

  if (err.name === 'AbortError' || err.message?.includes('abort')) {
    printError(json, slug,
      `API call timed out after ${API_TIMEOUT_MS / 1000}s ${ctx}.\n\n` +
      '  Try:\n' +
      '    - Reducing --max-tokens to shorten the response\n' +
      '    - Re-running when the API is less loaded\n' +
      `    - Targeting only the failing pass: testnux enrich ${slug} --pass ${passName}`,
    );
    const e = new Error('API call timed out');
    e.exitCode = 2;
    throw e;
  }

  printError(json, slug, `Anthropic API error ${ctx}: ${err.message ?? String(err)}`);
  const e = new Error(`API error: ${err.message}`);
  e.exitCode = 2;
  throw e;
}

// ── Utility ──────────────────────────────────────────────────────────────────

/**
 * Prints an error message in either JSON or human-readable format.
 * @param {boolean} json
 * @param {string}  slug
 * @param {string}  message
 */
function printError(json, slug, message) {
  if (json) {
    process.stderr.write(JSON.stringify({ event: 'enrich.error', slug, message }) + '\n');
  } else {
    console.error('');
    console.error('  ERROR: ' + message.split('\n').join('\n  '));
    console.error('');
  }
}

// ── Re-export legacy marker constants (consumed by init.mjs / plan.mjs) ─────

/**
 * @deprecated Use per-pass beginMarker()/endMarker() instead.
 * Kept for backwards compat with any callers that import the v0.1 constants.
 */
export const ENRICH_START_MARKER = '<!-- testnux:enrich:start -->';
export const ENRICH_GUARD_MARKER = '<!-- DO NOT MODIFY ABOVE THIS LINE — human-curated content -->';
export const ENRICH_END_MARKER   = '<!-- testnux:enrich:end -->';

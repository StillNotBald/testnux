// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/enrich.mjs
 *
 * Implements `branchnux enrich <slug>`.
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
 *   <!-- branchnux:enrich:design-review begin -->
 *   <!-- branchnux:enrich:design-review end -->
 *
 *   <!-- branchnux:enrich:qa-structural begin -->
 *   <!-- branchnux:enrich:qa-structural end -->
 *
 *   <!-- branchnux:enrich:graph-context begin -->
 *   <!-- branchnux:enrich:graph-context end -->
 *
 * APPEND-ONLY discipline:
 *   All enriched TCs live INSIDE the per-pass marker blocks only.
 *   Content outside those blocks is NEVER touched.
 *
 * Usage:
 *   branchnux enrich <slug> [--folder <path>] [--pass design-review|qa-structural|graph-context|all]
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

import {
  PRICING,
  DEFAULT_MODEL,
  DEFAULT_MAX_TOKENS,
  callClaude,
  estimateCost,
  estimateInputTokens,
  loadAnthropicClass,
} from '../lib/claude-client.mjs';

import { buildDesignReviewPrompt } from '../enrichers/design-review.mjs';
import { buildQaStructuralPrompt  } from '../enrichers/qa-structural.mjs';
import { buildGraphContextPrompt  } from '../enrichers/graph-context.mjs';

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_PASSES = ['design-review', 'qa-structural', 'graph-context'];

// ── Per-pass marker helpers ──────────────────────────────────────────────────

/** @param {string} passName */
function beginMarker(passName) {
  return `<!-- branchnux:enrich:${passName} begin -->`;
}

/** @param {string} passName */
function endMarker(passName) {
  return `<!-- branchnux:enrich:${passName} end -->`;
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
    console.log('  branchnux enrich — v0.2 ALPHA');
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
      `    branchnux init ${slug}`,
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
      '  Inspect prompts without an API key: branchnux enrich ' + slug + ' --dry-run',
    );
    const err = new Error('CLAUDE_API_KEY not set');
    err.exitCode = 1;
    throw err;
  }

  // ── Step 4: Load @anthropic-ai/sdk (unless dry-run) ─────────────────────────

  let Anthropic;
  if (!dryRun) {
    try {
      Anthropic = await loadAnthropicClass();
    } catch (sdkErr) {
      if (sdkErr.exitCode === 1) {
        printError(json, slug,
          '@anthropic-ai/sdk is not installed.\n\n' +
          '  Install with:\n\n' +
          '    npm install @anthropic-ai/sdk\n\n' +
          '  Then re-run: branchnux enrich ' + slug,
        );
      }
      throw sdkErr;
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
    return runDryRun({ slug, passesToRun, model, maxTokens, currentPlan, siblingPlans, json, maxSpend });
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
    const { systemPrompt, userPrompt } = buildPassPrompt({ passName, slug, currentPlan, siblingPlans });

    // Cost estimate
    const inputEst  = estimateInputTokens(systemPrompt, userPrompt);
    const outputEst = maxTokens;
    const costEst   = estimateCost({ inputTokens: inputEst, outputTokens: outputEst, model });

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
        '  https://github.com/leapnux/5nux/issues',
      );
      const err = new Error('LLM response parse error');
      err.exitCode = 3;
      throw err;
    }

    // Wrap in the per-pass marker block
    const timestamp   = new Date().toISOString();
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
    const actualCost = estimateCost({ inputTokens: actualIn, outputTokens: actualOut, model });
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
    console.log(`    3. Run: branchnux validate ${slug}`);
    console.log('');
  }
}

// ── Pass dispatcher ──────────────────────────────────────────────────────────

/**
 * Dispatches to the per-enricher prompt builder for a given pass name.
 *
 * @param {{ passName: string, slug: string, currentPlan: string, siblingPlans: any[] }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildPassPrompt({ passName, slug, currentPlan, siblingPlans }) {
  switch (passName) {
    case 'design-review':  return buildDesignReviewPrompt({ slug, currentPlan });
    case 'qa-structural':  return buildQaStructuralPrompt({ slug, currentPlan });
    case 'graph-context':  return buildGraphContextPrompt({ slug, currentPlan, siblingPlans });
    default: throw new Error(`Unknown pass: ${passName}`);
  }
}

// ── Pass list resolver ───────────────────────────────────────────────────────

/**
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
 * @param {string} slug
 * @param {string} testingLogRoot
 * @returns {string | null}
 */
function findTestPlanFile(slug, testingLogRoot) {
  const root = path.resolve(testingLogRoot);
  if (!fs.existsSync(root)) return null;

  const entries = fs.readdirSync(root).sort().reverse();
  for (const entry of entries) {
    if (!entry.toLowerCase().includes(slug.toLowerCase())) continue;
    const candidate = path.join(root, entry, 'test-plan.md');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * @param {string} thisTestPlanFile
 * @param {string} slug
 * @returns {{ slug: string, content: string }[]}
 */
function collectSiblingPlans(thisTestPlanFile, slug) {
  const root = path.dirname(path.dirname(thisTestPlanFile));
  if (!fs.existsSync(root)) return [];

  const results = [];
  const entries = fs.readdirSync(root).sort();
  for (const entry of entries) {
    if (entry.toLowerCase().includes(slug.toLowerCase())) continue;
    const candidate = path.join(root, entry, 'test-plan.md');
    if (!fs.existsSync(candidate)) continue;
    try {
      const content = fs.readFileSync(candidate, 'utf-8');
      const siblingSlug = entry.replace(/^\d{4}-\d{2}-\d{2}_/, '');
      results.push({ slug: siblingSlug, content });
    } catch {
      // ignore unreadable files
    }
  }
  return results;
}

// ── Response Validation & Tagging ────────────────────────────────────────────

/**
 * @param {string} text
 * @param {string} passName
 * @returns {string}
 * @throws {Error}
 */
function validateAndTagResponse(text, passName) {
  if (!text || text.trim().length === 0) {
    throw new Error(`LLM returned an empty response for pass "${passName}".`);
  }

  if (!/^#{2,3}\s+TC-/m.test(text)) {
    throw new Error(
      `Response for pass "${passName}" contains no TC-XX headings. ` +
      'The LLM may have returned explanatory prose instead of test cases.',
    );
  }

  const VERIFY_RE = /\[VERIFY\]/i;
  const blocks    = text.split(/(?=^#{2,3}\s+TC-)/m);

  const ensured = blocks.map((block) => {
    if (!block.match(/^#{2,3}\s+TC-/)) return block;
    if (VERIFY_RE.test(block)) return block;
    return block.trimEnd() + '\n\n> [VERIFY] Confirm behavior matches product specification before execution.\n';
  });

  return ensured.join('');
}

// ── Marker Block Application ─────────────────────────────────────────────────

/**
 * @param {string} passName
 * @param {string} content
 * @param {string} timestamp
 * @returns {string}
 */
function wrapInMarkers(passName, content, timestamp) {
  return [
    beginMarker(passName),
    `<!-- Generated: ${timestamp} by branchnux enrich pass=${passName} -->`,
    '<!-- All cells in this block carry [VERIFY] markers; review before treating as canonical -->',
    '',
    content.trim(),
    '',
    endMarker(passName),
  ].join('\n');
}

/**
 * @param {string} planContent
 * @param {string} passName
 * @param {string} markedBlock
 * @returns {string}
 */
function applyMarkerBlock(planContent, passName, markedBlock) {
  const begin = beginMarker(passName);
  const end   = endMarker(passName);

  const beginIdx = planContent.indexOf(begin);
  const endIdx   = planContent.indexOf(end);

  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const afterEnd = planContent[endIdx + end.length] === '\n'
      ? endIdx + end.length + 1
      : endIdx + end.length;
    return planContent.slice(0, beginIdx) + markedBlock + '\n' + planContent.slice(afterEnd);
  }

  const trimmed = planContent.trimEnd();
  return trimmed + '\n\n' + markedBlock + '\n';
}

// ── Dry-run ──────────────────────────────────────────────────────────────────

/**
 * @param {{ slug, passesToRun, model, maxTokens, currentPlan, siblingPlans, json, maxSpend }} p
 */
function runDryRun({ slug, passesToRun, model, maxTokens, currentPlan, siblingPlans, json, maxSpend }) {
  const pricing = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  let cumulativeEstimate = 0;

  for (const passName of passesToRun) {
    const { systemPrompt, userPrompt } = buildPassPrompt({ passName, slug, currentPlan, siblingPlans });
    const inputEst  = estimateInputTokens(systemPrompt, userPrompt);
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
 * @param {string} content
 * @returns {number}
 */
function countTCs(content) {
  const matches = content.match(/^#{2,3}\s+TC-/gm);
  return matches ? matches.length : 0;
}

// ── Error Handling ───────────────────────────────────────────────────────────

/**
 * @param {Error} err
 * @param {boolean} json
 * @param {string} slug
 * @param {string} passName
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
      `    - Wait and re-run: branchnux enrich ${slug}\n` +
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
      `API call timed out after 60s ${ctx}.\n\n` +
      '  Try:\n' +
      '    - Reducing --max-tokens to shorten the response\n' +
      '    - Re-running when the API is less loaded\n' +
      `    - Targeting only the failing pass: branchnux enrich ${slug} --pass ${passName}`,
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
export const ENRICH_START_MARKER = '<!-- branchnux:enrich:start -->';
export const ENRICH_GUARD_MARKER = '<!-- DO NOT MODIFY ABOVE THIS LINE — human-curated content -->';
export const ENRICH_END_MARKER   = '<!-- branchnux:enrich:end -->';

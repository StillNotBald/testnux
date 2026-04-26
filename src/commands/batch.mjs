// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/batch.mjs
 *
 * Implements `testnux batch-plan --pages "login,register,dashboard,..."`.
 *
 * v0.2 ALPHA — real multi-page parallel dispatcher.
 *
 * Dispatches pages in CHUNKED PARALLEL: within each chunk pages run in parallel
 * (Promise.allSettled); chunks run sequentially to contain cost and respect
 * rate limits.
 *
 * Replacement-agent pattern: each sub-command invocation gets its own fresh
 * import call; no shared Claude context accumulates across pages.
 *
 * Usage:
 *   testnux batch-plan --pages "login,register,dashboard"
 *   testnux batch-plan --pages "login=https://example.com/login,register=https://example.com/register"
 *   testnux batch-plan --pages "login,register" --stages "discover,plan" --max-spend 5
 *   testnux batch-plan --pages "login" --dry-run
 *
 * Exit codes:
 *   0  all pages succeeded (or dry-run complete)
 *   1  one or more pages failed (batch continued)
 *   2  --max-spend aborted mid-batch (or upfront estimate exceeded limit)
 */

import path from 'path';
import fs   from 'fs';

// ── Pricing table ─────────────────────────────────────────────────────────────
// Per-stage cost estimates (USD), high-end, based on discover.mjs PRICING.
// discover: up to 8k output tokens at $15/M = $0.12 + input ~$0.04  → ~$0.35
// plan:     ~$0.80 per page (from plan.mjs stub)
// codify:   ~$0.60 per page (from codify.mjs stub)
// enrich:   3 passes × $1.20/pass → $1.20 (conservative combined)
const STAGE_COST_ESTIMATE = {
  discover: 0.35,
  plan:     0.80,
  codify:   0.60,
  enrich:   1.20,
};

const ALL_STAGES = ['discover', 'plan', 'codify', 'enrich'];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   pages?:         string,          // comma-separated slugs or slug=url pairs
 *   pagesPerAgent?: number,          // chunk size for parallel dispatch
 *   json?:          boolean,
 *   dryRun?:        boolean,
 *   maxSpend?:      number | null,   // USD guardrail — warn loudly if absent
 *   model?:         string,
 *   baseUrl?:       string,
 *   industry?:      string,
 *   stages?:        string,          // comma-separated subset of ALL_STAGES
 *   out?:           string,
 * }} opts
 */
export async function runBatchPlan(opts = {}) {
  const {
    pages         = '',
    pagesPerAgent = 3,
    json          = false,
    dryRun        = false,
    maxSpend      = null,
    model         = 'claude-sonnet-4-6',
    baseUrl       = 'http://localhost:3000',
    industry      = 'general',
    stages        = 'discover,plan,codify,enrich',
    out           = './testing-log',
  } = opts;

  // ── 1. Parse pages list ───────────────────────────────────────────────────

  if (!pages || !pages.trim()) {
    const msg = '--pages is required. Example: --pages "login,register,dashboard"\n' +
                '  Each entry is either a slug (login) or a slug=url pair (login=https://example.com/login).';
    printError(json, msg);
    const err = new Error('--pages is required');
    err.exitCode = 2;
    throw err;
  }

  /** @type {{ slug: string, url: string | null }[]} */
  const pageList = pages
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((entry) => {
      const eqIdx = entry.indexOf('=');
      if (eqIdx === -1) {
        return { slug: sanitizeSlug(entry), url: null };
      }
      const slug = sanitizeSlug(entry.slice(0, eqIdx).trim());
      const url  = entry.slice(eqIdx + 1).trim();
      return { slug, url: url || null };
    });

  if (pageList.length === 0) {
    const msg = '--pages produced an empty list after parsing. Check your input.';
    printError(json, msg);
    const err = new Error('Empty pages list');
    err.exitCode = 2;
    throw err;
  }

  // ── 2. Parse stages ───────────────────────────────────────────────────────

  const enabledStages = stages
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => ALL_STAGES.includes(s));

  if (enabledStages.length === 0) {
    const msg = `--stages "${stages}" produced no valid stages. Valid values: ${ALL_STAGES.join(', ')}`;
    printError(json, msg);
    const err = new Error('No valid stages');
    err.exitCode = 2;
    throw err;
  }

  // ── 3. Validate CLAUDE_API_KEY (unless dry-run) ───────────────────────────

  if (!dryRun && !process.env.CLAUDE_API_KEY) {
    printError(json,
      'CLAUDE_API_KEY is not set.\n\n' +
      '  Get your API key at: https://console.anthropic.com/\n' +
      '  Then set it:\n\n' +
      '    export CLAUDE_API_KEY=sk-ant-...\n\n' +
      '  Use --dry-run to estimate cost without an API key.',
    );
    const err = new Error('CLAUDE_API_KEY not set');
    err.exitCode = 2;
    throw err;
  }

  // ── 4. Cost estimate ──────────────────────────────────────────────────────

  const perPageCost = enabledStages.reduce((sum, s) => sum + (STAGE_COST_ESTIMATE[s] ?? 0), 0);
  const totalCostEstimate = perPageCost * pageList.length;

  if (maxSpend === null || maxSpend === undefined) {
    // Warn loudly but don't abort
    if (!json) {
      console.warn('');
      console.warn('  WARNING: --max-spend is not set. Running without a cost guardrail.');
      console.warn(`  Estimated cost: ~$${totalCostEstimate.toFixed(2)} for ${pageList.length} page(s) × ${enabledStages.length} stage(s).`);
      console.warn('  Set --max-spend to protect against unexpected charges.');
      console.warn('');
    } else {
      process.stderr.write(JSON.stringify({
        event:   'batch-plan.warn',
        message: 'No --max-spend set. Running without guardrail.',
        estimatedCostUsd: totalCostEstimate,
      }) + '\n');
    }
  } else if (totalCostEstimate > maxSpend) {
    const msg =
      `Estimated cost ($${totalCostEstimate.toFixed(2)} for ${pageList.length} page(s) × [${enabledStages.join(', ')}]) ` +
      `exceeds --max-spend ($${maxSpend.toFixed(2)}).\n\n` +
      '  Options:\n' +
      '    - Use --max-spend with a higher limit\n' +
      '    - Reduce --stages (e.g. --stages "discover,plan")\n' +
      '    - Pass fewer pages with --pages\n' +
      '    - Use --dry-run to see the cost breakdown without spending';
    printError(json, msg);
    const err = new Error('Cost estimate exceeds --max-spend');
    err.exitCode = 2;
    throw err;
  }

  // ── 5. Dry-run: print plan and exit ──────────────────────────────────────

  if (dryRun) {
    if (json) {
      process.stdout.write(JSON.stringify({
        event:            'batch-plan.dry-run',
        pages:            pageList,
        stages:           enabledStages,
        pagesPerAgent,
        estimatedCostUsd: totalCostEstimate,
        maxSpend:         maxSpend ?? null,
        chunkCount:       Math.ceil(pageList.length / pagesPerAgent),
      }) + '\n');
    } else {
      console.log('');
      console.log('  testnux batch-plan — DRY RUN');
      console.log('  ─────────────────────────────────────────────────────────');
      console.log(`  Pages          : ${pageList.length}`);
      console.log(`  Stages         : ${enabledStages.join(', ')}`);
      console.log(`  Pages/chunk    : ${pagesPerAgent}`);
      console.log(`  Chunks         : ${Math.ceil(pageList.length / pagesPerAgent)}`);
      console.log(`  Est. cost/page : ~$${perPageCost.toFixed(2)}`);
      console.log(`  Est. total     : ~$${totalCostEstimate.toFixed(2)}`);
      if (maxSpend !== null) {
        console.log(`  Max spend      : $${maxSpend.toFixed(2)}  ✓`);
      }
      console.log('');
      console.log('  Execution plan:');
      const chunks = chunkArray(pageList, pagesPerAgent);
      chunks.forEach((chunk, i) => {
        console.log(`  Chunk ${i + 1}: ${chunk.map((p) => p.slug + (p.url ? ` (${p.url})` : '')).join(', ')}`);
      });
      console.log('');
      console.log('  [dry-run] No API calls made. Remove --dry-run to execute.');
      console.log('');
    }
    return;
  }

  // ── 6. Print banner ───────────────────────────────────────────────────────

  if (!json) {
    console.log('');
    console.log('  testnux batch-plan — v0.2 ALPHA');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  Pages     : ${pageList.length} (${pageList.map((p) => p.slug).join(', ')})`);
    console.log(`  Stages    : ${enabledStages.join(', ')}`);
    console.log(`  Chunk size: ${pagesPerAgent}`);
    console.log(`  Model     : ${model}`);
    console.log(`  Industry  : ${industry}`);
    console.log(`  Est. cost : ~$${totalCostEstimate.toFixed(2)}`);
    if (maxSpend !== null) {
      console.log(`  Max spend : $${maxSpend.toFixed(2)}`);
    }
    console.log('');
  }

  logEvent(json, {
    event:  'batch-plan.start',
    pages:  pageList.map((p) => p.slug),
    stages: enabledStages,
    pagesPerAgent,
    estimatedCostUsd: totalCostEstimate,
  });

  // ── 7. Chunked parallel dispatch ──────────────────────────────────────────

  const chunks = chunkArray(pageList, pagesPerAgent);

  /** @type {Map<string, PageResult>} */
  const results = new Map();
  let cumulativeCost = 0;
  let abortedBySpend = false;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];

    // Check max-spend before starting this chunk
    if (maxSpend !== null && cumulativeCost >= maxSpend) {
      abortedBySpend = true;
      if (!json) {
        console.log('');
        console.log(`  SPEND LIMIT REACHED: cumulative cost $${cumulativeCost.toFixed(4)} >= --max-spend $${maxSpend.toFixed(2)}`);
        console.log(`  Skipping remaining ${chunks.slice(ci).flatMap((c) => c).length} page(s).`);
        console.log('');
      } else {
        process.stderr.write(JSON.stringify({
          event:          'batch-plan.spend-abort',
          cumulativeCost,
          maxSpend,
          remainingPages: chunks.slice(ci).flatMap((c) => c.map((p) => p.slug)),
        }) + '\n');
      }
      // Mark all remaining pages as SKIP
      for (const remaining of chunks.slice(ci).flat()) {
        results.set(remaining.slug, makeSkipResult(remaining.slug, enabledStages));
      }
      break;
    }

    if (!json) {
      console.log(`  ── Chunk ${ci + 1}/${chunks.length}: ${chunk.map((p) => p.slug).join(', ')} ──`);
    }

    // Run all pages in this chunk in parallel
    const settled = await Promise.allSettled(
      chunk.map((page) =>
        runPagePipeline(page, enabledStages, {
          model,
          baseUrl,
          industry,
          out,
          json,
          maxSpend,
          currentCumulativeCost: cumulativeCost,
        }),
      ),
    );

    // Collect results
    for (let pi = 0; pi < chunk.length; pi++) {
      const page    = chunk[pi];
      const outcome = settled[pi];

      if (outcome.status === 'fulfilled') {
        const pageResult = outcome.value;
        results.set(page.slug, pageResult);
        cumulativeCost += pageResult.costUsd;

        logEvent(json, {
          event:    'batch-plan.page.done',
          slug:     page.slug,
          stages:   pageResult.stages,
          costUsd:  pageResult.costUsd,
        });

        if (!json) {
          const stageStr = Object.entries(pageResult.stages)
            .map(([s, r]) => `${s}:${r.status}`)
            .join(' ');
          console.log(`    ${page.slug.padEnd(20)} ${stageStr}  $${pageResult.costUsd.toFixed(4)}`);
        }
      } else {
        // Unexpected rejection (not a stage failure — those are caught inside)
        const errMsg = outcome.reason?.message ?? String(outcome.reason);
        const pageResult = makeErrorResult(page.slug, enabledStages, errMsg);
        results.set(page.slug, pageResult);

        // Write error log
        saveErrorLog(page.slug, out, `Unhandled pipeline error: ${errMsg}`);

        logEvent(json, {
          event:   'batch-plan.page.error',
          slug:    page.slug,
          message: errMsg,
        });

        if (!json) {
          console.log(`    ${page.slug.padEnd(20)} [ERROR] ${errMsg}`);
        }
      }
    }
  }

  // ── 8. Final summary table ────────────────────────────────────────────────

  const allResults = [...results.values()];
  const anyFailed  = allResults.some((r) =>
    Object.values(r.stages).some((s) => s.status === 'FAIL'),
  );

  if (!json) {
    printSummaryTable(allResults, enabledStages, cumulativeCost);
  }

  // Write batch-plan-summary.md
  writeBatchSummary(allResults, enabledStages, cumulativeCost, out);

  // Emit final JSON record
  logEvent(json, {
    event:          'batch-plan.summary',
    pages:          allResults.map((r) => ({
      slug:   r.slug,
      stages: r.stages,
      costUsd: r.costUsd,
    })),
    totalCostUsd:   cumulativeCost,
    anyFailed,
    abortedBySpend,
  });

  if (abortedBySpend) {
    const err = new Error('--max-spend limit reached mid-batch');
    err.exitCode = 2;
    throw err;
  }

  if (anyFailed) {
    const err = new Error('One or more pages failed');
    err.exitCode = 1;
    throw err;
  }
}

// ── Per-page pipeline ─────────────────────────────────────────────────────────

/**
 * Runs the full stage pipeline for one page.
 * Stage failures are caught and logged; the pipeline continues to the next stage.
 *
 * @param {{ slug: string, url: string | null }} page
 * @param {string[]} enabledStages
 * @param {{
 *   model: string,
 *   baseUrl: string,
 *   industry: string,
 *   out: string,
 *   json: boolean,
 *   maxSpend: number | null,
 *   currentCumulativeCost: number,
 * }} opts
 * @returns {Promise<PageResult>}
 */
async function runPagePipeline(page, enabledStages, opts) {
  const { slug, url } = page;
  const { model, baseUrl, industry, out, json, maxSpend, currentCumulativeCost } = opts;

  /** @type {PageResult} */
  const result = {
    slug,
    costUsd: 0,
    stages:  {},
  };

  // Initialize all stages as SKIP; we'll update as we go
  for (const s of enabledStages) {
    result.stages[s] = { status: 'SKIP', costUsd: 0, error: null };
  }

  // Compute output directory for this page
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const pageOutDir = path.resolve(out, `${datePrefix}_${slug}`);
  fs.mkdirSync(pageOutDir, { recursive: true });

  let previousStageFailed = false;

  for (const stage of enabledStages) {
    // If a critical prior stage failed, mark subsequent as SKIP
    if (previousStageFailed && stage !== 'discover') {
      result.stages[stage] = { status: 'SKIP', costUsd: 0, error: 'prior stage failed' };
      continue;
    }

    try {
      const stageResult = await runStage(stage, slug, url, {
        model,
        baseUrl,
        industry,
        out,
        pageOutDir,
        json,
        maxSpend,
      });
      result.stages[stage] = { status: 'OK', costUsd: stageResult.costUsd ?? 0, error: null };
      result.costUsd += stageResult.costUsd ?? 0;
    } catch (stageErr) {
      const errMsg = stageErr.message ?? String(stageErr);
      result.stages[stage] = { status: 'FAIL', costUsd: 0, error: errMsg };
      saveErrorLog(slug, out, `Stage "${stage}" failed: ${errMsg}`);
      previousStageFailed = true;
      // Continue to next stage (don't abort the whole page)
    }
  }

  return result;
}

/**
 * Runs one stage for one page.
 * Imports the appropriate command module and calls its exported function.
 *
 * @returns {Promise<{ costUsd: number }>}
 */
async function runStage(stage, slug, url, opts) {
  const { model, baseUrl, industry, out, pageOutDir, json } = opts;

  switch (stage) {
    case 'discover': {
      if (!url) {
        // No URL provided — skip discover gracefully
        return { costUsd: 0 };
      }
      const { runDiscover } = await import('./discover.mjs');
      // runDiscover writes scenarios.md and emits NDJSON with costUsd
      let costUsd = 0;
      // Intercept stdout to capture the NDJSON cost record
      const captured = await captureJsonOutput(async () => {
        await runDiscover(url, {
          slug,
          output: pageOutDir,
          model,
          json:   true,
        });
      });
      const doneRecord = captured.find((r) => r.event === 'discover.done');
      if (doneRecord?.costUsd) costUsd = doneRecord.costUsd;
      return { costUsd };
    }

    case 'plan': {
      const { runPlan } = await import('./plan.mjs');
      let costUsd = 0;
      const captured = await captureJsonOutput(async () => {
        await runPlan(slug, {
          url,
          industry,
          out,
          json: true,
        });
      });
      const doneRecord = captured.find((r) => r.event === 'plan.done');
      if (doneRecord?.costUsd) costUsd = doneRecord.costUsd;
      return { costUsd };
    }

    case 'codify': {
      const { runCodify } = await import('./codify.mjs');
      let costUsd = 0;
      const captured = await captureJsonOutput(async () => {
        await runCodify(slug, {
          baseUrl,
          out,
          json: true,
        });
      });
      const doneRecord = captured.find((r) => r.event === 'codify.done');
      if (doneRecord?.costUsd) costUsd = doneRecord.costUsd;
      return { costUsd };
    }

    case 'enrich': {
      const { runEnrich } = await import('./enrich.mjs');
      let costUsd = 0;
      const captured = await captureJsonOutput(async () => {
        await runEnrich(slug, {
          folder: out,   // v0.2: 'folder' replaces v0.1 'out'
          pass:   'all', // v0.2: 'pass' string replaces v0.1 'passes' array
          json:   true,
        });
      });
      const doneRecord = captured.find((r) => r.event === 'enrich.done');
      if (doneRecord?.totalCostUsd) costUsd = doneRecord.totalCostUsd;
      return { costUsd };
    }

    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}

// ── JSON output capture ───────────────────────────────────────────────────────

/**
 * Runs an async function that writes NDJSON to process.stdout and captures
 * all records written during the call, restoring stdout afterwards.
 *
 * Because all sub-commands write NDJSON via process.stdout.write(), we
 * temporarily replace that method with one that (a) collects records and
 * (b) does NOT forward to the real stdout — so batch can control what gets
 * printed at the top level.
 *
 * @param {() => Promise<void>} fn
 * @returns {Promise<object[]>}
 */
async function captureJsonOutput(fn) {
  const records = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = (chunk) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed));
      } catch {
        // non-JSON line from sub-command — discard (batch controls output)
      }
    }
    return true;
  };

  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }

  return records;
}

// ── Summary helpers ───────────────────────────────────────────────────────────

/**
 * Prints the per-page status table to stdout.
 */
function printSummaryTable(results, enabledStages, totalCost) {
  const COL_PAGE  = 20;
  const COL_STAGE = 8;

  const header =
    'page'.padEnd(COL_PAGE) + '| ' +
    enabledStages.map((s) => s.padEnd(COL_STAGE)).join('| ') +
    '| cost';
  const divider = '─'.repeat(header.length);

  console.log('');
  console.log('  ── Batch Summary ───────────────────────────────────────────');
  console.log('  ' + header);
  console.log('  ' + divider);

  for (const r of results) {
    const stageColumns = enabledStages.map((s) => {
      const st = r.stages[s];
      if (!st) return 'N/A'.padEnd(COL_STAGE);
      return st.status.padEnd(COL_STAGE);
    });
    const row =
      r.slug.slice(0, COL_PAGE - 1).padEnd(COL_PAGE) + '| ' +
      stageColumns.join('| ') + '| ' +
      (r.costUsd > 0 ? `$${r.costUsd.toFixed(4)}` : '$0.0000');
    console.log('  ' + row);
  }

  console.log('  ' + '─'.repeat(header.length));

  const totalLabel = ''.padEnd(COL_PAGE + enabledStages.length * (COL_STAGE + 2) + 2);
  console.log('  ' + totalLabel + `Total: $${totalCost.toFixed(4)}`);
  console.log('');
}

/**
 * Writes batch-plan-summary.md to the out directory.
 */
function writeBatchSummary(results, enabledStages, totalCost, outDir) {
  const date   = new Date().toISOString();
  const passed = results.filter((r) => Object.values(r.stages).every((s) => s.status !== 'FAIL')).length;
  const failed = results.length - passed;

  const tableHeader =
    '| page | ' + enabledStages.join(' | ') + ' | cost |\n' +
    '|------|' + enabledStages.map(() => '------|').join('') + '------|';

  const tableRows = results.map((r) => {
    const stageCols = enabledStages.map((s) => (r.stages[s]?.status ?? 'N/A')).join(' | ');
    const cost = r.costUsd > 0 ? `$${r.costUsd.toFixed(4)}` : '$0.0000';
    return `| ${r.slug} | ${stageCols} | ${cost} |`;
  });

  const errorSection = results
    .filter((r) => Object.values(r.stages).some((s) => s.status === 'FAIL'))
    .map((r) => {
      const failedStages = Object.entries(r.stages)
        .filter(([, s]) => s.status === 'FAIL')
        .map(([name, s]) => `  - **${name}**: ${s.error ?? 'unknown error'}`)
        .join('\n');
      return `### ${r.slug}\n${failedStages}`;
    })
    .join('\n\n');

  const content = [
    '# Batch Plan Summary',
    '',
    `**Generated**: ${date}`,
    `**Pages processed**: ${results.length}`,
    `**Passed**: ${passed}`,
    `**Failed**: ${failed}`,
    `**Total cost**: $${totalCost.toFixed(4)}`,
    '',
    '## Results',
    '',
    tableHeader,
    ...tableRows,
    '',
    ...(errorSection
      ? ['## Errors', '', errorSection, '']
      : []),
    '## Next Steps',
    '',
    '1. Review each `testing-log/<date>_<slug>/scenarios.md` and remove `[VERIFY]` markers as you confirm TCs.',
    '2. Check `testing-log/<date>_<slug>/test-plan.md` for R-ID mappings.',
    '3. Run `npx playwright test` to execute the generated specs.',
    '',
    '_Generated by testnux batch-plan v0.2_',
  ].join('\n');

  try {
    const summaryPath = path.resolve(outDir, 'batch-plan-summary.md');
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, content, 'utf-8');
  } catch {
    // Non-fatal — summary is a convenience artifact
  }
}

// ── Error log ─────────────────────────────────────────────────────────────────

/**
 * Appends an error message to <slug>/batch-errors.log inside the out directory.
 */
function saveErrorLog(slug, outDir, message) {
  try {
    // Find the most recent date-prefixed folder for this slug
    const testingLog = path.resolve(outDir);
    fs.mkdirSync(testingLog, { recursive: true });

    let targetDir = testingLog;
    if (fs.existsSync(testingLog)) {
      const entries = fs.readdirSync(testingLog)
        .filter((e) => e.includes(slug))
        .sort()
        .reverse();
      if (entries.length > 0) {
        targetDir = path.join(testingLog, entries[0]);
      }
    }

    const logPath = path.join(targetDir, 'batch-errors.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, 'utf-8');
  } catch {
    // Swallow — error logging must not itself throw
  }
}

// ── Result factories ──────────────────────────────────────────────────────────

/**
 * @typedef {{ slug: string, costUsd: number, stages: Record<string, { status: string, costUsd: number, error: string | null }> }} PageResult
 */

function makeSkipResult(slug, enabledStages) {
  const stages = {};
  for (const s of enabledStages) {
    stages[s] = { status: 'SKIP', costUsd: 0, error: 'spend limit reached' };
  }
  return { slug, costUsd: 0, stages };
}

function makeErrorResult(slug, enabledStages, errMsg) {
  const stages = {};
  for (const s of enabledStages) {
    stages[s] = { status: 'FAIL', costUsd: 0, error: errMsg };
  }
  return { slug, costUsd: 0, stages };
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/**
 * Splits an array into chunks of at most `size`.
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sanitizes a user-provided page name to a safe slug.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeSlug(raw) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'page';
}

/**
 * Emits an NDJSON event to stdout when json mode is on.
 * @param {boolean} json
 * @param {object} payload
 */
function logEvent(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

/**
 * Prints an error in human or JSON format to stderr.
 * @param {boolean} json
 * @param {string} message
 */
function printError(json, message) {
  if (json) {
    process.stderr.write(JSON.stringify({ event: 'batch-plan.error', message }) + '\n');
  } else {
    console.error('');
    console.error('  ERROR: ' + message.split('\n').join('\n  '));
    console.error('');
  }
}

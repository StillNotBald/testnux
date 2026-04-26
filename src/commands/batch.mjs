// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/batch.mjs
 *
 * Implements `testnux batch-plan --pages "login,register,dashboard,..."`.
 *
 * v0.1 STUB — describes what the v0.2 multi-agent batch dispatcher will do.
 * No LLM calls are made; exits 0.
 *
 * v0.2 plan:
 *   Spin up N parallel Claude agents (one per batch of --pages-per-agent pages),
 *   each running the full discover → plan → codify → enrich pipeline.
 *   A "replacement agent" pattern ensures cost containment: each sub-agent
 *   gets a fresh context window; no single agent accumulates a 200k-token history.
 *
 * REPLACEMENT-AGENT PATTERN:
 *   Rather than one long-running agent that processes all pages sequentially,
 *   batch-plan spawns a coordinator that dispatches sub-agents via Claude's
 *   API. Each sub-agent handles one batch of pages, completes, and is replaced
 *   by a fresh agent for the next batch. This keeps per-agent token cost
 *   proportional to batch size, not total job size.
 *
 * --max-spend guardrail:
 *   Before any LLM call, the coordinator estimates cost:
 *     estimated_cost = pages × avg_tokens_per_page × price_per_token
 *   If estimated_cost > --max-spend, the job is aborted with exit code 1
 *   and a cost breakdown is printed. This prevents accidental over-spend on
 *   large page sets. Use --dry-run to get the estimate without spending.
 *
 * --pages-per-agent:
 *   Controls how many pages each sub-agent handles. Lower = smaller context
 *   window per agent = cheaper per-agent cost but more agent overhead.
 *   Recommended: 5 (default). For large sites (100+ pages), use 10.
 *
 * Cost model (v0.2 estimate):
 *   $0.50–$2.00 per page (discover + plan + codify + enrich)
 *   For 20 pages at 5 pages/agent: 4 agents × ~$5–$10/agent = $20–$40 total
 *   Use --max-spend $50 as a safe default for a 20-page app.
 *
 * Output:
 *   testing-log/<date>_<slug>/  (one folder per page, same as `testnux init`)
 *   batch-plan-summary.md       (coordinator summary: pages done, cost, errors)
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   pages:         string,         // comma-separated page slugs or URLs
 *   maxSpend:      number | null,  // USD cost guardrail
 *   pagesPerAgent: number,         // pages per sub-agent batch
 *   dryRun:        boolean,
 *   out:           string,
 *   json:          boolean,
 * }} opts
 */
export async function runBatchPlan(opts = {}) {
  const {
    pages         = '',
    maxSpend      = null,
    pagesPerAgent = 5,
    dryRun        = false,
    out           = './testing-log',
    json          = false,
  } = opts;

  const pageList = pages
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (pageList.length === 0) {
    const err = new Error('--pages is required. Example: --pages "login,register,dashboard"');
    err.exitCode = 2;
    throw err;
  }

  const agentCount  = Math.ceil(pageList.length / pagesPerAgent);
  const costLow     = pageList.length * 0.5;
  const costHigh    = pageList.length * 2.0;
  const costEstimateStr = `$${costLow.toFixed(2)}–$${costHigh.toFixed(2)}`;

  // ── Enforce --max-spend BEFORE any LLM call ───────────────────────────────
  // Use the conservative HIGH-end estimate so users never accidentally overspend.
  if (maxSpend !== null) {
    if (costHigh > maxSpend) {
      const msg =
        `Estimated cost (high-end $${costHigh.toFixed(2)} for ${pageList.length} pages) ` +
        `exceeds --max-spend ($${maxSpend.toFixed(2)}). ` +
        `Aborting before API call. Re-run with higher --max-spend or --dry-run to inspect.`;
      if (json) {
        process.stderr.write(JSON.stringify({ event: 'batch-plan.error', message: msg }) + '\n');
      } else {
        console.error('');
        console.error('  ❌ ' + msg);
        console.error('');
      }
      const err = new Error('Cost estimate exceeds --max-spend');
      err.exitCode = 1;
      throw err;
    } else {
      if (!json) {
        console.log(`  ✓ Estimated cost (high-end $${costHigh.toFixed(2)}) within --max-spend ($${maxSpend.toFixed(2)}). Proceeding.`);
      }
    }
  }

  log(json, {
    event:         'batch-plan.stub',
    pages:         pageList,
    agentCount,
    pagesPerAgent,
    maxSpend,
    costEstimate:  costEstimateStr,
    version:       'v0.1',
  });

  if (!json) {
    console.log('');
    console.log('  testnux batch-plan — v0.1 stub');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  Pages          : ${pageList.length} (${pageList.join(', ')})`);
    console.log(`  Pages/agent    : ${pagesPerAgent}`);
    console.log(`  Agent count    : ${agentCount} (estimated)`);
    console.log(`  Cost estimate  : ${costEstimateStr} (discover+plan+codify+enrich)`);
    if (maxSpend !== null) {
      console.log(`  Max spend      : $${maxSpend.toFixed(2)}`);
    }
    console.log('');
    console.log('  In v0.2, this command will:');
    console.log('');
    console.log('  1. COST CHECK — estimate tokens × price before any LLM call.');
    console.log('     Abort with exit 1 if estimated cost > --max-spend.');
    console.log('     Use --dry-run to get the estimate without spending.');
    console.log('');
    console.log('  2. BATCH DISPATCH — split pages into batches of --pages-per-agent.');
    console.log(`     ${agentCount} agent(s) × ${pagesPerAgent} pages/agent`);
    console.log('');
    console.log('  3. REPLACEMENT-AGENT PATTERN — each sub-agent gets a fresh');
    console.log('     context window; no single agent accumulates a 200k-token');
    console.log('     history. The coordinator dispatches via the Claude API');
    console.log('     (claude-sonnet-4-6 for speed + cost balance).');
    console.log('');
    console.log('  4. PER-PAGE PIPELINE — for each page in the batch:');
    console.log('     a. discover <url>    → <slug>-scenarios.md');
    console.log('     b. plan <slug>       → testing-log/<date>_<slug>/test-plan.md');
    console.log('     c. codify <slug>     → testing-log/<date>_<slug>/spec.ts');
    console.log('     d. enrich <slug>     → append suggested TCs (3 passes)');
    console.log('');
    console.log('  5. BATCH SUMMARY — write batch-plan-summary.md with:');
    console.log('     - Pages completed / failed');
    console.log('     - Actual cost (from API usage headers)');
    console.log('     - Links to each generated test plan');
    console.log('     - [VERIFY] count (how many cells need human review)');
    console.log('');
    console.log('  For now, run each page manually:');
    for (const page of pageList) {
      console.log(`    testnux init ${page}`);
    }
    console.log('');
    console.log('  Or run the discover → plan pipeline per page when v0.2 ships.');
    console.log('  Set CLAUDE_API_KEY and --max-spend to enable LLM features.');
    console.log('');

    if (dryRun) {
      console.log('  [dry-run] No files written.');
    }
  } else {
    process.stdout.write(
      JSON.stringify({
        event:        'batch-plan.stub.done',
        pages:        pageList,
        agentCount,
        pagesPerAgent,
        costEstimate: costEstimateStr,
        message:      'v0.1 stub — see v0.2 roadmap for LLM-powered batch planning',
      }) + '\n',
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

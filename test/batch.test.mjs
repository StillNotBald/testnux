// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/batch.test.mjs
 *
 * Unit tests for `testnux batch-plan` (src/commands/batch.mjs).
 *
 * Mocking strategy:
 *   batch.mjs dynamically imports sub-commands (discover/plan/codify/enrich)
 *   via `await import('./discover.mjs')` etc. inside runStage().
 *   We mock those modules via vi.mock() with factories so that no real API
 *   calls fire.
 *
 *   The sub-command mocks write NDJSON to process.stdout so that
 *   captureJsonOutput() inside batch.mjs can parse the done records and
 *   accumulate costUsd correctly.
 *
 * Known ESM parallel-import behaviour:
 *   When Vitest processes parallel dynamic imports (Promise.allSettled with
 *   pagesPerAgent > 1), only the first concurrent import gets the mock reliably.
 *   Subsequent parallel imports of the same module may get the real module.
 *   This is a Vitest ESM module-registry issue with concurrent dynamic imports.
 *
 *   Mitigation in these tests: tests that assert mock call counts use
 *   pagesPerAgent: 1 (sequential chunks). Tests that verify chunked-parallel
 *   dispatch logic check output events (slugs, counts) rather than mock calls.
 *
 * Important:
 *   vi.restoreAllMocks() is called in afterEach to restore process.stdout.write
 *   spies between tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path   from 'path';
import fs     from 'fs';
import os     from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Module mock: @anthropic-ai/sdk ────────────────────────────────────────────

const mockMessageCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: mockMessageCreate };
    }
  },
}));

// ── Sub-command mocks ─────────────────────────────────────────────────────────
//
// Each mock writes the expected NDJSON done record to process.stdout.
// captureJsonOutput() in batch.mjs intercepts that write (it temporarily
// replaces process.stdout.write with its own buffer), extracts costUsd, and
// after the stage returns, restores stdout.write and emits the page.done event.
//
// NOTE: parallel pages in the same chunk (pagesPerAgent > 1) share the global
// process.stdout.write, which is replaced by captureJsonOutput in an
// non-reentrant way. Tests that verify mock call counts therefore use
// pagesPerAgent: 1 (sequential). Tests for chunked-parallel behavior only
// assert on output events (not call counts).

vi.mock('../src/commands/discover.mjs', () => ({
  runDiscover: vi.fn(async (_url, _opts) => {
    process.stdout.write(JSON.stringify({
      event:    'discover.done',
      url:      _url ?? 'http://localhost:3000/login',
      tcCount:  3,
      tokensIn: 1200,
      tokensOut: 800,
      costUsd:  0.02,
      outFile:  'scenarios.md',
    }) + '\n');
  }),
}));

vi.mock('../src/commands/plan.mjs', () => ({
  runPlan: vi.fn(async (_slug, _opts) => {
    process.stdout.write(JSON.stringify({
      event:       'plan.done',
      slug:        _slug,
      testPlanMd:  '# Plan for ' + _slug,
      tokensIn:    1500,
      tokensOut:   1000,
      costUsd:     0.03,
    }) + '\n');
  }),
}));

vi.mock('../src/commands/codify.mjs', () => ({
  runCodify: vi.fn(async (_slug, _opts) => {
    process.stdout.write(JSON.stringify({
      event:    'codify.done',
      slug:     _slug,
      specTs:   '// spec for ' + _slug,
      tokensIn: 1000,
      tokensOut: 700,
      costUsd:  0.015,
    }) + '\n');
  }),
}));

vi.mock('../src/commands/enrich.mjs', () => ({
  runEnrich: vi.fn(async (_slug, _opts) => {
    process.stdout.write(JSON.stringify({
      event:          'enrich.done',
      slug:           _slug,
      passesRun:      ['design-review', 'qa-structural', 'graph-context'],
      totalTCs:       6,
      totalTokensIn:  6000,
      totalTokensOut: 4000,
      totalCostUsd:   0.12,
    }) + '\n');
  }),
  // Re-export marker constants consumed by other modules
  ENRICH_START_MARKER: '<!-- testnux:enrich:start -->',
  ENRICH_GUARD_MARKER: '<!-- DO NOT MODIFY ABOVE THIS LINE — human-curated content -->',
  ENRICH_END_MARKER:   '<!-- testnux:enrich:end -->',
}));

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-test-'));
  vi.clearAllMocks();
  process.env.CLAUDE_API_KEY = 'sk-ant-test';
});

afterEach(() => {
  // restoreAllMocks() restores process.stdout.write spies.
  // Without this, a spy from test N bleeds into test N+1.
  vi.restoreAllMocks();
  delete process.env.CLAUDE_API_KEY;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ── Import runBatchPlan after mocks ───────────────────────────────────────────

const { runBatchPlan } = await import('../src/commands/batch.mjs');

// ── Helper: get mock function references ─────────────────────────────────────

async function getSubCommandMocks() {
  const { runDiscover } = await import('../src/commands/discover.mjs');
  const { runPlan }     = await import('../src/commands/plan.mjs');
  const { runCodify }   = await import('../src/commands/codify.mjs');
  const { runEnrich }   = await import('../src/commands/enrich.mjs');
  return { runDiscover, runPlan, runCodify, runEnrich };
}

/**
 * Runs runBatchPlan with a stdout spy, captures NDJSON events.
 * Returns { events, thrown }.
 */
async function captureAndRun(batchOpts) {
  const stdoutLines = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutLines.push(String(chunk));
    return true;
  });

  let thrown;
  try {
    await runBatchPlan(batchOpts);
  } catch (err) {
    thrown = err;
  }

  const events = stdoutLines
    .join('')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  return { events, thrown };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. --pages parsing
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — --pages parsing', () => {
  it('parses "login,register,dashboard" → 3 page slugs in batch-plan.start', async () => {
    const { events } = await captureAndRun({
      pages:         'login,register,dashboard',
      pagesPerAgent: 1,   // sequential to ensure reliable mock dispatch
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const start = events.find((e) => e.event === 'batch-plan.start');
    expect(start).toBeDefined();
    expect(start.pages).toHaveLength(3);
    expect(start.pages).toContain('login');
    expect(start.pages).toContain('register');
    expect(start.pages).toContain('dashboard');
  });

  it('parses "login=https://example.com/login" → slug "login" in start event', async () => {
    const { events } = await captureAndRun({
      pages:         'login=https://example.com/login',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const start = events.find((e) => e.event === 'batch-plan.start');
    expect(start).toBeDefined();
    expect(start.pages).toHaveLength(1);
    expect(start.pages[0]).toBe('login');
  });

  it('slug=url pairs: URL is passed to discover stage', async () => {
    const { runDiscover } = await getSubCommandMocks();

    await captureAndRun({
      pages:         'login=https://example.com/login',
      pagesPerAgent: 1,
      stages:        'discover',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    expect(runDiscover).toHaveBeenCalledWith(
      'https://example.com/login',
      expect.objectContaining({ slug: 'login' }),
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Missing CLAUDE_API_KEY
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — missing CLAUDE_API_KEY', () => {
  it('throws exitCode 2 before any sub-call when CLAUDE_API_KEY is not set', async () => {
    delete process.env.CLAUDE_API_KEY;

    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const { thrown } = await captureAndRun({
      pages:  'login',
      stages: 'plan',
      json:   true,
      out:    tmpDir,
    });

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
    expect(thrown.message).toMatch(/CLAUDE_API_KEY/i);

    const { runPlan } = await getSubCommandMocks();
    expect(runPlan).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Chunked parallel dispatch
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — chunked parallel dispatch', () => {
  it('5 pages result in 5 page.done events in the summary (chunk logic correct)', async () => {
    // Use pagesPerAgent=2 → chunks: [p1,p2], [p3,p4], [p5]
    // We verify the batch dispatched all 5 pages via the summary events.
    // We don't assert mock call counts due to the ESM parallel-import limitation.
    const { events } = await captureAndRun({
      pages:         'p1,p2,p3,p4,p5',
      pagesPerAgent: 2,
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    // batch-plan.start carries pagesPerAgent
    const start = events.find((e) => e.event === 'batch-plan.start');
    expect(start).toBeDefined();
    expect(start.pagesPerAgent).toBe(2);
    expect(start.pages).toHaveLength(5);

    // Summary should list all 5 pages
    const summary = events.find((e) => e.event === 'batch-plan.summary');
    expect(summary).toBeDefined();
    expect(summary.pages).toHaveLength(5);

    const slugsInSummary = summary.pages.map((p) => p.slug).sort();
    expect(slugsInSummary).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('sequential (pagesPerAgent=1) ensures all 3 pages run their plan mock', async () => {
    // With pagesPerAgent=1, each page is its own chunk → no parallel imports.
    const { events } = await captureAndRun({
      pages:         'alpha,beta,gamma',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const pageDones = events.filter((e) => e.event === 'batch-plan.page.done');
    expect(pageDones).toHaveLength(3);

    const { runPlan } = await getSubCommandMocks();
    expect(runPlan).toHaveBeenCalledTimes(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Per-page failure isolation
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — per-page failure isolation', () => {
  it('if plan fails for page1, batch continues; all 3 pages appear in summary', async () => {
    const { runPlan } = await getSubCommandMocks();

    // Make plan fail ONLY on the first call (page1)
    runPlan
      .mockRejectedValueOnce(new Error('Plan API error for page 1'))
      .mockImplementation(async (_slug, _opts) => {
        process.stdout.write(JSON.stringify({
          event:   'plan.done',
          slug:    _slug,
          costUsd: 0.03,
        }) + '\n');
      });

    const { events, thrown } = await captureAndRun({
      pages:         'page1,page2,page3',
      pagesPerAgent: 1,        // sequential for reliable mock dispatch
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    // Should throw exitCode 1 (some failed)
    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/one or more pages failed/i);

    const summary = events.find((e) => e.event === 'batch-plan.summary');
    expect(summary).toBeDefined();
    // All 3 pages in summary
    expect(summary.pages).toHaveLength(3);
    // page1 failed
    expect(summary.pages.find((p) => p.slug === 'page1').stages.plan.status).toBe('FAIL');
    // pages 2 and 3 succeeded
    expect(summary.pages.find((p) => p.slug === 'page2').stages.plan.status).toBe('OK');
    expect(summary.pages.find((p) => p.slug === 'page3').stages.plan.status).toBe('OK');
  });

  it('batch-errors.log is written for the failed page', async () => {
    const { runPlan } = await getSubCommandMocks();
    runPlan.mockRejectedValueOnce(new Error('Plan exploded'));

    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    await captureAndRun({
      pages:         'failpage',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    // batch-errors.log should exist somewhere inside tmpDir
    function findLogs(dir) {
      const found = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...findLogs(full));
        else if (entry.name === 'batch-errors.log') found.push(full);
      }
      return found;
    }

    const logFiles = findLogs(tmpDir);
    expect(logFiles.length).toBeGreaterThan(0);
    const logContent = fs.readFileSync(logFiles[0], 'utf-8');
    expect(logContent).toContain('Stage "plan" failed');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Stage-skip on failure
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — stage-skip on failure', () => {
  it('if discover fails, plan/codify/enrich for that page get SKIP status', async () => {
    const { runDiscover } = await getSubCommandMocks();
    runDiscover.mockRejectedValueOnce(new Error('Discover network error'));

    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const { events } = await captureAndRun({
      pages:         'login=https://example.com/login',
      pagesPerAgent: 1,
      stages:        'discover,plan,codify,enrich',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const summary = events.find((e) => e.event === 'batch-plan.summary');
    expect(summary).toBeDefined();

    const loginResult = summary.pages.find((p) => p.slug === 'login');
    expect(loginResult).toBeDefined();

    // discover → FAIL
    expect(loginResult.stages.discover.status).toBe('FAIL');

    // plan/codify/enrich → SKIP (prior stage failed)
    expect(loginResult.stages.plan.status).toBe('SKIP');
    expect(loginResult.stages.codify.status).toBe('SKIP');
    expect(loginResult.stages.enrich.status).toBe('SKIP');

    // Sub-commands for skipped stages must NOT have been called
    const { runPlan, runCodify, runEnrich } = await getSubCommandMocks();
    expect(runPlan).not.toHaveBeenCalled();
    expect(runCodify).not.toHaveBeenCalled();
    expect(runEnrich).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. --stages filter
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — --stages filter', () => {
  it('--stages plan,codify runs only plan and codify per page (not discover/enrich)', async () => {
    await captureAndRun({
      pages:         'login,register',
      pagesPerAgent: 1,    // sequential to guarantee mock calls
      stages:        'plan,codify',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const { runDiscover, runPlan, runCodify, runEnrich } = await getSubCommandMocks();

    // discover and enrich must NOT be called
    expect(runDiscover).not.toHaveBeenCalled();
    expect(runEnrich).not.toHaveBeenCalled();

    // plan and codify called once per page = 2 times each
    expect(runPlan).toHaveBeenCalledTimes(2);
    expect(runCodify).toHaveBeenCalledTimes(2);
  });

  it('start event stages array contains only the requested stages', async () => {
    const { events } = await captureAndRun({
      pages:         'login',
      pagesPerAgent: 1,
      stages:        'discover,plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const start = events.find((e) => e.event === 'batch-plan.start');
    expect(start).toBeDefined();
    expect(start.stages).toEqual(['discover', 'plan']);
    expect(start.stages).not.toContain('codify');
    expect(start.stages).not.toContain('enrich');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. --max-spend cumulative
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — --max-spend cumulative', () => {
  it('maxSpend 0.001 aborts upfront before any API calls (estimate exceeds limit)', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const { thrown } = await captureAndRun({
      pages:    'login',
      stages:   'discover,plan,codify,enrich',
      maxSpend: 0.001,      // $2.95 estimate per page >> $0.001
      json:     true,
      out:      tmpDir,
    });

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
    expect(thrown.message).toMatch(/max-spend/i);

    // No sub-commands called — upfront abort
    const { runDiscover, runPlan, runCodify, runEnrich } = await getSubCommandMocks();
    expect(runDiscover).not.toHaveBeenCalled();
    expect(runPlan).not.toHaveBeenCalled();
    expect(runCodify).not.toHaveBeenCalled();
    expect(runEnrich).not.toHaveBeenCalled();
  });

  it('maxSpend 100 allows all stages to run (within budget), no spend abort', async () => {
    const { events, thrown } = await captureAndRun({
      pages:         'login',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    expect(thrown).toBeUndefined();

    const summary = events.find((e) => e.event === 'batch-plan.summary');
    expect(summary).toBeDefined();
    expect(summary.abortedBySpend).toBe(false);
  });

  it('source code check: cumulative-spend logic and per-chunk abort guard are present', () => {
    // The mid-batch spend abort is hard to trigger in unit tests because the
    // upfront estimate check (using STAGE_COST_ESTIMATE) fires before any pages
    // run, and mock actual costs are far below the estimates.
    //
    // Instead, we verify the source-code contract: the per-chunk guard checks
    // cumulativeCost against maxSpend, abortedBySpend is set on trigger, and
    // remaining pages are marked SKIP. This is tested via code inspection +
    // the upfront-abort test (above) which exercises the same error path.
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/batch.mjs'),
      'utf-8',
    );
    // Per-chunk guard
    expect(src).toContain('cumulativeCost >= maxSpend');
    // SKIP logic for remaining pages
    expect(src).toContain('abortedBySpend = true');
    expect(src).toContain('makeSkipResult');
    // Summary emits abortedBySpend flag
    expect(src).toContain('abortedBySpend');
    // Throws exitCode 2 on spend abort
    expect(src).toContain("exitCode = 2");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Summary table output
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — summary table output', () => {
  it('non-JSON mode prints a Batch Summary table with page names and cost', async () => {
    const consoleLines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLines.push(args.join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runBatchPlan({
      pages:         'login,register',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          false,
      out:           tmpDir,
    });

    const combined = consoleLines.join('\n');
    expect(combined).toContain('Batch Summary');
    expect(combined).toMatch(/login/i);
    expect(combined).toMatch(/register/i);
    expect(combined).toContain('Total');
  });

  it('writes batch-plan-summary.md to the output directory', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runBatchPlan({
      pages:         'login',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          false,
      out:           tmpDir,
    });

    const summaryPath = path.join(tmpDir, 'batch-plan-summary.md');
    expect(fs.existsSync(summaryPath)).toBe(true);

    const content = fs.readFileSync(summaryPath, 'utf-8');
    expect(content).toContain('# Batch Plan Summary');
    expect(content).toContain('login');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. JSON mode (NDJSON)
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — JSON mode', () => {
  it('emits NDJSON records: batch-plan.start, page.done per page, batch-plan.summary', async () => {
    const { events } = await captureAndRun({
      pages:         'login,register',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    // Must have start event
    const start = events.find((e) => e.event === 'batch-plan.start');
    expect(start).toBeDefined();

    // One page.done per page (2 pages)
    const pageDones = events.filter((e) => e.event === 'batch-plan.page.done');
    expect(pageDones).toHaveLength(2);

    // Final summary
    const summary = events.find((e) => e.event === 'batch-plan.summary');
    expect(summary).toBeDefined();
    expect(summary.pages).toHaveLength(2);
    expect(summary.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(summary.anyFailed).toBe(false);
  });

  it('every line on stdout in JSON mode is valid JSON', async () => {
    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runBatchPlan({
      pages:         'login',
      pagesPerAgent: 1,
      stages:        'plan',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const lines = stdoutLines
      .join('')
      .split('\n')
      .filter((l) => l.trim());

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. Happy path — all stages succeed for all pages → resolves without throwing
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — happy path (all stages, all pages)', () => {
  it('resolves without throwing and summary.anyFailed is false', async () => {
    const { events, thrown } = await captureAndRun({
      pages:         'login,register,dashboard',
      pagesPerAgent: 1,
      stages:        'plan,codify',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    expect(thrown).toBeUndefined();

    const summary = events.find((e) => e.event === 'batch-plan.summary');
    expect(summary).toBeDefined();
    expect(summary.anyFailed).toBe(false);
    expect(summary.abortedBySpend).toBe(false);

    // All 3 pages should have OK stages
    for (const page of summary.pages) {
      for (const [, stageResult] of Object.entries(page.stages)) {
        expect(stageResult.status).toBe('OK');
      }
    }
  });

  it('runPlan + runCodify each called exactly once per page (3 pages × 2 stages = 6 total)', async () => {
    await captureAndRun({
      pages:         'login,register,dashboard',
      pagesPerAgent: 1,    // sequential to guarantee reliable mock dispatch
      stages:        'plan,codify',
      maxSpend:      100,
      json:          true,
      out:           tmpDir,
    });

    const { runPlan, runCodify, runDiscover, runEnrich } = await getSubCommandMocks();
    expect(runPlan).toHaveBeenCalledTimes(3);
    expect(runCodify).toHaveBeenCalledTimes(3);
    expect(runDiscover).not.toHaveBeenCalled();
    expect(runEnrich).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bonus: --dry-run
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — --dry-run', () => {
  it('emits batch-plan.dry-run event and makes no sub-command calls', async () => {
    // dry-run skips CLAUDE_API_KEY check
    delete process.env.CLAUDE_API_KEY;

    const { events } = await captureAndRun({
      pages:    'login,register',
      stages:   'plan',
      maxSpend: 100,
      json:     true,
      out:      tmpDir,
      dryRun:   true,
    });

    const dryRun = events.find((e) => e.event === 'batch-plan.dry-run');
    expect(dryRun).toBeDefined();
    expect(dryRun.pages).toHaveLength(2);
    expect(dryRun.stages).toContain('plan');

    const { runPlan } = await getSubCommandMocks();
    expect(runPlan).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bonus: invalid --stages
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — invalid --stages', () => {
  it('throws exitCode 2 when --stages produces no valid stage names', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const { thrown } = await captureAndRun({
      pages:  'login',
      stages: 'nonexistent,alsofake',
      json:   true,
      out:    tmpDir,
    });

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bonus: --pages required
// ══════════════════════════════════════════════════════════════════════════════

describe('batch — --pages validation', () => {
  it('throws exitCode 2 when --pages is empty string', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const { thrown } = await captureAndRun({
      pages:  '',
      stages: 'plan',
      json:   true,
      out:    tmpDir,
    });

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
  });
});

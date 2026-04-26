// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/enrich.test.mjs
 *
 * Unit tests for `testnux enrich` (src/commands/enrich.mjs).
 *
 * All Anthropic API calls are mocked via vi.mock — no real API key required.
 * All file system side-effects write to a per-test temp directory.
 *
 * Mocking strategy note:
 *   enrich.mjs uses dynamic `import('@anthropic-ai/sdk')` inside runEnrich().
 *   vi.mock() hoisting intercepts this at module evaluation time. We register
 *   the mock before the first import of enrich.mjs so the factory applies.
 *
 *   enrich runs up to 3 sequential API calls (one per pass), so individual tests
 *   chain mockResolvedValueOnce() calls:
 *     mockMessageCreate
 *       .mockResolvedValueOnce(pass1Response)
 *       .mockResolvedValueOnce(pass2Response)
 *       .mockResolvedValueOnce(pass3Response)
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a mock Anthropic API response object with valid TC blocks.
 * @param {string} passPrefix  e.g. 'LOGIN-DR', 'LOGIN-QA', 'LOGIN-GC'
 * @param {number} tcCount
 * @param {object} usage
 */
function makeMockEnrichResponse(passPrefix, tcCount = 2, usage = { input_tokens: 2000, output_tokens: 1500 }) {
  const tcs = Array.from({ length: tcCount }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `## TC-${passPrefix}-${n} — Mock enriched test case ${n}

**Priority**: P1
**Category**: ACCESSIBILITY
**Standards**: WCAG 2.2 SC 1.4.3

**Given** the user is on the page
**When** they interact with element ${n}
**Then** the expected result occurs

**Pass criteria**:
- Criterion 1 for TC ${n}

> [VERIFY] Confirm behavior matches product specification before execution.
`;
  }).join('\n');

  return {
    id:            'msg_mock_enrich_001',
    type:          'message',
    role:          'assistant',
    content:       [{ type: 'text', text: tcs }],
    model:         'claude-sonnet-4-6',
    stop_reason:   'end_turn',
    stop_sequence: null,
    usage,
  };
}

/**
 * Builds a minimal valid test-plan.md for the given slug.
 */
function makeBasicTestPlan(slug = 'login', extraContent = '') {
  return `---
slug: ${slug}
generated_by: testnux discover v0.2
---

# Test Plan: ${slug}

## TC-01 — Basic happy path

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the user is on the ${slug} page
**When** they complete the primary action
**Then** the operation succeeds

> [VERIFY] Confirm behavior.

${extraContent}
`;
}

/**
 * Creates the testing-log folder structure expected by findTestPlanFile().
 * Returns the path to the created test-plan.md.
 */
function createTestPlanDir(testingLogRoot, slug, content) {
  const folderName = `2026-04-27_${slug}`;
  const dir = path.join(testingLogRoot, folderName);
  fs.mkdirSync(dir, { recursive: true });
  const planPath = path.join(dir, 'test-plan.md');
  fs.writeFileSync(planPath, content, 'utf-8');
  return planPath;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrich-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  // restoreAllMocks restores any vi.spyOn() spies to their original implementations.
  // Without this, process.stdout.write spies from one test bleed into the next.
  vi.restoreAllMocks();
  delete process.env.CLAUDE_API_KEY;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ── Import runEnrich after mocks ──────────────────────────────────────────────

const { runEnrich } = await import('../src/commands/enrich.mjs');

// ══════════════════════════════════════════════════════════════════════════════
// 1. Missing CLAUDE_API_KEY
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — missing CLAUDE_API_KEY', () => {
  it('throws exitCode 1 when CLAUDE_API_KEY is not set and test-plan.md exists', async () => {
    delete process.env.CLAUDE_API_KEY;

    // We need a test-plan.md to exist — otherwise the file-not-found error fires first
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    let thrown;
    try {
      await runEnrich('login', { folder: tmpDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/CLAUDE_API_KEY/i);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('error message mentions console.anthropic.com', async () => {
    delete process.env.CLAUDE_API_KEY;
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    const errorLines = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorLines.push(args.join(' '));
    });

    try {
      await runEnrich('login', { folder: tmpDir, json: false });
    } catch {
      // expected
    }

    expect(errorLines.join('')).toContain('console.anthropic.com');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Missing @anthropic-ai/sdk — source-inspection test
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — missing @anthropic-ai/sdk guard (source inspection)', () => {
  it('source code contains ERR_MODULE_NOT_FOUND guard with install hint', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/enrich.mjs'),
      'utf-8',
    );
    expect(src).toContain('ERR_MODULE_NOT_FOUND');
    expect(src).toContain('npm install @anthropic-ai/sdk');
  });

  it('source code uses dynamic import() for @anthropic-ai/sdk (not static)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/enrich.mjs'),
      'utf-8',
    );
    expect(src).toContain("import('@anthropic-ai/sdk')");
    // No top-level static import of the SDK
    expect(src).not.toMatch(/^import\s+.*@anthropic-ai\/sdk/m);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Missing test-plan.md for slug
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — missing test-plan.md', () => {
  it('throws exitCode 1 with helpful message when no test-plan.md exists', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';

    let thrown;
    try {
      // tmpDir has no testing-log subfolders at all
      await runEnrich('login', { folder: tmpDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/test-plan\.md not found/i);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('error message includes testnux init suggestion', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';

    const errorLines = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorLines.push(args.join(' '));
    });

    try {
      await runEnrich('login', { folder: tmpDir, json: false });
    } catch {
      // expected
    }

    expect(errorLines.join('')).toContain('testnux init');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. --dry-run: all 3 pass prompts printed, no API calls
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — --dry-run', () => {
  it('prints SYSTEM PROMPT / USER PROMPT for all 3 passes, no API calls', async () => {
    // dry-run skips the CLAUDE_API_KEY check
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    const consoleLines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLines.push(args.join(' '));
    });

    await runEnrich('login', { folder: tmpDir, dryRun: true, json: false });

    expect(mockMessageCreate).not.toHaveBeenCalled();
    const combined = consoleLines.join('\n');
    expect(combined).toContain('SYSTEM PROMPT');
    expect(combined).toContain('USER PROMPT');
    expect(combined).toContain('DRY-RUN COMPLETE');
    // All 3 passes should appear
    expect(combined).toContain('design-review');
    expect(combined).toContain('qa-structural');
    expect(combined).toContain('graph-context');
  });

  it('--dry-run with --json emits one enrich.dry-run event per pass', async () => {
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runEnrich('login', { folder: tmpDir, dryRun: true, json: true });

    expect(mockMessageCreate).not.toHaveBeenCalled();

    const events = stdoutLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const dryRunEvents = events.filter((e) => e.event === 'enrich.dry-run');
    expect(dryRunEvents).toHaveLength(3);

    const passes = dryRunEvents.map((e) => e.pass);
    expect(passes).toContain('design-review');
    expect(passes).toContain('qa-structural');
    expect(passes).toContain('graph-context');

    // Each event should have cost estimate
    for (const ev of dryRunEvents) {
      expect(ev.costEstimateUsd).toBeGreaterThan(0);
      expect(ev).toHaveProperty('systemPrompt');
      expect(ev).toHaveProperty('userPrompt');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. --pass design-review only — exactly 1 API call, marker block written
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — --pass design-review', () => {
  it('makes exactly 1 API call and writes design-review marker block', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    const planPath = createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    mockMessageCreate.mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-DR', 2));

    await runEnrich('login', { folder: tmpDir, pass: 'design-review', json: false });

    expect(mockMessageCreate).toHaveBeenCalledTimes(1);

    const written = fs.readFileSync(planPath, 'utf-8');
    expect(written).toContain('<!-- testnux:enrich:design-review begin -->');
    expect(written).toContain('<!-- testnux:enrich:design-review end -->');
    // qa-structural and graph-context markers should NOT be present
    expect(written).not.toContain('testnux:enrich:qa-structural');
    expect(written).not.toContain('testnux:enrich:graph-context');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. --pass all (default) — 3 sequential API calls, all 3 marker blocks
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — --pass all (default)', () => {
  it('makes 3 sequential API calls and writes all 3 marker blocks', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    const planPath = createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    mockMessageCreate
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-DR', 2, { input_tokens: 2000, output_tokens: 1000 }))
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-QA', 3, { input_tokens: 2500, output_tokens: 1200 }))
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-GC', 2, { input_tokens: 3000, output_tokens: 1100 }));

    await runEnrich('login', { folder: tmpDir, pass: 'all', json: false });

    expect(mockMessageCreate).toHaveBeenCalledTimes(3);

    const written = fs.readFileSync(planPath, 'utf-8');
    expect(written).toContain('<!-- testnux:enrich:design-review begin -->');
    expect(written).toContain('<!-- testnux:enrich:design-review end -->');
    expect(written).toContain('<!-- testnux:enrich:qa-structural begin -->');
    expect(written).toContain('<!-- testnux:enrich:qa-structural end -->');
    expect(written).toContain('<!-- testnux:enrich:graph-context begin -->');
    expect(written).toContain('<!-- testnux:enrich:graph-context end -->');
  });

  it('emits enrich.done JSON event with totalTCs, passesRun, and costUsd after all 3 passes', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    mockMessageCreate
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-DR', 2))
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-QA', 3))
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-GC', 2));

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runEnrich('login', { folder: tmpDir, pass: 'all', json: true });

    const events = stdoutLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const done = events.find((e) => e.event === 'enrich.done');
    expect(done).toBeDefined();
    expect(done.slug).toBe('login');
    expect(done.passesRun).toEqual(['design-review', 'qa-structural', 'graph-context']);
    expect(done.totalTCs).toBe(7); // 2 + 3 + 2
    expect(done.totalCostUsd).toBeGreaterThan(0);
    expect(done.testPlanFile).toContain('test-plan.md');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Marker block REPLACE on rerun (no duplication)
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — marker block REPLACE on rerun', () => {
  it('replaces existing design-review marker block instead of duplicating it', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';

    const existingMarkerBlock = `<!-- testnux:enrich:design-review begin -->
<!-- Generated: 2026-04-26T10:00:00.000Z by testnux enrich pass=design-review -->
<!-- All cells in this block carry [VERIFY] markers; review before treating as canonical -->

## TC-LOGIN-DR-01 — Old accessibility test

**Priority**: P2
**Category**: ACCESSIBILITY

**Given** old precondition
**When** old action
**Then** old outcome

> [VERIFY] Old verify notice.

<!-- testnux:enrich:design-review end -->
`;

    const planContent = makeBasicTestPlan('login') + '\n' + existingMarkerBlock;
    const planPath = createTestPlanDir(tmpDir, 'login', planContent);

    mockMessageCreate.mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-DR', 2));

    await runEnrich('login', { folder: tmpDir, pass: 'design-review', json: false });

    const written = fs.readFileSync(planPath, 'utf-8');

    // The OLD content from inside the block must be gone
    expect(written).not.toContain('Old accessibility test');
    expect(written).not.toContain('Old verify notice');

    // Exactly ONE begin/end pair — not two
    const beginCount = (written.match(/<!-- testnux:enrich:design-review begin -->/g) ?? []).length;
    const endCount   = (written.match(/<!-- testnux:enrich:design-review end -->/g) ?? []).length;
    expect(beginCount).toBe(1);
    expect(endCount).toBe(1);

    // New content is present
    expect(written).toContain('LOGIN-DR-01');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Append-only outside markers — content outside preserved
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — append-only outside markers', () => {
  it('preserves TC content OUTSIDE marker blocks after enrichment', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';

    const humanTc = `## TC-HUMAN-01 — Human-authored test case

**Priority**: P0
**Category**: FUNCTIONAL

**Given** the user is authenticated
**When** they perform the critical action
**Then** the system responds correctly

> [VERIFY] Manually validated 2026-04-27.
`;

    const planPath = createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login', humanTc));

    mockMessageCreate.mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-DR', 2));

    await runEnrich('login', { folder: tmpDir, pass: 'design-review', json: false });

    const written = fs.readFileSync(planPath, 'utf-8');

    // Original human TC must be untouched
    expect(written).toContain('TC-HUMAN-01');
    expect(written).toContain('Human-authored test case');
    expect(written).toContain('Manually validated 2026-04-27');

    // Enriched content is ALSO present
    expect(written).toContain('<!-- testnux:enrich:design-review begin -->');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. --max-spend guard: aborts before first API call when estimate exceeds limit
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — --max-spend enforcement', () => {
  it('throws exitCode 1 before any API call when maxSpend is 0 (always exceeded)', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    // maxSpend: 0 means ANY estimate will exceed it
    let thrown;
    try {
      await runEnrich('login', {
        folder:   tmpDir,
        pass:     'all',
        maxSpend: 0,
        json:     false,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/max-spend/i);
    // No API call made — the guard fires before the first pass
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('proceeds to run all passes when maxSpend is generous (999)', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    mockMessageCreate
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-DR', 2))
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-QA', 2))
      .mockResolvedValueOnce(makeMockEnrichResponse('LOGIN-GC', 2));

    // Should succeed without throwing
    await runEnrich('login', {
      folder:   tmpDir,
      pass:     'all',
      maxSpend: 999,
      json:     false,
    });

    expect(mockMessageCreate).toHaveBeenCalledTimes(3);
  });

  it('source code check: cumulative max-spend is applied before each pass call', () => {
    // Verify the guard logic by inspecting the source — ensures the abort
    // happens before the API call (not after charging the API).
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/enrich.mjs'),
      'utf-8',
    );
    // The guard compares cumulative cost + estimate against maxSpend
    expect(src).toContain('cumulativeCost + costEst');
    expect(src).toContain('maxSpend');
    // The guard fires BEFORE `callClaude`
    const guardIdx    = src.indexOf('cumulativeCost + costEst');
    const callClaudeIdx = src.indexOf('callClaude(');
    expect(guardIdx).toBeLessThan(callClaudeIdx);
    // Pass-1 output is written before pass-2 estimate check
    expect(src).toContain('completedPasses++');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. graph-context with no sibling test-plan.md files — graceful fallback
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — graph-context with no sibling plans', () => {
  it('runs graph-context pass gracefully when no sibling test-plan.md files exist', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    const planPath = createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    // Only one page dir exists (login) — no siblings
    mockMessageCreate.mockResolvedValueOnce(
      makeMockEnrichResponse('LOGIN-GC', 2, { input_tokens: 3000, output_tokens: 1000 }),
    );

    await runEnrich('login', { folder: tmpDir, pass: 'graph-context', json: false });

    expect(mockMessageCreate).toHaveBeenCalledTimes(1);

    // Verify prompt mentions no siblings
    const callArgs   = mockMessageCreate.mock.calls[0][0];
    const userPrompt = callArgs.messages[0].content;
    expect(userPrompt).toMatch(/No adjacent test plan|No adjacent test-plan/i);

    // Output file should have graph-context marker
    const written = fs.readFileSync(planPath, 'utf-8');
    expect(written).toContain('<!-- testnux:enrich:graph-context begin -->');
    expect(written).toContain('<!-- testnux:enrich:graph-context end -->');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. [VERIFY] auto-injection — TCs missing [VERIFY] get it appended
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — [VERIFY] auto-injection', () => {
  it('appends [VERIFY] to TC blocks that the LLM omitted it from', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    const planPath = createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    // Craft a response with one TC missing [VERIFY]
    const responseWithMissingVerify = `## TC-LOGIN-DR-01 — Test case with VERIFY

**Priority**: P1
**Category**: ACCESSIBILITY

**Given** the user is on the login page
**When** they tab through fields
**Then** all fields receive visible focus rings

> [VERIFY] Confirm behavior.

## TC-LOGIN-DR-02 — Test case WITHOUT verify marker

**Priority**: P1
**Category**: VISUAL

**Given** the page loads at 320px viewport
**When** rendered without horizontal scrollbar
**Then** all content is visible

`;

    mockMessageCreate.mockResolvedValueOnce({
      id:            'msg_mock',
      type:          'message',
      role:          'assistant',
      content:       [{ type: 'text', text: responseWithMissingVerify }],
      model:         'claude-sonnet-4-6',
      stop_reason:   'end_turn',
      stop_sequence: null,
      usage:         { input_tokens: 1000, output_tokens: 500 },
    });

    await runEnrich('login', { folder: tmpDir, pass: 'design-review', json: false });

    const written = fs.readFileSync(planPath, 'utf-8');

    // Both TC blocks in the enriched section should now have [VERIFY]
    // Extract just the marker block content
    const beginMarker = '<!-- testnux:enrich:design-review begin -->';
    const endMarker   = '<!-- testnux:enrich:design-review end -->';
    const blockStart  = written.indexOf(beginMarker);
    const blockEnd    = written.indexOf(endMarker) + endMarker.length;
    const markerBlock = written.slice(blockStart, blockEnd);

    const verifyCount = (markerBlock.match(/\[VERIFY\]/g) ?? []).length;
    // TC-DR-01 already had it, TC-DR-02 should now have it appended
    expect(verifyCount).toBeGreaterThanOrEqual(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. Mock parse error — exitCode 3, raw response saved
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — LLM parse error', () => {
  it('throws exitCode 3 and saves a .raw.txt file when LLM returns no TC headings', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    const planPath = createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    const garbledResponse = 'I apologize, but I am unable to generate test cases for this page at this time.';

    mockMessageCreate.mockResolvedValueOnce({
      id:            'msg_mock_parse_err',
      type:          'message',
      role:          'assistant',
      content:       [{ type: 'text', text: garbledResponse }],
      model:         'claude-sonnet-4-6',
      stop_reason:   'end_turn',
      stop_sequence: null,
      usage:         { input_tokens: 500, output_tokens: 100 },
    });

    // Suppress console.error output from the error handler
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown;
    try {
      await runEnrich('login', { folder: tmpDir, pass: 'design-review', json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(3);

    // Raw response saved adjacent to test-plan.md
    const planDir = path.dirname(planPath);
    const rawFile = path.join(planDir, 'enrich-design-review.raw.txt');
    expect(fs.existsSync(rawFile)).toBe(true);
    expect(fs.readFileSync(rawFile, 'utf-8')).toBe(garbledResponse);
  });

  it('empty LLM response → exitCode 3 + raw file saved', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    const planPath = createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    mockMessageCreate.mockResolvedValueOnce({
      id:            'msg_mock_empty',
      type:          'message',
      role:          'assistant',
      content:       [{ type: 'text', text: '' }],
      model:         'claude-sonnet-4-6',
      stop_reason:   'end_turn',
      stop_sequence: null,
      usage:         { input_tokens: 500, output_tokens: 0 },
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown;
    try {
      await runEnrich('login', { folder: tmpDir, pass: 'design-review', json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(3);

    const planDir = path.dirname(planPath);
    const rawFile = path.join(planDir, 'enrich-design-review.raw.txt');
    expect(fs.existsSync(rawFile)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bonus: API 429 rate limit
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — API 429 rate limit', () => {
  it('throws exitCode 2 when the API returns 429 on pass design-review', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    mockMessageCreate.mockRejectedValueOnce(
      Object.assign(new Error('Rate limit exceeded'), { status: 429 }),
    );

    vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown;
    try {
      await runEnrich('login', { folder: tmpDir, pass: 'design-review', json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bonus: graph-context sibling plans are included in the prompt
// ══════════════════════════════════════════════════════════════════════════════

describe('enrich — graph-context WITH sibling plans', () => {
  it('includes sibling test-plan.md content in the graph-context user prompt', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test';

    // Create login test plan
    createTestPlanDir(tmpDir, 'login', makeBasicTestPlan('login'));

    // Create a sibling register test plan
    const registerDir = path.join(tmpDir, '2026-04-27_register');
    fs.mkdirSync(registerDir, { recursive: true });
    fs.writeFileSync(
      path.join(registerDir, 'test-plan.md'),
      makeBasicTestPlan('register', '## TC-REG-01 — Register unique marker'),
      'utf-8',
    );

    mockMessageCreate.mockResolvedValueOnce(
      makeMockEnrichResponse('LOGIN-GC', 2),
    );

    vi.spyOn(console, 'error').mockImplementation(() => {});

    await runEnrich('login', { folder: tmpDir, pass: 'graph-context', json: false });

    const callArgs   = mockMessageCreate.mock.calls[0][0];
    const userPrompt = callArgs.messages[0].content;

    // The sibling content (or its slug) should appear in the prompt
    expect(userPrompt).toMatch(/register/i);
  });
});

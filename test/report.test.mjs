// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/report.test.mjs
 *
 * Unit + integration tests for the P1 report generator.
 *
 * Unit tests: import parsers/renderers directly.
 * Integration tests: use runReport() against a temp folder.
 *
 * 12 test cases covering all scenarios specified in Wave 2 brief.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';

import { parseTestPlanContent } from '../src/parsers/test-plan.mjs';
import { parseExecutionLogContent, mergeExecutionResults, normalizeStatus } from '../src/parsers/execution-log.mjs';
import { buildXlsx, writeXlsx } from '../src/renderers/xlsx.mjs';
import { buildHtml } from '../src/renderers/html.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal test-plan.md string with N test cases in the matrix + sections. */
function makeTestPlan(tcs = [], opts = {}) {
  const { extraTable = '' } = opts;

  const frontmatter = [
    '---',
    'slug: test-surface',
    'version: 1.0',
    'industry: fintech',
    'status: DRAFT',
    'industry_standards:',
    '  - OWASP ASVS 2.1.1',
    '  - SOC 2 CC6',
    '---',
    '',
    '# Test Plan',
    '',
  ].join('\n');

  const headerRow = '| TC ID | Title | Priority | What it verifies | Status |';
  const sepRow    = '|-------|-------|----------|------------------|--------|';
  const rows = tcs.map((tc) =>
    `| ${tc.id} | ${tc.title} | ${tc.priority ?? 'P1'} | ${tc.verifies ?? 'Functional check'} | ${tc.status ?? 'DRAFT'} |`
  );

  const table = [headerRow, sepRow, ...rows].join('\n');

  const sections = tcs.map((tc) => [
    `## ${tc.id} — ${tc.title}`,
    '',
    `**Priority:** ${tc.priority ?? 'P1'}`,
    `**TC type:** prescribed`,
    '**R-IDs:** R-01',
    '',
    '**Given** the system is configured',
    `**When** the tester runs ${tc.id}`,
    '**Then** the expected outcome is observed',
    '**Pass criteria:** Expected outcome observed.',
    '',
  ].join('\n')).join('\n');

  return frontmatter + table + '\n\n' + sections + (extraTable ? '\n\n' + extraTable : '');
}

/** Build a minimal execution-log.md with N results. */
function makeExecutionLog(results = []) {
  const header = '| TC ID | Status | Result Notes |';
  const sep    = '|-------|--------|--------------|';
  const rows = results.map((r) => `| ${r.id} | ${r.status} | ${r.notes ?? ''} |`);
  return [header, sep, ...rows].join('\n');
}

/** Create a temp surface folder with the given files. */
function makeSurfaceDir(tmpDir, slug, files = {}) {
  const folder = path.join(tmpDir, `2026-04-27_${slug}`);
  fs.mkdirSync(folder, { recursive: true });

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(folder, name), content, 'utf-8');
  }

  return folder;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Import runReport after setup ──────────────────────────────────────────────

const { runReport } = await import('../src/commands/report.mjs');

// ══════════════════════════════════════════════════════════════════════════════
// Test 1 — parseTestPlanContent: valid frontmatter + 3-row matrix + 3 per-TC sections
// ══════════════════════════════════════════════════════════════════════════════

describe('parseTestPlanContent — TC-RPT-01: 3-TC test plan parses to 3 TcRecords', () => {
  it('tcs.length === 3 and each TC has id, title, priority', () => {
    const content = makeTestPlan([
      { id: 'LOGIN-01', title: 'Happy path login', priority: 'P0' },
      { id: 'LOGIN-02', title: 'Wrong password error', priority: 'P1' },
      { id: 'LOGIN-03', title: 'Rate limit lockout', priority: 'P1' },
    ]);

    const { tcs, frontmatter } = parseTestPlanContent(content);

    expect(tcs).toHaveLength(3);
    expect(tcs[0].id).toBe('LOGIN-01');
    expect(tcs[1].id).toBe('LOGIN-02');
    expect(tcs[2].id).toBe('LOGIN-03');

    expect(tcs[0].priority).toBe('P0');
    expect(frontmatter.slug).toBe('test-surface');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 2 — parseTestPlanContent: secondary Standards Alignment table does not produce duplicate IDs
// ══════════════════════════════════════════════════════════════════════════════

describe('parseTestPlanContent — TC-RPT-02: secondary table with TC-ID column does not create duplicate IDs', () => {
  it('no duplicate TC-IDs when standards-alignment table also has a TC-ID column', () => {
    // A secondary "Standards Alignment" table that also contains a TC ID column
    // (e.g. from the test-plan template) — this should NOT be treated as the matrix.
    const secondaryTable = [
      '## Standards Alignment',
      '',
      '| TC ID | Standard | Control |',
      '|-------|----------|---------|',
      '| LOGIN-01 | OWASP ASVS 2.1.1 | V2 |',
      '| LOGIN-02 | SOC 2 CC6 | CC6.1 |',
    ].join('\n');

    const content = makeTestPlan([
      { id: 'LOGIN-01', title: 'Happy path login', priority: 'P0' },
      { id: 'LOGIN-02', title: 'Wrong password error', priority: 'P1' },
    ], { extraTable: secondaryTable });

    const { tcs } = parseTestPlanContent(content);

    const ids = tcs.map((t) => t.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids).toEqual(uniqueIds); // no duplicates
    expect(tcs).toHaveLength(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 3 — parseExecutionLogContent: emoji statuses normalize correctly
// ══════════════════════════════════════════════════════════════════════════════

describe('parseExecutionLogContent — TC-RPT-03: emoji status normalization', () => {
  it('normalizeStatus maps emoji prefixed values to canonical form', () => {
    expect(normalizeStatus('✅ PASS')).toBe('PASS');
    expect(normalizeStatus('❌ FAIL')).toBe('FAIL');
    expect(normalizeStatus('⏸ BLOCKED-CONFIG')).toBe('BLOCKED-CONFIG');
    expect(normalizeStatus('⏭ SKIPPED')).toBe('SKIPPED');
    expect(normalizeStatus('⏸ BLOCKED-IMPLEMENTATION')).toBe('BLOCKED-IMPLEMENTATION');
  });

  it('parseExecutionLogContent parses emoji-prefixed status column', () => {
    const log = [
      '| TC ID | Status | Notes |',
      '|-------|--------|-------|',
      '| LOGIN-01 | ✅ PASS | Passed fine |',
      '| LOGIN-02 | ❌ FAIL | Error on step 3 |',
    ].join('\n');

    const results = parseExecutionLogContent(log);
    expect(results.find((r) => r.id === 'LOGIN-01').status).toBe('PASS');
    expect(results.find((r) => r.id === 'LOGIN-02').status).toBe('FAIL');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 4 — mergeExecutionResults: 5 TCs in plan, 3 in log
// ══════════════════════════════════════════════════════════════════════════════

describe('mergeExecutionResults — TC-RPT-04: 5 plan TCs / 3 execution results', () => {
  it('matched TCs get result status; unmatched TCs keep DRAFT status', () => {
    const tcs = [
      { id: 'TC-01', title: 'TC 1', priority: 'P0', status: 'DRAFT' },
      { id: 'TC-02', title: 'TC 2', priority: 'P1', status: 'DRAFT' },
      { id: 'TC-03', title: 'TC 3', priority: 'P1', status: 'DRAFT' },
      { id: 'TC-04', title: 'TC 4', priority: 'P2', status: 'DRAFT' },
      { id: 'TC-05', title: 'TC 5', priority: 'P2', status: 'DRAFT' },
    ];

    const results = [
      { id: 'TC-01', status: 'PASS', statusRaw: 'PASS', actual: 'Passed', executionNotes: '', duration: '' },
      { id: 'TC-02', status: 'FAIL', statusRaw: 'FAIL', actual: 'Failed', executionNotes: '', duration: '' },
      { id: 'TC-03', status: 'SKIPPED', statusRaw: 'SKIPPED', actual: '', executionNotes: '', duration: '' },
    ];

    const merged = mergeExecutionResults(tcs, results);

    expect(merged).toHaveLength(5);
    expect(merged.find((t) => t.id === 'TC-01').status).toBe('PASS');
    expect(merged.find((t) => t.id === 'TC-02').status).toBe('FAIL');
    expect(merged.find((t) => t.id === 'TC-03').status).toBe('SKIPPED');
    // Plan-only TCs keep their original status
    expect(merged.find((t) => t.id === 'TC-04').status).toBe('DRAFT');
    expect(merged.find((t) => t.id === 'TC-05').status).toBe('DRAFT');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 5 — writeXlsx: produces valid XLSX with 2 sheets; P0 cell has red fill
// ══════════════════════════════════════════════════════════════════════════════

describe('writeXlsx — TC-RPT-05: valid XLSX with 2 named sheets + P0 red fill', () => {
  it('writes a parseable XLSX with "TC Matrix" and "Standards Alignment" sheets', async () => {
    const tcs = [
      {
        id: 'TC-01', title: 'P0 test', priority: 'P0', category: 'Auth — Happy Path',
        status: 'FAIL', rIds: ['R-01'], standards: ['OWASP ASVS 2.1.1', 'SOC 2 CC6'],
        verifies: 'Login works', notes: '', evidence: null,
      },
      {
        id: 'TC-02', title: 'P1 test', priority: 'P1', category: 'General',
        status: 'PASS', rIds: [], standards: ['OWASP ASVS 2.1.1'],
        verifies: 'Form validates', notes: '', evidence: null,
      },
    ];

    const xlsxPath = path.join(tmpDir, 'test-output.xlsx');
    await writeXlsx(tcs, xlsxPath, { slug: 'my-surface', planOnly: false });

    expect(fs.existsSync(xlsxPath)).toBe(true);

    // Read it back with ExcelJS to inspect sheet names and P0 fill
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);

    const sheetNames = wb.worksheets.map((ws) => ws.name);
    expect(sheetNames).toContain('TC Matrix');
    expect(sheetNames).toContain('Standards Alignment');

    // Find the TC Matrix sheet and check the P0 row's Priority cell has red fill
    const matrixSheet = wb.getWorksheet('TC Matrix');
    let foundRedFill = false;
    matrixSheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (
          cell.value === 'P0' &&
          cell.fill?.fgColor?.argb === 'FFFEE2E2' // red-50
        ) {
          foundRedFill = true;
        }
      });
    });
    expect(foundRedFill).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 6 — buildHtml plan-only: contains "PLAN ONLY" banner, no PASS/FAIL badges
// ══════════════════════════════════════════════════════════════════════════════

describe('buildHtml — TC-RPT-06: plan-only mode', () => {
  it('renders "PLAN ONLY" banner and omits PASS/FAIL status badges', () => {
    const tcs = [
      { id: 'TC-01', title: 'Test one', priority: 'P1', category: 'General', status: 'DRAFT',
        rIds: [], standards: [], verifies: '', setup: '', given: '', when: '', then: '',
        passCriteria: '', notes: '', tcType: 'prescribed' },
    ];

    const html = buildHtml(tcs, { slug: 'my-plan', planOnly: true });

    expect(html).toContain('PLAN ONLY');
    // plan-only mode omits status badges (the statusBadge function is not called)
    expect(html).not.toContain('class="badge status-badge"');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 7 — buildHtml: TC anchor IDs appear EXACTLY ONCE (duplicate-ID regression guard)
// ══════════════════════════════════════════════════════════════════════════════

describe('buildHtml — TC-RPT-07: no duplicate anchor IDs', () => {
  it('each tc-<ID> anchor ID appears exactly once in the full HTML output', () => {
    const tcs = [
      { id: 'TC-01', title: 'First', priority: 'P1', category: 'General', status: 'PASS',
        rIds: [], standards: [], verifies: '', setup: '', given: '', when: '', then: '',
        passCriteria: '', notes: '', tcType: 'prescribed' },
      { id: 'TC-02', title: 'Second', priority: 'P1', category: 'General', status: 'FAIL',
        rIds: [], standards: [], verifies: '', setup: '', given: '', when: '', then: '',
        passCriteria: '', notes: '', tcType: 'prescribed' },
    ];

    const html = buildHtml(tcs, { slug: 'dup-check', planOnly: false });

    for (const tc of tcs) {
      const anchorId = `id="tc-${tc.id}"`;
      const occurrences = (html.match(new RegExp(anchorId, 'g')) ?? []).length;
      expect(occurrences).toBe(1);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 8 — runReport: missing test-plan.md → error event on stdout
// ══════════════════════════════════════════════════════════════════════════════

describe('runReport — TC-RPT-08: missing test-plan.md emits error event', () => {
  it('emits report.error JSON event when test-plan.md is absent', async () => {
    const folder = makeSurfaceDir(tmpDir, 'no-plan');
    // No test-plan.md written

    const jsonLines = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      jsonLines.push(String(chunk));
      return origWrite(chunk, ...rest);
    };

    // Spy on process.exit to prevent actual process termination.
    // Throw a sentinel so runReport stops at the exit point.
    const SENTINEL = '__test_exit_sentinel__';
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error(SENTINEL);
    });

    try {
      await runReport(folder, { json: true });
    } catch (err) {
      if (!err.message.includes(SENTINEL)) throw err; // re-throw unexpected errors
    } finally {
      process.stdout.write = origWrite;
      exitSpy.mockRestore();
    }

    const events = jsonLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const errEvent = events.find((e) => e.event === 'report.error');
    expect(errEvent).toBeDefined();
    expect(errEvent.message).toMatch(/missing required file|test-plan\.md/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 9 — runReport --fail-on-missing: no execution log + no evidence → error event
// ══════════════════════════════════════════════════════════════════════════════

describe('runReport — TC-RPT-09: --fail-on-missing with no evidence + no log emits error', () => {
  it('emits report.error JSON event when failOnMissing=true and both log and evidence/ are absent', async () => {
    const content = makeTestPlan([
      { id: 'TC-01', title: 'One', priority: 'P1' },
    ]);

    const folder = makeSurfaceDir(tmpDir, 'fail-missing', {
      'test-plan.md': content,
    });
    // No execution log, no evidence/

    const jsonLines = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      jsonLines.push(String(chunk));
      return origWrite(chunk, ...rest);
    };

    const SENTINEL = '__test_exit_sentinel__';
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error(SENTINEL);
    });

    try {
      await runReport(folder, { json: true, failOnMissing: true });
    } catch (err) {
      if (!err.message.includes(SENTINEL)) throw err;
    } finally {
      process.stdout.write = origWrite;
      exitSpy.mockRestore();
    }

    const events = jsonLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const errEvent = events.find((e) => e.event === 'report.error');
    expect(errEvent).toBeDefined();
    expect(errEvent.message).toMatch(/fail-on-missing|execution-log|evidence/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 10 — runReport --json: final NDJSON line has event:'report.done' with tcCount etc
// ══════════════════════════════════════════════════════════════════════════════

describe('runReport — TC-RPT-10: --json mode emits report.done event', () => {
  it('last JSON event has event:"report.done" with tcCount, xlsxPath, htmlPath', async () => {
    const tcsSpec = [
      { id: 'LOGIN-01', title: 'Happy path', priority: 'P0' },
      { id: 'LOGIN-02', title: 'Wrong password', priority: 'P1' },
    ];

    const content = makeTestPlan(tcsSpec);
    const execLog = makeExecutionLog([
      { id: 'LOGIN-01', status: 'PASS', notes: 'OK' },
      { id: 'LOGIN-02', status: 'FAIL', notes: 'Error 401' },
    ]);

    const folder = makeSurfaceDir(tmpDir, 'json-done', {
      'test-plan.md': content,
      'execution-log.md': execLog,
    });

    const jsonLines = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      jsonLines.push(String(chunk));
      return origWrite(chunk, ...rest);
    };

    try {
      await runReport(folder, { json: true });
    } finally {
      process.stdout.write = origWrite;
    }

    const events = jsonLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const done = events.find((e) => e.event === 'report.done');
    expect(done).toBeDefined();
    expect(done.tcCount).toBe(2);
    expect(done.xlsxPath).toContain('.xlsx');
    expect(done.htmlPath).toContain('.html');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 11 — buildHtml XSS sanitization
// ══════════════════════════════════════════════════════════════════════════════

describe('buildHtml — TC-RPT-11: XSS sanitization of TC title', () => {
  it('<script>alert(1)</script> in TC title does not appear in rendered HTML', () => {
    const tcs = [
      {
        id: 'TC-XSS-01',
        title: '<script>alert(1)</script>',
        priority: 'P1',
        category: 'General',
        status: 'PASS',
        rIds: [],
        standards: [],
        verifies: '',
        setup: '',
        given: '',
        when: '',
        then: '',
        passCriteria: '',
        notes: '',
        tcType: 'prescribed',
      },
    ];

    const html = buildHtml(tcs, { slug: 'xss-test', planOnly: false });

    // The raw <script> tag must not appear in output
    expect(html).not.toContain('<script>alert(1)</script>');
    // DOMPurify / attr() should have escaped or removed it entirely
    expect(html).not.toContain('alert(1)');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Test 12 — performance: 30-TC test plan generates in < 10 seconds
// ══════════════════════════════════════════════════════════════════════════════

describe('buildHtml — TC-RPT-12: performance — 30 TCs under 10 seconds', () => {
  it('generates HTML for 30 TCs in < 10 000 ms', async () => {
    // Build 30 TCs programmatically
    const tcs = Array.from({ length: 30 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {
        id: `PERF-${n}`,
        title: `Performance test case ${n}`,
        priority: ['P0', 'P1', 'P2'][i % 3],
        category: 'General',
        status: ['PASS', 'FAIL', 'SKIPPED', 'DRAFT'][i % 4],
        rIds: [`R-${n}`],
        standards: ['OWASP ASVS 2.1.1', 'SOC 2 CC6'],
        verifies: `Verify that case ${n} works as expected`,
        setup: 'Open the application',
        given: 'The system is in initial state',
        when: `The tester performs action for TC-${n}, then navigates to the next step`,
        then: `Expected outcome is observable. The UI reflects the correct state.`,
        passCriteria: 'All acceptance criteria are met.',
        notes: `Regression added ${n} days ago.`,
        tcType: 'prescribed',
        actual: i % 2 === 0 ? 'Observed correct behavior' : '',
        executionNotes: `Tester notes for ${n}`,
        duration: `${(Math.random() * 3).toFixed(1)} s`,
      };
    });

    const start = Date.now();
    const html = buildHtml(tcs, { slug: 'perf-test', planOnly: false });
    const elapsed = Date.now() - start;

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('PERF-01');
    expect(html).toContain('PERF-30');
    expect(elapsed).toBeLessThan(10_000);
  }, 15_000); // 15s timeout for headroom
});

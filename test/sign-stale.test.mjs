// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/sign-stale.test.mjs
 *
 * Unit tests for src/commands/sign-stale.mjs — stale-check for UAT sign-off entries.
 *
 * parseThreshold is exported directly for pure-function unit testing.
 * runSignStaleCheck integration tests use a temp dir per test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { parseThreshold, runSignStaleCheck } from '../src/commands/sign-stale.mjs';
import { appendEntry } from '../src/lib/uat-log.mjs';

// ── Constants ─────────────────────────────────────────────────────────────────

const SECRET = 'test-stale-secret-do-not-use';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Temp dir helpers ──────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-stale-test-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a surface folder with uat-log.jsonl entries whose timestamps are
 * artificially set to `daysAgo` days in the past.
 */
function makeSurfaceWithStaleEntries(surfaceName, entries) {
  const surfaceDir = path.join(tmpDir, surfaceName);
  fs.mkdirSync(surfaceDir, { recursive: true });
  const logPath = path.join(surfaceDir, 'uat-log.jsonl');

  // Write raw JSONL — bypass HMAC so we can control ts freely.
  for (const e of entries) {
    fs.appendFileSync(logPath, JSON.stringify(e) + '\n', 'utf-8');
  }

  return { surfaceDir, logPath };
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}

// ══════════════════════════════════════════════════════════════════════════════
// parseThreshold — pure function tests
// ══════════════════════════════════════════════════════════════════════════════

describe('parseThreshold — TC-STALE-01: valid formats', () => {
  it('"1d" → 1 day in ms', () => {
    expect(parseThreshold('1d')).toBe(MS_PER_DAY);
  });

  it('"7d" → 7 days in ms', () => {
    expect(parseThreshold('7d')).toBe(7 * MS_PER_DAY);
  });

  it('"30d" → 30 days in ms', () => {
    expect(parseThreshold('30d')).toBe(30 * MS_PER_DAY);
  });

  it('"90d" → 90 days in ms', () => {
    expect(parseThreshold('90d')).toBe(90 * MS_PER_DAY);
  });

  it('"180d" → 180 days in ms', () => {
    expect(parseThreshold('180d')).toBe(180 * MS_PER_DAY);
  });

  it('"365d" → 365 days in ms', () => {
    expect(parseThreshold('365d')).toBe(365 * MS_PER_DAY);
  });

  it('case insensitive: "30D" → 30 days in ms', () => {
    expect(parseThreshold('30D')).toBe(30 * MS_PER_DAY);
  });
});

describe('parseThreshold — TC-STALE-02: invalid formats return null', () => {
  it('"30" (no unit) → null', () => {
    expect(parseThreshold('30')).toBeNull();
  });

  it('"30days" (wrong unit) → null', () => {
    expect(parseThreshold('30days')).toBeNull();
  });

  it('"30h" (hours not supported) → null', () => {
    expect(parseThreshold('30h')).toBeNull();
  });

  it('"" (empty string) → null', () => {
    expect(parseThreshold('')).toBeNull();
  });

  it('null → null', () => {
    expect(parseThreshold(null)).toBeNull();
  });

  it('"0d" (zero days) → null', () => {
    expect(parseThreshold('0d')).toBeNull();
  });

  it('"-7d" (negative) → null', () => {
    expect(parseThreshold('-7d')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// runSignStaleCheck integration tests
// ══════════════════════════════════════════════════════════════════════════════

describe('sign-stale — TC-STALE-03: no stale entries exits cleanly', () => {
  it('returns { staleEntries: [], total: 1 } and does NOT throw', async () => {
    const surfaceDir = path.join(tmpDir, 'fresh-surface');
    fs.mkdirSync(surfaceDir, { recursive: true });
    const logPath = path.join(surfaceDir, 'uat-log.jsonl');

    // Entry from 1 day ago — well within 90d threshold
    appendEntry(logPath, {
      tc_id: 'TC-001',
      status: 'PASS',
      reviewer: 'alice',
      reviewer_role: 'QA',
    }, SECRET);

    const result = await runSignStaleCheck('fresh-surface', {
      folder: tmpDir,
      threshold: '90d',
    });

    expect(result.staleEntries).toHaveLength(0);
    expect(result.total).toBe(1);
  });
});

describe('sign-stale — TC-STALE-04: stale entries found (no --strict) → exit 0', () => {
  it('returns stale list but does NOT throw', async () => {
    const entries = [
      {
        tc_id: 'TC-OLD-01',
        status: 'PASS',
        reviewer: 'bob',
        reviewer_role: 'QA',
        ts: daysAgoIso(120),  // 120 days ago — stale vs 90d threshold
        prev_hash: 'genesis',
        signature: 'fakesig',
      },
      {
        tc_id: 'TC-OLD-02',
        status: 'PASS',
        reviewer: 'carol',
        reviewer_role: 'Compliance',
        ts: daysAgoIso(200),  // 200 days ago — very stale
        prev_hash: 'genesis2',
        signature: 'fakesig2',
      },
    ];

    makeSurfaceWithStaleEntries('stale-no-strict', entries);

    const result = await runSignStaleCheck('stale-no-strict', {
      folder: tmpDir,
      threshold: '90d',
      strict: false,
    });

    expect(result.staleEntries).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.staleEntries[0].tc_id).toBe('TC-OLD-01');
    expect(result.staleEntries[1].tc_id).toBe('TC-OLD-02');
  });
});

describe('sign-stale — TC-STALE-05: stale entries + --strict → exitCode 1', () => {
  it('throws with exitCode 1 and staleEntries attached when --strict', async () => {
    const entries = [
      {
        tc_id: 'TC-STRICT-01',
        status: 'PASS',
        reviewer: 'dave',
        reviewer_role: 'Security',
        ts: daysAgoIso(100),
        prev_hash: 'genesis',
        signature: 'fakesig',
      },
    ];

    makeSurfaceWithStaleEntries('stale-strict', entries);

    let thrown;
    try {
      await runSignStaleCheck('stale-strict', {
        folder: tmpDir,
        threshold: '90d',
        strict: true,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.staleEntries).toHaveLength(1);
    expect(thrown.message).toMatch(/stale/i);
  });
});

describe('sign-stale — TC-STALE-06: unparseable timestamp treated as stale', () => {
  it('entry with null/undefined ts is flagged as stale (conservative)', async () => {
    const entries = [
      {
        tc_id: 'TC-BADTS-01',
        status: 'PASS',
        reviewer: 'eve',
        reviewer_role: 'QA',
        ts: 'not-a-date',    // unparseable
        prev_hash: 'genesis',
        signature: 'fakesig',
      },
    ];

    makeSurfaceWithStaleEntries('surface-badts', entries);

    const result = await runSignStaleCheck('surface-badts', {
      folder: tmpDir,
      threshold: '90d',
      strict: false,
    });

    expect(result.staleEntries).toHaveLength(1);
    expect(result.staleEntries[0].ageLabel).toMatch(/unparseable/i);
  });
});

describe('sign-stale — TC-STALE-07: --json mode emits structured output', () => {
  it('emits sign.stale-check.done JSON event on stdout', async () => {
    const surfaceDir = path.join(tmpDir, 'json-mode-surface');
    fs.mkdirSync(surfaceDir, { recursive: true });
    const logPath = path.join(surfaceDir, 'uat-log.jsonl');

    appendEntry(logPath, {
      tc_id: 'TC-001',
      status: 'PASS',
      reviewer: 'alice',
      reviewer_role: 'QA',
    }, SECRET);

    const jsonLines = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => {
      jsonLines.push(String(chunk));
      return origWrite(chunk, ...rest);
    };

    try {
      await runSignStaleCheck('json-mode-surface', {
        folder: tmpDir,
        threshold: '90d',
        json: true,
      });
    } finally {
      process.stdout.write = origWrite;
    }

    const events = jsonLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const doneEvent = events.find((e) => e.event === 'sign.stale-check.done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent).toHaveProperty('stale');
    expect(doneEvent).toHaveProperty('total');
    expect(doneEvent.stale).toBe(0);
    expect(doneEvent.total).toBe(1);
  });
});

describe('sign-stale — TC-STALE-08: invalid threshold format → exitCode 2', () => {
  it('throws exitCode 2 when threshold is "30" (no unit)', async () => {
    const surfaceDir = path.join(tmpDir, 'threshold-err');
    fs.mkdirSync(surfaceDir, { recursive: true });

    let thrown;
    try {
      await runSignStaleCheck('threshold-err', {
        folder: tmpDir,
        threshold: '30',
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
    expect(thrown.message).toMatch(/invalid threshold/i);
  });
});

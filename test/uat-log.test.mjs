// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/uat-log.test.mjs
 *
 * Comprehensive unit tests for src/lib/uat-log.mjs — the HMAC-SHA256
 * hash-chained sign-off log.
 *
 * SECURITY-CRITICAL: These tests verify tamper-evidence guarantees.
 * Failing tests indicate a forensic-trail compromise risk.
 *
 * Tamper models covered:
 *   - Entry content mutation (status field change)
 *   - Signature field overwrite
 *   - Entry deletion (gap in chain)
 *   - Entry reordering (swap attack)
 *   - Wrong HMAC secret
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

import {
  appendEntry,
  verifyChain,
  getLatest,
  hmac,
} from '../src/lib/uat-log.mjs';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const SECRET = 'test-secret-do-not-use-in-production';
const WRONG_SECRET = 'wrong-secret-totally-different';

const ENTRY_A = {
  tc_id: 'TC-001',
  status: 'PASS',
  reviewer: 'alice',
  reviewer_role: 'QA Lead',
  justification: 'All checks passed.',
};

const ENTRY_B = {
  tc_id: 'TC-002',
  status: 'FAIL',
  reviewer: 'bob',
  reviewer_role: 'Engineer',
  justification: 'Missing validation.',
};

const ENTRY_C = {
  tc_id: 'TC-003',
  status: 'PASS',
  reviewer: 'carol',
  reviewer_role: 'Security',
};

const ENTRY_D = {
  tc_id: 'TC-004',
  status: 'PASS',
  reviewer: 'dave',
  reviewer_role: 'QA',
};

const ENTRY_E = {
  tc_id: 'TC-005',
  status: 'PASS',
  reviewer: 'eve',
  reviewer_role: 'Security Lead',
};

// ── Temp file helpers ─────────────────────────────────────────────────────────

let tmpDir;
let logPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uat-log-test-'));
  logPath = path.join(tmpDir, 'uat.jsonl');
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ── appendEntry ───────────────────────────────────────────────────────────────

describe('appendEntry — basic behaviour', () => {
  it('TC-UAT-01: first entry has all required fields and prev_hash = HMAC("","")', () => {
    const entry = appendEntry(logPath, ENTRY_A, SECRET);

    expect(entry).toHaveProperty('tc_id', 'TC-001');
    expect(entry).toHaveProperty('status', 'PASS');
    expect(entry).toHaveProperty('reviewer', 'alice');
    expect(entry).toHaveProperty('reviewer_role', 'QA Lead');
    expect(entry).toHaveProperty('ts');
    expect(entry).toHaveProperty('prev_hash');
    expect(entry).toHaveProperty('signature');

    // prev_hash of the first entry must equal HMAC(secret, '') — the empty-hash sentinel
    const expectedPrevHash = hmac(SECRET, '');
    expect(entry.prev_hash).toBe(expectedPrevHash);
  });

  it('TC-UAT-02: first entry signature is HMAC(tc_id|status|reviewer|ts)', () => {
    const entry = appendEntry(logPath, ENTRY_A, SECRET);
    const sigInput = [entry.tc_id, entry.status, entry.reviewer, entry.ts].join('|');
    const expectedSig = hmac(SECRET, sigInput);
    expect(entry.signature).toBe(expectedSig);
  });

  it('TC-UAT-03: second entry prev_hash = HMAC(secret, raw-JSON-of-first-entry)', () => {
    appendEntry(logPath, ENTRY_A, SECRET);

    // Read the raw first line
    const firstRaw = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean)[0];
    const expectedPrevHash = hmac(SECRET, firstRaw);

    const entry2 = appendEntry(logPath, ENTRY_B, SECRET);
    expect(entry2.prev_hash).toBe(expectedPrevHash);
  });

  it('TC-UAT-04: throws when secret is missing', () => {
    expect(() => appendEntry(logPath, ENTRY_A, '')).toThrow();
    expect(() => appendEntry(logPath, ENTRY_A, null)).toThrow();
  });

  it('TC-UAT-05: throws when required entry fields are missing', () => {
    expect(() => appendEntry(logPath, { status: 'PASS', reviewer: 'x', reviewer_role: 'y' }, SECRET)).toThrow();
    expect(() => appendEntry(logPath, { tc_id: 'TC-X', reviewer: 'x', reviewer_role: 'y' }, SECRET)).toThrow();
    expect(() => appendEntry(logPath, { tc_id: 'TC-X', status: 'PASS', reviewer_role: 'y' }, SECRET)).toThrow();
    expect(() => appendEntry(logPath, { tc_id: 'TC-X', status: 'PASS', reviewer: 'x' }, SECRET)).toThrow();
  });

  it('TC-UAT-06: file is created and contains valid JSON per line', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET);

    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// ── verifyChain ───────────────────────────────────────────────────────────────

describe('verifyChain — intact chains', () => {
  it('TC-UAT-07: empty log returns valid with brokenAt=null', () => {
    const result = verifyChain(logPath, SECRET);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('TC-UAT-08: non-existent log file returns valid (treated as empty)', () => {
    const missing = path.join(tmpDir, 'no-such-file.jsonl');
    const result = verifyChain(missing, SECRET);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
  });

  it('TC-UAT-09: single valid entry returns valid', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    const result = verifyChain(logPath, SECRET);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
  });

  it('TC-UAT-10: five valid entries all return valid', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET);
    appendEntry(logPath, ENTRY_C, SECRET);
    appendEntry(logPath, ENTRY_D, SECRET);
    appendEntry(logPath, ENTRY_E, SECRET);

    const result = verifyChain(logPath, SECRET);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
    expect(result.errors).toHaveLength(0);
  });
});

describe('verifyChain — SECURITY: tampered content', () => {
  it('TC-UAT-11: mutating status field of entry 3 of 5 → chain breaks at line 3', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET);
    appendEntry(logPath, ENTRY_C, SECRET);
    appendEntry(logPath, ENTRY_D, SECRET);
    appendEntry(logPath, ENTRY_E, SECRET);

    // Mutate entry 3 (0-indexed: index 2) — change status from PASS to FAIL
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    const entry3 = JSON.parse(lines[2]);
    entry3.status = 'FAIL'; // tamper
    lines[2] = JSON.stringify(entry3);
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf-8');

    const result = verifyChain(logPath, SECRET);
    expect(result.valid).toBe(false);
    // Signature of entry 3 will be wrong because status changed
    expect(result.brokenAt).toBe(3);
  });

  it('TC-UAT-12: overwriting signature of entry 2 of 5 → chain breaks at line 2', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET);
    appendEntry(logPath, ENTRY_C, SECRET);
    appendEntry(logPath, ENTRY_D, SECRET);
    appendEntry(logPath, ENTRY_E, SECRET);

    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    const entry2 = JSON.parse(lines[1]);
    entry2.signature = 'deadbeef'.repeat(8); // invalid signature
    lines[1] = JSON.stringify(entry2);
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf-8');

    const result = verifyChain(logPath, SECRET);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });
});

describe('verifyChain — SECURITY: structural attacks', () => {
  it('TC-UAT-13: deleting entry 2 of 5 → chain breaks at (new) line 2 (old entry 3)', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET);
    appendEntry(logPath, ENTRY_C, SECRET);
    appendEntry(logPath, ENTRY_D, SECRET);
    appendEntry(logPath, ENTRY_E, SECRET);

    // Remove entry 2 (index 1)
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    lines.splice(1, 1); // delete entry 2
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf-8');

    const result = verifyChain(logPath, SECRET);
    expect(result.valid).toBe(false);
    // Old entry 3 is now at line 2; its prev_hash references entry 2 which is gone
    expect(result.brokenAt).toBe(2);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('TC-UAT-14: reordering entries 2 and 3 → chain breaks at line 2', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET);
    appendEntry(logPath, ENTRY_C, SECRET);
    appendEntry(logPath, ENTRY_D, SECRET);
    appendEntry(logPath, ENTRY_E, SECRET);

    // Swap entries 2 and 3 (indices 1 and 2)
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    [lines[1], lines[2]] = [lines[2], lines[1]];
    fs.writeFileSync(logPath, lines.join('\n') + '\n', 'utf-8');

    const result = verifyChain(logPath, SECRET);
    expect(result.valid).toBe(false);
    // The swapped entry 3 (now at position 2) has a prev_hash pointing to entry 2, not entry 1
    expect(result.brokenAt).toBe(2);
  });

  it('TC-UAT-15: wrong HMAC secret → chain invalid from first entry', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET);
    appendEntry(logPath, ENTRY_C, SECRET);

    const result = verifyChain(logPath, WRONG_SECRET);
    expect(result.valid).toBe(false);
    // First entry's prev_hash = hmac(SECRET,'') ≠ hmac(WRONG_SECRET,'')
    expect(result.brokenAt).toBe(1);
  });
});

// ── getLatest ─────────────────────────────────────────────────────────────────

describe('getLatest', () => {
  it('TC-UAT-16: returns null for a TC-ID not in the log', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    const result = getLatest(logPath, 'TC-NOTEXIST');
    expect(result).toBeNull();
  });

  it('TC-UAT-17: returns the only entry for a single sign-off', () => {
    appendEntry(logPath, ENTRY_A, SECRET);
    const result = getLatest(logPath, 'TC-001');
    expect(result).not.toBeNull();
    expect(result.tc_id).toBe('TC-001');
    expect(result.reviewer).toBe('alice');
  });

  it('TC-UAT-18: multiple sign-offs for same TC-ID → returns the latest (last appended)', () => {
    // Append TC-001 twice — second should be returned
    appendEntry(logPath, ENTRY_A, SECRET);
    appendEntry(logPath, ENTRY_B, SECRET); // unrelated, different tc_id
    const secondSignOff = appendEntry(logPath, {
      ...ENTRY_A,
      status: 'PASS',
      reviewer: 'manager',
      reviewer_role: 'Manager',
      justification: 'Re-reviewed and confirmed pass.',
    }, SECRET);

    const result = getLatest(logPath, 'TC-001');
    expect(result).not.toBeNull();
    expect(result.reviewer).toBe('manager');
    expect(result.ts).toBe(secondSignOff.ts);
  });

  it('TC-UAT-19: returns null for empty log file', () => {
    // File doesn't exist yet
    const result = getLatest(logPath, 'TC-001');
    expect(result).toBeNull();
  });

  it('TC-UAT-20: handles multiple different TC-IDs — returns correct entry per TC', () => {
    appendEntry(logPath, ENTRY_A, SECRET); // TC-001
    appendEntry(logPath, ENTRY_B, SECRET); // TC-002
    appendEntry(logPath, ENTRY_C, SECRET); // TC-003

    expect(getLatest(logPath, 'TC-001').reviewer).toBe('alice');
    expect(getLatest(logPath, 'TC-002').reviewer).toBe('bob');
    expect(getLatest(logPath, 'TC-003').reviewer).toBe('carol');
  });
});

// ── hmac (exported helper) ────────────────────────────────────────────────────

describe('hmac — internal helper (exported for testing)', () => {
  it('TC-UAT-21: produces a 64-char hex string (SHA-256 output)', () => {
    const h = hmac(SECRET, 'hello');
    expect(typeof h).toBe('string');
    expect(h).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(h)).toBe(true);
  });

  it('TC-UAT-22: same inputs → same output (deterministic)', () => {
    expect(hmac(SECRET, 'data')).toBe(hmac(SECRET, 'data'));
  });

  it('TC-UAT-23: different secrets → different HMACs', () => {
    expect(hmac(SECRET, 'data')).not.toBe(hmac(WRONG_SECRET, 'data'));
  });

  it('TC-UAT-24: cross-validates against Node built-in crypto', () => {
    const expected = crypto.createHmac('sha256', SECRET).update('hello', 'utf-8').digest('hex');
    expect(hmac(SECRET, 'hello')).toBe(expected);
  });
});

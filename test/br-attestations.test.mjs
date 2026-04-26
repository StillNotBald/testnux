// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/br-attestations.test.mjs
 *
 * Unit tests for src/lib/br-attestations.mjs — the HMAC-chained BR attestation library.
 *
 * Tests call the low-level exported functions directly (no CLI harness needed).
 * UAT_SECRET is fixed for reproducibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import crypto from 'crypto';

import {
  appendAttestation,
  revokeAttestation,
  getAttestationStatus,
  verifyAttestationChain,
  formatAttestationStatus,
} from '../src/lib/br-attestations.mjs';

// ── Constants ─────────────────────────────────────────────────────────────────

const SECRET = 'test-br-attestations-secret-do-not-use';
const WRONG_SECRET = 'wrong-secret-totally-different-from-above';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ATTEST_QA = {
  br_id: 'BR-01',
  tc_id: 'TC-001',
  reviewer: 'alice',
  reviewer_role: 'QA',
  justification: 'All QA criteria met.',
};

const ATTEST_COMPLIANCE = {
  br_id: 'BR-01',
  tc_id: 'TC-001',
  reviewer: 'bob',
  reviewer_role: 'Compliance',
  justification: 'Compliance controls verified.',
};

const ATTEST_SECURITY = {
  br_id: 'BR-01',
  tc_id: 'TC-002',
  reviewer: 'carol',
  reviewer_role: 'Security',
  justification: 'Security review passed.',
};

// ── Temp dir helpers ──────────────────────────────────────────────────────────

let tmpDir;
let jsonlPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-attest-test-'));
  jsonlPath = path.join(tmpDir, 'br-attestations.jsonl');
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ══════════════════════════════════════════════════════════════════════════════
// appendAttestation
// ══════════════════════════════════════════════════════════════════════════════

describe('appendAttestation — TC-BR-01: chaining behaviour', () => {
  it('first entry has status "attested" and prev_hash = HMAC(secret, "")', () => {
    const entry = appendAttestation(jsonlPath, ATTEST_QA, SECRET);

    expect(entry.status).toBe('attested');
    expect(entry).toHaveProperty('br_id', 'BR-01');
    expect(entry).toHaveProperty('tc_id', 'TC-001');
    expect(entry).toHaveProperty('reviewer', 'alice');
    expect(entry).toHaveProperty('reviewer_role', 'QA');
    expect(entry).toHaveProperty('ts');
    expect(entry).toHaveProperty('prev_hash');
    expect(entry).toHaveProperty('signature');

    // First entry prev_hash must be HMAC("", secret) — the genesis sentinel
    const expected = crypto.createHmac('sha256', SECRET).update('', 'utf-8').digest('hex');
    expect(entry.prev_hash).toBe(expected);
  });

  it('subsequent entry prev_hash = HMAC(secret, raw-JSON-of-previous-line)', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);

    // Capture the first raw line
    const firstRaw = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean)[0];

    const entry2 = appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);

    const expectedPrev = crypto.createHmac('sha256', SECRET).update(firstRaw, 'utf-8').digest('hex');
    expect(entry2.prev_hash).toBe(expectedPrev);
  });

  it('file is created and contains valid JSONL', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);

    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// verifyAttestationChain
// ══════════════════════════════════════════════════════════════════════════════

describe('verifyAttestationChain — TC-BR-02: valid chain', () => {
  it('returns { valid: true, brokenAt: null } for a fresh 3-entry chain', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);
    appendAttestation(jsonlPath, ATTEST_SECURITY, SECRET);

    const result = verifyAttestationChain(jsonlPath, SECRET);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('empty file returns valid', () => {
    const result = verifyAttestationChain(jsonlPath, SECRET);
    expect(result.valid).toBe(true);
  });
});

describe('verifyAttestationChain — TC-BR-03: tampered chain detected', () => {
  it('returns { valid: false, brokenAt: 2 } when entry 2 status is mutated', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);
    appendAttestation(jsonlPath, ATTEST_SECURITY, SECRET);

    // Tamper entry 2 (index 1)
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    const e2 = JSON.parse(lines[1]);
    e2.status = 'revoked'; // mutate — invalidates signature
    lines[1] = JSON.stringify(e2);
    fs.writeFileSync(jsonlPath, lines.join('\n') + '\n', 'utf-8');

    const result = verifyAttestationChain(jsonlPath, SECRET);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('wrong secret → chain invalid from entry 1', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);

    const result = verifyAttestationChain(jsonlPath, WRONG_SECRET);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getAttestationStatus
// ══════════════════════════════════════════════════════════════════════════════

describe('getAttestationStatus — TC-BR-04: complete (all required roles met)', () => {
  it('returns { complete: true, partial: false } when all required roles have enough reviewers', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);

    const requiredReviewers = [
      { role: 'QA', count: 1 },
      { role: 'Compliance', count: 1 },
    ];

    const status = getAttestationStatus(jsonlPath, requiredReviewers);

    expect(status.complete).toBe(true);
    expect(status.partial).toBe(false);
    expect(status.counts.get('QA').actual).toBe(1);
    expect(status.counts.get('Compliance').actual).toBe(1);
  });
});

describe('getAttestationStatus — TC-BR-05: partial (2 of 3 roles met)', () => {
  it('returns { complete: false, partial: true } when 2/3 required roles are covered', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);
    // Security NOT attested

    const requiredReviewers = [
      { role: 'QA', count: 1 },
      { role: 'Compliance', count: 1 },
      { role: 'Security', count: 1 },
    ];

    const status = getAttestationStatus(jsonlPath, requiredReviewers);

    expect(status.complete).toBe(false);
    expect(status.partial).toBe(true);
    expect(status.counts.get('QA').actual).toBe(1);
    expect(status.counts.get('Security').actual).toBe(0);
  });

  it('format string contains "(2/3)" for partial 2-of-3', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);

    const requiredReviewers = [
      { role: 'QA', count: 1 },
      { role: 'Compliance', count: 1 },
      { role: 'Security', count: 1 },
    ];

    const status = getAttestationStatus(jsonlPath, requiredReviewers);
    const formatted = formatAttestationStatus(status);

    expect(formatted).toContain('PARTIAL');
    expect(formatted).toContain('2/3');
  });
});

describe('getAttestationStatus — TC-BR-06: single reviewer in multiple roles generates warning', () => {
  it('adds [VERIFY] warning when one reviewer attests multiple required roles', () => {
    // "alice" attests both QA and Compliance
    appendAttestation(jsonlPath, { ...ATTEST_QA, reviewer: 'alice', reviewer_role: 'QA' }, SECRET);
    appendAttestation(jsonlPath, { ...ATTEST_QA, reviewer: 'alice', reviewer_role: 'Compliance' }, SECRET);

    const requiredReviewers = [
      { role: 'QA', count: 1 },
      { role: 'Compliance', count: 1 },
    ];

    const status = getAttestationStatus(jsonlPath, requiredReviewers);

    expect(status.warnings.length).toBeGreaterThan(0);
    const warning = status.warnings[0];
    expect(warning).toMatch(/\[VERIFY\]/);
    expect(warning).toMatch(/alice/i);
  });
});

describe('getAttestationStatus — TC-BR-07: revocation cancels prior attestation', () => {
  it('revoked role shows 0 actual attestations in effective state', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    // Now revoke the same reviewer+role
    revokeAttestation(jsonlPath, {
      br_id: ATTEST_QA.br_id,
      tc_id: ATTEST_QA.tc_id,
      reviewer: ATTEST_QA.reviewer,
      reviewer_role: ATTEST_QA.reviewer_role,
      justification: 'Revoked due to conflict.',
    }, SECRET);

    const requiredReviewers = [{ role: 'QA', count: 1 }];
    const status = getAttestationStatus(jsonlPath, requiredReviewers);

    expect(status.complete).toBe(false);
    expect(status.counts.get('QA').actual).toBe(0);
  });
});

describe('getAttestationStatus — TC-BR-08: no required_reviewers → always complete', () => {
  it('returns { complete: true } when requiredReviewers is null (backward compat)', () => {
    // No attestation file at all
    const status = getAttestationStatus(jsonlPath, null);
    expect(status.complete).toBe(true);
    expect(status.partial).toBe(false);
  });

  it('returns { complete: true } when requiredReviewers is empty array', () => {
    const status = getAttestationStatus(jsonlPath, []);
    expect(status.complete).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// formatAttestationStatus
// ══════════════════════════════════════════════════════════════════════════════

describe('formatAttestationStatus — TC-BR-09: formatted output string', () => {
  it('formats "✓ QA(1/1) ✓ Compliance(1/1) ✗ Security(0/1) — PARTIAL (2/3)"', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);

    const requiredReviewers = [
      { role: 'QA', count: 1 },
      { role: 'Compliance', count: 1 },
      { role: 'Security', count: 1 },
    ];

    const status = getAttestationStatus(jsonlPath, requiredReviewers);
    const formatted = formatAttestationStatus(status);

    expect(formatted).toContain('✓ QA(1/1)');
    expect(formatted).toContain('✓ Compliance(1/1)');
    expect(formatted).toContain('✗ Security(0/1)');
    expect(formatted).toContain('PARTIAL');
    expect(formatted).toContain('2/3');
  });

  it('returns COMPLETE string when all roles met', () => {
    appendAttestation(jsonlPath, ATTEST_QA, SECRET);
    appendAttestation(jsonlPath, ATTEST_COMPLIANCE, SECRET);

    const requiredReviewers = [
      { role: 'QA', count: 1 },
      { role: 'Compliance', count: 1 },
    ];

    const status = getAttestationStatus(jsonlPath, requiredReviewers);
    const formatted = formatAttestationStatus(status);

    expect(formatted).toContain('COMPLETE');
    expect(formatted).not.toContain('PARTIAL');
  });

  it('returns placeholder string when counts is empty', () => {
    const status = getAttestationStatus(jsonlPath, null);
    const formatted = formatAttestationStatus(status);
    expect(formatted).toContain('no required reviewers');
  });
});

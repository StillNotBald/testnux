// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/oscal.test.mjs
 *
 * Comprehensive unit tests for src/lib/oscal.mjs.
 *
 * Covers: toOSCAL() happy paths, output structure, NIST OSCAL 1.1.2 compliance,
 * UUID / date validation, edge cases, and validateOSCAL() error paths.
 */

import { describe, it, expect } from 'vitest';
import {
  toOSCAL,
  validateOSCAL,
  OscalValidationError,
  OSCAL_VERSION,
} from '../src/lib/oscal.mjs';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strict UUID v4 regex per RFC-4122 §4.4. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Permissive UUID regex (any version) — matches what oscal.mjs checkUUID uses. */
const UUID_LOOSE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO-8601 date-time regex. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Minimal valid SCA with 3 controls + 2 evidence + 1 declined control. */
function buildSCA() {
  return {
    surface: 'login',
    version: '1.0',
    published: '2026-04-26',
    controls: [
      { id: 'AC-2', title: 'Account Management', status: 'pass', findings: ['MFA enforced for all accounts'] },
      { id: 'IA-5', title: 'Authenticator Management', status: 'fail', findings: ['Passwords not rotated in 90 days'] },
      { id: 'AU-12', title: 'Audit Record Generation', status: 'partial', findings: ['Logs enabled, alerting missing'] },
    ],
    evidence: [
      { controlId: 'AC-2', type: 'screenshot', href: 'evidence/mfa-config.png', description: 'MFA config screenshot' },
      { controlId: 'IA-5', type: 'log', href: 'evidence/pwd-audit.log', description: 'Password audit log' },
    ],
    declined: [
      {
        controlId: 'SC-28',
        reason: 'Out of scope for SaaS deployment',
        approvedBy: 'CISO',
        approvedDate: '2026-04-01',
      },
    ],
    signOff: [
      { name: 'Alice Smith', email: 'alice@example.com', role: 'Security Lead', date: '2026-04-26' },
    ],
  };
}

// ── toOSCAL: Happy path ────────────────────────────────────────────────────────

describe('toOSCAL — happy path', () => {
  it('TC-OSCAL-01: returns a document with top-level assessment-results key', () => {
    const doc = toOSCAL(buildSCA());
    expect(doc).toHaveProperty('assessment-results');
    expect(typeof doc['assessment-results']).toBe('object');
  });

  it('TC-OSCAL-02: assessment-results has a UUID (loose format)', () => {
    const doc = toOSCAL(buildSCA());
    const ar = doc['assessment-results'];
    expect(UUID_LOOSE_RE.test(ar.uuid)).toBe(true);
  });

  it('TC-OSCAL-03: assessment-results UUID is version-4 shaped (version nibble = 4)', () => {
    const doc = toOSCAL(buildSCA());
    const ar = doc['assessment-results'];
    // deterministicUUID forces version=4 and variant=10xx bits
    expect(UUID_V4_RE.test(ar.uuid)).toBe(true);
  });

  it('TC-OSCAL-04: metadata has all required NIST OSCAL 1.1.2 fields', () => {
    const doc = toOSCAL(buildSCA());
    const meta = doc['assessment-results'].metadata;
    expect(meta).toHaveProperty('title');
    expect(meta).toHaveProperty('version');
    expect(meta).toHaveProperty('oscal-version', OSCAL_VERSION);
    expect(meta['oscal-version']).toBe('1.1.2');
    expect(meta).toHaveProperty('published');
    expect(meta).toHaveProperty('last-modified');
    expect(meta).toHaveProperty('parties');
    expect(meta).toHaveProperty('roles');
  });

  it('TC-OSCAL-05: metadata.published and last-modified are ISO-8601 date-times', () => {
    const doc = toOSCAL(buildSCA());
    const meta = doc['assessment-results'].metadata;
    expect(ISO_DATE_RE.test(meta.published)).toBe(true);
    expect(ISO_DATE_RE.test(meta['last-modified'])).toBe(true);
  });

  it('TC-OSCAL-06: results[] is a non-empty array with correct structure', () => {
    const doc = toOSCAL(buildSCA());
    const results = doc['assessment-results'].results;
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(r).toHaveProperty('uuid');
    expect(r).toHaveProperty('title');
    expect(r).toHaveProperty('start');
    expect(r).toHaveProperty('end');
    expect(r).toHaveProperty('reviewed-controls');
    expect(r).toHaveProperty('findings');
    expect(r).toHaveProperty('risks');
  });

  it('TC-OSCAL-07: result UUID is version-4 shaped', () => {
    const doc = toOSCAL(buildSCA());
    const r = doc['assessment-results'].results[0];
    expect(UUID_V4_RE.test(r.uuid)).toBe(true);
  });

  it('TC-OSCAL-08: result.start and result.end are ISO-8601', () => {
    const doc = toOSCAL(buildSCA());
    const r = doc['assessment-results'].results[0];
    expect(ISO_DATE_RE.test(r.start)).toBe(true);
    expect(ISO_DATE_RE.test(r.end)).toBe(true);
  });

  it('TC-OSCAL-09: findings array has one entry per control (3 controls → 3 findings)', () => {
    const doc = toOSCAL(buildSCA());
    const findings = doc['assessment-results'].results[0].findings;
    expect(Array.isArray(findings)).toBe(true);
    expect(findings).toHaveLength(3);
  });

  it('TC-OSCAL-10: declined controls map to risks[] with status deviation-requested', () => {
    const doc = toOSCAL(buildSCA());
    const risks = doc['assessment-results'].results[0].risks;
    expect(Array.isArray(risks)).toBe(true);
    expect(risks).toHaveLength(1);
    expect(risks[0].status).toBe('deviation-requested');
    expect(risks[0].title).toMatch(/SC-28/i);
  });

  it('TC-OSCAL-11: each finding UUID is version-4 shaped', () => {
    const doc = toOSCAL(buildSCA());
    const findings = doc['assessment-results'].results[0].findings;
    for (const f of findings) {
      expect(UUID_V4_RE.test(f.uuid)).toBe(true);
    }
  });

  it('TC-OSCAL-12: parties array includes signOff members with UUID', () => {
    const doc = toOSCAL(buildSCA());
    const parties = doc['assessment-results'].metadata.parties;
    expect(Array.isArray(parties)).toBe(true);
    expect(parties).toHaveLength(1);
    expect(parties[0].name).toBe('Alice Smith');
    expect(UUID_V4_RE.test(parties[0].uuid)).toBe(true);
  });
});

// ── toOSCAL: Edge cases ────────────────────────────────────────────────────────

describe('toOSCAL — edge cases', () => {
  it('TC-OSCAL-13: empty SCA (no controls/evidence/declined) returns minimal valid OSCAL', () => {
    const doc = toOSCAL({ surface: 'empty-surface' });
    expect(doc).toHaveProperty('assessment-results');
    const ar = doc['assessment-results'];
    expect(Array.isArray(ar.results)).toBe(true);
    expect(ar.results[0].findings).toHaveLength(0);
    expect(ar.results[0].risks).toHaveLength(0);
  });

  it('TC-OSCAL-14: SCA with all-DECLINED controls populates risks[], not findings', () => {
    const doc = toOSCAL({
      surface: 'api',
      controls: [],
      declined: [
        { controlId: 'SC-8', reason: 'TLS handled at edge', approvedBy: 'CTO', approvedDate: '2026-01-01' },
        { controlId: 'SC-13', reason: 'Vendor-managed crypto', approvedBy: 'CTO', approvedDate: '2026-01-01' },
      ],
    });
    const result = doc['assessment-results'].results[0];
    expect(result.findings).toHaveLength(0);
    expect(result.risks).toHaveLength(2);
    expect(result.risks.every((r) => r.status === 'deviation-requested')).toBe(true);
  });

  it('TC-OSCAL-15: throws TypeError when called with non-object', () => {
    expect(() => toOSCAL(null)).toThrow(TypeError);
    expect(() => toOSCAL('string')).toThrow(TypeError);
    expect(() => toOSCAL(42)).toThrow(TypeError);
  });
});

// ── toOSCAL: Determinism ───────────────────────────────────────────────────────

describe('toOSCAL — determinism', () => {
  it('TC-OSCAL-16: same SCA input → same UUIDs on both calls (deterministic)', () => {
    const sca = buildSCA();
    const doc1 = toOSCAL(sca);
    const doc2 = toOSCAL(sca);

    const ar1 = doc1['assessment-results'];
    const ar2 = doc2['assessment-results'];

    // Top-level UUID
    expect(ar1.uuid).toBe(ar2.uuid);
    // Result UUID
    expect(ar1.results[0].uuid).toBe(ar2.results[0].uuid);
    // Finding UUIDs
    for (let i = 0; i < ar1.results[0].findings.length; i++) {
      expect(ar1.results[0].findings[i].uuid).toBe(ar2.results[0].findings[i].uuid);
    }
    // Risk UUID
    expect(ar1.results[0].risks[0].uuid).toBe(ar2.results[0].risks[0].uuid);
    // Party UUID
    expect(ar1.metadata.parties[0].uuid).toBe(ar2.metadata.parties[0].uuid);
  });

  it('TC-OSCAL-17: different surface → different top-level UUID', () => {
    const doc1 = toOSCAL({ surface: 'login' });
    const doc2 = toOSCAL({ surface: 'api-gateway' });
    expect(doc1['assessment-results'].uuid).not.toBe(doc2['assessment-results'].uuid);
  });
});

// ── validateOSCAL: Valid document ─────────────────────────────────────────────

describe('validateOSCAL — valid documents', () => {
  it('TC-OSCAL-18: valid OSCAL from toOSCAL() does not throw', () => {
    const doc = toOSCAL(buildSCA());
    expect(() => validateOSCAL(doc)).not.toThrow();
  });

  it('TC-OSCAL-19: minimal hand-built valid document passes', () => {
    const doc = {
      'assessment-results': {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {
          title: 'Test Assessment',
          'oscal-version': '1.1.2',
          version: '0.1',
        },
        results: [
          {
            uuid: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            title: 'Test Result',
            'reviewed-controls': { description: 'all' },
          },
        ],
      },
    };
    expect(() => validateOSCAL(doc)).not.toThrow();
  });
});

// ── validateOSCAL: Error paths ────────────────────────────────────────────────

describe('validateOSCAL — error paths', () => {
  it('TC-OSCAL-20: missing assessment-results key throws OscalValidationError', () => {
    expect(() => validateOSCAL({ 'wrong-key': {} })).toThrow(OscalValidationError);
  });

  it('TC-OSCAL-21: non-object input throws OscalValidationError', () => {
    expect(() => validateOSCAL(null)).toThrow(OscalValidationError);
    expect(() => validateOSCAL('bad')).toThrow(OscalValidationError);
  });

  it('TC-OSCAL-22: missing metadata throws OscalValidationError with issues', () => {
    const doc = {
      'assessment-results': {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        // no metadata
        results: [
          {
            uuid: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            title: 'R',
            'reviewed-controls': {},
          },
        ],
      },
    };
    let err;
    try {
      validateOSCAL(doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OscalValidationError);
    expect(err.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('metadata'),
    ]));
  });

  it('TC-OSCAL-23: invalid UUID in assessment-results.uuid throws with UUID error', () => {
    const doc = {
      'assessment-results': {
        uuid: 'not-a-uuid',
        metadata: {
          title: 'T',
          'oscal-version': '1.1.2',
          version: '0.1',
        },
        results: [
          {
            uuid: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            title: 'R',
            'reviewed-controls': {},
          },
        ],
      },
    };
    let err;
    try {
      validateOSCAL(doc);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OscalValidationError);
    expect(err.issues.some((i) => i.includes('uuid'))).toBe(true);
  });

  it('TC-OSCAL-24: empty results array throws OscalValidationError', () => {
    const doc = {
      'assessment-results': {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {
          title: 'T',
          'oscal-version': '1.1.2',
          version: '0.1',
        },
        results: [],
      },
    };
    expect(() => validateOSCAL(doc)).toThrow(OscalValidationError);
  });

  it('TC-OSCAL-25: invalid published date in metadata throws OscalValidationError', () => {
    const doc = {
      'assessment-results': {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {
          title: 'T',
          'oscal-version': '1.1.2',
          version: '0.1',
          published: 'not-a-date',
        },
        results: [
          {
            uuid: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            title: 'R',
            'reviewed-controls': {},
          },
        ],
      },
    };
    expect(() => validateOSCAL(doc)).toThrow(OscalValidationError);
  });

  it('TC-OSCAL-26: OscalValidationError has exitCode=1 and issues array', () => {
    let err;
    try {
      validateOSCAL({ 'assessment-results': { uuid: 'bad' } });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OscalValidationError);
    expect(err.exitCode).toBe(1);
    expect(Array.isArray(err.issues)).toBe(true);
    expect(err.issues.length).toBeGreaterThan(0);
  });
});

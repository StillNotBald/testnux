// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/oscal.test.mjs
 *
 * Comprehensive unit tests for src/lib/oscal.mjs and src/lib/oscal-signoff.mjs.
 *
 * Covers: toOSCAL() happy paths, output structure, NIST OSCAL 1.1.2 compliance,
 * UUID / date validation, edge cases, validateOSCAL() error paths,
 * and S3 assessment-log extension (responsible-parties, assessment-log, subjects).
 */

import { describe, it, expect } from 'vitest';
import os from 'os';
import fs from 'fs';
import path from 'path';
import {
  toOSCAL,
  validateOSCAL,
  OscalValidationError,
  OSCAL_VERSION,
} from '../src/lib/oscal.mjs';
import {
  buildAssessmentLogExtension,
  mergeAssessmentLog,
  validateExtension,
} from '../src/lib/oscal-signoff.mjs';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strict UUID v5 regex per RFC-4122 §4.3 (namespace + SHA-1, version nibble = 5). */
const UUID_V5_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  it('TC-OSCAL-03: assessment-results UUID is version-5 shaped (version nibble = 5)', () => {
    const doc = toOSCAL(buildSCA());
    const ar = doc['assessment-results'];
    // deterministicUUID uses uuid v5 (RFC-4122): version nibble = 5, variant = 10xx
    expect(UUID_V5_RE.test(ar.uuid)).toBe(true);
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

  it('TC-OSCAL-07: result UUID is version-5 shaped', () => {
    const doc = toOSCAL(buildSCA());
    const r = doc['assessment-results'].results[0];
    expect(UUID_V5_RE.test(r.uuid)).toBe(true);
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

  it('TC-OSCAL-11: each finding UUID is version-5 shaped', () => {
    const doc = toOSCAL(buildSCA());
    const findings = doc['assessment-results'].results[0].findings;
    for (const f of findings) {
      expect(UUID_V5_RE.test(f.uuid)).toBe(true);
    }
  });

  it('TC-OSCAL-12: parties array includes signOff members with UUID', () => {
    const doc = toOSCAL(buildSCA());
    const parties = doc['assessment-results'].metadata.parties;
    expect(Array.isArray(parties)).toBe(true);
    expect(parties).toHaveLength(1);
    expect(parties[0].name).toBe('Alice Smith');
    expect(UUID_V5_RE.test(parties[0].uuid)).toBe(true);
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

// ── S3: buildAssessmentLogExtension ──────────────────────────────────────────

/** Write a minimal uat-log.jsonl fixture to a temp file and return its path. */
function writeUatLogFixture(entries) {
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'testnux-oscal-test-'));
  const logPath = path.join(tmpDir, 'uat-log.jsonl');
  const lines   = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(logPath, lines, 'utf-8');
  return logPath;
}

const SAMPLE_UAT_ENTRIES = [
  {
    tc_id:         'LOGIN-01',
    status:        'accepted',
    reviewer:      'Alice Smith',
    reviewer_role: 'QA Lead',
    justification: 'Login form validates correctly under all tested conditions.',
    ts:            '2026-04-26T10:00:00.000Z',
    prev_hash:     'aabbcc',
    signature:     'ddeeff',
  },
  {
    tc_id:         'LOGIN-02',
    status:        'accepted',
    reviewer:      'Bob Jones',
    reviewer_role: 'Security',
    justification: '',
    ts:            '2026-04-26T10:05:00.000Z',
    prev_hash:     'ddeeff',
    signature:     '112233',
  },
  {
    tc_id:         'LOGIN-01',   // duplicate TC-ID — second sign-off by same reviewer
    status:        'accepted',
    reviewer:      'Alice Smith',
    reviewer_role: 'QA Lead',
    justification: 'Re-attested after rework.',
    ts:            '2026-04-26T11:00:00.000Z',
    prev_hash:     '112233',
    signature:     '445566',
  },
];

describe('S3 buildAssessmentLogExtension — happy path', () => {
  it('TC-OSCAL-27: returns responsibleParties, assessmentLog, subjects', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    expect(extension).toHaveProperty('responsibleParties');
    expect(extension).toHaveProperty('assessmentLog');
    expect(extension).toHaveProperty('subjects');
  });

  it('TC-OSCAL-28: responsibleParties deduplicated by name+role (2 unique pairs from 3 entries)', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    // Alice QA Lead + Bob Security = 2 unique parties (Alice appears twice but same name+role)
    expect(extension.responsibleParties).toHaveLength(2);
  });

  it('TC-OSCAL-29: all responsible-party UUIDs are RFC-4122 format', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    for (const p of extension.responsibleParties) {
      expect(UUID_LOOSE_RE.test(p.uuid)).toBe(true);
    }
  });

  it('TC-OSCAL-30: responsible-party UUIDs are deterministic (UUID v5)', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const ext1      = buildAssessmentLogExtension(logPath);
    const ext2      = buildAssessmentLogExtension(logPath);

    const uuids1 = ext1.responsibleParties.map((p) => p.uuid).sort();
    const uuids2 = ext2.responsibleParties.map((p) => p.uuid).sort();
    expect(uuids1).toEqual(uuids2);
  });

  it('TC-OSCAL-31: assessmentLog has one entry per uat-log line', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    expect(extension.assessmentLog.entries).toHaveLength(3);
  });

  it('TC-OSCAL-32: each assessment-log entry has correct title format "TC-ID: status"', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    const entry = extension.assessmentLog.entries[0];
    expect(entry.title).toBe('LOGIN-01: accepted');
  });

  it('TC-OSCAL-33: assessment-log entry uses justification as description when present', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    expect(extension.assessmentLog.entries[0].description).toBe(
      'Login form validates correctly under all tested conditions.'
    );
  });

  it('TC-OSCAL-34: assessment-log entry uses fallback description when justification is empty', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    expect(extension.assessmentLog.entries[1].description).toBe('Test execution attested.');
  });

  it('TC-OSCAL-35: each assessment-log entry has start and end as ISO-8601', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    for (const e of extension.assessmentLog.entries) {
      expect(ISO_DATE_RE.test(e.start)).toBe(true);
      expect(ISO_DATE_RE.test(e.end)).toBe(true);
    }
  });

  it('TC-OSCAL-36: each assessment-log entry references a known party UUID via logged-by', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    const partyUuids = new Set(extension.responsibleParties.map((p) => p.uuid));
    for (const entry of extension.assessmentLog.entries) {
      for (const lb of entry['logged-by']) {
        expect(partyUuids.has(lb['party-uuid'])).toBe(true);
      }
    }
  });

  it('TC-OSCAL-37: subjects deduplicated by TC-ID (LOGIN-01 appears twice → 1 subject)', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    // 2 unique TC-IDs: LOGIN-01, LOGIN-02
    expect(extension.subjects).toHaveLength(2);
    const tcIds = extension.subjects.map((s) => s.props.find((p) => p.name === 'tc-id')?.value);
    expect(tcIds).toContain('LOGIN-01');
    expect(tcIds).toContain('LOGIN-02');
  });

  it('TC-OSCAL-38: all subject UUIDs are UUID v5 shaped', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);

    for (const s of extension.subjects) {
      expect(UUID_V5_RE.test(s.uuid)).toBe(true);
    }
  });

  it('TC-OSCAL-39: empty uat-log returns empty extension structures', () => {
    const logPath   = writeUatLogFixture([]);
    const extension = buildAssessmentLogExtension(logPath);

    expect(extension.responsibleParties).toHaveLength(0);
    expect(extension.assessmentLog.entries).toHaveLength(0);
    expect(extension.subjects).toHaveLength(0);
  });

  it('TC-OSCAL-40: non-existent uat-log path returns empty extension', () => {
    const extension = buildAssessmentLogExtension('/nonexistent/path/uat-log.jsonl');

    expect(extension.responsibleParties).toHaveLength(0);
    expect(extension.assessmentLog.entries).toHaveLength(0);
    expect(extension.subjects).toHaveLength(0);
  });
});

// ── S3: validateExtension ────────────────────────────────────────────────────

describe('S3 validateExtension', () => {
  it('TC-OSCAL-41: valid extension from real log passes with no errors', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    const result    = validateExtension(extension);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('TC-OSCAL-42: tampered party UUID produces validation errors', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    extension.responsibleParties[0].uuid = 'not-a-uuid';

    const result = validateExtension(extension);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/uuid/i);
  });

  it('TC-OSCAL-43: logged-by referencing unknown party UUID fails validation', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    extension.assessmentLog.entries[0]['logged-by'][0]['party-uuid'] = '00000000-0000-5000-8000-000000000000';

    const result = validateExtension(extension);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown party-uuid'))).toBe(true);
  });
});

// ── S3: mergeAssessmentLog ───────────────────────────────────────────────────

describe('S3 mergeAssessmentLog', () => {
  it('TC-OSCAL-44: merged OSCAL doc still passes validateOSCAL', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    const oscalDoc  = toOSCAL(buildSCA());
    mergeAssessmentLog(oscalDoc, extension);

    expect(() => validateOSCAL(oscalDoc)).not.toThrow();
  });

  it('TC-OSCAL-45: assessment-log.entries appear in results[0] after merge', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    const oscalDoc  = toOSCAL(buildSCA());
    mergeAssessmentLog(oscalDoc, extension);

    const result = oscalDoc['assessment-results'].results[0];
    expect(result).toHaveProperty('assessment-log');
    expect(Array.isArray(result['assessment-log'].entries)).toBe(true);
    expect(result['assessment-log'].entries).toHaveLength(3);
  });

  it('TC-OSCAL-46: subjects appear in results[0] after merge', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    const oscalDoc  = toOSCAL(buildSCA());
    mergeAssessmentLog(oscalDoc, extension);

    const result = oscalDoc['assessment-results'].results[0];
    expect(Array.isArray(result.subjects)).toBe(true);
    expect(result.subjects.length).toBeGreaterThanOrEqual(2);
  });

  it('TC-OSCAL-47: uat-log parties added to metadata.parties without duplicating existing parties', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    const sca       = buildSCA(); // has 1 party: Alice Smith
    const oscalDoc  = toOSCAL(sca);

    const beforeCount = oscalDoc['assessment-results'].metadata.parties.length;
    mergeAssessmentLog(oscalDoc, extension);
    const afterCount = oscalDoc['assessment-results'].metadata.parties.length;

    // Alice from uat-log (reviewer "Alice Smith" / QA Lead) is a different party-uuid
    // to Alice from signOff (email-keyed). 2 new uat-log parties (Alice QA Lead + Bob Security).
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  it('TC-OSCAL-48: throws TypeError when called with invalid oscalDoc', () => {
    const extension = buildAssessmentLogExtension('/nonexistent/uat-log.jsonl');
    expect(() => mergeAssessmentLog(null, extension)).toThrow(TypeError);
    expect(() => mergeAssessmentLog({}, extension)).toThrow(TypeError);
  });

  it('TC-OSCAL-49: merge is idempotent for party UUIDs (no duplicate parties on second call)', () => {
    const logPath   = writeUatLogFixture(SAMPLE_UAT_ENTRIES);
    const extension = buildAssessmentLogExtension(logPath);
    const oscalDoc  = toOSCAL(buildSCA());

    mergeAssessmentLog(oscalDoc, extension);
    const countAfterFirst = oscalDoc['assessment-results'].metadata.parties.length;

    mergeAssessmentLog(oscalDoc, extension);
    const countAfterSecond = oscalDoc['assessment-results'].metadata.parties.length;

    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

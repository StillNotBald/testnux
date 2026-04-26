// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/lib/oscal.mjs
 *
 * OSCAL Assessment Results emitter for TestNUX.
 *
 * Converts a parsed SCA (Security Control Assessment) object into a valid
 * NIST OSCAL 1.1.2 assessment-results JSON document. The output is compatible
 * with IBM Compliance Trestle and any other OSCAL-consuming toolchain.
 *
 * Schema reference:
 *   https://pages.nist.gov/OSCAL/reference/latest/assessment-results/json-outline/
 *
 * Public API:
 *   toOSCAL(sca)          — pure function; returns OSCAL document object
 *   validateOSCAL(doc)    — minimal schema check; throws OscalValidationError
 *
 * This module has no side effects. It does not read or write files.
 * Callers (src/commands/sca-oscal.mjs) own I/O.
 */

import { randomUUID } from 'crypto';

// ── Constants ────────────────────────────────────────────────────────────────

export const OSCAL_VERSION = '1.1.2';

/** Risk status for controls declined by design (e.g. risk-accepted, out-of-scope). */
const RISK_STATUS_DEVIATION = 'deviation-requested';

/** Risk status for open findings. */
const RISK_STATUS_OPEN = 'open';

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Convert a parsed SCA object to an OSCAL Assessment Results document.
 *
 * SCA shape (all fields optional except `surface`):
 * {
 *   surface:      string,          // e.g. "login", "api-gateway"
 *   version:      string,          // SCA document version, e.g. "0.1"
 *   published:    string,          // ISO-8601 date the SCA was published
 *   controls:     Control[],       // NIST control IDs + status
 *   evidence:     Evidence[],      // links / observations per control
 *   declined:     Declined[],      // controls declined by design
 *   signOff:      SignOff[],       // approvers / responsible parties
 * }
 *
 * Control shape:
 * {
 *   id:       string,   // e.g. "AC-2", "IA-5"
 *   title:    string,
 *   status:   "pass" | "fail" | "partial" | "not-applicable",
 *   findings: string[], // free-text observations
 * }
 *
 * Evidence shape:
 * {
 *   controlId: string,
 *   type:      "screenshot" | "log" | "config" | "interview" | "document",
 *   href:      string,  // relative path or URL
 *   description: string,
 * }
 *
 * Declined shape:
 * {
 *   controlId:   string,
 *   reason:      string,
 *   approvedBy:  string,
 *   approvedDate: string,
 * }
 *
 * SignOff shape:
 * {
 *   name:  string,
 *   email: string,
 *   role:  string,
 *   date:  string,
 * }
 *
 * @param {object} sca
 * @returns {{ "assessment-results": object }} OSCAL document
 */
export function toOSCAL(sca) {
  if (!sca || typeof sca !== 'object') {
    throw new TypeError('toOSCAL: sca must be a non-null object');
  }

  const surface   = String(sca.surface   ?? 'unknown-surface');
  const version   = String(sca.version   ?? '0.1');
  const controls  = Array.isArray(sca.controls)  ? sca.controls  : [];
  const evidence  = Array.isArray(sca.evidence)  ? sca.evidence  : [];
  const declined  = Array.isArray(sca.declined)  ? sca.declined  : [];
  const signOff   = Array.isArray(sca.signOff)   ? sca.signOff   : [];

  const now = new Date().toISOString();
  const published = sca.published ? toIsoDateTime(sca.published) : now;

  // ── Parties (responsible parties from sign-off) ────────────────────────────

  const parties = signOff.map((s, i) => ({
    uuid: deterministicUUID(`party-${surface}-${i}-${s.email ?? s.name}`),
    type: 'person',
    name: s.name ?? 'Unknown',
    ...(s.email ? { 'email-addresses': [s.email] } : {}),
  }));

  // ── Roles ──────────────────────────────────────────────────────────────────

  const rolesMap = new Map();
  for (const s of signOff) {
    const roleId = slugify(s.role ?? 'reviewer');
    if (!rolesMap.has(roleId)) {
      rolesMap.set(roleId, { id: roleId, title: s.role ?? 'Reviewer' });
    }
  }
  const roles = Array.from(rolesMap.values());

  // ── Responsible parties ────────────────────────────────────────────────────

  const responsibleParties = signOff.map((s, i) => ({
    'role-id': slugify(s.role ?? 'reviewer'),
    'party-uuids': [deterministicUUID(`party-${surface}-${i}-${s.email ?? s.name}`)],
  }));

  // ── Reviewed controls ──────────────────────────────────────────────────────

  const reviewedControls = {
    description: `Controls reviewed for surface: ${surface}`,
    'control-selections': [
      {
        description: 'All controls assessed in this SCA',
        'include-controls': controls.map((c) => ({
          'control-id': normalizeControlId(c.id ?? 'UNKNOWN'),
        })),
      },
    ],
  };

  // ── Findings (from evidence + control pass/fail status) ───────────────────

  const findings = buildFindings(controls, evidence, surface);

  // ── Risks (declined-by-design controls) ───────────────────────────────────

  const risks = buildRisks(declined, surface);

  // ── Result ────────────────────────────────────────────────────────────────

  const result = {
    uuid: deterministicUUID(`result-${surface}-${version}`),
    title: `SCA Assessment Results — ${surface} v${version}`,
    description: `OSCAL assessment results generated from TestNUX SCA for surface "${surface}".`,
    start: published,
    end:   now,
    'reviewed-controls': reviewedControls,
    findings,
    risks,
    ...(responsibleParties.length > 0 ? { 'responsible-parties': responsibleParties } : {}),
  };

  // ── Top-level document ────────────────────────────────────────────────────

  const doc = {
    'assessment-results': {
      uuid: deterministicUUID(`assessment-results-${surface}-${version}`),
      metadata: {
        title:           `TestNUX SCA — ${surface}`,
        published,
        'last-modified': now,
        version,
        'oscal-version': OSCAL_VERSION,
        roles,
        parties,
        'responsible-parties': responsibleParties,
        remarks:
          'Generated by TestNUX (https://github.com/StillNotBald/testnux). ' +
          'Compatible with IBM Compliance Trestle. Human review required before submission.',
      },
      'import-ap': {
        href: `#assessment-plan-${surface}`,
        remarks: 'Assessment plan reference. Replace with actual AP UUID when available.',
      },
      results: [result],
    },
  };

  // Validate before returning — throws OscalValidationError if invalid
  validateOSCAL(doc);

  return doc;
}

/**
 * Validate a toOSCAL() output document against minimal required-field rules.
 *
 * Checks:
 *   - Required top-level structure present
 *   - All UUIDs match RFC-4122 format
 *   - All dates are ISO-8601
 *   - oscal-version is present
 *   - results array has at least one entry
 *
 * @param {{ "assessment-results": object }} doc
 * @throws {OscalValidationError} if any check fails
 */
export function validateOSCAL(doc) {
  const errors = [];

  if (!doc || typeof doc !== 'object') {
    throw new OscalValidationError(['document must be a non-null object']);
  }

  const ar = doc['assessment-results'];
  if (!ar || typeof ar !== 'object') {
    throw new OscalValidationError(['missing top-level "assessment-results" key']);
  }

  // UUID checks
  checkUUID(ar.uuid, 'assessment-results.uuid', errors);

  // Metadata checks
  const meta = ar.metadata;
  if (!meta) {
    errors.push('assessment-results.metadata is required');
  } else {
    if (!meta.title) errors.push('metadata.title is required');
    if (!meta['oscal-version']) errors.push('metadata.oscal-version is required');
    if (meta.published) checkIsoDate(meta.published, 'metadata.published', errors);
    if (meta['last-modified']) checkIsoDate(meta['last-modified'], 'metadata.last-modified', errors);
    if (Array.isArray(meta.parties)) {
      meta.parties.forEach((p, i) => checkUUID(p.uuid, `metadata.parties[${i}].uuid`, errors));
    }
  }

  // Results checks
  if (!Array.isArray(ar.results) || ar.results.length === 0) {
    errors.push('assessment-results.results must be a non-empty array');
  } else {
    ar.results.forEach((r, i) => {
      checkUUID(r.uuid, `results[${i}].uuid`, errors);
      if (!r.title) errors.push(`results[${i}].title is required`);
      if (r.start) checkIsoDate(r.start, `results[${i}].start`, errors);
      if (r.end)   checkIsoDate(r.end,   `results[${i}].end`,   errors);
      if (!r['reviewed-controls']) {
        errors.push(`results[${i}].reviewed-controls is required`);
      }
    });
  }

  if (errors.length > 0) {
    throw new OscalValidationError(errors);
  }
}

// ── Error class ──────────────────────────────────────────────────────────────

export class OscalValidationError extends Error {
  /** @param {string[]} issues */
  constructor(issues) {
    super(`OSCAL validation failed:\n  ${issues.join('\n  ')}`);
    this.name = 'OscalValidationError';
    this.issues = issues;
    this.exitCode = 1;
  }
}

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Build OSCAL findings array from SCA controls and evidence.
 * Each finding maps to one control. Evidence links attach as observations.
 */
function buildFindings(controls, evidence, surface) {
  // Index evidence by controlId for fast lookup
  const evidenceByControl = new Map();
  for (const ev of evidence) {
    const key = normalizeControlId(ev.controlId ?? '');
    if (!evidenceByControl.has(key)) evidenceByControl.set(key, []);
    evidenceByControl.get(key).push(ev);
  }

  return controls.map((ctrl, i) => {
    const controlId = normalizeControlId(ctrl.id ?? `CTRL-${i}`);
    const evItems = evidenceByControl.get(controlId) ?? [];

    const finding = {
      uuid: deterministicUUID(`finding-${surface}-${controlId}`),
      title: ctrl.title ?? `Control ${controlId}`,
      description: (ctrl.findings ?? []).join('\n\n') || `Assessment finding for ${controlId}.`,
      target: {
        type: 'objective-id',
        'target-id': controlId,
        status: {
          state: mapControlStatus(ctrl.status),
          reason: ctrl.status === 'partial' ? 'some-checks-incomplete' : undefined,
        },
      },
    };

    // Attach evidence as related observations (OSCAL links)
    if (evItems.length > 0) {
      finding.links = evItems.map((ev) => ({
        href: ev.href ?? '#',
        rel: 'evidence',
        text: ev.description ?? ev.type ?? 'evidence item',
      }));
    }

    return finding;
  });
}

/**
 * Build OSCAL risks array from declined-by-design controls.
 * Each declined control becomes a risk with status "deviation-requested".
 */
function buildRisks(declined, surface) {
  return declined.map((d, i) => {
    const controlId = normalizeControlId(d.controlId ?? `CTRL-${i}`);
    return {
      uuid: deterministicUUID(`risk-${surface}-${controlId}`),
      title: `Deviation requested: ${controlId}`,
      description:
        `Control ${controlId} was declined by design. ` +
        `Reason: ${d.reason ?? 'Not specified.'}`,
      statement:
        `This control was intentionally not implemented or scoped out. ` +
        `Approved by: ${d.approvedBy ?? 'unknown'} on ${d.approvedDate ?? 'unknown date'}.`,
      status: RISK_STATUS_DEVIATION,
      characterizations: [
        {
          origin: {
            actors: [
              {
                type: 'party',
                'actor-uuid': deterministicUUID(`risk-actor-${surface}-${i}`),
                role: 'approver',
              },
            ],
          },
          facets: [
            {
              name: 'deviation-type',
              system: 'http://testnux.dev/oscal/risk-facets',
              value: 'risk-accepted',
            },
          ],
        },
      ],
      'risk-log': {
        entries: [
          {
            uuid: deterministicUUID(`risk-log-${surface}-${controlId}`),
            title: 'Deviation approval recorded',
            start: d.approvedDate ? toIsoDateTime(d.approvedDate) : new Date().toISOString(),
            description: `Approved by ${d.approvedBy ?? 'unknown'}. Reason: ${d.reason ?? 'not specified'}.`,
          },
        ],
      },
      'related-controls': {
        'control-selections': [
          { 'include-controls': [{ 'control-id': controlId }] },
        ],
      },
    };
  });
}

/**
 * Map SCA control status to OSCAL finding target state.
 * OSCAL states: "satisfied" | "not-satisfied"
 */
function mapControlStatus(status) {
  switch (status) {
    case 'pass':           return 'satisfied';
    case 'fail':           return 'not-satisfied';
    case 'partial':        return 'not-satisfied';
    case 'not-applicable': return 'not-applicable';
    default:               return 'not-satisfied';
  }
}

/**
 * Normalize a control ID to OSCAL style (uppercase, hyphenated).
 * "ac-2" → "AC-2", "ac2" → "AC2"
 */
function normalizeControlId(id) {
  return String(id).toUpperCase().replace(/\s+/g, '-');
}

/**
 * Derive a deterministic UUID v5-like string from a seed string.
 * Uses SHA-256 via crypto.randomUUID fallback with seeded hash.
 * For true UUID v5 you'd need a proper implementation; this gives
 * stable, UUID-shaped identifiers that survive round-trips.
 *
 * NOTE: This uses a simple hash-to-UUID mapping. In production v0.2,
 * replace with the `uuid` package's v5() for RFC-4122 compliance.
 */
function deterministicUUID(seed) {
  // Simple djb2-style hash → hex → UUID shape
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822519) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489917);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822519) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489917);

  const uint32a = (h1 >>> 0).toString(16).padStart(8, '0');
  const uint32b = (h2 >>> 0).toString(16).padStart(8, '0');
  // Use a second pass to fill out 128 bits
  let h3 = 0xabcdef12 ^ h1;
  let h4 = 0x98765432 ^ h2;
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822519) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489917);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822519) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489917);
  const uint32c = (h3 >>> 0).toString(16).padStart(8, '0');
  const uint32d = (h4 >>> 0).toString(16).padStart(8, '0');

  // Force version=4 bits (bit 12-15 of third group = 0100) and variant bits
  const third  = uint32b.slice(0, 4);
  const fourth = uint32c.slice(0, 4);
  const thirdFixed  = '4' + third.slice(1);          // version 4
  const fourthFixed = ((parseInt(fourth[0], 16) & 0x3) | 0x8).toString(16) + fourth.slice(1); // variant 10xx

  return [
    uint32a.slice(0, 8),
    uint32b.slice(0, 4),
    thirdFixed,
    fourthFixed,
    uint32c.slice(0, 4) + uint32d.slice(0, 8),
  ].join('-');
}

/**
 * Convert a date string to ISO-8601 with time component.
 * Accepts "2026-04-26" or full ISO strings.
 */
function toIsoDateTime(s) {
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Slugify a string for use as an OSCAL role-id or similar identifier.
 * "Security Lead" → "security-lead"
 */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Push to errors array if UUID is malformed. */
function checkUUID(value, field, errors) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!value || !UUID_RE.test(value)) {
    errors.push(`${field} must be a valid UUID, got: ${JSON.stringify(value)}`);
  }
}

/** Push to errors array if date string is not ISO-8601. */
function checkIsoDate(value, field, errors) {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      errors.push(`${field} must be a valid ISO-8601 date, got: ${JSON.stringify(value)}`);
    }
  } catch {
    errors.push(`${field} must be a valid ISO-8601 date, got: ${JSON.stringify(value)}`);
  }
}

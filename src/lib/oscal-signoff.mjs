// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/lib/oscal-signoff.mjs
 *
 * S3: OSCAL assessment-log integration.
 *
 * Converts uat-log.jsonl entries into OSCAL 1.1.2 compliant structures:
 *   - responsible-parties  (unique name+role pairs from the log)
 *   - assessment-log.entries  (one OSCAL log entry per uat-log entry)
 *   - subjects[]  (one subject per TC referenced in uat-log)
 *
 * UUIDs use the same TESTNUX_OSCAL_NAMESPACE as src/lib/oscal.mjs (v5 SHA-1).
 * The namespace constant is imported, never duplicated.
 *
 * Public API:
 *   buildAssessmentLogExtension(uatLogPath)
 *     → { responsibleParties, assessmentLog, subjects }
 *
 *   mergeAssessmentLog(oscalDoc, extension)
 *     → mutates and returns the OSCAL doc with the extension spliced in.
 *
 * This module has NO side effects. Callers own I/O.
 */

import fs from 'fs';
import { v5 as uuidv5 } from 'uuid';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Stable namespace UUID — MUST match src/lib/oscal.mjs TESTNUX_OSCAL_NAMESPACE.
 * Do not change. Changing it invalidates all previously-generated OSCAL UUIDs.
 */
const TESTNUX_OSCAL_NAMESPACE = 'b0ab198a-bced-48a9-ae15-e5c4ca770a79';

// RFC-4122 UUID pattern — same regex used by validateOSCAL in oscal.mjs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build OSCAL extension data from a uat-log.jsonl file.
 *
 * Each line of the uat-log becomes one assessment-log entry.
 * Unique (name + role) combos become responsible-parties.
 * Unique TC-IDs become subjects.
 *
 * @param {string} uatLogPath  - absolute path to uat-log.jsonl
 * @returns {{
 *   responsibleParties: object[],
 *   assessmentLog:      { entries: object[] },
 *   subjects:           object[],
 * }}
 */
export function buildAssessmentLogExtension(uatLogPath) {
  const rawEntries = readUatLog(uatLogPath);

  // ── Index unique (name + role) pairs → party UUID ────────────────────────

  const partyMap = new Map(); // key: "name||role" → partyUUID
  for (const e of rawEntries) {
    const key = `${e.reviewer}||${e.reviewer_role}`;
    if (!partyMap.has(key)) {
      partyMap.set(key, deterministicUUID(`uat-party-${e.reviewer}-${e.reviewer_role}`));
    }
  }

  // ── Build responsible-parties array ──────────────────────────────────────

  const responsibleParties = [];
  for (const [key, uuid] of partyMap.entries()) {
    const [name, role] = key.split('||');
    responsibleParties.push({
      uuid,
      type: 'person',
      name: name ?? 'Unknown',
      props: [
        {
          name: 'role',
          ns: 'http://testnux.dev/oscal/props',
          value: role ?? 'reviewer',
        },
      ],
    });
  }

  // ── Build assessment-log entries ──────────────────────────────────────────

  const entries = rawEntries.map((e) => {
    const partyKey = `${e.reviewer}||${e.reviewer_role}`;
    const partyUuid = partyMap.get(partyKey);

    // UUID derived from hash — reproducible for the same log entry
    const entryUuid = deterministicUUID(`uat-log-entry-${e.tc_id}-${e.ts}-${e.signature ?? ''}`);
    const taskUuid  = deterministicUUID(`uat-task-${e.tc_id}`);

    const start = toIsoDateTime(e.ts);
    const end   = start; // sign-off is instantaneous; start === end is valid OSCAL

    return {
      uuid: entryUuid,
      title: `${e.tc_id}: ${e.status}`,
      description:
        e.justification && e.justification.trim().length > 0
          ? e.justification.trim()
          : 'Test execution attested.',
      start,
      end,
      'logged-by': [
        { 'party-uuid': partyUuid },
      ],
      'related-tasks': [
        { 'task-uuid': taskUuid },
      ],
      props: [
        {
          name: 'tc-id',
          ns: 'http://testnux.dev/oscal/props',
          value: e.tc_id,
        },
        {
          name: 'attestation-status',
          ns: 'http://testnux.dev/oscal/props',
          value: e.status,
        },
        {
          name: 'chain-hash',
          ns: 'http://testnux.dev/oscal/props',
          value: (e.signature ?? '').slice(0, 16) + '…',
          remarks: 'Truncated HMAC-SHA256 signature from uat-log.jsonl for chain linkage.',
        },
      ],
    };
  });

  // ── Build subjects array (one per unique TC-ID) ───────────────────────────

  const seenTcIds = new Set();
  const subjects = [];
  for (const e of rawEntries) {
    if (!seenTcIds.has(e.tc_id)) {
      seenTcIds.add(e.tc_id);
      subjects.push({
        uuid: deterministicUUID(`uat-subject-${e.tc_id}`),
        type: 'component',
        description: `Test case ${e.tc_id} — attested via uat-log.jsonl.`,
        props: [
          {
            name: 'tc-id',
            ns: 'http://testnux.dev/oscal/props',
            value: e.tc_id,
          },
        ],
        'relevant-evidence': [
          {
            description: `UAT sign-off recorded for ${e.tc_id} with status: ${e.status}.`,
          },
        ],
      });
    }
  }

  return {
    responsibleParties,
    assessmentLog: { entries },
    subjects,
  };
}

/**
 * Splice the assessment-log extension into an existing OSCAL doc (in-place).
 *
 * Merges responsible-parties (deduplicated by uuid), adds subjects[] to the
 * first result, and sets result.assessment-log.
 *
 * @param {{ "assessment-results": object }} oscalDoc  - output of toOSCAL()
 * @param {{ responsibleParties, assessmentLog, subjects }} extension
 * @returns {{ "assessment-results": object }}  the same doc, mutated
 */
export function mergeAssessmentLog(oscalDoc, extension) {
  if (!oscalDoc || !oscalDoc['assessment-results']) {
    throw new TypeError('mergeAssessmentLog: oscalDoc must be a valid OSCAL document');
  }

  const ar     = oscalDoc['assessment-results'];
  const meta   = ar.metadata ?? {};
  const result = (ar.results ?? [])[0];

  if (!result) {
    throw new TypeError('mergeAssessmentLog: OSCAL doc has no results[0] to merge into');
  }

  // ── Merge responsible-parties into metadata.parties ───────────────────────

  const existingPartyUuids = new Set((meta.parties ?? []).map((p) => p.uuid));
  const newParties = extension.responsibleParties.filter(
    (p) => !existingPartyUuids.has(p.uuid)
  );
  meta.parties = [...(meta.parties ?? []), ...newParties];

  // ── Merge responsible-parties into result.responsible-parties ─────────────

  const existingResultPartyUuids = new Set(
    (result['responsible-parties'] ?? []).flatMap((rp) => rp['party-uuids'] ?? [])
  );
  const newRPs = extension.responsibleParties
    .filter((p) => !existingResultPartyUuids.has(p.uuid))
    .map((p) => {
      const role = p.props?.find((prop) => prop.name === 'role')?.value ?? 'reviewer';
      return {
        'role-id': slugify(role),
        'party-uuids': [p.uuid],
      };
    });

  result['responsible-parties'] = [
    ...(result['responsible-parties'] ?? []),
    ...newRPs,
  ];

  // ── Add roles to metadata for any new role-ids ────────────────────────────

  const existingRoleIds = new Set((meta.roles ?? []).map((r) => r.id));
  for (const p of extension.responsibleParties) {
    const role = p.props?.find((prop) => prop.name === 'role')?.value ?? 'Reviewer';
    const roleId = slugify(role);
    if (!existingRoleIds.has(roleId)) {
      existingRoleIds.add(roleId);
      meta.roles = meta.roles ?? [];
      meta.roles.push({ id: roleId, title: role });
    }
  }

  // ── Set assessment-log in result ──────────────────────────────────────────

  result['assessment-log'] = extension.assessmentLog;

  // ── Merge subjects into result ────────────────────────────────────────────

  const existingSubjectUuids = new Set((result.subjects ?? []).map((s) => s.uuid));
  const newSubjects = extension.subjects.filter((s) => !existingSubjectUuids.has(s.uuid));
  result.subjects = [...(result.subjects ?? []), ...newSubjects];

  return oscalDoc;
}

/**
 * Validate the extension structures added by buildAssessmentLogExtension.
 *
 * Checks:
 *   - All party UUIDs are RFC-4122 format
 *   - All entry UUIDs are RFC-4122 format
 *   - All entry timestamps are ISO-8601
 *   - logged-by references a known party UUID
 *
 * @param {{ responsibleParties, assessmentLog, subjects }} extension
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateExtension(extension) {
  const errors = [];

  const knownPartyUuids = new Set(extension.responsibleParties.map((p) => p.uuid));

  // Validate party UUIDs
  for (const [i, p] of extension.responsibleParties.entries()) {
    if (!UUID_RE.test(p.uuid)) {
      errors.push(`responsibleParties[${i}].uuid is not RFC-4122: ${JSON.stringify(p.uuid)}`);
    }
  }

  // Validate log entries
  for (const [i, e] of (extension.assessmentLog?.entries ?? []).entries()) {
    if (!UUID_RE.test(e.uuid)) {
      errors.push(`assessmentLog.entries[${i}].uuid is not RFC-4122: ${JSON.stringify(e.uuid)}`);
    }
    if (!isIso8601(e.start)) {
      errors.push(`assessmentLog.entries[${i}].start is not ISO-8601: ${JSON.stringify(e.start)}`);
    }
    if (!isIso8601(e.end)) {
      errors.push(`assessmentLog.entries[${i}].end is not ISO-8601: ${JSON.stringify(e.end)}`);
    }
    for (const lb of e['logged-by'] ?? []) {
      if (!knownPartyUuids.has(lb['party-uuid'])) {
        errors.push(
          `assessmentLog.entries[${i}].logged-by references unknown party-uuid: ${lb['party-uuid']}`
        );
      }
    }
  }

  // Validate subject UUIDs
  for (const [i, s] of extension.subjects.entries()) {
    if (!UUID_RE.test(s.uuid)) {
      errors.push(`subjects[${i}].uuid is not RFC-4122: ${JSON.stringify(s.uuid)}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Internals ─────────────────────────────────────────────────────────────────

/**
 * Read a uat-log.jsonl file and return parsed entries.
 * Returns [] if file doesn't exist. Skips malformed and schema lines.
 *
 * @param {string} jsonlPath
 * @returns {object[]}
 */
function readUatLog(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) return [];

  const raw = fs.readFileSync(jsonlPath, 'utf-8');
  const entries = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('{"_schema"')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.tc_id && parsed.status && parsed.reviewer) {
        entries.push(parsed);
      }
    } catch {
      // skip malformed lines
    }
  }

  return entries;
}

/**
 * Generate a deterministic UUID v5 from a seed string.
 * Uses the same TESTNUX_OSCAL_NAMESPACE — MUST NOT use a different namespace.
 */
function deterministicUUID(seed) {
  if (typeof seed !== 'string' || seed.length === 0) {
    throw new TypeError('deterministicUUID requires a non-empty string seed');
  }
  return uuidv5(seed, TESTNUX_OSCAL_NAMESPACE);
}

/**
 * Convert a date string to ISO-8601 with time component.
 * If parsing fails, returns current time (fallback for robustness).
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

/** Check if a string is a parseable ISO-8601 date-time. */
function isIso8601(s) {
  if (typeof s !== 'string') return false;
  try {
    const d = new Date(s);
    return !isNaN(d.getTime());
  } catch {
    return false;
  }
}

/**
 * Slugify a string for OSCAL role-id.
 * "Security Lead" → "security-lead"
 */
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

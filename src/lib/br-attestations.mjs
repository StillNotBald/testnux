// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/lib/br-attestations.mjs
 *
 * S5: Multi-reviewer N-of-M attestation chain for Business Requirements.
 *
 * Each BR that declares `required_reviewers` in its frontmatter needs
 * attestations from one or more role+count combinations before it is
 * considered COMPLETE.
 *
 * Storage format: <folder>/br-attestations.jsonl
 *   One JSON object per line, HMAC-chained (same pattern as uat-log.jsonl).
 *
 * Entry shape:
 *   {
 *     br_id:         string,   // "BR-01"
 *     tc_id:         string,   // TC that triggered this attestation
 *     reviewer:      string,   // name
 *     reviewer_role: string,   // role string (must match required_reviewers[].role)
 *     status:        string,   // "attested" | "revoked"
 *     justification: string,
 *     ts:            string,   // ISO-8601
 *     prev_hash:     string,   // HMAC of previous line's raw JSON
 *     signature:     string,   // HMAC of (br_id|tc_id|reviewer|reviewer_role|status|ts)
 *   }
 *
 * Public API:
 *   appendAttestation(jsonlPath, entry, secret)   → full entry written
 *   revokeAttestation(jsonlPath, entry, secret)   → revocation entry written
 *   getAttestationStatus(jsonlPath, requiredReviewers) → { complete, partial, counts }
 *   verifyAttestationChain(jsonlPath, secret)     → { valid, brokenAt, errors }
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a signed, hash-chained attestation entry.
 *
 * @param {string} jsonlPath  - absolute path to br-attestations.jsonl
 * @param {object} entry      - { br_id, tc_id, reviewer, reviewer_role, justification? }
 * @param {string} secret     - HMAC secret (process.env.UAT_SECRET)
 * @returns {object}          - full entry with ts, prev_hash, signature
 */
export function appendAttestation(jsonlPath, entry, secret) {
  validateSecret(secret);
  validateRequiredFields(entry, ['br_id', 'tc_id', 'reviewer', 'reviewer_role']);

  fs.mkdirSync(path.dirname(path.resolve(jsonlPath)), { recursive: true });

  const ts       = new Date().toISOString();
  const status   = 'attested';
  const prevHash = computePrevHash(jsonlPath, secret);
  const sigInput = [entry.br_id, entry.tc_id, entry.reviewer, entry.reviewer_role, status, ts].join('|');
  const signature = hmac(secret, sigInput);

  const fullEntry = {
    br_id:         entry.br_id,
    tc_id:         entry.tc_id,
    reviewer:      entry.reviewer,
    reviewer_role: entry.reviewer_role,
    status,
    justification: entry.justification ?? '',
    ts,
    prev_hash:     prevHash,
    signature,
  };

  fs.appendFileSync(jsonlPath, JSON.stringify(fullEntry) + '\n', 'utf-8');
  return fullEntry;
}

/**
 * Append a revocation entry (append-only — never deletes).
 * Revocations cancel a prior "attested" record for the same reviewer+role.
 *
 * @param {string} jsonlPath
 * @param {object} entry  - { br_id, tc_id, reviewer, reviewer_role, justification? }
 * @param {string} secret
 * @returns {object}
 */
export function revokeAttestation(jsonlPath, entry, secret) {
  validateSecret(secret);
  validateRequiredFields(entry, ['br_id', 'tc_id', 'reviewer', 'reviewer_role']);

  if (!fs.existsSync(jsonlPath)) {
    const err = new Error(`No attestation file found at ${jsonlPath}. Nothing to revoke.`);
    err.exitCode = 2;
    throw err;
  }

  const ts       = new Date().toISOString();
  const status   = 'revoked';
  const prevHash = computePrevHash(jsonlPath, secret);
  const sigInput = [entry.br_id, entry.tc_id, entry.reviewer, entry.reviewer_role, status, ts].join('|');
  const signature = hmac(secret, sigInput);

  const fullEntry = {
    br_id:         entry.br_id,
    tc_id:         entry.tc_id,
    reviewer:      entry.reviewer,
    reviewer_role: entry.reviewer_role,
    status,
    justification: entry.justification ?? '',
    ts,
    prev_hash:     prevHash,
    signature,
  };

  fs.appendFileSync(jsonlPath, JSON.stringify(fullEntry) + '\n', 'utf-8');
  return fullEntry;
}

/**
 * Compute the current attestation status for a BR against its required_reviewers.
 *
 * Walks the log, applying attestations and revocations in order.
 * The effective state of each (reviewer + role) is the last record for that pair.
 *
 * @param {string} jsonlPath  - path to br-attestations.jsonl (may not exist)
 * @param {Array<{ role: string, count: number }>} requiredReviewers
 * @returns {{
 *   complete:   boolean,
 *   partial:    boolean,
 *   counts:     Map<string, { required: number, actual: number, reviewers: string[] }>,
 *   warnings:   string[],
 * }}
 */
export function getAttestationStatus(jsonlPath, requiredReviewers) {
  // If no requirements, always complete (backward compat)
  if (!requiredReviewers || requiredReviewers.length === 0) {
    return {
      complete: true,
      partial:  false,
      counts:   new Map(),
      warnings: [],
    };
  }

  const entries  = readEntries(jsonlPath);
  const warnings = [];

  // Track effective attestation state per (reviewer + role)
  // Key: "reviewer||role" → "attested" | "revoked"
  const effectiveState = new Map();

  for (const e of entries) {
    const key = `${e.reviewer}||${e.reviewer_role}`;
    effectiveState.set(key, e.status);
  }

  // Collect active attestations per role
  // roleToReviewers: Map<role, Set<reviewer>>
  const roleToReviewers = new Map();
  for (const [key, status] of effectiveState.entries()) {
    if (status !== 'attested') continue;
    const [reviewer, role] = key.split('||');
    if (!roleToReviewers.has(role)) roleToReviewers.set(role, new Set());
    roleToReviewers.get(role).add(reviewer);
  }

  // Check for single reviewer counted in multiple required roles
  const reviewerRoles = new Map(); // reviewer → Set<role>
  for (const [role, reviewers] of roleToReviewers.entries()) {
    for (const reviewer of reviewers) {
      if (!reviewerRoles.has(reviewer)) reviewerRoles.set(reviewer, new Set());
      reviewerRoles.get(reviewer).add(role);
    }
  }
  for (const [reviewer, roles] of reviewerRoles.entries()) {
    if (roles.size > 1) {
      warnings.push(
        `[VERIFY] Single reviewer counted in ${roles.size} required roles: ` +
        `"${reviewer}" attested as: ${[...roles].join(', ')}`
      );
    }
  }

  // Build counts map and determine completion
  const counts = new Map();
  let allMet   = true;

  for (const req of requiredReviewers) {
    const role      = req.role;
    const required  = req.count ?? 1;
    const reviewers = [...(roleToReviewers.get(role) ?? new Set())];
    const actual    = reviewers.length;

    if (actual < required) allMet = false;

    counts.set(role, { required, actual, reviewers });
  }

  const anyMet = [...counts.values()].some((c) => c.actual >= c.required);

  return {
    complete: allMet,
    partial:  !allMet && anyMet,
    counts,
    warnings,
  };
}

/**
 * Verify chain integrity of a br-attestations.jsonl file.
 *
 * @param {string} jsonlPath
 * @param {string} secret
 * @returns {{ valid: boolean, brokenAt: number | null, errors: string[] }}
 */
export function verifyAttestationChain(jsonlPath, secret) {
  validateSecret(secret);

  const rawLines = readRawLines(jsonlPath);
  if (rawLines.length === 0) return { valid: true, brokenAt: null, errors: [] };

  const errors     = [];
  let prevRawJson  = null;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      errors.push(`Line ${i + 1}: JSON parse error`);
      return { valid: false, brokenAt: i + 1, errors };
    }

    // Verify prev_hash
    const expectedPrevHash = prevRawJson === null
      ? emptyHash(secret)
      : hmac(secret, prevRawJson);

    if (entry.prev_hash !== expectedPrevHash) {
      errors.push(
        `Line ${i + 1} (${entry.br_id}/${entry.tc_id}): prev_hash mismatch — chain broken.`
      );
      return { valid: false, brokenAt: i + 1, errors };
    }

    // Verify signature
    const sigInput = [
      entry.br_id, entry.tc_id, entry.reviewer, entry.reviewer_role, entry.status, entry.ts,
    ].join('|');
    const expectedSig = hmac(secret, sigInput);
    if (entry.signature !== expectedSig) {
      errors.push(
        `Line ${i + 1} (${entry.br_id}/${entry.tc_id}): signature mismatch — entry may be tampered.`
      );
      return { valid: false, brokenAt: i + 1, errors };
    }

    prevRawJson = raw;
  }

  return { valid: true, brokenAt: null, errors };
}

/**
 * Format attestation status as a display string for RTM.
 *
 * @param {{ complete, partial, counts }} status
 * @returns {string}  e.g. "✓ QA(1/1) ✗ Compliance(0/1) — PARTIAL (1/2)"
 */
export function formatAttestationStatus(status) {
  if (!status || !status.counts || status.counts.size === 0) {
    return '_(no required reviewers)_';
  }

  const parts = [];
  let metCount  = 0;
  let total     = 0;

  for (const [role, info] of status.counts.entries()) {
    const met = info.actual >= info.required;
    if (met) metCount++;
    total++;
    parts.push(
      `${met ? '✓' : '✗'} ${role}(${info.actual}/${info.required})`
    );
  }

  if (status.complete) {
    return parts.join(' ') + ' — COMPLETE';
  } else {
    return parts.join(' ') + ` — PARTIAL (${metCount}/${total})`;
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data, 'utf-8').digest('hex');
}

function emptyHash(secret) {
  return hmac(secret, '');
}

function computePrevHash(jsonlPath, secret) {
  const lines = readRawLines(jsonlPath);
  if (lines.length === 0) return emptyHash(secret);
  return hmac(secret, lines[lines.length - 1]);
}

function readRawLines(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) return [];
  return fs
    .readFileSync(jsonlPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('{"_schema"'));
}

function readEntries(jsonlPath) {
  return readRawLines(jsonlPath).flatMap((raw) => {
    try {
      const e = JSON.parse(raw);
      if (e && e.br_id && e.reviewer && e.reviewer_role && e.status) return [e];
      return [];
    } catch {
      return [];
    }
  });
}

function validateSecret(secret) {
  if (!secret) {
    const err = new Error('UAT_SECRET is required for attestation chain operations');
    err.exitCode = 2;
    throw err;
  }
}

function validateRequiredFields(obj, fields) {
  for (const f of fields) {
    if (!obj[f]) {
      const err = new Error(`br-attestations: entry.${f} is required`);
      err.exitCode = 2;
      throw err;
    }
  }
}

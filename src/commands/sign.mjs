// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/sign.mjs
 *
 * Implements `testnux sign` — stakeholder sign-off with e-signature.
 *
 * Usage:
 *   testnux sign <surface>
 *     Interactive prompt: reviewer name, role, TC-ID, status, justification.
 *     Computes HMAC-SHA256 signature using UAT_SECRET env var.
 *     Appends entry to <surface>/uat-log.jsonl (hash-chained).
 *     Writes sign-off record into requirements/validations/<surface>/.
 *
 *   testnux sign <surface> --reject <TC-ID>
 *     Batch-reject a specific TC-ID (still prompts for name, role, justification).
 *
 * E-signature notice:
 *   The HMAC signature generated here creates an audit-trail record suitable for
 *   internal SOC 2 / ISO 27001 evidence. It is NOT a court-admissible e-signature
 *   under eIDAS, ESIGN, or UETA without separate legal counsel and infrastructure.
 *
 * Env:
 *   UAT_SECRET — required; the HMAC signing key for this project's UAT log.
 *                Set in .env.local and do not commit to version control.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { appendEntry } from '../lib/uat-log.mjs';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {string} surface   - folder name for this test pass (e.g. "2026-04-26_login-23-tc")
 * @param {object} opts      - { reject?: string, json?: boolean, outDir?: string }
 */
export async function runSign(surface, opts = {}) {
  const { reject: rejectTcId, json = false, outDir = '.' } = opts;

  const secret = process.env.UAT_SECRET;
  if (!secret) {
    const err = new Error(
      'UAT_SECRET environment variable is not set.\n' +
      '  Add UAT_SECRET=<your-secret> to .env.local (never commit this value).'
    );
    err.exitCode = 2;
    throw err;
  }

  const surfaceDir = path.resolve(outDir, surface);
  if (!fs.existsSync(surfaceDir)) {
    const err = new Error(
      `Surface folder not found: ${surfaceDir}\n` +
      `  Run \`testnux init ${surface.replace(/^\d{4}-\d{2}-\d{2}_/, '')}\` first.`
    );
    err.exitCode = 2;
    throw err;
  }

  // Collect reviewer info interactively
  const answers = await promptReviewer({ rejectTcId });

  const { reviewer, reviewerRole, tcId, status, justification } = answers;

  // Append to hash-chained JSONL log
  const logPath = path.join(surfaceDir, 'uat-log.jsonl');
  const entry = appendEntry(
    logPath,
    { tc_id: tcId, status, reviewer, reviewer_role: reviewerRole, justification },
    secret
  );

  log(json, { event: 'sign.done', entry });

  // Write sign-off record into requirements/validations/<surface>/
  const validationsDir = path.resolve(outDir, 'requirements', 'validations', surface);
  fs.mkdirSync(validationsDir, { recursive: true });
  writeValidationRecord(validationsDir, entry, surface);

  if (!json) {
    console.log('');
    console.log('[sign] Entry appended to ' + logPath);
    console.log(`  TC-ID     : ${entry.tc_id}`);
    console.log(`  Status    : ${entry.status}`);
    console.log(`  Reviewer  : ${entry.reviewer} (${entry.reviewer_role})`);
    console.log(`  Timestamp : ${entry.ts}`);
    console.log(`  Signature : ${entry.signature.slice(0, 16)}…`);
    console.log('');
    console.log(
      '[sign] NOTICE: This HMAC signature is an audit-trail record, not a court-admissible\n' +
      '  e-signature under eIDAS/ESIGN/UETA. Consult legal counsel for binding signatures.'
    );
    console.log('');
  }

  return entry;
}

// ── Interactive prompt ────────────────────────────────────────────────────────

/**
 * @param {{ rejectTcId?: string }} opts
 * @returns {Promise<{ reviewer, reviewerRole, tcId, status, justification }>}
 */
async function promptReviewer({ rejectTcId } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  try {
    console.error(''); // separator
    const reviewer = (await ask('Reviewer name          : ')).trim();
    if (!reviewer) throw promptError('Reviewer name is required');

    const reviewerRole = (await ask('Reviewer role          : ')).trim();
    if (!reviewerRole) throw promptError('Reviewer role is required');

    let tcId;
    if (rejectTcId) {
      tcId = rejectTcId.trim();
      console.error(`TC-ID (--reject)       : ${tcId}`);
    } else {
      tcId = (await ask('TC-ID (e.g. LOGIN-01)  : ')).trim();
      if (!tcId) throw promptError('TC-ID is required');
    }

    let status;
    if (rejectTcId) {
      status = 'rejected';
      console.error(`Status (--reject)      : rejected`);
    } else {
      const rawStatus = (
        await ask('Status [accepted|rejected|needs-rework] : ')
      ).trim().toLowerCase();
      const validStatuses = ['accepted', 'rejected', 'needs-rework'];
      if (!validStatuses.includes(rawStatus)) {
        throw promptError(`Status must be one of: ${validStatuses.join(', ')}`);
      }
      status = rawStatus;
    }

    let justification = '';
    if (status === 'rejected' || status === 'needs-rework') {
      justification = (await ask('Justification (required for rejection/rework) : ')).trim();
      if (!justification) throw promptError('Justification is required when rejecting or requesting rework');
    } else {
      justification = (await ask('Justification (optional) : ')).trim();
    }

    rl.close();
    return { reviewer, reviewerRole, tcId, status, justification };
  } catch (err) {
    rl.close();
    throw err;
  }
}

// ── Validation record writer ──────────────────────────────────────────────────

/**
 * Append or create a sign-off record in requirements/validations/<surface>/.
 * Uses a marker convention so multiple entries accumulate in the same file.
 */
function writeValidationRecord(validationsDir, entry, surface) {
  const recordFile = path.join(validationsDir, `sign-off.md`);

  const HEADER_MARKER = '<!-- testnux: sign-off log -->';
  const entryBlock = [
    '',
    `### ${entry.ts} — ${entry.tc_id}`,
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| TC-ID | ${entry.tc_id} |`,
    `| Status | \`${entry.status}\` |`,
    `| Reviewer | ${entry.reviewer} |`,
    `| Role | ${entry.reviewer_role} |`,
    `| Justification | ${entry.justification || '_(none)_'} |`,
    `| Timestamp | ${entry.ts} |`,
    `| Signature | \`${entry.signature.slice(0, 32)}…\` |`,
    `| Prev hash | \`${entry.prev_hash.slice(0, 16)}…\` |`,
    '',
    '> **NOTICE:** HMAC signature is an audit-trail record only, not court-admissible.',
    '',
    '---',
    '',
  ].join('\n');

  if (!fs.existsSync(recordFile)) {
    const header = [
      `# Sign-Off Log — ${surface}`,
      '',
      HEADER_MARKER,
      '',
      '<!-- Entries appended by `testnux sign`. Do not hand-edit. -->',
      '',
    ].join('\n');
    fs.writeFileSync(recordFile, header, 'utf-8');
  }

  fs.appendFileSync(recordFile, entryBlock, 'utf-8');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function promptError(message) {
  const err = new Error(`[sign prompt] ${message}`);
  err.exitCode = 2;
  return err;
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

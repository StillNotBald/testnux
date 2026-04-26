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
 *   testnux sign <surface> --justify-with-llm   (S4)
 *     Before prompting for justification, calls Claude API to draft a 2-3 sentence
 *     justification. Requires CLAUDE_API_KEY + @anthropic-ai/sdk (optional peer dep).
 *     Falls back to manual prompt if API key or SDK is missing. Cost ~$0.003/justify.
 *
 *   testnux sign <surface> --revoke --tc <TC-ID> --role <role>   (S5)
 *     Append a revocation entry to <folder>/br-attestations.jsonl for the given TC+role.
 *     Does NOT delete existing entries (append-only chain preserved).
 *
 * E-signature notice:
 *   The HMAC signature generated here creates an audit-trail record suitable for
 *   internal SOC 2 / ISO 27001 evidence. It is NOT a court-admissible e-signature
 *   under eIDAS, ESIGN, or UETA without separate legal counsel and infrastructure.
 *
 * Env:
 *   UAT_SECRET    — required; the HMAC signing key for this project's UAT log.
 *                   Set in .env.local and do not commit to version control.
 *   CLAUDE_API_KEY — required only for --justify-with-llm (optional; degrades gracefully).
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { appendEntry } from '../lib/uat-log.mjs';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {string} surface   - folder name for this test pass (e.g. "2026-04-26_login-23-tc")
 * @param {object} opts      - {
 *   reject?:          string,   // --reject <TC-ID>
 *   justifyWithLlm?:  boolean,  // --justify-with-llm (S4)
 *   revoke?:          boolean,  // --revoke (S5)
 *   tc?:              string,   // --tc <TC-ID> (used with --revoke, S5)
 *   role?:            string,   // --role <role> (used with --revoke, S5)
 *   brId?:            string,   // --br-id <BR-ID> (used with --revoke, S5)
 *   json?:            boolean,
 *   outDir?:          string,
 * }
 */
export async function runSign(surface, opts = {}) {
  const {
    reject:         rejectTcId,
    justifyWithLlm: justifyWithLlm = false,
    revoke:         isRevoke       = false,
    tc:             revokeTcId,
    role:           revokeRole,
    brId:           revokeBrId,
    json            = false,
    outDir          = '.',
  } = opts;

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

  // ── S5: --revoke handler ─────────────────────────────────────────────────

  if (isRevoke) {
    if (!revokeTcId || !revokeRole) {
      const err = new Error(
        '--revoke requires --tc <TC-ID> and --role <role>.\n' +
        '  Example: testnux sign <surface> --revoke --tc LOGIN-01 --role QA'
      );
      err.exitCode = 2;
      throw err;
    }

    const { revokeAttestation } = await import('../lib/br-attestations.mjs');

    // Prompt for reviewer name and justification
    const rl  = readline.createInterface({ input: process.stdin, output: process.stderr });
    const ask = (q) => new Promise((res) => rl.question(q, res));
    let revokeReviewer, revokeJustification;
    try {
      console.error('');
      revokeReviewer      = (await ask('Reviewer name (for revocation record) : ')).trim();
      revokeJustification = (await ask('Revocation reason                       : ')).trim();
      rl.close();
    } catch (err) {
      rl.close();
      throw err;
    }

    const brAttestPath = path.join(surfaceDir, 'br-attestations.jsonl');
    const brIdForRevoke = revokeBrId ?? surface;

    const revokeEntry = revokeAttestation(
      brAttestPath,
      {
        br_id:         brIdForRevoke,
        tc_id:         revokeTcId,
        reviewer:      revokeReviewer,
        reviewer_role: revokeRole,
        justification: revokeJustification,
      },
      secret
    );

    log(json, { event: 'sign.revoke.done', entry: revokeEntry });

    if (!json) {
      console.log('');
      console.log('[sign --revoke] Revocation appended to ' + brAttestPath);
      console.log(`  TC-ID     : ${revokeEntry.tc_id}`);
      console.log(`  Role      : ${revokeEntry.reviewer_role}`);
      console.log(`  Reviewer  : ${revokeEntry.reviewer}`);
      console.log(`  Timestamp : ${revokeEntry.ts}`);
      console.log(`  Signature : ${revokeEntry.signature.slice(0, 16)}…`);
      console.log('');
      console.log(
        '[sign] NOTICE: Revocation is append-only. Previous attestation entries are preserved.'
      );
      console.log('');
    }

    return revokeEntry;
  }

  // ── Normal sign flow: prompt + HMAC ──────────────────────────────────────

  // S4: optionally draft justification with LLM before prompting
  let llmDraft = null;
  if (justifyWithLlm) {
    llmDraft = await draftJustificationWithLlm({ rejectTcId, json });
  }

  // Collect reviewer info interactively
  const answers = await promptReviewer({ rejectTcId, llmDraft });

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
 * @param {{ rejectTcId?: string, llmDraft?: string | null }} opts
 * @returns {Promise<{ reviewer, reviewerRole, tcId, status, justification }>}
 */
async function promptReviewer({ rejectTcId, llmDraft } = {}) {
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

    // S4: show LLM draft before asking for justification
    if (llmDraft) {
      console.error('');
      console.error('  ┌─────────────────────────────────────────────────────────────────┐');
      console.error('  │  [DRAFT — review and edit before submitting]                    │');
      console.error('  │  LLM-drafted justification (claude-sonnet-4-6):                 │');
      console.error('  │                                                                 │');
      for (const line of wordWrap(llmDraft, 63)) {
        console.error('  │  ' + line.padEnd(63) + '  │');
      }
      console.error('  │                                                                 │');
      console.error('  └─────────────────────────────────────────────────────────────────┘');
      console.error('');
      console.error('  Edit the draft below, or press Enter to accept as-is.');
      console.error('  (Your final input will be auto-prefixed with "[VERIFY] LLM-drafted, reviewer-confirmed:")');
      console.error('');
    }

    let justification = '';
    if (status === 'rejected' || status === 'needs-rework') {
      justification = (await ask('Justification (required for rejection/rework) : ')).trim();
      if (!justification) throw promptError('Justification is required when rejecting or requesting rework');
    } else {
      const justPrompt = llmDraft
        ? 'Justification (edit draft or press Enter to accept) : '
        : 'Justification (optional) : ';
      justification = (await ask(justPrompt)).trim();
      // If user pressed Enter with no input and there's a draft, use the draft
      if (!justification && llmDraft) {
        justification = llmDraft;
      }
    }

    // S4: auto-prepend [VERIFY] prefix to LLM-assisted justifications
    if (llmDraft && justification) {
      justification = '[VERIFY] LLM-drafted, reviewer-confirmed: ' + justification;
    }

    rl.close();
    return { reviewer, reviewerRole, tcId, status, justification };
  } catch (err) {
    rl.close();
    throw err;
  }
}

// ── S4: LLM justify helper ────────────────────────────────────────────────────

/**
 * Call Claude API to draft a 2-3 sentence attestation justification.
 * Gracefully degrades if CLAUDE_API_KEY is absent or @anthropic-ai/sdk is missing.
 *
 * @param {{ rejectTcId?: string, json?: boolean }} opts
 * @returns {Promise<string | null>}  draft text, or null on graceful degrade
 */
async function draftJustificationWithLlm({ rejectTcId, json } = {}) {
  // Step 1: check API key
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    if (!json) {
      console.error(
        '\n  WARNING: --justify-with-llm requires CLAUDE_API_KEY — ' +
        'falling back to manual justification.\n'
      );
    }
    return null;
  }

  // Step 2: dynamically import SDK (mirrors discover.mjs pattern)
  let Anthropic;
  try {
    const sdk = await import('@anthropic-ai/sdk');
    Anthropic = sdk.default ?? sdk.Anthropic;
  } catch {
    if (!json) {
      console.error(
        '\n  WARNING: --justify-with-llm requires @anthropic-ai/sdk.\n' +
        '  Install with: npm install @anthropic-ai/sdk\n' +
        '  Falling back to manual justification.\n'
      );
    }
    return null;
  }

  if (!json) {
    console.error('\n  [LLM] Drafting justification via Claude API...\n');
  }

  const tcContext = rejectTcId
    ? `TC-ID: ${rejectTcId} | Status: rejected`
    : 'TC-ID: (will be entered interactively) | Status: (will be entered interactively)';

  const systemPrompt =
    'You are an audit attestation drafter. Given this TC result + control mapping + ' +
    'execution screenshot summary, draft a 2-3 sentence justification explaining WHY ' +
    'this attestation is correct. Do not assert beyond the evidence. Output prose only. ' +
    'Do not include headers, bullet points, or markdown formatting.';

  const userPrompt =
    `TC result: ${tcContext}\n` +
    `Standards mapped: SOC 2 CC6, NIST AC-2, ISO 27001 A.9\n` +
    `Evidence: uat-log.jsonl HMAC-chain entry (review the evidence files in the surface folder)\n\n` +
    `Draft a 2-3 sentence attestation justification. ` +
    `Be factual and conservative — do not assert beyond the evidence shown.`;

  const model      = 'claude-sonnet-4-6';
  const maxTokens  = 200;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const draft     = (response.content?.[0]?.text ?? '').trim();
    const inputToks = response.usage?.input_tokens  ?? 0;
    const outToks   = response.usage?.output_tokens ?? 0;
    const cost      = ((inputToks * 3.0 + outToks * 15.0) / 1_000_000).toFixed(5);

    if (!json) {
      console.error(`  [LLM] Draft complete. Cost estimate: $${cost} (${inputToks}in/${outToks}out tokens)\n`);
    }

    return draft;
  } catch (err) {
    if (!json) {
      console.error(
        `\n  WARNING: LLM draft failed (${err.message}) — falling back to manual justification.\n`
      );
    }
    return null;
  }
}

/**
 * Simple word-wrap for console display of LLM drafts.
 * @param {string} text
 * @param {number} width
 * @returns {string[]}
 */
function wordWrap(text, width) {
  const words  = text.split(' ');
  const lines  = [];
  let   line   = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
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

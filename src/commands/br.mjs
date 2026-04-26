// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/br.mjs
 *
 * Implements `testnux br` — Business Requirements (BR-XX) management.
 *
 * Sub-commands:
 *   br init <id>                  — scaffold a BR-XX entry in requirements/BUSINESS_REQUIREMENTS.md
 *   br link <BR-id> <R-id1,...>   — add BR → R-ID mapping
 *   br rtm                        — render requirements/UAT_TRACEABILITY.md (BR → R → TC)
 *
 * File conventions:
 *   requirements/BUSINESS_REQUIREMENTS.md  — one ## BR-XX section per requirement
 *   requirements/UAT_TRACEABILITY.md       — generated RTM table (BR layer added)
 *
 * v0.3 stub: init + link write real markdown; rtm renders from existing markdown.
 */

import fs from 'fs';
import path from 'path';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scaffold a new BR-XX section in requirements/BUSINESS_REQUIREMENTS.md.
 *
 * @param {string} id    - BR identifier, e.g. "BR-01"
 * @param {object} opts  - { outDir: string, json: boolean }
 */
export async function runBrInit(id, opts = {}) {
  const { outDir = '.', json = false } = opts;

  validateBrId(id);

  const reqDir = path.resolve(outDir, 'requirements');
  fs.mkdirSync(reqDir, { recursive: true });

  const filePath = path.join(reqDir, 'BUSINESS_REQUIREMENTS.md');
  const templateSection = buildBrSection(id);

  if (!fs.existsSync(filePath)) {
    // Create the file with a header
    const header = [
      '# Business Requirements',
      '',
      '<!-- testnux: BUSINESS_REQUIREMENTS v1 -->',
      '<!-- Each ## BR-XX section is managed by `testnux br`. -->',
      '',
    ].join('\n');
    fs.writeFileSync(filePath, header, 'utf-8');
  }

  const existing = fs.readFileSync(filePath, 'utf-8');

  // Idempotency — do not duplicate if BR-XX already exists
  if (hasBrSection(existing, id)) {
    log(json, { event: 'br.init.skip', id, reason: 'already exists', file: filePath });
    if (!json) console.log(`[br init] ${id} already exists in ${filePath} — skipping.`);
    return;
  }

  fs.appendFileSync(filePath, '\n' + templateSection, 'utf-8');
  log(json, { event: 'br.init.done', id, file: filePath });

  if (!json) {
    console.log(`[br init] Scaffolded ${id} in ${filePath}`);
    console.log(`  Next: fill in business outcome + acceptance criteria, then:`);
    console.log(`  testnux br link ${id} R-01,R-02`);
  }
}

/**
 * Add a BR-XX → R-ID mapping in BUSINESS_REQUIREMENTS.md.
 *
 * @param {string} brId   - e.g. "BR-01"
 * @param {string} rIds   - comma-separated R-IDs, e.g. "R-01,R-02"
 * @param {object} opts   - { outDir: string, json: boolean }
 */
export async function runBrLink(brId, rIds, opts = {}) {
  const { outDir = '.', json = false } = opts;

  validateBrId(brId);
  const rIdList = rIds.split(',').map((s) => s.trim()).filter(Boolean);
  if (rIdList.length === 0) {
    const err = new Error('At least one R-ID is required after the BR-ID');
    err.exitCode = 2;
    throw err;
  }

  const filePath = path.resolve(outDir, 'requirements', 'BUSINESS_REQUIREMENTS.md');
  if (!fs.existsSync(filePath)) {
    const err = new Error(
      `${filePath} not found. Run \`testnux br init ${brId}\` first.`
    );
    err.exitCode = 2;
    throw err;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  if (!hasBrSection(content, brId)) {
    const err = new Error(
      `${brId} section not found in ${filePath}. Run \`testnux br init ${brId}\` first.`
    );
    err.exitCode = 2;
    throw err;
  }

  // Update the "Linked R-IDs" line within the BR-XX section
  // Pattern: look for the marker line and replace it
  const MARKER = `<!-- br:linked-r-ids:${brId} -->`;
  const rIdStr = rIdList.join(', ');

  if (content.includes(MARKER)) {
    // Replace the existing linked R-IDs line
    content = content.replace(
      new RegExp(`${escapeRegex(MARKER)}.*`, 's'),
      `${MARKER}\n${rIdStr}`
    );
  } else {
    // Append under the ## BR-XX heading's Linked R-IDs section
    const sectionRe = new RegExp(
      `(## ${escapeRegex(brId)}[\\s\\S]*?### Linked R-IDs\\n)([\\s\\S]*?)(?=\\n###|\\n##|$)`
    );
    const replacement = `$1${MARKER}\n${rIdStr}\n`;
    if (sectionRe.test(content)) {
      content = content.replace(sectionRe, replacement);
    } else {
      // Fallback: append the marker at the end of the BR section
      content = content.replace(
        new RegExp(`(## ${escapeRegex(brId)}[^\\n]*\\n)`),
        `$1\n_Linked R-IDs:_ ${rIdStr}  ${MARKER}\n`
      );
    }
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  log(json, { event: 'br.link.done', brId, rIds: rIdList, file: filePath });

  if (!json) {
    console.log(`[br link] ${brId} → ${rIdStr}  (updated ${filePath})`);
  }
}

/**
 * Render requirements/UAT_TRACEABILITY.md from BUSINESS_REQUIREMENTS.md.
 * The RTM adds a BR column above the R-XX → TC-XX existing mapping.
 *
 * v0.3: renders from parsed BUSINESS_REQUIREMENTS.md; TC-XX column is
 * informational (manually populated or linked by a future `br codify` command).
 *
 * @param {object} opts - { outDir: string, json: boolean }
 */
export async function runBrRtm(opts = {}) {
  const { outDir = '.', json = false } = opts;

  const reqDir = path.resolve(outDir, 'requirements');
  const brFile = path.join(reqDir, 'BUSINESS_REQUIREMENTS.md');
  const rtmFile = path.join(reqDir, 'UAT_TRACEABILITY.md');

  if (!fs.existsSync(brFile)) {
    if (!json) {
      console.log('[br rtm] No BUSINESS_REQUIREMENTS.md found.');
      console.log('  Run: testnux br init BR-01');
    }
    log(json, { event: 'br.rtm.empty', reason: 'no BUSINESS_REQUIREMENTS.md' });
    return;
  }

  const content = fs.readFileSync(brFile, 'utf-8');
  const entries = parseBrFile(content);

  if (entries.length === 0) {
    if (!json) console.log('[br rtm] No BR-XX entries found in BUSINESS_REQUIREMENTS.md.');
    log(json, { event: 'br.rtm.empty', reason: 'no entries' });
    return;
  }

  const rows = entries.map((e) => {
    const rIds = e.rIds.length ? e.rIds.join(', ') : '_(none)_';
    const tcIds = '_(link via `br link`)_';
    return `| ${e.id} | ${e.title} | ${e.uatStatus} | ${rIds} | ${tcIds} |`;
  });

  const table = [
    '| BR-ID | Business Outcome | UAT Status | R-IDs | TC-IDs |',
    '|-------|-----------------|------------|-------|--------|',
    ...rows,
  ].join('\n');

  const rtmContent = [
    '# UAT Traceability Matrix',
    '',
    '<!-- testnux: UAT_TRACEABILITY v1 — generated by `testnux br rtm` -->',
    '<!-- Do not hand-edit the table; re-run `testnux br rtm` to refresh. -->',
    '',
    '## BR-XX → R-XX → TC-XX Mapping',
    '',
    table,
    '',
    '---',
    '',
    `_Generated: ${new Date().toISOString()}_`,
    '',
  ].join('\n');

  fs.mkdirSync(reqDir, { recursive: true });
  fs.writeFileSync(rtmFile, rtmContent, 'utf-8');

  log(json, { event: 'br.rtm.done', entries: entries.length, file: rtmFile });

  if (!json) {
    console.log(`[br rtm] Rendered ${entries.length} BR entries → ${rtmFile}`);
    console.log('');
    console.log(table);
    console.log('');
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function validateBrId(id) {
  if (!id || !/^BR-\d{2,4}$/i.test(id)) {
    const err = new Error(
      `BR-ID must match BR-NN format (e.g. BR-01, BR-123). Got: "${id}"`
    );
    err.exitCode = 2;
    throw err;
  }
}

function hasBrSection(content, id) {
  return new RegExp(`^##\\s+${escapeRegex(id)}\\b`, 'm').test(content);
}

function buildBrSection(id) {
  return [
    `## ${id}`,
    '',
    '---',
    'uat_status: pending',
    'owner: TBD',
    'stakeholders: []',
    'approval_required: true',
    '---',
    '',
    '### Business Outcome',
    '',
    '> _Describe what the business needs this to achieve._',
    '',
    '### Acceptance Criteria',
    '',
    '- [ ] AC-1: ',
    '- [ ] AC-2: ',
    '',
    '### Linked R-IDs',
    '',
    '_(none yet — run `testnux br link ' + id + ' R-01,R-02`)_',
    '',
    '### Linked TC-IDs',
    '',
    '_(populated automatically via RTM — run `testnux br rtm`)_',
    '',
    '### Stakeholder Sign-Off Matrix',
    '',
    '| Reviewer | Role | Status | Date | Signature |',
    '|----------|------|--------|------|-----------|',
    '| | | pending | | |',
    '',
  ].join('\n');
}

/**
 * Parse BUSINESS_REQUIREMENTS.md into structured entries.
 * @param {string} content
 * @returns {{ id: string, title: string, uatStatus: string, rIds: string[] }[]}
 */
function parseBrFile(content) {
  const entries = [];
  const sectionRe = /^## (BR-\d{2,4})(.*?)$/gm;
  let match;

  while ((match = sectionRe.exec(content)) !== null) {
    const id = match[1];
    const rawTitle = match[2].trim().replace(/^[-—]\s*/, '');
    const title = rawTitle || id;

    // Extract everything until the next ## heading
    const sectionStart = match.index + match[0].length;
    const nextSection = content.indexOf('\n## ', sectionStart);
    const sectionBody = nextSection === -1
      ? content.slice(sectionStart)
      : content.slice(sectionStart, nextSection);

    // Parse uat_status from YAML-like block
    const statusMatch = /uat_status:\s*(\S+)/.exec(sectionBody);
    const uatStatus = statusMatch ? statusMatch[1] : 'pending';

    // Parse linked R-IDs (R-\d+ pattern)
    const rIdMatches = sectionBody.match(/\bR-\d{2,4}[A-Z]?\b/g) ?? [];
    const rIds = [...new Set(rIdMatches)].sort();

    entries.push({ id, title, uatStatus, rIds });
  }

  return entries;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

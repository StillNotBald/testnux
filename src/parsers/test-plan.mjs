// Copyright 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/parsers/test-plan.mjs
 *
 * Parse a test-plan.md file into structured TcRecord objects.
 *
 * Input format (see templates/test-plan.md):
 *   - YAML frontmatter parsed with gray-matter
 *   - Markdown table with header row containing "TC ID"
 *   - Per-TC sections: ## <TC-ID> — <title>
 *     Fields: Priority, TC type, R-IDs, Setup, Given, When, Then, Pass criteria, Notes
 *
 * Exports:
 *   parseTestPlanFile(filePath)  → { frontmatter, tcs: TcRecord[], openItems: string|null }
 *   parseTestPlanContent(content, filePath?) → { frontmatter, tcs: TcRecord[], openItems: string|null }
 *
 * TcRecord shape:
 *   {
 *     id: string,           // e.g. "LOGIN-01"
 *     title: string,
 *     priority: string,     // "P0" | "P1" | "P2"
 *     category: string,     // derived from title + verifies heuristic
 *     rIds: string[],       // R-IDs from per-TC section frontmatter
 *     standards: string[],  // from frontmatter.industry_standards
 *     status: string,       // from matrix table "Status" column, or "DRAFT"
 *     verifies: string,     // "What it verifies" column
 *     setup: string,
 *     given: string,
 *     when: string,
 *     then: string,
 *     passCriteria: string,
 *     notes: string,
 *     tcType: string,       // "prescribed" | "security" | "exploratory" | ...
 *   }
 */

import * as fs from 'node:fs';
import matter from 'gray-matter';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Valid TC-ID pattern: one or more uppercase segments separated by hyphens, then digits. */
const TC_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+$/;

/** Per-TC section heading: ## or ### TC-ID — Title  OR  ## TC-ID: Title */
const SECTION_HEADING_RE = /^#{2,3} ([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+)\s*(?:[—:-]+\s*)(.*)$/;

/** open-items fenced region */
const OPEN_ITEMS_BEGIN = '<!-- testnux:open-items begin -->';
const OPEN_ITEMS_END = '<!-- testnux:open-items end -->';

// ── Category heuristic ────────────────────────────────────────────────────────

/**
 * Derive a functional category label from the TC title + verifies text.
 * Generic, domain-neutral keywords only.
 *
 * @param {string} title
 * @param {string} verifies
 * @returns {string}
 */
export function deriveCategoryFromText(title, verifies = '') {
  const text = (title + ' ' + verifies).toLowerCase();
  if (/webauthn|fido2|passkey|security.?key|hardware.?key/.test(text)) return 'MFA — WebAuthn';
  if (/totp|otp|authenticator|mfa|two.?factor|2fa/.test(text)) return 'MFA — TOTP';
  if (/rate.?limit|lockout|throttle|429|brute.?force/.test(text)) return 'Security — Rate Limit';
  if (/sql.?inject|xss|csrf|injection|bypass|auth.?bypass|enumerat/.test(text)) return 'Security — Injection';
  if (/a11y|accessibility|screen.?reader|aria|wcag|focus|tab.?order|keyboard/.test(text)) return 'Accessibility';
  if (/mobile|viewport|responsive|reflow|scroll/.test(text)) return 'Responsive / Mobile';
  if (/locale|i18n|l10n|language|translat|spanish|french|german/.test(text)) return 'Locale / i18n';
  if (/forgot|reset|recover|password.?reset/.test(text)) return 'Account Recovery';
  if (/register|sign.?up|onboard|create.?account/.test(text)) return 'Registration';
  if (/logout|sign.?out|session.?expire|session.?timeout/.test(text)) return 'Session Management';
  if (/happy.?path|success|valid.?cred|correct.?pass/.test(text)) return 'Auth — Happy Path';
  if (/invalid|wrong|incorrect|bad.?pass|unknown.?email|error.?message/.test(text)) return 'Auth — Validation';
  if (/navigat|link|redirect|back.?button|breadcrumb/.test(text)) return 'Navigation';
  if (/upload|file|attachment|import|export/.test(text)) return 'File Handling';
  if (/search|filter|sort|pagination/.test(text)) return 'Data — Query';
  if (/dashboard|chart|metric|graph|stat/.test(text)) return 'Dashboard';
  if (/setting|config|preference|profile/.test(text)) return 'Settings';
  if (/admin|role|permission|rbac/.test(text)) return 'Access Control';
  return 'General';
}

// ── Matrix table parser ───────────────────────────────────────────────────────

/**
 * Parse the markdown table that begins with "| TC ID |" into row objects.
 * Supports columns: TC ID, Title, Priority, What it verifies, Status, ...
 *
 * @param {string} md
 * @returns {{ id: string, title: string, priority: string, verifies: string, status: string }[]}
 */
function parseMatrixTable(md) {
  const rows = [];
  const lines = md.split('\n');
  let inTable = false;
  let headerCols = [];

  for (const line of lines) {
    // Detect the TC matrix header row.
    // Must have TC-ID column AND at least one of Title/Priority/Status/Verifies
    // so we don't accidentally match secondary standards/alignment tables.
    if (/^\|\s*TC.?ID\s*\|/i.test(line)) {
      const lower = line.toLowerCase();
      // Parse out column headers to check them individually
      const headerCandidates = line
        .split('|')
        .map((c) => c.trim().toLowerCase())
        .filter((_, i, arr) => i > 0 && i < arr.length - 1);
      // Must have a "title" or "priority" or "status" column by itself (not embedded in "control title" etc.)
      const isMatrixTable = headerCandidates.some((col) =>
        col === 'title' ||
        col === 'priority' ||
        col === 'status' ||
        col === 'verifies' ||
        col.startsWith('what it') ||
        col === 'pass / fail',
      );
      if (!isMatrixTable) continue; // skip non-matrix tables (e.g. standards-alignment)
      inTable = true;
      // Parse column names from header
      headerCols = line
        .split('|')
        .map((c) => c.trim().toLowerCase())
        .filter((_, i, arr) => i > 0 && i < arr.length - 1);
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) { inTable = false; continue; }
    // Skip separator rows (|---|---|)
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;

    const cells = line
      .split('|')
      .map((c) => c.trim().replace(/\*\*/g, ''))
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);

    if (cells.length < 2) continue;

    // Map cells to column names
    const get = (keywords) => {
      for (let i = 0; i < headerCols.length; i++) {
        if (keywords.some((k) => headerCols[i].includes(k))) return cells[i]?.trim() ?? '';
      }
      return '';
    };

    const id = (cells[0] ?? '').replace(/\*\*/g, '').trim();
    if (!TC_ID_RE.test(id)) continue;

    rows.push({
      id,
      title: get(['title', 'name', 'description']),
      priority: get(['priority', 'prio']),
      verifies: get(['verif', 'what it', 'assertion', 'covers']),
      status: get(['status', 'state']),
    });
  }
  return rows;
}

// ── Per-TC section body parser ────────────────────────────────────────────────

/**
 * Extract a labelled field from a section body.
 * Supports both **Label:** value  and  **Label:**\nvalue patterns.
 *
 * @param {string} body
 * @param {string} label
 * @returns {string}
 */
function grabField(body, label) {
  // Try with colon: **Label:** value
  const withColon = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+(?:\\n(?!\\*\\*)[^\\n]*)*)`, 'i');
  let m = body.match(withColon);
  if (!m) {
    // Try without colon: **Label** value  (alternative format)
    const noColon = new RegExp(`\\*\\*${label}\\*\\*\\s+([^\\n]+(?:\\n(?!\\*\\*)[^\\n]*)*)`, 'i');
    m = body.match(noColon);
  }
  if (!m) return '';
  return m[1]
    .replace(/\n[-*] /g, ' ') // flatten bullet lists
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse R-IDs from a per-TC section body.
 * Looks for **R-IDs:** R-01, R-02  or  **R-ID:** R-01
 *
 * @param {string} body
 * @returns {string[]}
 */
function grabRIds(body) {
  const m = body.match(/\*\*R-IDs?:\*\*\s*([^\n]+)/i);
  if (!m) return [];
  return m[1].match(/R-\d{2,4}[A-Z]?/g) ?? [];
}

/**
 * Parse per-TC ## heading sections from the full markdown.
 *
 * @param {string} md
 * @returns {Record<string, object>}
 */
function parseSections(md) {
  const sections = {};
  const allMatches = [...md.matchAll(new RegExp(SECTION_HEADING_RE.source, 'gm'))];

  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    const id = m[1];
    const titleFromHeading = (m[2] ?? '').trim();
    const start = m.index + m[0].length;
    const end = i + 1 < allMatches.length ? allMatches[i + 1].index : md.length;
    const body = md.slice(start, end).trim();

    sections[id] = {
      title: titleFromHeading,
      priority: grabField(body, 'Priority'),
      tcType: grabField(body, 'TC type'),
      rIds: grabRIds(body),
      setup: grabField(body, 'Setup'),
      given: grabField(body, 'Given'),
      when: grabField(body, 'When'),
      then: grabField(body, 'Then'),
      passCriteria: grabField(body, 'Pass criteria'),
      notes: grabField(body, 'Notes'),
    };
  }
  return sections;
}

// ── Open items extraction ─────────────────────────────────────────────────────

/**
 * Extract the raw markdown between open-items markers.
 * Returns null if markers are not present.
 *
 * @param {string} content
 * @returns {string|null}
 */
function extractOpenItems(content) {
  const beginIdx = content.indexOf(OPEN_ITEMS_BEGIN);
  const endIdx = content.indexOf(OPEN_ITEMS_END);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return null;
  return content.slice(beginIdx + OPEN_ITEMS_BEGIN.length, endIdx).trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse test-plan.md content string into structured records.
 *
 * @param {string} content  Full file content
 * @param {string} [filePath]  Optional, for error messages only
 * @returns {{ frontmatter: object, tcs: TcRecord[], openItems: string|null }}
 */
export function parseTestPlanContent(content, filePath = '<test-plan.md>') {
  if (!content || typeof content !== 'string') {
    throw new Error(`[test-plan parser] Content is empty or not a string: ${filePath}`);
  }

  const { data: frontmatter, content: body } = matter(content);

  // Extract open-items region BEFORE parsing (preserve exactly as written)
  const openItems = extractOpenItems(content);

  // Strip open-items region from body so it doesn't confuse the table parser
  const bodyWithoutOpenItems = openItems
    ? content.replace(
        content.slice(content.indexOf(OPEN_ITEMS_BEGIN), content.indexOf(OPEN_ITEMS_END) + OPEN_ITEMS_END.length),
        '',
      )
    : content;

  const matrixRows = parseMatrixTable(bodyWithoutOpenItems);
  const sections = parseSections(bodyWithoutOpenItems);

  const industryStandards = Array.isArray(frontmatter.industry_standards)
    ? frontmatter.industry_standards
    : [];

  const tcs = matrixRows.map((row) => {
    const sec = sections[row.id] ?? {};
    const priority = row.priority || sec.priority || 'P2';
    const title = row.title || sec.title || row.id;
    const verifies = row.verifies || '';

    return {
      id: row.id,
      title,
      priority: priority.replace(/[^P012]/g, '').slice(0, 2) || priority,
      category: deriveCategoryFromText(title, verifies),
      rIds: sec.rIds ?? [],
      standards: industryStandards,
      status: row.status || 'DRAFT',
      verifies,
      setup: sec.setup ?? '',
      given: sec.given ?? '',
      when: sec.when ?? '',
      then: sec.then ?? '',
      passCriteria: sec.passCriteria ?? '',
      notes: sec.notes ?? '',
      tcType: sec.tcType ?? 'prescribed',
    };
  });

  // Also include any sections that appear in the section headings but NOT in
  // the matrix table — handles partial plans where only the sections exist.
  const matrixIds = new Set(matrixRows.map((r) => r.id));
  for (const [id, sec] of Object.entries(sections)) {
    if (matrixIds.has(id)) continue;
    const priority = sec.priority || 'P2';
    tcs.push({
      id,
      title: sec.title || id,
      priority,
      category: deriveCategoryFromText(sec.title ?? '', ''),
      rIds: sec.rIds ?? [],
      standards: industryStandards,
      status: 'DRAFT',
      verifies: '',
      setup: sec.setup ?? '',
      given: sec.given ?? '',
      when: sec.when ?? '',
      then: sec.then ?? '',
      passCriteria: sec.passCriteria ?? '',
      notes: sec.notes ?? '',
      tcType: sec.tcType ?? 'prescribed',
    });
  }

  return { frontmatter, tcs, openItems };
}

/**
 * Parse a test-plan.md file from disk.
 *
 * @param {string} filePath  Absolute or relative path to test-plan.md
 * @returns {{ frontmatter: object, tcs: TcRecord[], openItems: string|null }}
 */
export function parseTestPlanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[test-plan parser] File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseTestPlanContent(content, filePath);
}

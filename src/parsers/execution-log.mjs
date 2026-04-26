// Copyright 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/parsers/execution-log.mjs
 *
 * Parse an execution-log.md or execution-log-auto.md file into ExecutionResult objects.
 *
 * Input format:
 *   Markdown table with header: | TC ID | Status | Result | Notes |
 *   (column names are flexible — "Notes" may be "Result Notes", "Actual", etc.)
 *
 *   Status values may include emoji prefixes:
 *     ✅ PASS, ❌ FAIL, ⏸ BLOCKED-CONFIG, BLOCKED-IMPLEMENTATION, ⏭ SKIPPED, etc.
 *
 * Also accepts per-TC ## sections with **Actual:** fields for richer output.
 *
 * Exports:
 *   parseExecutionLogContent(content) → ExecutionResult[]
 *   parseExecutionLogFile(filePath)   → ExecutionResult[]
 *   mergeExecutionResults(tcs, results) → TcRecord[]  (adds .actual, .executionNotes, .duration)
 *
 * ExecutionResult shape:
 *   {
 *     id: string,
 *     status: string,    // normalized: PASS | FAIL | BLOCKED-CONFIG | BLOCKED-IMPLEMENTATION | SKIPPED | NOT_RUN
 *     statusRaw: string, // original cell content including emoji
 *     actual: string,    // what actually happened (Result column or **Actual:** field)
 *     executionNotes: string,
 *     duration: string,  // e.g. "1.4 s" if recorded
 *   }
 */

import * as fs from 'node:fs';

// ── Constants ─────────────────────────────────────────────────────────────────

const TC_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+$/;

/** Emoji characters to strip when normalizing status strings */
const EMOJI_STRIP_RE = /[✅❌⏸🟡🟢🟤⏭⚪⭕✔✖]/gu;

// ── Status normalization ──────────────────────────────────────────────────────

/**
 * Normalize raw status cell text to a canonical status value.
 *
 * Canonical values:
 *   PASS | FAIL | BLOCKED-CONFIG | BLOCKED-IMPLEMENTATION | SKIPPED | NOT_RUN | IN-PROGRESS | DRAFT
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeStatus(raw) {
  if (!raw) return 'NOT_RUN';
  // Strip emoji and leading/trailing whitespace
  const cleaned = raw.replace(EMOJI_STRIP_RE, '').replace(/\s+/g, ' ').trim().toUpperCase();

  if (!cleaned) return 'NOT_RUN';

  // Exact/prefix matches (longest first to avoid false positives)
  if (cleaned.startsWith('BLOCKED-IMPLEMENTATION') || cleaned.includes('BLOCKED-IMPL')) {
    return 'BLOCKED-IMPLEMENTATION';
  }
  if (cleaned.startsWith('BLOCKED-CONFIG') || cleaned.includes('BLOCKED-CONF')) {
    return 'BLOCKED-CONFIG';
  }
  if (cleaned.startsWith('BLOCKED')) return 'BLOCKED-CONFIG'; // legacy: treat bare BLOCKED as config
  if (cleaned === 'PASS' || cleaned.startsWith('PASS')) return 'PASS';
  if (cleaned === 'FAIL' || cleaned.startsWith('FAIL')) return 'FAIL';
  if (cleaned === 'SKIP' || cleaned.startsWith('SKIP')) return 'SKIPPED';
  if (cleaned === 'IN-PROGRESS' || cleaned === 'IN PROGRESS') return 'IN-PROGRESS';
  if (cleaned === 'DRAFT') return 'DRAFT';
  if (cleaned === 'READY') return 'READY';
  if (cleaned === 'NOT_RUN' || cleaned === 'NOT RUN' || cleaned === 'NOTRUN') return 'NOT_RUN';
  if (cleaned === 'ARCHIVED') return 'ARCHIVED';

  // Fallback: return cleaned version
  return cleaned.replace(/\s+/g, '-');
}

// ── Table parser ──────────────────────────────────────────────────────────────

/**
 * Parse results from a markdown table with "TC ID" + "Status" columns.
 * Also tolerates "Result" / "Actual" columns.
 *
 * @param {string} md
 * @returns {ExecutionResult[]}
 */
function parseResultsTable(md) {
  const results = [];
  const lines = md.split('\n');
  let inTable = false;
  let headerCols = [];

  for (const line of lines) {
    // Look for any table whose first column looks like TC-ID-ish headers
    if (/^\|\s*TC.?ID\s*\|/i.test(line)) {
      inTable = true;
      headerCols = line
        .split('|')
        .map((c) => c.trim().toLowerCase().replace(/\*\*/g, ''))
        .filter((_, i, arr) => i > 0 && i < arr.length - 1);
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) { inTable = false; continue; }
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue; // separator

    const cells = line
      .split('|')
      .map((c) => c.trim().replace(/\*\*/g, ''))
      .filter((_, i, arr) => i > 0 && i < arr.length - 1);

    if (cells.length < 2) continue;

    const id = (cells[0] ?? '').trim();
    if (!TC_ID_RE.test(id)) continue;

    // Map columns by keyword matching
    const colIdx = (keywords) => {
      for (let i = 0; i < headerCols.length; i++) {
        if (keywords.some((k) => headerCols[i].includes(k))) return i;
      }
      return -1;
    };

    const statusIdx = colIdx(['status', 'result', 'pass', 'outcome']);
    const actualIdx = colIdx(['actual', 'result', 'notes', 'observed', 'output']);
    const durationIdx = colIdx(['duration', 'time', 'elapsed', 'ms', 'sec']);

    const statusRaw = statusIdx >= 0 ? (cells[statusIdx] ?? '') : '';
    // If actual column is same as status column, look further right
    const actualRaw =
      actualIdx >= 0 && actualIdx !== statusIdx
        ? (cells[actualIdx] ?? '')
        : (cells[statusIdx + 1] ?? cells[2] ?? '');

    results.push({
      id,
      status: normalizeStatus(statusRaw),
      statusRaw,
      actual: actualRaw,
      executionNotes: cells[cells.length - 1] ?? '',
      duration: durationIdx >= 0 ? (cells[durationIdx] ?? '') : '',
    });
  }

  return results;
}

// ── Section body parser ───────────────────────────────────────────────────────

/**
 * Parse per-TC ## sections in the execution log that have **Actual:** fields.
 * These supplement or override the table when richer prose is present.
 *
 * @param {string} md
 * @returns {Record<string, { actual: string, executionNotes: string }>}
 */
function parseSectionBodies(md) {
  const extra = {};
  const sectionRe = /^## ([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+)/gm;
  const allMatches = [...md.matchAll(sectionRe)];

  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    const id = m[1];
    const start = m.index + m[0].length;
    const end = i + 1 < allMatches.length ? allMatches[i + 1].index : md.length;
    const body = md.slice(start, end);

    const grab = (label) => {
      const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+(?:\\n(?!\\*\\*)[^\\n]*)*)`, 'i');
      const fm = body.match(re);
      if (!fm) return '';
      return fm[1].replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    };

    extra[id] = {
      actual: grab('Actual') || grab('Observed') || grab('Result'),
      executionNotes: grab('Notes') || grab('Tester notes') || grab('Engineer notes'),
    };
  }

  return extra;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse execution log content into ExecutionResult[].
 *
 * @param {string} content  Full file content
 * @returns {ExecutionResult[]}
 */
export function parseExecutionLogContent(content) {
  if (!content || typeof content !== 'string') return [];

  const tableResults = parseResultsTable(content);
  const sectionExtras = parseSectionBodies(content);

  // Merge section extras into table results
  const byId = Object.fromEntries(tableResults.map((r) => [r.id, r]));
  for (const [id, extra] of Object.entries(sectionExtras)) {
    if (byId[id]) {
      if (extra.actual && !byId[id].actual) byId[id].actual = extra.actual;
      if (extra.executionNotes && !byId[id].executionNotes) byId[id].executionNotes = extra.executionNotes;
    } else {
      // Section-only result (no table row) — create a minimal entry
      byId[id] = {
        id,
        status: 'NOT_RUN',
        statusRaw: '',
        actual: extra.actual,
        executionNotes: extra.executionNotes,
        duration: '',
      };
    }
  }

  return Object.values(byId);
}

/**
 * Parse an execution-log file from disk.
 *
 * @param {string} filePath
 * @returns {ExecutionResult[]}
 */
export function parseExecutionLogFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[execution-log parser] File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseExecutionLogContent(content);
}

/**
 * Merge ExecutionResult[] into TcRecord[] by matching IDs.
 * Returns a new array — does not mutate the inputs.
 *
 * @param {TcRecord[]} tcs
 * @param {ExecutionResult[]} results
 * @returns {TcRecord[]}
 */
export function mergeExecutionResults(tcs, results) {
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  return tcs.map((tc) => {
    const res = byId[tc.id];
    if (!res) return tc;
    return {
      ...tc,
      status: res.status,
      statusRaw: res.statusRaw,
      actual: res.actual,
      executionNotes: res.executionNotes,
      duration: res.duration,
    };
  });
}

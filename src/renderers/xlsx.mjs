// Copyright 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/renderers/xlsx.mjs
 *
 * Render TcRecord[] + ExecutionResult[] into a structured Excel workbook.
 *
 * Uses exceljs (NOT the xlsx package — avoid the prototype-pollution CVE).
 *
 * Sheets produced:
 *   1. "TC Matrix"          — one row per TC with color-coded priority + status + dropdown
 *   2. "Standards Alignment" — each unique standard → list of TC-IDs that reference it
 *
 * Color conventions:
 *   Priority  P0 → light red   P1 → light amber   P2 → light green
 *   Status    PASS → green     FAIL → red          BLOCKED-* → orange   SKIPPED → purple
 *
 * Export:
 *   buildXlsx(tcs, opts) → Promise<ExcelJS.Workbook>
 *   writeXlsx(tcs, outputPath, opts) → Promise<void>
 */

import ExcelJS from 'exceljs';

// ── Color palette (ARGB hex strings for ExcelJS) ──────────────────────────────

const COLORS = {
  // Priority fill
  P0_FILL: 'FFFEE2E2',    // red-50
  P1_FILL: 'FFFEF3C7',    // amber-50
  P2_FILL: 'FFF0FDF4',    // green-50
  PX_FILL: 'FFF3F4F6',    // gray-100 (unknown)

  // Status fill
  PASS_FILL: 'FFD1FAE5',           // emerald-100
  FAIL_FILL: 'FFFEE2E2',           // red-100
  BLOCKED_FILL: 'FFFEF3C7',        // amber-100
  SKIPPED_FILL: 'FFE0E7FF',        // indigo-100
  NOT_RUN_FILL: 'FFF9FAFB',        // gray-50
  DRAFT_FILL: 'FFF3F4F6',          // gray-100

  // Priority text
  P0_TEXT: 'FF991B1B',    // red-800
  P1_TEXT: 'FF92400E',    // amber-800
  P2_TEXT: 'FF166534',    // green-800

  // Status text
  PASS_TEXT: 'FF065F46',           // emerald-900
  FAIL_TEXT: 'FF991B1B',           // red-800
  BLOCKED_TEXT: 'FF92400E',        // amber-800
  SKIPPED_TEXT: 'FF3730A3',        // indigo-800
  NOT_RUN_TEXT: 'FF374151',        // gray-700

  // Header
  HEADER_BG: 'FF111827',           // gray-900
  HEADER_TEXT: 'FFFFFFFF',         // white
  TITLE_BG: 'FF1D4ED8',            // blue-700
  TITLE_TEXT: 'FFFFFFFF',

  BORDER: 'FFE5E7EB',              // gray-200
  LIGHT_BORDER: 'FFF3F4F6',        // gray-100
};

// ── Priority helpers ──────────────────────────────────────────────────────────

function priorityFillColor(priority) {
  return { P0: COLORS.P0_FILL, P1: COLORS.P1_FILL, P2: COLORS.P2_FILL }[priority] ?? COLORS.PX_FILL;
}

function priorityTextColor(priority) {
  return { P0: COLORS.P0_TEXT, P1: COLORS.P1_TEXT, P2: COLORS.P2_TEXT }[priority] ?? COLORS.NOT_RUN_TEXT;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusFillColor(status) {
  if (!status) return COLORS.NOT_RUN_FILL;
  if (status === 'PASS') return COLORS.PASS_FILL;
  if (status === 'FAIL') return COLORS.FAIL_FILL;
  if (status.startsWith('BLOCKED')) return COLORS.BLOCKED_FILL;
  if (status === 'SKIPPED') return COLORS.SKIPPED_FILL;
  if (status === 'DRAFT' || status === 'READY') return COLORS.DRAFT_FILL;
  return COLORS.NOT_RUN_FILL;
}

function statusTextColor(status) {
  if (!status) return COLORS.NOT_RUN_TEXT;
  if (status === 'PASS') return COLORS.PASS_TEXT;
  if (status === 'FAIL') return COLORS.FAIL_TEXT;
  if (status.startsWith('BLOCKED')) return COLORS.BLOCKED_TEXT;
  if (status === 'SKIPPED') return COLORS.SKIPPED_TEXT;
  return COLORS.NOT_RUN_TEXT;
}

// ── Shared cell styling ───────────────────────────────────────────────────────

function applyBorder(cell) {
  const side = { style: 'thin', color: { argb: COLORS.BORDER } };
  cell.border = { top: side, bottom: side, left: side, right: side };
}

function applyHeaderStyle(cell) {
  cell.font = { bold: true, color: { argb: COLORS.HEADER_TEXT }, size: 10 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_BG } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  applyBorder(cell);
}

// ── Sheet 1: TC Matrix ────────────────────────────────────────────────────────

/**
 * Build the "TC Matrix" worksheet.
 *
 * Columns:
 *   A: TC-ID   B: Title   C: Priority   D: Category   E: R-IDs
 *   F: Status  G: Standards  H: Evidence  I: Notes
 *
 * @param {ExcelJS.Workbook} wb
 * @param {TcRecord[]} tcs
 * @param {string} slug
 * @param {boolean} planOnly
 */
function buildTcMatrixSheet(wb, tcs, slug, planOnly) {
  const ws = wb.addWorksheet('TC Matrix', {
    pageSetup: {
      paperSize: 9,        // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  });

  // ── Title row ──────────────────────────────────────────────────────────────
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `Test ${planOnly ? 'Plan' : 'Execution Report'} — ${slug}`;
  titleCell.font = { size: 16, bold: true, color: { argb: COLORS.TITLE_TEXT } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  ws.getRow(1).height = 30;

  // ── Subtitle row ───────────────────────────────────────────────────────────
  ws.mergeCells('A2:I2');
  const subtitleCell = ws.getCell('A2');
  subtitleCell.value = `Generated ${new Date().toISOString().split('T')[0]} · ${tcs.length} test case${tcs.length !== 1 ? 's' : ''} · TestNUX v0.2.0-alpha`;
  subtitleCell.font = { size: 10, italic: true, color: { argb: 'FF6B7280' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;

  ws.addRow([]); // spacer

  // ── Column definitions ─────────────────────────────────────────────────────
  const columns = [
    { header: 'TC-ID',     width: 14 },
    { header: 'Title',     width: 38 },
    { header: 'Priority',  width: 10 },
    { header: 'Category',  width: 22 },
    { header: 'R-IDs',     width: 14 },
    { header: 'Status',    width: 22 },
    { header: 'Standards', width: 28 },
    { header: 'Evidence',  width: 16 },
    { header: 'Notes',     width: 36 },
  ];
  ws.columns = columns.map((c) => ({ width: c.width }));

  // ── Header row (row 4) ─────────────────────────────────────────────────────
  const headerRow = ws.addRow(columns.map((c) => c.header));
  headerRow.height = 24;
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  // Freeze pane below header row
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  // ── Data rows ──────────────────────────────────────────────────────────────
  const statusDropdown = '"DRAFT,READY,IN-PROGRESS,PASS,FAIL,BLOCKED-IMPLEMENTATION,BLOCKED-CONFIG,SKIPPED,ARCHIVED"';

  for (const tc of tcs) {
    const rIdsStr = tc.rIds?.join(', ') ?? '';
    const standardsStr = (tc.standards ?? []).slice(0, 3).join('; ') + (tc.standards?.length > 3 ? '…' : '');
    const evidencePath = tc.evidence ? `evidence/${tc.id}.png` : '—';
    const status = planOnly ? '' : (tc.status ?? 'NOT_RUN');

    const row = ws.addRow([
      tc.id,
      tc.title,
      tc.priority,
      tc.category,
      rIdsStr,
      status,
      standardsStr,
      evidencePath,
      tc.notes || tc.verifies || '',
    ]);

    row.height = 52;
    row.alignment = { vertical: 'top', wrapText: true };

    // TC-ID: monospace, left-aligned
    const idCell = row.getCell(1);
    idCell.font = { name: 'Courier New', size: 10, bold: true };
    idCell.alignment = { vertical: 'middle', horizontal: 'left' };
    applyBorder(idCell);

    // Title
    const titleRowCell = row.getCell(2);
    titleRowCell.font = { size: 10 };
    applyBorder(titleRowCell);

    // Priority — color coded
    const priCell = row.getCell(3);
    priCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priorityFillColor(tc.priority) } };
    priCell.font = { bold: true, size: 10, color: { argb: priorityTextColor(tc.priority) } };
    priCell.alignment = { vertical: 'middle', horizontal: 'center' };
    applyBorder(priCell);

    // Category
    applyBorder(row.getCell(4));

    // R-IDs
    const rIdCell = row.getCell(5);
    rIdCell.font = { name: 'Courier New', size: 9 };
    applyBorder(rIdCell);

    // Status — color coded + dropdown
    const statusCell = row.getCell(6);
    if (!planOnly && status) {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFillColor(status) } };
      statusCell.font = { bold: true, size: 10, color: { argb: statusTextColor(status) } };
    }
    statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
    statusCell.dataValidation = {
      type: 'list',
      allowBlank: true,
      showDropDown: true,
      formulae: [statusDropdown],
      error: 'Select a valid status from the dropdown.',
      errorTitle: 'Invalid Status',
    };
    applyBorder(statusCell);

    // Standards
    applyBorder(row.getCell(7));

    // Evidence
    applyBorder(row.getCell(8));

    // Notes
    applyBorder(row.getCell(9));
  }

  // ── Summary footer ─────────────────────────────────────────────────────────
  ws.addRow([]);
  const counts = {
    total: tcs.length,
    P0: tcs.filter((t) => t.priority === 'P0').length,
    P1: tcs.filter((t) => t.priority === 'P1').length,
    P2: tcs.filter((t) => t.priority === 'P2').length,
  };
  if (!planOnly) {
    counts.pass = tcs.filter((t) => t.status === 'PASS').length;
    counts.fail = tcs.filter((t) => t.status === 'FAIL').length;
    counts.blocked = tcs.filter((t) => (t.status ?? '').startsWith('BLOCKED')).length;
    counts.skipped = tcs.filter((t) => t.status === 'SKIPPED').length;
  }

  const summaryRow = ws.addRow([
    'Summary',
    `Total: ${counts.total}`,
    `P0: ${counts.P0}  P1: ${counts.P1}  P2: ${counts.P2}`,
    '',
    '',
    planOnly ? '' : `PASS: ${counts.pass}  FAIL: ${counts.fail}  BLOCKED: ${counts.blocked}  SKIPPED: ${counts.skipped}`,
    '',
    '',
    '',
  ]);
  summaryRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF374151' } };
  summaryRow.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
}

// ── Sheet 2: Standards Alignment ──────────────────────────────────────────────

/**
 * Build the "Standards Alignment" worksheet.
 * Each unique standard → comma-separated list of TC-IDs that reference it.
 *
 * @param {ExcelJS.Workbook} wb
 * @param {TcRecord[]} tcs
 */
function buildStandardsSheet(wb, tcs) {
  // Collect standard → TC-ID mapping
  const standardsMap = new Map();
  for (const tc of tcs) {
    const stds = Array.isArray(tc.standards) ? tc.standards : [];
    for (const std of stds) {
      if (!std || !std.trim()) continue;
      if (!standardsMap.has(std)) standardsMap.set(std, []);
      standardsMap.get(std).push(tc.id);
    }
  }

  if (standardsMap.size === 0) return; // nothing to render

  const ws = wb.addWorksheet('Standards Alignment', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  // Title
  ws.mergeCells('A1:C1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Standards Alignment — TC Coverage';
  titleCell.font = { size: 14, bold: true, color: { argb: COLORS.TITLE_TEXT } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_BG } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  ws.addRow([]); // spacer

  ws.columns = [
    { width: 40 }, // Standard
    { width: 12 }, // TC Count
    { width: 55 }, // TC-IDs
  ];

  const headerRow = ws.addRow(['Standard / Control', 'TC Count', 'Covered by TC-IDs']);
  headerRow.height = 22;
  headerRow.eachCell((cell) => applyHeaderStyle(cell));

  for (const [std, ids] of standardsMap.entries()) {
    const row = ws.addRow([std, ids.length, ids.join(', ')]);
    row.height = 20;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).font = { name: 'Courier New', size: 9 };
    row.eachCell((cell) => applyBorder(cell));
  }

  // Summary
  ws.addRow([]);
  const summaryRow = ws.addRow([`${standardsMap.size} standard${standardsMap.size !== 1 ? 's' : ''} referenced across ${tcs.length} test cases`, '', '']);
  summaryRow.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build an ExcelJS Workbook from TcRecord[].
 *
 * @param {TcRecord[]} tcs
 * @param {{ slug?: string, planOnly?: boolean }} opts
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function buildXlsx(tcs, opts = {}) {
  const { slug = 'test-report', planOnly = false } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'TestNUX v0.2.0-alpha';
  wb.created = new Date();
  wb.modified = new Date();

  buildTcMatrixSheet(wb, tcs, slug, planOnly);
  buildStandardsSheet(wb, tcs);

  return wb;
}

/**
 * Build and write an Excel workbook to disk.
 *
 * @param {TcRecord[]} tcs
 * @param {string} outputPath  Absolute path ending in .xlsx
 * @param {{ slug?: string, planOnly?: boolean }} opts
 * @returns {Promise<void>}
 */
export async function writeXlsx(tcs, outputPath, opts = {}) {
  const wb = await buildXlsx(tcs, opts);
  await wb.xlsx.writeFile(outputPath);
}

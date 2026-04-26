// Copyright 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/report.mjs
 *
 * Implements `testnux report <folder>`.
 *
 * Given a testing-log/<date>_<slug>/ folder, reads:
 *   test-plan.md              — TC matrix + per-TC Given/When/Then sections
 *   execution-log-auto.md     — preferred auto-generated execution log
 *   execution-log.md          — fallback curated log
 *   evidence/<TC-ID>.png      — screenshot evidence (optional)
 *
 * Produces:
 *   <slug>-test-plan.xlsx     — TC matrix spreadsheet (Sheet 1: TC Matrix, Sheet 2: Standards)
 *   <slug>-execution-report.html  — self-contained evidence report
 *
 * Exit codes:
 *   0  success
 *   1  folder or test-plan.md missing
 *   4  render failure (XLSX / HTML write error)
 *
 * Options:
 *   planOnly       — omit Status / Actual columns, add PLAN ONLY banner
 *   open           — open the HTML after generation (platform-aware)
 *   json           — emit machine-readable JSON progress events to stdout
 *   failOnMissing  — exit 1 if both execution-log AND evidence/ are absent
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';

import { parseTestPlanFile } from '../parsers/test-plan.mjs';
import { parseExecutionLogFile, mergeExecutionResults } from '../parsers/execution-log.mjs';
import { writeXlsx } from '../renderers/xlsx.mjs';
import { buildHtml } from '../renderers/html.mjs';

// ── ANSI colors (no dep) ──────────────────────────────────────────────────────

const C = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── Logging helpers ───────────────────────────────────────────────────────────

function log(type, message, jsonMode, extra = {}) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ event: `report.${type}`, message, ...extra }) + '\n');
  } else {
    if (type === 'error') console.error(C.red(`  ✗ ${message}`));
    else if (type === 'warn') console.warn(C.yellow(`  ⚠ ${message}`));
    else if (type === 'success') console.log(C.green(`  ✓ ${message}`));
    else if (type === 'info') console.log(C.dim(`  · ${message}`));
    else console.log(`  ${message}`);
  }
}

// ── Folder auto-detection ─────────────────────────────────────────────────────

/**
 * If folder is not provided, look for a single testing-log/<date>_<slug>/ in cwd.
 * Returns the resolved absolute path, or null if it cannot be determined.
 *
 * @param {string|undefined} folderArg
 * @returns {string|null}
 */
function resolveFolder(folderArg) {
  if (folderArg) return path.resolve(process.cwd(), folderArg);

  // Auto-detect: look for testing-log/ subdirectories
  const testingLogDir = path.join(process.cwd(), 'testing-log');
  if (!fs.existsSync(testingLogDir)) return null;

  const entries = fs.readdirSync(testingLogDir).filter((name) => {
    const full = path.join(testingLogDir, name);
    return fs.statSync(full).isDirectory() && /^\d{4}-\d{2}-\d{2}_/.test(name);
  });

  if (entries.length === 1) return path.join(testingLogDir, entries[0]);
  if (entries.length > 1) return null; // ambiguous — require explicit arg
  return null;
}

// ── Evidence directory ────────────────────────────────────────────────────────

/**
 * Returns the path to the evidence/ subdirectory, or null if it doesn't exist.
 *
 * @param {string} folder
 * @returns {string|null}
 */
function findEvidenceDir(folder) {
  const evidenceDir = path.join(folder, 'evidence');
  return fs.existsSync(evidenceDir) ? evidenceDir : null;
}

// ── Open file in OS default app ───────────────────────────────────────────────

function openFile(filePath) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      childProcess.execSync(`open "${filePath}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      childProcess.execSync(`start "" "${filePath}"`, { stdio: 'ignore', shell: true });
    } else {
      childProcess.execSync(`xdg-open "${filePath}"`, { stdio: 'ignore' });
    }
  } catch {
    // Graceful no-op if none of the above are available
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Generate test deliverables (XLSX + HTML) from a testing-log folder.
 *
 * @param {string|undefined} folderArg  Path to the testing-log folder (or undefined for auto-detect)
 * @param {{
 *   planOnly?: boolean,
 *   open?: boolean,
 *   json?: boolean,
 *   failOnMissing?: boolean,
 * }} opts
 */
export async function runReport(folderArg, opts = {}) {
  const {
    planOnly = false,
    open: openAfterGenerate = false,
    json: jsonMode = false,
    failOnMissing = false,
  } = opts;

  // ── 1. Resolve folder ──────────────────────────────────────────────────────
  const folder = resolveFolder(folderArg);

  if (!folder) {
    if (folderArg) {
      log('error', `Folder not found: ${folderArg}`, jsonMode);
    } else {
      log('error', 'No folder specified and could not auto-detect a single testing-log/<date>_<slug>/ directory.', jsonMode);
      log('info', 'Usage: testnux report <testing-log-folder>', jsonMode);
    }
    process.exit(1);
  }

  if (!fs.existsSync(folder)) {
    log('error', `Folder does not exist: ${folder}`, jsonMode);
    process.exit(1);
  }

  const slug = path.basename(folder).replace(/^\d{4}-\d{2}-\d{2}_/, '');

  if (!jsonMode) {
    console.log('');
    console.log(C.bold(`testnux report — ${slug}`));
    console.log(C.dim(`  folder: ${folder}`));
    if (planOnly) console.log(C.yellow('  mode: PLAN ONLY (no execution results)'));
    console.log('');
  }

  // ── 2. Find test-plan.md ───────────────────────────────────────────────────
  const testPlanPath = path.join(folder, 'test-plan.md');
  if (!fs.existsSync(testPlanPath)) {
    log('error', `Missing required file: test-plan.md in ${folder}`, jsonMode);
    process.exit(1);
  }

  // ── 3. Find execution log ──────────────────────────────────────────────────
  const autoLogPath = path.join(folder, 'execution-log-auto.md');
  const curatedLogPath = path.join(folder, 'execution-log.md');

  let executionLogPath = null;
  if (!planOnly) {
    if (fs.existsSync(autoLogPath)) {
      executionLogPath = autoLogPath;
      if (fs.existsSync(curatedLogPath)) {
        log('info', 'Both execution-log-auto.md and execution-log.md found — using execution-log-auto.md (preferred)', jsonMode);
      } else {
        log('info', 'Using execution-log-auto.md', jsonMode);
      }
    } else if (fs.existsSync(curatedLogPath)) {
      executionLogPath = curatedLogPath;
      log('info', 'Using execution-log.md', jsonMode);
    } else {
      log('warn', 'No execution log found — generating in plan-only mode', jsonMode);
      // Implicitly switch to plan-only
      opts = { ...opts, planOnly: true };
    }
  }

  // ── 4. Check evidence directory ────────────────────────────────────────────
  const evidenceDir = findEvidenceDir(folder);
  if (!evidenceDir) {
    log('info', 'No evidence/ directory found — screenshots will show placeholder', jsonMode);
  }

  // --fail-on-missing: error if both execution log AND evidence are absent
  if (failOnMissing && !executionLogPath && !evidenceDir) {
    log('error', '--fail-on-missing: no execution-log.md and no evidence/ directory', jsonMode);
    process.exit(1);
  }

  // ── 5. Parse test plan ─────────────────────────────────────────────────────
  let parseResult;
  try {
    parseResult = parseTestPlanFile(testPlanPath);
  } catch (err) {
    log('error', `Failed to parse test-plan.md: ${err.message}`, jsonMode);
    process.exit(4);
  }

  const { frontmatter, tcs: rawTcs, openItems } = parseResult;
  log('info', `Parsed ${rawTcs.length} test cases from test-plan.md`, jsonMode);

  // ── 6. Parse execution log (if present) ───────────────────────────────────
  let tcs = rawTcs;
  if (executionLogPath) {
    try {
      const execResults = parseExecutionLogFile(executionLogPath);
      tcs = mergeExecutionResults(rawTcs, execResults);
      const matched = execResults.filter((r) => rawTcs.some((t) => t.id === r.id)).length;
      log('info', `Merged ${matched}/${execResults.length} execution results`, jsonMode);
    } catch (err) {
      log('warn', `Could not parse execution log: ${err.message} — continuing without results`, jsonMode);
    }
  }

  // Count evidence hits
  if (evidenceDir) {
    const evidenceHits = tcs.filter((tc) => {
      const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      return exts.some((ext) => fs.existsSync(path.join(evidenceDir, `${tc.id}${ext}`)));
    }).length;
    log('info', `Evidence screenshots found for ${evidenceHits}/${tcs.length} TCs`, jsonMode);
  }

  // ── 7. Generate XLSX ───────────────────────────────────────────────────────
  const xlsxPath = path.join(folder, `${slug}-test-plan.xlsx`);
  try {
    await writeXlsx(tcs, xlsxPath, { slug, planOnly: opts.planOnly ?? planOnly });
    log('success', `XLSX written: ${path.relative(process.cwd(), xlsxPath)}`, jsonMode, { path: xlsxPath });
  } catch (err) {
    log('error', `XLSX render failed: ${err.message}`, jsonMode);
    process.exit(4);
  }

  // ── 8. Generate HTML ───────────────────────────────────────────────────────
  const htmlPath = path.join(folder, `${slug}-execution-report.html`);
  try {
    const html = buildHtml(tcs, {
      slug,
      planOnly: opts.planOnly ?? planOnly,
      evidenceDir: evidenceDir ?? '',
      openItems,
      frontmatter,
    });
    fs.writeFileSync(htmlPath, html, 'utf-8');
    log('success', `HTML written: ${path.relative(process.cwd(), htmlPath)}`, jsonMode, { path: htmlPath });
  } catch (err) {
    log('error', `HTML render failed: ${err.message}`, jsonMode);
    process.exit(4);
  }

  // ── 9. Summary ────────────────────────────────────────────────────────────
  if (!jsonMode) {
    const isEffectivePlanOnly = opts.planOnly ?? planOnly ?? !executionLogPath;
    const passCount = tcs.filter((tc) => tc.status === 'PASS').length;
    const failCount = tcs.filter((tc) => tc.status === 'FAIL').length;
    const p0Fail = tcs.filter((tc) => tc.priority === 'P0' && tc.status !== 'PASS').length;
    console.log('');
    console.log(C.bold('  Summary'));
    console.log(C.dim(`    TCs: ${tcs.length}  PASS: ${passCount}  FAIL: ${failCount}  P0-at-risk: ${p0Fail}`));
    if (!isEffectivePlanOnly) {
      const passRate = tcs.length > 0 ? Math.round((passCount / tcs.length) * 100) : 0;
      console.log(C.dim(`    Pass rate: ${passRate}%`));
    }
    console.log('');
  }

  // ── 10. Open HTML if requested ─────────────────────────────────────────────
  if (openAfterGenerate) {
    openFile(htmlPath);
  }

  // ── 11. JSON final event ───────────────────────────────────────────────────
  if (jsonMode) {
    process.stdout.write(JSON.stringify({
      event: 'report.done',
      slug,
      folder,
      xlsxPath,
      htmlPath,
      tcCount: tcs.length,
      planOnly: opts.planOnly ?? planOnly,
    }) + '\n');
  }
}

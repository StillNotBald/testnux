// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/sign-stale.mjs
 *
 * Implements `testnux sign stale-check <surface>` — flag sign-off entries
 * that have exceeded the configured age threshold.
 *
 * Usage:
 *   testnux sign stale-check <surface> [--threshold 90d] [--strict]
 *     Reads <folder>/uat-log.jsonl.
 *     Reports entries older than --threshold (default: 90 days).
 *     Exits 0 unless --strict is set AND stale entries are found.
 *
 * Exit codes:
 *   0  success (no stale entries, or stale found but --strict not set)
 *   1  stale entries found AND --strict is set (CI gate)
 *   2  missing required input (surface folder not found)
 */

import fs from 'fs';
import path from 'path';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {string} surface   - folder name (e.g. "2026-04-26_login")
 * @param {object} opts      - { folder?: string, threshold?: string, json?: boolean, strict?: boolean }
 *
 * opts.folder    — root directory to look for <surface>/uat-log.jsonl. Defaults to CWD.
 * opts.threshold — age threshold string, e.g. '7d', '30d', '90d', '365d'. Default: '90d'.
 * opts.json      — emit events as newline-delimited JSON records.
 * opts.strict    — exit 1 if stale entries are found (CI gate mode).
 */
export async function runSignStaleCheck(surface, opts = {}) {
  const {
    folder    = process.cwd(),
    threshold = '90d',
    json      = false,
    strict    = false,
  } = opts;

  // ── 1. Locate surface folder ─────────────────────────────────────────────
  const surfaceDir = path.resolve(folder, surface);
  if (!fs.existsSync(surfaceDir)) {
    const err = new Error(
      `Surface folder not found: ${surfaceDir}\n` +
      `  Run \`testnux init ${surface.replace(/^\d{4}-\d{2}-\d{2}_/, '')}\` first.`,
    );
    err.exitCode = 2;
    throw err;
  }

  const logPath = path.join(surfaceDir, 'uat-log.jsonl');

  // ── 2. Parse threshold ───────────────────────────────────────────────────
  const thresholdMs = _parseThreshold(threshold);
  if (thresholdMs === null) {
    const err = new Error(
      `Invalid threshold "${threshold}". ` +
      `Use a positive integer followed by "d" (e.g. 7d, 30d, 90d, 180d, 365d).`,
    );
    err.exitCode = 2;
    throw err;
  }

  log(json, { event: 'sign.stale-check.start', surface, threshold, thresholdMs, logPath });

  // ── 3. Read log entries ──────────────────────────────────────────────────
  const entries = _readEntries(logPath);
  const now     = Date.now();

  log(json, { event: 'sign.stale-check.entries', count: entries.length });

  if (entries.length === 0) {
    if (!json) {
      console.log('');
      console.log('[sign stale-check] No entries in uat-log.jsonl.');
      console.log(`  Surface : ${surface}`);
      console.log(`  Log     : ${logPath}`);
      console.log('');
    }
    log(json, { event: 'sign.stale-check.done', stale: 0, total: 0 });
    return { staleEntries: [], total: 0 };
  }

  // ── 4. Compute ages and flag stale entries ───────────────────────────────
  const staleEntries = [];

  for (const entry of entries) {
    const ts = entry.ts ? new Date(entry.ts).getTime() : NaN;
    if (isNaN(ts)) {
      // Unparseable timestamp — treat as stale (conservative)
      staleEntries.push({
        tc_id:    entry.tc_id,
        reviewer: entry.reviewer,
        ts:       entry.ts,
        ageMs:    Infinity,
        ageLabel: 'unparseable timestamp',
      });
      continue;
    }
    const ageMs = now - ts;
    if (ageMs > thresholdMs) {
      staleEntries.push({
        tc_id:    entry.tc_id,
        reviewer: entry.reviewer,
        ts:       entry.ts,
        ageMs,
        ageLabel: _formatAge(ageMs),
      });
    }
  }

  // ── 5. Output ────────────────────────────────────────────────────────────
  log(json, {
    event:   'sign.stale-check.done',
    stale:   staleEntries.length,
    total:   entries.length,
    threshold,
    entries: staleEntries,
  });

  if (!json) {
    console.log('');
    console.log(`[sign stale-check] Surface: ${surface}`);
    console.log(`  Log       : ${logPath}`);
    console.log(`  Total     : ${entries.length} entries`);
    console.log(`  Threshold : >${threshold}`);
    console.log(`  Stale     : ${staleEntries.length}`);
    console.log('');

    if (staleEntries.length === 0) {
      console.log('  ✓ No stale entries — all sign-offs are within the threshold.');
    } else {
      console.log('  ✗ Stale entries found:');
      console.log('');

      const tcColWidth = Math.max(5, ...staleEntries.map((e) => String(e.tc_id ?? '').length));
      const revColWidth = Math.max(8, ...staleEntries.map((e) => String(e.reviewer ?? '').length));

      const header =
        '  ' +
        padEnd('TC-ID',     tcColWidth)  + '  ' +
        padEnd('Reviewer',  revColWidth) + '  ' +
        padEnd('Age',       20)          + '  ' +
        'Threshold';
      console.log(header);
      console.log('  ' + '─'.repeat(header.length - 2));

      for (const e of staleEntries) {
        const row =
          '  ' +
          padEnd(String(e.tc_id    ?? '—'), tcColWidth)  + '  ' +
          padEnd(String(e.reviewer ?? '—'), revColWidth) + '  ' +
          padEnd(e.ageLabel,               20)           + '  ' +
          `>${threshold}`;
        console.log(row);
      }

      console.log('');
      console.log('  Suggested action: Re-attest stale entries by running:');
      for (const e of staleEntries) {
        console.log(`    testnux sign ${surface} --tc ${e.tc_id}`);
      }
    }

    console.log('');

    if (strict && staleEntries.length > 0) {
      console.log(`  [sign stale-check] --strict mode: exiting 1 (${staleEntries.length} stale entries).`);
    }
  }

  // ── 6. Exit code (caller handles process.exit) ───────────────────────────
  if (strict && staleEntries.length > 0) {
    const err = new Error(
      `[sign stale-check] ${staleEntries.length} stale entries exceed threshold >${threshold}.`,
    );
    err.exitCode = 1;
    err.staleEntries = staleEntries;
    throw err;
  }

  return { staleEntries, total: entries.length };
}

// ── Threshold parser ──────────────────────────────────────────────────────────

/**
 * Parse a threshold string like '7d', '90d', '365d' into milliseconds.
 * Returns null for invalid input.
 *
 * @param {string} str
 * @returns {number | null}
 */
export function parseThreshold(str) {
  return _parseThreshold(str);
}

function _parseThreshold(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d+)d$/i);
  if (!m) return null;
  const days = parseInt(m[1], 10);
  if (days <= 0) return null;
  return days * 24 * 60 * 60 * 1000;
}

// ── Age formatter ─────────────────────────────────────────────────────────────

/**
 * Format a duration in milliseconds as a human-readable string.
 * e.g. 127 days ago
 *
 * @param {number} ms
 * @returns {string}
 */
function _formatAge(ms) {
  if (!isFinite(ms)) return 'unknown age';
  const days  = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return 'less than an hour ago';
}

// ── JSONL reader ──────────────────────────────────────────────────────────────

/**
 * Read and parse all valid data lines from a uat-log.jsonl file.
 * Skips schema header lines and malformed JSON silently.
 *
 * @param {string} jsonlPath
 * @returns {object[]}
 */
function _readEntries(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) return [];
  return fs
    .readFileSync(jsonlPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('{"_schema"'))
    .reduce((acc, raw) => {
      try { acc.push(JSON.parse(raw)); } catch { /* skip malformed */ }
      return acc;
    }, []);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function padEnd(str, width) {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/visual.mjs
 *
 * Implements `testnux visual` — visual regression testing.
 *
 * Sub-commands:
 *   testnux visual baseline <slug>
 *     Capture full-page screenshots for all TCs in <slug>/ as baseline images.
 *     Stored at: <slug>/visual-baseline/<TC-ID>.png
 *
 *   testnux visual compare <slug>
 *     Capture current screenshots, diff against baseline using pixelmatch.
 *     Diffs stored at: <slug>/visual-diff/<TC-ID>-diff.png
 *     Flags TCs where pixel diff exceeds the configured threshold.
 *
 * Optional dependencies:
 *   pixelmatch  — npm install pixelmatch pngjs
 *   @playwright/test — for screenshot capture (already a project dep)
 *
 *   If pixelmatch is not installed, the compare command prints an install notice
 *   and exits gracefully (no crash). v0.3 stub — full Playwright integration
 *   arrives in the v0.3 release cycle.
 *
 * Configuration (testnux.config.mjs):
 *   export default {
 *     visual: {
 *       diffThreshold: 0.05,   // 5% — fraction of pixels allowed to differ
 *       maskSelectors: [],      // CSS selectors for dynamic regions to mask
 *       fullPage: true,
 *     }
 *   }
 *
 * Flags:
 *   --strict      fail (exit 1) on any diff above threshold
 *   --report      flag only, do not fail (default)
 *   --threshold   override config diffThreshold for this run (0.0–1.0)
 */

import fs from 'fs';
import path from 'path';

// Default visual configuration — overridable via testnux.config.mjs
const DEFAULT_VISUAL_CONFIG = {
  diffThreshold: 0.05,
  maskSelectors: [],
  fullPage: true,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Capture baseline screenshots for all TCs in the given slug folder.
 *
 * v0.3 stub: scaffolds the baseline directory and prints per-TC instructions.
 * Full Playwright screenshot capture is wired up in the v0.3 release cycle.
 *
 * @param {string} slug   - test-pass slug (folder name or date-prefixed name)
 * @param {object} opts   - { outDir?: string, json?: boolean, threshold?: number }
 */
export async function runVisualBaseline(slug, opts = {}) {
  const { outDir = './testing-log', json = false } = opts;

  const slugDir = resolveSlugDir(outDir, slug);
  const baselineDir = path.join(slugDir, 'visual-baseline');
  fs.mkdirSync(baselineDir, { recursive: true });

  const config = await loadVisualConfig(outDir);
  const tcs = readTcIds(slugDir);

  log(json, { event: 'visual.baseline.start', slug, slugDir, tcCount: tcs.length, config });

  if (!json) {
    console.log(`[visual baseline] Slug: ${slug}`);
    console.log(`  Baseline dir : ${baselineDir}`);
    console.log(`  TCs found    : ${tcs.length}`);
    console.log(`  Threshold    : ${config.diffThreshold * 100}%`);
    console.log('');
  }

  if (tcs.length === 0) {
    if (!json) {
      console.log('[visual baseline] No TCs found in test-plan.md — nothing to baseline.');
      console.log('  Hint: populate the TC table in test-plan.md first.');
    }
    log(json, { event: 'visual.baseline.empty' });
    return;
  }

  // v0.3 stub: write placeholder files and instructions
  const stubMessage = [
    'VISUAL REGRESSION — v0.3 STUB',
    '',
    'Full screenshot capture requires:',
    '  1. A running application URL (configure in testnux.config.mjs → visual.baseUrl)',
    '  2. Playwright to be installed (npm install @playwright/test)',
    '  3. Run: npx playwright test --project=visual-baseline',
    '',
    'This directory is ready for baselines. Once pixelmatch + pngjs are installed:',
    '  npm install pixelmatch pngjs',
    'Rerun `testnux visual baseline ' + slug + '` to capture live screenshots.',
  ].join('\n');

  const stubPath = path.join(baselineDir, '_STUB.txt');
  fs.writeFileSync(stubPath, stubMessage, 'utf-8');

  for (const tcId of tcs) {
    const placeholder = path.join(baselineDir, `${tcId}.png.pending`);
    if (!fs.existsSync(placeholder)) {
      fs.writeFileSync(placeholder, '', 'utf-8');
    }
    log(json, { event: 'visual.baseline.tc', tcId, placeholder });
    if (!json) console.log(`  [stub] ${tcId} → ${path.basename(placeholder)}`);
  }

  if (!json) {
    console.log('');
    console.log('[visual baseline] Stub placeholders written.');
    printPixelmatchNotice();
    console.log('');
    console.log('  Next: install pixelmatch + pngjs, then rerun this command.');
  }

  log(json, { event: 'visual.baseline.done', slug, tcs });
}

/**
 * Compare current screenshots against baseline, flag diffs above threshold.
 *
 * v0.3 stub: reads existing baselines, prints diff instructions, and
 * gracefully degrades if pixelmatch is not installed.
 *
 * @param {string} slug   - test-pass slug
 * @param {object} opts   - { strict?: boolean, outDir?: string, json?: boolean, threshold?: number }
 */
export async function runVisualCompare(slug, opts = {}) {
  const { strict = false, outDir = './testing-log', json = false, threshold } = opts;

  const slugDir = resolveSlugDir(outDir, slug);
  const baselineDir = path.join(slugDir, 'visual-baseline');
  const diffDir = path.join(slugDir, 'visual-diff');

  if (!fs.existsSync(baselineDir)) {
    const msg = `No baseline found at ${baselineDir}. Run \`testnux visual baseline ${slug}\` first.`;
    log(json, { event: 'visual.compare.error', error: msg });
    if (!json) console.log(`[visual compare] ${msg}`);
    return;
  }

  const config = await loadVisualConfig(outDir);
  const effectiveThreshold = threshold != null ? Number(threshold) : config.diffThreshold;

  fs.mkdirSync(diffDir, { recursive: true });

  // Check if pixelmatch is available
  const pixelmatchAvailable = await checkPixelmatch();

  log(json, {
    event: 'visual.compare.start',
    slug,
    strict,
    threshold: effectiveThreshold,
    pixelmatchAvailable,
  });

  if (!json) {
    console.log(`[visual compare] Slug      : ${slug}`);
    console.log(`  Baseline dir : ${baselineDir}`);
    console.log(`  Diff dir     : ${diffDir}`);
    console.log(`  Threshold    : ${effectiveThreshold * 100}%`);
    console.log(`  Mode         : ${strict ? '--strict (fail on diff)' : '--report (flag only)'}`);
    console.log(`  pixelmatch   : ${pixelmatchAvailable ? 'available' : 'NOT INSTALLED (stub mode)'}`);
    console.log('');
  }

  if (!pixelmatchAvailable) {
    if (!json) printPixelmatchNotice();
    log(json, { event: 'visual.compare.stub', reason: 'pixelmatch not installed' });
    return;
  }

  // Real comparison path — available once pixelmatch is installed
  const tcs = readTcIds(slugDir);
  const results = [];

  for (const tcId of tcs) {
    const baselinePng = path.join(baselineDir, `${tcId}.png`);
    if (!fs.existsSync(baselinePng)) {
      results.push({ tcId, status: 'NO_BASELINE' });
      log(json, { event: 'visual.compare.tc', tcId, status: 'NO_BASELINE' });
      continue;
    }

    // Stub: real screenshot + diff would happen here via Playwright + pixelmatch
    // When fully implemented, this calls playwright.screenshot() then pixelmatch()
    results.push({ tcId, status: 'STUB_NOT_RUN' });
    log(json, { event: 'visual.compare.tc', tcId, status: 'STUB_NOT_RUN' });
    if (!json) console.log(`  [stub] ${tcId} — comparison stub (pixelmatch loaded but screenshot not wired yet)`);
  }

  // Render summary table
  if (!json) {
    console.log('');
    renderCompareTable(results, effectiveThreshold);
    console.log('');
  }

  log(json, { event: 'visual.compare.done', slug, results });

  if (strict) {
    const failures = results.filter((r) => r.status === 'FAIL');
    if (failures.length > 0) {
      const err = new Error(
        `[visual compare] ${failures.length} TC(s) exceed diff threshold in --strict mode.`
      );
      err.exitCode = 1;
      throw err;
    }
  }

  return results;
}

// ── Internals ─────────────────────────────────────────────────────────────────

/**
 * Resolve the slug directory.
 * Accepts:
 *   - an absolute path
 *   - <date>_<slug> (full folder name)
 *   - <slug> (searches for the most recent matching folder under outDir)
 */
function resolveSlugDir(outDir, slug) {
  // If it looks like an absolute path, use it directly
  if (path.isAbsolute(slug)) return slug;

  const rootDir = path.resolve(outDir);

  // Exact match first
  const exact = path.join(rootDir, slug);
  if (fs.existsSync(exact)) return exact;

  // Prefix search: most recent <date>_<slug>
  if (fs.existsSync(rootDir)) {
    const pattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}_${escapeRegex(slug)}$`);
    const matches = fs
      .readdirSync(rootDir)
      .filter((name) => pattern.test(name))
      .sort()
      .reverse();
    if (matches.length > 0) return path.join(rootDir, matches[0]);
  }

  // Fall back — caller will get a sensible error when trying to read it
  return exact;
}

/**
 * Read TC-IDs from test-plan.md (same regex as parser.mjs).
 */
function readTcIds(slugDir) {
  const planPath = path.join(slugDir, 'test-plan.md');
  if (!fs.existsSync(planPath)) return [];

  const content = fs.readFileSync(planPath, 'utf-8');
  const tcRowRe = /^\|\s*([\w-]+-\d+)\s*\|/gm;
  const ids = [];
  let m;
  while ((m = tcRowRe.exec(content)) !== null) {
    const id = m[1].trim().toUpperCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Load visual config from testnux.config.mjs if it exists.
 * Returns merged config with defaults.
 */
async function loadVisualConfig(outDir) {
  const configPath = path.resolve(outDir, '..', 'testnux.config.mjs');
  const altConfigPath = path.resolve(process.cwd(), 'testnux.config.mjs');

  for (const cfgPath of [configPath, altConfigPath]) {
    if (fs.existsSync(cfgPath)) {
      try {
        const mod = await import(cfgPath);
        const visualCfg = mod.default?.visual ?? {};
        return { ...DEFAULT_VISUAL_CONFIG, ...visualCfg };
      } catch {
        // malformed config — use defaults
      }
    }
  }

  return { ...DEFAULT_VISUAL_CONFIG };
}

/**
 * Check if pixelmatch is importable without throwing.
 * Returns true if available, false otherwise.
 */
async function checkPixelmatch() {
  try {
    await import('pixelmatch');
    return true;
  } catch {
    return false;
  }
}

function renderCompareTable(results, threshold) {
  const header = `| TC-ID | Status | Diff % | Above Threshold |`;
  const sep = `|-------|--------|--------|-----------------|`;
  const rows = results.map(({ tcId, status, diffPct }) => {
    const pct = diffPct != null ? `${(diffPct * 100).toFixed(2)}%` : 'N/A';
    const above = diffPct != null ? (diffPct > threshold ? 'YES' : 'no') : 'N/A';
    return `| ${tcId} | ${status} | ${pct} | ${above} |`;
  });
  console.log([header, sep, ...rows].join('\n'));
}

function printPixelmatchNotice() {
  console.log('');
  console.log('  To enable visual regression comparison, install:');
  console.log('    npm install pixelmatch pngjs');
  console.log('  Then rerun: testnux visual compare <slug>');
  console.log('');
  console.log('  pixelmatch is MIT licensed and has zero runtime dependencies.');
  console.log('  It is an optional peer dependency of testnux.');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

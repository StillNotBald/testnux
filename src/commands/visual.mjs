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
 *     Stored at: <folder>/visual-baseline/<TC-ID>.png
 *
 *   testnux visual compare <slug>
 *     Capture current screenshots, diff against baseline using pixelmatch.
 *     Current stored at: <folder>/visual-current/<TC-ID>.png
 *     Diffs stored at:   <folder>/visual-diff/<TC-ID>-diff.png
 *     Flags TCs where pixel diff ratio exceeds the configured threshold.
 *
 * Optional dependencies:
 *   @playwright/test or playwright — for screenshot capture.
 *     Dynamic import with helpful install message if missing.
 *
 *   pixelmatch + pngjs — for pixel-level diff computation (compare only).
 *     If missing, compare runs in screenshot-only mode and prints an install notice.
 *     npm install --save-dev pixelmatch pngjs
 *
 * Configuration (testnux.config.mjs):
 *   export default {
 *     visual: {
 *       diffThreshold: 0.05,   // 5% — fraction of pixels allowed to differ
 *       maskSelectors: [],      // CSS selectors for dynamic regions to mask (future)
 *       fullPage: true,
 *       baseUrl: 'http://localhost:3000',
 *     }
 *   }
 *
 * Flags:
 *   --strict      fail (exit 2) on any diff above threshold  (compare only)
 *   --threshold   override config diffThreshold for this run (0.0–1.0)
 *   --base-url    base URL of the running app (default: http://localhost:3000)
 *   --viewport    viewport size as WIDTHxHEIGHT (default: 1280x800)
 *   --urls        comma-separated TC-ID=URL pairs (e.g. TC-01=/login,TC-02=/signup)
 *   --tc-ids      comma-separated TC-IDs to capture (subset of plan)
 *   --folder      explicit path to the test-pass folder (overrides slug search)
 *
 * Exit codes:
 *   0  success
 *   1  configuration/dependency error (missing Playwright, missing baseline)
 *   2  diff above threshold in --strict mode
 */

import fs from 'fs';
import path from 'path';

// Default visual configuration — overridable via testnux.config.mjs
const DEFAULT_VISUAL_CONFIG = {
  diffThreshold: 0.05,
  maskSelectors: [],
  fullPage: true,
  baseUrl: 'http://localhost:3000',
};

const NAV_TIMEOUT_MS = 30_000;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Capture baseline screenshots for all TCs in the given slug folder.
 *
 * @param {string} slug   - test-pass slug (folder name or date-prefixed name)
 * @param {object} opts   - CLI options
 * @param {string}  [opts.folder]   - explicit folder path (overrides slug search)
 * @param {string}  [opts.baseUrl]  - base URL of the running application
 * @param {string}  [opts.viewport] - viewport size "WIDTHxHEIGHT" (default: "1280x800")
 * @param {boolean} [opts.json]     - emit newline-delimited JSON instead of console output
 * @param {string}  [opts.urls]     - comma-separated TC-ID=URL pairs
 * @param {string}  [opts.tcIds]    - comma-separated TC-IDs to capture (subset)
 * @param {string}  [opts.outDir]   - testing-log root (legacy compat)
 */
export async function runVisualBaseline(slug, opts = {}) {
  const {
    folder,
    baseUrl: baseUrlOpt,
    viewport: viewportOpt = '1280x800',
    json = false,
    urls: urlsOpt,
    tcIds: tcIdsOpt,
    outDir = './testing-log',
  } = opts;

  // ── 1. Resolve slug directory ────────────────────────────────────────────────
  const slugDir = folder ? path.resolve(folder) : resolveSlugDir(outDir, slug);

  // ── 2. Load config (for baseUrl, threshold, fullPage) ──────────────────────
  const config = await loadVisualConfig(outDir);
  const effectiveBaseUrl = baseUrlOpt ?? config.baseUrl ?? DEFAULT_VISUAL_CONFIG.baseUrl;
  const viewport = parseViewport(viewportOpt);

  // ── 3. Discover TC-ID → URL mapping ─────────────────────────────────────────
  const tcUrlMap = resolveTcUrlMap({
    slugDir,
    urlsOpt,
    tcIdsOpt,
    effectiveBaseUrl,
    json,
  });

  if (tcUrlMap.size === 0) {
    if (!json) {
      console.log('[visual baseline] No TC-ID → URL mappings found.');
      console.log('  Hint: pass --urls TC-01=/login,TC-02=/signup');
      console.log('        or add visual_urls to test-plan.md frontmatter');
      console.log('        or populate the TC table in test-plan.md');
    }
    log(json, { event: 'visual.baseline.empty', slug });
    return;
  }

  // ── 4. Ensure output directory ───────────────────────────────────────────────
  const baselineDir = path.join(slugDir, 'visual-baseline');
  fs.mkdirSync(baselineDir, { recursive: true });

  if (!json) {
    console.log(`[visual baseline] Slug      : ${slug}`);
    console.log(`  Folder       : ${slugDir}`);
    console.log(`  Baseline dir : ${baselineDir}`);
    console.log(`  Base URL     : ${effectiveBaseUrl}`);
    console.log(`  Viewport     : ${viewport.width}x${viewport.height}`);
    console.log(`  TC count     : ${tcUrlMap.size}`);
    console.log('');
  }

  log(json, {
    event: 'visual.baseline.start',
    slug,
    slugDir,
    tcCount: tcUrlMap.size,
    baseUrl: effectiveBaseUrl,
    viewport,
  });

  // ── 5. Dynamically import Playwright ─────────────────────────────────────────
  const { chromium } = await requirePlaywright(json);

  // ── 6. Launch browser and capture screenshots ────────────────────────────────
  const startMs = Date.now();
  let browser;
  const results = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    for (const [tcId, url] of tcUrlMap.entries()) {
      const outPath = path.join(baselineDir, `${tcId}.png`);
      log(json, { event: 'visual.baseline.tc.start', tcId, url });

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
        await page.screenshot({ path: outPath, fullPage: config.fullPage ?? true });
        results.push({ tcId, url, status: 'CAPTURED', outPath });
        log(json, { event: 'visual.baseline.tc.done', tcId, url, outPath });
        if (!json) console.log(`  [captured] ${tcId} → ${path.basename(outPath)}`);
      } catch (navErr) {
        results.push({ tcId, url, status: 'ERROR', error: navErr.message });
        log(json, { event: 'visual.baseline.tc.error', tcId, url, error: navErr.message });
        if (!json) console.log(`  [error]    ${tcId} — ${navErr.message}`);
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  const captured = results.filter((r) => r.status === 'CAPTURED').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;

  if (!json) {
    console.log('');
    console.log(`[visual baseline] Done — ${captured} captured, ${errors} error(s) in ${elapsedSec}s`);
    console.log(`  Output: ${baselineDir}`);
    if (errors > 0) {
      console.log('  Tip: ensure the app is running at ' + effectiveBaseUrl);
    }
    console.log('');
    console.log('  Next: run `testnux visual compare ' + slug + '` to diff against these baselines.');
    console.log('');
  }

  log(json, {
    event: 'visual.baseline.done',
    slug,
    captured,
    errors,
    elapsedSec: Number(elapsedSec),
    baselineDir,
    results,
  });

  return results;
}

/**
 * Compare current screenshots against baseline, flag diffs above threshold.
 *
 * @param {string} slug   - test-pass slug
 * @param {object} opts   - CLI options
 * @param {string}  [opts.folder]     - explicit folder path (overrides slug search)
 * @param {string}  [opts.baseUrl]    - base URL of the running application
 * @param {string}  [opts.viewport]   - viewport size "WIDTHxHEIGHT" (default: "1280x800")
 * @param {boolean} [opts.strict]     - exit code 2 if any diff above threshold
 * @param {boolean} [opts.json]       - emit newline-delimited JSON
 * @param {number}  [opts.threshold]  - diff ratio threshold (0.0–1.0)
 * @param {string}  [opts.urls]       - comma-separated TC-ID=URL pairs
 * @param {string}  [opts.tcIds]      - comma-separated TC-IDs to capture (subset)
 * @param {string}  [opts.outDir]     - testing-log root (legacy compat)
 */
export async function runVisualCompare(slug, opts = {}) {
  const {
    folder,
    baseUrl: baseUrlOpt,
    viewport: viewportOpt = '1280x800',
    strict = false,
    json = false,
    threshold: thresholdOpt,
    urls: urlsOpt,
    tcIds: tcIdsOpt,
    outDir = './testing-log',
  } = opts;

  // ── 1. Resolve slug directory ────────────────────────────────────────────────
  const slugDir = folder ? path.resolve(folder) : resolveSlugDir(outDir, slug);

  // ── 2. Load config ──────────────────────────────────────────────────────────
  const config = await loadVisualConfig(outDir);
  const effectiveBaseUrl = baseUrlOpt ?? config.baseUrl ?? DEFAULT_VISUAL_CONFIG.baseUrl;
  const effectiveThreshold =
    thresholdOpt != null ? Number(thresholdOpt) : config.diffThreshold;
  const viewport = parseViewport(viewportOpt);

  // ── 3. Check baseline directory exists ──────────────────────────────────────
  const baselineDir = path.join(slugDir, 'visual-baseline');
  if (!fs.existsSync(baselineDir)) {
    const msg =
      `No baseline found at ${baselineDir}.\n` +
      `  Run \`testnux visual baseline ${slug}\` first to capture baselines.`;
    printError(json, msg);
    const err = new Error('Missing baseline directory');
    err.exitCode = 1;
    throw err;
  }

  // ── 4. Discover TC-ID → URL mapping ─────────────────────────────────────────
  const tcUrlMap = resolveTcUrlMap({
    slugDir,
    urlsOpt,
    tcIdsOpt,
    effectiveBaseUrl,
    json,
  });

  if (tcUrlMap.size === 0) {
    if (!json) {
      console.log('[visual compare] No TC-ID → URL mappings found.');
      console.log('  Hint: pass --urls TC-01=/login,TC-02=/signup');
    }
    log(json, { event: 'visual.compare.empty', slug });
    return [];
  }

  // ── 5. Ensure output directories ────────────────────────────────────────────
  const currentDir = path.join(slugDir, 'visual-current');
  const diffDir = path.join(slugDir, 'visual-diff');
  fs.mkdirSync(currentDir, { recursive: true });
  fs.mkdirSync(diffDir, { recursive: true });

  // ── 6. Dynamically import Playwright (required) ──────────────────────────────
  const { chromium } = await requirePlaywright(json);

  // ── 7. Dynamically import pixelmatch + pngjs (optional) ──────────────────────
  const { pixelmatch, PNG } = await tryLoadPixelmatch(json);
  const diffEnabled = pixelmatch !== null && PNG !== null;

  if (!json) {
    console.log(`[visual compare] Slug      : ${slug}`);
    console.log(`  Folder       : ${slugDir}`);
    console.log(`  Baseline dir : ${baselineDir}`);
    console.log(`  Current dir  : ${currentDir}`);
    console.log(`  Diff dir     : ${diffDir}`);
    console.log(`  Threshold    : ${(effectiveThreshold * 100).toFixed(2)}%`);
    console.log(`  Mode         : ${strict ? '--strict (exit 2 on diff)' : 'report-only'}`);
    console.log(`  Base URL     : ${effectiveBaseUrl}`);
    console.log(`  Viewport     : ${viewport.width}x${viewport.height}`);
    console.log(`  pixelmatch   : ${diffEnabled ? 'enabled' : 'not installed (screenshot-only mode)'}`);
    console.log(`  TC count     : ${tcUrlMap.size}`);
    console.log('');
  }

  log(json, {
    event: 'visual.compare.start',
    slug,
    strict,
    threshold: effectiveThreshold,
    diffEnabled,
    tcCount: tcUrlMap.size,
  });

  // ── 8. Launch browser and capture / diff ─────────────────────────────────────
  const startMs = Date.now();
  let browser;
  const results = [];

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    for (const [tcId, url] of tcUrlMap.entries()) {
      const baselinePng = path.join(baselineDir, `${tcId}.png`);
      const currentPng = path.join(currentDir, `${tcId}.png`);
      const diffPng = path.join(diffDir, `${tcId}-diff.png`);

      // Check baseline exists
      if (!fs.existsSync(baselinePng)) {
        results.push({ tcId, url, status: 'NO_BASELINE', diffRatio: null });
        log(json, { event: 'visual.compare.tc', tcId, status: 'NO_BASELINE' });
        if (!json) console.log(`  [no-baseline] ${tcId} — run baseline first`);
        continue;
      }

      // Capture current screenshot
      log(json, { event: 'visual.compare.tc.start', tcId, url });
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
        await page.screenshot({ path: currentPng, fullPage: config.fullPage ?? true });
      } catch (navErr) {
        results.push({ tcId, url, status: 'CAPTURE_ERROR', error: navErr.message, diffRatio: null });
        log(json, { event: 'visual.compare.tc.error', tcId, error: navErr.message });
        if (!json) console.log(`  [error]       ${tcId} — ${navErr.message}`);
        continue;
      }

      // Diff if pixelmatch available
      if (!diffEnabled) {
        results.push({ tcId, url, status: 'CAPTURED', diffRatio: null });
        log(json, { event: 'visual.compare.tc', tcId, status: 'CAPTURED' });
        if (!json) console.log(`  [captured]    ${tcId} — diff comparison disabled`);
        continue;
      }

      // Run pixel diff
      try {
        const { diffRatio, aboveThreshold } = computeDiff({
          baselinePng,
          currentPng,
          diffPng,
          threshold: effectiveThreshold,
          PNG,
          pixelmatch,
        });

        const status = aboveThreshold ? 'DIFF' : 'MATCH';
        results.push({ tcId, url, status, diffRatio });
        log(json, { event: 'visual.compare.tc', tcId, status, diffRatio });

        if (!json) {
          const pct = (diffRatio * 100).toFixed(2);
          const flag = status === 'DIFF' ? ' ⚠' : '';
          console.log(`  [${status.padEnd(5)}]${flag.padEnd(2)}     ${tcId} — ${pct}% diff`);
        }
      } catch (diffErr) {
        results.push({ tcId, url, status: 'DIFF_ERROR', error: diffErr.message, diffRatio: null });
        log(json, { event: 'visual.compare.tc.diff_error', tcId, error: diffErr.message });
        if (!json) console.log(`  [diff-error]  ${tcId} — ${diffErr.message}`);
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // ── 9. Render summary table ──────────────────────────────────────────────────
  if (!json) {
    console.log('');
    renderCompareTable(results, effectiveThreshold);
    console.log('');

    const matched = results.filter((r) => r.status === 'MATCH').length;
    const diffed = results.filter((r) => r.status === 'DIFF').length;
    const captured = results.filter((r) => r.status === 'CAPTURED').length;
    const errors = results.filter(
      (r) => r.status === 'CAPTURE_ERROR' || r.status === 'DIFF_ERROR',
    ).length;

    if (diffEnabled) {
      console.log(
        `[visual compare] ${matched} matched, ${diffed} diffed` +
          (diffed > 0 ? ` (above ${(effectiveThreshold * 100).toFixed(2)}% threshold)` : '') +
          (errors > 0 ? `, ${errors} error(s)` : '') +
          ` — ${elapsedSec}s`,
      );
    } else {
      console.log(
        `[visual compare] ${captured} captured (diff disabled — install pixelmatch)` +
          (errors > 0 ? `, ${errors} error(s)` : '') +
          ` — ${elapsedSec}s`,
      );
    }
    console.log('');
  }

  log(json, {
    event: 'visual.compare.done',
    slug,
    results,
    elapsedSec: Number(elapsedSec),
    diffEnabled,
    threshold: effectiveThreshold,
  });

  // ── 10. Exit code for --strict mode ──────────────────────────────────────────
  if (strict) {
    const diffed = results.filter((r) => r.status === 'DIFF');
    if (diffed.length > 0) {
      const err = new Error(
        `[visual compare] ${diffed.length} TC(s) exceed diff threshold in --strict mode.`,
      );
      err.exitCode = 2;
      throw err;
    }
  }

  return results;
}

// ── Playwright loader ─────────────────────────────────────────────────────────

/**
 * Dynamically import Playwright (tries @playwright/test, then playwright).
 * Throws with exitCode=1 and helpful install message if neither is available.
 *
 * @param {boolean} json
 * @returns {Promise<{ chromium: import('playwright').BrowserType }>}
 */
async function requirePlaywright(json) {
  const candidates = ['@playwright/test', 'playwright'];

  for (const pkg of candidates) {
    try {
      const mod = await import(pkg);
      // @playwright/test exports { chromium, firefox, webkit } at top level
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return { chromium };
    } catch (err) {
      if (
        err.code !== 'ERR_MODULE_NOT_FOUND' &&
        err.code !== 'MODULE_NOT_FOUND' &&
        !err.message?.includes('Cannot find')
      ) {
        throw err;
      }
      // Try next candidate
    }
  }

  printError(
    json,
    '@playwright/test is not installed.\n\n' +
      '  To enable visual regression screenshot capture, install it:\n\n' +
      '    npm install --save-dev @playwright/test\n' +
      '    npx playwright install chromium\n\n' +
      '  Then re-run: testnux visual baseline <slug>',
  );
  const err = new Error('@playwright/test not installed');
  err.exitCode = 1;
  throw err;
}

// ── pixelmatch + pngjs optional loader ────────────────────────────────────────

/**
 * Attempt to load pixelmatch and pngjs.
 * Returns { pixelmatch: fn, PNG: class } on success.
 * Returns { pixelmatch: null, PNG: null } and prints install notice if missing.
 *
 * @param {boolean} json
 * @returns {Promise<{ pixelmatch: Function|null, PNG: object|null }>}
 */
async function tryLoadPixelmatch(json) {
  let pixelmatch = null;
  let PNG = null;

  try {
    const pmMod = await import('pixelmatch');
    pixelmatch = pmMod.default ?? pmMod;
  } catch {
    // Not installed
  }

  try {
    const pngMod = await import('pngjs');
    PNG = pngMod.PNG ?? pngMod.default?.PNG;
  } catch {
    // Not installed
  }

  if (pixelmatch === null || PNG === null) {
    if (!json) {
      console.log(
        '  pixelmatch / pngjs not installed. To enable diff comparison, run:\n' +
          '    npm install --save-dev pixelmatch pngjs\n' +
          '  Continuing in screenshot-only mode.\n',
      );
    }
    log(json, {
      event: 'visual.compare.pixelmatch_missing',
      message: 'pixelmatch not installed — screenshot-only mode',
    });
    return { pixelmatch: null, PNG: null };
  }

  return { pixelmatch, PNG };
}

// ── Pixel diff computation ────────────────────────────────────────────────────

/**
 * Compare two PNG files with pixelmatch and write a diff PNG if pixels differ.
 *
 * @param {{
 *   baselinePng: string,
 *   currentPng: string,
 *   diffPng: string,
 *   threshold: number,
 *   PNG: object,
 *   pixelmatch: Function,
 * }} opts
 * @returns {{ diffRatio: number, aboveThreshold: boolean, diffPixels: number }}
 */
function computeDiff({ baselinePng, currentPng, diffPng, threshold, PNG, pixelmatch }) {
  const baselineData = fs.readFileSync(baselinePng);
  const currentData = fs.readFileSync(currentPng);

  const imgBaseline = PNG.sync.read(baselineData);
  const imgCurrent = PNG.sync.read(currentData);

  const { width, height } = imgBaseline;

  // If dimensions differ, treat as a full diff
  if (imgCurrent.width !== width || imgCurrent.height !== height) {
    const totalPixels = width * height;
    const diffImg = new PNG({ width, height });
    // Fill diff image with a red mask
    for (let i = 0; i < diffImg.data.length; i += 4) {
      diffImg.data[i] = 255;     // R
      diffImg.data[i + 1] = 0;   // G
      diffImg.data[i + 2] = 0;   // B
      diffImg.data[i + 3] = 255; // A
    }
    fs.writeFileSync(diffPng, PNG.sync.write(diffImg));
    return { diffPixels: totalPixels, diffRatio: 1, aboveThreshold: true };
  }

  const diffImg = new PNG({ width, height });
  const diffPixels = pixelmatch(
    imgBaseline.data,
    imgCurrent.data,
    diffImg.data,
    width,
    height,
    { threshold: 0.1 }, // per-pixel comparison sensitivity (not the same as diffThreshold)
  );

  const totalPixels = width * height;
  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;
  const aboveThreshold = diffRatio > threshold;

  if (aboveThreshold) {
    fs.writeFileSync(diffPng, PNG.sync.write(diffImg));
  }

  return { diffPixels, diffRatio, aboveThreshold };
}

// ── TC-ID → URL resolution ───────────────────────────────────────────────────

/**
 * Determine the TC-ID → full URL mapping from three sources (in priority order):
 *   1. --urls flag: comma-separated TC-01=/login,TC-02=/signup  (relative or absolute)
 *   2. test-plan.md frontmatter: visual_urls: { TC-01: "/login" }
 *   3. Fallback: all TC-IDs from the TC table → effectiveBaseUrl (with a warning)
 *
 * @param {{
 *   slugDir: string,
 *   urlsOpt: string|undefined,
 *   tcIdsOpt: string|undefined,
 *   effectiveBaseUrl: string,
 *   json: boolean,
 * }} p
 * @returns {Map<string, string>}  tcId → absolute URL
 */
function resolveTcUrlMap({ slugDir, urlsOpt, tcIdsOpt, effectiveBaseUrl, json }) {
  // Filter by --tc-ids if provided
  const tcIdFilter = tcIdsOpt
    ? new Set(
        tcIdsOpt
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      )
    : null;

  // Source 1: --urls flag
  if (urlsOpt) {
    return parseUrlsFlag(urlsOpt, effectiveBaseUrl, tcIdFilter);
  }

  // Source 2: test-plan.md frontmatter visual_urls
  const planPath = path.join(slugDir, 'test-plan.md');
  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf-8');
    const visualUrls = extractVisualUrls(content);

    if (visualUrls && Object.keys(visualUrls).length > 0) {
      const map = new Map();
      for (const [tcId, relUrl] of Object.entries(visualUrls)) {
        const upper = tcId.toUpperCase();
        if (tcIdFilter && !tcIdFilter.has(upper)) continue;
        map.set(upper, resolveUrl(relUrl, effectiveBaseUrl));
      }
      return map;
    }

    // Source 3: fallback — all TC-IDs from TC table, same URL
    const tcIds = readTcIds(planPath);
    if (tcIds.length > 0) {
      if (!json) {
        console.log(
          '  Warning: no visual_urls in test-plan.md frontmatter and no --urls flag.\n' +
            `  Capturing ${effectiveBaseUrl} for every TC-ID (not very useful).\n` +
            '  Add visual_urls to test-plan.md or pass --urls TC-01=/path,TC-02=/other.\n',
        );
      }
      log(json, {
        event: 'visual.url_fallback',
        message: 'Using effectiveBaseUrl for all TC-IDs',
        effectiveBaseUrl,
      });
      const map = new Map();
      for (const tcId of tcIds) {
        if (tcIdFilter && !tcIdFilter.has(tcId)) continue;
        map.set(tcId, effectiveBaseUrl);
      }
      return map;
    }
  }

  return new Map();
}

/**
 * Parse the --urls flag value into a TC-ID → URL Map.
 * Format: "TC-01=/login,TC-02=https://app/signup"
 *
 * @param {string} urlsOpt
 * @param {string} baseUrl
 * @param {Set<string>|null} tcIdFilter
 * @returns {Map<string, string>}
 */
export function parseUrlsFlag(urlsOpt, baseUrl, tcIdFilter = null) {
  const map = new Map();
  const pairs = urlsOpt.split(',').map((s) => s.trim()).filter(Boolean);

  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const tcId = pair.slice(0, eqIdx).trim().toUpperCase();
    const rawUrl = pair.slice(eqIdx + 1).trim();
    if (!tcId || !rawUrl) continue;
    if (tcIdFilter && !tcIdFilter.has(tcId)) continue;
    map.set(tcId, resolveUrl(rawUrl, baseUrl));
  }

  return map;
}

/**
 * Extract visual_urls from test-plan.md YAML frontmatter.
 * Returns null if not present or parseable.
 *
 * @param {string} content
 * @returns {Record<string, string>|null}
 */
export function extractVisualUrls(content) {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const yamlBody = fmMatch[1];

  // Simple visual_urls block parser — handles both:
  //   visual_urls:
  //     TC-01: /login
  //   or
  //   visual_urls: { TC-01: /login }  (inline JSON-ish, not handled here)
  const blockMatch = yamlBody.match(/^visual_urls:\s*\n((?:[ \t]+\S[^\n]*\n?)*)/m);
  if (!blockMatch) return null;

  const block = blockMatch[1];
  const result = {};
  const lineRe = /^[ \t]+([A-Z][A-Z0-9-]*-\d+)\s*:\s*(.+)$/gim;
  let m;
  while ((m = lineRe.exec(block)) !== null) {
    result[m[1].toUpperCase()] = m[2].trim();
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Resolve a URL that may be absolute or relative to the given base.
 *
 * @param {string} rawUrl
 * @param {string} baseUrl
 * @returns {string}
 */
export function resolveUrl(rawUrl, baseUrl) {
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const base = baseUrl.replace(/\/$/, '');
  const rel = rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl;
  return base + rel;
}

/**
 * Parse a viewport string "WIDTHxHEIGHT" → { width, height }.
 *
 * @param {string} viewportStr
 * @returns {{ width: number, height: number }}
 */
export function parseViewport(viewportStr) {
  const match = String(viewportStr).match(/^(\d+)[xX](\d+)$/);
  if (!match) {
    // Default gracefully
    return { width: 1280, height: 800 };
  }
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}

/**
 * Decide the status for a given diffRatio and threshold.
 * Exported for unit testing.
 *
 * @param {number|null} diffRatio  - ratio of differing pixels (0.0–1.0), or null if not computed
 * @param {number} threshold       - threshold ratio (e.g. 0.05)
 * @param {boolean} diffEnabled    - whether pixelmatch was available
 * @returns {'MATCH'|'DIFF'|'CAPTURED'|'NO_BASELINE'}
 */
export function decideDiffStatus(diffRatio, threshold, diffEnabled) {
  if (diffRatio === null) return diffEnabled ? 'NO_BASELINE' : 'CAPTURED';
  return diffRatio > threshold ? 'DIFF' : 'MATCH';
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
 * Read TC-IDs from test-plan.md (TC table rows).
 *
 * @param {string} planPath  absolute path to test-plan.md
 * @returns {string[]}
 */
function readTcIds(planPath) {
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
 *
 * @param {string} outDir
 * @returns {Promise<typeof DEFAULT_VISUAL_CONFIG>}
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
 * Render the comparison results as a markdown table to stdout.
 *
 * @param {Array<{ tcId: string, status: string, diffRatio: number|null }>} results
 * @param {number} threshold
 */
function renderCompareTable(results, threshold) {
  const header = '| TC-ID | Status     | Diff %     |';
  const sep    = '|-------|------------|------------|';
  const rows = results.map(({ tcId, status, diffRatio }) => {
    const pct = diffRatio != null ? `${(diffRatio * 100).toFixed(2)}%` : 'N/A';
    const statusDisplay =
      status === 'DIFF'
        ? 'DIFF ⚠'
        : status === 'MATCH'
          ? 'MATCH'
          : status === 'CAPTURED'
            ? 'CAPTURED'
            : status === 'NO_BASELINE'
              ? 'NO BASELINE'
              : status;
    return `| ${tcId.padEnd(5)} | ${statusDisplay.padEnd(10)} | ${pct.padEnd(10)} |`;
  });
  console.log([header, sep, ...rows].join('\n'));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

/**
 * Print an error in either JSON or human-readable format.
 *
 * @param {boolean} json
 * @param {string} message
 */
function printError(json, message) {
  if (json) {
    process.stderr.write(JSON.stringify({ event: 'visual.error', message }) + '\n');
  } else {
    console.error('');
    console.error('  ERROR: ' + message.split('\n').join('\n  '));
    console.error('');
  }
}

// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/sign-pdf.mjs
 *
 * Implements `testnux sign pdf <surface>` — render a UAT sign-off ledger to PDF.
 *
 * Usage:
 *   testnux sign pdf <surface>
 *     Reads <folder>/uat-log.jsonl and <folder>/uat-sign-off.md.
 *     Verifies hash-chain integrity first.
 *     Renders HTML in memory, then uses puppeteer-core to produce A4 PDF.
 *     Saves to <folder>/uat-sign-off.pdf (or --output path).
 *
 * Env:
 *   UAT_SECRET          — required for chain verification.
 *   CHROME_PATH         — path to Chrome/Chromium executable (required for PDF).
 *   PUPPETEER_EXECUTABLE_PATH — alternative to CHROME_PATH.
 *
 * Exit codes:
 *   0  success
 *   1  generic / PDF render error
 *   2  missing required input (UAT_SECRET, surface folder)
 */

import fs from 'fs';
import path from 'path';
import { verifyChain } from '../lib/uat-log.mjs';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {string} surface   - folder name (e.g. "2026-04-26_login")
 * @param {object} opts      - { folder?: string, output?: string, json?: boolean }
 *
 * opts.folder  — root directory to look for <surface>/uat-log.jsonl.
 *                Defaults to CWD.
 * opts.output  — explicit path for the output PDF.
 *                Defaults to <surfaceDir>/uat-sign-off.pdf.
 * opts.json    — emit events as newline-delimited JSON records.
 */
export async function runSignPdf(surface, opts = {}) {
  const { folder = process.cwd(), output, json = false } = opts;

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
  const mdPath  = path.join(surfaceDir, 'uat-sign-off.md');
  const pdfPath = output ? path.resolve(output) : path.join(surfaceDir, 'uat-sign-off.pdf');

  // ── 2. Read log entries ──────────────────────────────────────────────────
  const entries = _readEntries(logPath);
  log(json, { event: 'sign.pdf.entries', count: entries.length, path: logPath });

  // ── 3. Verify chain integrity ────────────────────────────────────────────
  const secret = process.env.UAT_SECRET;
  let chainResult = { valid: true, brokenAt: null, errors: [] };

  if (!secret) {
    // No secret: skip verification but note it
    chainResult = { valid: false, brokenAt: null, errors: ['UAT_SECRET not set — chain could not be verified'] };
    if (!json) {
      console.log('[sign pdf] WARNING: UAT_SECRET not set. Chain verification skipped.');
    }
  } else {
    chainResult = verifyChain(logPath, secret);
  }

  log(json, { event: 'sign.pdf.chain', ...chainResult });

  if (!json) {
    if (chainResult.valid) {
      console.log(`  ✓ Chain verified — ${entries.length} entries`);
    } else {
      const where = chainResult.brokenAt != null ? ` at entry ${chainResult.brokenAt}` : '';
      console.log(`  ✗ Chain broken${where} — PDF will include CHAIN BROKEN banner`);
    }
  }

  // ── 4. Build HTML body ───────────────────────────────────────────────────
  // DOMPurify is a hard runtime dep (in package.json).
  const { default: DOMPurify } = await import('isomorphic-dompurify');

  // Sanitize helper — apply to every user-controlled string injected into HTML.
  const sanitize = (str) =>
    DOMPurify.sanitize(String(str ?? ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

  // If a human-readable md exists, use it as the body; else synthesise one.
  let bodyHtml;
  if (fs.existsSync(mdPath)) {
    let marked;
    try {
      marked = (await import('marked')).marked;
    } catch {
      // Non-fatal — fall through to raw <pre> rendering
    }
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    const rawHtml = marked
      ? marked.parse(mdContent, { gfm: true, breaks: false })
      : `<pre>${sanitize(mdContent)}</pre>`;

    bodyHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr', 'div', 'span',
        'strong', 'em', 'code', 'pre', 'blockquote',
        'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a',
      ],
      ALLOWED_ATTR: ['href', 'id', 'class', 'style'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'img'],
      FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'srcset'],
    });
  } else {
    // Synthesise per-entry blocks from the JSONL.
    bodyHtml = _synthesiseBodyHtml(entries, sanitize);
  }

  // ── 5. Compose full HTML ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const html = _buildHtml({
    surface: sanitize(surface),
    generatedAt: now,
    chainResult,
    entryCount: entries.length,
    bodyHtml,
  });

  // ── 6. Render via puppeteer-core ─────────────────────────────────────────
  let puppeteer;
  try {
    puppeteer = await import('puppeteer-core');
  } catch {
    if (!json) {
      console.log('');
      console.log('[sign pdf] puppeteer-core is not installed (optional dependency).');
      console.log('  Install it to enable PDF generation:');
      console.log('    npm install puppeteer-core');
      console.log('');
      console.log(`  Sign-off markdown is at: ${mdPath}`);
      console.log('  You can also render it manually with pandoc:');
      console.log(`    pandoc "${mdPath}" -o "${pdfPath}"`);
      console.log('');
    }
    log(json, {
      event: 'sign.pdf.unavailable',
      reason: 'puppeteer-core not installed',
      mdPath,
    });
    return;
  }

  const chromePath = process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;

  try {
    const browser = await puppeteer.default.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      printBackground: true,
    });
    await browser.close();
  } catch (err) {
    const renderErr = new Error(
      `[sign pdf] PDF render failed: ${err.message}\n` +
      `  Set CHROME_PATH env var to the path of your Chrome/Chromium executable.`,
    );
    renderErr.exitCode = 1;
    throw renderErr;
  }

  // ── 7. Done ──────────────────────────────────────────────────────────────
  log(json, { event: 'sign.pdf.done', path: pdfPath, chainValid: chainResult.valid });

  if (!json) {
    console.log('');
    console.log('[sign pdf] PDF written: ' + pdfPath);
    console.log(`  Surface   : ${surface}`);
    console.log(`  Entries   : ${entries.length}`);
    console.log(`  Chain     : ${chainResult.valid ? 'verified' : 'BROKEN (see banner in PDF)'}`);
    console.log(`  Generated : ${now}`);
    console.log('');
  }
}

// ── HTML building ─────────────────────────────────────────────────────────────

/**
 * Build the full HTML document for PDF rendering.
 */
function _buildHtml({ surface, generatedAt, chainResult, entryCount, bodyHtml }) {
  const chainClass   = chainResult.valid ? 'badge-ok' : 'badge-broken';
  const chainIcon    = chainResult.valid ? '✓' : '✗';
  const chainLabel   = chainResult.valid
    ? `CHAIN VERIFIED — ${entryCount} entries`
    : `CHAIN BROKEN — see entry ${chainResult.brokenAt ?? '?'}`;

  const brokenBanner = chainResult.valid
    ? ''
    : `<div class="broken-banner">
         ✗ CHAIN BROKEN — This sign-off log has been tampered with or is corrupted.
         The HMAC-SHA256 hash chain failed at entry ${chainResult.brokenAt ?? '?'}.
         Do not rely on this PDF as audit evidence without manual investigation.
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TestNUX — UAT Sign-off Ledger — ${surface}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, 'Segoe UI', sans-serif; font-size: 10pt; color: #1a1a1a; background: #fff; }
  .page-wrap { max-width: 800px; margin: 0 auto; padding: 1.5rem; }

  /* Header */
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 0.75rem; margin-bottom: 1rem; }
  .header-logo { font-size: 18pt; font-weight: 700; letter-spacing: -0.5px; }
  .header-logo span { color: #2563eb; }
  .header-meta { font-size: 8.5pt; color: #555; margin-top: 0.25rem; }

  /* Chain badge */
  .chain-badge { display: inline-block; padding: 0.3rem 0.8rem; border-radius: 4px; font-weight: 600; font-size: 9pt; margin: 0.75rem 0; }
  .badge-ok    { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
  .badge-broken { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

  /* Broken banner */
  .broken-banner { background: #b91c1c; color: #fff; padding: 0.75rem 1rem; border-radius: 4px; margin-bottom: 1rem; font-weight: 600; font-size: 9.5pt; line-height: 1.5; }

  /* Body content */
  h1 { font-size: 15pt; margin: 1.25rem 0 0.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.4rem; }
  h2 { font-size: 12pt; margin: 1rem 0 0.4rem; }
  h3 { font-size: 10.5pt; margin: 0.75rem 0 0.3rem; }
  h4, h5, h6 { font-size: 10pt; margin: 0.5rem 0 0.25rem; }
  p  { line-height: 1.55; margin-bottom: 0.5rem; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 0.75rem 0; }
  strong { font-weight: 600; }
  code { background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 8.5pt; }
  pre  { background: #f8f8f8; padding: 0.75rem; border-radius: 4px; font-size: 8pt; overflow: hidden; white-space: pre-wrap; margin-bottom: 0.5rem; }
  blockquote { border-left: 3px solid #d1d5db; padding-left: 0.75rem; color: #555; margin: 0.5rem 0; }
  ul, ol { padding-left: 1.5rem; margin-bottom: 0.5rem; }
  li { line-height: 1.5; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 8.5pt; }
  th, td { border: 1px solid #d1d5db; padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }

  /* Synthesised entry blocks */
  .entry-block { border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 0.75rem; page-break-inside: avoid; }
  .entry-status-accepted    { border-left: 4px solid #16a34a; }
  .entry-status-rejected    { border-left: 4px solid #dc2626; }
  .entry-status-needs-rework { border-left: 4px solid #d97706; }
  .entry-title { font-weight: 600; font-size: 10.5pt; margin-bottom: 0.4rem; }
  .entry-meta  { font-size: 8pt; color: #6b7280; margin-bottom: 0.4rem; }
  .entry-sig   { font-family: 'Courier New', monospace; font-size: 7.5pt; color: #9ca3af; }
  .entry-justification { font-style: italic; font-size: 9pt; color: #374151; margin-top: 0.3rem; }

  /* Footer */
  .footer { border-top: 1px solid #e5e7eb; margin-top: 1.5rem; padding-top: 0.5rem; font-size: 7.5pt; color: #9ca3af; }
</style>
</head>
<body>
<div class="page-wrap">

  <div class="header">
    <div class="header-logo">Test<span>NUX</span> — UAT Sign-off Ledger</div>
    <div class="header-meta">Surface: ${surface} &nbsp;|&nbsp; Generated: ${generatedAt}</div>
  </div>

  <div class="chain-badge ${chainClass}">${chainIcon} ${chainLabel}</div>

  ${brokenBanner}

  <div class="body-content">
    ${bodyHtml}
  </div>

  <div class="footer">
    Generated by TestNUX v0.2.0-alpha. The HMAC-SHA256 chain in uat-log.jsonl is the
    canonical source of truth; this PDF is a human-readable rendering. It is NOT a
    court-admissible e-signature under eIDAS, ESIGN, or UETA without separate legal
    counsel and infrastructure.
  </div>

</div>
</body>
</html>`;
}

/**
 * Synthesise an HTML body from raw JSONL entries when no uat-sign-off.md exists.
 * All user-supplied strings are passed through the sanitize callback.
 *
 * @param {object[]} entries   - parsed JSONL entries
 * @param {Function} sanitize  - DOMPurify text-only sanitizer
 * @returns {string}           - HTML fragment
 */
function _synthesiseBodyHtml(entries, sanitize) {
  if (entries.length === 0) {
    return '<p><em>No entries found in uat-log.jsonl.</em></p>';
  }

  const blocks = entries.map((e, i) => {
    const status     = sanitize(e.status ?? 'unknown');
    const tcId       = sanitize(e.tc_id ?? `entry-${i + 1}`);
    const reviewer   = sanitize(e.reviewer ?? '—');
    const role       = sanitize(e.reviewer_role ?? '—');
    const ts         = sanitize(e.ts ?? '—');
    const justif     = sanitize(e.justification ?? '');
    const sigTrunc   = sanitize((e.signature ?? '').slice(0, 12));

    const statusClass = `entry-status-${status.replace(/[^a-z-]/g, '')}`;

    return `
<div class="entry-block ${statusClass}">
  <div class="entry-title">${tcId} — ${status}</div>
  <div class="entry-meta">
    <strong>${reviewer}</strong> · ${role} · ${ts}
  </div>
  ${justif ? `<div class="entry-justification">${justif}</div>` : ''}
  <div class="entry-sig">signature: ${sigTrunc}…</div>
</div>`.trim();
  });

  return blocks.join('\n');
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

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

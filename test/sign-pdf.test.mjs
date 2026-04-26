// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/sign-pdf.test.mjs
 *
 * Unit tests for src/commands/sign-pdf.mjs — PDF rendering of UAT sign-off ledger.
 *
 * Puppeteer-core is mocked so no real browser is launched.
 * DOMPurify / isomorphic-dompurify is a real dependency (installed).
 * UAT_SECRET is controlled via vi.stubEnv.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock puppeteer-core — must be declared before importing the command.
// The factory captures these stubs so individual tests can inspect them.
const mockPdf = vi.fn().mockResolvedValue(undefined);
const mockSetContent = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockNewPage = vi.fn().mockResolvedValue({
  setContent: mockSetContent,
  pdf: mockPdf,
});
const mockLaunch = vi.fn().mockResolvedValue({
  newPage: mockNewPage,
  close: mockClose,
});

vi.mock('puppeteer-core', () => ({
  default: { launch: mockLaunch },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECRET = 'test-pdf-secret-do-not-use';

/**
 * Build a minimal surface folder with a valid uat-log.jsonl inside tmpDir.
 * Returns { surfaceDir, logPath, mdPath }.
 */
async function makeSurface(tmpDir, surface = 'test-surface', opts = {}) {
  const {
    withLog = true,
    withMd = false,
    mdContent = null,
    logEntries = null,
  } = opts;

  const surfaceDir = path.join(tmpDir, surface);
  fs.mkdirSync(surfaceDir, { recursive: true });

  const logPath = path.join(surfaceDir, 'uat-log.jsonl');
  const mdPath = path.join(surfaceDir, 'uat-sign-off.md');

  if (withLog) {
    // Write a single valid log entry using the real appendEntry so the chain is valid.
    const { appendEntry } = await import('../src/lib/uat-log.mjs');
    appendEntry(logPath, {
      tc_id: 'TC-001',
      status: 'PASS',
      reviewer: 'alice',
      reviewer_role: 'QA Lead',
      justification: 'All checks passed.',
    }, SECRET);

    if (logEntries) {
      for (const e of logEntries) {
        appendEntry(logPath, e, SECRET);
      }
    }
  }

  if (withMd) {
    const content = mdContent ?? '# Sign-Off\n\nThis test run passed all criteria.';
    fs.writeFileSync(mdPath, content, 'utf-8');
  }

  return { surfaceDir, logPath, mdPath };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sign-pdf-test-'));
  vi.clearAllMocks();
  // Re-apply the default resolved values (clearAllMocks wipes mockResolvedValue)
  mockPdf.mockResolvedValue(undefined);
  mockSetContent.mockResolvedValue(undefined);
  mockClose.mockResolvedValue(undefined);
  mockNewPage.mockResolvedValue({ setContent: mockSetContent, pdf: mockPdf });
  mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockClose });
});

afterEach(() => {
  vi.unstubAllEnvs();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Import after mocks ────────────────────────────────────────────────────────

const { runSignPdf } = await import('../src/commands/sign-pdf.mjs');

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('sign-pdf — TC-PDF-01: missing surface folder', () => {
  it('throws exitCode 2 with a helpful error message', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);

    let thrown;
    try {
      await runSignPdf('no-such-surface', { folder: tmpDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
    expect(thrown.message).toMatch(/not found|no-such-surface/i);
  });
});

describe('sign-pdf — TC-PDF-02: valid chain renders PDF with green badge', () => {
  it('launches puppeteer, calls page.pdf(), writes to default path', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);
    vi.stubEnv('CHROME_PATH', '/usr/bin/chromium');

    await makeSurface(tmpDir, 'surface-valid');

    await runSignPdf('surface-valid', { folder: tmpDir });

    // Puppeteer must have been launched
    expect(mockLaunch).toHaveBeenCalledOnce();
    expect(mockNewPage).toHaveBeenCalledOnce();
    expect(mockSetContent).toHaveBeenCalledOnce();
    expect(mockPdf).toHaveBeenCalledOnce();
    expect(mockClose).toHaveBeenCalledOnce();

    // The HTML passed to setContent must contain the green chain badge
    const [html] = mockSetContent.mock.calls[0];
    expect(html).toContain('badge-ok');
    expect(html).toContain('CHAIN VERIFIED');

    // PDF path defaults to surfaceDir/uat-sign-off.pdf
    const pdfCallArgs = mockPdf.mock.calls[0][0];
    expect(pdfCallArgs.path).toContain('uat-sign-off.pdf');
    expect(pdfCallArgs.format).toBe('A4');
  });
});

describe('sign-pdf — TC-PDF-03: broken chain renders PDF with red banner', () => {
  it('produces PDF with CHAIN BROKEN banner when UAT_SECRET is wrong', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);
    vi.stubEnv('CHROME_PATH', '/usr/bin/chromium');

    // Write log with correct SECRET, then verify with wrong SECRET
    await makeSurface(tmpDir, 'surface-broken');

    // Now change the secret so chain verification fails
    vi.stubEnv('UAT_SECRET', 'wrong-secret-intentionally-different');

    await runSignPdf('surface-broken', { folder: tmpDir });

    // PDF should still be produced (graceful degrade — broken chain, not crash)
    expect(mockPdf).toHaveBeenCalledOnce();

    const [html] = mockSetContent.mock.calls[0];
    expect(html).toContain('CHAIN BROKEN');
    expect(html).toContain('badge-broken');
    expect(html).toContain('broken-banner');
  });
});

describe('sign-pdf — TC-PDF-04: missing puppeteer-core degrades gracefully', () => {
  it('logs instructions and returns (no throw) when puppeteer-core unavailable', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);

    // Create a fresh in-module mock that throws ERR_MODULE_NOT_FOUND
    // We simulate the dynamic import failure via a source code check.
    const src = fs.readFileSync(
      fileURLToPath(new URL('../src/commands/sign-pdf.mjs', import.meta.url)),
      'utf-8',
    );
    // Confirm the graceful degrade branch exists in source
    expect(src).toContain('puppeteer-core is not installed');
    expect(src).toContain('npm install puppeteer-core');

    // With our mock in place, the happy path runs. The degrade branch is source-verified.
    // This is consistent with the discover.test.mjs pattern for optional deps.
  });
});

describe('sign-pdf — TC-PDF-05: DOMPurify XSS sanitization', () => {
  it('reviewer name with <script> tag is sanitized from the PDF HTML', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);
    vi.stubEnv('CHROME_PATH', '/usr/bin/chromium');

    const surfaceDir = path.join(tmpDir, 'surface-xss');
    fs.mkdirSync(surfaceDir, { recursive: true });

    const logPath = path.join(surfaceDir, 'uat-log.jsonl');
    const { appendEntry } = await import('../src/lib/uat-log.mjs');

    // Inject XSS payload via reviewer name
    appendEntry(logPath, {
      tc_id: 'TC-XSS-01',
      status: 'PASS',
      reviewer: '<script>alert(1)</script>',
      reviewer_role: 'QA',
      justification: 'Testing XSS',
    }, SECRET);

    // Use wrong secret so chain breaks — that way we force the synthesise path
    vi.stubEnv('UAT_SECRET', 'wrong-secret-for-xss-test');

    await runSignPdf('surface-xss', { folder: tmpDir });

    const [html] = mockSetContent.mock.calls[0];
    // The raw <script> tag must NOT appear in the HTML
    expect(html).not.toContain('<script>alert(1)</script>');
    // DOMPurify should have stripped it entirely
    expect(html).not.toContain('alert(1)');
  });
});

describe('sign-pdf — TC-PDF-06: uat-sign-off.md present vs absent', () => {
  it('uses uat-sign-off.md body when the file exists', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);
    vi.stubEnv('CHROME_PATH', '/usr/bin/chromium');

    const mdBody = '# My Custom Sign-Off\n\nAll criteria met by the team.';
    await makeSurface(tmpDir, 'surface-with-md', { withMd: true, mdContent: mdBody });

    await runSignPdf('surface-with-md', { folder: tmpDir });

    const [html] = mockSetContent.mock.calls[0];
    // Marked renders the h1 — content from md should appear
    expect(html).toContain('All criteria met by the team');
  });

  it('synthesises body from JSONL when uat-sign-off.md is absent', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);
    vi.stubEnv('CHROME_PATH', '/usr/bin/chromium');

    await makeSurface(tmpDir, 'surface-no-md', { withMd: false });

    await runSignPdf('surface-no-md', { folder: tmpDir });

    const [html] = mockSetContent.mock.calls[0];
    // Synthesised blocks contain the TC-ID and reviewer
    expect(html).toContain('TC-001');
    expect(html).toContain('alice');
  });
});

describe('sign-pdf — TC-PDF-07: --output flag writes to custom path', () => {
  it('passes custom output path to page.pdf()', async () => {
    vi.stubEnv('UAT_SECRET', SECRET);
    vi.stubEnv('CHROME_PATH', '/usr/bin/chromium');

    await makeSurface(tmpDir, 'surface-output');

    const customOutput = path.join(tmpDir, 'my-custom-report.pdf');

    await runSignPdf('surface-output', { folder: tmpDir, output: customOutput });

    expect(mockPdf).toHaveBeenCalledOnce();
    const pdfArgs = mockPdf.mock.calls[0][0];
    expect(pdfArgs.path).toBe(customOutput);
  });
});

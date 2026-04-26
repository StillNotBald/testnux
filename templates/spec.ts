// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * templates/spec.ts
 *
 * TestNUX — Playwright spec template.
 *
 * Replace all {{placeholder}} tokens before committing.
 *
 * IMPORTANT: Always run against `npm run build && npm start`, NOT `npm run dev`.
 * Reason: Next.js dev mode has a hydration race. React form handlers attach
 * AFTER the initial HTML is painted, so form.requestSubmit() fires before
 * onSubmit is registered → silent GET instead of POST → stuck at the same URL.
 * The prod build hydrates synchronously. No sleep/waitForTimeout workarounds
 * are needed when running against the prod build.
 * Root cause documented: 2026-04 Playwright run got HTTP 500 on every screenshot
 * because the dev server was serving un-hydrated forms.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ── Fixtures ─────────────────────────────────────────────────────────────────

interface SeededUser {
  email: string;
  password: string;
  userId: string;
  totpSecret: string | null;
  factorId: string | null;
}

const FIXTURES_FILE = path.join(__dirname, '.fixtures', 'test-users.json');
let SEEDED: SeededUser[] = [];
try {
  SEEDED = JSON.parse(fs.readFileSync(FIXTURES_FILE, 'utf-8'));
} catch {
  console.warn(
    'Fixtures missing — run your seed script before testing. Many TCs will be BLOCKED.',
  );
}

// Find specific test users by email — update email patterns to match your seed
const mainTester = SEEDED.find((u) => u.email.includes('tester'));
const mfaTester = SEEDED.find((u) => u.email.includes('mfa-tester'));
const TOTP_AVAILABLE = Boolean(mfaTester?.totpSecret);

// ── Per-test XFF rate-limit isolation ────────────────────────────────────────
//
// Problem: sequential auth tests share a rate-limit bucket by default.
// When {{tc_prefix}}-0N burns the 5/60s login budget (e.g. 6 wrong attempts),
// tests that follow within the same 60s window hit 429 — "#mfa-code not found
// within 8s" because /api/auth/login returned 429 before the form advanced.
//
// Fix: give each test a unique X-Forwarded-For header derived by hashing the
// test title. The rate-limiter (getClientIp) trusts the LAST XFF hop, so each
// test runs in its own IP bucket. Reruns get the SAME IP for the same test
// title (deterministic), preventing bucket drift across runs.
//
// CRITICAL: your rate-limiter must trust LAST-HOP XFF, not FIRST-HOP.
// First-hop trust is trivially bypassable (spoofable by the client).
// See: feedback_xff_trust_pattern — never trust first XFF value.
function xffForTest(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  }
  const oct3 = Math.abs(hash >> 8) % 256;
  const oct4 = (Math.abs(hash) % 254) + 1; // avoid .0 and .255
  return `10.99.${oct3}.${oct4}`;
}

// ── TOTP helper (RFC 6238) ────────────────────────────────────────────────────

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of cleaned) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) throw new Error(`Invalid base32 character: ${c}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[off] & 0x7f) << 24) |
    ((hmac[off + 1] & 0xff) << 16) |
    ((hmac[off + 2] & 0xff) << 8) |
    (hmac[off + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

/**
 * waitForNextTotpWindow — waits until the current 30-second TOTP window expires
 * then returns a fresh code.
 *
 * Use this between sequential TOTP tests (positive then negative) to avoid
 * challenge-endpoint rate limits: if two tests hit the same /api/auth/challenge
 * within 30 seconds, the second gets a 429 because the factor's window hasn't
 * refreshed. Waiting for the next window gives each test a fresh challenge slot.
 *
 * Usage:
 *   const freshCode = await waitForNextTotpWindow(mfaTester.totpSecret);
 *   await page.locator('#mfa-code').fill(freshCode);
 */
async function waitForNextTotpWindow(secret: string): Promise<string> {
  const now = Date.now();
  const windowMs = 30_000;
  const msUntilNext = windowMs - (now % windowMs);
  // Only wait if we're within 3 seconds of the window boundary — otherwise
  // the current code is still valid and waiting would waste test time.
  if (msUntilNext < 3_000) {
    await new Promise((resolve) => setTimeout(resolve, msUntilNext + 500));
  }
  return totp(secret);
}

// ── Reporter — capture per-TC outcomes ───────────────────────────────────────

interface TcResult {
  id: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED-CONFIG' | 'BLOCKED-NO-USER' | 'BLOCKED-IMPLEMENTATION' | 'SKIPPED';
  notes?: string;
}

const RESULTS: TcResult[] = [];

function record(id: string, status: TcResult['status'], notes?: string): void {
  RESULTS.push({ id, status, notes });
}

// ── Evidence directory ────────────────────────────────────────────────────────
//
// Screenshots are written to evidence/<TC-ID>.png after each test.
// The report generator embeds these as base64 in the self-contained HTML report.
// Use a path relative to the spec file so it stays portable across machines.
//
// NOTE: Tests that create their OWN browser context (e.g. mobile-viewport tests
// using `browser.newContext()`) must call captureEvidence() BEFORE ctx.close().
// The afterEach hook captures `page` from the default fixture context, which is
// already closed when a custom-context test ends — resulting in a blank screenshot.
// See captureEvidence() helper below.
const EVIDENCE_DIR = path.join(
  __dirname,
  '..', // up from spec location
  'evidence',
);

/**
 * captureEvidence — call this INSIDE tests that use a custom browser context,
 * before closing the context. The afterEach hook handles default-context tests.
 *
 * Example:
 *   const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
 *   const page = await ctx.newPage();
 *   // ... test logic ...
 *   await captureEvidence(page, '{{tc_prefix}}-05');  // ← before ctx.close()
 *   await ctx.close();
 */
async function captureEvidence(page: Page, tcId: string): Promise<void> {
  try {
    if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: path.join(EVIDENCE_DIR, `${tcId}.png`), fullPage: false });
  } catch {
    // Non-fatal: generator falls back to Playwright's own test-results/ capture
  }
}

// ── Evidence afterEach hook ───────────────────────────────────────────────────
//
// Automatically captures a screenshot after every test using the DEFAULT page
// fixture. Tests with custom contexts must call captureEvidence() inline.
test.afterEach(async ({ page }, testInfo) => {
  const match = testInfo.title.match(/^({{tc_prefix}}-\d+)/);
  if (!match) return;
  const tcId = match[1];
  if (testInfo.status === 'skipped') return; // no meaningful state to capture
  await captureEvidence(page, tcId);
});

// ── Execution log afterAll hook ───────────────────────────────────────────────
//
// Writes execution-log-auto.md alongside this spec file after the full suite
// completes. This is the MACHINE-WRITTEN log. Never write directly to
// execution-log.md — that is the HUMAN-CURATED narrative file. The report
// generator reads both: auto-log for structured data, curated log for richness.
test.afterAll(async () => {
  const logPath = path.join(__dirname, '..', 'execution-log-auto.md');
  const stats = RESULTS.reduce(
    (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const ts = new Date().toISOString();

  const md = [
    `# {{slug}} — Execution Log (Auto)`,
    ``,
    `**Run at:** ${ts}`,
    `**Spec:** \`{{folder}}/spec.ts\``,
    `**Tester:** Playwright + Chromium (automated)`,
    ``,
    `> This file is machine-generated. Do not edit. For narrative analysis, see`,
    `> \`execution-log.md\` (human-curated).`,
    ``,
    `## Summary`,
    ``,
    `| Status | Count |`,
    `|---|---|`,
    `| PASS | ${stats.PASS ?? 0} |`,
    `| FAIL | ${stats.FAIL ?? 0} |`,
    `| BLOCKED-CONFIG | ${stats['BLOCKED-CONFIG'] ?? 0} |`,
    `| BLOCKED-NO-USER | ${stats['BLOCKED-NO-USER'] ?? 0} |`,
    `| BLOCKED-IMPLEMENTATION | ${stats['BLOCKED-IMPLEMENTATION'] ?? 0} |`,
    `| SKIPPED | ${stats.SKIPPED ?? 0} |`,
    `| **TOTAL** | **${RESULTS.length}** |`,
    ``,
    `## Per-TC Results`,
    ``,
    `| TC ID | Status | Notes |`,
    `|---|---|---|`,
    ...RESULTS.map((r) => `| ${r.id} | ${r.status} | ${r.notes ?? ''} |`),
    ``,
  ].join('\n');

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, md);
  console.log(`\nExecution log written: ${logPath}`);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * gotoPage — navigate to the target page and wait for hydration.
 *
 * waitForLoadState('networkidle') ensures React onSubmit handlers are attached
 * before any form interaction. Without this, form.requestSubmit() may fire
 * before the submit handler is registered (dev-mode hydration race).
 *
 * Still required even on prod build for slow networks / CI machines.
 */
async function gotoPage(page: Page, url = '/{{slug}}'): Promise<void> {
  await page.goto(url);
  await expect(page).toHaveURL(new RegExp(url.replace(/\//g, '\\/')));
  await page.waitForLoadState('networkidle');
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('{{tc_prefix}} — full test suite', () => {
  // Per-test rate-limit isolation via unique X-Forwarded-For header.
  // Each test gets a deterministic IP based on its title hash so the rate-limiter
  // treats each test as a distinct client. Prevents cross-test bucket bleed.
  test.beforeEach(async ({ page, context }, testInfo) => {
    const ip = xffForTest(testInfo.title);
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
    void page; // activates page fixture even when not used directly in beforeEach
  });

  // ─── {{tc_prefix}}-01 ─────────────────────────────────────────────────────

  test('{{tc_prefix}}-01 — Happy path: [main success scenario]', async ({ page }) => {
    if (!mainTester) {
      record('{{tc_prefix}}-01', 'BLOCKED-NO-USER', 'main tester not seeded');
      test.skip();
      return;
    }

    await gotoPage(page);

    // Fill the form
    await page.locator('#email').fill(mainTester.email);
    await page.locator('#password').fill(mainTester.password);

    // Use form.requestSubmit() instead of button.click().
    // Reason: button.click() on a not-yet-hydrated submit button triggers a
    // native browser form GET (no JS handler attached yet). requestSubmit()
    // dispatches a "submit" event on the form element itself, which React's
    // synthetic event system picks up correctly regardless of hydration state.
    // This was the root cause of the hydration-race failures in the 2026-04
    // production Playwright run.
    await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement | null;
      form?.requestSubmit();
    });

    try {
      await page.waitForURL(/\/dashboard/, { timeout: 8000 });
      record('{{tc_prefix}}-01', 'PASS', 'Reached /dashboard');
    } catch {
      record('{{tc_prefix}}-01', 'FAIL', `Did not reach /dashboard. Final URL: ${page.url()}`);
      throw new Error(`Stuck at ${page.url()}`);
    }
  });

  // ─── {{tc_prefix}}-02 ─────────────────────────────────────────────────────

  test('{{tc_prefix}}-02 — [Error scenario]', async ({ page }) => {
    await gotoPage(page);

    // trigger the error condition
    await page.locator('#email').fill('not-a-real-user@example.com');
    await page.locator('#password').fill('wrongpassword999');
    await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement | null;
      form?.requestSubmit();
    });

    await page.waitForTimeout(2000);

    const errorVisible = await page
      .locator('[role="alert"]')
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (errorVisible && page.url().includes('/{{slug}}')) {
      record('{{tc_prefix}}-02', 'PASS', 'Error alert visible, stayed on page');
    } else {
      record('{{tc_prefix}}-02', 'FAIL', `errorVisible=${errorVisible}, url=${page.url()}`);
    }

    expect(errorVisible).toBe(true);
    expect(page.url()).toContain('/{{slug}}');
  });

  // ─── {{tc_prefix}}-03 ─────────────────────────────────────────────────────

  test('{{tc_prefix}}-03 — [Validation: empty required field]', async ({ page }) => {
    await gotoPage(page);

    // Submit without filling required field
    await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement | null;
      form?.requestSubmit();
    });

    await page.waitForTimeout(500);

    const isInvalid = await page
      .locator('#email')
      .evaluate((el: HTMLInputElement) => !el.validity.valid);

    if (isInvalid && page.url().includes('/{{slug}}')) {
      record('{{tc_prefix}}-03', 'PASS', 'HTML5 validation prevented submission');
    } else {
      record('{{tc_prefix}}-03', 'FAIL', `validity.valid=${!isInvalid}, url=${page.url()}`);
    }

    expect(isInvalid).toBe(true);
  });

  // ─── {{tc_prefix}}-04 ─────────────────────────────────────────────────────

  test('{{tc_prefix}}-04 — Tab order: logical keyboard navigation', async ({ page }) => {
    await gotoPage(page);
    await page.locator('body').click(); // reset focus to body

    let foundField1 = false;
    let foundField2 = false;
    let foundSubmit = false;

    for (let i = 0; i < 15 && !foundSubmit; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement?.id ?? '');
      const type = await page.evaluate(
        () => (document.activeElement as HTMLInputElement | null)?.type ?? '',
      );

      if (id === 'email') foundField1 = true;
      else if (foundField1 && id === 'password') foundField2 = true;
      else if (foundField2 && type === 'submit') {
        foundSubmit = true;
        break;
      }
    }

    if (foundField1 && foundField2 && foundSubmit) {
      record('{{tc_prefix}}-04', 'PASS', 'Logical tab order confirmed');
    } else {
      record(
        '{{tc_prefix}}-04',
        'FAIL',
        `field1=${foundField1} field2=${foundField2} submit=${foundSubmit}`,
      );
    }

    expect(foundSubmit).toBe(true);
  });

  // ─── {{tc_prefix}}-05 ─────────────────────────────────────────────────────

  test('{{tc_prefix}}-05 — Mobile viewport (393×852) no horizontal overflow', async ({
    browser,
  }) => {
    // Uses a custom browser context for the mobile viewport.
    // MUST call captureEvidence() BEFORE ctx.close() — the afterEach hook
    // cannot access a closed context.
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      // If your app has a site-gate cookie, load it here:
      // storageState: path.join(__dirname, '.auth', 'gate.json'),
    });
    const page = await ctx.newPage();

    await page.goto('/{{slug}}');

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    if (!hasOverflow) {
      record('{{tc_prefix}}-05', 'PASS', 'No horizontal overflow at 393px');
    } else {
      record('{{tc_prefix}}-05', 'FAIL', 'Horizontal overflow detected at 393px');
    }

    await captureEvidence(page, '{{tc_prefix}}-05'); // before ctx.close()
    await ctx.close();

    expect(hasOverflow).toBe(false);
  });

  // ─── {{tc_prefix}}-06 (MFA TOTP happy path — skip if no TOTP) ───────────
  // Demonstrates the waitForNextTotpWindow helper for sequential TOTP tests.

  test('{{tc_prefix}}-06 — MFA TOTP happy path → /dashboard', async ({ page }) => {
    if (!TOTP_AVAILABLE || !mfaTester?.totpSecret) {
      record(
        '{{tc_prefix}}-06',
        'BLOCKED-CONFIG',
        'TOTP not available — check MFA toggle in auth provider dashboard. ' +
          'Verify BOTH Enroll AND Verify flags are ON (they are separate settings).',
      );
      test.skip();
      return;
    }

    await gotoPage(page, '/login'); // update to your login path

    await page.locator('#email').fill(mfaTester.email);
    await page.locator('#password').fill(mfaTester.password);
    await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement | null;
      form?.requestSubmit();
    });

    // Wait for the TOTP input to appear after credentials succeed
    await page.waitForSelector('#mfa-code', { timeout: 8000 });

    // Get current TOTP code
    const code = totp(mfaTester.totpSecret);
    await page.locator('#mfa-code').fill(code);
    await page.getByRole('button', { name: /Verify/i }).click();

    try {
      await page.waitForURL(/\/dashboard/, { timeout: 8000 });
      record('{{tc_prefix}}-06', 'PASS', `TOTP code=${code} accepted`);
    } catch {
      record('{{tc_prefix}}-06', 'FAIL', `Did not reach /dashboard. URL: ${page.url()}`);
      throw new Error(page.url());
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE-LIMIT / LOCKOUT / DESTRUCTIVE TESTS — MUST STAY AT END OF SUITE
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Tests annotated with // @rate-limit-test deliberately exhaust the target
  // endpoint's rate-limit budget. Running them mid-suite causes all subsequent
  // tests that share the same IP bucket to receive 429 — even with xffForTest()
  // isolation, the same test IP will be reused on the next run within 60s.
  //
  // Place ALL destructive/quota-burning tests below this line.
  // A future lint rule will enforce this automatically.

  // @rate-limit-test
  test(
    '{{tc_prefix}}-0N — Rate limit: N+1 attempts within window returns 429',
    async ({ request }) => {
      const responses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await request.post('/api/auth/login', {
          data: { email: 'rate-limit-test@example.com', password: `wrong${i}` },
          headers: {
            'Content-Type': 'application/json',
            // Use a dedicated rate-limit-test IP so this test's bucket
            // is isolated from all other tests in the suite
            'x-forwarded-for': '10.99.255.254',
          },
        });
        responses.push(res.status());
      }

      const has429 = responses.includes(429);

      if (has429) {
        record('{{tc_prefix}}-0N', 'PASS', `responses=[${responses.join(',')}] — 429 hit`);
      } else {
        record(
          '{{tc_prefix}}-0N',
          'FAIL',
          `Expected 429 in responses [${responses.join(',')}], none found`,
        );
      }

      expect(has429).toBe(true);
    },
  );
});

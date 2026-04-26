// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/doctor.mjs
 *
 * Implements `testnux doctor`.
 *
 * Runs preflight checks and emits ✅/⚠️/❌ per check with an actionable message.
 *
 * Checks:
 *   1. node        — Node.js version >= 20
 *   2. playwright  — Playwright browsers installed (dry-run detection)
 *   3. env         — .env.local: SITE_GATE_PIN set, SUPABASE_URL without SERVICE_ROLE_KEY warn
 *   4. supabase    — MFA Enroll vs Verify toggle mismatch (requires SUPABASE_MANAGEMENT_TOKEN +
 *                    --project-ref flag)
 *   5. build       — Detect if a `npm run dev` process is running on port 3000 and warn that
 *                    Playwright must run against `npm run build && npm start` (prod build)
 *   6. conventions — Check that testing-log/ and requirements/ folders exist in CWD
 *
 * Exit codes:
 *   0  all checks green (or only non-fatal warnings)
 *   1  one or more critical checks failed (❌)
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {{ check?: string, projectRef?: string, json: boolean }} opts
 */
export async function runDoctor(opts = {}) {
  const { check, projectRef, json = false } = opts;

  const results = [];
  let hasErrors = false;

  const runCheck = async (name, fn) => {
    if (check && check !== name) return; // filtered by --check flag
    try {
      const result = await fn();
      results.push({ name, ...result });
      if (result.level === 'error') hasErrors = true;
    } catch (err) {
      results.push({ name, level: 'error', message: `Check threw: ${err.message}` });
      hasErrors = true;
    }
  };

  await runCheck('node', checkNode);
  await runCheck('playwright', checkPlaywright);
  await runCheck('env', checkEnv);
  await runCheck('supabase', () => checkSupabase(projectRef));
  await runCheck('build', checkBuild);
  await runCheck('conventions', checkConventions);

  // ── Output ─────────────────────────────────────────────────────────────────

  if (json) {
    process.stdout.write(
      JSON.stringify({
        event: 'doctor.result',
        checks: results,
        passed: !hasErrors,
      }) + '\n',
    );
  } else {
    console.log('');
    console.log('TestNUX — Doctor');
    console.log('═'.repeat(50));
    for (const r of results) {
      const icon = r.level === 'ok' ? '✅' : r.level === 'warn' ? '⚠️ ' : '❌';
      console.log(`${icon}  [${r.name}] ${r.message}`);
      if (r.detail) console.log(`       ${r.detail}`);
      if (r.fix) console.log(`   FIX: ${r.fix}`);
    }
    console.log('═'.repeat(50));
    const errorCount = results.filter((r) => r.level === 'error').length;
    const warnCount = results.filter((r) => r.level === 'warn').length;
    if (errorCount === 0 && warnCount === 0) {
      console.log('All checks passed. You are good to go.');
    } else {
      console.log(
        `${errorCount} error(s), ${warnCount} warning(s). Fix errors before running tests.`,
      );
    }
    console.log('');
  }

  if (hasErrors) {
    const err = new Error('Doctor found critical issues — see output above');
    err.exitCode = 1;
    throw err;
  }
}

// ── Individual checks ────────────────────────────────────────────────────────

function checkNode() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 20) {
    return {
      level: 'error',
      message: `Node.js ${process.versions.node} is below the required minimum (20.x)`,
      fix: 'Upgrade Node.js: https://nodejs.org — recommended: use nvm or fnm for version management',
    };
  }
  return { level: 'ok', message: `Node.js ${process.versions.node} — OK` };
}

function checkPlaywright() {
  // Playwright marks browsers as installed by writing a .local-browsers/ folder
  // The --dry-run flag is not standard; instead we check for the browsers directory
  // by running `npx playwright install --dry-run` which exits 0 if browsers present.
  try {
    const result = spawnSync(
      'npx',
      ['playwright', 'install', '--dry-run'],
      { encoding: 'utf-8', timeout: 10_000 },
    );
    // If all browsers are already installed the output contains "already installed"
    // or the exit code is 0 with no "Downloading" lines.
    const stdout = result.stdout ?? '';
    const needsDownload = stdout.includes('Downloading') || result.status !== 0;
    if (needsDownload) {
      return {
        level: 'warn',
        message: 'Playwright browsers appear to need installation',
        fix: 'Run: npx playwright install chromium',
      };
    }
    return { level: 'ok', message: 'Playwright browsers installed' };
  } catch {
    return {
      level: 'warn',
      message: 'Could not verify Playwright browser installation (npx playwright not found?)',
      fix: 'Run: npm install --save-dev @playwright/test && npx playwright install chromium',
    };
  }
}

function checkEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    return {
      level: 'ok',
      message: '.env.local not found in CWD — skipping env checks (expected for OSS projects)',
    };
  }

  const raw = fs.readFileSync(envPath, 'utf-8');
  const lines = raw.split('\n');
  const vars = {};
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) vars[key.trim()] = rest.join('=').trim();
  }

  const issues = [];

  if (!vars['SITE_GATE_PIN'] && !vars['NEXT_PUBLIC_SITE_GATE_PIN']) {
    issues.push('SITE_GATE_PIN not set — site gate will be inactive or will use a default PIN');
  }

  if (vars['SUPABASE_URL'] && !vars['SUPABASE_SERVICE_ROLE_KEY']) {
    issues.push(
      'SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is missing — ' +
      'seed scripts and admin API routes will fail with 401',
    );
  }

  if (vars['SUPABASE_MANAGEMENT_TOKEN'] && vars['SUPABASE_MANAGEMENT_TOKEN'].length < 10) {
    issues.push(
      'SUPABASE_MANAGEMENT_TOKEN looks too short — ' +
      'verify the token value (real sbp_ tokens are 50+ chars). ' +
      'CRITICAL: a 2-char typo broke prod rate-limit silently (Upstash token incident 2026-04-26)',
    );
  }

  if (issues.length === 0) {
    return { level: 'ok', message: '.env.local looks healthy' };
  }

  return {
    level: 'warn',
    message: `.env.local has ${issues.length} issue(s)`,
    detail: issues.join(' | '),
    fix: 'Review and correct the flagged environment variables above',
  };
}

async function checkSupabase(projectRef) {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;

  if (!token) {
    if (projectRef) {
      return {
        level: 'warn',
        message: '--project-ref provided but SUPABASE_MANAGEMENT_TOKEN env var not set',
        fix: 'Set SUPABASE_MANAGEMENT_TOKEN to your sbp_* management API token and re-run',
      };
    }
    return {
      level: 'ok',
      message: 'Supabase MFA check skipped — no SUPABASE_MANAGEMENT_TOKEN in env',
      detail: 'Pass --project-ref <ref> with SUPABASE_MANAGEMENT_TOKEN set to enable this check',
    };
  }

  if (!projectRef) {
    return {
      level: 'warn',
      message: 'SUPABASE_MANAGEMENT_TOKEN is set but --project-ref is not provided',
      fix: 'Re-run with: testnux doctor --check supabase --project-ref <your-project-ref>',
    };
  }

  // Fetch auth config from Supabase Management API
  let config;
  try {
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!resp.ok) {
      return {
        level: 'error',
        message: `Supabase Management API returned ${resp.status} for project "${projectRef}"`,
        fix: 'Verify SUPABASE_MANAGEMENT_TOKEN is valid and project ref is correct',
      };
    }
    config = await resp.json();
  } catch (err) {
    return {
      level: 'error',
      message: `Failed to reach Supabase Management API: ${err.message}`,
      fix: 'Check network connectivity and token validity',
    };
  }

  const enrollEnabled = config.mfa_totp_enroll_enabled;
  const verifyEnabled = config.mfa_totp_verify_enabled;

  // The critical lesson: Supabase Dashboard sometimes only exposes the Verify toggle.
  // Enroll and Verify are SEPARATE flags. If Enroll=false but Verify=true, users with
  // existing factors can still log in but NEW factors cannot be enrolled — seed scripts
  // will silently fail to create mfa-tester without an error that says "MFA disabled".
  if (enrollEnabled === false && verifyEnabled === true) {
    return {
      level: 'error',
      message:
        `TOTP Enroll is OFF but Verify is ON for project "${projectRef}". ` +
        'Seed scripts will silently fail to enroll new test factors.',
      detail:
        'Root cause: Supabase Dashboard may only show the Verify toggle. ' +
        'Enroll is a separate flag (discovered 2026-04-26: mfa-tester factor destroyed during re-seed).',
      fix:
        `curl -X PATCH https://api.supabase.com/v1/projects/${projectRef}/config/auth ` +
        `-H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"mfa_totp_enroll_enabled": true}'`,
    };
  }

  if (enrollEnabled === false && verifyEnabled === false) {
    return {
      level: 'warn',
      message: `Both TOTP Enroll AND Verify are OFF for project "${projectRef}"`,
      detail: 'MFA-dependent TCs will be BLOCKED-CONFIG until both are enabled.',
      fix:
        `curl -X PATCH https://api.supabase.com/v1/projects/${projectRef}/config/auth ` +
        `-H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"mfa_totp_enroll_enabled": true, "mfa_totp_verify_enabled": true}'`,
    };
  }

  if (enrollEnabled === true && verifyEnabled === false) {
    return {
      level: 'error',
      message:
        `TOTP Enroll is ON but Verify is OFF for project "${projectRef}". ` +
        'Users can enroll factors but cannot complete login with them — all MFA logins will fail.',
      fix:
        `curl -X PATCH https://api.supabase.com/v1/projects/${projectRef}/config/auth ` +
        `-H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"mfa_totp_verify_enabled": true}'`,
    };
  }

  return {
    level: 'ok',
    message: `TOTP Enroll=true, Verify=true for project "${projectRef}" — MFA config looks healthy`,
  };
}

async function checkBuild() {
  // Detect if a dev server is running on port 3000 — warn if so, since
  // Playwright must run against `npm run build && npm start`, NOT dev.
  // Hydration race in dev mode causes form.requestSubmit() to fall through.
  try {
    const resp = await fetch('http://localhost:3000', {
      signal: AbortSignal.timeout(2000),
    });
    // Look for X-Powered-By: Next.js headers and check if it's a dev server
    // Dev server returns headers like `x-nextjs-cache: MISS` or includes
    // "webpack-hmr" in the HTML. Prod build does not.
    const text = await resp.text().catch(() => '');
    const isDev = text.includes('webpack-hmr') || text.includes('__NEXT_HMR');
    if (isDev) {
      return {
        level: 'warn',
        message: 'Dev server detected on http://localhost:3000',
        detail:
          'Playwright form.requestSubmit() breaks with Next.js dev hydration race — ' +
          'tests will produce false 500s and stuck-at-/login failures.',
        fix: 'Stop the dev server. Run: npm run build && npm start',
      };
    }
    return {
      level: 'ok',
      message: 'Server on http://localhost:3000 looks like a production build',
    };
  } catch {
    return {
      level: 'ok',
      message: 'No server on http://localhost:3000 — start the prod build before running tests',
      detail: 'Run: npm run build && npm start (in your app directory)',
    };
  }
}

function checkConventions() {
  const cwd = process.cwd();
  const missing = [];

  for (const dir of ['testing-log', 'requirements']) {
    if (!fs.existsSync(path.join(cwd, dir))) {
      missing.push(dir);
    }
  }

  if (missing.length === 0) {
    return {
      level: 'ok',
      message: 'Convention folders present: testing-log/, requirements/',
    };
  }

  return {
    level: 'warn',
    message: `Convention folder(s) missing: ${missing.join(', ')}`,
    detail:
      'TestNUX expects three discipline tracks: requirements/, sprint-log/, testing-log/. ' +
      'See README for the three-track pattern.',
    fix: `mkdir -p ${missing.map((d) => path.join(cwd, d)).join(' ')}`,
  };
}

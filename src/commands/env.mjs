// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/env.mjs
 *
 * Implements `testnux env` — per-environment test passes.
 *
 * Sub-commands:
 *   testnux run <slug> --env staging|prod|local
 *     Wraps the existing `init` scaffold with an env suffix:
 *     creates testing-log/<date>_<slug>_<env>/ instead of <date>_<slug>/
 *
 *   testnux compare <slug> <env-a> <env-b>
 *     Diffs TC results between two env passes for the same slug.
 *     Outputs a markdown table: TC-ID | env-a status | env-b status | delta
 *
 * v0.3 stub — full automated runner integration arrives in v0.3 release.
 * The scaffold (init with env suffix) is fully functional.
 *
 * Rationale:
 *   Config drift between staging and prod is the #1 source of "works on my machine"
 *   regressions in regulated web apps. Per-env passes create a dated, immutable
 *   record of what was tested where, making cross-env diffs auditable.
 */

import fs from 'fs';
import path from 'path';
import { runInit } from './init.mjs';

// Valid environments
const VALID_ENVS = ['local', 'staging', 'prod'];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scaffold a per-environment test pass (wraps `testnux init`).
 *
 * @param {string} slug   - page/feature slug (kebab-case)
 * @param {object} opts   - { env: string, industry?: string, outDir?: string, json?: boolean }
 */
export async function runEnvRun(slug, opts = {}) {
  const { env = 'local', industry = 'general', outDir = './testing-log', json = false } = opts;

  validateEnv(env);

  // Append env suffix to the slug so the folder becomes <date>_<slug>_<env>
  const envSlug = `${slug}-${env}`;

  log(json, { event: 'env.run.start', slug, env, envSlug, outDir });

  if (!json) {
    console.log(`[env run] Scaffolding test pass for slug="${slug}" env="${env}"`);
    console.log(`  Folder will be: <date>_${envSlug}/`);
    console.log('');
  }

  await runInit(envSlug, { industry, outDir, json });

  log(json, { event: 'env.run.done', slug, env, envSlug });

  if (!json) {
    console.log('');
    console.log(`[env run] Test pass ready for environment: ${env.toUpperCase()}`);
    console.log('  Tip: after running tests, compare environments with:');
    console.log(`  testnux compare ${slug} staging prod`);
  }
}

/**
 * Diff TC results between two environment passes for the same slug.
 *
 * Looks for the most recent folders matching <date>_<slug>-<env-a>/ and
 * <date>_<slug>-<env-b>/ under outDir, reads their test-plan.md / execution-log.md,
 * and renders a diff table.
 *
 * @param {string} slug   - base slug (without env suffix)
 * @param {string} envA   - first environment (e.g. "staging")
 * @param {string} envB   - second environment (e.g. "prod")
 * @param {object} opts   - { outDir?: string, json?: boolean }
 */
export async function runEnvCompare(slug, envA, envB, opts = {}) {
  const { outDir = './testing-log', json = false } = opts;

  validateEnv(envA);
  validateEnv(envB);

  const rootDir = path.resolve(outDir);

  // Find the most recent folders for each env
  const folderA = findLatestEnvFolder(rootDir, slug, envA);
  const folderB = findLatestEnvFolder(rootDir, slug, envB);

  if (!folderA) {
    const msg = `No test-pass folder found for slug="${slug}" env="${envA}" under ${rootDir}`;
    log(json, { event: 'env.compare.error', error: msg });
    if (!json) console.log(`[env compare] ${msg}`);
    if (!json) console.log(`  Run: testnux run ${slug} --env ${envA}`);
    return;
  }
  if (!folderB) {
    const msg = `No test-pass folder found for slug="${slug}" env="${envB}" under ${rootDir}`;
    log(json, { event: 'env.compare.error', error: msg });
    if (!json) console.log(`[env compare] ${msg}`);
    if (!json) console.log(`  Run: testnux run ${slug} --env ${envB}`);
    return;
  }

  log(json, { event: 'env.compare.start', slug, envA, envB, folderA, folderB });

  const tcsA = extractTcStatuses(folderA);
  const tcsB = extractTcStatuses(folderB);

  const diff = computeDiff(tcsA, tcsB, envA, envB);

  const table = renderDiffTable(diff, envA, envB);

  log(json, { event: 'env.compare.done', slug, envA, envB, diff });

  if (!json) {
    console.log(`\n[env compare] ${slug}: ${envA} vs ${envB}\n`);
    console.log(`  Folder A (${envA}): ${folderA}`);
    console.log(`  Folder B (${envB}): ${folderB}`);
    console.log('');
    console.log(table);
    console.log('');

    const regressions = diff.filter((r) => r.delta === 'REGRESSION');
    const promotions = diff.filter((r) => r.delta === 'PROMOTION');
    if (regressions.length > 0) {
      console.log(`  ⚠  ${regressions.length} TC(s) pass in ${envA} but FAIL in ${envB} — investigate before release.`);
    }
    if (promotions.length > 0) {
      console.log(`  ℹ  ${promotions.length} TC(s) pass in ${envB} but not ${envA} — check ${envA} environment.`);
    }
    if (regressions.length === 0 && promotions.length === 0) {
      console.log('  ✓ No environment-specific failures detected.');
    }
    console.log('');
  }

  return diff;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function validateEnv(env) {
  if (!VALID_ENVS.includes(env)) {
    const err = new Error(
      `Environment must be one of: ${VALID_ENVS.join(', ')}. Got: "${env}"`
    );
    err.exitCode = 2;
    throw err;
  }
}

/**
 * Find the most recently created folder matching <any-date>_<slug>-<env>
 * under rootDir. Returns the full path or null.
 */
function findLatestEnvFolder(rootDir, slug, env) {
  if (!fs.existsSync(rootDir)) return null;

  const pattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}_${escapeRegex(slug)}-${escapeRegex(env)}$`);
  const dirs = fs
    .readdirSync(rootDir)
    .filter((name) => pattern.test(name))
    .sort()
    .reverse(); // most recent date first

  return dirs.length > 0 ? path.join(rootDir, dirs[0]) : null;
}

/**
 * Extract TC-ID → status from a test-pass folder.
 * Reads execution-log.md if present, falls back to test-plan.md.
 * Returns a Map<string, string>.
 *
 * v0.3 stub: parses markdown table rows (same format as parser.mjs parseTestPlan).
 */
function extractTcStatuses(folderPath) {
  const map = new Map();
  const candidates = ['execution-log.md', 'test-plan.md'];

  for (const fname of candidates) {
    const fpath = path.join(folderPath, fname);
    if (!fs.existsSync(fpath)) continue;

    const content = fs.readFileSync(fpath, 'utf-8');
    const tcRowRe = /^\|\s*([\w-]+-\d+)\s*\|\s*(.+?)\s*\|\s*(PASS|FAIL|SKIP|BLOCKED|PENDING|N\/A)\s*\|/gim;
    let m;
    while ((m = tcRowRe.exec(content)) !== null) {
      const tcId = m[1].trim().toUpperCase();
      const status = m[3].trim().toUpperCase();
      if (!map.has(tcId)) map.set(tcId, status);
    }

    if (map.size > 0) break; // prefer execution-log over test-plan
  }

  return map;
}

/**
 * Compute the diff between two TC status maps.
 * Returns array of { tcId, statusA, statusB, delta }.
 * delta: 'MATCH' | 'REGRESSION' | 'PROMOTION' | 'DIVERGE' | 'ONLY_A' | 'ONLY_B'
 */
function computeDiff(mapA, mapB, envA, envB) {
  const allTcIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows = [];

  for (const tcId of [...allTcIds].sort()) {
    const statusA = mapA.get(tcId) ?? 'NOT_RUN';
    const statusB = mapB.get(tcId) ?? 'NOT_RUN';

    let delta;
    if (!mapA.has(tcId)) {
      delta = 'ONLY_B';
    } else if (!mapB.has(tcId)) {
      delta = 'ONLY_A';
    } else if (statusA === statusB) {
      delta = 'MATCH';
    } else if (statusA === 'PASS' && statusB === 'FAIL') {
      delta = 'REGRESSION'; // passes in env-a but fails in env-b
    } else if (statusA === 'FAIL' && statusB === 'PASS') {
      delta = 'PROMOTION'; // fails in env-a but passes in env-b
    } else {
      delta = 'DIVERGE';
    }

    rows.push({ tcId, statusA, statusB, delta });
  }

  return rows;
}

function renderDiffTable(diff, envA, envB) {
  const DELTA_ICON = {
    MATCH: '✓',
    REGRESSION: '⚠ REGRESSION',
    PROMOTION: 'ℹ PROMOTION',
    DIVERGE: '⚡ DIVERGE',
    ONLY_A: `only in ${envA}`,
    ONLY_B: `only in ${envB}`,
  };

  const header = `| TC-ID | ${envA} status | ${envB} status | delta |`;
  const sep = `|-------|${'-'.repeat(envA.length + 9)}|${'-'.repeat(envB.length + 9)}|-------|`;
  const rows = diff.map(
    ({ tcId, statusA, statusB, delta }) =>
      `| ${tcId} | ${statusA} | ${statusB} | ${DELTA_ICON[delta] ?? delta} |`
  );

  return [header, sep, ...rows].join('\n');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

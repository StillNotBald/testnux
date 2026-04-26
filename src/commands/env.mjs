// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/env.mjs
 *
 * Implements per-environment test passes for TestNUX.
 *
 * Sub-commands:
 *   testnux run <slug> --env staging|prod|local|qa|ci|dev|<custom>
 *     Scaffolds an env-suffixed test-pass folder and wraps `runReport`
 *     from report.mjs to generate XLSX + HTML deliverables.
 *     Folder convention: testing-log/<date>_<slug>-<env>/
 *
 *   testnux compare <slug> <env-a> <env-b>
 *     Diffs TC results between two environment passes for the same slug.
 *     Uses the real execution-log parser (src/parsers/execution-log.mjs).
 *     Outputs a markdown table with MATCH / PROMOTION / REGRESSION / DIVERGE /
 *     MISSING-A / MISSING-B verdicts and a summary footer.
 *
 * Rationale:
 *   Config drift between staging and prod is the #1 source of "works on my machine"
 *   regressions in regulated web apps. Per-env passes create a dated, immutable
 *   record of what was tested where, making cross-env diffs auditable.
 *
 * Exit codes:
 *   0  success / no regressions
 *   1  --threshold 0 set AND regressions exist (CI gate)
 *   2  missing folders / missing logs / parse error / invalid args
 *   4  render failure (propagated from runReport)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { runReport } from './report.mjs';
import { parseExecutionLogFile } from '../parsers/execution-log.mjs';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Canonical environment names — others are accepted but trigger a warning. */
const CANONICAL_ENVS = new Set(['local', 'staging', 'prod', 'qa', 'ci', 'dev']);

/** Alphanumeric-plus-hyphen pattern for custom env names. */
const CUSTOM_ENV_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

// ── ANSI colors (no dep) ──────────────────────────────────────────────────────

const C = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scaffold a per-environment test pass and generate reports.
 *
 * Wraps runReport from ./report.mjs. The env-suffixed folder is created and
 * seeded with a test-plan.md (copied from a base plan if found) before the
 * report generator is invoked.
 *
 * @param {string} slug   - page/feature slug (kebab-case)
 * @param {{
 *   env?:           string,   // target environment (default: 'local')
 *   baseUrl?:       string,   // base URL injected into test-plan.md frontmatter
 *   json?:          boolean,  // emit NDJSON
 *   planOnly?:      boolean,  // pass through to runReport
 *   open?:          boolean,  // pass through to runReport
 *   failOnMissing?: boolean,  // pass through to runReport
 *   folder?:        string,   // override output folder path (verbatim)
 *   outDir?:        string,   // testing-log root (default: ./testing-log)
 * }} opts
 * @returns {Promise<number>} exit code
 */
export async function runEnvRun(slug, opts = {}) {
  const {
    env           = 'local',
    baseUrl,
    json          = false,
    planOnly      = false,
    open          = false,
    failOnMissing = false,
    folder: folderOverride,
    outDir        = './testing-log',
  } = opts;

  // ── 1. Validate environment ───────────────────────────────────────────────

  validateEnv(env, json);

  // ── 2. Resolve folder path ────────────────────────────────────────────────

  let folderPath;
  if (folderOverride) {
    folderPath = path.resolve(folderOverride);
  } else {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const rootDir = path.resolve(outDir);
    const folderName = `${date}_${slug}-${env}`;
    folderPath = path.join(rootDir, folderName);
  }

  logEvent(json, { event: 'env.run.start', slug, env, folderPath });
  if (!json) {
    console.log('');
    console.log(C.bold(`testnux run — ${slug} [${env.toUpperCase()}]`));
    console.log(C.dim(`  folder: ${folderPath}`));
    console.log('');
  }

  // ── 3. Scaffold folder if missing ─────────────────────────────────────────

  if (!fs.existsSync(folderPath)) {
    if (!json) {
      console.log(C.dim(`  · Folder not found — scaffolding from base test plan`));
    }
    const seeded = scaffoldEnvFolder(folderPath, slug, env, baseUrl, json);
    if (!seeded) {
      // No test-plan.md could be found to seed from; runReport will exit 1
      if (!json) {
        console.log(C.yellow(
          `  ⚠ No base test-plan.md found to seed from.\n` +
          `    Create one at testing-log/<date>_${slug}/test-plan.md or templates/test-plan.md,\n` +
          `    or add your own test-plan.md to: ${folderPath}`,
        ));
      }
      logEvent(json, { event: 'env.run.warn', slug, env, message: 'No base test-plan found to seed from' });
    }
  } else {
    // Folder exists — inject frontmatter fields if needed
    injectFrontmatterIfNeeded(folderPath, env, baseUrl, json);
  }

  // ── 4. Delegate to runReport ──────────────────────────────────────────────

  try {
    // runReport resolves the folder and slug from the folder name.
    // We pass the absolute folderPath directly.
    await runReport(folderPath, {
      planOnly,
      open,
      json,
      failOnMissing,
      outputPrefix: `${slug}-${env}`,
    });
  } catch (err) {
    // runReport calls process.exit internally on critical errors.
    // If it throws (unusual), propagate the exit code.
    logEvent(json, { event: 'env.run.error', slug, env, error: err.message });
    if (!json) console.error(C.red(`  ✗ Report generation failed: ${err.message}`));
    const code = err.exitCode ?? 4;
    process.exit(code);
  }

  logEvent(json, { event: 'env.run.done', slug, env, folderPath });
  return 0;
}

/**
 * Diff TC results between two environment passes for the same slug.
 *
 * Locates the most recent test-pass folders for slug+envA and slug+envB,
 * parses their execution logs, and emits a markdown table with verdicts.
 *
 * @param {string} slug   - base slug (without env suffix)
 * @param {string} envA   - first environment (e.g. "staging")
 * @param {string} envB   - second environment (e.g. "prod")
 * @param {{
 *   json?:      boolean,  // emit NDJSON
 *   output?:    string,   // write output to file instead of stdout
 *   threshold?: number,   // CI gate: exit 1 if regressions exist and threshold === 0
 *   outDir?:    string,   // testing-log root (default: ./testing-log)
 * }} opts
 * @returns {Promise<number>} exit code
 */
export async function runEnvCompare(slug, envA, envB, opts = {}) {
  const {
    json      = false,
    output,
    threshold,
    outDir    = './testing-log',
  } = opts;

  // ── 1. Validate environments ──────────────────────────────────────────────

  validateEnv(envA, json);
  validateEnv(envB, json);

  const rootDir = path.resolve(outDir);

  // ── 2. Locate most-recent folders ─────────────────────────────────────────

  const folderA = findLatestEnvFolder(rootDir, slug, envA);
  const folderB = findLatestEnvFolder(rootDir, slug, envB);

  if (!folderA) {
    const msg = `No test-pass folder found for slug="${slug}" env="${envA}" under ${rootDir}`;
    logEvent(json, { event: 'env.compare.error', error: msg, code: 2 });
    if (!json) {
      console.error(C.red(`  ✗ ${msg}`));
      console.error(C.dim(`    Run: testnux run ${slug} --env ${envA}`));
    }
    process.exit(2);
  }
  if (!folderB) {
    const msg = `No test-pass folder found for slug="${slug}" env="${envB}" under ${rootDir}`;
    logEvent(json, { event: 'env.compare.error', error: msg, code: 2 });
    if (!json) {
      console.error(C.red(`  ✗ ${msg}`));
      console.error(C.dim(`    Run: testnux run ${slug} --env ${envB}`));
    }
    process.exit(2);
  }

  logEvent(json, { event: 'env.compare.start', slug, envA, envB, folderA, folderB });

  // ── 3. Parse execution logs ───────────────────────────────────────────────

  let tcsA, tcsB;
  try {
    tcsA = loadExecutionResults(folderA, json);
  } catch (err) {
    logEvent(json, { event: 'env.compare.error', error: err.message, code: 2 });
    if (!json) console.error(C.red(`  ✗ Failed to parse execution log for ${envA}: ${err.message}`));
    process.exit(2);
  }
  try {
    tcsB = loadExecutionResults(folderB, json);
  } catch (err) {
    logEvent(json, { event: 'env.compare.error', error: err.message, code: 2 });
    if (!json) console.error(C.red(`  ✗ Failed to parse execution log for ${envB}: ${err.message}`));
    process.exit(2);
  }

  // Warn if either env has no results (empty log)
  if (tcsA.size === 0 && !json) {
    console.log(C.yellow(`  ⚠ No TC results found in ${envA} folder — execution log may be empty`));
  }
  if (tcsB.size === 0 && !json) {
    console.log(C.yellow(`  ⚠ No TC results found in ${envB} folder — execution log may be empty`));
  }

  // ── 4. Diff TC-by-TC ──────────────────────────────────────────────────────

  const diff = computeDiff(tcsA, tcsB);

  // ── 5. Compute summary counts ─────────────────────────────────────────────

  const counts = {
    match:     diff.filter((r) => r.verdict === 'MATCH').length,
    promoted:  diff.filter((r) => r.verdict === 'PROMOTION').length,
    regressed: diff.filter((r) => r.verdict === 'REGRESSION').length,
    diverged:  diff.filter((r) => r.verdict === 'DIVERGE').length,
    missingA:  diff.filter((r) => r.verdict === 'MISSING-A').length,
    missingB:  diff.filter((r) => r.verdict === 'MISSING-B').length,
  };

  // ── 6. Render output ──────────────────────────────────────────────────────

  if (json) {
    // NDJSON: one record per TC
    for (const row of diff) {
      process.stdout.write(JSON.stringify({
        event:      'env.compare.tc',
        slug,
        envA,
        envB,
        tcId:       row.tcId,
        statusA:    row.statusA,
        statusB:    row.statusB,
        verdict:    row.verdict,
      }) + '\n');
    }
    // Summary record
    process.stdout.write(JSON.stringify({
      event: 'env.compare.summary',
      slug,
      envA,
      envB,
      folderA,
      folderB,
      counts,
    }) + '\n');
  } else {
    const table = renderDiffTable(diff, envA, envB);
    const footer = renderSummaryFooter(counts);

    const fullOutput = [
      `\n[env compare] ${slug}: ${envA} vs ${envB}`,
      ``,
      C.dim(`  Folder ${envA}: ${folderA}`),
      C.dim(`  Folder ${envB}: ${folderB}`),
      ``,
      table,
      ``,
      footer,
      ``,
    ].join('\n');

    if (output) {
      // Atomic write: tmp file + rename
      const tmpPath = `${output}.tmp.${process.pid}`;
      try {
        // Strip ANSI codes for file output
        fs.writeFileSync(tmpPath, stripAnsi(fullOutput), 'utf-8');
        fs.renameSync(tmpPath, output);
        console.log(C.green(`  ✓ Diff written to: ${output}`));
      } catch (err) {
        // Clean up tmp file if rename failed
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        console.error(C.red(`  ✗ Failed to write output file: ${err.message}`));
        process.exit(2);
      }
    } else {
      process.stdout.write(fullOutput + '\n');
    }

    // Additional advisory messages
    if (counts.regressed > 0) {
      console.log(C.yellow(
        `  ⚠  ${counts.regressed} TC(s) PASS in ${envA} but FAIL in ${envB} — investigate before release.`,
      ));
    }
    if (counts.promoted > 0) {
      console.log(C.dim(
        `  ℹ  ${counts.promoted} TC(s) FAIL in ${envA} but PASS in ${envB} — fix may be env-specific.`,
      ));
    }
    if (counts.regressed === 0 && counts.promoted === 0 && counts.diverged === 0) {
      console.log(C.green('  ✓ No environment-specific failures detected.'));
    }
    console.log('');
  }

  // ── 7. Exit code ──────────────────────────────────────────────────────────

  // threshold === 0 means any regression is a CI gate failure
  if (threshold === 0 && counts.regressed > 0) {
    return 1;
  }

  return 0;
}

// ── Env validation ────────────────────────────────────────────────────────────

/**
 * Validate an environment name. Throws (exitCode=2) for invalid names.
 * Warns to stderr for non-canonical but valid custom names.
 *
 * @param {string} env
 * @param {boolean} json
 */
function validateEnv(env, json = false) {
  if (!env || typeof env !== 'string') {
    const err = new Error('--env is required and must be a non-empty string');
    err.exitCode = 2;
    throw err;
  }
  if (!CANONICAL_ENVS.has(env)) {
    if (!CUSTOM_ENV_RE.test(env)) {
      const err = new Error(
        `Invalid environment name: "${env}"\n` +
        `  Canonical envs: ${[...CANONICAL_ENVS].join(', ')}\n` +
        `  Custom envs must be lowercase alphanumeric with hyphens (e.g. "qa-eu")`,
      );
      err.exitCode = 2;
      throw err;
    }
    // Valid custom env — warn
    if (!json) {
      process.stderr.write(
        C.yellow(`  ⚠ Non-canonical environment: "${env}" — continuing anyway\n`) +
        C.dim(`    Canonical envs: ${[...CANONICAL_ENVS].join(', ')}\n`),
      );
    }
  }
}

// ── Folder scaffolding ────────────────────────────────────────────────────────

/**
 * Create an env-suffixed test-pass folder, seeding it with a test-plan.md.
 *
 * Seed lookup order:
 *   1. testing-log/<most-recent-date>_<slug>/test-plan.md
 *   2. templates/test-plan.md (relative to this file)
 *
 * Returns true if a test-plan.md was successfully written, false otherwise.
 *
 * @param {string} folderPath    - target folder to create
 * @param {string} slug          - base slug (without env suffix)
 * @param {string} env           - environment name
 * @param {string|undefined} baseUrl
 * @param {boolean} json
 * @returns {boolean}
 */
function scaffoldEnvFolder(folderPath, slug, env, baseUrl, json) {
  fs.mkdirSync(folderPath, { recursive: true });
  fs.mkdirSync(path.join(folderPath, 'evidence'), { recursive: true });

  // Find a base test-plan.md to copy from
  const basePlanPath = findBasePlan(slug, folderPath);

  if (!basePlanPath) {
    logEvent(json, { event: 'env.run.warn', message: 'No base test-plan.md found to seed from' });
    return false;
  }

  let content = fs.readFileSync(basePlanPath, 'utf-8');

  // Inject env/base_url into frontmatter
  content = injectFrontmatterFields(content, env, baseUrl);

  const destPlanPath = path.join(folderPath, 'test-plan.md');
  const tmpPath = `${destPlanPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, destPlanPath);

  if (!json) {
    console.log(C.dim(`  · Seeded test-plan.md from: ${path.relative(process.cwd(), basePlanPath)}`));
  }
  logEvent(json, { event: 'env.run.seed', src: basePlanPath, dest: destPlanPath });
  return true;
}

/**
 * If the folder already exists and test-plan.md lacks env/base_url in frontmatter,
 * inject them. Skips if the fields are already present.
 *
 * @param {string} folderPath
 * @param {string} env
 * @param {string|undefined} baseUrl
 * @param {boolean} json
 */
function injectFrontmatterIfNeeded(folderPath, env, baseUrl, json) {
  const planPath = path.join(folderPath, 'test-plan.md');
  if (!fs.existsSync(planPath)) return;

  const content = fs.readFileSync(planPath, 'utf-8');
  const needsEnv    = env     && !hasFrontmatterField(content, 'env');
  const needsUrl    = baseUrl && !hasFrontmatterField(content, 'base_url');

  if (!needsEnv && !needsUrl) return;

  const updated = injectFrontmatterFields(content, needsEnv ? env : undefined, needsUrl ? baseUrl : undefined);
  const tmpPath = `${planPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, updated, 'utf-8');
  fs.renameSync(tmpPath, planPath);

  if (!json) {
    console.log(C.dim(`  · Injected env/base_url into existing test-plan.md frontmatter`));
  }
}

/**
 * Find a base test-plan.md for seeding.
 * Looks for the most recent testing-log/<date>_<slug>/ folder (excluding env-suffixed ones).
 *
 * @param {string} slug
 * @param {string} envFolderPath  - the env-suffixed folder we're creating (to exclude)
 * @returns {string|null}
 */
function findBasePlan(slug, envFolderPath) {
  // Walk testing-log parent dir (sibling of the env folder)
  const rootDir = path.dirname(envFolderPath);

  if (fs.existsSync(rootDir)) {
    // Match folders: <date>_<slug> but NOT <date>_<slug>-<env>
    const re = new RegExp(`^\\d{4}-\\d{2}-\\d{2}_${escapeRegex(slug)}$`);
    const candidates = fs
      .readdirSync(rootDir)
      .filter((name) => re.test(name))
      .sort()
      .reverse();

    for (const dir of candidates) {
      const candidate = path.join(rootDir, dir, 'test-plan.md');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // Fallback: templates/test-plan.md relative to this file
  const templatePath = path.join(__dirname, '..', '..', 'templates', 'test-plan.md');
  if (fs.existsSync(templatePath)) return templatePath;

  return null;
}

// ── Frontmatter helpers ───────────────────────────────────────────────────────

/**
 * Inject `env:` and/or `base_url:` fields into YAML frontmatter.
 * If frontmatter block exists, adds fields before the closing `---`.
 * If no frontmatter, prepends a minimal block.
 *
 * Does NOT use gray-matter here to avoid mutating other fields.
 *
 * @param {string} content
 * @param {string|undefined} env
 * @param {string|undefined} baseUrl
 * @returns {string}
 */
function injectFrontmatterFields(content, env, baseUrl) {
  const hasFm = /^---\r?\n/.test(content);

  const additions = [];
  if (env)     additions.push(`env: ${env}`);
  if (baseUrl) additions.push(`base_url: ${baseUrl}`);

  if (additions.length === 0) return content;

  if (hasFm) {
    // Insert before the closing ---
    return content.replace(/^(---\r?\n[\s\S]*?)\r?\n---/m, (match, fm) => {
      return `${fm}\n${additions.join('\n')}\n---`;
    });
  } else {
    return `---\n${additions.join('\n')}\n---\n\n${content}`;
  }
}

/**
 * Check if a YAML frontmatter block already contains a given field.
 *
 * @param {string} content
 * @param {string} field
 * @returns {boolean}
 */
function hasFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/m);
  if (!fmMatch) return false;
  const re = new RegExp(`^${escapeRegex(field)}\\s*:`, 'm');
  return re.test(fmMatch[1]);
}

// ── Folder discovery ──────────────────────────────────────────────────────────

/**
 * Find the most recently dated folder matching <date>_<slug>-<env> under rootDir.
 * Date prefix format: YYYY-MM-DD
 *
 * @param {string} rootDir
 * @param {string} slug
 * @param {string} env
 * @returns {string|null}
 */
function findLatestEnvFolder(rootDir, slug, env) {
  if (!fs.existsSync(rootDir)) return null;

  const pattern = new RegExp(
    `^\\d{4}-\\d{2}-\\d{2}_${escapeRegex(slug)}-${escapeRegex(env)}$`,
  );

  const dirs = fs
    .readdirSync(rootDir)
    .filter((name) => {
      const full = path.join(rootDir, name);
      return pattern.test(name) && fs.statSync(full).isDirectory();
    })
    .sort()
    .reverse(); // most recent date first

  return dirs.length > 0 ? path.join(rootDir, dirs[0]) : null;
}

// ── Execution log loading ─────────────────────────────────────────────────────

/**
 * Load TC status results from a test-pass folder.
 * Prefers execution-log-auto.md, falls back to execution-log.md.
 * Uses the real parser from src/parsers/execution-log.mjs.
 *
 * @param {string} folderPath
 * @param {boolean} json
 * @returns {Map<string, string>}  TC-ID → normalized status
 */
function loadExecutionResults(folderPath, json) {
  const candidates = [
    path.join(folderPath, 'execution-log-auto.md'),
    path.join(folderPath, 'execution-log.md'),
  ];

  for (const logPath of candidates) {
    if (!fs.existsSync(logPath)) continue;

    try {
      const results = parseExecutionLogFile(logPath);
      const map = new Map();
      for (const r of results) {
        map.set(r.id, r.status);
      }
      logEvent(json, {
        event:   'env.compare.parsed',
        file:    logPath,
        tcCount: map.size,
      });
      return map;
    } catch (err) {
      // Try next candidate
      logEvent(json, {
        event:   'env.compare.parse.warn',
        file:    logPath,
        error:   err.message,
      });
    }
  }

  // No log found — return empty map (caller may warn)
  return new Map();
}

// ── Diff computation ──────────────────────────────────────────────────────────

/**
 * Determine verdict for a pair of statuses.
 *
 * Labels:
 *   MATCH      — same status in both envs
 *   PROMOTION  — envA was FAIL/BLOCKED → envB is PASS (fixed)
 *   REGRESSION — envA was PASS → envB is FAIL/BLOCKED (broke)
 *   DIVERGE    — different non-pass statuses
 *   MISSING-A  — TC only in envB
 *   MISSING-B  — TC only in envA
 *
 * @param {string|undefined} statusA
 * @param {string|undefined} statusB
 * @param {boolean} inA
 * @param {boolean} inB
 * @returns {string}
 */
function getVerdict(statusA, statusB, inA, inB) {
  if (!inA) return 'MISSING-A';
  if (!inB) return 'MISSING-B';
  if (statusA === statusB) return 'MATCH';

  const isPass = (s) => s === 'PASS';
  const isBad  = (s) => s === 'FAIL' || (s && s.startsWith('BLOCKED'));

  if (isPass(statusA) && isBad(statusB))  return 'REGRESSION';
  if (isBad(statusA)  && isPass(statusB)) return 'PROMOTION';
  return 'DIVERGE';
}

/**
 * Compute the full diff between two TC status maps.
 *
 * @param {Map<string, string>} mapA
 * @param {Map<string, string>} mapB
 * @returns {Array<{ tcId: string, statusA: string, statusB: string, verdict: string }>}
 */
function computeDiff(mapA, mapB) {
  const allTcIds = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows = [];

  for (const tcId of [...allTcIds].sort()) {
    const inA    = mapA.has(tcId);
    const inB    = mapB.has(tcId);
    const statusA = inA ? mapA.get(tcId) : '—';
    const statusB = inB ? mapB.get(tcId) : '—';
    const verdict = getVerdict(statusA, statusB, inA, inB);

    rows.push({ tcId, statusA, statusB, verdict });
  }

  return rows;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/** Verdict display labels for the markdown table. */
const VERDICT_LABEL = {
  'MATCH':     'MATCH',
  'REGRESSION': 'REGRESSION ⚠',
  'PROMOTION':  'PROMOTION ✓',
  'DIVERGE':    'DIVERGE',
  'MISSING-A':  'MISSING-A',
  'MISSING-B':  'MISSING-B',
};

/**
 * Render a markdown diff table.
 *
 * @param {Array<{tcId, statusA, statusB, verdict}>} diff
 * @param {string} envA
 * @param {string} envB
 * @returns {string}
 */
function renderDiffTable(diff, envA, envB) {
  if (diff.length === 0) {
    return `| TC-ID | ${envA} Status | ${envB} Status | Verdict |\n` +
           `|-------|-------------|-------------|---------||\n` +
           `| (no TCs found) | — | — | — |`;
  }

  // Compute column widths for alignment
  const colTcId   = Math.max(6, ...diff.map((r) => r.tcId.length));
  const colA      = Math.max(envA.length + 7, ...diff.map((r) => r.statusA.length));
  const colB      = Math.max(envB.length + 7, ...diff.map((r) => r.statusB.length));
  const colVerdit = Math.max(7, ...diff.map((r) => (VERDICT_LABEL[r.verdict] ?? r.verdict).length));

  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

  const header = `| ${pad('TC-ID', colTcId)} | ${pad(`${envA} Status`, colA)} | ${pad(`${envB} Status`, colB)} | ${pad('Verdict', colVerdit)} |`;
  const sep    = `|-${'-'.repeat(colTcId)}-|-${'-'.repeat(colA)}-|-${'-'.repeat(colB)}-|-${'-'.repeat(colVerdit)}-|`;
  const rows   = diff.map(({ tcId, statusA, statusB, verdict }) =>
    `| ${pad(tcId, colTcId)} | ${pad(statusA, colA)} | ${pad(statusB, colB)} | ${pad(VERDICT_LABEL[verdict] ?? verdict, colVerdit)} |`,
  );

  return [header, sep, ...rows].join('\n');
}

/**
 * Render a one-line summary footer.
 *
 * @param {{ match, promoted, regressed, diverged, missingA, missingB }} counts
 * @returns {string}
 */
function renderSummaryFooter(counts) {
  return (
    `Match: ${counts.match} | ` +
    `Promoted: ${counts.promoted} | ` +
    `Regressed: ${counts.regressed} | ` +
    `Diverged: ${counts.diverged} | ` +
    `Missing in A: ${counts.missingA} | ` +
    `Missing in B: ${counts.missingB}`
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Emit a NDJSON event to stdout (only in JSON mode).
 *
 * @param {boolean} json
 * @param {object} payload
 */
function logEvent(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

/**
 * Escape a string for use in a RegExp.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip ANSI escape codes from a string (for file output).
 *
 * @param {string} str
 * @returns {string}
 */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

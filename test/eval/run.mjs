// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/eval/run.mjs
 *
 * CLI runner for the TestNUX eval harness.
 *
 * Usage:
 *   node test/eval/run.mjs
 *   node test/eval/run.mjs --threshold 0.8
 *   node test/eval/run.mjs --fixture easy-login
 *   node test/eval/run.mjs --fixture easy-login --threshold 0.8
 *   node test/eval/run.mjs --dry-run
 *   node test/eval/run.mjs --mock
 *
 * Exit codes:
 *   0  all fixtures pass at or above threshold
 *   1  one or more fixtures fail below threshold
 */

import path       from 'path';
import fs         from 'fs';
import os         from 'os';
import { fileURLToPath } from 'url';
import { scoreScenarios, scorePlan, scoreSpec } from './scoring.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR  = path.join(__dirname, 'fixtures');
const EXPECTED_DIR  = path.join(__dirname, 'expected');
const MOCKS_DIR     = path.join(__dirname, 'mocks');

const KNOWN_FIXTURES = ['easy-login', 'medium-checkout', 'hard-dashboard'];

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const getArg   = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag  = (flag) => args.includes(flag);

const threshold    = parseFloat(getArg('--threshold') ?? '0.7');
const fixtureArg   = getArg('--fixture');
const isDryRun     = hasFlag('--dry-run');
const isMock       = hasFlag('--mock');

if (isNaN(threshold) || threshold < 0 || threshold > 1) {
  console.error('  ERROR: --threshold must be a number between 0 and 1.');
  process.exit(1);
}

const fixtures = fixtureArg
  ? [fixtureArg]
  : KNOWN_FIXTURES;

// Validate fixture names
for (const fix of fixtures) {
  if (!KNOWN_FIXTURES.includes(fix)) {
    console.error(`  ERROR: Unknown fixture "${fix}". Known fixtures: ${KNOWN_FIXTURES.join(', ')}`);
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('');
console.log('  testnux eval harness');
console.log('  ─────────────────────────────────────────────────────────');
console.log(`  Fixtures  : ${fixtures.join(', ')}`);
console.log(`  Threshold : ${threshold}`);
console.log(`  Mode      : ${isDryRun ? 'DRY-RUN' : isMock ? 'MOCK' : 'LIVE'}`);
console.log('');

if (isDryRun) {
  console.log('  [dry-run] Would evaluate the following fixtures:');
  for (const fix of fixtures) {
    const htmlPath = path.join(FIXTURES_DIR, `${fix}.html`);
    const expDir   = path.join(EXPECTED_DIR, fix);
    const hasHtml  = fs.existsSync(htmlPath);
    const hasExp   = fs.existsSync(expDir);
    console.log(`    ${fix}: fixture=${hasHtml ? 'OK' : 'MISSING'}, expected=${hasExp ? 'OK' : 'MISSING'}`);
  }
  console.log('');
  console.log('  [dry-run] No API calls made. Remove --dry-run to run for real.');
  console.log('');
  process.exit(0);
}

/** @type {{ fixture: string, scenario: object, plan: object, spec: object, pass: boolean }[]} */
const results = [];

for (const fixtureName of fixtures) {
  console.log(`  ── ${fixtureName} ──`);

  const htmlPath        = path.join(FIXTURES_DIR, `${fixtureName}.html`);
  const expScenariosPath = path.join(EXPECTED_DIR, fixtureName, 'scenarios.md');
  const expPlanPath     = path.join(EXPECTED_DIR, fixtureName, 'test-plan.md');
  const expSpecPath     = path.join(EXPECTED_DIR, fixtureName, 'spec.ts');

  // Validate inputs exist
  if (!fs.existsSync(htmlPath)) {
    console.error(`    SKIP — fixture HTML not found: ${htmlPath}`);
    continue;
  }
  if (!fs.existsSync(expScenariosPath) || !fs.existsSync(expPlanPath) || !fs.existsSync(expSpecPath)) {
    console.error(`    SKIP — expected outputs missing in: ${path.join(EXPECTED_DIR, fixtureName)}`);
    continue;
  }

  const expectedScenarios = fs.readFileSync(expScenariosPath, 'utf-8');
  const expectedPlan      = fs.readFileSync(expPlanPath, 'utf-8');
  const expectedSpec      = fs.readFileSync(expSpecPath, 'utf-8');

  // ── Get actual outputs ────────────────────────────────────────────────────

  let actualScenarios, actualPlan, actualSpec;

  if (isMock) {
    // Load pre-recorded mock LLM outputs
    const mockPath = path.join(MOCKS_DIR, `${fixtureName}.json`);
    if (!fs.existsSync(mockPath)) {
      console.error(`    SKIP — mock file not found: ${mockPath}`);
      console.error(`    Create test/eval/mocks/${fixtureName}.json with a recorded response.`);
      continue;
    }
    const mock       = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));
    actualScenarios  = mock.discover?.scenariosMd  ?? '';
    actualPlan       = mock.plan?.testPlanMd        ?? '';
    actualSpec       = mock.codify?.specTs          ?? '';

    if (!actualScenarios && !actualPlan && !actualSpec) {
      console.error(`    SKIP — mock file has no usable content fields (discover.scenariosMd, plan.testPlanMd, codify.specTs).`);
      continue;
    }
  } else {
    // LIVE mode: call the real commands against the fixture HTML
    // We use a file:// URL pointing at the fixture.
    // Note: discover only accepts http:// — for live mode, serve the fixture first.
    // This is intentional: running in live mode requires a dev server or
    // `npx serve test/eval/fixtures`. The harness documents this in the README.
    actualScenarios = await runDiscoverOnFixture(fixtureName, htmlPath);
    actualPlan      = await runPlanOnFixture(fixtureName);
    actualSpec      = await runCodifyOnFixture(fixtureName);
  }

  // ── Score each stage ──────────────────────────────────────────────────────

  const scenarioScore = scoreScenarios(actualScenarios, expectedScenarios);
  const planScore     = scorePlan(actualPlan, expectedPlan);
  const specScore     = scoreSpec(actualSpec, expectedSpec);

  const overallF1 = (scenarioScore.f1 + planScore.f1 + specScore.f1) / 3;
  const pass      = overallF1 >= threshold;

  results.push({ fixture: fixtureName, scenario: scenarioScore, plan: planScore, spec: specScore, pass });

  // Print per-fixture results
  printScoreRow('scenarios', scenarioScore, threshold);
  printScoreRow('plan     ', planScore,     threshold);
  printScoreRow('spec     ', specScore,     threshold);
  console.log(`    overall F1: ${fmtScore(overallF1)}  ${pass ? 'PASS' : 'FAIL'}`);
  console.log('');
}

// ── Summary table ─────────────────────────────────────────────────────────────

console.log('  ── Summary ──────────────────────────────────────────────────');
console.log('');
console.log(`  ${'fixture'.padEnd(22)} ${'scenarios'.padEnd(12)} ${'plan'.padEnd(12)} ${'spec'.padEnd(12)} overall`);
console.log(`  ${'─'.repeat(70)}`);

let anyFail = false;
for (const r of results) {
  const overall = (r.scenario.f1 + r.plan.f1 + r.spec.f1) / 3;
  const status  = r.pass ? 'PASS' : 'FAIL';
  if (!r.pass) anyFail = true;
  console.log(
    `  ${r.fixture.padEnd(22)} ` +
    `${fmtScore(r.scenario.f1).padEnd(12)} ` +
    `${fmtScore(r.plan.f1).padEnd(12)} ` +
    `${fmtScore(r.spec.f1).padEnd(12)} ` +
    `${fmtScore(overall)} ${status}`,
  );
}

console.log('');
console.log(`  Threshold: ${threshold}  |  Fixtures: ${results.length}  |  ${anyFail ? 'SOME FAILED' : 'ALL PASSED'}`);
console.log('');

if (anyFail) {
  console.log('  One or more fixtures scored below the threshold.');
  console.log('  Review the details above and either:');
  console.log('    a) Fix the command that is producing low-quality output, or');
  console.log('    b) Update the golden files if the LLM/prompt has intentionally changed');
  console.log('       (diff the output carefully before accepting).');
  console.log('');
  process.exit(1);
}

process.exit(0);

// ── Live-mode helpers ─────────────────────────────────────────────────────────

/**
 * Runs discover against the fixture HTML.
 * In live mode, discover expects an HTTP URL.
 * The harness assumes the fixture is served at http://localhost:8080/<name>.html
 * (run `npx serve test/eval/fixtures -p 8080` in a separate terminal).
 *
 * @param {string} fixtureName
 * @param {string} _htmlPath
 * @returns {Promise<string>}
 */
async function runDiscoverOnFixture(fixtureName, _htmlPath) {
  const { runDiscover } = await import('../../src/commands/discover.mjs');

  // Capture NDJSON output by redirecting stdout writes
  let scenariosMd = '';
  const originalWrite = process.stdout.write.bind(process.stdout);
  const captured = [];

  process.stdout.write = (chunk) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { captured.push(JSON.parse(t)); } catch { /* non-JSON */ }
    }
    return true;
  };

  try {
    const url = `http://localhost:8080/${fixtureName}.html`;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testnux-eval-'));
    await runDiscover(url, { slug: fixtureName, output: outDir, json: true });

    const outFile = path.join(outDir, 'scenarios.md');
    if (fs.existsSync(outFile)) {
      scenariosMd = fs.readFileSync(outFile, 'utf-8');
    }
  } catch {
    // discover may fail if server is not running — return empty string, scorer will penalize
  } finally {
    process.stdout.write = originalWrite;
  }

  return scenariosMd;
}

/**
 * Runs plan against the fixture slug.
 * @param {string} fixtureName
 * @returns {Promise<string>}
 */
async function runPlanOnFixture(fixtureName) {
  const { runPlan } = await import('../../src/commands/plan.mjs');
  const captured = [];
  const original = process.stdout.write.bind(process.stdout);

  process.stdout.write = (chunk) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { captured.push(JSON.parse(t)); } catch { /* non-JSON */ }
    }
    return true;
  };

  try {
    await runPlan(fixtureName, { industry: 'general', json: true });
  } catch { /* stub — returns empty */ } finally {
    process.stdout.write = original;
  }

  const done = captured.find((r) => r.event === 'plan.done');
  return done?.testPlanMd ?? '';
}

/**
 * Runs codify against the fixture slug.
 * @param {string} fixtureName
 * @returns {Promise<string>}
 */
async function runCodifyOnFixture(fixtureName) {
  const { runCodify } = await import('../../src/commands/codify.mjs');
  const captured = [];
  const original = process.stdout.write.bind(process.stdout);

  process.stdout.write = (chunk) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { captured.push(JSON.parse(t)); } catch { /* non-JSON */ }
    }
    return true;
  };

  try {
    await runCodify(fixtureName, { baseUrl: 'http://localhost:8080', json: true });
  } catch { /* stub */ } finally {
    process.stdout.write = original;
  }

  const done = captured.find((r) => r.event === 'codify.done');
  return done?.specTs ?? '';
}

// ── Display helpers ───────────────────────────────────────────────────────────

/**
 * Formats a score as a fixed-width string with color-like prefix.
 * @param {number} score
 * @returns {string}
 */
function fmtScore(score) {
  const pct = (score * 100).toFixed(1) + '%';
  return pct;
}

/**
 * Prints a single stage score row.
 * @param {string} label
 * @param {{ precision: number, recall: number, f1: number }} score
 * @param {number} threshold
 */
function printScoreRow(label, score, threshold) {
  const pass = score.f1 >= threshold;
  console.log(
    `    ${label}  P=${fmtScore(score.precision).padStart(7)}  R=${fmtScore(score.recall).padStart(7)}  F1=${fmtScore(score.f1).padStart(7)}  ${pass ? 'PASS' : 'FAIL'}`,
  );
}

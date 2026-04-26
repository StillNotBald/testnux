// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/init.mjs
 *
 * Implements `testnux init <slug>`.
 *
 * Copies templates/* into a date-prefixed folder under the output root,
 * performing {{placeholder}} substitution throughout. Idempotent — re-running
 * with the same slug on the same date skips files that already exist (never
 * overwrites hand-edited content).
 *
 * Placeholders substituted in every template file:
 *   {{slug}}          — the CLI argument (e.g. "dashboard-login")
 *   {{date}}          — ISO date of scaffold (e.g. "2026-04-26")
 *   {{industry}}      — industry profile (e.g. "general")
 *   {{tc_prefix}}     — UPPER_SLUG with hyphens → underscores removed, max 8 chars
 *                       (e.g. "dashboard-login" → "DASH-LOGIN" is derived from slug)
 *   {{folder}}        — final folder name (e.g. "2026-04-26_dashboard-login")
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} slug
 * @param {{ industry: string, outDir: string, json: boolean }} opts
 */
export async function runInit(slug, opts) {
  const { industry = 'general', outDir = './testing-log', json = false } = opts;

  validateSlug(slug);

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const folder = `${date}_${slug}`;
  const targetDir = path.resolve(outDir, folder);
  const tcPrefix = deriveTcPrefix(slug);

  const substitutions = {
    slug,
    date,
    industry,
    tc_prefix: tcPrefix,
    folder,
  };

  log(json, { event: 'init.start', slug, folder, targetDir, industry });

  // Create folder structure
  const dirs = [targetDir, path.join(targetDir, 'evidence')];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Template file mappings: source → target name (relative to targetDir)
  const templateFiles = [
    { src: 'test-plan.md', dest: 'test-plan.md' },
    { src: 'spec.ts',      dest: 'spec.ts' },
    { src: 'README.md',    dest: 'README.md' },
  ];

  const written = [];
  const skipped = [];

  for (const { src, dest } of templateFiles) {
    const srcPath = path.join(TEMPLATES_DIR, src);
    const destPath = path.join(targetDir, dest);

    if (!fs.existsSync(srcPath)) {
      log(json, { event: 'init.warning', message: `Template not found: ${src} — skipping` });
      continue;
    }

    if (fs.existsSync(destPath)) {
      // Idempotent — never overwrite hand-edited files
      skipped.push(dest);
      log(json, { event: 'init.skip', file: dest, reason: 'already exists' });
      continue;
    }

    const raw = fs.readFileSync(srcPath, 'utf-8');
    const rendered = applySubstitutions(raw, substitutions);
    fs.writeFileSync(destPath, rendered, 'utf-8');
    written.push(dest);
    log(json, { event: 'init.write', file: dest });
  }

  // Also create empty evidence/.gitkeep so Git tracks the folder
  const gitkeep = path.join(targetDir, 'evidence', '.gitkeep');
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, '', 'utf-8');
  }

  const summary = {
    event: 'init.done',
    folder: targetDir,
    written,
    skipped,
    tcPrefix,
    industry,
  };

  log(json, summary);

  if (!json) {
    console.log('');
    console.log(`✅  Test pass scaffolded: ${targetDir}`);
    console.log(`    TC prefix  : ${tcPrefix}`);
    console.log(`    Industry   : ${industry}`);
    console.log(`    Written    : ${written.join(', ') || '(none)'}`);
    if (skipped.length) {
      console.log(`    Skipped    : ${skipped.join(', ')} (already exist)`);
    }
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Edit ${path.join(targetDir, 'test-plan.md')} — fill in R-XX IDs, TC matrix, Given/When/Then`);
    console.log(`  2. Edit ${path.join(targetDir, 'spec.ts')} — implement the Playwright tests`);
    console.log(`  3. npm run build && npm start  # run against PROD build, not dev`);
    console.log(`  4. npx playwright test ${path.join(targetDir, 'spec.ts')}`);
    console.log(`  5. testnux report ${targetDir}`);
    console.log('');
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    const err = new Error('slug is required');
    err.exitCode = 2;
    throw err;
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    const err = new Error(
      `slug must be lowercase-kebab-case (a-z, 0-9, hyphens). Got: "${slug}"`,
    );
    err.exitCode = 2;
    throw err;
  }
}

/**
 * Derive a short TC prefix from a kebab-case slug.
 * "dashboard-login"  → "DASH"
 * "login"            → "LOGIN"
 * "admin-settings"   → "ADM-SET"
 *
 * Rules: split on hyphens, take first 4 chars of each word, join with -, uppercase, max 12 chars.
 */
function deriveTcPrefix(slug) {
  const parts = slug.split('-').map((w) => w.slice(0, 4).toUpperCase());
  return parts.join('-').slice(0, 12);
}

/**
 * Replace all {{key}} occurrences in `template` with values from `subs`.
 * Unknown keys are left as-is (safe — template may have future placeholders).
 */
function applySubstitutions(template, subs) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(subs, key) ? subs[key] : match;
  });
}

function log(json, payload) {
  if (json) {
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
}

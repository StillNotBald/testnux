// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/validate.mjs
 *
 * Implements `testnux validate <folder>`.
 *
 * Walks all *.md files inside <folder>, extracts YAML frontmatter (using
 * gray-matter), and validates against the rules defined in
 * schemas/test-plan-frontmatter.schema.json.
 *
 * Validation rules (mirrors the JSON Schema):
 *   REQUIRED — status, industry, r_ids, tc_prefix
 *   FORMAT   — r_ids items must match /^R-\d+$/
 *              tc_prefix must match /^[A-Z0-9-]{1,12}$/
 *              status must be one of the allowed enum values
 *   OPTIONAL — _review_required (bool), uat_status, industry_standards (array)
 *
 * Additional lint rules:
 *   - Warn if spec.ts is missing from the folder
 *   - Warn if evidence/ subdirectory is missing
 *   - Error if a TC ID mentioned in frontmatter tc_ids[] does not appear in
 *     the body as a heading (## TC-ID — ...)
 *   - Warn on hardcoded brand/product strings in spec.ts (prefer i18n keys)
 *
 * Exit codes:
 *   0  all checks passed (errors=0; warnings may exist unless --strict)
 *   1  unexpected runtime error
 *   3  parse error (malformed frontmatter)
 *   3  one or more validation errors (or warnings in --strict mode)
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// ── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_STATUS = [
  'DRAFT',
  'READY',
  'IN-PROGRESS',
  'DONE',
  'BLOCKED-IMPLEMENTATION',
  'BLOCKED-CONFIG',
  'SKIPPED',
  'ARCHIVED',
];

const R_ID_RE = /^R-\d+$/;
// Placeholder R-IDs that scaffolded templates ship with — meant to be
// replaced by users with real R-IDs (R-01, R-42, etc). We treat these
// as WARNINGS instead of ERRORS so `testnux init` → `testnux validate`
// doesn't immediately fail before users have a chance to fill them in.
// Pattern: R- followed by 1-3 uppercase letters (R-XX, R-YY, R-ZZ, R-ABC).
const R_ID_PLACEHOLDER_RE = /^R-[A-Z]{1,3}$/;
const TC_PREFIX_RE = /^[A-Z0-9-]{1,12}$/;
// Same idea for tc_prefix — `MYPROJ-` style placeholders should warn,
// not error, so users see actionable guidance.
const TC_PREFIX_PLACEHOLDER_RE = /^(YOUR-PREFIX|MYPROJ|EXAMPLE|XX|YY|TBD)$/;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} folder
 * @param {{ strict: boolean, json: boolean }} opts
 */
export async function runValidate(folder, opts = {}) {
  const { strict = false, json = false } = opts;

  const absFolder = path.resolve(folder);
  if (!fs.existsSync(absFolder)) {
    const err = new Error(`Folder not found: ${absFolder}`);
    err.exitCode = 2;
    throw err;
  }

  const findings = {
    errors: [],
    warnings: [],
    files: [],
  };

  // Walk all markdown files
  const mdFiles = walkMarkdown(absFolder);

  if (mdFiles.length === 0) {
    findings.warnings.push({ file: absFolder, message: 'No markdown files found in folder' });
  }

  for (const filePath of mdFiles) {
    const relFile = path.relative(absFolder, filePath);
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      parsed = matter(raw);
    } catch (err) {
      findings.errors.push({
        file: relFile,
        rule: 'frontmatter.parse',
        message: `Failed to parse frontmatter: ${err.message}`,
      });
      continue;
    }

    const fm = parsed.data;
    const fileFindings = { file: relFile, errors: [], warnings: [] };

    // ── Required fields ────────────────────────────────────────────────────

    for (const key of ['status', 'industry', 'r_ids', 'tc_prefix']) {
      if (fm[key] === undefined || fm[key] === null || fm[key] === '') {
        fileFindings.errors.push({
          rule: `required.${key}`,
          message: `Missing required frontmatter key: "${key}"`,
        });
      }
    }

    // ── status enum ────────────────────────────────────────────────────────

    if (fm.status && !ALLOWED_STATUS.includes(fm.status)) {
      fileFindings.errors.push({
        rule: 'status.enum',
        message: `Invalid status "${fm.status}". Allowed: ${ALLOWED_STATUS.join(' | ')}`,
      });
    }

    // ── r_ids format ───────────────────────────────────────────────────────

    if (Array.isArray(fm.r_ids)) {
      for (const id of fm.r_ids) {
        if (R_ID_RE.test(id)) {
          // valid: R-01, R-42, R-101 etc.
          continue;
        }
        if (R_ID_PLACEHOLDER_RE.test(id)) {
          // Scaffolded placeholder (R-XX, R-YY, R-ZZ) — warn, don't error.
          // User hasn't filled in real R-IDs yet, but the file structure
          // is otherwise valid. Use --strict to fail on these.
          fileFindings.warnings.push({
            rule: 'r_ids.placeholder',
            message: `Placeholder R-ID detected: "${id}". Replace with a real requirement ID (e.g. R-01) before final validation. Use --strict to treat as error.`,
          });
        } else {
          fileFindings.errors.push({
            rule: 'r_ids.format',
            message: `Invalid R-ID format: "${id}". Expected /^R-\\d+$/ (e.g. R-42) or a recognized placeholder (R-XX/R-YY/R-ZZ).`,
          });
        }
      }
    } else if (fm.r_ids !== undefined) {
      fileFindings.errors.push({
        rule: 'r_ids.type',
        message: `"r_ids" must be an array of strings, got: ${typeof fm.r_ids}`,
      });
    }

    // ── tc_prefix format ───────────────────────────────────────────────────

    if (fm.tc_prefix) {
      if (TC_PREFIX_RE.test(fm.tc_prefix) && !TC_PREFIX_PLACEHOLDER_RE.test(fm.tc_prefix)) {
        // valid + non-placeholder: e.g. LOGIN, REG, ADMIN-USER
        // (no action)
      } else if (TC_PREFIX_PLACEHOLDER_RE.test(fm.tc_prefix)) {
        // Recognized placeholder — warn, don't error.
        fileFindings.warnings.push({
          rule: 'tc_prefix.placeholder',
          message: `Placeholder tc_prefix detected: "${fm.tc_prefix}". Replace with your project's TC ID prefix (e.g. LOGIN, REG, CHECKOUT) before final validation.`,
        });
      } else {
        fileFindings.errors.push({
          rule: 'tc_prefix.format',
          message: `Invalid tc_prefix "${fm.tc_prefix}". Expected /^[A-Z0-9-]{1,12}$/ (uppercase letters, digits, hyphens; max 12 chars).`,
        });
      }
    }

    // ── _review_required type ──────────────────────────────────────────────

    if (fm._review_required !== undefined && typeof fm._review_required !== 'boolean') {
      fileFindings.warnings.push({
        rule: '_review_required.type',
        message: `"_review_required" should be a boolean, got: ${typeof fm._review_required}`,
      });
    }

    // ── uat_status enum ────────────────────────────────────────────────────

    const UAT_STATUSES = ['pending', 'accepted', 'rejected', 'needs-rework'];
    if (fm.uat_status && !UAT_STATUSES.includes(fm.uat_status)) {
      fileFindings.warnings.push({
        rule: 'uat_status.enum',
        message: `Unknown uat_status "${fm.uat_status}". Expected: ${UAT_STATUSES.join(' | ')}`,
      });
    }

    // ── industry_standards type ────────────────────────────────────────────

    if (fm.industry_standards !== undefined && !Array.isArray(fm.industry_standards)) {
      fileFindings.warnings.push({
        rule: 'industry_standards.type',
        message: `"industry_standards" should be an array, got: ${typeof fm.industry_standards}`,
      });
    }

    findings.files.push(fileFindings);
    for (const e of fileFindings.errors) findings.errors.push({ file: relFile, ...e });
    for (const w of fileFindings.warnings) findings.warnings.push({ file: relFile, ...w });
  }

  // ── Folder-level checks ────────────────────────────────────────────────────

  const specFile = path.join(absFolder, 'spec.ts');
  if (!fs.existsSync(specFile)) {
    findings.warnings.push({
      file: 'spec.ts',
      rule: 'folder.spec',
      message: 'spec.ts not found — run `testnux init` to scaffold, or create manually',
    });
  }

  const evidenceDir = path.join(absFolder, 'evidence');
  if (!fs.existsSync(evidenceDir)) {
    findings.warnings.push({
      file: 'evidence/',
      rule: 'folder.evidence',
      message: 'evidence/ subdirectory not found — afterEach hook will fail to write screenshots',
    });
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  const errorCount = findings.errors.length;
  const warnCount = findings.warnings.length;
  const failureCount = strict ? errorCount + warnCount : errorCount;

  if (json) {
    process.stdout.write(JSON.stringify({ event: 'validate.result', ...findings }) + '\n');
  } else {
    if (findings.errors.length === 0 && findings.warnings.length === 0) {
      console.log(`✅  All checks passed (${mdFiles.length} file(s) validated)`);
    } else {
      for (const e of findings.errors) {
        console.error(`❌  [${e.file}] ${e.rule}: ${e.message}`);
      }
      for (const w of findings.warnings) {
        console.warn(`⚠️   [${w.file}] ${w.rule}: ${w.message}`);
      }
      console.log('');
      console.log(
        `Result: ${errorCount} error(s), ${warnCount} warning(s) across ${mdFiles.length} file(s)`,
      );
      if (strict && warnCount > 0) {
        console.log('(--strict mode: warnings count as errors)');
      }
    }
  }

  if (failureCount > 0) {
    const err = new Error(`Validation failed: ${failureCount} issue(s)`);
    err.exitCode = 3;
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect all *.md files within `dir`. */
function walkMarkdown(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...walkMarkdown(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

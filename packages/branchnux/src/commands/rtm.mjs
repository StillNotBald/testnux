// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/rtm.mjs
 *
 * Implements `branchnux rtm`.
 *
 * Generates requirements/TRACEABILITY.md by:
 *   1. Parsing requirements/REQUIREMENTS.md for R-IDs + titles
 *   2. Walking sprint-log/<DATE>_<feature>/SPRINT_SUMMARY.md for shipped R-IDs
 *   3. Grepping the codebase for // R-XX inline comments
 *   4. Grepping test files for describe('R-XX') or // R-XX markers
 *   5. Reading requirements/MASTER_BACKLOG.md for open items per R-ID
 *   6. Writing requirements/TRACEABILITY.md with marker convention so
 *      human-edited Notes columns survive regeneration
 *
 * Marker convention:
 *   <!-- branchnux:row R-01 begin -->
 *   | R-01 | ... |
 *   <!-- branchnux:row R-01 end -->
 *
 * Exit codes:
 *   0  success
 *   2  missing requirements file
 *   3  parse error
 *
 * Flags:
 *   --dry-run          print to stdout, do not write file
 *   --strict           exit 1 if any R-ID has no code + no test evidence
 *   --config <path>    path to branchnux.config.mjs for glob overrides
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { glob } from 'glob';

import {
  parseRequirements,
  parseSprintSummary,
  parseTestPlan,
  parseCodeAnnotations,
} from '../lib/parser.mjs';
import { buildGraph } from '../lib/graph.mjs';

// ── Default configuration ─────────────────────────────────────────────────────

const DEFAULTS = {
  requirementsFile: 'requirements/REQUIREMENTS.md',
  traceabilityFile: 'requirements/TRACEABILITY.md',
  backlogFile: 'requirements/MASTER_BACKLOG.md',
  sprintLogGlob: 'sprint-log/**/SPRINT_SUMMARY.md',
  codeGlobs: ['src/**/*.{js,mjs,ts,tsx,jsx}', 'app/**/*.{js,mjs,ts,tsx,jsx}'],
  testGlobs: ['**/*.{spec,test}.{js,mjs,ts,tsx}', 'testing-log/**/*.md', 'e2e/**/*.{ts,js}'],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   dryRun   : boolean,
 *   strict   : boolean,
 *   config   : string|undefined,
 *   json     : boolean,
 *   cwd      : string,
 * }} opts
 */
export async function runRtm(opts = {}) {
  const {
    dryRun = false,
    strict = false,
    config: configPath,
    json = false,
    cwd = process.cwd(),
  } = opts;

  // ── Load config overrides ─────────────────────────────────────────────────

  let cfg = { ...DEFAULTS };
  if (configPath) {
    try {
      const resolvedPath = _validateConfigPath(configPath);
      // Use pathToFileURL so Windows absolute paths work with ESM import()
      const userCfg = (await import(pathToFileURL(resolvedPath).href)).default ?? {};
      cfg = { ...cfg, ...(userCfg.rtm ?? {}) };
    } catch (err) {
      if (err.exitCode !== undefined) throw err; // re-throw our own structured errors
      throw exitError(`Failed to load config from ${configPath}: ${err.message}`, 1);
    }
  }

  const abs = (rel) => path.resolve(cwd, rel);

  // ── Step 1: Parse REQUIREMENTS.md ─────────────────────────────────────────

  const reqFile = abs(cfg.requirementsFile);
  if (!fs.existsSync(reqFile)) {
    throw exitError(
      `Requirements file not found: ${reqFile}\n` +
        `Expected at ${cfg.requirementsFile} relative to cwd (${cwd}).\n` +
        `Create it or pass --config to override the path.`,
      2,
    );
  }

  let requirements;
  try {
    const content = fs.readFileSync(reqFile, 'utf-8');
    requirements = parseRequirements(content);
  } catch (err) {
    throw exitError(`Failed to parse ${reqFile}: ${err.message}`, 3);
  }

  if (requirements.length === 0) {
    throw exitError(
      `No R-IDs found in ${reqFile}. ` +
        `Expected headings like "## R-01 Title" or "## R-01 — Title".`,
      3,
    );
  }

  log(json, { event: 'rtm.requirements', count: requirements.length });

  // ── Step 2: Walk sprint-log/ for SPRINT_SUMMARY.md files ─────────────────

  const sprintFiles = await glob(cfg.sprintLogGlob, { cwd, absolute: true });
  const sprints = [];
  for (const sf of sprintFiles) {
    try {
      const content = fs.readFileSync(sf, 'utf-8');
      const parsed = parseSprintSummary(content);
      sprints.push({ path: sf, ...parsed });
    } catch {
      // Non-fatal — skip unreadable sprint files
      log(json, { event: 'rtm.warning', message: `Could not read sprint file: ${sf}` });
    }
  }
  log(json, { event: 'rtm.sprints', count: sprints.length });

  // ── Step 3: Grep codebase for // R-XX comments ───────────────────────────

  const codeAnnotations = await _grepFilesForRIds(cfg.codeGlobs, cwd, json);
  log(json, { event: 'rtm.code', uniqueRIds: codeAnnotations.size });

  // ── Step 4: Grep test files ───────────────────────────────────────────────

  const testAnnotations = await _grepFilesForRIds(cfg.testGlobs, cwd, json);

  // Also parse .md test plans (they use gray-matter frontmatter)
  const testPlanFiles = await glob(cfg.testGlobs.filter((g) => g.includes('.md')).concat(['testing-log/**/*.md']), {
    cwd,
    absolute: true,
  });
  const testPlans = [];
  for (const tf of testPlanFiles) {
    try {
      const content = fs.readFileSync(tf, 'utf-8');
      const parsed = parseTestPlan(content);
      if (parsed.rIds.length > 0) {
        testPlans.push({ path: tf, ...parsed });
      }
    } catch {
      // Non-fatal
    }
  }

  // Merge test plan rIds into testAnnotations map
  for (const tp of testPlans) {
    for (const rid of tp.rIds) {
      if (!testAnnotations.has(rid)) testAnnotations.set(rid, []);
      testAnnotations.get(rid).push(tp.path);
    }
  }

  log(json, { event: 'rtm.tests', uniqueRIds: testAnnotations.size });

  // ── Step 5: Read MASTER_BACKLOG.md for open items ─────────────────────────

  const backlogIndex = _parseBacklog(abs(cfg.backlogFile));

  // ── Step 6: Build graph + render table ───────────────────────────────────

  const graph = buildGraph({
    requirements,
    sprints,
    tests: testPlans,
    code: codeAnnotations,
  });

  const stats = graph.coverageStats();
  log(json, { event: 'rtm.stats', ...stats });

  // ── Strict mode check ─────────────────────────────────────────────────────

  if (strict) {
    const missing = requirements.filter((r) => {
      const ev = graph.findEvidence(r.id);
      return ev.code.length === 0 && ev.tests.length === 0;
    });
    if (missing.length > 0) {
      const ids = missing.map((r) => r.id).join(', ');
      throw exitError(
        `--strict: ${missing.length} R-ID(s) have no code or test evidence: ${ids}`,
        1,
      );
    }
  }

  // ── Render TRACEABILITY.md ─────────────────────────────────────────────────

  const existingContent = _readIfExists(abs(cfg.traceabilityFile));
  const existingNotes = _extractNotes(existingContent);

  const rendered = _render(requirements, graph, backlogIndex, existingNotes, stats);

  if (dryRun) {
    process.stdout.write(rendered + '\n');
    log(json, { event: 'rtm.dryRun', lines: rendered.split('\n').length });
    return;
  }

  fs.mkdirSync(path.dirname(abs(cfg.traceabilityFile)), { recursive: true });
  fs.writeFileSync(abs(cfg.traceabilityFile), rendered, 'utf-8');
  log(json, { event: 'rtm.written', path: abs(cfg.traceabilityFile) });

  if (!json) {
    console.log('');
    console.log(`RTM written: ${abs(cfg.traceabilityFile)}`);
    console.log(`  Requirements : ${stats.totalRIds}`);
    console.log(`  With tests   : ${stats.withTests}`);
    console.log(`  With code    : ${stats.withCode}`);
    console.log(`  With sprint  : ${stats.withSprint}`);
    console.log(`  Coverage     : ${stats.coverage}%`);
    console.log('');
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render the full TRACEABILITY.md content.
 */
function _render(requirements, graph, backlogIndex, existingNotes, stats) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('<!-- branchnux:rtm generated -->');
  lines.push(`<!-- Generated: ${date} by branchnux rtm. Do NOT edit the table rows directly. -->`);
  lines.push(`<!-- Human-edit zone: the Notes column inside each row marker pair survives regeneration. -->`);
  lines.push('');
  lines.push('# Requirements Traceability Matrix');
  lines.push('');
  lines.push(`**Generated:** ${date}  `);
  lines.push(
    `**Coverage:** ${stats.withTests}/${stats.totalRIds} requirements have test evidence ` +
      `(${stats.coverage}% overall)`,
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total requirements | ${stats.totalRIds} |`);
  lines.push(`| With sprint evidence | ${stats.withSprint} |`);
  lines.push(`| With code annotations | ${stats.withCode} |`);
  lines.push(`| With test evidence | ${stats.withTests} |`);
  lines.push(`| Coverage | ${stats.coverage}% |`);
  lines.push('');
  lines.push('## Traceability Table');
  lines.push('');
  lines.push('> **Marker convention:** Each row is wrapped in `<!-- branchnux:row R-XX begin/end -->` markers.');
  lines.push('> Edit the **Notes** column freely — it survives regeneration. Do not edit other columns by hand.');
  lines.push('');
  lines.push('| R-ID | Title | Status | Sprint | Code | Tests | Backlog | Notes |');
  lines.push('|------|-------|--------|--------|------|-------|---------|-------|');

  for (const req of requirements) {
    const ev = graph.findEvidence(req.id);
    const backlogItems = backlogIndex.get(req.id) ?? [];
    const notes = existingNotes.get(req.id) ?? '';

    const sprintCell = ev.sprint.length > 0
      ? ev.sprint.map((p) => `\`${path.basename(path.dirname(p))}\``).join(', ')
      : '—';

    const codeCell = ev.code.length > 0
      ? ev.code.slice(0, 3).map((ref) => `\`${_shortRef(ref)}\``).join(', ') +
        (ev.code.length > 3 ? ` *(+${ev.code.length - 3})*` : '')
      : '—';

    const testCell = ev.tests.length > 0
      ? ev.tests.slice(0, 3).map((t) => `\`${path.basename(path.dirname(t.path))}\``).join(', ') +
        (ev.tests.length > 3 ? ` *(+${ev.tests.length - 3})*` : '')
      : ev.code.length > 0 && testAnnotationsHas(graph, req.id)
      ? '(see code)'
      : '—';

    const backlogCell = backlogItems.length > 0
      ? backlogItems.map((item) => `- ${item}`).join('<br>')
      : '—';

    lines.push(`<!-- branchnux:row ${req.id} begin -->`);
    lines.push(
      `| ${req.id} | ${req.title} | ${req.status} | ${sprintCell} | ${codeCell} | ${testCell} | ${backlogCell} | ${notes} |`,
    );
    lines.push(`<!-- branchnux:row ${req.id} end -->`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*This file is auto-generated by `branchnux rtm`. Re-run to update evidence columns.*');
  lines.push('*To preserve hand-written notes, keep them inside the row marker pairs.*');

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Grep files matching globs for R-ID references.
 * Returns Map<rid, ref[]> where ref = 'file:line'.
 */
async function _grepFilesForRIds(globs, cwd, json) {
  const RID_RE = /\bR-\d{2,4}[A-Z]?\b/g;
  /** @type {Map<string, string[]>} */
  const map = new Map();

  const files = await glob(globs, { cwd, absolute: true, ignore: ['**/node_modules/**', '**/.git/**'] });

  const annotationLines = [];
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (RID_RE.test(text)) {
        annotationLines.push({ file, lineNumber: i + 1, text });
      }
      RID_RE.lastIndex = 0; // reset stateful regex
    }
  }

  return parseCodeAnnotations(annotationLines);
}

/**
 * Parse MASTER_BACKLOG.md for open items per R-ID.
 * Returns Map<rid, string[]>
 */
function _parseBacklog(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const RID_RE = /\bR-\d{2,4}[A-Z]?\b/g;

    for (const line of content.split('\n')) {
      const matches = [...line.matchAll(RID_RE)];
      if (matches.length === 0) continue;

      const itemText = line.replace(/^\s*[-*]\s+/, '').trim();
      for (const m of matches) {
        const rid = m[0];
        if (!map.has(rid)) map.set(rid, []);
        // Avoid duplicates
        if (!map.get(rid).includes(itemText)) {
          map.get(rid).push(itemText);
        }
      }
    }
  } catch {
    // Non-fatal
  }

  return map;
}

/**
 * Read existing TRACEABILITY.md and extract human-edited Notes per R-ID.
 * Notes are the last column in each marker-wrapped row.
 */
function _extractNotes(content) {
  /** @type {Map<string, string>} */
  const notes = new Map();
  if (!content) return notes;

  const rowRe = /<!-- branchnux:row (R-\d{2,4}[A-Z]?) begin -->\n\|(.+)\|\n<!-- branchnux:row \1 end -->/g;
  let m;
  while ((m = rowRe.exec(content)) !== null) {
    const rid = m[1];
    const cells = m[2].split('|');
    // Notes is the last cell (index = cells.length - 1, but trailing | adds empty last)
    const notes_cell = cells[cells.length - 1]?.trim() ?? '';
    notes.set(rid, notes_cell);
  }
  return notes;
}

function _readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function _shortRef(ref) {
  // 'src/components/Foo.tsx:42' → 'components/Foo.tsx:42'
  return ref.replace(/^.*?(?:src|app)\//, '');
}

function testAnnotationsHas(graph, rid) {
  return (graph._testIndex?.get(rid)?.length ?? 0) > 0;
}

/**
 * Validate a user-supplied config path before dynamic import.
 *
 * Security constraints (SEC-F3, audit ref: docs/audit/2026-04-28/SYNTHESIS-5nux.md):
 *   1. Extension must be .mjs, .js, or .cjs — reject anything else to prevent
 *      loading native add-ons (.node), JSON with side-effects, or arbitrary binaries.
 *   2. Resolved absolute path must start with process.cwd() — reject paths that
 *      escape the project tree (e.g. ../../etc/passwd, /tmp/evil.mjs).
 *
 * @param {string} configPath  raw value from --config flag
 * @returns {string}           validated resolved absolute path
 */
function _validateConfigPath(configPath) {
  const ALLOWED_EXTENSIONS = new Set(['.mjs', '.js', '.cjs']);
  const ext = path.extname(configPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw exitError(
      `--config "${configPath}" rejected: extension "${ext}" is not allowed. ` +
      'Must be .mjs, .js, or .cjs. ' +
      'The file is executed as a Node.js module; only use files you trust.',
      1,
    );
  }

  const resolved = path.resolve(configPath);
  const cwdResolved = path.resolve(process.cwd());
  // Ensure the path is inside cwd (add trailing sep to avoid prefix collisions
  // e.g. /project-evil matching /project)
  const cwdWithSep = cwdResolved.endsWith(path.sep) ? cwdResolved : cwdResolved + path.sep;
  if (!resolved.startsWith(cwdWithSep) && resolved !== cwdResolved) {
    throw exitError(
      `--config "${configPath}" rejected: resolved path "${resolved}" is outside the ` +
      `project directory "${cwdResolved}". ` +
      'Config files must be inside the current working directory.',
      1,
    );
  }

  return resolved;
}

function exitError(message, code) {
  const err = new Error(message);
  err.exitCode = code;
  return err;
}

function log(json, payload) {
  if (json) {
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
}

// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/sca-oscal.mjs
 *
 * Implements `testnux sca oscal <surface>`.
 *
 * Reads the latest SCA markdown from requirements/validations/<surface>/v*.md,
 * parses it into a minimal SCA graph, emits an OSCAL 1.1.2 assessment-results
 * JSON document alongside the source file.
 *
 * Usage:
 *   testnux sca oscal login
 *   testnux sca oscal login --validate
 *   testnux sca oscal login --out ./my-output/
 *
 * Flags:
 *   --validate    Run schema check on the emitted OSCAL JSON; exit 1 if invalid
 *   --out <dir>   Write OSCAL JSON to <dir> instead of alongside the source file
 *   --dry-run     Parse and validate but do not write the output file
 *
 * Output file name convention:
 *   requirements/validations/<surface>/v<X.Y>.oscal.json
 *   (version derived from the source filename, e.g. v0.1.md → v0.1.oscal.json)
 *
 * Exit codes:
 *   0  success
 *   1  OSCAL validation failed (with --validate)
 *   2  missing or invalid input
 *   3  parse error
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { toOSCAL, validateOSCAL, OscalValidationError } from '../lib/oscal.mjs';
import {
  buildAssessmentLogExtension,
  mergeAssessmentLog,
  validateExtension,
} from '../lib/oscal-signoff.mjs';

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} surface  e.g. "login", "api-gateway"
 * @param {{
 *   validate:       boolean,
 *   out:            string | undefined,
 *   dryRun:         boolean,
 *   json:           boolean,
 *   cwd:            string,
 *   uatLogPath:     string | undefined,  // explicit path to uat-log.jsonl (S3)
 *   skipAssessmentLog: boolean,          // skip uat-log merge even if file exists (S3)
 * }} opts
 */
export async function runScaOscal(surface, opts = {}) {
  const {
    validate           = false,
    out                = undefined,
    dryRun             = false,
    json               = false,
    cwd                = process.cwd(),
    uatLogPath         = undefined,
    skipAssessmentLog  = false,
  } = opts;

  validateSurface(surface);

  // ── Locate latest SCA markdown ────────────────────────────────────────────

  const searchRoots = [
    path.join(cwd, 'requirements', 'validations', surface),
    path.join(cwd, 'requirements', 'sca', surface),
    path.join(cwd, 'requirements', surface),
  ];

  const { scaFile, scaDir } = findLatestScaFile(surface, searchRoots);

  log(json, { event: 'sca-oscal.found', file: scaFile });

  // ── Parse SCA markdown ────────────────────────────────────────────────────

  let raw;
  try {
    raw = fs.readFileSync(scaFile, 'utf-8');
  } catch (err) {
    const e = new Error(`Cannot read SCA file: ${scaFile} — ${err.message}`);
    e.exitCode = 2;
    throw e;
  }

  let sca;
  try {
    sca = parseScaMarkdown(raw, surface, scaFile);
  } catch (err) {
    const e = new Error(`Failed to parse SCA markdown: ${err.message}`);
    e.exitCode = 3;
    throw e;
  }

  log(json, {
    event:    'sca-oscal.parsed',
    controls: sca.controls.length,
    evidence: sca.evidence.length,
    declined: sca.declined.length,
    signOff:  sca.signOff.length,
  });

  // ── Emit OSCAL JSON ───────────────────────────────────────────────────────

  let oscalDoc;
  try {
    oscalDoc = toOSCAL(sca);
  } catch (err) {
    if (err instanceof OscalValidationError) {
      emit(json, { error: 'OSCAL validation failed', issues: err.issues });
      if (!json) {
        console.error(`OSCAL validation failed:\n  ${err.issues.join('\n  ')}`);
      }
      err.exitCode = 1;
      throw err;
    }
    throw err;
  }

  // ── S3: Merge uat-log assessment-log entries ──────────────────────────────

  if (!skipAssessmentLog) {
    // Resolve uat-log path: explicit option → surface dir → scaDir
    const resolvedUatLog = uatLogPath
      ? path.resolve(uatLogPath)
      : findUatLog(surface, scaDir, cwd);

    if (resolvedUatLog && fs.existsSync(resolvedUatLog)) {
      try {
        const extension = buildAssessmentLogExtension(resolvedUatLog);
        const extValidation = validateExtension(extension);
        if (!extValidation.valid) {
          if (!json) {
            console.warn(
              '  [sca-oscal] WARNING: uat-log extension has validation issues:\n' +
              extValidation.errors.map((e) => `    ${e}`).join('\n')
            );
          }
          log(json, { event: 'sca-oscal.assessment-log.warn', issues: extValidation.errors });
        }
        mergeAssessmentLog(oscalDoc, extension);
        log(json, {
          event:          'sca-oscal.assessment-log.merged',
          uatLogPath:     resolvedUatLog,
          logEntries:     extension.assessmentLog.entries.length,
          parties:        extension.responsibleParties.length,
          subjects:       extension.subjects.length,
        });
        if (!json) {
          console.log(`  Assessment-log: merged ${extension.assessmentLog.entries.length} UAT entries from ${resolvedUatLog}`);
        }
      } catch (err) {
        // Non-fatal: uat-log merge failure should not block OSCAL emit
        if (!json) {
          console.warn(`  [sca-oscal] WARNING: could not merge uat-log (${err.message}) — skipping assessment-log.`);
        }
        log(json, { event: 'sca-oscal.assessment-log.skip', reason: err.message });
      }
    } else {
      log(json, { event: 'sca-oscal.assessment-log.skip', reason: 'no uat-log.jsonl found' });
      if (!json && resolvedUatLog) {
        console.log(`  Assessment-log: no uat-log.jsonl at ${resolvedUatLog} — skipped.`);
      }
    }
  }

  // ── Optional explicit --validate pass ─────────────────────────────────────

  if (validate) {
    try {
      validateOSCAL(oscalDoc);
      log(json, { event: 'sca-oscal.validate', result: 'pass' });
      if (!json) console.log('  OSCAL schema check: PASS');
    } catch (err) {
      emit(json, { event: 'sca-oscal.validate', result: 'fail', issues: err.issues });
      if (!json) {
        console.error(`  OSCAL schema check: FAIL\n  ${err.issues.join('\n  ')}`);
      }
      err.exitCode = 1;
      throw err;
    }
  }

  // ── Determine output path ─────────────────────────────────────────────────

  const version = sca.version ?? '0.1';
  const outFileName = `v${version}.oscal.json`;
  const outDir   = out ? path.resolve(out) : scaDir;
  const outFile  = path.join(outDir, outFileName);

  if (dryRun) {
    log(json, { event: 'sca-oscal.dry-run', wouldWrite: outFile });
    if (!json) {
      console.log('');
      console.log('  [dry-run] Would write:', outFile);
      console.log('  OSCAL document preview (first 500 chars):');
      console.log('  ' + JSON.stringify(oscalDoc, null, 2).slice(0, 500) + '...');
      console.log('');
    }
    return { outFile, oscalDoc, dryRun: true };
  }

  // ── Write output ──────────────────────────────────────────────────────────

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(oscalDoc, null, 2) + '\n', 'utf-8');
  } catch (err) {
    const e = new Error(`Failed to write OSCAL output to ${outFile}: ${err.message}`);
    e.exitCode = 1;
    throw e;
  }

  log(json, { event: 'sca-oscal.done', outFile });

  if (!json) {
    console.log('');
    console.log('  OSCAL document written:', outFile);
    console.log(`  Surface : ${surface}`);
    console.log(`  Version : ${version}`);
    console.log(`  Controls: ${sca.controls.length}`);
    console.log(`  Findings: ${sca.evidence.length}`);
    console.log(`  Risks   : ${sca.declined.length}`);
    console.log('');
    console.log('  Consume with IBM Compliance Trestle:');
    console.log(`    trestle import -f ${outFile} -o ${surface}-assessment-results`);
    console.log('');
  }

  return { outFile, oscalDoc, dryRun: false };
}

// ── SCA Markdown Parser ──────────────────────────────────────────────────────

/**
 * Parse a TestNUX SCA markdown document into a minimal SCA object.
 *
 * Parsing strategy:
 *   - Frontmatter (gray-matter) → surface, version, published, signOff
 *   - Section headings "## Section N" or "## Control AC-2" → controls
 *   - Table rows with "PASS" / "FAIL" / "PARTIAL" → control status + evidence
 *   - "Declined by Design" / "Risk Accepted" sections → declined controls
 *   - Sign-off tables → signOff array
 *
 * This parser is intentionally lenient. SCA documents are human-authored;
 * missing sections produce empty arrays, not errors.
 *
 * @param {string} raw       Raw markdown content
 * @param {string} surface   Surface name (used as fallback)
 * @param {string} filePath  Source path (for version extraction)
 * @returns {object} SCA object
 */
function parseScaMarkdown(raw, surface, filePath) {
  const parsed = matter(raw);
  const fm     = parsed.data ?? {};
  const body   = parsed.content ?? raw;

  // Version from filename: v0.1.md → "0.1"
  const versionMatch = path.basename(filePath).match(/v(\d+\.\d+)/);
  const version = fm.version ?? (versionMatch ? versionMatch[1] : '0.1');

  const controls = [];
  const evidence = [];
  const declined = [];
  const signOff  = [];

  // Split body into lines for simple state-machine parsing
  const lines = body.split('\n');

  let currentControlId = null;
  let currentControlTitle = null;
  let inDeclinedSection = false;
  let inSignOffSection  = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section transitions
    if (/^#{1,3}\s/.test(line)) {
      const heading = line.replace(/^#+\s*/, '').trim();

      // Declined / risk-accepted sections
      if (/declined|risk.?accept|exception|out.of.scope/i.test(heading)) {
        inDeclinedSection = true;
        inSignOffSection  = false;
        currentControlId  = null;
        continue;
      }

      // Sign-off sections
      if (/sign.?off|approver|responsible.part/i.test(heading)) {
        inDeclinedSection = false;
        inSignOffSection  = true;
        currentControlId  = null;
        continue;
      }

      // Control headings: "## AC-2 — Account Management" or "## IA-5"
      const ctrlMatch = heading.match(/^([A-Z]{1,3}-\d+(?:\.\d+)?)\s*[—\-:–]?\s*(.*)?$/);
      if (ctrlMatch) {
        inDeclinedSection = false;
        inSignOffSection  = false;
        currentControlId  = ctrlMatch[1];
        currentControlTitle = (ctrlMatch[2] || heading).trim();

        // Add control stub; status will be updated when we see table rows
        if (!controls.find((c) => c.id === currentControlId)) {
          controls.push({
            id:       currentControlId,
            title:    currentControlTitle,
            status:   'not-applicable',
            findings: [],
          });
        }
        continue;
      }

      // Generic heading resets state
      inDeclinedSection = false;
      inSignOffSection  = false;
      currentControlId  = null;
      continue;
    }

    // Table rows: | AC-2 | PASS | evidence link |
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;

      // Status cell detection
      const statusRaw = cells.find((c) => /^(pass|fail|partial|n\/?a|not.applicable)/i.test(c));
      const statusStr = statusRaw ? normalizeStatus(statusRaw) : null;

      // Control ID in first cell?
      const idMatch = cells[0].match(/^([A-Z]{1,3}-\d+(?:\.\d+)?)/);
      const rowControlId = idMatch ? idMatch[1] : currentControlId;

      if (inDeclinedSection && rowControlId) {
        // Declined-by-design row
        declined.push({
          controlId:    rowControlId,
          reason:       cells[cells.length - 1] ?? 'Not specified',
          approvedBy:   fm.approvedBy ?? 'unknown',
          approvedDate: fm.approvedDate ?? fm.published ?? new Date().toISOString().slice(0, 10),
        });
        continue;
      }

      if (inSignOffSection && cells.length >= 2) {
        // Sign-off row: | Name | Role | Date | Email? |
        const nameCell  = cells[0];
        const roleCell  = cells[1] ?? 'Reviewer';
        const dateCell  = cells[2] ?? '';
        const emailCell = cells[3] ?? '';
        if (nameCell && !/^name$/i.test(nameCell) && !/^-+$/.test(nameCell)) {
          signOff.push({
            name:  nameCell,
            role:  roleCell,
            date:  dateCell,
            email: emailCell.includes('@') ? emailCell : undefined,
          });
        }
        continue;
      }

      if (rowControlId && statusStr) {
        // Update control status
        const ctrl = controls.find((c) => c.id === rowControlId);
        if (ctrl) {
          ctrl.status = statusStr;
        } else {
          controls.push({
            id:       rowControlId,
            title:    rowControlId,
            status:   statusStr,
            findings: [],
          });
        }

        // Last cell may be evidence link or description
        const evidenceCell = cells[cells.length - 1];
        if (evidenceCell && !/^(pass|fail|partial|n\/?a)/i.test(evidenceCell)) {
          const hrefMatch = evidenceCell.match(/\[.*?\]\((.*?)\)/);
          evidence.push({
            controlId:   rowControlId,
            type:        'document',
            href:        hrefMatch ? hrefMatch[1] : evidenceCell,
            description: hrefMatch ? evidenceCell.replace(/\[.*?\]\(.*?\)/, '').trim() : evidenceCell,
          });
        }
      }
    }

    // Findings bullets under current control: "- Finding: ..."
    if (/^\s*[-*]\s+/.test(line) && currentControlId) {
      const finding = line.replace(/^\s*[-*]\s+/, '').trim();
      const ctrl = controls.find((c) => c.id === currentControlId);
      if (ctrl && finding) {
        ctrl.findings.push(finding);
      }
    }
  }

  // Fallback: if no controls parsed, synthesize one placeholder
  if (controls.length === 0) {
    controls.push({
      id:       'GENERAL',
      title:    `Surface: ${surface}`,
      status:   'not-applicable',
      findings: ['No individual controls parsed from SCA markdown. Review source document.'],
    });
  }

  return {
    surface:   fm.surface   ?? surface,
    version,
    published: fm.published ?? fm.date ?? undefined,
    controls,
    evidence,
    declined,
    signOff:   signOff.length > 0 ? signOff : (fm.signOff ?? []),
  };
}

/**
 * Normalize a table cell status string to SCA status enum.
 * "PASS" → "pass", "N/A" → "not-applicable"
 */
function normalizeStatus(raw) {
  const s = raw.toUpperCase().replace(/[\s/]/g, '');
  if (s === 'PASS')           return 'pass';
  if (s === 'FAIL')           return 'fail';
  if (s === 'PARTIAL')        return 'partial';
  if (s === 'NA' || s === 'NOTAPPLICABLE') return 'not-applicable';
  return 'not-applicable';
}

// ── File finder ──────────────────────────────────────────────────────────────

/**
 * Find the latest v*.md SCA file for a surface in the given search roots.
 * "Latest" = highest semver among filenames matching /^v\d+\.\d+\.md$/.
 *
 * @param {string}   surface
 * @param {string[]} searchRoots
 * @returns {{ scaFile: string, scaDir: string }}
 */
function findLatestScaFile(surface, searchRoots) {
  for (const searchDir of searchRoots) {
    if (!fs.existsSync(searchDir)) continue;

    const files = fs.readdirSync(searchDir)
      .filter((f) => /^v\d+\.\d+\.md$/.test(f))
      .sort((a, b) => {
        const va = parseVersionString(a);
        const vb = parseVersionString(b);
        return vb[0] - va[0] || vb[1] - va[1]; // descending
      });

    if (files.length > 0) {
      return { scaFile: path.join(searchDir, files[0]), scaDir: searchDir };
    }

    // Also accept any *.md in the directory (less strict)
    const anyMd = fs.readdirSync(searchDir).find((f) => f.endsWith('.md'));
    if (anyMd) {
      return { scaFile: path.join(searchDir, anyMd), scaDir: searchDir };
    }
  }

  const err = new Error(
    `No SCA markdown found for surface "${surface}". ` +
    `Searched:\n  ${searchRoots.join('\n  ')}\n` +
    `Create an SCA document at requirements/validations/${surface}/v0.1.md first.`,
  );
  err.exitCode = 2;
  throw err;
}

function parseVersionString(filename) {
  const m = filename.match(/v(\d+)\.(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

// ── Validation helpers ───────────────────────────────────────────────────────

/**
 * Validate that the surface argument is present and lowercase-kebab-case.
 * Matches the validation pattern in sca.mjs.
 *
 * @param {string} surface
 * @throws {Error} with exitCode 2 on invalid input
 */
function validateSurface(surface) {
  if (!surface || typeof surface !== 'string') {
    throw exitError('surface is required (e.g. "login")', 2);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(surface)) {
    throw exitError(
      `surface must be lowercase-kebab-case. Got: "${surface}"`,
      2,
    );
  }
}

function exitError(message, code) {
  const err = new Error(message);
  err.exitCode = code;
  return err;
}

// ── UAT log finder (S3) ──────────────────────────────────────────────────────

/**
 * Resolve a uat-log.jsonl path for the given surface.
 *
 * Search order:
 *   1. <scaDir>/uat-log.jsonl
 *   2. <cwd>/testing-log/<surface>/uat-log.jsonl  (glob: newest folder matching surface)
 *   3. <cwd>/<surface>/uat-log.jsonl
 *
 * Returns the first path that exists, or null if none found.
 *
 * @param {string} surface
 * @param {string} scaDir    Directory where the SCA markdown lives
 * @param {string} cwd
 * @returns {string | null}
 */
function findUatLog(surface, scaDir, cwd) {
  const candidates = [
    path.join(scaDir, 'uat-log.jsonl'),
    path.join(cwd, 'testing-log', surface, 'uat-log.jsonl'),
    path.join(cwd, surface, 'uat-log.jsonl'),
  ];

  // Also try date-prefixed testing-log folders: testing-log/<date>_<surface>/
  try {
    const testingLogDir = path.join(cwd, 'testing-log');
    if (fs.existsSync(testingLogDir)) {
      const dirs = fs.readdirSync(testingLogDir)
        .filter((d) => d.includes(surface))
        .sort()
        .reverse(); // newest first (date-prefix sorts lexicographically)
      for (const dir of dirs) {
        candidates.push(path.join(testingLogDir, dir, 'uat-log.jsonl'));
      }
    }
  } catch {
    // ignore — just don't add those candidates
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── Logging helpers ──────────────────────────────────────────────────────────

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

function emit(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
  else if (payload.error) console.error(payload.error);
}

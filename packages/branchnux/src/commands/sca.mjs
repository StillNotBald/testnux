// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/sca.mjs
 *
 * Implements the `branchnux sca` subcommand group:
 *
 *   branchnux sca init <surface> [--industry general|fintech|healthcare|malaysia-banking]
 *     Scaffold requirements/validations/<surface>/v1.0_<DATE>.md from the
 *     canonical 8-section SCA template.
 *
 *   branchnux sca generate <surface>
 *     Fill per-control evidence rows from current test results + R-IDs.
 *     Cells that require LLM judgment are stubbed with [VERIFY] markers.
 *     Human-edited Operational notes + Open Items survive regeneration via
 *     the <!-- branchnux:section ... --> marker convention.
 *
 *   branchnux sca pdf <surface>
 *     Render the latest SCA version to PDF via puppeteer-core (optional dep).
 *     Informs the user if puppeteer-core is not installed.
 *
 * Exit codes:
 *   0  success
 *   1  generic error
 *   2  missing required input
 *   3  parse error
 *
 * Flags (all subcommands):
 *   --dry-run                   print to stdout, do not write
 *   --config <path>             branchnux.config.mjs path
 *   --standards-version <ver>   recorded in frontmatter (default: "1.0.0")
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { glob } from 'glob';

import {
  parseRequirements,
  parseSprintSummary,
  parseTestPlan,
  parseCodeAnnotations,
} from '../lib/parser.mjs';
import { buildGraph } from '../lib/graph.mjs';
import { validateSurface } from '../lib/validate-surface.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Paths ─────────────────────────────────────────────────────────────────────

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates', 'sca');
const INDUSTRY_STANDARDS_DIR = path.join(__dirname, '..', 'config', 'industry-standards');

// ── Default configuration ─────────────────────────────────────────────────────

const DEFAULTS = {
  validationsRoot: 'requirements/validations',
  requirementsFile: 'requirements/REQUIREMENTS.md',
  sprintLogGlob: 'sprint-log/**/SPRINT_SUMMARY.md',
  testGlobs: ['testing-log/**/*.md', '**/*.{spec,test}.{ts,tsx,js,mjs}'],
  codeGlobs: ['src/**/*.{ts,tsx,js,mjs}', 'app/**/*.{ts,tsx,js,mjs}'],
};

// ── sca init ──────────────────────────────────────────────────────────────────

/**
 * Scaffold a new SCA document for a surface.
 *
 * @param {string} surface   e.g. "login", "dashboard", "api"
 * @param {{
 *   industry          : string,
 *   dryRun            : boolean,
 *   config            : string|undefined,
 *   json              : boolean,
 *   standardsVersion  : string,
 *   cwd               : string,
 * }} opts
 */
export async function runScaInit(surface, opts = {}) {
  const {
    industry = 'general',
    dryRun = false,
    json = false,
    standardsVersion = '1.0.0',
    cwd = process.cwd(),
  } = opts;

  validateSurface(surface);

  const cfg = await _loadConfig(opts.config, cwd);
  const abs = (rel) => path.resolve(cwd, rel);

  // Load industry config
  const industryConfig = _loadIndustryConfig(industry);

  // Determine output path
  const date = new Date().toISOString().slice(0, 10);
  const outDir = abs(path.join(cfg.validationsRoot, surface));
  const outFile = path.join(outDir, `v1.0_${date}.md`);

  if (fs.existsSync(outFile) && !dryRun) {
    log(json, { event: 'sca.init.skip', reason: 'file already exists', path: outFile });
    if (!json) console.log(`SCA file already exists: ${outFile}\nDelete it to re-scaffold.`);
    return;
  }

  // Load template
  const templatePath = path.join(TEMPLATES_DIR, 'v1.0.md');
  if (!fs.existsSync(templatePath)) {
    throw exitError(`SCA template not found at ${templatePath}`, 2);
  }

  const templateRaw = fs.readFileSync(templatePath, 'utf-8');

  // Substitute placeholders
  const standardsIds = (industryConfig?.standards ?? []).map((s) => s.id).join(', ');
  const rendered = applySubstitutions(templateRaw, {
    surface,
    date,
    industry,
    standards_version: standardsVersion,
    standards_list: standardsIds || '(load industry config to populate)',
    standards_count: String((industryConfig?.standards ?? []).length),
  });

  if (dryRun) {
    process.stdout.write(rendered + '\n');
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, rendered, 'utf-8');

  log(json, { event: 'sca.init.done', path: outFile, surface, industry });

  if (!json) {
    console.log('');
    console.log(`SCA scaffolded: ${outFile}`);
    console.log(`  Surface  : ${surface}`);
    console.log(`  Industry : ${industry} (${(industryConfig?.standards ?? []).length} controls)`);
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Fill in Executive Summary placeholders`);
    console.log(`  2. Run: branchnux sca generate ${surface}`);
    console.log(`  3. Review [VERIFY] markers — these need human judgment`);
    console.log(`  4. Run: branchnux sca pdf ${surface}`);
    console.log('');
  }
}

// ── sca generate ─────────────────────────────────────────────────────────────

/**
 * Fill evidence columns in the latest SCA for a surface.
 * Human-edited sections survive via marker convention.
 *
 * @param {string} surface
 * @param {{
 *   dryRun           : boolean,
 *   config           : string|undefined,
 *   json             : boolean,
 *   standardsVersion : string,
 *   cwd              : string,
 * }} opts
 */
export async function runScaGenerate(surface, opts = {}) {
  const {
    dryRun = false,
    json = false,
    standardsVersion = '1.0.0',
    cwd = process.cwd(),
  } = opts;

  validateSurface(surface);

  const cfg = await _loadConfig(opts.config, cwd);
  const abs = (rel) => path.resolve(cwd, rel);

  // Find the latest SCA file for this surface
  const validationsDir = abs(path.join(cfg.validationsRoot, surface));
  const existingFile = _findLatestScaFile(validationsDir, surface);

  if (!existingFile) {
    throw exitError(
      `No SCA file found for surface "${surface}" in ${validationsDir}.\n` +
        `Run: branchnux sca init ${surface}`,
      2,
    );
  }

  log(json, { event: 'sca.generate.start', file: existingFile });

  // Read existing file and extract human-edited sections
  const existingContent = fs.readFileSync(existingFile, 'utf-8');
  const humanSections = _extractHumanSections(existingContent);

  // ── Build evidence graph ─────────────────────────────────────────────────

  const requirements = _safeParseRequirements(abs(cfg.requirementsFile));
  const sprints = await _loadSprints(cfg.sprintLogGlob, cwd, json);
  const codeAnnotations = await _grepForRIds(cfg.codeGlobs, cwd);
  const testPlans = await _loadTestPlans(cfg.testGlobs, cwd);

  const graph = buildGraph({ requirements, sprints, tests: testPlans, code: codeAnnotations });
  const stats = graph.coverageStats();

  log(json, { event: 'sca.generate.graph', ...stats });

  // ── Determine which industry config was used ──────────────────────────────

  // Try to extract industry from existing frontmatter
  let industry = 'general';
  const industryMatch = existingContent.match(/^industry:\s*(.+)$/m);
  if (industryMatch) industry = industryMatch[1].trim();

  const industryConfig = _loadIndustryConfig(industry);
  const controls = industryConfig?.standards ?? [];
  const signOffRoles = industryConfig?.signOffRoles ?? ['Project Owner', 'Reviewer'];

  // ── Render updated content ────────────────────────────────────────────────

  const date = new Date().toISOString().slice(0, 10);
  const rendered = _renderScaGenerate({
    surface,
    date,
    standardsVersion,
    industry,
    controls,
    signOffRoles,
    requirements,
    graph,
    stats,
    humanSections,
  });

  if (dryRun) {
    process.stdout.write(rendered + '\n');
    log(json, { event: 'sca.generate.dryRun' });
    return;
  }

  fs.writeFileSync(existingFile, rendered, 'utf-8');
  log(json, { event: 'sca.generate.done', file: existingFile });

  if (!json) {
    console.log('');
    console.log(`SCA updated: ${existingFile}`);
    console.log(`  Controls   : ${controls.length}`);
    console.log(`  Coverage   : ${stats.coverage}%`);
    console.log('');
    console.log('Review [VERIFY] markers — these cells require human judgment or LLM review.');
    console.log('(LLM auto-fill is planned for v0.2; current output is evidence-grounded stubs.)');
    console.log('');
  }
}

// ── sca pdf ───────────────────────────────────────────────────────────────────

/**
 * Render the latest SCA for a surface to PDF via puppeteer-core.
 *
 * @param {string} surface
 * @param {{
 *   dryRun  : boolean,
 *   config  : string|undefined,
 *   json    : boolean,
 *   cwd     : string,
 * }} opts
 */
export async function runScaPdf(surface, opts = {}) {
  const {
    dryRun = false,
    json = false,
    cwd = process.cwd(),
  } = opts;

  validateSurface(surface);

  const cfg = await _loadConfig(opts.config, cwd);
  const abs = (rel) => path.resolve(cwd, rel);

  const validationsDir = abs(path.join(cfg.validationsRoot, surface));
  const existingFile = _findLatestScaFile(validationsDir, surface);

  if (!existingFile) {
    throw exitError(
      `No SCA file found for surface "${surface}" in ${validationsDir}.\n` +
        `Run: branchnux sca init ${surface}`,
      2,
    );
  }

  // Check puppeteer-core availability
  let puppeteer;
  try {
    puppeteer = await import('puppeteer-core');
  } catch {
    // Not installed — inform user
    if (!json) {
      console.log('');
      console.log('puppeteer-core is not installed (optional dependency).');
      console.log('Install it to enable PDF generation:');
      console.log('  npm install puppeteer-core');
      console.log('');
      console.log(`SCA markdown is at: ${existingFile}`);
      console.log('You can also render it manually with pandoc:');
      console.log(`  pandoc "${existingFile}" -o "${existingFile.replace(/\.md$/, '.pdf')}"`);
      console.log('');
    }
    log(json, {
      event: 'sca.pdf.unavailable',
      reason: 'puppeteer-core not installed',
      mdPath: existingFile,
    });
    return;
  }

  if (dryRun) {
    log(json, { event: 'sca.pdf.dryRun', would: 'render PDF', source: existingFile });
    if (!json) console.log(`[dry-run] Would render PDF from: ${existingFile}`);
    return;
  }

  // Convert markdown to HTML first (using marked if available, else raw).
  // Sanitize the rendered HTML with DOMPurify before feeding it to puppeteer:
  // marked v12 passes inline HTML through verbatim, so a malicious SCA author
  // could embed <script>, <img onerror=...>, or <iframe src="file://..."> and
  // have it execute at PDF render time inside headless Chromium.
  let marked;
  try {
    marked = (await import('marked')).marked;
  } catch {
    // Non-fatal — use raw wrapping
  }

  // DOMPurify is a runtime dep — always available.
  const { default: DOMPurify } = await import('isomorphic-dompurify');

  const mdContent = fs.readFileSync(existingFile, 'utf-8');
  const rawHtml = marked
    ? marked.parse(mdContent, { gfm: true, breaks: false })
    : `<pre>${mdContent}</pre>`;

  // Strip dangerous elements/attributes while preserving everything a legitimate
  // SCA document needs: headings, paragraphs, tables, code blocks, links, images.
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'div', 'span',
      'strong', 'em', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'id', 'class'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data:image\/(?:png|jpeg|gif|webp)):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    // Layout CSS lives in _wrapHtml; never accept <style> or inline style= from
    // user-authored markdown — CSS-attribute-selector exfiltration vector at
    // PDF render time, plus @import url(file:///...) reads at chromium load.
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style'],
    FORBID_ATTR: ['style', 'onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'srcset'],
  });

  const html = _wrapHtml(safeHtml, `SCA — ${surface}`);

  const pdfPath = existingFile.replace(/\.md$/, '.pdf');

  // SEC-F6: try with sandbox first; fall back with warning in rootless envs.
  const chromePath = process.env.CHROME_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;

  let browser;
  try {
    browser = await puppeteer.default.launch({
      executablePath: chromePath,
      headless: true,
    });
  } catch (_sandboxErr) {
    process.stderr.write(
      '[branchnux] WARNING: launching puppeteer with --no-sandbox ' +
      '(rootless env detected). Do NOT run untrusted .md content through this tool.\n',
    );
    try {
      browser = await puppeteer.default.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch (err) {
      throw exitError(
        `PDF render failed: ${err.message}\n` +
          `Set CHROME_PATH env var to the path of your Chrome/Chromium executable.`,
        1,
      );
    }
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '25mm', right: '20mm', bottom: '25mm', left: '20mm' },
      printBackground: true,
    });
    await browser.close();

    log(json, { event: 'sca.pdf.done', path: pdfPath });
    if (!json) console.log(`\nPDF rendered: ${pdfPath}\n`);
  } catch (err) {
    try { await browser.close(); } catch { /* ignore close error */ }
    throw exitError(
      `PDF render failed: ${err.message}\n` +
        `Set CHROME_PATH env var to the path of your Chrome/Chromium executable.`,
      1,
    );
  }
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

/**
 * Render a fully-generated SCA markdown document with evidence filled in.
 * [VERIFY] marks any cell that would require LLM judgment.
 *
 * TODO (v0.2): Replace [VERIFY] stubs with Claude API calls using the
 * evidence context (R-ID + test results + control spec) as the prompt.
 */
function _renderScaGenerate({
  surface,
  date,
  standardsVersion,
  industry,
  controls,
  signOffRoles,
  requirements,
  graph,
  stats,
  humanSections,
}) {
  const rIds = requirements.map((r) => r.id);
  const lines = [];

  // Frontmatter
  lines.push('---');
  lines.push(`surface: ${surface}`);
  lines.push(`generated: ${date}`);
  lines.push(`standards_version: ${standardsVersion}`);
  lines.push(`industry: ${industry}`);
  lines.push(`control_count: ${controls.length}`);
  lines.push(`coverage_pct: ${stats.coverage}`);
  lines.push('---');
  lines.push('');

  lines.push(`# Security Control Assessment — ${surface}`);
  lines.push('');
  lines.push(`**Surface:** ${surface}  `);
  lines.push(`**Generated:** ${date}  `);
  lines.push(`**Standards:** ${industry} (${controls.length} controls)  `);
  lines.push(`**Coverage:** ${stats.coverage}%`);
  lines.push('');

  // ── Section 1: Executive Summary ──────────────────────────────────────────
  lines.push('<!-- branchnux:section exec-summary begin -->');
  const existingExec = humanSections.get('exec-summary');
  if (existingExec) {
    lines.push(existingExec);
  } else {
    lines.push('## 1. Executive Summary');
    lines.push('');
    lines.push(`- **Total controls assessed:** ${controls.length}`);
    lines.push(`- **Requirements covered:** ${stats.totalRIds}`);
    lines.push(`- **Test coverage:** ${stats.withTests}/${stats.totalRIds} (${stats.coverage}%)`);
    lines.push(`- **Declined-by-design:** [VERIFY] — review Section 6`);
    lines.push('');
    lines.push('> [VERIFY] — Summarise overall risk posture once controls are reviewed.');
  }
  lines.push('<!-- branchnux:section exec-summary end -->');
  lines.push('');

  // ── Section 2: Methodology ────────────────────────────────────────────────
  lines.push('<!-- branchnux:section methodology begin -->');
  const existingMeth = humanSections.get('methodology');
  if (existingMeth) {
    lines.push(existingMeth);
  } else {
    lines.push('## 2. Methodology');
    lines.push('');
    lines.push('This assessment follows a 5-layer mapping chain:');
    lines.push('');
    lines.push('1. **Requirement (R-XX)** — functional/non-functional spec');
    lines.push('2. **Sprint evidence** — sprint-log SPRINT_SUMMARY.md references');
    lines.push('3. **Code annotation** — inline `// R-XX` markers in source');
    lines.push('4. **Test evidence** — test-plan.md + Playwright spec coverage');
    lines.push('5. **Control mapping** — industry standard control (ASVS / WCAG / NIST / etc.)');
    lines.push('');
    lines.push(`Standards profile: \`${industry}\` (version ${standardsVersion})`);
  }
  lines.push('<!-- branchnux:section methodology end -->');
  lines.push('');

  // ── Section 3: Per-Control Inventory ─────────────────────────────────────
  lines.push('## 3. Per-Control Inventory');
  lines.push('');
  lines.push('> Human-edited **Operational notes** survive regeneration inside the row markers.');
  lines.push('> **[VERIFY]** marks cells that require human review or LLM-assisted fill (planned v0.2).');
  lines.push('');
  lines.push('| Control ID | Function | Specification | Implementation | Tests | Regulatory Basis | Operational Notes |');
  lines.push('|------------|----------|---------------|----------------|-------|-----------------|-------------------|');

  for (const ctrl of controls) {
    const ctrlRIds = rIds.filter((rid) => {
      const ev = graph.findEvidence(rid);
      // Control applies if any R-ID has code or test evidence
      return ev.code.length > 0 || ev.tests.length > 0;
    });

    const implCell = ctrlRIds.length > 0
      ? ctrlRIds.slice(0, 3).join(', ') + (ctrlRIds.length > 3 ? ` *(+${ctrlRIds.length - 3})*` : '')
      : '[VERIFY]';

    const testsCell = stats.withTests > 0
      ? `${stats.withTests} R-IDs have test evidence`
      : '[VERIFY]';

    const existingCtrlNote = humanSections.get(`ctrl-note-${ctrl.id}`) ?? '';

    lines.push(`<!-- branchnux:row ctrl-${ctrl.id} begin -->`);
    lines.push(
      `| ${ctrl.id} | ${ctrl.name} | ${ctrl.description.slice(0, 80)}… | ${implCell} | ${testsCell} | ${(ctrl.references ?? []).join(', ')} | ${existingCtrlNote || '[VERIFY]'} |`,
    );
    lines.push(`<!-- branchnux:row ctrl-${ctrl.id} end -->`);
  }

  lines.push('');

  // ── Section 4: Banking-Standards Alignment Matrix ─────────────────────────
  lines.push('## 4. Standards Alignment Matrix');
  lines.push('');
  const families = [...new Set((controls ?? []).map((c) => c.family ?? 'General'))];
  const colHeaders = families.map((f) => f.split(' — ')[0] ?? f);
  lines.push(`| R-ID | ${colHeaders.join(' | ')} |`);
  lines.push(`|------|${colHeaders.map(() => '------').join('|')}|`);

  for (const req of requirements.slice(0, 20)) {  // Cap at 20 for readability
    const ev = graph.findEvidence(req.id);
    const hasCoverage = ev.code.length > 0 || ev.tests.length > 0;
    const row = families.map(() => (hasCoverage ? 'PASS' : '[VERIFY]'));
    lines.push(`| ${req.id} | ${row.join(' | ')} |`);
  }
  if (requirements.length > 20) {
    lines.push(`| *(${requirements.length - 20} more)* | — |`);
  }
  lines.push('');

  // ── Section 5: Threat Coverage Matrix ────────────────────────────────────
  lines.push('<!-- branchnux:section threat-matrix begin -->');
  const existingThreat = humanSections.get('threat-matrix');
  if (existingThreat) {
    lines.push(existingThreat);
  } else {
    lines.push('## 5. Threat Coverage Matrix');
    lines.push('');
    lines.push('| Attack Scenario | Defending Controls | Test Evidence |');
    lines.push('|-----------------|--------------------|---------------|');
    lines.push('| Credential stuffing | ASVS-V2.2.1 (anti-automation) | [VERIFY] |');
    lines.push('| Session fixation | ASVS-V3.1.1, ASVS-V3.3.1 | [VERIFY] |');
    lines.push('| XSS injection | ASVS-V5.2.3 (output encoding) | [VERIFY] |');
    lines.push('| Sensitive data exposure | ASVS-V8.1.3 | [VERIFY] |');
    lines.push('| IDOR | ASVS-V4.1.2 | [VERIFY] |');
    lines.push('');
    lines.push('> [VERIFY] — Map attack scenarios to test evidence from testing-log/.');
  }
  lines.push('<!-- branchnux:section threat-matrix end -->');
  lines.push('');

  // ── Section 6: Declined-by-Design ────────────────────────────────────────
  lines.push('<!-- branchnux:section declined begin -->');
  const existingDeclined = humanSections.get('declined');
  if (existingDeclined) {
    lines.push(existingDeclined);
  } else {
    lines.push('## 6. Declined-by-Design Specifications');
    lines.push('');
    lines.push('> [VERIFY] — List any controls explicitly not implemented and document rationale.');
    lines.push('');
    lines.push('| Control | Rationale | Compensating Control |');
    lines.push('|---------|-----------|----------------------|');
    lines.push('| *(none identified)* | — | — |');
  }
  lines.push('<!-- branchnux:section declined end -->');
  lines.push('');

  // ── Section 7: Open Items ─────────────────────────────────────────────────
  lines.push('<!-- branchnux:section open-items begin -->');
  const existingOpen = humanSections.get('open-items');
  if (existingOpen) {
    lines.push(existingOpen);
  } else {
    lines.push('## 7. Open Items & Known Gaps');
    lines.push('');
    lines.push('### 7.1 PATCHED');
    lines.push('');
    lines.push('| Item | Resolution | Date |');
    lines.push('|------|-----------|------|');
    lines.push('| *(none)* | — | — |');
    lines.push('');
    lines.push('### 7.2 OPEN');
    lines.push('');
    lines.push('| Item | Owner | Target Date |');
    lines.push('|------|-------|------------|');
    lines.push('| [VERIFY] | — | — |');
    lines.push('');
    lines.push('### 7.3 Adjacent-Surface Gaps');
    lines.push('');
    lines.push('> [VERIFY] — Identify gaps that span multiple surfaces (e.g., shared auth layer).');
  }
  lines.push('<!-- branchnux:section open-items end -->');
  lines.push('');

  // ── Section 8: Sign-Off ───────────────────────────────────────────────────
  lines.push('<!-- branchnux:section sign-off begin -->');
  const existingSignOff = humanSections.get('sign-off');
  if (existingSignOff) {
    lines.push(existingSignOff);
  } else {
    lines.push('## 8. Sign-Off');
    lines.push('');
    lines.push('| Role | Name | Signature | Date |');
    lines.push('|------|------|-----------|------|');
    for (const role of (signOffRoles ?? ['Project Owner', 'Reviewer'])) {
      lines.push(`| ${role} | [VERIFY] | | |`);
    }
  }
  lines.push('<!-- branchnux:section sign-off end -->');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*Generated by `branchnux sca generate`. Re-run to update evidence columns.*');
  lines.push('*Human-edited sections (marked with `<!-- branchnux:section ... -->`) survive regeneration.*');
  lines.push('*`[VERIFY]` marks cells that require human review. LLM auto-fill is planned for v0.2.*');

  return lines.join('\n');
}

// ── HTML wrapper for PDF ──────────────────────────────────────────────────────

function _wrapHtml(body, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
  h1 { border-bottom: 2px solid #1a1a1a; padding-bottom: 0.5rem; }
  h2 { border-bottom: 1px solid #ccc; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; }
  code { background: #f0f0f0; padding: 0.1em 0.3em; border-radius: 3px; }
  pre { background: #f8f8f8; padding: 1rem; overflow-x: auto; }
  blockquote { border-left: 3px solid #ccc; margin: 0; padding-left: 1rem; color: #555; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Extract human-edited sections from existing SCA content.
 * Returns Map<sectionKey, content-between-markers>
 */
function _extractHumanSections(content) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!content) return map;

  const sectionRe = /<!-- branchnux:section ([\w-]+) begin -->\n([\s\S]*?)<!-- branchnux:section \1 end -->/g;
  let m;
  while ((m = sectionRe.exec(content)) !== null) {
    map.set(m[1], m[2].trimEnd());
  }

  // Also extract control-level notes from row markers
  const rowRe = /<!-- branchnux:row ctrl-([\w.-]+) begin -->\n\|(.+)\|\n<!-- branchnux:row ctrl-\1 end -->/g;
  while ((m = rowRe.exec(content)) !== null) {
    const ctrlId = m[1];
    const cells = m[2].split('|');
    // Notes is last column
    const note = cells[cells.length - 1]?.trim() ?? '';
    if (note && note !== '[VERIFY]') {
      map.set(`ctrl-note-${ctrlId}`, note);
    }
  }

  return map;
}

/**
 * Find the latest SCA markdown file in the validations directory for a surface.
 * Prefers the lexicographically last file (latest date).
 */
function _findLatestScaFile(dir, _surface) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.startsWith('v'))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(dir, files[0]) : null;
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

async function _loadConfig(configPath, cwd) {
  let cfg = { ...DEFAULTS };
  if (configPath) {
    try {
      const resolvedPath = _validateConfigPath(configPath);
      // Use pathToFileURL so Windows absolute paths work with ESM import()
      const userCfg = (await import(pathToFileURL(resolvedPath).href)).default ?? {};
      cfg = { ...cfg, ...(userCfg.sca ?? {}) };
    } catch (err) {
      if (err.exitCode !== undefined) throw err; // re-throw our own structured errors
      throw exitError(`Failed to load config from ${configPath}: ${err.message}`, 1);
    }
  }
  return cfg;
}

function _loadIndustryConfig(industry) {
  const cfgPath = path.join(INDUSTRY_STANDARDS_DIR, `${industry}.json`);
  if (!fs.existsSync(cfgPath)) {
    // Fall back to general
    const fallback = path.join(INDUSTRY_STANDARDS_DIR, 'general.json');
    if (fs.existsSync(fallback)) {
      return JSON.parse(fs.readFileSync(fallback, 'utf-8'));
    }
    return null;
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
}

function _safeParseRequirements(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return parseRequirements(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

async function _loadSprints(sprintLogGlob, cwd, json) {
  const files = await glob(sprintLogGlob, { cwd, absolute: true });
  const sprints = [];
  for (const sf of files) {
    try {
      const content = fs.readFileSync(sf, 'utf-8');
      sprints.push({ path: sf, ...parseSprintSummary(content) });
    } catch {
      // Non-fatal
    }
  }
  return sprints;
}

async function _loadTestPlans(testGlobs, cwd) {
  const files = await glob(testGlobs, { cwd, absolute: true, ignore: ['**/node_modules/**'] });
  const plans = [];
  for (const tf of files) {
    try {
      const content = fs.readFileSync(tf, 'utf-8');
      const parsed = parseTestPlan(content);
      if (parsed.rIds.length > 0) plans.push({ path: tf, ...parsed });
    } catch {
      // Non-fatal
    }
  }
  return plans;
}

async function _grepForRIds(globs, cwd) {
  const RID_RE = /\bR-\d{2,4}[A-Z]?\b/g;
  const files = await glob(globs, { cwd, absolute: true, ignore: ['**/node_modules/**', '**/.git/**'] });
  const annotationLines = [];
  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (RID_RE.test(lines[i])) annotationLines.push({ file, lineNumber: i + 1, text: lines[i] });
      RID_RE.lastIndex = 0;
    }
  }
  return parseCodeAnnotations(annotationLines);
}

function applySubstitutions(template, subs) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(subs, key) ? subs[key] : match,
  );
}

function exitError(message, code) {
  const err = new Error(message);
  err.exitCode = code;
  return err;
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

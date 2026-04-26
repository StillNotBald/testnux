// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/report.mjs
 *
 * Implements `testnux report <folder>`.
 *
 * v0.1 STUB — the full generator has been proven in production on 33+ page test
 * plans. Port the proven generator implementation.
 *
 * The reference generator takes test-plan.md + execution-log.md (or execution-log-auto.md
 * as a fallback) and produces:
 *
 *   - report.xlsx — TC matrix as structured spreadsheet (one sheet per tab:
 *                   All TCs, PASS, FAIL, BLOCKED-*, SKIPPED)
 *   - report.html — self-contained single-file HTML with:
 *                     · TOC with anchor links (IDs only in "All TCs" tab to
 *                       avoid duplicate-DOM-ID bug — lesson baked in)
 *                     · Tabbed view (Pass / Fail / Blocked / Skipped)
 *                     · Per-TC cards with G/W/T, evidence screenshot embeds,
 *                       standards-alignment badges
 *                     · "PLAN ONLY" header badge when --plan-only flag is set
 *                       (renders without Result column)
 *                     · Industry-specific standards footer per `industry` field
 *
 * Port checklist (when completing this stub for v0.2):
 *   [ ] Extract the parser (test-plan.md → TcRecord[]) to src/parsers/test-plan.mjs
 *   [ ] Extract execution-log parser to src/parsers/execution-log.mjs
 *       (prefer execution-log-auto.md; fall back to execution-log.md; warn if both missing)
 *   [ ] Port the XLSX renderer to src/renderers/xlsx.mjs (use exceljs, not xlsx,
 *       to avoid the prototype-pollution CVE in the older package)
 *   [ ] Port the HTML renderer to src/renderers/html.mjs — self-contained with
 *       inlined CSS + base64 evidence screenshots
 *   [ ] Respect --plan-only: render without Result column + emit "PLAN ONLY" badge
 *   [ ] Respect --open: use `open` (npm) or `start`/`xdg-open` to open HTML
 *   [ ] Emit exit code 4 on render failure
 *
 * See also: testnux-launch-plan.md § Phase 2 + § v0.2 for full roadmap.
 *
 * v0.1 placeholder — see launch plan v0.2 for completion.
 */

/**
 * @param {string} folder   Absolute or relative path to the test-pass folder
 * @param {{ planOnly: boolean, open: boolean, json: boolean }} opts
 */
export async function runReport(folder, opts = {}) {
  const { planOnly = false, open: openBrowser = false, json = false } = opts;

  const message =
    'v0.1 stub — report generator implementation pending. ' +
    'See src/commands/report.mjs for the full porting checklist.';

  if (json) {
    process.stdout.write(
      JSON.stringify({
        event: 'report.stub',
        folder,
        planOnly,
        message,
      }) + '\n',
    );
  } else {
    console.log('');
    console.log('⚠️  testnux report — v0.1 stub');
    console.log('');
    console.log('   The report generator has been proven in production but is not yet');
    console.log('   ported to the OSS package. Expected in v0.2.');
    console.log('');
    console.log('   See src/commands/report.mjs for the complete porting checklist.');
    console.log('');
    console.log('   When complete, this command will produce:');
    console.log(`     ${folder}/report.xlsx`);
    console.log(`     ${folder}/report.html`);
    if (planOnly) {
      console.log('   (PLAN ONLY mode — no Result column)');
    }
    console.log('');
  }

  // Exit 0 — stub is intentional, not an error
}

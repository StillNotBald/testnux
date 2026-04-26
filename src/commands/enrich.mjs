// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/enrich.mjs
 *
 * Implements `testnux enrich <slug>`.
 *
 * v0.1 STUB — describes what the v0.2 LLM agent will do and prints the
 * append-only section template. No LLM calls are made.
 *
 * v0.2 plan:
 *   1. Read testing-log/<date>_<slug>/test-plan.md.
 *   2. Run three parallel enrichment passes:
 *      a. Design review: visual hierarchy, typography, color contrast (WCAG)
 *      b. QA structural analysis: missing edge cases, boundary values, error paths
 *      c. Graph context: cross-surface dependency TCs (e.g. login TC needed for
 *         checkout surface)
 *   3. Each pass appends suggested TCs to the plan using append-only discipline:
 *      - NEVER modifies content above the <!-- testnux:enrich:start --> marker
 *      - Appends inside <!-- testnux:enrich:start / end --> section
 *      - All appended TCs carry [VERIFY] markers
 *   4. Cost: ~$0.40–$1.20 per enrichment pass (3 passes). Requires CLAUDE_API_KEY.
 *
 * APPEND-ONLY DISCIPLINE:
 *   The enrich agent operates in append-only mode. It NEVER modifies content
 *   above the <!-- testnux:enrich:start --> marker. This preserves all
 *   human-curated test plans from accidental overwrite.
 *
 *   Append section markers (added to test-plan.md by `enrich`):
 *     <!-- testnux:enrich:start -->
 *     <!-- DO NOT MODIFY ABOVE THIS LINE — human-curated content -->
 *     [suggested TCs appended here]
 *     <!-- testnux:enrich:end -->
 *
 * =============================================================================
 * V0.2 PROMPT TEMPLATE — DESIGN REVIEW PASS (for implementers):
 * =============================================================================
 *
 * SYSTEM:
 *   You are a senior UI/UX auditor specializing in WCAG 2.2 AA, APCA contrast,
 *   and regulated web application design standards. You review test plans and
 *   suggest MISSING test cases that cover visual correctness, accessibility, and
 *   design token compliance. You ONLY suggest new TCs — you never modify existing
 *   ones. You always add [VERIFY] to every suggested TC.
 *
 * USER:
 *   Surface slug: {{slug}}
 *   Page URL: {{url}}
 *   Existing test plan (DO NOT MODIFY — read only):
 *   ---
 *   {{test_plan_md}}
 *   ---
 *   DOM snapshot / design tokens context:
 *   {{dom_snapshot_or_NONE}}
 *
 *   TASK: Identify MISSING accessibility and design-quality test cases.
 *
 *   Look specifically for gaps in:
 *   - Color contrast (WCAG 2.2 SC 1.4.3 — 4.5:1 normal text, 3:1 large)
 *   - Focus indicator visibility (WCAG 2.2 SC 2.4.11 — 2px minimum)
 *   - Motion / animation (WCAG 2.2 SC 2.3.3 — prefers-reduced-motion)
 *   - Touch target size (WCAG 2.2 SC 2.5.8 — 24×24 CSS px minimum)
 *   - Reflow (WCAG 2.2 SC 1.4.10 — 320px viewport, horizontal scroll)
 *   - Semantic heading hierarchy (WCAG 2.2 SC 1.3.1)
 *   - Form label association (WCAG 2.2 SC 1.3.1 + 4.1.2)
 *   - Error identification and description (WCAG 2.2 SC 3.3.1 + 3.3.2)
 *   - Skip navigation / landmark regions (WCAG 2.2 SC 2.4.1)
 *   - Design token consistency (correct color, spacing, font usage)
 *
 *   OUTPUT FORMAT:
 *   Emit ONLY the new TCs to be appended. Do not repeat existing TCs.
 *   Use TC-A01, TC-A02, ... prefix for accessibility TCs.
 *   Use TC-D01, TC-D02, ... for design/visual TCs.
 *   Each TC must follow the standard format (Priority, Category, Given/When/Then).
 *   Every TC must end with: > [VERIFY] Review before adding to the execution log.
 *
 * =============================================================================
 * V0.2 PROMPT TEMPLATE — QA STRUCTURAL PASS (for implementers):
 * =============================================================================
 *
 * SYSTEM:
 *   You are a senior QA engineer specializing in equivalence partitioning,
 *   boundary value analysis, and exploratory testing heuristics (SFDIPOT,
 *   CRUD matrix, error-guessing). You review existing test plans for STRUCTURAL
 *   GAPS — missing boundary values, untested error conditions, missing CRUD
 *   coverage, missing concurrency edge cases. You ONLY suggest new TCs.
 *
 * USER:
 *   Surface slug: {{slug}}
 *   Existing test plan (read only):
 *   ---
 *   {{test_plan_md}}
 *   ---
 *
 *   TASK: Identify structural gaps using the following heuristics:
 *
 *   1. BOUNDARY VALUES — for every input, are min/max/min-1/max+1 tested?
 *   2. EQUIVALENCE CLASSES — are both valid and invalid classes tested?
 *   3. CRUD MATRIX — create/read/update/delete for every data entity
 *   4. ERROR CONDITIONS — network failure, 422 validation, 500 server error
 *   5. CONCURRENCY — simultaneous submissions, double-click, race conditions
 *   6. STATE TRANSITIONS — incomplete → submitted → approved → rejected flows
 *   7. PERMISSION MATRIX — each action × each role (admin/user/viewer/anon)
 *   8. INJECTION — XSS, SQLi, path traversal in all free-text inputs (P1)
 *
 *   OUTPUT FORMAT:
 *   Emit ONLY the new TCs. Use TC-E01, TC-E02, ... prefix.
 *   Every TC must end with: > [VERIFY] Review before adding to the execution log.
 *
 * =============================================================================
 * V0.2 PROMPT TEMPLATE — GRAPH CONTEXT PASS (for implementers):
 * =============================================================================
 *
 * SYSTEM:
 *   You are a QA architect reviewing cross-surface dependencies in a web
 *   application. You identify test cases on THIS surface that depend on other
 *   surfaces working correctly, and vice versa. You suggest integration-level
 *   TCs that are otherwise invisible in per-surface test plans.
 *
 * USER:
 *   Surface slug: {{slug}}
 *   Application surface graph (from graphify):
 *   ---
 *   {{surface_graph_json}}
 *   ---
 *   Existing test plan for {{slug}} (read only):
 *   ---
 *   {{test_plan_md}}
 *   ---
 *
 *   TASK: Identify missing cross-surface integration test cases.
 *
 *   Look for:
 *   - Prerequisites: what other surfaces must work for this one? (e.g. login)
 *   - Data flows: what data created here is consumed downstream?
 *   - Shared state: session, cart, user profile, notifications
 *   - Rollback paths: if this surface fails mid-flow, is state consistent?
 *
 *   OUTPUT FORMAT:
 *   Use TC-I01, TC-I02, ... prefix for integration TCs.
 *   Every TC must end with: > [VERIFY] Review before adding to the execution log.
 *
 * =============================================================================
 */

import path from 'path';
import fs from 'fs';

// ── Section markers ──────────────────────────────────────────────────────────

export const ENRICH_START_MARKER = '<!-- testnux:enrich:start -->';
export const ENRICH_GUARD_MARKER = '<!-- DO NOT MODIFY ABOVE THIS LINE — human-curated content -->';
export const ENRICH_END_MARKER   = '<!-- testnux:enrich:end -->';

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} slug  Surface slug (e.g. "login")
 * @param {{
 *   url:      string | undefined,
 *   passes:   string[],
 *   out:      string | undefined,
 *   json:     boolean,
 * }} opts
 */
export async function runEnrich(slug, opts = {}) {
  const {
    url    = undefined,
    passes = ['design', 'qa', 'graph'],
    out    = './testing-log',
    json   = false,
  } = opts;

  log(json, { event: 'enrich.stub', slug, passes, version: 'v0.1' });

  const testPlanFile = findTestPlanFile(slug, out);

  if (!json) {
    console.log('');
    console.log('  testnux enrich — v0.1 stub');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  Slug   : ${slug}`);
    console.log(`  Passes : ${passes.join(', ')}`);
    if (url) console.log(`  URL    : ${url}`);
    console.log('');
    console.log('  In v0.2, this command will run 3 parallel enrichment passes:');
    console.log('');
    console.log('  1. DESIGN REVIEW pass — finds missing WCAG/visual TCs:');
    console.log('     color contrast, focus indicators, touch targets, reflow,');
    console.log('     heading hierarchy, form labels, error identification.');
    console.log('');
    console.log('  2. QA STRUCTURAL pass — finds missing edge cases:');
    console.log('     boundary values, equivalence classes, CRUD matrix,');
    console.log('     error conditions, concurrency, permission matrix.');
    console.log('');
    console.log('  3. GRAPH CONTEXT pass — finds cross-surface integration TCs:');
    console.log('     prerequisites, data flows, shared state, rollback paths.');
    console.log('');
    console.log('  APPEND-ONLY DISCIPLINE:');
    console.log('  All suggested TCs are written inside a bounded section:');
    console.log(`    ${ENRICH_START_MARKER}`);
    console.log(`    ${ENRICH_GUARD_MARKER}`);
    console.log('    [suggested TCs here]');
    console.log(`    ${ENRICH_END_MARKER}`);
    console.log('  Content ABOVE the start marker is NEVER modified.');
    console.log('');
    console.log('  Cost: ~$0.40–$1.20 per enrichment pass (3 passes total).');
    console.log('  Requires: CLAUDE_API_KEY environment variable.');
    console.log('');

    if (testPlanFile) {
      console.log(`  Found test plan: ${testPlanFile}`);
      console.log('');
      console.log('  For now, manually add the enrich section markers to your plan:');
      console.log('');
      console.log(`    ${ENRICH_START_MARKER}`);
      console.log(`    ${ENRICH_GUARD_MARKER}`);
      console.log('    <!-- Add suggested TCs below -->');
      console.log(`    ${ENRICH_END_MARKER}`);
      console.log('');
      console.log('  Then manually add TCs for the gap categories listed above.');

      // Optionally add the markers to the test plan
      addEnrichMarkersIfMissing(testPlanFile, json);
    } else {
      console.log(`  No test plan found for slug "${slug}".`);
      console.log(`  Run: testnux plan ${slug}  (or init ${slug} to scaffold)`);
    }

    console.log('');
    console.log('  See the prompt templates in src/commands/enrich.mjs for the');
    console.log('  exact Claude prompts that v0.2 will use for each pass.');
    console.log('');
  } else {
    process.stdout.write(
      JSON.stringify({
        event:         'enrich.stub.done',
        slug,
        passes,
        testPlanFile:  testPlanFile ?? null,
        message:       'v0.1 stub — see v0.2 roadmap for LLM-powered enrichment',
      }) + '\n',
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Add append-only enrich section markers to an existing test plan if not present.
 * This is purely additive — never modifies existing content.
 */
function addEnrichMarkersIfMissing(testPlanFile, json) {
  try {
    const raw = fs.readFileSync(testPlanFile, 'utf-8');
    if (raw.includes(ENRICH_START_MARKER)) {
      if (!json) console.log('  Enrich section markers already present — skipping.');
      return;
    }

    const appendix = [
      '',
      '---',
      '',
      ENRICH_START_MARKER,
      ENRICH_GUARD_MARKER,
      '',
      '<!-- Suggested TCs will be appended here by `testnux enrich`. -->',
      '<!-- In v0.1, add them manually. Use TC-A01/TC-E01/TC-I01 prefixes. -->',
      '',
      ENRICH_END_MARKER,
      '',
    ].join('\n');

    fs.appendFileSync(testPlanFile, appendix, 'utf-8');
    if (!json) console.log('  Appended enrich section markers to test plan.');
  } catch (err) {
    if (!json) console.warn(`  Warning: could not append markers — ${err.message}`);
  }
}

function findTestPlanFile(slug, outDir) {
  const testingLog = path.resolve(outDir);
  if (!fs.existsSync(testingLog)) return null;

  for (const entry of fs.readdirSync(testingLog).sort().reverse()) {
    if (entry.includes(slug)) {
      const f = path.join(testingLog, entry, 'test-plan.md');
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

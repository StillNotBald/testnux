// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/plan.mjs
 *
 * Implements `testnux plan <slug>`.
 *
 * v0.1 STUB — describes what the v0.2 LLM agent will do and guides the user
 * to the manual equivalent. No LLM calls are made.
 *
 * v0.2 plan:
 *   1. Locate <slug>-scenarios.md (or testing-log/<date>_<slug>/scenarios.md).
 *   2. Optionally: take a DOM snapshot of the live page (if --url provided).
 *   3. Send scenarios + DOM context to Claude with the prompt template below.
 *   4. Receive a fully structured test-plan.md following the TestNUX schema.
 *   5. Write to testing-log/<date>_<slug>/test-plan.md.
 *   6. All LLM-generated cells get [VERIFY] markers.
 *
 * Cost estimate (v0.2): ~$0.30–$0.80 per page. Requires CLAUDE_API_KEY.
 *
 * =============================================================================
 * V0.2 PROMPT TEMPLATE (for implementers):
 * =============================================================================
 *
 * SYSTEM:
 *   You are a senior QA engineer who writes structured test plans for regulated
 *   web applications. Your output must conform exactly to the TestNUX
 *   test-plan.md schema (YAML frontmatter + markdown body). You write
 *   deterministically: same input → same structure every time.
 *   You never invent requirements. If you cannot map a scenario to an R-ID,
 *   you emit r_ids: [] and add [VERIFY] for the human to fill in.
 *   Every cell you generate that requires human verification carries [VERIFY].
 *
 * USER:
 *   Surface slug: {{slug}}
 *   Industry: {{industry}}
 *   R-IDs in scope (from REQUIREMENTS.md grep): {{r_ids_json}}
 *
 *   Scenarios document:
 *   ---
 *   {{scenarios_md}}
 *   ---
 *
 *   DOM context (optional — omit if not captured):
 *   {{dom_snapshot_or_NONE}}
 *
 *   TASK: Convert the scenarios above into a TestNUX test-plan.md.
 *
 *   OUTPUT REQUIREMENTS:
 *
 *   1. YAML frontmatter (required keys):
 *      ---
 *      slug: {{slug}}
 *      title: [human-readable page title]
 *      industry: {{industry}}
 *      status: DRAFT
 *      r_ids: [R-XX, ...]   # map each TC to requirements; use [] if unknown
 *      tc_prefix: {{TC_PREFIX}}  # from slug: "login" → "LOGIN"
 *      standards:
 *        - [e.g. "OWASP ASVS 4.0 v2.1.1"]
 *      review_required: true
 *      ---
 *
 *   2. Body: one section per TC-XX from the scenarios document.
 *      Format each TC as:
 *
 *      ## {{TC_PREFIX}}-01 — [Title from scenario]
 *
 *      | Field       | Value |
 *      |-------------|-------|
 *      | R-ID        | R-XX [VERIFY] |
 *      | Priority    | P0 / P1 / P2 |
 *      | Category    | FUNCTIONAL / SECURITY / ACCESSIBILITY / PERFORMANCE / ERROR-HANDLING |
 *      | Standards   | [NIST / OWASP / WCAG refs] |
 *      | Status      | DRAFT |
 *
 *      **Preconditions**
 *      - [list]
 *
 *      **Steps**
 *      1. [step]
 *      2. [step]
 *
 *      **Expected Result**
 *      [expected outcome]
 *
 *      **Evidence**
 *      - [ ] Screenshot: `evidence/{{TC_PREFIX}}-01-[descriptor].png`
 *
 *      > [VERIFY] Confirm R-ID mapping and expected result before execution.
 *
 *   3. After all TCs, add a ## Summary section:
 *      - Total TCs: N
 *      - P0: N | P1: N | P2: N
 *      - Standards covered: [list]
 *
 *   CRITICAL RULES:
 *   - Do NOT add TCs not present in the scenarios document.
 *   - Do NOT remove [VERIFY] markers.
 *   - Do NOT invent R-IDs. Use [] and [VERIFY] if mapping is uncertain.
 *   - Preserve Given/When/Then logic but restructure to Steps format.
 *   - Number TCs sequentially: {{TC_PREFIX}}-01, {{TC_PREFIX}}-02, ...
 *
 * =============================================================================
 */

import path from 'path';
import fs from 'fs';

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {string} slug  Surface slug (e.g. "login", "dashboard")
 * @param {{
 *   url:      string | undefined,
 *   industry: string,
 *   out:      string | undefined,
 *   json:     boolean,
 * }} opts
 */
export async function runPlan(slug, opts = {}) {
  const {
    url      = undefined,
    industry = 'general',
    out      = './testing-log',
    json     = false,
  } = opts;

  log(json, { event: 'plan.stub', slug, industry, version: 'v0.1' });

  // Find existing scenarios file
  const scenariosFile = findScenariosFile(slug, out);

  if (!json) {
    console.log('');
    console.log('  testnux plan — v0.1 stub');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log(`  Slug     : ${slug}`);
    console.log(`  Industry : ${industry}`);
    if (url) console.log(`  URL      : ${url}`);
    console.log('');
    console.log('  In v0.2, this command will:');
    console.log('    1. Read scenarios.md (produced by `testnux discover`).');
    console.log('    2. Optionally capture a live DOM snapshot if --url is provided.');
    console.log('    3. Send scenarios + DOM context to Claude with a structured');
    console.log('       prompt that enforces the TestNUX test-plan.md schema.');
    console.log('    4. Write testing-log/<date>_<slug>/test-plan.md with:');
    console.log('       - YAML frontmatter (slug, r_ids, tc_prefix, standards)');
    console.log('       - One section per TC with steps, evidence checklist');
    console.log('       - [VERIFY] markers on every LLM-generated field');
    console.log('    5. Cost: ~$0.30–$0.80 per page. Requires CLAUDE_API_KEY.');
    console.log('');

    if (scenariosFile) {
      console.log(`  Found scenarios file: ${scenariosFile}`);
      console.log('');
      console.log('  For now, run:');
      console.log(`    testnux init ${slug}`);
      console.log('    # then manually populate test-plan.md from your scenarios');
    } else {
      console.log(`  No scenarios file found for slug "${slug}".`);
      console.log('');
      console.log('  Suggested workflow:');
      console.log(`    1. testnux discover <url>   # creates ${slug}-scenarios.md`);
      console.log(`    2. Fill in the scenarios template manually`);
      console.log(`    3. testnux init ${slug}     # scaffolds test-plan.md`);
      console.log(`    4. Populate test-plan.md from your scenarios`);
    }

    console.log('');
    console.log('  See the prompt template in src/commands/plan.mjs for the');
    console.log('  exact Claude prompt that v0.2 will use.');
    console.log('');
  } else {
    process.stdout.write(
      JSON.stringify({
        event:         'plan.stub.done',
        slug,
        industry,
        scenariosFile: scenariosFile ?? null,
        message:       'v0.1 stub — see v0.2 roadmap for LLM-powered plan generation',
      }) + '\n',
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findScenariosFile(slug, outDir) {
  const candidates = [
    path.resolve(`./${slug}-scenarios.md`),
    path.resolve(`./scenarios/${slug}.md`),
  ];

  // Also scan testing-log/ for date-prefixed folders
  const testingLog = path.resolve(outDir);
  if (fs.existsSync(testingLog)) {
    for (const entry of fs.readdirSync(testingLog)) {
      if (entry.includes(slug)) {
        const f = path.join(testingLog, entry, 'scenarios.md');
        candidates.push(f);
      }
    }
  }

  return candidates.find((f) => fs.existsSync(f)) ?? null;
}

function log(json, payload) {
  if (json) process.stdout.write(JSON.stringify(payload) + '\n');
}

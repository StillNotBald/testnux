// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/enrichers/graph-context.mjs
 *
 * Pass 3 — graph-context enricher.
 *
 * Builds the system + user prompts for the cross-surface integration dependency
 * enrichment pass, using sibling test plans as context.
 *
 * Exports:
 *   buildGraphContextPrompt({ slug, currentPlan, siblingPlans })  → { systemPrompt, userPrompt }
 */

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the system + user prompts for the graph-context pass.
 *
 * @param {{
 *   slug:         string,
 *   currentPlan:  string,
 *   siblingPlans: { slug: string, content: string }[],
 * }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildGraphContextPrompt({ slug, currentPlan, siblingPlans }) {
  const hasSiblings = siblingPlans.length > 0;

  const siblingContext = hasSiblings
    ? siblingPlans.map((s) =>
        `### Adjacent surface: ${s.slug}\n\`\`\`markdown\n${s.content.slice(0, 6000)}\n\`\`\``,
      ).join('\n\n')
    : '_(No adjacent test plans were found in the testing-log/ folder.)_';

  const systemPrompt = `You are a QA architect reviewing cross-surface integration dependencies in a web application.
You identify test cases on THIS surface that depend on other surfaces working correctly, and vice versa.
You surface integration-level TCs that are invisible when reviewing a single surface in isolation.

NAMING CONVENTION: Prefix all TC headings with TC-${slug.toUpperCase().slice(0, 8)}-GC- (graph-context).
Example: ## TC-${slug.toUpperCase().slice(0, 8)}-GC-01 — [Title]

FORMAT: Every TC must follow this exact structure:

## TC-XX-GC-NN — [Short descriptive title]
**Priority**: P0 | P1 | P2
**Category**: INTEGRATION | SECURITY | FUNCTIONAL | ERROR-HANDLING
**Surfaces involved**: [this-slug] → [other-slug] (or ← / ↔ for bidirectional)
**Data flow**: [describe what data crosses the surface boundary]

**Given** [precondition — often requires setup on ANOTHER surface]
**When** [action on THIS surface]
**Then** [observable outcome — may span both surfaces]

**Pass criteria**:
- [Measurable criterion 1, may reference data state on another surface]
- [Measurable criterion 2]

> [VERIFY] Confirm cross-surface data flows match the application architecture before execution.

OUTPUT RULES:
- Output ONLY new TCs. No preamble, no prose, no repeating existing TCs.
- Every TC MUST end with the > [VERIFY] blockquote.
- If no adjacent plans are available, still emit TCs for LIKELY integration points based on common
  web application patterns — but mark each with > [VERIFY] No adjacent plan available; inferred from surface name.
- Sequential numbering starting at 01.`;

  const userPrompt = `Surface slug: ${slug}

Existing test plan for "${slug}" (READ-ONLY):
\`\`\`markdown
${currentPlan}
\`\`\`

Adjacent surfaces in testing-log/:
${siblingContext}

TASK: Identify MISSING cross-surface integration test cases.

Work through these categories in order:

1. PREREQUISITES (upstream dependencies)
   - What other surfaces MUST work before a user can reach "${slug}"?
   - Example: if "${slug}" is a settings page, does it require the user to be logged in via an auth surface?
   - TC: auth surface login → navigate to "${slug}" → confirm access granted
   - TC: auth surface session expiry → navigate to "${slug}" → confirm redirect to login

2. DATA FLOWS (what this surface produces / consumes)
   - What data does "${slug}" CREATE that other surfaces will READ?
   - What data does "${slug}" READ that other surfaces have CREATED?
   - TC: create data on surface A → verify it appears correctly on "${slug}"
   - TC: create data on "${slug}" → verify it appears correctly on surface B

3. ROLE BOUNDARIES (authorization across surface pairs)
   - Admin creates X on surface A → standard user on "${slug}" sees only what they should
   - User escalates role → does "${slug}" re-check permissions or cache stale role?

4. IDEMPOTENCY & AUDIT TRAIL
   - Can the same operation be submitted twice (e.g. via browser back or network retry)?
   - Does "${slug}" generate an audit-log entry that is verifiable on an admin/audit surface?
   - TC: submit on "${slug}" → verify audit trail entry on admin surface (if applicable)

5. SHARED STATE (session, cache, notifications)
   - If one tab modifies shared state, does another tab showing "${slug}" reflect it?
   - Does signing out on another tab immediately deny access on "${slug}"?
   - Push notification / real-time update on "${slug}" when another surface triggers an event

6. ROLLBACK & CONSISTENCY
   - If "${slug}" fails mid-flow, is upstream state (created on another surface) left orphaned?
   - TC: simulate failure on "${slug}" → verify no partial state is committed to shared storage

${!hasSiblings ? '\nNOTE: No adjacent test-plan.md files were found. Emit integration TCs based on common patterns for a surface named "' + slug + '" and tag each with [VERIFY] (inferred, not confirmed).' : ''}

Emit ONLY the new TC blocks. Start immediately with ## TC-XX-GC-01.`;

  return { systemPrompt, userPrompt };
}

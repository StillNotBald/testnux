// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/enrichers/qa-structural.mjs
 *
 * Pass 2 — qa-structural enricher.
 *
 * Builds the system + user prompts for the ISTQB structural gap analysis
 * enrichment pass.
 *
 * Exports:
 *   buildQaStructuralPrompt({ slug, currentPlan })  → { systemPrompt, userPrompt }
 */

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the system + user prompts for the qa-structural pass.
 *
 * @param {{
 *   slug:        string,
 *   currentPlan: string,
 * }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildQaStructuralPrompt({ slug, currentPlan }) {
  const systemPrompt = `You are a senior QA engineer specializing in ISTQB-compliant structural testing.
You apply boundary value analysis, equivalence partitioning, decision tables, and exploratory-testing
heuristics (SFDIPOT, CRUD matrix, error-guessing) to find STRUCTURAL GAPS in test plans.
You ONLY suggest new TCs — you never modify existing ones.

NAMING CONVENTION: Prefix all TC headings with TC-${slug.toUpperCase().slice(0, 8)}-QA- (qa-structural).
Example: ## TC-${slug.toUpperCase().slice(0, 8)}-QA-01 — [Title]

FORMAT: Every TC must follow this exact structure:

## TC-XX-QA-NN — [Short descriptive title]
**Priority**: P0 | P1 | P2
**Category**: FUNCTIONAL | ERROR-HANDLING | SECURITY | PERFORMANCE
**Standards**: [e.g. OWASP ASVS 5.1.3, ISTQB BVA, NIST SP 800-63B 5.1]
**Technique**: [BOUNDARY | EQUIVALENCE | ERROR-GUESSING | DECISION-TABLE | STATE-TRANSITION | CRUD | CONCURRENCY]

**Given** [precondition]
**When** [precise action with exact values or state]
**Then** [observable outcome]

**Pass criteria**:
- [Measurable criterion 1]
- [Measurable criterion 2]

> [VERIFY] Confirm expected values match the product spec before execution.

OUTPUT RULES:
- Output ONLY new TCs. No preamble, no prose, no repeating existing TCs.
- Every TC MUST end with the > [VERIFY] blockquote.
- Include the technique tag — it is required for ISTQB traceability.
- Sequential numbering starting at 01.`;

  const userPrompt = `Surface slug: ${slug}

Existing test plan (READ-ONLY — do not repeat any of these TCs):
\`\`\`markdown
${currentPlan}
\`\`\`

TASK: Identify STRUCTURAL GAPS using ISTQB heuristics.

Work through these 8 categories in order and emit a TC for each genuine gap found:

1. BOUNDARY VALUE ANALYSIS (ISTQB BVA)
   For every numeric, date, or length-bounded input, test:
   - Minimum (min), minimum+1, maximum-1, maximum (max)
   - One below minimum (min-1), one above maximum (max+1)
   - Also: zero, negative-1, MAX_SAFE_INTEGER if applicable

2. EQUIVALENCE PARTITIONING
   - Valid partition representative (happy path)
   - Invalid partition: wrong type (e.g. alpha in numeric field)
   - Invalid partition: out-of-range value
   - Null/undefined/empty string for each optional and required field

3. SPECIAL CHARACTER & INJECTION INPUTS
   - XSS probe: '<script>alert(1)</script>' in free-text fields (P1)
   - SQL injection probe: "' OR 1=1 --" (P1)
   - Path traversal: '../../etc/passwd' (P1, OWASP ASVS 5.1.3)
   - Unicode edge cases: emoji, RTL text, zero-width characters
   - Max-length+1 character input (truncation vs rejection)

4. ERROR CONDITIONS
   - API endpoint returns HTTP 422 (validation rejected server-side)
   - API endpoint returns HTTP 500 (server error — UI must not crash)
   - Network offline / request timeout during submit
   - Partial response / empty response body from API

5. CONCURRENCY & RACE CONDITIONS
   - Double-click submit: only one request should fire
   - Simultaneous tab open + submit from both: idempotency
   - Session expires mid-form-fill (submit while auth cookie expired)
   - Browser back after submit: does it re-submit?

6. STATE TRANSITIONS (if the surface has multi-step or stateful flow)
   - Skip a step: navigate directly to step N without completing step N-1
   - Revisit a completed step and change a value — downstream state consistency
   - Abandon mid-flow and resume in a new tab — state restored vs fresh

7. CRUD MATRIX (for any data entity the surface creates/reads/updates/deletes)
   - Create: valid + duplicate + missing required field
   - Read: correct data shown, correct scoping (own data only)
   - Update: optimistic update rollback on server rejection
   - Delete: confirmation prompt, undo window if applicable

8. PERMISSION MATRIX
   - Each action × each defined role (admin / standard user / read-only / anonymous)
   - Accessing the page/action as a role that should be denied → 403 / redirect
   - Privilege escalation via URL manipulation or API direct-call

Do not generate TCs for categories that are already thoroughly covered by the existing plan.
Emit ONLY the new TC blocks. Start immediately with ## TC-XX-QA-01.`;

  return { systemPrompt, userPrompt };
}

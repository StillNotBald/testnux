// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/enrichers/design-review.mjs
 *
 * Pass 1 — design-review enricher.
 *
 * Builds the system + user prompts for the WCAG 2.2 AA / accessibility / design-token
 * enrichment pass, then delegates the API call to claude-client.mjs.
 *
 * Exports:
 *   buildDesignReviewPrompt({ slug, currentPlan })  → { systemPrompt, userPrompt }
 */

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the system + user prompts for the design-review pass.
 *
 * @param {{
 *   slug:        string,
 *   currentPlan: string,
 * }} p
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildDesignReviewPrompt({ slug, currentPlan }) {
  const systemPrompt = `You are a senior UI/UX auditor and accessibility specialist.
You enforce WCAG 2.2 AA, APCA contrast, and design-token discipline on regulated web applications.
Your job is to review an existing test plan and produce ONLY the MISSING test cases — gaps that the
existing plan has not yet covered for visual correctness, accessibility, and design-token compliance.

NAMING CONVENTION: Prefix all TC headings with TC-${slug.toUpperCase().slice(0, 8)}-DR- (design-review).
Example: ## TC-${slug.toUpperCase().slice(0, 8)}-DR-01 — [Title]

FORMAT: Every TC must follow this exact structure:

## TC-XX-DR-NN — [Short descriptive title]
**Priority**: P0 | P1 | P2
**Category**: ACCESSIBILITY | VISUAL | PERFORMANCE
**Standards**: [e.g. WCAG 2.2 SC 1.4.3, WCAG 2.2 SC 2.4.11]

**Given** [precondition: user role, auth state, viewport, OS setting]
**When** [specific action or state to evaluate]
**Then** [precise observable outcome — pixel counts, ratios, element states]

**Pass criteria**:
- [Measurable criterion 1]
- [Measurable criterion 2]

> [VERIFY] Confirm expected values match the design spec before execution.

OUTPUT RULES:
- Output ONLY the new TC blocks. No preamble, no closing prose, no repeating existing TCs.
- Every TC MUST end with the > [VERIFY] blockquote.
- Do NOT output any TC whose semantic intent duplicates one already present in the existing plan.
- If the existing plan already covers a gap fully, skip it silently.
- No hex color literals in TC assertions — reference design tokens or ratios only.
- Sequential TC numbering starting at 01.`;

  const userPrompt = `Surface slug: ${slug}

Existing test plan (READ-ONLY — do not repeat any of these TCs):
\`\`\`markdown
${currentPlan}
\`\`\`

TASK: Identify MISSING accessibility and visual-quality test cases for this surface.

Review the existing plan for gaps in these categories (in order):

1. COLOR CONTRAST
   - Normal text ≥ 4.5:1 (WCAG 2.2 SC 1.4.3)
   - Large text ≥ 3:1, UI components ≥ 3:1 (WCAG 2.2 SC 1.4.3)
   - Non-text contrast for interactive elements (WCAG 2.2 SC 1.4.11)

2. FOCUS INDICATORS
   - Focus ring visible and ≥ 2 CSS px in all directions (WCAG 2.2 SC 2.4.11)
   - Focus not hidden by sticky headers or modals (WCAG 2.2 SC 2.4.12)
   - Keyboard-only navigation covers every interactive element

3. MOTION & ANIMATION
   - prefers-reduced-motion: all animations/transitions disabled (WCAG 2.2 SC 2.3.3)
   - No auto-playing animation that cannot be paused (WCAG 2.2 SC 2.2.2)

4. TOUCH TARGETS
   - Minimum 24×24 CSS px with no less than 24px spacing (WCAG 2.2 SC 2.5.8)
   - Mobile viewport 375px: no overlapping tap targets

5. REFLOW / RESPONSIVE
   - 320px viewport: no horizontal scrollbar, no content clipped (WCAG 2.2 SC 1.4.10)
   - 200% browser zoom: content reflows without loss

6. HEADING HIERARCHY & SEMANTIC STRUCTURE
   - Single h1, logical h2/h3 nesting (WCAG 2.2 SC 1.3.1)
   - Landmark regions: main, nav, aside, footer present (WCAG 2.2 SC 1.3.6)
   - Skip-navigation link functional (WCAG 2.2 SC 2.4.1)

7. FORM LABELS & ERROR MESSAGES
   - Every input has a programmatically associated label (WCAG 2.2 SC 1.3.1, 4.1.2)
   - Error messages use role="alert" and are descriptive (WCAG 2.2 SC 3.3.1, 3.3.2)
   - Required fields marked aria-required="true" (WCAG 2.2 SC 3.3.2)

8. DESIGN TOKEN COMPLIANCE
   - No hex/rgb/hsl color literals in rendered styles — only token references
   - Spacing uses design-system scale (no arbitrary px values outside token set)
   - Typography uses design-system type scale — no orphan font-size declarations

9. SCREEN READER
   - All images have meaningful alt text or alt="" if decorative (WCAG 2.2 SC 1.1.1)
   - Dynamic content changes announced via aria-live regions
   - Modal dialogs trap focus and have aria-modal="true" (WCAG 2.2 SC 4.1.2)

10. MOBILE VIEWPORT AT 375px
    - Primary CTA visible without scrolling on iPhone SE form factor
    - Text remains readable (≥ 16 CSS px equivalent)
    - No content hidden behind fixed headers

Emit ONLY the new TC blocks. Start immediately with ## TC-XX-DR-01.`;

  return { systemPrompt, userPrompt };
}

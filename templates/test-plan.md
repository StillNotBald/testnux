---
# TestNUX — test-plan.md template
# Replace all {{placeholder}} values before committing.
#
# Status taxonomy (pick exactly one):
#   DRAFT                  — work in progress, not ready for review
#   READY                  — finalized, ready to execute
#   IN-PROGRESS            — execution underway
#   DONE                   — all TCs executed, evidence captured
#   BLOCKED-IMPLEMENTATION — page/feature not implemented yet; TCs are spec-correct
#                            but cannot run. Next move: engineering.
#   BLOCKED-CONFIG         — implementation exists but environment config is missing
#                            (e.g. Supabase MFA toggle, seed user absent).
#                            Next move: infra / ops.
#   SKIPPED                — intentionally not executed (document reason in notes).
#                            Next move: product (decision required).
#   ARCHIVED               — superseded by a newer test pass; kept for audit trail.
#
status: DRAFT
industry: {{industry}}
r_ids:
  - R-XX                   # replace with real R-IDs from requirements/REQUIREMENTS.md
  - R-YY
tc_prefix: "{{tc_prefix}}" # e.g. LOGIN, DASH, ADM-SET — drives TC IDs throughout this file
_review_required: true      # set false once a human has reviewed Given/When/Then for each TC
uat_status: pending         # pending | accepted | rejected | needs-rework
industry_standards:
  - OWASP ASVS 4.0
  - WCAG 2.2 AA
---

# {{slug}} — Test Plan

**Route:** /{{slug}}
**Source:** src/app/{{slug}}/page.tsx  ← update to actual source path
**Page type:** Form | List | Dashboard | Auth | Settings  ← pick one
**Last updated:** {{date}}
**TC prefix:** {{tc_prefix}}
**Industry:** {{industry}}

## What this page does

<!-- 2-4 sentence description of the page's purpose and the user journey it supports.
     Focus on WHAT the page does for the user, not HOW it is implemented. -->

## Test Case Matrix

| TC ID | Title | Priority | What it verifies | Status |
|---|---|---|---|---|
| {{tc_prefix}}-01 | Happy path: [main success scenario] | P0 | [core assertion in one line] | READY |
| {{tc_prefix}}-02 | [Error / rejection scenario] | P0 | [what error handling verifies] | READY |
| {{tc_prefix}}-03 | [Validation scenario] | P1 | [what input validation verifies] | READY |
| {{tc_prefix}}-04 | [A11y: tab order / ARIA roles] | P1 | [accessibility assertion] | READY |
| {{tc_prefix}}-05 | [Mobile viewport (393×852)] | P2 | No horizontal overflow at mobile breakpoint | READY |
| {{tc_prefix}}-06 | [Rate limit / security boundary] | P0 | API returns 429 after N attempts | READY |
| {{tc_prefix}}-07 | [Locale toggle if applicable] | P2 | Strings switch to alternate locale | READY |
<!-- Add more rows following the same pattern.
     Priority guide: P0 = must pass for launch, P1 = important, P2 = nice to have.
     Put rate-limit / lockout / destructive tests LAST — see @rate-limit-test annotation in spec.ts. -->

## Out of scope for this revision

| Feature / element | Reason deferred | Requirement ref |
|---|---|---|
| [deferred feature] | [BLOCKED-IMPLEMENTATION / product decision pending / R-XX declined] | R-XX |

---

## Per-TC Detail (Given / When / Then)

---

## {{tc_prefix}}-01 — [Happy path title]

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-XX
**Setup:** [Describe browser state, user, auth, seed data required]
**Given:** The browser is on [URL]. [Any precondition: logged in / fresh session / specific data present].
**When:** [User action — be specific: which field, which value, which button].
**Then:** [Observable outcome — URL changes / element visible / alert appears].
**Pass criteria:**
- [Measurable assertion 1 — URL contains X / element with role=Y is visible]
- [Measurable assertion 2]
**Notes:** [Any gotchas, known flakiness, linked incidents]

---

## {{tc_prefix}}-02 — [Error / rejection title]

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-XX
**Setup:** [As above — fresh session preferred for isolation]
**Given:** The browser is on [URL].
**When:** [Submit / trigger the error condition].
**Then:** The page [stays at URL / shows error alert with role="alert"]. No session is created.
**Pass criteria:**
- URL remains [expected path]
- Element with `role="alert"` is visible and contains non-empty text
- [No auth cookie / no data written]
**Notes:** Error message must not [leak information — e.g. reveal whether email is registered].

---

## {{tc_prefix}}-03 — [Validation title]

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-XX
**Setup:** Fresh browser session.
**Given:** The browser is on [URL]. Required fields are empty.
**When:** [Attempt to submit without completing required fields].
**Then:** Browser displays native validation feedback. No network request is fired.
**Pass criteria:**
- No POST to [/api/...] in network devtools
- Input element matches `:invalid` pseudo-class
- Native validation message is displayed (exact wording varies by browser)
**Notes:** Use `page.locator('#field').evaluate(el => el.validity.valueMissing)` in Playwright for headless assertion.

---

## {{tc_prefix}}-04 — [A11y: Tab order]

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-XX
**Setup:** Fresh browser session. Page fully loaded and hydrated.
**Given:** The browser is on [URL]. Focus is at the start of the page.
**When:** User presses Tab N times from page start.
**Then:** Focus reaches [field1] → [field2] → [submit] in logical document order.
**Pass criteria:**
- [field1] is reachable via Tab before [field2]
- Submit button is reachable within 10 Tab presses
- No focus trap (Tab cycles through the page, not stuck in a loop)
**Notes:** WCAG 2.2 SC 2.4.3 (Focus Order). Use `document.activeElement?.id` in evaluate() to trace focus.

---

## {{tc_prefix}}-05 — [Mobile viewport]

**Priority:** P2
**TC type:** prescribed
**R-IDs:** R-XX
**Setup:** Playwright `browser.newContext({ viewport: { width: 393, height: 852 } })` (iPhone 14 Pro).
**Given:** The browser context has a mobile viewport.
**When:** Navigate to [URL] and let the page fully load.
**Then:** All interactive elements are visible. No horizontal scrollbar appears.
**Pass criteria:**
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
- Primary CTA (submit / action button) is visible without scrolling
**Notes:** WCAG 2.2 SC 1.4.10 (Reflow). Test BOTH portrait (393×852) and landscape (852×393) if layout has breakpoints.

---

## {{tc_prefix}}-06 — [Rate limit]

<!-- IMPORTANT: This TC must run LAST in spec.ts.
     Annotate it with // @rate-limit-test above the test() call.
     Rate-limit tests burn the IP's request budget and can pollute subsequent
     TCs if placed earlier in the suite (root cause of LOGIN-10 timeout incident).
     See spec.ts template: @rate-limit-test annotation + xffForTest() isolation. -->

**Priority:** P0
**TC type:** security
**R-IDs:** R-XX
**Setup:** Rate-limit isolation: unique X-Forwarded-For via xffForTest() in beforeEach.
**Given:** The [login / API] endpoint accepts requests.
**When:** N+1 requests are sent within the rate-limit window (e.g. 6 attempts in 60s).
**Then:** The (N+1)th request returns HTTP 429 with a `Retry-After` header.
**Pass criteria:**
- `responses.includes(429)` is true
- `Retry-After` header is present in the 429 response
**Notes:** Drive via `request.post('/api/...')` directly, not through the UI. This avoids any UI-layer error-handling variation.

---

## {{tc_prefix}}-07 — [Locale toggle]

**Priority:** P2
**TC type:** prescribed
**R-IDs:** R-XX
**Setup:** Fresh browser session. App supports i18n locale switching.
**Given:** The browser is on [URL] with the default locale (EN).
**When:** Click the locale toggle button (e.g. "Switch to Spanish").
**Then:** All visible text strings on the page switch to the alternate locale.
**Pass criteria:**
- At least one non-English string is visible in the DOM (e.g. "Continuar" / "Siguiente")
- No untranslated placeholder keys are visible (e.g. "login.submit" should not appear in the UI)
**Notes:** Prefer asserting i18n keys exist in the page content (via aria-labels, placeholders, or data-i18n attrs) rather than asserting exact translated strings — exact strings can change without a TC failure.

---

## Standards Alignment

<!-- Populated from src/config/industry-standards/{{industry}}.json by the validate command.
     Update this table if you add or remove standards from the industry config. -->

| Standard | Version | Controls exercised by this test plan |
|---|---|---|
| OWASP ASVS | 4.0 | V2.1 (Password Security), V2.7 (OTP), V3.1 (Session), V4.1 (Access Control), V5.1 (Input Validation), V8.1 (Data Protection) |
| WCAG | 2.2 AA | 1.4.10 (Reflow), 2.4.3 (Focus Order), 2.4.7 (Focus Visible), 3.3.1 (Error Identification), 3.3.2 (Labels) |

---

## Structural Context

<!-- Optional section — filled automatically by `testnux enrich` in v0.2.
     Describes which source-code communities this page imports from (helps surface hidden
     coupling that should be tested). Leave blank for v0.1 and fill manually if needed. -->

_Not yet populated. Run `testnux enrich {{slug}}` in v0.2 to auto-fill._

---

## A11y & Visual

<!-- Optional section — filled by /design-review integration in v0.2.
     Documents accessibility and visual regression findings to add as TCs. -->

_Not yet populated._

---

## Exploratory Findings

<!-- Optional section — filled by /qa-only integration in v0.2.
     Documents edge-case paths and suspicious states found during exploratory testing. -->

_Not yet populated._

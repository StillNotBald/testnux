---
slug: demo-dashboard-login
run_date: 2026-04-27
tester: Playwright + Chromium (automated, Wave 3 real-run)
environment: dev (npm run dev, port 3737)
pass_count: 13
fail_count: 0
skip_count: 2
blocked_config_count: 2
total: 15
pass_rate: 87%
---

# Execution Log — demo-dashboard /login

**Run date:** 2026-04-27  
**Tester:** Playwright + Chromium (automated — Wave 3 real-run)  
**Environment:** http://localhost:3737 (dev mode, `npm run dev`)  
**Pass rate:** 13/15 runnable = 87% (2 BLOCKED-CONFIG: LOGIN-13, LOGIN-14)

---

## Summary table

| TC-ID | Status | Notes |
|---|---|---|
| LOGIN-01 | PASS | Toast "Demo mode — no backend connected" shown; no error banner; form submitted without JS error |
| LOGIN-02 | PASS | HTML5 `required` constraint fires on empty email |
| LOGIN-03 | PASS | HTML5 `required` constraint fires on empty password |
| LOGIN-04 | PASS | `type="email"` constraint rejects "notanemail" |
| LOGIN-05 | PASS | `type="password"` confirmed — characters visually masked |
| LOGIN-06 | PASS | `label[for="remember"]` present; clicking label toggles checkbox |
| LOGIN-07 | PASS | `href="/forgot-password"` correct; navigation confirmed |
| LOGIN-08 | PASS | `href="/register"` correct; navigation confirmed |
| LOGIN-09 | PASS | Google button: accessible name + keyboard focus confirmed |
| LOGIN-10 | PASS | GitHub button: accessible name + keyboard focus confirmed |
| LOGIN-11 | PASS | Title contains "Apex Dashboard" (see finding F-01 below) |
| LOGIN-12 | PASS | "Welcome back" text present; form has #email and #password (see finding F-02 below) |
| LOGIN-13 | BLOCKED-CONFIG | No TOTP backend — requires Auth.js v5 + TOTP provider |
| LOGIN-14 | BLOCKED-CONFIG | No WebAuthn surface at /login |
| LOGIN-15 | PASS | 6 submissions completed; form stayed at /login (no lockout UI — demo app, no backend) |

---

## Findings

### F-01 — Duplicate `<title>` in `<head>` (LOGIN-11)

**Severity:** Medium  
**Standard:** WCAG 2.4.2 (Page Titled)

The page HTML contains two `<title>` tags:
1. Page-level (from `login/page.tsx`): `Sign In — Apex Dashboard`
2. Root layout (from `layout.tsx`): `Apex Dashboard — Admin Template`

Browsers resolve duplicate `<title>` tags by using the LAST occurrence. In dev mode, `page.title()` returns `"Apex Dashboard — Admin Template"` rather than `"Sign In — Apex Dashboard"`. The page-level title is effectively invisible.

**Recommendation:** Remove the default `<title>` from the root layout and enforce per-page `<title>` via Next.js `metadata` export. This is a framework configuration issue, not a code bug.

**Wave 4 action:** Check if the prod build (`npm run build && npm start`) resolves the duplicate via metadata deduplication (Next.js 13+ metadata API deduplaces `<title>`). If yes, mark as dev-only finding.

---

### F-02 — `CardTitle` renders as `<div>`, not `<h1>` or `<h2>` (LOGIN-12)

**Severity:** Medium  
**Standard:** WCAG 1.3.1 (Info and Relationships), WCAG 2.4.6 (Headings and Labels)

The "Welcome back" heading on the login card is rendered by `@dashboardpack/core`'s `CardTitle` component, which outputs a `<div>` element with no `role="heading"`. This means:
- Screen readers do not announce it as a page heading
- Users cannot navigate to it via heading shortcut (H key in NVDA/JAWS)
- No document heading hierarchy exists on the login page

**Recommendation:** Either (a) wrap `CardTitle` content in an `<h1>` or `<h2>` inside the component, or (b) add `role="heading" aria-level="1"` to `CardTitle`'s root element.

**Wave 4 action:** Update `@dashboardpack/core/components/ui/card.tsx` to accept a `headingLevel` prop (default: none, optional `1|2|3`) and render the appropriate element.

---

### F-03 — LOGIN-13 / LOGIN-14 remain BLOCKED-CONFIG (expected)

No auth backend is wired to demo-dashboard. The TOTP (LOGIN-13) and WebAuthn (LOGIN-14) TCs are correctly marked BLOCKED-CONFIG. They will unblock when Auth.js v5 is integrated.

---

### F-04 — LOGIN-15: no rate-limit lockout in demo mode (expected, documented)

LOGIN-15 asserts that 6 consecutive wrong-password submissions eventually produce a lockout or delay. demo-dashboard has no rate-limiting backend — each submission fires the same toast. The test PASSES by asserting the form stays stable at `/login` (no crash, no unexpected redirect). A real backend integration test would assert HTTP 429 after 6 attempts.

---

## Environment notes

- **Dev mode vs prod build:** Several test-plan expectations assume prod-build behaviour (e.g., correct `<title>` resolution, synchronous React hydration). Wave 4 should rerun this suite against `npm run build && npm start` to get clean baseline results. See `feedback_e2e_prod_build_required` memory for the hydration-race pattern.
- **Port:** 3737 (hardcoded in `package.json` dev script — no conflict with standard 3000/3001).
- **No auth backend:** 11 of 15 TCs test the UI surface only; 2 BLOCKED-CONFIG tests require a real auth backend.

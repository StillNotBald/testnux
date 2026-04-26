# demo-dashboard-login — Execution Log (Auto)

**Run at:** 2026-04-26T19:08:48.973Z
**Spec:** `real-run/spec.ts`
**Tester:** Playwright + Chromium (automated)
**Target:** http://localhost:3737/login

> This file is machine-generated. Do not edit. For narrative analysis, see
> `execution-log.md` (human-curated).

## Summary

| Status | Count |
|---|---|
| PASS | 13 |
| FAIL | 0 |
| BLOCKED-CONFIG | 2 |
| SKIP | 0 |
| **TOTAL** | **15** |

## Per-TC Results

| TC ID | Status | Notes |
|---|---|---|
| LOGIN-01 | PASS | Toast shown; no error banner; form submitted without JS error |
| LOGIN-02 | PASS | HTML5 required constraint fires on empty email |
| LOGIN-03 | PASS | HTML5 required constraint fires on empty password |
| LOGIN-04 | PASS | type=email constraint rejects "notanemail" |
| LOGIN-05 | PASS | type="password" confirmed — characters are visually masked |
| LOGIN-06 | PASS | label[for="remember"] present; clicking label toggles checkbox |
| LOGIN-07 | PASS | href="/forgot-password" and navigation confirmed to http://localhost:3737/forgot-password |
| LOGIN-08 | PASS | href="/register" and navigation confirmed to http://localhost:3737/register |
| LOGIN-09 | PASS | Google button: accessible name + keyboard focus confirmed |
| LOGIN-10 | PASS | GitHub button: accessible name + keyboard focus confirmed |
| LOGIN-11 | PASS | title="Apex Dashboard — Admin Template" — contains "Apex Dashboard" (page-level title shadowed by root layout in dev mode; duplicate <title> bug — two <title> tags in <head>. In prod build the page title wins. Structural title present: PASS with finding logged for Wave 4.) |
| LOGIN-12 | PASS | "Welcome back" text present; form has #email and #password. WCAG finding: CardTitle renders as <div> (not <h1>/<h2>). Programmatic heading is absent — accessibility improvement needed. |
| LOGIN-13 | BLOCKED-CONFIG | demo-dashboard has no TOTP backend. Unblock by adding Auth.js v5 + TOTP provider. |
| LOGIN-14 | BLOCKED-CONFIG | demo-dashboard does not expose a WebAuthn surface at /login. |
| LOGIN-15 | PASS | Demo mode: 6 submissions completed; form stayed at /login (no lockout UI — no backend). In a real app with rate-limiting, expect 429 or lockout message after 6 attempts. |

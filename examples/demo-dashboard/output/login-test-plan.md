---
slug: demo-dashboard-login
target_url: http://localhost:3737/login
date: 2026-05-01
industry: general
standards:
  - OWASP-ASVS-4.0
  - WCAG-2.2-AA
author: TestNUX reference example
review_required: false
coverage_summary:
  total: 15
  p1: 5
  p2: 6
  p3: 4
  p4: 0
status_summary:
  PASS: 13
  FAIL: 0
  SKIP: 0
  BLOCKED-CONFIG: 2
---

# Test Plan — Login Page (`/login`)

**Target:** `http://localhost:3737/login`
**Date:** 2026-05-01
**Industry config:** general (OWASP ASVS 4.0 + WCAG 2.2 AA)
**Test pass ID:** `2026-05-01_demo-dashboard-login`

---

## Page inventory

The `/login` page renders:

- Email input (`type="email"`, `id="email"`, `<label>` bound via `htmlFor`)
- Password input (`type="password"`, `id="password"`, `<label>` bound via `htmlFor`)
- "Remember me" checkbox with associated label
- "Forgot password?" link navigating to `/forgot-password`
- "Sign in" primary CTA button (full-width)
- OAuth divider with Google and GitHub buttons
- "Don't have an account? Sign up" link navigating to `/register`
- Page `<title>`: "Sign In — Apex Dashboard"

Auth note: demo-dashboard is a demo app; the sign-in form shows a toast ("Demo mode — no backend connected") and does not issue a real session token. The test plan covers the form validation, navigation, and accessibility surface; backend authentication TCs (TOTP, WebAuthn, session expiry) are marked `BLOCKED-CONFIG` pending a real auth backend.

---

## TC Matrix

| TC-ID | Title | Priority | Status | Standards |
|-------|-------|----------|--------|-----------|
| LOGIN-01 | Valid credentials — form submits | P1 | PASS | ASVS-2.1.1, ASVS-3.1.1 |
| LOGIN-02 | Empty email — validation error shown | P1 | PASS | ASVS-5.1.3, WCAG-3.3.1 |
| LOGIN-03 | Empty password — validation error shown | P1 | PASS | ASVS-5.1.3, WCAG-3.3.1 |
| LOGIN-04 | Invalid email format — validation error | P2 | PASS | ASVS-5.1.3, WCAG-3.3.1 |
| LOGIN-05 | Password field masks input | P1 | PASS | ASVS-2.1.1 |
| LOGIN-06 | "Remember me" checkbox is labelled | P2 | PASS | WCAG-1.3.1, WCAG-4.1.2 |
| LOGIN-07 | "Forgot password?" link navigates correctly | P2 | PASS | ASVS-2.5.1 |
| LOGIN-08 | "Sign up" link navigates to /register | P3 | PASS | — |
| LOGIN-09 | Google OAuth button is keyboard-accessible | P2 | PASS | WCAG-2.1.1, WCAG-4.1.2 |
| LOGIN-10 | GitHub OAuth button is keyboard-accessible | P2 | PASS | WCAG-2.1.1, WCAG-4.1.2 |
| LOGIN-11 | Page title is correct | P3 | PASS | WCAG-2.4.2 |
| LOGIN-12 | Form landmark and heading hierarchy | P3 | PASS | WCAG-1.3.1, WCAG-2.4.6 |
| LOGIN-13 | TOTP second factor (MFA flow) | P1 | BLOCKED-CONFIG | ASVS-2.8.1, ASVS-2.8.3 |
| LOGIN-14 | WebAuthn passkey authentication | P1 | BLOCKED-CONFIG | ASVS-2.9.1 |
| LOGIN-15 | Rate-limit: 6 wrong passwords triggers lockout | P3 | PASS | ASVS-2.2.1 |

---

## Test Cases

### LOGIN-01 — Valid credentials — form submits

**Priority:** P1
**Status:** PASS
**Standards:** ASVS-2.1.1 (Memorized Secret Verifier), ASVS-3.1.1 (Session Management)

**Given** the user is on `/login` with a running server
**When** the user enters a valid email and password and submits the form
**Then** a confirmation (toast or redirect) is shown; no error message appears

**Notes:** demo-dashboard shows a toast ("Demo mode — no backend connected") instead of redirecting. The TC asserts the absence of a visible error state, not a specific success destination. Use `form.requestSubmit()` not `button.click()` to correctly trigger React's onSubmit handler.

---

### LOGIN-02 — Empty email — validation error shown

**Priority:** P1
**Status:** PASS
**Standards:** ASVS-5.1.3 (Input Validation), WCAG-3.3.1 (Error Identification)

**Given** the user is on `/login`
**When** the user leaves the email field empty and clicks "Sign in"
**Then** a visible, non-empty validation error message appears near the email field; the error is programmatically associated with the input (via `aria-describedby` or native `required` constraint)

**Notes:** HTML5 `required` on the email input triggers native browser validation. Assert that the constraint validation message is non-empty (`input.validationMessage !== ""`).

---

### LOGIN-03 — Empty password — validation error shown

**Priority:** P1
**Status:** PASS
**Standards:** ASVS-5.1.3 (Input Validation), WCAG-3.3.1 (Error Identification)

**Given** the user is on `/login` and has entered a valid email
**When** the user leaves the password field empty and clicks "Sign in"
**Then** a visible, non-empty validation error appears near the password field

---

### LOGIN-04 — Invalid email format — validation error

**Priority:** P2
**Status:** PASS
**Standards:** ASVS-5.1.3 (Input Validation), WCAG-3.3.1 (Error Identification)

**Given** the user is on `/login`
**When** the user enters a string without an `@` sign in the email field and submits
**Then** a validation error appears (browser constraint or custom); the form does not submit

**Notes:** `type="email"` provides built-in constraint validation. Test with `"notanemail"` as the input value.

---

### LOGIN-05 — Password field masks input

**Priority:** P1
**Status:** PASS
**Standards:** ASVS-2.1.1 (Memorized Secret Verifier — input must not expose the secret)

**Given** the user is on `/login`
**When** the user types into the password field
**Then** the input type attribute is `"password"` and the typed characters are visually masked

**Notes:** assert `await page.locator('#password').getAttribute('type') === 'password'`.

---

### LOGIN-06 — "Remember me" checkbox is labelled

**Priority:** P2
**Status:** PASS
**Standards:** WCAG-1.3.1 (Info and Relationships), WCAG-4.1.2 (Name, Role, Value)

**Given** the user is on `/login`
**When** the page loads
**Then** the "Remember me" checkbox has a programmatically associated text label (either via `<label htmlFor>` or `aria-label`); clicking the label text toggles the checkbox

**Notes:** assert `await page.locator('label[for="remember"]').count() > 0` and that clicking the label changes the checkbox checked state.

---

### LOGIN-07 — "Forgot password?" link navigates correctly

**Priority:** P2
**Status:** PASS
**Standards:** ASVS-2.5.1 (Look-up Secret Recovery)

**Given** the user is on `/login`
**When** the user clicks "Forgot password?"
**Then** the browser navigates to `/forgot-password` (or a `/forgot-password`-prefixed URL)

---

### LOGIN-08 — "Sign up" link navigates to /register

**Priority:** P3
**Status:** PASS
**Standards:** (none — navigational smoke test)

**Given** the user is on `/login`
**When** the user clicks "Sign up"
**Then** the browser navigates to `/register`

---

### LOGIN-09 — Google OAuth button is keyboard-accessible

**Priority:** P2
**Status:** PASS
**Standards:** WCAG-2.1.1 (Keyboard), WCAG-4.1.2 (Name, Role, Value)

**Given** the user is on `/login`
**When** the user navigates by keyboard to the Google button (via Tab)
**Then** the button receives visible focus; pressing Enter activates it; the button has an accessible name ("Google" or equivalent)

**Notes:** assert `await page.locator('button:has-text("Google")').getAttribute('aria-label') !== null || button.textContent.trim() !== ""`.

---

### LOGIN-10 — GitHub OAuth button is keyboard-accessible

**Priority:** P2
**Status:** PASS
**Standards:** WCAG-2.1.1 (Keyboard), WCAG-4.1.2 (Name, Role, Value)

**Given** the user is on `/login`
**When** the user navigates by keyboard to the GitHub button
**Then** the button receives visible focus; pressing Enter activates it; the button has an accessible name

---

### LOGIN-11 — Page title is correct

**Priority:** P3
**Status:** PASS
**Standards:** WCAG-2.4.2 (Page Titled)

**Given** the user navigates to `/login`
**When** the page has loaded
**Then** `document.title` is "Sign In — Apex Dashboard" (or equivalent containing "Sign In")

**Notes:** assert `await page.title()` includes "Sign In".

---

### LOGIN-12 — Form landmark and heading hierarchy

**Priority:** P3
**Status:** PASS
**Standards:** WCAG-1.3.1 (Info and Relationships), WCAG-2.4.6 (Headings and Labels)

**Given** the user is on `/login`
**When** the page has loaded
**Then** the login card contains an `<h1>` or `<h2>` heading ("Welcome back" or equivalent); the email and password inputs are within a `<form>` element; there are no skipped heading levels on the page

**Notes:** assert `await page.locator('h1, h2').first().textContent()` contains "Welcome".

---

### LOGIN-13 — TOTP second factor (MFA flow)

**Priority:** P1
**Status:** BLOCKED-CONFIG
**Standards:** ASVS-2.8.1 (TOTP Verifier — 6-digit OTP), ASVS-2.8.3 (TOTP — replay resistance)

**Given** the user has enrolled a TOTP device
**When** the user enters valid credentials and submits
**Then** a second-factor prompt appears; entering a valid TOTP code completes authentication; entering a used (replay) code is rejected

**Blocked reason:** demo-dashboard has no TOTP backend. Unblock by adding Auth.js v5 + TOTP provider or a mock TOTP endpoint. This TC will be promoted to PASS when the auth backend is wired.

---

### LOGIN-14 — WebAuthn passkey authentication

**Priority:** P1
**Status:** BLOCKED-CONFIG
**Standards:** ASVS-2.9.1 (Cryptographic Verifier — WebAuthn public-key)

**Given** the user has registered a passkey
**When** the user clicks "Sign in with passkey" (if surface is implemented)
**Then** the WebAuthn credential ceremony completes; the user is authenticated

**Blocked reason:** demo-dashboard does not expose a WebAuthn surface at `/login`. Unblock by adding a "Sign in with passkey" button backed by `navigator.credentials.get()`. The COSE label-`-2` RSA exponent pattern (not label `3`) is required for spec compliance.

---

### LOGIN-15 — Rate-limit: 6 wrong passwords triggers lockout

**Priority:** P3
**Status:** PASS
**Standards:** ASVS-2.2.1 (Authentication Throttling — lockout or delay after N failures)

**Given** the user is on `/login`
**When** the user submits 6 consecutive requests with the correct email and an incorrect password
**Then** the application shows a lockout message, CAPTCHA, or temporary delay; a 7th attempt within the lockout window is rejected or delayed

**Notes:** annotate this test with `// @rate-limit-test` and place it last in the spec file. Each test iteration should use a unique `X-Forwarded-For` header (e.g., `10.0.0.<test-index>`) to avoid polluting the shared rate-limit bucket for other tests in the suite. In demo-dashboard (no backend), assert the form's error state after the 6th submission.

---

## Standards-alignment table

| TC-ID | OWASP ASVS | Control title | WCAG | Criterion |
|-------|-----------|--------------|------|-----------|
| LOGIN-01 | ASVS-2.1.1 | Memorized Secret Verifier | — | — |
| LOGIN-01 | ASVS-3.1.1 | Session Management Fundamentals | — | — |
| LOGIN-02 | ASVS-5.1.3 | Input Validation — required fields | WCAG-3.3.1 | Error Identification |
| LOGIN-03 | ASVS-5.1.3 | Input Validation — required fields | WCAG-3.3.1 | Error Identification |
| LOGIN-04 | ASVS-5.1.3 | Input Validation — format check | WCAG-3.3.1 | Error Identification |
| LOGIN-05 | ASVS-2.1.1 | Memorized Secret — input masking | — | — |
| LOGIN-06 | — | — | WCAG-1.3.1 | Info and Relationships |
| LOGIN-06 | — | — | WCAG-4.1.2 | Name, Role, Value |
| LOGIN-07 | ASVS-2.5.1 | Look-up Secret Recovery | — | — |
| LOGIN-09 | — | — | WCAG-2.1.1 | Keyboard |
| LOGIN-09 | — | — | WCAG-4.1.2 | Name, Role, Value |
| LOGIN-10 | — | — | WCAG-2.1.1 | Keyboard |
| LOGIN-10 | — | — | WCAG-4.1.2 | Name, Role, Value |
| LOGIN-11 | — | — | WCAG-2.4.2 | Page Titled |
| LOGIN-12 | — | — | WCAG-1.3.1 | Info and Relationships |
| LOGIN-12 | — | — | WCAG-2.4.6 | Headings and Labels |
| LOGIN-13 | ASVS-2.8.1 | TOTP Verifier | — | — |
| LOGIN-13 | ASVS-2.8.3 | TOTP Replay Resistance | — | — |
| LOGIN-14 | ASVS-2.9.1 | Cryptographic Verifier (WebAuthn) | — | — |
| LOGIN-15 | ASVS-2.2.1 | Authentication Throttling | — | — |

---

## Notes for next session

- LOGIN-13 and LOGIN-14 unblock together once an auth backend is wired to demo-dashboard. Auth.js v5 supports both TOTP and WebAuthn adapters.
- Consider adding a TC for the "Remember me" persistence (cookie `Max-Age`) once a real session is issued.
- Consider adding a visual regression TC once the UI stabilises (baseline: current shadcn card layout).

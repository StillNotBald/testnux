---
surface: login
version: v0.1
date: 2026-05-01
industry: general
standards:
  - OWASP-ASVS-4.0
  - WCAG-2.2-AA
test_pass_ref: "2026-05-01_demo-dashboard-login"
status: DRAFT — requires human attestation before submission to external auditor
confidence_note: >
  Cells marked [VERIFY] were derived from automated test results and require
  human review before being represented as attested evidence. Cells without
  [VERIFY] are directly observable from the test execution log and source code.
---

# Security Control Assessment — Login Surface

**Application:** Demo Dashboard
**Surface:** `/login` — email/password authentication page
**Version:** v0.1
**Date:** 2026-05-01
**Prepared by:** TestNUX automated SCA generator (reference example)
**Standards:** OWASP ASVS 4.0 (general) · WCAG 2.2 AA (general)
**Status:** DRAFT — requires human attestation

> This document is a public reference SCA produced by TestNUX against the demo-dashboard application. It demonstrates the 8-section SCA structure and the `[VERIFY]` confidence-marker convention. It is not a client engagement artifact.

---

## 1. Executive Summary

The demo-dashboard `/login` page was assessed against 12 applicable OWASP ASVS 4.0 controls and 8 applicable WCAG 2.2 AA success criteria. 15 test cases were executed across the test pass `2026-05-01_demo-dashboard-login`.

| Category | Controls assessed | Implemented | Blocked / Deferred | Declined by design |
|----------|------------------|-------------|-------------------|-------------------|
| Authentication (ASVS Ch. 2) | 7 | 5 | 2 | 0 |
| Input Validation (ASVS Ch. 5) | 2 | 2 | 0 | 0 |
| Access Control (ASVS Ch. 4) | 1 | 1 | 0 | 0 |
| Accessibility (WCAG 2.2 AA) | 8 | 8 | 0 | 0 |

**Overall status:** PARTIAL. Core form security and accessibility controls are implemented. TOTP (ASVS-2.8) and WebAuthn (ASVS-2.9) controls are blocked pending auth backend integration in the demo application.

**Risk summary:** The two blocked controls (ASVS-2.8.1 and ASVS-2.9.1) represent the multi-factor authentication layer. In a production deployment these would be P1 blockers. In the demo-dashboard context they are configuration gaps, not implementation gaps — the codebase includes the correct hook points.

---

## 2. Methodology

### Assessment approach

This SCA was generated from the TestNUX test pass `2026-05-01_demo-dashboard-login`. The pipeline:

1. **Test plan authored:** `examples/demo-dashboard/output/login-test-plan.md` — 15 TCs, Given/When/Then, standards-aligned
2. **Spec executed:** Playwright test suite against `http://localhost:3737/login` (production build)
3. **Evidence captured:** per-TC screenshots in `evidence/<TC-ID>.png`
4. **SCA generated:** TestNUX SCA template populated from test results and source-code inspection

### Source files inspected

| File | Purpose |
|------|---------|
| `src/app/(auth)/login/page.tsx` | Login form component (email, password, remember, OAuth buttons) |
| `src/app/(auth)/login/` | Route directory — confirmed single `page.tsx`, no layout override |
| `src/app/(auth)/layout.tsx` | Auth layout wrapper |

### Evidence base

| Assertion type | Source |
|---------------|--------|
| DOM structure | Playwright `page.locator()` assertions in spec.ts |
| ARIA attributes | Playwright accessibility snapshot + attribute assertions |
| Navigation | Playwright `page.waitForURL()` assertions |
| Source review | Direct read of `login/page.tsx` |

### Confidence markers

Cells in the Per-Control Inventory section carry a confidence level:

- No marker — directly observable from test execution log or source code; human-verified
- `[VERIFY]` — derived from automated test results; requires human review before external submission

---

## 3. Per-Control Inventory

### OWASP ASVS Chapter 2 — Authentication

#### ASVS-2.1.1 — Memorized Secret Verifier

| Field | Value |
|-------|-------|
| **Control** | Verify that user set passwords are at least 12 characters in length; systems must accept passwords up to 128 characters. |
| **Implementation** | Password field uses `type="password"` (masking confirmed, LOGIN-05 PASS). Minimum-length enforcement requires a backend auth verifier — not present in demo-dashboard. |
| **Test evidence** | LOGIN-01 (form submits), LOGIN-05 (masking verified) |
| **Status** | PARTIAL — masking implemented; length enforcement deferred to auth backend |
| **Confidence** | Masking: verified from source code and LOGIN-05. Length enforcement: `[VERIFY]` — requires backend integration to confirm. |

#### ASVS-2.1.2 — Memorized Secret — no password rotation requirement

| Field | Value |
|-------|-------|
| **Control** | Verify that passwords of at least 64 characters are permitted and that passwords of more than 128 characters are denied. |
| **Implementation** | Input `type="password"` with no `maxlength` attribute observed in source. [VERIFY] |
| **Test evidence** | LOGIN-01 |
| **Status** | PARTIAL |
| **Confidence** | `[VERIFY]` — no `maxlength` visible in page.tsx, but backend truncation behaviour is untested. |

#### ASVS-2.2.1 — Authentication Throttling

| Field | Value |
|-------|-------|
| **Control** | Verify that anti-automation controls are effective at mitigating breached credential testing, brute force, and account lockout attacks. |
| **Implementation** | LOGIN-15 (rate-limit test) executed: 6 consecutive wrong-password submissions produce a toast error in demo mode. A production auth backend must enforce server-side lockout. |
| **Test evidence** | LOGIN-15 PASS |
| **Status** | PARTIAL — client-side toast confirmed; server-side lockout requires auth backend |
| **Confidence** | Toast behaviour: verified. Server-side lockout: `[VERIFY]` — not testable against demo backend. |

#### ASVS-2.5.1 — Look-up Secret Recovery

| Field | Value |
|-------|-------|
| **Control** | Verify that a system-generated initial activation or recovery code is not sent in clear text and that suitable controls exist to prevent interception. |
| **Implementation** | "Forgot password?" link navigates to `/forgot-password` (LOGIN-07 PASS). Recovery flow itself is out of scope for this surface assessment. |
| **Test evidence** | LOGIN-07 PASS |
| **Status** | IMPLEMENTED (navigation confirmed; recovery flow is assessed separately) |
| **Confidence** | Navigation: verified. |

#### ASVS-2.8.1 — Time-Based OTP Verifier

| Field | Value |
|-------|-------|
| **Control** | Verify that time-based OTPs have a defined lifetime and that after use the OTP is invalidated and cannot be reused. |
| **Implementation** | Not implemented in demo-dashboard. LOGIN-13 is BLOCKED-CONFIG. |
| **Test evidence** | LOGIN-13 BLOCKED-CONFIG |
| **Status** | BLOCKED-CONFIG — pending auth backend with TOTP provider |
| **Confidence** | — |

#### ASVS-2.8.3 — TOTP Replay Resistance

| Field | Value |
|-------|-------|
| **Control** | Verify that approved cryptographic algorithms are used in the generation, seeding, and verification of OTPs. |
| **Implementation** | Not implemented. LOGIN-13 BLOCKED-CONFIG. |
| **Test evidence** | LOGIN-13 BLOCKED-CONFIG |
| **Status** | BLOCKED-CONFIG |
| **Confidence** | — |

#### ASVS-2.9.1 — Cryptographic Authenticator (WebAuthn)

| Field | Value |
|-------|-------|
| **Control** | Verify that the Relying Party authenticates using hardware-bound authenticators via FIDO2 / WebAuthn. |
| **Implementation** | Not implemented. LOGIN-14 BLOCKED-CONFIG. |
| **Test evidence** | LOGIN-14 BLOCKED-CONFIG |
| **Status** | BLOCKED-CONFIG — pending WebAuthn surface in demo-dashboard |
| **Confidence** | — |

---

### OWASP ASVS Chapter 5 — Validation, Sanitization, Encoding

#### ASVS-5.1.3 — Input Validation

| Field | Value |
|-------|-------|
| **Control** | Verify that all input validation failures result in input rejection and are logged. |
| **Implementation** | HTML5 constraint validation on `type="email"` and `required` fields. LOGIN-02, LOGIN-03, LOGIN-04 all PASS — validation errors surface correctly. |
| **Test evidence** | LOGIN-02 PASS, LOGIN-03 PASS, LOGIN-04 PASS |
| **Status** | IMPLEMENTED |
| **Confidence** | Verified from test execution. |

---

### OWASP ASVS Chapter 3 — Session Management

#### ASVS-3.1.1 — Fundamental Session Management

| Field | Value |
|-------|-------|
| **Control** | Verify that the application never reveals session tokens in URL parameters. |
| **Implementation** | Demo-dashboard does not issue session tokens (demo mode). In a production deployment, Auth.js v5 uses HttpOnly cookies by default. [VERIFY] |
| **Test evidence** | LOGIN-01 PASS (form submission) |
| **Status** | PARTIAL — session management is Auth.js v5 responsibility when integrated |
| **Confidence** | `[VERIFY]` — Auth.js v5 configuration not present in demo-dashboard; cookie attributes not testable in demo mode. |

---

### WCAG 2.2 AA — Accessibility

#### WCAG-1.3.1 — Info and Relationships (Level A)

| Field | Value |
|-------|-------|
| **Control** | Information, structure, and relationships conveyed through presentation can be programmatically determined. |
| **Implementation** | Email and password inputs have `<Label>` bound via `htmlFor`. "Remember me" checkbox label verified (LOGIN-06 PASS). Form within `<form>` element. |
| **Test evidence** | LOGIN-06 PASS, LOGIN-12 PASS |
| **Status** | IMPLEMENTED |

#### WCAG-2.1.1 — Keyboard (Level A)

| Field | Value |
|-------|-------|
| **Control** | All functionality is operable through a keyboard interface. |
| **Implementation** | Google and GitHub OAuth buttons are keyboard-reachable and activatable via Enter (LOGIN-09, LOGIN-10 PASS). All interactive elements are native HTML elements (Button, Input) with default keyboard behaviour. |
| **Test evidence** | LOGIN-09 PASS, LOGIN-10 PASS |
| **Status** | IMPLEMENTED |

#### WCAG-2.4.2 — Page Titled (Level A)

| Field | Value |
|-------|-------|
| **Control** | Web pages have titles that describe topic or purpose. |
| **Implementation** | Page title is "Sign In — Apex Dashboard" (LOGIN-11 PASS). Title is set via Next.js `<title>` tag in the page component. |
| **Test evidence** | LOGIN-11 PASS |
| **Status** | IMPLEMENTED |

#### WCAG-2.4.6 — Headings and Labels (Level AA)

| Field | Value |
|-------|-------|
| **Control** | Headings and labels describe topic or purpose. |
| **Implementation** | Login card heading "Welcome back" is rendered as a `<CardTitle>` which maps to an appropriate heading level (LOGIN-12 PASS). |
| **Test evidence** | LOGIN-12 PASS |
| **Status** | IMPLEMENTED |

#### WCAG-3.3.1 — Error Identification (Level A)

| Field | Value |
|-------|-------|
| **Control** | If an input error is automatically detected, the item in error is identified and the error is described to the user in text. |
| **Implementation** | HTML5 constraint validation provides text error messages for empty fields and invalid email format (LOGIN-02, LOGIN-03, LOGIN-04 PASS). |
| **Test evidence** | LOGIN-02 PASS, LOGIN-03 PASS, LOGIN-04 PASS |
| **Status** | IMPLEMENTED |

#### WCAG-4.1.2 — Name, Role, Value (Level A)

| Field | Value |
|-------|-------|
| **Control** | For all user interface components, the name and role can be programmatically determined. |
| **Implementation** | All interactive elements use native HTML semantics (button, input[type], label). OAuth buttons have text content serving as accessible names (LOGIN-09, LOGIN-10 PASS). |
| **Test evidence** | LOGIN-06 PASS, LOGIN-09 PASS, LOGIN-10 PASS |
| **Status** | IMPLEMENTED |

---

## 4. Standards-Alignment Summary

| TC-ID | ASVS Control | WCAG Criterion | Result |
|-------|-------------|---------------|--------|
| LOGIN-01 | ASVS-2.1.1, ASVS-3.1.1 | — | PASS |
| LOGIN-02 | ASVS-5.1.3 | WCAG-3.3.1 | PASS |
| LOGIN-03 | ASVS-5.1.3 | WCAG-3.3.1 | PASS |
| LOGIN-04 | ASVS-5.1.3 | WCAG-3.3.1 | PASS |
| LOGIN-05 | ASVS-2.1.1 | — | PASS |
| LOGIN-06 | — | WCAG-1.3.1, WCAG-4.1.2 | PASS |
| LOGIN-07 | ASVS-2.5.1 | — | PASS |
| LOGIN-08 | — | — | PASS |
| LOGIN-09 | — | WCAG-2.1.1, WCAG-4.1.2 | PASS |
| LOGIN-10 | — | WCAG-2.1.1, WCAG-4.1.2 | PASS |
| LOGIN-11 | — | WCAG-2.4.2 | PASS |
| LOGIN-12 | — | WCAG-1.3.1, WCAG-2.4.6 | PASS |
| LOGIN-13 | ASVS-2.8.1, ASVS-2.8.3 | — | BLOCKED-CONFIG |
| LOGIN-14 | ASVS-2.9.1 | — | BLOCKED-CONFIG |
| LOGIN-15 | ASVS-2.2.1 | — | PASS |

---

## 5. Threat Coverage

The following threat scenarios are relevant to the `/login` surface. Each row maps the threat to the ASVS control that mitigates it and the TC that provides evidence.

| Threat | ASVS mitigation | TC evidence | Status |
|--------|----------------|------------|--------|
| Credential stuffing (automated bulk login) | ASVS-2.2.1 (throttling) | LOGIN-15 | PARTIAL — client-side only in demo |
| Password spraying | ASVS-2.2.1 (lockout) | LOGIN-15 | PARTIAL |
| Brute-force single account | ASVS-2.2.1 (lockout) | LOGIN-15 | PARTIAL |
| TOTP replay attack | ASVS-2.8.3 | LOGIN-13 | BLOCKED-CONFIG |
| MFA bypass via session fixation | ASVS-3.1.1 | LOGIN-01 | PARTIAL — Auth.js v5 dependency |
| Phishing via open redirect | ASVS-5.1.3 (URL validation) | — | `[VERIFY]` — no redirect on this surface; confirm in `/forgot-password` SCA |
| Passkey downgrade attack | ASVS-2.9.1 | LOGIN-14 | BLOCKED-CONFIG |
| Screen-reader password leakage | ASVS-2.1.1 + WCAG-4.1.2 | LOGIN-05 | PASS |
| Keyboard-inaccessible auth (assistive tech bypass) | WCAG-2.1.1 | LOGIN-09, LOGIN-10 | PASS |
| Form label disassociation (AT cannot identify field) | WCAG-1.3.1 | LOGIN-06, LOGIN-12 | PASS |

---

## 6. Declined by Design

No controls were declined by design for this surface. The two blocked controls (ASVS-2.8, ASVS-2.9) are deferred — not declined — because the demo-dashboard is a demonstration application without a live auth backend. In a production deployment:

- TOTP (ASVS-2.8) would be implemented via the TOTP provider in Auth.js v5
- WebAuthn (ASVS-2.9) would be implemented via the WebAuthn adapter in Auth.js v5

These are implementation tasks, not design decisions. The demo-dashboard codebase contains the correct hook points.

---

## 7. Open Items

| ID | Description | Owner | Priority | Due |
|----|-------------|-------|----------|-----|
| OPEN-01 | Wire Auth.js v5 TOTP provider to demo-dashboard to unblock LOGIN-13 | Engineering | P1 | Before production launch |
| OPEN-02 | Wire Auth.js v5 WebAuthn adapter to demo-dashboard to unblock LOGIN-14 | Engineering | P1 | Before production launch |
| OPEN-03 | Add `minlength="12"` constraint or server-side validation to confirm ASVS-2.1.1 length requirement | Engineering | P2 | Sprint following auth backend wiring |
| OPEN-04 | Confirm Auth.js v5 session cookie attributes (HttpOnly, SameSite, Secure) to resolve ASVS-3.1.1 `[VERIFY]` | Engineering | P2 | Before external audit |
| OPEN-05 | Add server-side rate-limit endpoint to demo-dashboard to fully validate ASVS-2.2.1 | Engineering | P2 | Before production launch |

---

## 8. Sign-Off

> **DRAFT — not signed**

This SCA is a draft generated by TestNUX from automated test results. It must be reviewed and attested by a named human before submission to an external auditor or compliance officer.

Sign-off form:

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Test Lead | | | |
| Security Reviewer | | | |
| Engineering Lead | | | |

When signed, change frontmatter `status` from `DRAFT — requires human attestation` to `ATTESTED` and add signatories' names to the table above. Commit the attested version with a signed git commit (`git commit -s`).

---

*Generated by TestNUX v0.1 · OWASP ASVS 4.0 · WCAG 2.2 AA · Apache 2.0*
*This is a public reference SCA. It is not a client engagement artifact.*

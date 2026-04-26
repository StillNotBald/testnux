---
slug: easy-login
title: Sign In Page
industry: general
status: DRAFT
r_ids: []
tc_prefix: LOGIN
standards:
  - OWASP ASVS 4.0 v2.1.1
  - OWASP ASVS 4.0 v2.2.1
  - NIST SP 800-63B Section 5
  - WCAG 2.2 SC 2.1.1
  - WCAG 2.2 SC 2.4.3
  - WCAG 2.2 SC 3.3.1
review_required: true
---

## LOGIN-01 — Successful login with valid credentials

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P0 |
| Category  | FUNCTIONAL |
| Standards | OWASP ASVS 2.1.1, NIST SP 800-63B 5.1 |
| Status    | DRAFT |

**Preconditions**
- A user account exists with a known email and password
- The user is logged out

**Steps**
1. Navigate to `/login`
2. Enter the registered email address in the email field
3. Enter the correct password in the password field
4. Click the "Sign in" button

**Expected Result**
The user is authenticated and redirected to the application home page.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-01-success.png`

> [VERIFY] Confirm redirect destination and session token issuance match product specification.

## LOGIN-02 — Login rejected with wrong password

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | FUNCTIONAL |
| Standards | OWASP ASVS 2.2.1, NIST SP 800-63B 5.2 |
| Status    | DRAFT |

**Preconditions**
- A user account exists with a known email
- The user is logged out

**Steps**
1. Navigate to `/login`
2. Enter the registered email
3. Enter an incorrect password
4. Click "Sign in"

**Expected Result**
An authentication error is displayed. The user remains on the login page. The error message does not reveal whether the account exists.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-02-wrong-password.png`

> [VERIFY] Confirm error message wording — must not reveal account existence.

## LOGIN-03 — No account enumeration on unregistered email

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | SECURITY |
| Standards | OWASP ASVS 2.2.1 |
| Status    | DRAFT |

**Preconditions**
- The submitted email address is not registered in the system

**Steps**
1. Navigate to `/login`
2. Enter an unregistered email address
3. Enter any password
4. Click "Sign in"

**Expected Result**
The error message shown is identical (word-for-word) to the wrong-password error. No information about whether the account exists is leaked.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-03-enumeration.png`

> [VERIFY] Confirm server response body and timing do not differ for registered vs unregistered accounts.

## LOGIN-04 — Empty form submission shows inline errors

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | FUNCTIONAL |
| Standards | WCAG 2.2 SC 3.3.1 |
| Status    | DRAFT |

**Preconditions**
- The login form is empty
- The user has not interacted with any fields

**Steps**
1. Navigate to `/login`
2. Click "Sign in" without entering any data

**Expected Result**
Inline validation errors appear for both email and password fields. Focus moves to the first invalid field. Error messages are associated via `aria-describedby`.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-04-empty-form.png`

> [VERIFY] Confirm aria-describedby linkage between inputs and error spans.

## LOGIN-05 — Invalid email format rejected client-side

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | FUNCTIONAL |
| Standards | WCAG 2.2 SC 3.3.1, OWASP ASVS 5.1.3 |
| Status    | DRAFT |

**Preconditions**
- The login form is open

**Steps**
1. Enter "notanemail" in the email field
2. Click "Sign in"

**Expected Result**
An inline error "Enter a valid email address" appears under the email field. No network request is made.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-05-invalid-email.png`

> [VERIFY] Confirm validation fires before a network request is sent.

## LOGIN-06 — Keyboard navigation through form in DOM order

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | ACCESSIBILITY |
| Standards | WCAG 2.2 SC 2.1.1, WCAG 2.2 SC 2.4.3 |
| Status    | DRAFT |

**Preconditions**
- The login page is loaded in a desktop browser

**Steps**
1. Click "Skip to main content" link (or Tab from the browser chrome)
2. Tab through all interactive elements

**Expected Result**
Focus moves in order: email input → password input → Sign in button → Forgot your password? link → Create an account link. A visible focus ring is present at every step.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-06-keyboard-nav.png`

> [VERIFY] Confirm focus ring style meets WCAG 2.2 SC 2.4.11 (2px minimum).

## LOGIN-07 — "Forgot your password?" link reaches reset page

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | FUNCTIONAL |
| Standards | |
| Status    | DRAFT |

**Preconditions**
- The user is on the login page

**Steps**
1. Click the "Forgot your password?" link

**Expected Result**
The user is navigated to the password reset page.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-07-forgot-password.png`

> [VERIFY] Confirm the target URL (/forgot-password) and page title.

## LOGIN-08 — XSS attempt in email field is sanitized

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | SECURITY |
| Standards | OWASP ASVS 5.3.3, OWASP Top 10 A03 |
| Status    | DRAFT |

**Preconditions**
- The login form is open

**Steps**
1. Enter `<script>alert(1)</script>` in the email field
2. Enter any value in the password field
3. Click "Sign in"

**Expected Result**
The script is NOT executed. The server returns a validation error or the input is safely encoded in any error echo.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-08-xss.png`

> [VERIFY] Confirm server-side output encoding and that no JS executes.

## LOGIN-09 — Page interactive within 2.5 seconds

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P0 |
| Category  | PERFORMANCE |
| Standards | WCAG 2.2 SC 2.2.1 |
| Status    | DRAFT |

**Preconditions**
- Stable broadband connection (> 10 Mbps)
- Browser cache is empty (first load)

**Steps**
1. Open browser DevTools → Performance tab
2. Navigate to the login page

**Expected Result**
Largest Contentful Paint (LCP) is <= 2500 ms.

**Evidence**
- [ ] Screenshot: `evidence/LOGIN-09-performance.png`

> [VERIFY] Confirm SLA threshold matches product specification.

## Summary

- Total TCs: 9
- P0: 2 | P1: 7 | P2: 0
- Standards covered: OWASP ASVS 2.1.1, 2.2.1, 5.1.3, 5.3.3; NIST SP 800-63B 5.1, 5.2; WCAG 2.2 SC 2.1.1, 2.4.3, 3.3.1

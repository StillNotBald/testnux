---
slug: easy-login
url: file://fixtures/easy-login.html
generated_by: testnux eval harness (hand-curated)
tc_count: 9
review_required: false
---

## TC-01 — Successful login with valid credentials

**Priority**: P0
**Category**: FUNCTIONAL
**Standards**: OWASP ASVS 2.1.1, NIST SP 800-63B 5.1

**Given** a registered user with a valid email and password
**When** they enter their email and password and click "Sign in"
**Then** they are authenticated and redirected to the application home page

> [VERIFY] Confirm redirect destination matches product specification.

## TC-02 — Login rejected with wrong password

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: OWASP ASVS 2.2.1, NIST SP 800-63B 5.2

**Given** a registered user with a valid email
**When** they enter an incorrect password and click "Sign in"
**Then** the form displays an authentication error message and the user remains on the login page

> [VERIFY] Confirm error message does not reveal whether the email exists (enumeration protection).

## TC-03 — Login rejected with unregistered email

**Priority**: P1
**Category**: SECURITY
**Standards**: OWASP ASVS 2.2.1

**Given** an unregistered email address
**When** the user submits the login form with that email
**Then** the error message is identical to the wrong-password error (no account enumeration)

> [VERIFY] Confirm error message wording matches security requirement.

## TC-04 — Empty form submission

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 3.3.1

**Given** the login form is empty
**When** the user clicks "Sign in" without entering any data
**Then** inline validation errors appear for both email and password fields and focus moves to the first invalid field

> [VERIFY] Confirm error messages are associated with their fields via aria-describedby.

## TC-05 — Invalid email format

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 3.3.1, OWASP ASVS 5.1.3

**Given** the user enters "notanemail" in the email field
**When** they submit the form
**Then** an inline error "Enter a valid email address" appears and the form is not submitted

> [VERIFY] Confirm validation fires before network request.

## TC-06 — Keyboard navigation through form

**Priority**: P1
**Category**: ACCESSIBILITY
**Standards**: WCAG 2.2 SC 2.1.1, WCAG 2.2 SC 2.4.3

**Given** the page is loaded
**When** the user uses Tab to navigate through the form
**Then** focus moves in order: email input → password input → Sign in button → Forgot your password? → Create an account, with a visible focus indicator at each step

> [VERIFY] Confirm focus order matches visual order.

## TC-07 — "Forgot your password?" link navigates correctly

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the user is on the login page
**When** they click "Forgot your password?"
**Then** they are navigated to the password-reset page

> [VERIFY] Confirm the target URL.

## TC-08 — XSS attempt in email field

**Priority**: P1
**Category**: SECURITY
**Standards**: OWASP ASVS 5.3.3, OWASP Top 10 A03

**Given** the login form is open
**When** the user enters `<script>alert(1)</script>` in the email field and submits
**Then** the script is not executed; the server rejects the input or sanitizes it

> [VERIFY] Confirm server-side output encoding is in place.

## TC-09 — Page load performance

**Priority**: P0
**Category**: PERFORMANCE
**Standards**: WCAG 2.2 SC 2.2.1

**Given** a user on a broadband connection
**When** they navigate to the login page
**Then** the page is interactive (Largest Contentful Paint) within 2.5 seconds

> [VERIFY] Confirm SLA matches product specification.

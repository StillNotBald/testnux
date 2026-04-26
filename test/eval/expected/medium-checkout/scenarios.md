---
slug: medium-checkout
url: file://fixtures/medium-checkout.html
generated_by: testnux eval harness (hand-curated)
tc_count: 12
review_required: false
---

## TC-01 — Successful checkout with all required fields

**Priority**: P0
**Category**: FUNCTIONAL
**Standards**: OWASP ASVS 5.1.1

**Given** a logged-in user with items in their cart
**When** they complete the shipping address, select a payment method, accept the terms, and click "Place Order"
**Then** the order is submitted, a confirmation page or message is shown, and an order ID is generated

> [VERIFY] Confirm redirect and order-confirmation behavior per product specification.

## TC-02 — Required shipping fields rejected when empty

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 3.3.1

**Given** all required shipping fields are empty
**When** the user clicks "Place Order"
**Then** inline error messages appear for each required empty field (Full name, Address line 1, City, State, Postal code)

> [VERIFY] Confirm each error is linked via aria-describedby to its input.

## TC-03 — Terms checkbox must be checked to submit

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: OWASP ASVS 5.1.1

**Given** all fields are filled correctly but the terms checkbox is unchecked
**When** the user clicks "Place Order"
**Then** the form is not submitted and an error indicating terms agreement is required is shown

> [VERIFY] Confirm error message text and placement.

## TC-04 — Invalid postal code format rejected

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 3.3.1, OWASP ASVS 5.1.3

**Given** the user enters "ABC" (non-numeric) in the Postal code field
**When** they submit the form
**Then** an inline validation error is shown and the form is not submitted

> [VERIFY] Confirm the regex pattern `[0-9]{5}(-[0-9]{4})?` is enforced.

## TC-05 — Payment method radio buttons — only one selectable at a time

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 1.3.1

**Given** the payment section is visible
**When** the user selects "PayPal" and then "Bank Transfer"
**Then** only "Bank Transfer" is checked; "Card" and "PayPal" are deselected

> [VERIFY] Confirm radio group has a proper `<fieldset>` with `<legend>`.

## TC-06 — Address line 2 is optional

**Priority**: P1
**Category**: FUNCTIONAL

**Given** all required fields are filled and Address line 2 is left empty
**When** the user submits the form
**Then** the order is submitted successfully without requiring Address line 2

> [VERIFY] Confirm backend accepts missing address-line2.

## TC-07 — State dropdown lists all expected options

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the shipping section is visible
**When** the user opens the State dropdown
**Then** the default "Select state" placeholder and at least the defined state options are present

> [VERIFY] Confirm the full list of states matches product specification.

## TC-08 — XSS attempt in name field is sanitized

**Priority**: P1
**Category**: SECURITY
**Standards**: OWASP ASVS 5.3.3, OWASP Top 10 A03

**Given** the checkout form is open
**When** the user enters `<img src=x onerror=alert(1)>` in the Full name field and submits
**Then** the script is not executed; the server safely encodes or rejects the value

> [VERIFY] Confirm server-side encoding in confirmation emails and order history pages.

## TC-09 — Keyboard navigation through all form sections

**Priority**: P1
**Category**: ACCESSIBILITY
**Standards**: WCAG 2.2 SC 2.1.1, WCAG 2.2 SC 2.4.3

**Given** the checkout page is loaded
**When** the user navigates the form using Tab key only
**Then** focus visits each input, select, radio, checkbox, link, and button in document order, with a visible focus ring at each stop

> [VERIFY] Confirm focus ring style meets WCAG 2.2 SC 2.4.11.

## TC-10 — Screen reader announces section headings

**Priority**: P1
**Category**: ACCESSIBILITY
**Standards**: WCAG 2.2 SC 1.3.1, WCAG 2.2 SC 2.4.6

**Given** the page is navigated with a screen reader (e.g. NVDA + Chrome)
**When** the user navigates by heading
**Then** "Shipping Address", "Payment Method", and "Review & Place Order" are announced as h2 headings

> [VERIFY] Confirm heading hierarchy is correct (h1 → h2, no skipped levels).

## TC-11 — Double-click "Place Order" does not submit twice

**Priority**: P1
**Category**: FUNCTIONAL

**Given** all fields are correctly filled
**When** the user double-clicks "Place Order" quickly
**Then** only one order is created (the button is disabled after the first click)

> [VERIFY] Confirm button becomes disabled or the handler is debounced after first click.

## TC-12 — Page loads within 2.5 seconds

**Priority**: P0
**Category**: PERFORMANCE
**Standards**: WCAG 2.2 SC 2.2.1

**Given** a user on a stable broadband connection
**When** they navigate to the checkout page
**Then** the page is interactive (LCP) within 2.5 seconds

> [VERIFY] Confirm SLA matches product specification.

---
slug: medium-checkout
title: Checkout Page
industry: general
status: DRAFT
r_ids: []
tc_prefix: CHECKOUT
standards:
  - OWASP ASVS 4.0 v5.1.1
  - OWASP ASVS 4.0 v5.1.3
  - OWASP ASVS 4.0 v5.3.3
  - WCAG 2.2 SC 1.3.1
  - WCAG 2.2 SC 2.1.1
  - WCAG 2.2 SC 2.4.3
  - WCAG 2.2 SC 3.3.1
review_required: true
---

## CHECKOUT-01 — Successful checkout with all required fields

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P0 |
| Category  | FUNCTIONAL |
| Standards | OWASP ASVS 5.1.1 |
| Status    | DRAFT |

**Preconditions**
- User is logged in with items in cart

**Steps**
1. Navigate to `/checkout`
2. Fill in Full name, Address line 1, City; select State; enter Postal code
3. Select a payment method radio button
4. Check the "I agree to the Terms of Service" checkbox
5. Click "Place Order"

**Expected Result**
Order is submitted. Confirmation page or message is shown. An order ID is generated.

**Evidence**
- [ ] Screenshot: `evidence/CHECKOUT-01-success.png`

> [VERIFY] Confirm redirect and order confirmation behavior per product specification.

## CHECKOUT-03 — Terms checkbox required before submit

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | FUNCTIONAL |
| Standards | OWASP ASVS 5.1.1 |
| Status    | DRAFT |

**Preconditions**
- All fields are correctly filled
- Terms checkbox is unchecked

**Steps**
1. Fill in all required fields
2. Leave the terms checkbox unchecked
3. Click "Place Order"

**Expected Result**
The form is not submitted. An error indicating agreement to terms is required is displayed.

**Evidence**
- [ ] Screenshot: `evidence/CHECKOUT-03-terms.png`

> [VERIFY] Confirm error message text and placement matches design specification.

## CHECKOUT-09 — Keyboard navigation covers all interactive elements

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P1 |
| Category  | ACCESSIBILITY |
| Standards | WCAG 2.2 SC 2.1.1, WCAG 2.2 SC 2.4.3 |
| Status    | DRAFT |

**Preconditions**
- Desktop browser with keyboard only

**Steps**
1. Load the checkout page
2. Press Tab repeatedly to traverse all elements

**Expected Result**
Focus visits: Full name → Address line 1 → Address line 2 → City → State → Postal code → Card radio → PayPal radio → Bank radio → Terms checkbox → Newsletter checkbox → Terms link → Privacy link → Place Order button.

**Evidence**
- [ ] Screenshot: `evidence/CHECKOUT-09-keyboard.png`

> [VERIFY] Confirm full tab order and that no interactive element is skipped.

## Summary

- Total TCs: 12
- P0: 2 | P1: 10 | P2: 0
- Standards covered: OWASP ASVS 5.1.1, 5.1.3, 5.3.3; WCAG 2.2 SC 1.3.1, 2.1.1, 2.4.3, 3.3.1

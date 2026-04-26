---
slug: hard-dashboard
title: Admin Dashboard
industry: general
status: DRAFT
r_ids: []
tc_prefix: DASH
standards:
  - OWASP ASVS 4.0 v4.1.1
  - NIST SP 800-53 AC-3
  - WCAG 2.2 SC 1.3.1
  - WCAG 2.2 SC 2.1.1
  - WCAG 2.2 SC 2.4.1
  - WCAG 2.2 SC 2.4.3
  - WCAG 2.2 SC 2.4.11
  - WCAG 2.2 SC 4.1.2
review_required: true
---

## DASH-01 — Data table renders with correct sort controls

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P0 |
| Category  | FUNCTIONAL |
| Standards | WCAG 2.2 SC 1.3.1 |
| Status    | DRAFT |

**Preconditions**
- Admin user is logged in
- At least one user record exists

**Steps**
1. Navigate to `/admin/dashboard`
2. Observe the users table header row

**Expected Result**
Table renders. "Name" column header button has `aria-sort="ascending"`. Other sortable column buttons have `aria-sort="none"`.

**Evidence**
- [ ] Screenshot: `evidence/DASH-01-table-render.png`

> [VERIFY] Confirm initial sort state matches API default ordering.

## DASH-06 — Bulk delete blocked for Editor role

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P0 |
| Category  | SECURITY |
| Standards | OWASP ASVS 4.1.1, NIST SP 800-53 AC-3 |
| Status    | DRAFT |

**Preconditions**
- User is logged in with "Editor" role (not Admin)

**Steps**
1. Navigate to `/admin/dashboard` as an Editor
2. Observe "Delete Selected" button
3. If visible, attempt to click it

**Expected Result**
Either the button is absent/disabled for Editor role, or clicking it returns a 403 Forbidden response. No users are deleted.

**Evidence**
- [ ] Screenshot: `evidence/DASH-06-bulk-delete-blocked.png`

> [VERIFY] Confirm server-side role enforcement is in place (do not rely on UI hiding alone).

## DASH-08 — Invite modal opens with focus on first field

| Field     | Value |
|-----------|-------|
| R-ID      | [] [VERIFY] |
| Priority  | P0 |
| Category  | ACCESSIBILITY |
| Standards | WCAG 2.2 SC 2.4.3, WCAG 2.2 SC 2.4.11 |
| Status    | DRAFT |

**Preconditions**
- Admin user is logged in
- Invite User button is visible

**Steps**
1. Click the "Invite User" button
2. Observe modal opening

**Expected Result**
The invite modal opens. Focus moves to the email input (`#invite-email`). Background page content is inert (not focusable by Tab). Visible focus ring is present.

**Evidence**
- [ ] Screenshot: `evidence/DASH-08-modal-focus.png`

> [VERIFY] Confirm that Tab cannot leave the modal while it is open (focus trap).

## Summary

- Total TCs: 14
- P0: 3 | P1: 11 | P2: 0
- Standards covered: OWASP ASVS 4.1.1; NIST SP 800-53 AC-3; WCAG 2.2 SC 1.3.1, 2.1.1, 2.4.1, 2.4.3, 2.4.11, 4.1.2

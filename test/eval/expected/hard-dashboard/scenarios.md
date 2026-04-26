---
slug: hard-dashboard
url: file://fixtures/hard-dashboard.html
generated_by: testnux eval harness (hand-curated)
tc_count: 14
review_required: false
---

## TC-01 — Data table renders with column sort controls

**Priority**: P0
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 1.3.1

**Given** the admin dashboard is loaded with user data
**When** the page renders
**Then** the table displays rows with sortable column headers that have aria-sort="ascending" or aria-sort="none" set correctly

> [VERIFY] Confirm initial sort column (Name ascending) matches data returned from API.

## TC-02 — Sort by column name ascending/descending

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 1.3.1

**Given** the users table is loaded
**When** the user clicks the "Name" column sort button (currently aria-sort="ascending")
**Then** rows re-sort in descending order and aria-sort changes to "descending" on the Name button

> [VERIFY] Confirm aria-sort toggles correctly through ascending → descending → none.

## TC-03 — Search filters table results in real time

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the users table shows multiple users
**When** the user types "Alice" in the search input
**Then** only rows matching "Alice" are displayed; non-matching rows are hidden or removed; aria-live="polite" announces the result count

> [VERIFY] Confirm aria-controls="users-table" is wired to trigger live region update.

## TC-04 — Role filter dropdown narrows results

**Priority**: P1
**Category**: FUNCTIONAL

**Given** users of multiple roles exist in the table
**When** the user selects "Admin" from the role filter dropdown
**Then** only Admin-role users are displayed

> [VERIFY] Confirm filter combines with search (AND logic vs OR) per product specification.

## TC-05 — Clear filters button resets search and role filter

**Priority**: P1
**Category**: FUNCTIONAL

**Given** search input contains text and a role filter is active
**When** the user clicks "Clear" (aria-label="Clear all filters")
**Then** search input is empty, role filter returns to "All roles", and the full user list is shown

> [VERIFY] Confirm "Clear" button is keyboard focusable.

## TC-06 — Bulk delete requires admin role

**Priority**: P0
**Category**: SECURITY
**Standards**: OWASP ASVS 4.1.1, NIST SP 800-53 AC-3

**Given** the user has "Editor" role (not Admin)
**When** they attempt to click "Delete Selected"
**Then** the action is blocked — either the button is absent, disabled, or the API returns 403

> [VERIFY] Confirm the button's data-requires-role="admin" is enforced server-side.

## TC-07 — Select all checkbox selects all visible rows

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: WCAG 2.2 SC 4.1.2

**Given** the users table is visible
**When** the user clicks the "Select all users" header checkbox
**Then** all row checkboxes are checked and the select-all checkbox is in checked state (aria-checked="true")

> [VERIFY] Confirm behavior when only a subset of rows are checked (indeterminate state).

## TC-08 — Invite user modal opens with correct focus management

**Priority**: P0
**Category**: ACCESSIBILITY
**Standards**: WCAG 2.2 SC 2.4.3, WCAG 2.2 SC 2.4.11

**Given** the user has admin role
**When** they click "Invite User"
**Then** the invite modal opens, focus moves to the first interactive element inside the dialog (invite email input), and background content is inert

> [VERIFY] Confirm `<dialog>` uses the native showModal() API or equivalent ARIA pattern.

## TC-09 — Multi-step modal: Next advances to step 2

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the invite modal is open on step 1 with a valid email entered
**When** the user clicks "Next"
**Then** step 2 (Assign Role) is shown, step 1 is hidden, and aria-current="step" moves to the step 2 indicator

> [VERIFY] Confirm Back button re-enables when step 2 is shown.

## TC-10 — Multi-step modal: Confirm shows review of entered data

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the user has completed steps 1 and 2 of the invite modal
**When** they advance to step 3
**Then** the confirmation step displays the entered email, name, and selected role in the review DL

> [VERIFY] Confirm data bindings between form fields and confirmation display.

## TC-11 — Cancel closes modal and returns focus to trigger

**Priority**: P1
**Category**: ACCESSIBILITY
**Standards**: WCAG 2.2 SC 2.4.3

**Given** the invite modal is open
**When** the user clicks "Cancel"
**Then** the modal closes, focus returns to the "Invite User" button, and background content is interactive again

> [VERIFY] Confirm Escape key also closes the modal.

## TC-12 — Pagination: Next/Previous navigate pages

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the table has more than one page of results
**When** the user clicks "Next page"
**Then** the next page of results is loaded, the page indicator updates ("Page 2 of 5"), and "Previous page" becomes enabled

> [VERIFY] Confirm pagination is controlled server-side, not client-only.

## TC-13 — Rows per page changes page size

**Priority**: P1
**Category**: FUNCTIONAL

**Given** the table is showing 10 rows (default)
**When** the user selects "25" from the rows-per-page select
**Then** up to 25 rows are shown and the page indicator updates

> [VERIFY] Confirm selection persists on page navigation.

## TC-14 — Skip navigation link reaches main content

**Priority**: P1
**Category**: ACCESSIBILITY
**Standards**: WCAG 2.2 SC 2.4.1

**Given** a keyboard user is at the top of the page
**When** they press Tab once and then Enter on "Skip to main content"
**Then** focus moves to the `<main>` element (tabindex="-1") and the viewport scrolls to main content

> [VERIFY] Confirm skip link is visible on focus (WCAG 2.2 SC 2.4.11).

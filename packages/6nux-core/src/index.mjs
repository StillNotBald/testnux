// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0
// @leapnux/6nux-core — shared core for the 6-NUX product family
//
// Status: shared utilities populated as of v0.4.2-alpha.1 (conventions, ids, utils).
// Validators + schemas remain placeholders pending v0.6.0+. See docs/ARCHITECTURE.md.
//
// AP-F2 (audit ref: docs/audit/2026-04-28/SYNTHESIS-5nux.md):
// schemas.mjs previously exported 5 null symbols (rxxSchema, adrSchema,
// sprintFolderSchema, testPlanSchema, rtmSchema). These have been removed from
// the barrel — null schema exports masked missing implementations and could cause
// consumers to silently skip validation. Schemas ship in v0.6.0+ under schemas/v1/.

export const VERSION = '0.4.3-alpha.1';
export const STATUS = 'active';

export * from './conventions.mjs';
// schemas.mjs intentionally NOT re-exported — deferred to v0.6.0+ (AP-F2).
// See schemas.mjs for the full rationale and migration note.
export * from './ids.mjs';
export * from './utils.mjs';
// validators.mjs is intentionally NOT re-exported here. Stub functions
// that throw 'not yet implemented' must not appear in the public API.
// Validators planned for v0.6.0+; see validators.mjs for details.

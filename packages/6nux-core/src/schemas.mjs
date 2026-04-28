// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

// Schema definitions for 6-NUX artifacts.
//
// AP-F2 (audit ref: docs/audit/2026-04-28/SYNTHESIS-5nux.md):
// The five artifact schemas (rxx, adr, sprintFolder, testPlan, rtm) were
// previously exported as `null` from this module, which polluted the public
// barrel with empty symbols that could silently cause consumers to skip
// validation thinking schemas had been loaded.
//
// Schemas are deferred to v0.6.0+ and will ship under schemas/v1/ following
// the versioned-schema pattern established in the 6-NUX architecture.
// See docs/ARCHITECTURE.md and the stub validators in validators.mjs for context.
//
// This file intentionally exports nothing until v0.6.0.
// Do NOT add null / undefined exports — they mask missing implementations.

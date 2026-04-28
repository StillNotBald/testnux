---
schema: rtm-v1
title: Requirements Traceability Matrix
---
<!-- branchnux:rtm generated -->
<!-- Generated: 2026-04-27 by branchnux rtm. Do NOT edit the table rows directly. -->
<!-- Human-edit zone: the Notes column inside each row marker pair survives regeneration. -->

# Requirements Traceability Matrix

**Generated:** 2026-04-27  
**Coverage:** 58/58 requirements have test evidence (100% overall)

## Summary

| Metric | Count |
|--------|-------|
| Total requirements | 58 |
| With sprint evidence | 0 |
| With code annotations | 3 |
| With test evidence | 58 |
| Coverage | 100% |

## Traceability Table

> **Marker convention:** Each row is wrapped in `<!-- branchnux:row R-XX begin/end -->` markers.
> Edit the **Notes** column freely — it survives regeneration. Do not edit other columns by hand.

| R-ID | Title | Status | Sprint | Code | Tests | Backlog | Notes |
|------|-------|--------|--------|------|-------|---------|-------|
<!-- branchnux:row R-01 begin -->
| R-01 | `branchnux init <slug>` scaffolds a test-pass folder | DONE | — | `packages/branchnux/src/parsers/test-plan.mjs:194`, `packages/branchnux/src/parsers/test-plan.mjs:194`, `packages/branchnux/src/lib/parser.mjs:20` *(+23)* | `2026-04-27_branchnux-cli`, `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-01 end -->
<!-- branchnux:row R-02 begin -->
| R-02 | `branchnux report <folder>` generates XLSX + HTML | DONE | — | `packages/branchnux/src/parsers/test-plan.mjs:194`, `packages/branchnux/src/lib/parser.mjs:182`, `packages/branchnux/src/commands/br.mjs:85` *(+2)* | `2026-04-27_branchnux-cli`, `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-02 end -->
<!-- branchnux:row R-03 begin -->
| R-03 | `branchnux validate <folder>` lints markdown frontmatter | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-03 end -->
<!-- branchnux:row R-04 begin -->
| R-04 | `branchnux demo` opens the bundled demo report | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-04 end -->
<!-- branchnux:row R-05 begin -->
| R-05 | `branchnux doctor` runs preflight environment checks | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-05 end -->
<!-- branchnux:row R-06 begin -->
| R-06 | `branchnux mcp` starts the MCP server on stdio | PLANNED | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-06 end -->
<!-- branchnux:row R-07 begin -->
| R-07 | `branchnux rtm` generates TRACEABILITY.md | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-07 end -->
<!-- branchnux:row R-08 begin -->
| R-08 | `branchnux sca init <surface>` scaffolds an SCA document | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-08 end -->
<!-- branchnux:row R-09 begin -->
| R-09 | `branchnux sca generate <surface>` fills evidence rows | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-09 end -->
<!-- branchnux:row R-10 begin -->
| R-10 | `branchnux sca pdf <surface>` renders SCA to PDF | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-10 end -->
<!-- branchnux:row R-11 begin -->
| R-11 | `branchnux sca oscal <surface>` emits NIST OSCAL JSON | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-11 end -->
<!-- branchnux:row R-12 begin -->
| R-12 | `branchnux br init <id>` scaffolds a BR-XX entry | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-12 end -->
<!-- branchnux:row R-13 begin -->
| R-13 | `branchnux br link <br-id> <r-ids>` links BR-XX to R-IDs | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-13 end -->
<!-- branchnux:row R-14 begin -->
| R-14 | `branchnux br rtm` renders UAT_TRACEABILITY.md | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-14 end -->
<!-- branchnux:row R-15 begin -->
| R-15 | `branchnux sign <surface>` records an HMAC-chained attestation | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-15 end -->
<!-- branchnux:row R-16 begin -->
| R-16 | `branchnux sign pdf <surface>` renders signoff ledger to PDF | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-16 end -->
<!-- branchnux:row R-17 begin -->
| R-17 | `branchnux sign stale-check <surface>` flags stale entries | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-17 end -->
<!-- branchnux:row R-18 begin -->
| R-18 | `branchnux sign --justify-with-llm` drafts LLM justification | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-18 end -->
<!-- branchnux:row R-19 begin -->
| R-19 | `branchnux run <slug>` executes an env-suffixed test pass | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-19 end -->
<!-- branchnux:row R-20 begin -->
| R-20 | `branchnux compare <slug> <env-a> <env-b>` diffs env results | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-20 end -->
<!-- branchnux:row R-21 begin -->
| R-21 | `branchnux visual baseline <slug>` captures baseline screenshots | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-21 end -->
<!-- branchnux:row R-22 begin -->
| R-22 | `branchnux visual compare <slug>` diffs against baseline | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-22 end -->
<!-- branchnux:row R-23 begin -->
| R-23 | `branchnux discover <url>` generates scenarios via Claude API | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-23 end -->
<!-- branchnux:row R-24 begin -->
| R-24 | `branchnux plan <slug>` generates test-plan.md via Claude API | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-24 end -->
<!-- branchnux:row R-25 begin -->
| R-25 | `branchnux codify <slug>` generates spec.ts via Claude API | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-25 end -->
<!-- branchnux:row R-26 begin -->
| R-26 | `branchnux enrich <slug>` runs three append-only enrichment passes | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-26 end -->
<!-- branchnux:row R-27 begin -->
| R-27 | `branchnux batch-plan` runs parallel multi-page pipeline | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-27 end -->
<!-- branchnux:row R-28 begin -->
| R-28 | Three-track folder structure | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-28 end -->
<!-- branchnux:row R-29 begin -->
| R-29 | `[VERIFY]` markers on every LLM-generated cell | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-29 end -->
<!-- branchnux:row R-30 begin -->
| R-30 | HMAC-chained signoff ledger with chain verification | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-30 end -->
<!-- branchnux:row R-31 begin -->
| R-31 | Tamper-evident PDF rendering with hash-chain badge | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-31 end -->
<!-- branchnux:row R-32 begin -->
| R-32 | Multi-reviewer N-of-M attestation via BR layer | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-32 end -->
<!-- branchnux:row R-33 begin -->
| R-33 | Append-only enrichment passes with marker boundaries | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-33 end -->
<!-- branchnux:row R-34 begin -->
| R-34 | `--max-spend` cost gates on LLM calls | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-34 end -->
<!-- branchnux:row R-35 begin -->
| R-35 | `--dry-run` for cost estimate without API call | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-35 end -->
<!-- branchnux:row R-36 begin -->
| R-36 | Plan-only mode for reports without execution log | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-36 end -->
<!-- branchnux:row R-37 begin -->
| R-37 | JSON-mode output for CI/CD pipeline integration | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-37 end -->
<!-- branchnux:row R-38 begin -->
| R-38 | `general` industry bundle | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-38 end -->
<!-- branchnux:row R-39 begin -->
| R-39 | `ecommerce` industry bundle | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-39 end -->
<!-- branchnux:row R-40 begin -->
| R-40 | `edu` industry bundle | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-40 end -->
<!-- branchnux:row R-41 begin -->
| R-41 | `fintech` industry bundle | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-41 end -->
<!-- branchnux:row R-42 begin -->
| R-42 | `gov` industry bundle | DONE | — | `packages/branchnux/src/commands/validate.mjs:53`, `packages/branchnux/src/commands/validate.mjs:135`, `packages/branchnux/src/commands/validate.mjs:149` | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-42 end -->
<!-- branchnux:row R-43 begin -->
| R-43 | `healthcare` industry bundle | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-43 end -->
<!-- branchnux:row R-44 begin -->
| R-44 | `malaysia-banking` industry bundle | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-44 end -->
<!-- branchnux:row R-45 begin -->
| R-45 | NIST OSCAL 1.1.2 emission | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-45 end -->
<!-- branchnux:row R-46 begin -->
| R-46 | Standards alignment table in every report | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-46 end -->
<!-- branchnux:row R-47 begin -->
| R-47 | Threat coverage table in HTML reports | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-47 end -->
<!-- branchnux:row R-48 begin -->
| R-48 | Per-TC evidence screenshots in evidence/ folder | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-48 end -->
<!-- branchnux:row R-49 begin -->
| R-49 | Bidirectional R-XX → TC-XX → evidence → signoff traceability | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-49 end -->
<!-- branchnux:row R-50 begin -->
| R-50 | Self-contained HTML reports (no external dependencies) | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-50 end -->
<!-- branchnux:row R-51 begin -->
| R-51 | GRC platform export compatibility | PLANNED | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-51 end -->
<!-- branchnux:row R-52 begin -->
| R-52 | 100% test pass rate before any release | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-52 end -->
<!-- branchnux:row R-53 begin -->
| R-53 | Zero ESLint errors before any release | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-53 end -->
<!-- branchnux:row R-54 begin -->
| R-54 | Template lint: security check on shipped templates | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-54 end -->
<!-- branchnux:row R-55 begin -->
| R-55 | DCO sign-off on every commit | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-55 end -->
<!-- branchnux:row R-56 begin -->
| R-56 | Apache 2.0 license + SPDX headers on every code file | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-56 end -->
<!-- branchnux:row R-57 begin -->
| R-57 | No proprietary client references in OSS codebase | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-57 end -->
<!-- branchnux:row R-58 begin -->
| R-58 | Cross-platform: Node 20+, npm 10+, Windows / macOS / Linux | DONE | — | — | `2026-04-27_branchnux-cli` | — |  |
<!-- branchnux:row R-58 end -->

---

*This file is auto-generated by `branchnux rtm`. Re-run to update evidence columns.*
*To preserve hand-written notes, keep them inside the row marker pairs.*
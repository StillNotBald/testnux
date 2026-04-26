# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.2.0-alpha.1] - 2026-04-27

The "v0.2 capability-parity" alpha. Wires up the LLM agent suite (`plan`, `codify`, `enrich`, `batch-plan`), ports the deterministic report generator (`testnux report` is no longer a stub), adds the signoff suite (`sign pdf`, `sign stale-check`, multi-reviewer N-of-M, OSCAL assessment-log, optional LLM-drafted justification), and ships real implementations of `run`/`compare` (per-env testing) and `visual baseline`/`visual compare` (pixel-diff regression).

189 new tests added (152 → 365). All green.

> **alpha** because the v0.2 LLM agents are wired but not yet hardened with eval-set regression testing across many real customer pages. Use in preview; expect prompt-quality iteration before 0.2.0 stable.

### Added

**LLM agent suite (real Claude API):**
- `testnux plan <slug>` — converts `scenarios.md` → `test-plan.md` with frontmatter, R-ID mapping, [VERIFY] markers. Mirrors the proven `discover.mjs` pattern (dry-run, --max-spend, --json, exit codes 0/1/2/3).
- `testnux codify <slug>` — converts `test-plan.md` → Playwright `spec.ts`, preserving template patterns (XFF header, `form.requestSubmit`, evidence afterEach hook, `waitForNextTotpWindow`). Includes hand-edit detection (writes `spec.generated.ts` if existing `spec.ts` looks human-edited) and a `--safe` flag.
- `testnux enrich <slug>` — three sequential append-only enrichment passes: `design-review` (a11y/visual/mobile/semantic-tokens), `qa-structural` (boundary/error-states/empty-zero-null), `graph-context` (cross-surface integration). Marker-bounded blocks (`<!-- testnux:enrich:<pass> begin/end -->`) replace-on-rerun without touching human edits outside the markers.
- `testnux batch-plan --pages <list>` — parallel multi-page pipeline (chunked dispatch via `--pages-per-agent`). Per-page failure isolation, cumulative `--max-spend` enforcement, replacement-agent pattern (one page failing doesn't abort the batch), final summary table.
- Eval harness at `test/eval/` — 3 fixture pages (easy/medium/hard) with golden outputs, scoring functions (precision/recall on TC count, R-ID format, [VERIFY] placement, standards alignment), CLI runner (`node test/eval/run.mjs --threshold 0.7`), `--mock` mode for CI.

**Report generator (P1 — the headline command):**
- `testnux report <folder>` — no longer a stub. Generates `<slug>-test-plan.xlsx` (exceljs, 2 sheets: TC matrix + standards alignment, color-coded P0/P1/P2, dropdown validation on status) and `<slug>-execution-report.html` (self-contained, inlined CSS+JS, base64-embedded screenshots, TOC sidebar, status tabs, standards alignment matrix, threat coverage table, summary banner). Plan-only mode via `--plan-only`. Fail-on-missing gate via `--fail-on-missing`. `--open` to launch the HTML in default browser.
- New parsers: `src/parsers/test-plan.mjs`, `src/parsers/execution-log.mjs` (handles emoji-prefixed statuses, normalizes status taxonomy).
- New renderers: `src/renderers/xlsx.mjs`, `src/renderers/html.mjs`.
- Replaced the hand-crafted sample at `examples/demo-dashboard/output/login-execution-report.html` with a real `testnux report` output (from a live Playwright run against the demo-dashboard project — 13 PASS / 2 BLOCKED-CONFIG out of 15 TCs, 13 embedded screenshots).

**Signoff suite (S1-S5):**
- `testnux sign pdf <surface>` (S1) — renders the UAT signoff ledger to PDF via puppeteer-core. Includes hash-chain verification badge (green ✓ or red CHAIN BROKEN banner) + per-entry block with reviewer name/role/timestamp + truncated signature hash + canonical disclaimer footer.
- `testnux sign stale-check <surface> --threshold 90d [--strict]` (S2) — flags signoff entries older than threshold. CI gate via `--strict` (exits 1 on any stale).
- OSCAL `assessment-log` integration (S3) — `testnux sca oscal` now populates `responsible-parties` (from uat-log reviewers, UUID v5 derived) + `assessments[].assessment-log.entries` (from uat-log entries) + `assessments[].subjects[]` (per TC). Validated against OSCAL 1.1.2 schema.
- `testnux sign --justify-with-llm` (S4) — optional Claude API call drafts justification text from TC result + control mapping + evidence summary. Reviewer edits the draft; `[VERIFY] LLM-drafted, reviewer-confirmed:` prefix is auto-applied. Graceful degrade if `CLAUDE_API_KEY` or `@anthropic-ai/sdk` missing.
- Multi-reviewer N-of-M (S5) — new `required_reviewers` field in BR frontmatter (`role: QA, count: 1` etc). `testnux sign` enforces all required role+count combos before marking a BR complete. `testnux br rtm` shows partial-attestation status (`✓ QA(1/1) ✗ Compliance(0/1) — PARTIAL (2/3)`). New chained attestation log at `<folder>/br-attestations.jsonl`. Revocation supported via `testnux sign --revoke --tc <TC-ID> --role <role>` (append-only, never deletes).

**Capability-parity (P2-P4):**
- `testnux run <slug> --env <env>` (P3) — env-suffixed test-pass folders (`<date>_<slug>-<env>/`). Auto-injects `env:` and `base_url:` into frontmatter. Wraps `runReport` so output filenames include the env (`<slug>-<env>-execution-report.html`).
- `testnux compare <slug> <envA> <envB>` (P3) — diffs TC results between two envs. Per-TC verdict: MATCH / PROMOTION / REGRESSION / DIVERGE / MISSING-A / MISSING-B. CI gate via `--threshold 0` (exits 1 on any regression). Markdown table output, JSON mode (NDJSON).
- `testnux visual baseline <slug>` (P4) — captures full-page Playwright screenshots, saves to `<folder>/visual-baseline/<TC-ID>.png`. Three URL discovery modes: `--urls TC-01=...,TC-02=...`, `visual_urls:` frontmatter map, or fallback to `--base-url` for every TC.
- `testnux visual compare <slug> --threshold 0.05 [--strict]` (P4) — captures current screenshots, diffs against baseline using pixelmatch (optional dep), saves diff PNGs to `<folder>/visual-diff/`. Markdown diff% table. `--strict` exits 2 on any diff above threshold. Graceful degrade when pixelmatch/pngjs not installed (screenshot-only mode).
- `pixelmatch` and `pngjs` added as `optionalDependencies`. `@playwright/test` added as optional peer dep.

**Adoption polish:**
- README — demoted adoption-checklist below "How TestNUX compares" (inviting, not gating); added "What you get" section after Install with the HTML report capabilities described.
- `docs/concepts.md` — full rewrite to story-style (~1600 words). Three concrete moments (auditor asks for R-23 evidence; status taxonomy ambiguity; HMAC chain forgery vectors) with reference glossary at the end.
- `docs/getting-started.md` — three-tier "first 15 minutes" path (60s `npx testnux demo` → 5m `testnux init my-page` → 15m edit + Playwright run + report).

### Changed

- `bin/testnux.mjs` — `sign` is now a parent command with `pdf` and `stale-check` subcommands (legacy `testnux sign <surface>` invocation preserved).
- `report.mjs` exit code on missing `test-plan.md` is now 1 (was 0 with stub message); `cli.test.mjs` updated to match.

### Fixed

- `src/parsers/execution-log.mjs` — emoji status regex now uses `u` flag (no-misleading-character-class).
- Multi-agent merge of `bin/testnux.mjs` (Wave 1 had 5 agents touching it concurrently) — coordinated through subcommand grouping.

### Security

- DOMPurify sanitization on PDF rendering (S1) for any user-provided strings (reviewer name, role, justification, TC ID).
- HMAC-SHA256 chain format unchanged (backwards compatible with v0.1.x uat-log.jsonl).
- Same `TESTNUX_OSCAL_NAMESPACE` UUID (`b0ab198a-bced-48a9-ae15-e5c4ca770a79`) — never changes across versions.
- Optional LLM justification (S4) gracefully degrades when `CLAUDE_API_KEY` or `@anthropic-ai/sdk` missing.

### Test coverage

- 152 → **365 tests** (+213 new). 16 test files, all green.
- New test files: `test/plan.test.mjs` (22), `test/codify.test.mjs` (25), `test/enrich.test.mjs` (22), `test/batch.test.mjs` (23), `test/sign-pdf.test.mjs` (8), `test/sign-stale.test.mjs` (15), `test/br-attestations.test.mjs` (15), `test/report.test.mjs` (20), `test/visual.test.mjs` (39), eval harness fixtures + scorer.
- Existing `test/oscal.test.mjs` extended with 23 new tests for the assessment-log integration.

### Notes

- **Not yet on npm**. v0.1.1 remains "Latest" on npm and `latest` tag on GitHub. Install this alpha via `npm install testnux@0.2.0-alpha.1` once published.
- **CLAUDE_API_KEY required** for `plan`, `codify`, `enrich`, `batch-plan`, and `sign --justify-with-llm`. All other commands work without it.
- **@anthropic-ai/sdk** is an optional peer dep — install only if using LLM agents.
- **@playwright/test** is an optional peer dep — install only if using `visual baseline`/`compare` or running generated specs.

---

## [0.1.1] - 2026-04-26

### Fixed
- `testnux validate` no longer rejects scaffolded templates as errors. Placeholder R-IDs (`R-XX`, `R-YY`, `R-ZZ`) and tc_prefix placeholders (`MYPROJ`, `YOUR-PREFIX`, `EXAMPLE`, `TBD`, etc.) now produce **warnings** instead of errors with exit code 0. Use `--strict` to treat warnings as errors. Real invalid formats (e.g., `RR-1`, `r-01`) still error. — Closes the `init → validate` UX bug surfaced in the v0.1.0 self-test.

### Added
- New rule `r_ids.placeholder` and `tc_prefix.placeholder` in validate output (warning level by default).

---

## [0.1.0] - 2026-04-26

### Added
- First public npm release. CLI surface includes `init`, `report`, `validate`, `demo`, `doctor`, `rtm`, `sca`, `discover`, `plan`, `codify`, `enrich`, `batch-plan`, `br`, `sign`, `env`, `visual`, `mcp` (17 commands).
- Templates for test-plan, spec.ts, README, business-requirements, SCA v1.0, uat-log.jsonl.
- 6 industry standards bundles: general, fintech, healthcare, gov, edu, ecommerce (~140 controls total).
- JSON Schema for test-plan frontmatter validation.
- `examples/demo-dashboard/` with sample HTML execution report (1344 lines, self-contained), sample SCA, sample UAT sign-off log, sample test plan.
- 152 unit tests covering parser, graph, OSCAL emit, HMAC chain (10 security-critical tamper-detection tests), CLI smoke, discover Claude API integration, SCA HTML sanitization.
- Branch protection on `main` (linear history, required CI checks, force-push blocked, deletion blocked).
- Repo security: secret scanning, push protection, Dependabot security + version updates, Private Vulnerability Reporting, CODEOWNERS.

### Removed
- Internal dogfooding artifacts (`sprint-log/`, `testing-log/`, `requirements/`) — meta-narrative of how testnux was built; not relevant to OSS users.
- v0.3 integrations folder (`integrations/gstack/`, `integrations/claude-code-mcp/`) — feature is on the roadmap (v0.3 target) but the in-progress code did not belong in the v0.1 release.

### Security
- HMAC-SHA256 hash-chained UAT sign-off log with tamper detection (mutation, signature overwrite, deletion, reordering, wrong-secret).
- DOMPurify sanitization on SCA-markdown → HTML rendering (strips `<script>`, `<iframe>`, `<form>`, all `on*` event handlers, `javascript:` URLs).
- SSRF + URL-scheme allowlist on `discover` command (rejects `file://`, `javascript:`, `data:`, AWS metadata IPs).
- CI lint script blocks PRs that introduce `fetch()`, `child_process`, `eval()`, or unrestricted `process.env.*` in template files.
- GitHub Actions pinned to commit SHAs (with version-tag comments for Dependabot).
- DCO check via inline shell script (zero external action dep — supply-chain safe).
- OSCAL UUID generation uses RFC-4122 v5 (`uuid` package) with stable namespace.

---

## [0.0.1] - 2026-04-26

### Added
- Initial project scaffold: CLI entry point, command structure, templates, schemas, and docs. (Internal pre-publish version; not on npm.)

[Unreleased]: https://github.com/StillNotBald/testnux/compare/v0.2.0-alpha.1...HEAD
[0.2.0-alpha.1]: https://github.com/StillNotBald/testnux/releases/tag/v0.2.0-alpha.1
[0.1.1]: https://github.com/StillNotBald/testnux/releases/tag/v0.1.1
[0.1.0]: https://github.com/StillNotBald/testnux/releases/tag/v0.1.0
[0.0.1]: https://github.com/StillNotBald/testnux/releases/tag/v0.0.1

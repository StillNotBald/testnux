---
version: "0.3"
status: ACTIVE
last_updated: 2026-04-26
---

# TestNUX — Requirements Ledger

This file is the authoritative requirements ledger for **testnux itself**, dogfooding the
three-track discipline (requirements → sprint log → testing log → RTM → UAT) that the tool
produces for its users. Every R-ID here is the same kind of artifact that a `testnux init`
user would maintain for their own application.

**Why dogfood?** TestNUX can only credibly teach the discipline by living it. This file is
parsed by `testnux rtm` to generate `requirements/TRACEABILITY.md`. Human-edited Notes in
that file survive regeneration via the marker convention defined in `src/commands/rtm.mjs`.

---

## v0.1 — Foundation

The v0.1 milestone ships a functional CLI with five commands, the core templates, the JSON Schema
validator, a single industry-standards bundle, and the Apache 2.0 license notice.

---

## R-01 — CLI binary with v0.1 command set

**Status:** DONE

The `bin/testnux.mjs` entry point wires up the Commander.js program with the five v0.1
commands: `init`, `report`, `validate`, `demo`, and `doctor`. The binary is declared in
`package.json#bin` and published as the `testnux` npm package.

---

## R-02 — init scaffolds per-page test-pass folders

**Status:** DONE

`testnux init <slug>` copies the `templates/` directory into a date-prefixed folder under
`testing-log/` (e.g. `testing-log/2026-04-26_login/`), substituting all `{{placeholder}}`
tokens. Idempotent: re-running on the same slug+date skips files that already exist, preserving
hand-edited content.

---

## R-03 — report generator (HTML + XLSX output)

**Status:** STUB

`testnux report <folder>` is currently a documented stub. The proven reference implementation
(33+ page test plans, self-contained HTML, multi-tab XLSX) must be ported into
`src/commands/report.mjs`. The stub documents the port checklist inline so no context is lost.

---

## R-04 — validate lints test-plan frontmatter

**Status:** DONE

`testnux validate <folder>` walks all `.md` files, extracts YAML frontmatter via gray-matter,
and validates against `schemas/test-plan-frontmatter.schema.json`. Required fields: `status`,
`industry`, `r_ids`, `tc_prefix`. Emits structured lint errors with file+line references. Smoke
test: `testnux validate examples/demo-dashboard/` passes with zero errors.

---

## R-05 — demo command runs bundled fixture

**Status:** STUB

`testnux demo` is a documented stub. The `examples/demo-dashboard/` fixture exists (README,
output artifacts, screenshots) but the live Playwright runner is not yet wired to the demo
command. The stub prints the manual equivalent steps so first-time users are not blocked.

---

## R-06 — doctor preflight checks

**Status:** DONE

`testnux doctor` runs six checks: Node 20+ version gate, Playwright browser installation,
`.env.local` variable presence (SITE_GATE_PIN, SUPABASE_URL without SERVICE_ROLE_KEY leak
warning), Supabase MFA enroll-vs-verify toggle mismatch detection (requires
SUPABASE_MANAGEMENT_TOKEN + `--project-ref`), dev-vs-prod build detection (port 3000 warning),
and folder conventions (requires `testing-log/` and `requirements/` in cwd).

---

## R-07 — templates: test-plan.md, spec.ts, README

**Status:** DONE

`templates/` ships three files: `test-plan.md` (YAML frontmatter + TC section skeleton),
`spec.ts` (Playwright TypeScript spec with all v0.1 patterns inlined), and `README.md`
(test-pass folder orientation). All three are substituted by `testnux init`.

---

## R-08 — spec.ts template: per-test XFF rate-limit isolation

**Status:** DONE

The `spec.ts` template includes the `xffForTest(title)` helper, which derives a deterministic
synthetic IP from the test title using a djb2-style hash. Each test runs in its own rate-limit
bucket. The pattern is documented inline with the CRITICAL note: trust LAST-HOP XFF, not
first-hop (first-hop is spoofable by the client).

---

## R-09 — spec.ts template: form.requestSubmit pattern

**Status:** DONE

The `spec.ts` template documents and demonstrates `form.requestSubmit()` instead of
`button.click()` for React form submissions. The inline comment explains the hydration-race
root cause: Next.js dev mode paints HTML before React attaches event handlers, causing
`button.click()` to fire a silent GET instead of the POST handler. The fix: always run
Playwright against the prod build (`npm run build && npm start`).

---

## R-10 — spec.ts template: afterEach evidence capture

**Status:** DONE

The `spec.ts` template includes an `afterEach` hook that calls `captureEvidence(page, tcId)`,
saving `evidence/<TC-ID>.png`. A note explains that tests using a custom browser context
(incognito, multi-tab) must call `captureEvidence` inline before the context closes, because
`afterEach` runs after context teardown.

---

## R-11 — spec.ts template: afterAll execution-log-auto.md writer

**Status:** DONE

The `spec.ts` template includes an `afterAll` hook that writes `execution-log-auto.md` with
per-TC results, timestamps, and failure messages collected during the run. This file is the
fallback input for `testnux report` when a manual `execution-log.md` is absent.

---

## R-12 — spec.ts template: waitForNextTotpWindow helper

**Status:** DONE

The `spec.ts` template ships the `waitForNextTotpWindow()` helper (RFC 6238 TOTP, SHA-1 HMAC,
30-second window). Sequential positive-then-negative TOTP tests that hit the same `/api/auth/challenge`
endpoint within one window receive a 429. The helper waits until the current window expires before
returning a fresh code, eliminating the race without arbitrary `sleep` calls.

---

## R-13 — JSON Schema for test-plan frontmatter

**Status:** DONE

`schemas/test-plan-frontmatter.schema.json` (JSON Schema draft-07) defines required fields,
format patterns (`r_ids` items: `/^R-\d+$/`, `tc_prefix`: `/^[A-Z0-9-]{1,12}$/`), and
optional fields (`_review_required`, `uat_status`, `industry_standards`). Referenced by
`testnux validate` and published in the npm package via `files[]`.

---

## R-14 — industry-standards/general.json (OWASP ASVS + WCAG 2.2 AA)

**Status:** DONE

The `general` industry bundle ships 22 controls drawn from OWASP ASVS 4.0 and WCAG 2.2 AA. It
is the only bundle required at v0.1 (per the roadmap in `docs/concepts.md`). The bundle is
consumed by `testnux init --industry general` and embedded in the SCA template header.

---

## R-15 — Apache 2.0 license + TestNUX trademark notice

**Status:** DONE

`LICENSE` contains the Apache 2.0 full text. `NOTICE` contains the TestNUX copyright and
trademark attribution. Every source file in `src/` and `bin/` carries an SPDX header
(`// SPDX-License-Identifier: Apache-2.0`). Markdown files do not carry SPDX comments per
project convention.

---

## v0.2 — Generators + LLM Agents

The v0.2 milestone adds the RTM generator, the SCA generator, OSCAL emit/validation, the four
LLM agents (discover, plan, codify, enrich), the batch-plan multi-agent dispatcher, five
industry bundles (fintech, healthcare, and three others), and the in-memory entity graph.

---

## R-16 — RTM generator (`testnux rtm`)

**Status:** DONE

`testnux rtm` generates `requirements/TRACEABILITY.md` by: (1) parsing R-IDs from
`requirements/REQUIREMENTS.md`; (2) walking `sprint-log/**/SPRINT_SUMMARY.md`; (3) grepping
`src/**` for `// R-XX` inline comments; (4) grepping test files for R-ID references; (5) reading
`requirements/MASTER_BACKLOG.md` for open items; (6) writing the traceability table with marker
pairs so human Notes survive regeneration.

---

## R-17 — RTM marker convention (human notes survive regeneration)

**Status:** DONE

Row markers wrap each TRACEABILITY.md table row:

```
<!-- testnux:row R-01 begin -->
| R-01 | ... |
<!-- testnux:row R-01 end -->
```

The `_extractNotes` function reads existing Notes cells before regeneration; `_render` re-inserts
them. Human edits to the Notes column are idempotent across `testnux rtm` runs.

---

## R-18 — SCA generator (`testnux sca init/generate/pdf`)

**Status:** PARTIAL

`testnux sca init <surface>` scaffolds the canonical 8-section SCA template at
`requirements/validations/<surface>/v1.0_<DATE>.md`. `testnux sca generate <surface>` fills
per-control evidence rows from test results; cells requiring LLM judgment are stubbed with
`[VERIFY]` markers. The `pdf` sub-command detects whether `puppeteer-core` is installed and
informs the user gracefully if not. LLM-powered `generate` cells remain `[VERIFY]`-stubbed
until the v0.2 Claude API integration is complete.

---

## R-19 — SCA template (8-section canonical structure)

**Status:** DONE

`templates/sca/v1.0.md` defines the canonical 8-section SCA structure: Executive Summary,
Methodology, Per-Control Inventory, Standards Alignment, Threat Coverage, Declined-by-Design,
Open Items, Sign-Off. This is the artifact external auditors receive in the first week of a
SOC 2 / ISO 27001 engagement.

---

## R-20 — OSCAL JSON emitter (`toOSCAL` → NIST OSCAL 1.1.2 assessment-results)

**Status:** DONE

`src/lib/oscal.mjs` exports `toOSCAL(sca)` — a pure function that converts a parsed SCA object
into a NIST OSCAL 1.1.2 `assessment-results` JSON document. The output is compatible with IBM
Compliance Trestle and FedRAMP RFC-0024 toolchains. No file I/O; callers own read/write.

---

## R-21 — OSCAL validation (`testnux sca oscal --validate`)

**Status:** DONE

`src/lib/oscal.mjs` exports `validateOSCAL(doc)` — a minimal schema check that throws
`OscalValidationError` on structural violations. `testnux sca oscal <surface> --validate`
calls this after emit and exits 1 on failure. The `--dry-run` flag parses and validates without
writing the output file.

---

## R-22 — LLM discover agent (`testnux discover <url>`)

**Status:** STUB

`src/commands/discover.mjs` is a documented stub. The v0.2 implementation will: launch headless
Chromium, serialize the full DOM + ARIA tree + computed styles, send to Claude
(claude-sonnet-4-6) with the embedded prompt template, and stream the response into
`scenarios.md`. Requires `CLAUDE_API_KEY`. Cost estimate: ~$0.15–$0.40 per page.

---

## R-23 — LLM plan agent (`testnux plan <slug>`)

**Status:** STUB

`src/commands/plan.mjs` is a documented stub. The v0.2 implementation will read
`<slug>-scenarios.md`, optionally take a DOM snapshot (with `--url`), send to Claude, and write
a fully structured `test-plan.md` to the testing-log folder. All LLM-generated cells get
`[VERIFY]` markers. Cost estimate: ~$0.30–$0.80 per page.

---

## R-24 — LLM codify agent (`testnux codify <slug>`)

**Status:** STUB

`src/commands/codify.mjs` is a documented stub. The v0.2 implementation will parse all TC-XX
sections from `test-plan.md`, send to Claude, and receive a fully typed `spec.ts`. Every
generated assertion gets a `[VERIFY]` comment. Cost estimate: ~$0.20–$0.60 per page.

---

## R-25 — LLM enrich agent (`testnux enrich <slug>`)

**Status:** STUB

`src/commands/enrich.mjs` is a documented stub. The v0.2 implementation runs three parallel
enrichment passes (design review, QA structural, graph context cross-surface dependencies)
and appends suggested TCs using append-only discipline below the
`<!-- testnux:enrich:start -->` marker — never touching content above it.

---

## R-26 — batch-plan multi-agent dispatcher (`testnux batch-plan`)

**Status:** STUB

`src/commands/batch.mjs` is a documented stub. The v0.2 implementation will spawn N parallel
Claude agents via the replacement-agent pattern (fresh context window per batch, not one
accumulating 200k-token history). The `--max-spend` guardrail estimates cost before any LLM
call and aborts if `estimated_cost > --max-spend`.

---

## R-27 — fintech industry standards bundle

**Status:** DONE

The fintech bundle ships NIST 800-63B, NYDFS 23 NYCRR 500, PCI DSS, PSD2, FFIEC, and OWASP
ASVS controls. Loaded with `testnux init --industry fintech`. Available from v0.2.

---

## R-28 — healthcare industry standards bundle

**Status:** DONE

The healthcare bundle ships HIPAA Security Rule, HITECH, NIST 800-66, and 21 CFR Part 11
controls. Loaded with `testnux init --industry healthcare`. Available from v0.2.

---

## R-29 — `[VERIFY]` confidence marker convention

**Status:** DONE

Any SCA cell, test case, or annotation generated by an LLM — rather than authored or reviewed
by a human — is marked `[VERIFY]` in the rendered output. This is non-negotiable for audit
defensibility: an examiner who catches one wrong LLM-generated citation can invalidate the
entire SCA. The convention is documented in `docs/concepts.md` and enforced in `sca.mjs`.

---

## R-30 — in-memory entity graph

**Status:** DONE

`src/lib/graph.mjs` exports `buildGraph({ requirements, sprints, tests, code, controls })` and
the `Graph` class with `findEvidence(rid)`, `findControls(rid, cfg)`, and `coverageStats()`.
Nodes: Requirement, TestCase, Control, Standard, Sprint, Evidence. Edges are built at
construction time from the parsed input arrays.

---

## v0.3 — UAT + Integrations

The v0.3 milestone adds the Business Requirements (BR-XX) layer, UAT traceability, e-signature
with HMAC-SHA256 hash-chaining, per-environment test passes, visual regression baseline/compare,
additional industry bundles, and the gstack + Claude Code MCP integrations.

---

## R-31 — BR-XX (Business Requirements) layer

**Status:** DONE

`testnux br init <id>` scaffolds a `BR-XX` section in
`requirements/BUSINESS_REQUIREMENTS.md`. BR-XX sits above R-XX in the hierarchy: a BR-XX
defines the business outcome (intent); R-XX defines the functional requirement (implementation).

---

## R-32 — BR → R → TC linkage (`testnux br link`)

**Status:** DONE

`testnux br link <BR-id> <R-id1,...>` appends a `Links:` list to the BR-XX section,
recording which functional requirements implement the business requirement. The `br rtm`
sub-command reads these links to render `requirements/UAT_TRACEABILITY.md` with the BR layer
as the top-level grouping.

---

## R-33 — UAT_TRACEABILITY.md generator

**Status:** DONE

`testnux br rtm` generates `requirements/UAT_TRACEABILITY.md` — a three-level traceability
table (BR-XX → R-XX → TC-XX). This is the artifact UAT reviewers and business owners sign off
on during the stakeholder acceptance phase (step 6 of the 8-step regulator-evidence chain).

---

## R-34 — e-signature with HMAC-SHA256 hash-chained JSONL

**Status:** DONE

`src/lib/uat-log.mjs` implements the `appendEntry(surface, record)` function. Each entry in
`<surface>/uat-log.jsonl` includes the HMAC-SHA256 signature of the current record plus the
hash of the previous entry, creating an append-only, tamper-evident chain. The signing key is
read from `UAT_SECRET` in the environment (never committed to version control).

---

## R-35 — `testnux sign` interactive workflow

**Status:** DONE

`testnux sign <surface>` presents an interactive prompt (reviewer name, role, TC-ID, status,
justification) and appends the signed record to `uat-log.jsonl` via `src/lib/uat-log.mjs`.
`testnux sign <surface> --reject <TC-ID>` batch-rejects a TC with the same interactive
prompts minus the status selection.

---

## R-36 — per-environment test passes (`testnux env run / env compare`)

**Status:** DONE

`testnux env run <slug> --env staging|prod|local` wraps `testnux init` with an env
suffix (e.g. `testing-log/2026-04-26_login_staging/`). `testnux env compare <slug> <env-a>
<env-b>` diffs TC results between two env passes and outputs a markdown table with a delta
column. The compare sub-command stub-renders when a pass has no execution log.

---

## R-37 — visual regression baseline + compare

**Status:** STUB

`testnux visual baseline <slug>` and `testnux visual compare <slug>` are implemented in
`src/commands/visual.mjs` but require `pixelmatch` + `pngjs` as optional dependencies. If
`pixelmatch` is not installed, the compare command prints an install notice and exits gracefully.
Full Playwright integration and CI baseline strategy are deferred to the v0.3 release cycle.

---

## R-38 — gov/edu/ecommerce industry standards bundles

**Status:** DONE

Three additional industry bundles ship in v0.3: `gov` (FedRAMP, FISMA, NIST 800-53), `edu`
(FERPA, COPPA), and `ecommerce` (PCI DSS, GDPR, CCPA). Loaded with `--industry gov|edu|ecommerce`.

---

## R-39 — gstack skill bundle integration

**Status:** DONE

`integrations/gstack/testnux/` ships an `install.sh` and `SKILL.md` that integrate
testnux into the gstack skill runner. The `SKILL.md` describes the `/testnux` skill
invocation for Claude Code sessions.

---

## R-40 — Claude Code MCP server integration

**Status:** DONE

`integrations/claude-code-mcp/server.mjs` implements a Model Context Protocol (MCP) server that
exposes testnux's core commands as MCP tools. `integrations/claude-code-mcp/manifest.json`
declares the tool manifest. Claude Code sessions can invoke `testnux rtm`, `sca`, `sign`,
and `br rtm` via MCP without leaving the editor.

---

## Status summary

| Version | DONE | PARTIAL | STUB | DEFERRED | Total |
|---------|------|---------|------|----------|-------|
| v0.1 (R-01 – R-15) | 13 | 0 | 2 | 0 | 15 |
| v0.2 (R-16 – R-30) | 8 | 1 | 6 | 0 | 15 |
| v0.3 (R-31 – R-40) | 8 | 0 | 1 | 0 | 10 (1 partial) |
| **Total** | **29** | **1** | **9** | **0** | **40** |

_Status taxonomy:_ `DONE` — implemented and verified. `PARTIAL` — partially implemented; known
gap remains in engineering's queue. `STUB` — documented placeholder; no working implementation
yet. `DEFERRED` — scope-cut by product decision; revisit next quarter. `DECLINED` — out of scope
by design (none at this time).

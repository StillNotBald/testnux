---
version: "0.3"
status: ACTIVE
last_updated: 2026-04-26
---

# TestNUX — Master Backlog

Open work queue for testnux itself, maintained in the same format that a testnux user
would maintain their own application's backlog. Items are grouped by tier, then section. Each
item links to its R-ID(s) and carries an effort estimate on both the human and Claude Code (CC)
scale.

Effort key: **S** = hours | **M** = 1–2 days | **L** = 3–5 days | **XL** = 1–2 weeks

---

## CRITICAL — Blockers for first public release

---

**MB-01 — Port the proven report generator (replace report.mjs stub)**
- **Tier:** CRITICAL
- **R-ID:** R-03
- **Effort:** L (human) / M (CC — known reference implementation exists)
- **Acceptance criteria:**
  - `testnux report <folder>` produces `report.html` (self-contained, no CDN) and `report.xlsx` from `test-plan.md` + `execution-log-auto.md`
  - HTML: tabbed view (All TCs / PASS / FAIL / BLOCKED / SKIPPED); per-TC cards with base64-inlined evidence screenshots; anchor IDs only in "All TCs" tab (no duplicate-DOM-ID bug)
  - XLSX: one sheet per status tab; Pass/Fail dropdown per TC row
  - `--plan-only` flag suppresses Result column and adds "PLAN ONLY" badge
  - `--open` flag launches the HTML in the default browser (CI-friendly flag `--no-open` to suppress)
  - Exit code 4 on render failure

---

**MB-02 — Wire the demo fixture to the demo command**
- **Tier:** CRITICAL
- **R-ID:** R-05
- **Effort:** M (human) / S (CC — fixture content already present at examples/demo-dashboard/)
- **Acceptance criteria:**
  - `testnux demo` runs `npx playwright test examples/demo-dashboard/spec.ts`
  - On success: calls `runReport()` then opens the HTML in the default browser
  - On failure: prints the failing TC(s) and exits 1
  - `--no-open` flag suppresses browser launch (CI-safe)
  - Demo spec covers at least 5 TCs against a real or stubbed target URL

---

**MB-03 — Connect sca generate to Claude API (replace [VERIFY]-stub cells)**
- **Tier:** CRITICAL
- **R-ID:** R-18, R-22, R-29
- **Effort:** L (human) / M (CC)
- **Acceptance criteria:**
  - `testnux sca generate <surface>` calls `claude-sonnet-4-6` (or configurable model) for cells currently left as `[VERIFY]`
  - All LLM-generated cells retain `[VERIFY]` marker in output until a human reviewer removes it
  - `--max-spend <dollars>` flag aborts before any LLM call if estimated cost exceeds the limit
  - `CLAUDE_API_KEY` env var required; friendly error if absent
  - `--dry-run` estimates cost and prints projected cells without making API calls

---

## HIGH — Core quality gaps

---

**MB-04 — Implement LLM agents: discover, plan, codify, enrich**
- **Tier:** HIGH
- **R-ID:** R-22, R-23, R-24, R-25
- **Effort:** XL (human) / L (CC)
- **Acceptance criteria:**
  - `testnux discover <url>`: launches headless Playwright, serializes DOM + ARIA tree, sends to Claude with embedded prompt template, streams response to `scenarios.md`; all generated scenarios carry `[VERIFY]`
  - `testnux plan <slug>`: reads `scenarios.md` (+ optional DOM snapshot with `--url`), produces structured `test-plan.md` with `[VERIFY]` markers on all LLM cells
  - `testnux codify <slug>`: reads `test-plan.md` TC sections, produces typed `spec.ts` with `[VERIFY]` comment on every generated assertion
  - `testnux enrich <slug>`: three parallel enrichment passes (design, QA structural, graph context); append-only below `<!-- testnux:enrich:start -->` marker
  - All four commands respect `CLAUDE_API_KEY` + `--max-spend` guardrail
  - Cost estimates printed before each API call

---

**MB-05 — Implement batch-plan multi-agent dispatcher**
- **Tier:** HIGH
- **R-ID:** R-26
- **Effort:** L (human) / M (CC)
- **Acceptance criteria:**
  - `testnux batch-plan --pages "login,register,dashboard"` dispatches one sub-agent per batch of pages (configurable with `--pages-per-agent`, default 3)
  - Uses replacement-agent pattern: each sub-agent runs discover → plan → codify → enrich on its batch, then exits; a fresh agent picks up the next batch
  - `--max-spend <dollars>` guardrail: aborts before any LLM call if estimated total cost exceeds the limit; prints a cost breakdown
  - `--dry-run` prints the cost estimate and planned batches without making API calls
  - Progress logged to stdout as each sub-agent completes

---

**MB-06 — Vitest unit tests for core library modules**
- **Tier:** HIGH
- **R-ID:** R-16, R-20, R-30, R-34
- **Effort:** M (human) / S (CC)
- **Acceptance criteria:**
  - `npm test` runs Vitest (not the currently declared Jest config that has no tests)
  - `src/lib/parser.mjs`: tests for `parseRequirements`, `parseSprintSummary`, `parseTestPlan`, `parseCodeAnnotations` — cover happy path + malformed input
  - `src/lib/graph.mjs`: tests for `buildGraph`, `findEvidence`, `coverageStats` — cover empty graph, single node, cross-links
  - `src/lib/oscal.mjs`: tests for `toOSCAL` (valid SCA → valid OSCAL structure) and `validateOSCAL` (throws on missing required fields)
  - `src/lib/uat-log.mjs`: tests for `appendEntry` hash-chain integrity — second entry's `prevHash` matches SHA-256 of first entry
  - CI: `npm test` exits 0 on a clean clone with no testing-log/ or requirements/ folders

---

## MEDIUM — Quality and developer experience

---

**MB-07 — Wire pixelmatch for visual regression compare**
- **Tier:** MEDIUM
- **R-ID:** R-37
- **Effort:** M (human) / S (CC)
- **Acceptance criteria:**
  - `testnux visual compare <slug>` loads `pixelmatch` + `pngjs` dynamically; graceful no-op + install notice if absent
  - Diff threshold configurable in `testnux.config.mjs` (`visual.diffThreshold`, default 0.05)
  - Diff images saved to `<slug>/visual-diff/<TC-ID>-diff.png`
  - TCs exceeding the threshold are listed in a summary table in `visual-diff/summary.md`
  - CI strategy documented: baseline committed to git; compare runs against the checked-in baseline in CI

---

**MB-08 — LLM output eval harness**
- **Tier:** MEDIUM
- **R-ID:** R-22, R-23, R-24, R-25
- **Effort:** L (human) / M (CC)
- **Acceptance criteria:**
  - A repeatable eval script (`scripts/eval-llm.mjs`) runs discover + plan + codify on a fixture page and scores output quality
  - Scoring dimensions: TC count (≥ 5), Given/When/Then completeness (all three present), standards coverage (≥ 1 OWASP ASVS tag per TC), `[VERIFY]` presence on all generated cells
  - Scores reported as JSON; exit 1 if any dimension falls below threshold
  - Intended for regression testing when model version or prompt changes

---

**MB-09 — `testnux rtm --strict` CI gate**
- **Tier:** MEDIUM
- **R-ID:** R-16
- **Effort:** S (human + CC)
- **Acceptance criteria:**
  - `testnux rtm --strict` exits 1 if any R-ID has no code annotation AND no test evidence
  - Error message lists the R-IDs that failed, with a suggestion to add `// R-XX` inline comments to the relevant source files
  - Suitable for use as a CI step: `testnux rtm --strict || exit 1`

---

**MB-10 — BR uniqueness lint**
- **Tier:** MEDIUM
- **R-ID:** R-31, R-32
- **Effort:** S (human + CC)
- **Acceptance criteria:**
  - `testnux br init <id>` exits 1 with a clear error if `<id>` already exists in `BUSINESS_REQUIREMENTS.md`
  - `testnux br rtm` warns (but does not fail) if a BR-XX has no linked R-IDs
  - Error messages include the offending file path and line number

---

**MB-11 — Stale-acceptance detection in uat-log.jsonl**
- **Tier:** MEDIUM
- **R-ID:** R-33, R-34
- **Effort:** M (human) / S (CC)
- **Acceptance criteria:**
  - `testnux sign` detects when a TC-ID being signed has previously been rejected in the same uat-log.jsonl chain
  - Emits a clear warning: "TC-XX was previously rejected by <reviewer> on <date>. Proceed? [y/N]"
  - `--force` flag bypasses the prompt (audit trail records the override)
  - `testnux br rtm` marks TCs with stale-acceptance as `NEEDS_REVIEW` in the UAT_TRACEABILITY table

---

**MB-12 — SCA PDF via puppeteer-core (graceful optional dep)**
- **Tier:** MEDIUM
- **R-ID:** R-18
- **Effort:** S (human + CC)
- **Acceptance criteria:**
  - `testnux sca pdf <surface>` renders the latest SCA markdown to PDF using `puppeteer-core` + a Chromium install
  - If `puppeteer-core` is not installed, prints `npm install puppeteer-core` and exits 0 (no crash)
  - PDF output filename: `requirements/validations/<surface>/v<X.Y>.pdf`
  - PDF respects the canonical SCA section structure; `[VERIFY]` cells rendered with a yellow highlight box

---

**MB-13 — `testnux doctor` checks for requirements/ structure**
- **Tier:** MEDIUM
- **R-ID:** R-06
- **Effort:** S (human + CC)
- **Acceptance criteria:**
  - `testnux doctor` check #6 (conventions) additionally verifies that `requirements/REQUIREMENTS.md` exists
  - If absent: ⚠️ warning with message "Run `testnux rtm` or create requirements/REQUIREMENTS.md to unlock traceability features"
  - If present but has zero R-IDs: ❌ error "REQUIREMENTS.md exists but contains no R-XX headings"

---

## LOW — Nice-to-have and v0.4+ ideas

---

**MB-14 — Cypress adapter**
- **Tier:** LOW
- **R-ID:** — (new v0.4 feature)
- **Effort:** L (human) / M (CC)
- **Acceptance criteria:**
  - `testnux init --runner cypress <slug>` scaffolds `cypress/e2e/<slug>/` with a `spec.cy.ts` template that mirrors the Playwright template patterns (XFF isolation, evidence capture, afterAll log writer)
  - `testnux report` accepts a Cypress JSON reporter output as an alternative to `execution-log-auto.md`
  - `testnux validate` accepts Cypress `spec.cy.ts` files alongside `.spec.ts`

---

**MB-15 — Continue / Cursor IDE adapter**
- **Tier:** LOW
- **R-ID:** — (new v0.4 feature)
- **Effort:** M (human) / S (CC)
- **Acceptance criteria:**
  - `integrations/continue/` ships a Continue extension config that exposes testnux commands as slash commands
  - `integrations/cursor/` ships a `.cursorrules` fragment that teaches Cursor the TestNUX conventions (R-ID inline comment, `[VERIFY]` discipline, folder structure)
  - Both adapters documented in `docs/integrations.md`

---

**MB-16 — Hosted SaaS layer (CEO ceremony D3)**
- **Tier:** LOW
- **R-ID:** — (product roadmap, not a CLI feature)
- **Effort:** XL (human + CC)
- **Acceptance criteria:**
  - Web dashboard at `app.testinghub.io` (or equivalent) that ingests `requirements/TRACEABILITY.md` and `testing-log/` from a GitHub repo via OAuth
  - Displays coverage stats, per-surface SCA status, and UAT sign-off state in a read-only UI suitable for external auditors
  - No data stored server-side beyond GitHub OAuth tokens; all processing client-side or via ephemeral server functions
  - Pricing: free for open-source repos; paid for private repos

---

**MB-17 — `testnux rtm --format json` machine-readable output**
- **Tier:** LOW
- **R-ID:** R-16
- **Effort:** S (human + CC)
- **Acceptance criteria:**
  - `testnux rtm --format json` writes `requirements/traceability.json` alongside the markdown file
  - JSON schema mirrors the markdown table columns: `{ id, title, status, sprint[], code[], tests[], backlog[], notes }`
  - Suitable for ingestion by GRC platforms (Vanta, Drata, ServiceNow) without markdown parsing

---

**MB-18 — Eval benchmark for OSCAL emit accuracy**
- **Tier:** LOW
- **R-ID:** R-20, R-21
- **Effort:** M (human) / S (CC)
- **Acceptance criteria:**
  - `scripts/eval-oscal.mjs` runs `toOSCAL` on a fixed SCA fixture and validates the output against the official NIST OSCAL 1.1.2 JSON Schema (downloaded from NIST's GitHub)
  - All required OSCAL fields present: `assessment-results`, `metadata`, `results[].controls-assessed`
  - Script exits 1 if validation fails; suitable for CI

---

**MB-19 — End-to-end smoke test suite for CLI commands**
- **Tier:** LOW
- **R-ID:** R-01 through R-40
- **Effort:** L (human) / M (CC)
- **Acceptance criteria:**
  - `npm run test:e2e` runs a shell-based smoke suite (using `execa` or similar) that exercises each command against a temporary fixture project in `/tmp/`
  - Coverage: `init`, `validate`, `doctor`, `rtm --dry-run`, `sca init`, `sca oscal --validate`, `br init`, `br link`, `sign` (with a test UAT_SECRET), `env run`
  - Each command exits 0 on a clean fixture; tests verify the expected output files are created
  - Suite runs in under 30 seconds on a standard developer machine (no real browser launch needed for CLI commands)

---

**MB-20 — CHANGELOG discipline and semantic versioning enforcement**
- **Tier:** LOW
- **R-ID:** — (release process)
- **Effort:** S (human + CC)
- **Acceptance criteria:**
  - `CHANGELOG.md` follows Keep a Changelog format; every PR that changes a command updates the `[Unreleased]` section
  - `npm run release` script (or `testnux ship` wrapper): bumps `package.json` version, moves `[Unreleased]` to `[x.y.z]`, commits, tags
  - `testnux doctor` checks that `package.json#version` matches the latest non-Unreleased CHANGELOG entry; warns if they diverge

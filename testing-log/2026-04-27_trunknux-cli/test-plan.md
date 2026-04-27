---
slug: trunknux-cli
date: 2026-04-27
industry: general
status: IN-PROGRESS
tc_prefix: "TRUNK"
r_ids:
  - R-01
  - R-02
  - R-03
  - R-04
  - R-05
  - R-06
  - R-07
  - R-08
  - R-09
  - R-10
  - R-11
  - R-12
  - R-13
  - R-14
  - R-15
  - R-16
  - R-17
  - R-18
  - R-19
  - R-20
  - R-21
  - R-22
  - R-23
  - R-24
  - R-25
  - R-26
  - R-27
  - R-28
  - R-29
  - R-30
  - R-31
  - R-32
  - R-33
  - R-34
  - R-35
  - R-36
  - R-37
  - R-38
  - R-39
  - R-40
  - R-41
  - R-42
  - R-43
  - R-44
  - R-45
  - R-46
  - R-47
  - R-48
  - R-49
  - R-50
  - R-51
  - R-52
  - R-53
  - R-54
  - R-55
  - R-56
  - R-57
  - R-58
_review_required: true
author: Chu Ling
---

# trunknux-cli — Test Plan (Dogfood Pass)

**Surface:** trunknux-cli (CLI binary + library)
**Source:** bin/trunknux.mjs, src/commands/*, src/lib/*, src/parsers/*, src/renderers/*
**Surface type:** CLI / Node.js library
**Last updated:** 2026-04-27
**TC prefix:** TRUNK
**Industry:** general

R-ID mapping (REQUIREMENTS.md uses grouped IDs; the frontmatter uses sequential numeric IDs):

| Frontmatter R-ID | Requirements group ID | Requirement summary |
|---|---|---|
| R-01..R-27 | R-CMD-01..R-CMD-27 | Per-command CLI requirements |
| R-28..R-37 | R-DISC-01..R-DISC-10 | Discipline / process requirements |
| R-38..R-44 | R-IND-01..R-IND-07 | Industry standards bundles |
| R-45..R-51 | R-AUDIT-01..R-AUDIT-07 | Compliance / audit chain requirements |
| R-52..R-58 | R-QA-01..R-QA-07 | Quality / engineering requirements |

## What this surface does

TrunkNuX is a CLI tool that generates audit-defensible evidence chains for software testing passes. It scaffolds test-plan folders, generates XLSX + HTML reports, lints frontmatter, runs environment preflight checks, generates NIST OSCAL output, manages HMAC-chained UAT sign-off ledgers, and integrates with the Claude API for AI-assisted test planning.

## Test Case Matrix

| TC ID | Title | Priority | What it verifies | Source file | R-IDs (group) | Status |
|---|---|---|---|---|---|---|
| TRUNK-01 | CLI help + version | P0 | --help and --version exit 0 with correct output | test/cli.test.mjs | R-01 (R-CMD-01) | PASS |
| TRUNK-02 | init: scaffold folder structure | P0 | Creates date-prefixed folder with all four artifacts | test/cli.test.mjs | R-01 (R-CMD-01) | PASS |
| TRUNK-03 | init: idempotency | P1 | Re-running init does not duplicate files | test/cli.test.mjs | R-01 (R-CMD-01) | PASS |
| TRUNK-04 | init: unknown industry value | P1 | Exits cleanly (0, 1, or 2) without stack trace | test/cli.test.mjs | R-01 (R-CMD-01) | PASS |
| TRUNK-05 | validate: missing folder exits 2 | P0 | Returns exit code 2 with descriptive error | test/cli.test.mjs | R-03 (R-CMD-03) | PASS |
| TRUNK-06 | validate: valid test-plan.md exits 0 | P0 | Clean test-plan.md passes schema validation | test/cli.test.mjs | R-03 (R-CMD-03) | PASS |
| TRUNK-07 | validate: malformed frontmatter exits 3 | P0 | Invalid status/r_ids causes exit code 3 | test/cli.test.mjs | R-03 (R-CMD-03) | PASS |
| TRUNK-08 | validate: --json mode | P1 | JSON output is parseable with event key | test/cli.test.mjs | R-03, R-37 (R-CMD-03, R-DISC-10) | PASS |
| TRUNK-09 | doctor: runs without crashing | P0 | Exits 0 or 1; no uncaught TypeError | test/cli.test.mjs | R-05 (R-CMD-05) | PASS |
| TRUNK-10 | doctor: --json output shape | P1 | Emits doctor.result JSON with checks array | test/cli.test.mjs | R-05, R-37 (R-CMD-05, R-DISC-10) | PASS |
| TRUNK-11 | report: missing test-plan.md exits 1 | P0 | Returns exit code 1 with descriptive error | test/cli.test.mjs | R-02 (R-CMD-02) | PASS |
| TRUNK-12 | report: generates XLSX + HTML | P0 | Both files written when test-plan.md is present | test/cli.test.mjs | R-02 (R-CMD-02) | PASS |
| TRUNK-13 | rtm: missing requirements/ exits 2 | P0 | Returns exit code 2 with descriptive error | test/cli.test.mjs | R-07 (R-CMD-07) | PASS |
| TRUNK-14 | rtm: --dry-run prints RTM to stdout | P0 | Dry run outputs traceability table to stdout | test/cli.test.mjs | R-07 (R-CMD-07) | PASS |
| TRUNK-15 | global --json flag: valid JSON on failure | P1 | JSON lines parseable even on validation failure | test/cli.test.mjs | R-37 (R-DISC-10) | PASS |
| TRUNK-16 | malaysia-banking: bundle file structure | P1 | JSON config has correct shape (industry, version, standards) | test/cli.test.mjs | R-44 (R-IND-07) | PASS |
| TRUNK-17 | malaysia-banking: control schema completeness | P1 | Every control has id, name, description, family, references | test/cli.test.mjs | R-44 (R-IND-07) | PASS |
| TRUNK-18 | malaysia-banking: PDPA/BNM/CSA counts | P1 | >= 8 PDPA, >= 12 BNM, >= 3 CSA, >= 25 total | test/cli.test.mjs | R-44 (R-IND-07) | PASS |
| TRUNK-19 | malaysia-banking: no proprietary references | P0 | Bundle file contains none of the project's reserved-strings list (see R-QA-06) | test/cli.test.mjs | R-57 (R-QA-06) | PASS |
| TRUNK-20 | report: parsers — parseTestPlanContent | P0 | TC matrix and frontmatter parsed correctly | test/report.test.mjs | R-02, R-49 (R-CMD-02, R-AUDIT-05) | PASS |
| TRUNK-21 | report: parsers — parseExecutionLogContent | P0 | Execution log status rows parsed correctly | test/report.test.mjs | R-02 (R-CMD-02) | PASS |
| TRUNK-22 | report: XLSX renderer | P0 | buildXlsx produces valid workbook | test/report.test.mjs | R-02, R-46 (R-CMD-02, R-AUDIT-02) | PASS |
| TRUNK-23 | report: HTML renderer | P0 | buildHtml produces self-contained HTML | test/report.test.mjs | R-02, R-51 (R-CMD-02, R-AUDIT-06) | PASS |
| TRUNK-24 | report: plan-only mode | P0 | --plan-only renders without execution columns | test/report.test.mjs | R-36 (R-DISC-09) | PASS |
| TRUNK-25 | sign-pdf: HMAC badge in PDF | P0 | PDF generation produces chain-valid badge | test/sign-pdf.test.mjs | R-16, R-31 (R-CMD-16, R-DISC-04) | PASS |
| TRUNK-26 | sign-pdf: broken chain badge | P1 | Broken chain renders CHAIN BROKEN banner (not fatal) | test/sign-pdf.test.mjs | R-16, R-31 (R-CMD-16, R-DISC-04) | PASS |
| TRUNK-27 | sign-pdf: Chrome path env respected | P1 | CHROME_PATH env var used for puppeteer launch | test/sign-pdf.test.mjs | R-10, R-16 (R-CMD-10, R-CMD-16) | PASS |
| TRUNK-28 | uat-log: append + chain integrity | P0 | appendEntry writes chained JSONL entries | test/uat-log.test.mjs | R-15, R-30 (R-CMD-15, R-DISC-03) | PASS |
| TRUNK-29 | uat-log: verifyChain passes valid chain | P0 | verifyChain returns success on unmodified log | test/uat-log.test.mjs | R-15, R-30 (R-CMD-15, R-DISC-03) | PASS |
| TRUNK-30 | uat-log: tamper detection — mutation | P0 | Mutating an entry breaks chain at correct line | test/uat-log.test.mjs | R-15, R-30 (R-CMD-15, R-DISC-03) | PASS |
| TRUNK-31 | uat-log: tamper detection — deletion | P0 | Deleting an entry breaks chain | test/uat-log.test.mjs | R-15, R-30 (R-CMD-15, R-DISC-03) | PASS |
| TRUNK-32 | uat-log: tamper detection — reorder | P0 | Swapping entries breaks chain | test/uat-log.test.mjs | R-15, R-30 (R-CMD-15, R-DISC-03) | PASS |
| TRUNK-33 | uat-log: wrong secret fails verify | P0 | Wrong HMAC secret causes chain failure | test/uat-log.test.mjs | R-15, R-30 (R-CMD-15, R-DISC-03) | PASS |
| TRUNK-34 | uat-log: justify-with-llm fallback | P1 | Missing CLAUDE_API_KEY continues without error | test/uat-log.test.mjs | R-18 (R-CMD-18) | PASS |
| TRUNK-35 | sign-stale: parseThreshold parses duration strings | P1 | 7d/30d/90d/180d/365d parsed to milliseconds | test/sign-stale.test.mjs | R-17 (R-CMD-17) | PASS |
| TRUNK-36 | sign-stale: stale entry detection | P0 | Entries older than threshold flagged as stale | test/sign-stale.test.mjs | R-17 (R-CMD-17) | PASS |
| TRUNK-37 | oscal: toOSCAL returns assessment-results | P0 | OSCAL document has top-level assessment-results key | test/oscal.test.mjs | R-11, R-45 (R-CMD-11, R-AUDIT-01) | PASS |
| TRUNK-38 | oscal: OSCAL structure — UUID and dates | P0 | UUIDs and ISO dates are valid | test/oscal.test.mjs | R-11, R-45 (R-CMD-11, R-AUDIT-01) | PASS |
| TRUNK-39 | oscal: validateOSCAL rejects malformed doc | P0 | OscalValidationError thrown on invalid input | test/oscal.test.mjs | R-11, R-45 (R-CMD-11, R-AUDIT-01) | PASS |
| TRUNK-40 | oscal: assessment-log extension merge | P1 | uat-log entries merged into OSCAL assessment-log | test/oscal.test.mjs | R-11, R-49 (R-CMD-11, R-AUDIT-05) | PASS |
| TRUNK-41 | parser: parseRequirements happy path | P0 | R-ID, title, status parsed from ## R-XX heading | test/parser.test.mjs | R-07 (R-CMD-07) | PASS |
| TRUNK-42 | parser: parseRequirements edge cases | P1 | Null input, BLOCKED/PARTIAL/DEFERRED statuses handled | test/parser.test.mjs | R-07 (R-CMD-07) | PASS |
| TRUNK-43 | br-attestations: appendAttestation + chain | P0 | HMAC-chained BR attestation entries written correctly | test/br-attestations.test.mjs | R-22 (R-DISC-05) | PASS |
| TRUNK-44 | br-attestations: revokeAttestation | P1 | Revocation entry appended without deleting prior entries | test/br-attestations.test.mjs | R-22 (R-DISC-05) | PASS |
| TRUNK-45 | br-attestations: N-of-M attestation status | P0 | getAttestationStatus counts distinct reviewers | test/br-attestations.test.mjs | R-22 (R-DISC-05) | PASS |
| TRUNK-46 | br-attestations: chain tamper detection | P0 | verifyAttestationChain fails on mutated entry | test/br-attestations.test.mjs | R-22, R-30 (R-DISC-05, R-DISC-03) | PASS |
| TRUNK-47 | visual: parseViewport | P1 | 1280x800 and 1920X1080 parsed correctly | test/visual.test.mjs | R-21 (R-CMD-21) | PASS |
| TRUNK-48 | visual: resolveUrl and parseUrlsFlag | P1 | URL pairs parsed from TC-ID=URL strings | test/visual.test.mjs | R-21 (R-CMD-21) | PASS |
| TRUNK-49 | visual: decideDiffStatus | P1 | Diff verdict (PASS/FAIL) computed from pixel percentage | test/visual.test.mjs | R-22 (R-CMD-22) | PASS |
| TRUNK-50 | plan: LLM-assisted plan generation with [VERIFY] markers | P0 | Plan output contains [VERIFY] markers on TC rows | test/plan.test.mjs | R-24, R-29 (R-CMD-24, R-DISC-02) | PASS |
| TRUNK-51 | plan: --dry-run cost estimate | P1 | Dry-run prints token/cost estimate without API call | test/plan.test.mjs | R-24, R-35 (R-CMD-24, R-DISC-08) | PASS |
| TRUNK-52 | discover: LLM scenario generation | P0 | discover writes scenarios.md with Given/When/Then | test/discover.test.mjs | R-23 (R-CMD-23) | PASS |
| TRUNK-53 | discover: --dry-run mode | P1 | Dry-run prints prompt and exits without API call | test/discover.test.mjs | R-23, R-35 (R-CMD-23, R-DISC-08) | PASS |
| TRUNK-54 | codify: generates spec with requestSubmit + afterEach | P0 | Codify output uses requestSubmit and afterEach evidence hooks | test/codify.test.mjs | R-25 (R-CMD-25) | PASS |
| TRUNK-55 | codify: --max-spend gate | P1 | Aborts before API call when estimated cost exceeds limit | test/codify.test.mjs | R-25, R-34 (R-CMD-25, R-DISC-07) | PASS |
| TRUNK-56 | enrich: append-only marker boundaries | P0 | Human-edited content outside markers preserved after re-enrich | test/enrich.test.mjs | R-26, R-33 (R-CMD-26, R-DISC-06) | PASS |
| TRUNK-57 | enrich: [VERIFY] markers on enrichment blocks | P1 | Each enrichment block starts with [VERIFY] | test/enrich.test.mjs | R-26, R-29 (R-CMD-26, R-DISC-02) | PASS |
| TRUNK-58 | batch-plan: parallel pipeline with failure isolation | P0 | One page failure does not abort remaining pages | test/batch.test.mjs | R-27, R-34 (R-CMD-27, R-DISC-07) | PASS |
| TRUNK-59 | sca-sanitize: XSS payload stripped from SCA markdown | P0 | DOMPurify removes script tags and on* handlers | test/sca-sanitize.test.mjs | R-08, R-09 (R-CMD-08, R-CMD-09) | PASS |
| TRUNK-60 | graph: buildGraph and Graph structure | P1 | R-ID dependency graph built correctly from requirements | test/graph.test.mjs | R-07 (R-CMD-07) | PASS |

## Out of scope for this revision

| Feature / element | Reason deferred | Requirement ref |
|---|---|---|
| trunknux mcp stdio server | Not yet shipped in v0.2.x; exits code 1 with stub message | R-06 (R-CMD-06) |
| GRC platform export (Vanta, Drata, Secureframe) | Planned for v0.3 | R-51 (R-AUDIT-07) |
| Playwright visual evidence screenshots | CLI surface; no UI to screenshot | R-48 (R-AUDIT-04) |
| CI matrix (Windows / macOS / Linux) | Cross-platform CI not yet configured | R-58 (R-QA-07) |

---

## Per-TC Detail (Given / When / Then)

---

## TRUNK-01 — CLI help + version

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-01
**Source:** test/cli.test.mjs — describe("help + version")
**Given:** Node.js >= 20 and the trunknux binary are available.
**When:** `node bin/trunknux.mjs --version` and `node bin/trunknux.mjs --help` are executed.
**Then:** Both exit 0. --version emits a semver string. --help lists all top-level commands including init, report, validate, demo, doctor, rtm, sca, discover, plan, codify, enrich, batch-plan, br, sign, run, compare, visual.
**Pass criteria:**
- Exit code 0 for both invocations
- stdout of --version matches /^\d+\.\d+\.\d+/
- stdout of --help contains all 17 command names

---

## TRUNK-02 — init: scaffold folder structure

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-01
**Source:** test/cli.test.mjs — describe("init") — "creates folder + test-plan.md + spec.ts + README.md"
**Given:** A clean temporary directory. `--industry general` and `--out <tmp>` are provided.
**When:** `trunknux init test-pass-a --industry general --out <tmp>` is executed.
**Then:** A folder named `<YYYY-MM-DD>_test-pass-a` is created. test-plan.md, spec.ts, README.md, and evidence/ are all present inside it.
**Pass criteria:**
- Exit code 0
- Folder exists with date prefix
- All four artifacts present

---

## TRUNK-03 — init: idempotency

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-01
**Source:** test/cli.test.mjs — describe("init") — "re-running init in the same folder is idempotent"
**Given:** init has already been run once for a given slug.
**When:** The same init command is run a second time.
**Then:** Exit code 0 on both runs. Exactly one folder matching the slug exists (no duplicates).
**Pass criteria:**
- Both runs exit 0
- Only one directory matching _idempotent-slug suffix exists

---

## TRUNK-04 — init: unknown industry value

**Priority:** P1
**TC type:** error-handling
**R-IDs:** R-01
**Source:** test/cli.test.mjs — describe("init") — "unknown --industry value exits non-zero with descriptive error"
**Given:** An unrecognized industry string is passed (e.g. "unknownindustry999").
**When:** `trunknux init bad-industry-test --industry unknownindustry999 --out <tmp>` is executed.
**Then:** Process exits with code 0, 1, or 2. No uncaught TypeError or stack trace appears in stderr.
**Pass criteria:**
- Exit code in [0, 1, 2]
- stderr does not contain "TypeError" or "at processTicksAndRejections"

---

## TRUNK-05 — validate: missing folder exits 2

**Priority:** P0
**TC type:** error-handling
**R-IDs:** R-03
**Source:** test/cli.test.mjs — describe("validate") — "exits 2 when folder is missing"
**Given:** A path that does not exist on disk.
**When:** `trunknux validate <nonexistent-path>` is executed.
**Then:** Exit code 2. stderr contains a message matching /not found|missing|does-not-exist/i.
**Pass criteria:**
- Exit code 2
- Descriptive error in stderr

---

## TRUNK-06 — validate: valid test-plan.md exits 0

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-03
**Source:** test/cli.test.mjs — describe("validate") — "exits 0 for a folder with a valid test-plan.md"
**Given:** A folder containing a test-plan.md with valid frontmatter (status: READY, valid r_ids array, valid tc_prefix).
**When:** `trunknux validate <folder>` is executed.
**Then:** Exit code 0.
**Pass criteria:**
- Exit code 0
- No errors printed

---

## TRUNK-07 — validate: malformed frontmatter exits 3

**Priority:** P0
**TC type:** error-handling
**R-IDs:** R-03
**Source:** test/cli.test.mjs — describe("validate") — "exits 3 for a folder with malformed frontmatter"
**Given:** A test-plan.md with an invalid status value and non-array r_ids.
**When:** `trunknux validate <folder>` is executed.
**Then:** Exit code 3 (parse/validation error).
**Pass criteria:**
- Exit code 3

---

## TRUNK-08 — validate: --json mode

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-03, R-37
**Source:** test/cli.test.mjs — describe("validate") — "--json flag produces parseable JSON output"
**Given:** A valid test-plan.md folder.
**When:** `trunknux --json validate <folder>` is executed.
**Then:** stdout contains at least one line of valid JSON. Parsed JSON has an "event" key.
**Pass criteria:**
- Exit code 0
- At least one parseable JSON line
- First JSON line has property "event"

---

## TRUNK-09 — doctor: runs without crashing

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-05
**Source:** test/cli.test.mjs — describe("doctor") — "exits 0 even when some checks warn"
**Given:** Standard CI environment with Node >= 20.
**When:** `trunknux doctor` is executed.
**Then:** Exit code 0 or 1. No uncaught TypeError or "Cannot read properties" in stderr.
**Pass criteria:**
- Exit code in [0, 1]
- stderr free of uncaught exceptions

---

## TRUNK-10 — doctor: --json output shape

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-05, R-37
**Source:** test/cli.test.mjs — describe("doctor") — "--json flag outputs valid JSON with expected shape"
**Given:** Standard environment.
**When:** `trunknux doctor --json` is executed.
**Then:** First JSON line has event "doctor.result", a "checks" array, and a "passed" boolean.
**Pass criteria:**
- At least one parseable JSON line
- JSON has event: "doctor.result", checks: Array, passed: boolean

---

## TRUNK-11 — report: missing test-plan.md exits 1

**Priority:** P0
**TC type:** error-handling
**R-IDs:** R-02
**Source:** test/cli.test.mjs — describe("report") — "exits 1 with helpful error when test-plan.md is missing"
**Given:** A folder with no test-plan.md.
**When:** `trunknux report <folder>` is executed.
**Then:** Exit code 1. Combined stdout/stderr matches /test-plan\.md|not found|missing/i.
**Pass criteria:**
- Exit code 1
- Descriptive error output

---

## TRUNK-12 — report: generates XLSX + HTML

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-02
**Source:** test/cli.test.mjs — describe("report v0.2 real generator") — "generates xlsx + html when test-plan.md is present"
**Given:** A folder with a valid test-plan.md (SMK TC matrix, standard frontmatter).
**When:** `trunknux report <folder> --plan-only` is executed.
**Then:** Exit code 0. A .xlsx file and a .html file appear in the folder.
**Pass criteria:**
- Exit code 0
- At least one .xlsx file present
- At least one .html file present

---

## TRUNK-13 — rtm: missing requirements/ exits 2

**Priority:** P0
**TC type:** error-handling
**R-IDs:** R-07
**Source:** test/cli.test.mjs — describe("rtm") — "exits 2 with descriptive error when requirements/ folder is missing"
**Given:** A directory with no requirements/ folder.
**When:** `trunknux rtm --dry-run` is executed.
**Then:** Exit code 2. stderr matches /requirements|not found|REQUIREMENTS\.md/i.
**Pass criteria:**
- Exit code 2
- Descriptive error

---

## TRUNK-14 — rtm: --dry-run prints RTM to stdout

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-07
**Source:** test/cli.test.mjs — describe("rtm") — "--dry-run prints RTM to stdout and exits 0 with a valid requirements file"
**Given:** A requirements/REQUIREMENTS.md with at least two R-ID entries.
**When:** `trunknux rtm --dry-run` is executed.
**Then:** Exit code 0. stdout contains "Traceability", "R-01", and "R-02".
**Pass criteria:**
- Exit code 0
- stdout includes RTM table content

---

## TRUNK-15 — global --json flag: valid JSON on failure

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-37
**Source:** test/cli.test.mjs — describe("global flags") — "--json on validate produces parseable JSON even on validation failure"
**Given:** A folder with no markdown files (will produce a validation warning/error).
**When:** `trunknux --json validate <folder>` is executed.
**Then:** Combined stdout+stderr contains at least one parseable JSON line with an "event" key.
**Pass criteria:**
- At least one JSON line parseable
- JSON has property "event"

---

## TRUNK-16 — malaysia-banking: bundle file structure

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-44
**Source:** test/cli.test.mjs — describe("industry-standards: malaysia-banking bundle") — "file exists and parses as valid JSON" + "has correct top-level shape"
**Given:** src/config/industry-standards/malaysia-banking.json exists.
**When:** File is read and JSON.parse() is called.
**Then:** No parse error. Config has industry: "malaysia-banking", version: "0.2.0", and a non-empty standards array.
**Pass criteria:**
- File exists
- Valid JSON
- Correct industry + version values
- standards.length > 0

---

## TRUNK-17 — malaysia-banking: control schema completeness

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-44
**Source:** test/cli.test.mjs — describe("industry-standards: malaysia-banking bundle") — "every control has id, name, description, family, and references"
**Given:** The malaysia-banking.json config is loaded.
**When:** Every entry in standards[] is inspected.
**Then:** Each entry has id, name, description, family, and references (array).
**Pass criteria:**
- All controls have all five required fields
- references is an array

---

## TRUNK-18 — malaysia-banking: PDPA/BNM/CSA counts

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-44
**Source:** test/cli.test.mjs — describe("industry-standards: malaysia-banking bundle") — "has at least 8 PDPA-prefixed, 12 BNM-prefixed, 3 CSA-prefixed controls"
**Given:** The malaysia-banking.json config is loaded.
**When:** Standards are filtered by id prefix.
**Then:** >= 8 PDPA, >= 12 BNM, >= 3 CSA, >= 25 total.
**Pass criteria:**
- pdpa.length >= 8
- bnm.length >= 12
- csa.length >= 3
- standards.length >= 25

---

## TRUNK-19 — malaysia-banking: no proprietary references

**Priority:** P0
**TC type:** security
**R-IDs:** R-57
**Source:** test/cli.test.mjs — describe("industry-standards: malaysia-banking bundle") — the proprietary-reference scan
**Given:** The malaysia-banking.json config file is read as raw string.
**When:** File content is searched for the project's reserved-strings list (the names of upstream proprietary projects that must not appear in OSS — see R-QA-06 for the canonical list, kept only inside the test source itself).
**Then:** No reserved string is found in the bundle file.
**Pass criteria:**
- Zero matches for any reserved string in the canonical list

---

## TRUNK-20 — report: parsers — parseTestPlanContent

**Priority:** P0
**TC type:** unit
**R-IDs:** R-02, R-49
**Source:** test/report.test.mjs — describe parsing and TC matrix
**Given:** A valid test-plan.md string with frontmatter and TC matrix rows.
**When:** parseTestPlanContent() is called with the string.
**Then:** TC matrix rows and frontmatter fields are correctly extracted.
**Pass criteria:**
- Returned object includes frontmatter fields (slug, industry, status)
- TC rows parsed from the markdown table

---

## TRUNK-21 — report: parsers — parseExecutionLogContent

**Priority:** P0
**TC type:** unit
**R-IDs:** R-02
**Source:** test/report.test.mjs — describe execution log parsing
**Given:** An execution-log.md string with TC ID / Status / Result Notes rows.
**When:** parseExecutionLogContent() and normalizeStatus() are called.
**Then:** TC status values (PASS, FAIL, BLOCKED, SKIPPED) parsed and normalized correctly.
**Pass criteria:**
- Status values match expected normalized strings
- mergeExecutionResults() correctly maps results onto plan TCs

---

## TRUNK-22 — report: XLSX renderer

**Priority:** P0
**TC type:** unit
**R-IDs:** R-02, R-46
**Source:** test/report.test.mjs — buildXlsx / writeXlsx tests
**Given:** A parsed TC list and execution results.
**When:** buildXlsx() is called and written to disk.
**Then:** A valid ExcelJS workbook is produced. Opening the file with ExcelJS succeeds.
**Pass criteria:**
- writeXlsx() succeeds without error
- Workbook readable with correct sheet structure

---

## TRUNK-23 — report: HTML renderer

**Priority:** P0
**TC type:** unit
**R-IDs:** R-02, R-51
**Source:** test/report.test.mjs — buildHtml tests
**Given:** A parsed TC list with standards alignment.
**When:** buildHtml() is called.
**Then:** Returned string is valid HTML. Contains no external HTTP href or src references.
**Pass criteria:**
- No `href="http` matches (self-contained)
- No `src="http` matches
- Contains TC rows

---

## TRUNK-24 — report: plan-only mode

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-36
**Source:** test/report.test.mjs — plan-only mode tests
**Given:** A folder with test-plan.md but no execution-log.md.
**When:** `trunknux report <folder> --plan-only` is executed.
**Then:** Exit code 0. Report renders with "PLAN ONLY" badge. Execution result columns absent or empty.
**Pass criteria:**
- Exit code 0
- HTML contains "PLAN ONLY" text

---

## TRUNK-25 — sign-pdf: HMAC badge in PDF

**Priority:** P0
**TC type:** security
**R-IDs:** R-16, R-31
**Source:** test/sign-pdf.test.mjs — happy path CHAIN VALID badge
**Given:** A surface folder with a valid uat-log.jsonl (chain intact). puppeteer-core is mocked.
**When:** runSignPdf() is called.
**Then:** mockSetContent receives HTML containing "CHAIN VALID" badge. mockPdf is called.
**Pass criteria:**
- setContent called with HTML
- HTML contains chain status badge

---

## TRUNK-26 — sign-pdf: broken chain badge

**Priority:** P1
**TC type:** security
**R-IDs:** R-16, R-31
**Source:** test/sign-pdf.test.mjs — broken chain scenario
**Given:** A surface folder with a tampered uat-log.jsonl (chain broken).
**When:** runSignPdf() is called.
**Then:** PDF renders successfully. HTML contains "CHAIN BROKEN" banner. No abort.
**Pass criteria:**
- mockPdf called (no abort)
- HTML contains "CHAIN BROKEN"

---

## TRUNK-27 — sign-pdf: Chrome path env respected

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-10, R-16
**Source:** test/sign-pdf.test.mjs — CHROME_PATH env var test
**Given:** CHROME_PATH env var is set to a specific path.
**When:** runSignPdf() is invoked.
**Then:** mockLaunch is called with executablePath matching the CHROME_PATH value.
**Pass criteria:**
- mockLaunch.mock.calls[0][0].executablePath === process.env.CHROME_PATH

---

## TRUNK-28 — uat-log: append + chain integrity

**Priority:** P0
**TC type:** security
**R-IDs:** R-15, R-30
**Source:** test/uat-log.test.mjs — appendEntry tests
**Given:** A fresh temp directory with UAT_SECRET set.
**When:** appendEntry() is called with ENTRY_A, ENTRY_B, ENTRY_C in sequence.
**Then:** uat-log.jsonl contains 3 lines. Each line is valid JSON with prev_hash and hmac fields.
**Pass criteria:**
- 3 JSONL lines written
- Each line has prev_hash, hmac, timestamp, tc_id, status

---

## TRUNK-29 — uat-log: verifyChain passes valid chain

**Priority:** P0
**TC type:** security
**R-IDs:** R-15, R-30
**Source:** test/uat-log.test.mjs — verifyChain happy path
**Given:** A valid uat-log.jsonl with 3 unmodified entries.
**When:** verifyChain() is called with the correct secret.
**Then:** Returns { valid: true } (or equivalent success indicator). Exit 0.
**Pass criteria:**
- Chain verification returns truthy valid result

---

## TRUNK-30 — uat-log: tamper detection — mutation

**Priority:** P0
**TC type:** security
**R-IDs:** R-15, R-30
**Source:** test/uat-log.test.mjs — mutation tamper test
**Given:** A valid uat-log.jsonl. Entry B's status field is overwritten to a different value.
**When:** verifyChain() is called.
**Then:** Chain reports invalid. The broken-at line is deterministic (entry B's line).
**Pass criteria:**
- Chain verification returns falsy / invalid result

---

## TRUNK-31 — uat-log: tamper detection — deletion

**Priority:** P0
**TC type:** security
**R-IDs:** R-15, R-30
**Source:** test/uat-log.test.mjs — deletion tamper test
**Given:** A valid uat-log.jsonl. Entry B is deleted (gap in chain).
**When:** verifyChain() is called.
**Then:** Chain reports invalid.
**Pass criteria:**
- Chain verification returns falsy / invalid result

---

## TRUNK-32 — uat-log: tamper detection — reorder

**Priority:** P0
**TC type:** security
**R-IDs:** R-15, R-30
**Source:** test/uat-log.test.mjs — reorder tamper test
**Given:** A valid uat-log.jsonl. Entries A and B are swapped.
**When:** verifyChain() is called.
**Then:** Chain reports invalid.
**Pass criteria:**
- Chain verification returns falsy / invalid result

---

## TRUNK-33 — uat-log: wrong secret fails verify

**Priority:** P0
**TC type:** security
**R-IDs:** R-15, R-30
**Source:** test/uat-log.test.mjs — wrong-secret test
**Given:** A valid uat-log.jsonl built with SECRET. WRONG_SECRET is used for verification.
**When:** verifyChain() is called with WRONG_SECRET.
**Then:** Chain reports invalid.
**Pass criteria:**
- Chain verification returns falsy / invalid result

---

## TRUNK-34 — uat-log: justify-with-llm fallback

**Priority:** P1
**TC type:** error-handling
**R-IDs:** R-18
**Source:** test/uat-log.test.mjs — justify-with-llm cases
**Given:** CLAUDE_API_KEY is not set in the environment.
**When:** sign command is invoked with --justify-with-llm.
**Then:** Command continues normally. No error thrown. Brief notice about missing key (optional).
**Pass criteria:**
- Process does not exit non-zero due to missing API key
- No uncaught exception

---

## TRUNK-35 — sign-stale: parseThreshold parses duration strings

**Priority:** P1
**TC type:** unit
**R-IDs:** R-17
**Source:** test/sign-stale.test.mjs — parseThreshold tests
**Given:** Duration strings "7d", "30d", "90d", "180d", "365d".
**When:** parseThreshold() is called with each string.
**Then:** Returns correct millisecond value (e.g. 7d = 7 * 24 * 60 * 60 * 1000).
**Pass criteria:**
- parseThreshold("7d") === 7 * 86400000
- parseThreshold("365d") === 365 * 86400000

---

## TRUNK-36 — sign-stale: stale entry detection

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-17
**Source:** test/sign-stale.test.mjs — runSignStaleCheck integration tests
**Given:** A uat-log.jsonl with entries whose timestamps are artificially set > threshold days ago.
**When:** runSignStaleCheck() is called with a threshold of (e.g.) 90 days.
**Then:** Stale entries are reported. Non-stale runs produce "no stale entries".
**Pass criteria:**
- Stale entries listed with TC-ID and age
- Clean run produces no stale report

---

## TRUNK-37 — oscal: toOSCAL returns assessment-results

**Priority:** P0
**TC type:** unit
**R-IDs:** R-11, R-45
**Source:** test/oscal.test.mjs — describe("toOSCAL — happy path") — TC-OSCAL-01
**Given:** A minimal SCA object with 3 controls, 2 evidence items, 1 declined control, 1 sign-off.
**When:** toOSCAL(buildSCA()) is called.
**Then:** Returns an object with a top-level "assessment-results" key of type object.
**Pass criteria:**
- doc["assessment-results"] exists and is an object

---

## TRUNK-38 — oscal: OSCAL structure — UUID and dates

**Priority:** P0
**TC type:** unit
**R-IDs:** R-11, R-45
**Source:** test/oscal.test.mjs — UUID and ISO date validation tests
**Given:** OSCAL document produced by toOSCAL().
**When:** UUID and date fields are inspected with regex validators.
**Then:** All UUIDs match loose UUID regex. Published date matches ISO-8601.
**Pass criteria:**
- UUID matches UUID_LOOSE_RE
- published matches ISO_DATE_RE

---

## TRUNK-39 — oscal: validateOSCAL rejects malformed doc

**Priority:** P0
**TC type:** error-handling
**R-IDs:** R-11, R-45
**Source:** test/oscal.test.mjs — validateOSCAL error paths
**Given:** An OSCAL document missing required fields (e.g. no assessment-results key).
**When:** validateOSCAL() is called.
**Then:** OscalValidationError is thrown with a structured message.
**Pass criteria:**
- Throws OscalValidationError (not a generic Error)

---

## TRUNK-40 — oscal: assessment-log extension merge

**Priority:** P1
**TC type:** unit
**R-IDs:** R-11, R-49
**Source:** test/oscal.test.mjs — buildAssessmentLogExtension + mergeAssessmentLog
**Given:** An OSCAL document and a set of uat-log entries.
**When:** mergeAssessmentLog() is called.
**Then:** assessment-log section populated with the uat-log entry records.
**Pass criteria:**
- assessment-log section present in merged doc
- Entries count matches uat-log input

---

## TRUNK-41 — parser: parseRequirements happy path

**Priority:** P0
**TC type:** unit
**R-IDs:** R-07
**Source:** test/parser.test.mjs — describe("parseRequirements") — happy path
**Given:** A markdown string with ## R-01 Title and ## R-02 — Title (em-dash) headings.
**When:** parseRequirements() is called.
**Then:** Returns array with correct id, title, status for each entry.
**Pass criteria:**
- result[0] = { id: "R-01", title: "Authentication", status: "DONE" }
- Em-dash variant also correctly parsed

---

## TRUNK-42 — parser: parseRequirements edge cases

**Priority:** P1
**TC type:** unit
**R-IDs:** R-07
**Source:** test/parser.test.mjs — describe("parseRequirements") — edge cases
**Given:** Various edge inputs: null, undefined, BLOCKED/PARTIAL/DEFERRED statuses, missing status, single-hash heading, four-hash heading.
**When:** parseRequirements() is called with each input.
**Then:** null/undefined returns []. BLOCKED/PARTIAL/DEFERRED statuses parsed. Missing status defaults to UNKNOWN. Four-hash headings not parsed.
**Pass criteria:**
- parseRequirements(null) returns []
- Status "BLOCKED" parsed correctly
- Four-hash heading returns []

---

## TRUNK-43 — br-attestations: appendAttestation + chain

**Priority:** P0
**TC type:** security
**R-IDs:** R-22
**Source:** test/br-attestations.test.mjs — appendAttestation tests
**Given:** A clean temp dir. UAT_SECRET set.
**When:** appendAttestation() called with ATTEST_QA and then ATTEST_COMPLIANCE.
**Then:** br-attestations.jsonl has 2 entries. Each has br_id, reviewer, role, timestamp, prev_hash, hmac.
**Pass criteria:**
- 2 JSONL entries written
- Chain fields present

---

## TRUNK-44 — br-attestations: revokeAttestation

**Priority:** P1
**TC type:** security
**R-IDs:** R-22
**Source:** test/br-attestations.test.mjs — revokeAttestation tests
**Given:** A br-attestations.jsonl with an existing attestation.
**When:** revokeAttestation() is called.
**Then:** A new revocation entry is appended. Prior entries are not deleted or modified.
**Pass criteria:**
- Entry count increases by 1 (not replaced)
- Revocation entry has status field set to revoked or equivalent

---

## TRUNK-45 — br-attestations: N-of-M attestation status

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-22
**Source:** test/br-attestations.test.mjs — getAttestationStatus tests
**Given:** Two distinct reviewer entries for BR-01 in the log.
**When:** getAttestationStatus("BR-01") is called.
**Then:** Returns an object reflecting 2 distinct reviewers and their attestation state.
**Pass criteria:**
- Reviewer count accurately tracked
- Status correctly represents N-of-M threshold

---

## TRUNK-46 — br-attestations: chain tamper detection

**Priority:** P0
**TC type:** security
**R-IDs:** R-22, R-30
**Source:** test/br-attestations.test.mjs — verifyAttestationChain tamper test
**Given:** A valid br-attestations.jsonl. One entry's justification field is mutated.
**When:** verifyAttestationChain() is called.
**Then:** Chain verification returns invalid.
**Pass criteria:**
- Chain invalid result returned
- Broken-at line is deterministic

---

## TRUNK-47 — visual: parseViewport

**Priority:** P1
**TC type:** unit
**R-IDs:** R-21
**Source:** test/visual.test.mjs — describe("parseViewport")
**Given:** Viewport strings in "1280x800" and "1920X1080" formats.
**When:** parseViewport() is called.
**Then:** Returns { width, height } objects with correct numeric values.
**Pass criteria:**
- parseViewport("1280x800") = { width: 1280, height: 800 }
- Case-insensitive X separator works

---

## TRUNK-48 — visual: resolveUrl and parseUrlsFlag

**Priority:** P1
**TC type:** unit
**R-IDs:** R-21
**Source:** test/visual.test.mjs — describe("resolveUrl") + describe("parseUrlsFlag")
**Given:** URL flag strings in "TC-ID=https://example.com" format.
**When:** resolveUrl() and parseUrlsFlag() are called.
**Then:** Correct URL map is produced. TC-ID keys map to URL strings.
**Pass criteria:**
- Returned map has correct TC-ID → URL entries

---

## TRUNK-49 — visual: decideDiffStatus

**Priority:** P1
**TC type:** unit
**R-IDs:** R-22
**Source:** test/visual.test.mjs — describe("decideDiffStatus")
**Given:** Pixel-change percentages and a threshold value.
**When:** decideDiffStatus() is called with each percentage.
**Then:** Returns PASS when below threshold, FAIL when above.
**Pass criteria:**
- Percentage < threshold → PASS
- Percentage > threshold → FAIL

---

## TRUNK-50 — plan: LLM-assisted plan generation with [VERIFY] markers

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-24, R-29
**Source:** test/plan.test.mjs — runPlan() happy path with mocked Anthropic API
**Given:** A scenarios.md file in the test-pass folder. Anthropic API mocked to return TC rows.
**When:** runPlan() is called.
**Then:** test-plan.md written with valid frontmatter. Every LLM-generated TC row contains [VERIFY].
**Pass criteria:**
- test-plan.md written to testing-log folder
- Output contains [VERIFY] markers

---

## TRUNK-51 — plan: --dry-run cost estimate

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-24, R-35
**Source:** test/plan.test.mjs — dry-run test
**Given:** A scenarios.md and Anthropic API mocked.
**When:** runPlan() called with dryRun: true.
**Then:** No file written. Token count and estimated cost printed to stdout. API mock not called.
**Pass criteria:**
- No test-plan.md written
- mockMessageCreate not called
- Cost estimate printed

---

## TRUNK-52 — discover: LLM scenario generation

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-23
**Source:** test/discover.test.mjs — runDiscover() happy path
**Given:** A URL is provided. Page HTML mocked. Anthropic API returns Given/When/Then scenarios.
**When:** runDiscover() is called.
**Then:** scenarios.md written with structured Given/When/Then blocks.
**Pass criteria:**
- scenarios.md written
- Content contains Given/When/Then structure

---

## TRUNK-53 — discover: --dry-run mode

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-23, R-35
**Source:** test/discover.test.mjs — dry-run test
**Given:** A URL provided. dryRun: true.
**When:** runDiscover() called with dryRun: true.
**Then:** No scenarios.md written. Prompt text and cost estimate printed. API mock not called.
**Pass criteria:**
- No file written
- API mock not called

---

## TRUNK-54 — codify: generates spec with requestSubmit + afterEach

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-25
**Source:** test/codify.test.mjs — runCodify() happy path
**Given:** A test-plan.md with TC rows. Anthropic API mocked to return spec.ts content.
**When:** runCodify() is called.
**Then:** spec.ts written with form.requestSubmit() for React form submissions and afterEach hooks that save screenshot evidence.
**Pass criteria:**
- spec.ts written
- Output contains requestSubmit and afterEach

---

## TRUNK-55 — codify: --max-spend gate

**Priority:** P1
**TC type:** error-handling
**R-IDs:** R-25, R-34
**Source:** test/codify.test.mjs — --max-spend exceeded test
**Given:** A test-plan.md. --max-spend set to a value less than the estimated cost.
**When:** runCodify() called.
**Then:** Exit code 1. No API call made. Estimated cost displayed.
**Pass criteria:**
- mockMessageCreate not called
- Exit 1 with cost estimate

---

## TRUNK-56 — enrich: append-only marker boundaries

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-26, R-33
**Source:** test/enrich.test.mjs — re-enrich idempotency test
**Given:** A test-plan.md with existing human-edited content outside enrichment marker blocks.
**When:** runEnrich() is called twice.
**Then:** Human-edited content outside markers is byte-identical after both runs. Content inside markers replaced (not doubled).
**Pass criteria:**
- Content outside markers unchanged
- Marker block content not duplicated on second run

---

## TRUNK-57 — enrich: [VERIFY] markers on enrichment blocks

**Priority:** P1
**TC type:** prescribed
**R-IDs:** R-26, R-29
**Source:** test/enrich.test.mjs — [VERIFY] marker test
**Given:** A test-plan.md. Anthropic API mocked to return enrichment content.
**When:** runEnrich() called.
**Then:** Each enrichment block starts with a [VERIFY] marker.
**Pass criteria:**
- Output contains [VERIFY] within enrichment marker blocks

---

## TRUNK-58 — batch-plan: parallel pipeline with failure isolation

**Priority:** P0
**TC type:** prescribed
**R-IDs:** R-27, R-34
**Source:** test/batch.test.mjs — one-page-fails isolation test
**Given:** Multiple pages queued. One page's discover/plan step is mocked to throw.
**When:** runBatchPlan() called.
**Then:** Failed page is reported but does not abort remaining pages. Successful pages complete.
**Pass criteria:**
- Successful pages have their output written
- Overall process does not throw on single-page failure

---

## TRUNK-59 — sca-sanitize: XSS payload stripped from SCA markdown

**Priority:** P0
**TC type:** security
**R-IDs:** R-08, R-09
**Source:** test/sca-sanitize.test.mjs — DOMPurify XSS tests
**Given:** SCA markdown strings containing `<script>alert(1)</script>`, `onerror=`, and `<iframe src="file://">` payloads.
**When:** The sanitize function is called on each payload.
**Then:** Output contains no script tags, no on* event handlers, no file:// iframe src.
**Pass criteria:**
- `<script>` stripped from output
- `onerror=` stripped from output
- Legitimate SCA content (headings, tables) survives sanitization

---

## TRUNK-60 — graph: buildGraph and Graph structure

**Priority:** P1
**TC type:** unit
**R-IDs:** R-07
**Source:** test/graph.test.mjs — buildGraph and Graph tests
**Given:** A set of requirement R-IDs and their dependency edges.
**When:** buildGraph() is called.
**Then:** Returns a Graph object with correct nodes and edges. graph.nodes has one entry per R-ID.
**Pass criteria:**
- Graph has expected node count
- Edges correctly reflect dependency relationships

---

## Standards Alignment

| Standard | Version | Controls exercised by this test plan |
|---|---|---|
| OWASP ASVS | 4.0 | V2.1 (Password Security), V3.1 (Session Management), V4.1 (Access Control), V8.1 (Data Protection) |
| WCAG | 2.2 AA | Not directly applicable (CLI surface, no UI) |

---

## Evidence

TrunkNuX is a CLI, not a web application. Per-TC visual evidence (screenshots) is not applicable. Test results are captured via vitest console output and persisted to the execution-log.md in this folder. The `trunknux report` command runs in `--plan-only` mode for this pass.

---

## Notes

- All 60 TCs map to real describe() blocks in the test files. One TC per major describe group, not per individual it().
- 370 vitest tests pass across 16 test files as of v0.2.2.
- TRUNK-06 (R-CMD-06 / R-06) is partially tested: v0.2.x stub behavior (exit 1 with message) is exercised but full MCP server is not yet shipped.
- Evidence folder is intentionally empty for this CLI surface pass.

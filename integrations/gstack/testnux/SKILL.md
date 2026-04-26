---
name: testnux
version: 0.3.0
description: |
  Per-page test documentation workflow with AI-vs-human dual execution. Use when
  the user wants to scaffold test plans, run a structured test pass, generate XLSX
  + HTML audit reports, validate traceability, produce SCAs, or sign off UAT.
  Covers the full 8-step regulator-evidence chain: requirements → sprint log →
  testing log → RTM → SCA → UAT sign-off. (testnux)
model: claude-sonnet-4-6
triggers:
  - testnux
  - scaffold a test plan
  - generate test report
  - run test pass
  - validate traceability
  - generate RTM
  - run SCA
  - sign off UAT
  - init test suite
  - testnux init
  - testnux report
  - testnux validate
  - testnux doctor
  - testnux rtm
  - testnux sca
  - testnux discover
  - testnux plan
  - testnux codify
  - testnux enrich
  - testnux batch-plan
  - testnux br
  - testnux sign
  - testnux env
  - testnux visual
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep

---

# testnux skill

This skill drives the `testnux` CLI. It coordinates structured test-pass
documentation across three discipline tracks — requirements, sprint log, and
testing log — and produces auditor-ready evidence artifacts.

## Preflight

Before any command, confirm the CLI is reachable:

```bash
npx testnux --version 2>/dev/null || (echo "NOT_INSTALLED" && which node)
```

If `NOT_INSTALLED`: tell the user to run `npm install -g testnux` or use
`npx testnux <command>` directly. Do not proceed until the CLI is reachable.

---

## Command reference

### `init` — Scaffold a test-pass folder

**When to use:** User wants to start a new test pass for a page or feature. Must
happen before `report` or `validate`.

```bash
npx testnux init <slug> [--industry general|fintech|healthcare|gov] [--out ./testing-log]
```

**What it creates:**
- `testing-log/<date>_<slug>/test-plan.md` — frontmatter template with TC-XX rows
- `testing-log/<date>_<slug>/spec.ts` — Playwright spec stub
- `testing-log/<date>_<slug>/README.md` — folder index
- `testing-log/<date>_<slug>/evidence/` — screenshots land here

**After init:** open `test-plan.md` and confirm the `r_ids` frontmatter field
maps to real `R-XX` identifiers in `requirements/REQUIREMENTS.md`. If none
exist, prompt the user to supply them before proceeding.

---

### `report` — Generate XLSX + HTML report

**When to use:** The user has finished a test pass and wants an auditor-ready
artifact. Requires a completed `execution-log.md` alongside `test-plan.md`.

```bash
npx testnux report <folder> [--plan-only] [--open]
```

- `--plan-only`: render without execution results (shows "PLAN ONLY" badge)
- `--open`: open the generated HTML in the default browser

**Outputs:**
- `<folder>/report.xlsx` — one row per TC, PASS/FAIL/SKIP, evidence links
- `<folder>/report.html` — self-contained HTML; no external dependencies

**After report:** read the HTML with the `browse` skill to verify the report
renders correctly before handing to an auditor.

---

### `validate` — Lint markdown frontmatter

**When to use:** Before committing a test plan, or in CI. Catches missing R-XX
references, invalid TC-ID formats, status taxonomy errors.

```bash
npx testnux validate <folder> [--strict]
```

- `--strict`: treat warnings as errors (recommended for CI gates)

**Exit codes:** 0 = clean, 3 = parse errors. Non-zero exits fail CI.

---

### `demo` — First-time orientation

**When to use:** User is new to testnux and wants to see the full pipeline
in < 90 seconds.

```bash
npx testnux demo
```

Runs bundled fixture through `init → report → open`. Opens `report.html` in
the default browser. No config required.

---

### `doctor` — Preflight checks

**When to use:** Something is broken, or before starting a new project.

```bash
npx testnux doctor [--check node|playwright|env|supabase] [--project-ref <ref>]
```

Checks: Node >= 20, Playwright browsers installed, `.env.local` vars, dev-vs-prod
server detection (Playwright must run against `npm run build && npm start`,
not the dev server — see `feedback_e2e_prod_build_required` memory).

---

### `rtm` — Requirements Traceability Matrix (v0.2)

**When to use:** User wants to generate or refresh `requirements/TRACEABILITY.md`.
Maps every `R-XX` identifier to sprint folder, code files, and test files.

```bash
npx testnux rtm [--out requirements/TRACEABILITY.md]
```

Requires `requirements/REQUIREMENTS.md` to be present. Reads sprint-log/ and
testing-log/ folder names to build the matrix. Emits a markdown table with
columns: R-ID, description, sprint folder, code file(s), test file(s), status.

**After rtm:** grep the generated file for `PARTIAL` and `BLOCKED` rows. Do
not trust `DONE` status without verifying the code file column is populated
(see `feedback_backlog_verification` memory).

---

### `sca` — Security Control Assessment (v0.2)

**When to use:** User wants to scaffold or render a per-surface SCA document.

```bash
# Scaffold a new SCA for a surface (e.g. "login", "data-room")
npx testnux sca init <surface>

# Auto-fill evidence rows from current test results
npx testnux sca generate <surface>

# Render to PDF (headless Chromium)
npx testnux sca pdf <surface>
```

SCA documents follow the 8-section template: Overview, Scope, Controls, Test
Results, Evidence References, Gap Analysis, Remediation Plan, Sign-Off.

---

### `discover` — AI-powered scenario discovery (v0.2)

**When to use:** User has a URL and wants a draft `scenarios.md` before writing
the full test plan.

```bash
npx testnux discover <url> [--out <folder>]
```

Browses the target page, identifies interactive elements, infers user flows,
emits `scenarios.md` with draft TC suggestions. Requires `CLAUDE_API_KEY`.
All LLM-generated rows are marked `[VERIFY]` until human-attested.

---

### `plan` — AI-powered test-plan generation (v0.2)

**When to use:** User has a `scenarios.md` (from `discover` or hand-authored)
and wants a full `test-plan.md` with TC frontmatter.

```bash
npx testnux plan <slug> [--industry general] [--max-spend 2.00]
```

Requires `CLAUDE_API_KEY`. Converts scenarios + DOM context into structured
test cases. Use `--dry-run` to preview LLM calls before spending.

---

### `codify` — Convert test plan to Playwright spec (v0.2)

**When to use:** User has a complete `test-plan.md` and wants an initial
`spec.ts` generated from it.

```bash
npx testnux codify <slug>
```

Generates Playwright `test()` blocks for each TC row. Always review the
generated spec — LLM-generated selectors need human verification. Marks
AI-generated assertions with `// [VERIFY]` comments.

---

### `enrich` — Append additional TCs to existing plan (v0.2)

**When to use:** User has a working test plan and wants to expand coverage
with a11y, exploratory, and structural-context TCs.

```bash
npx testnux enrich <slug> [--append-only]
```

Append-only: never modifies existing TCs. Adds a `## Enriched TCs` section
at the bottom. Requires `CLAUDE_API_KEY`.

---

### `batch-plan` — Parallel multi-page plan generation (v0.2)

**When to use:** User wants to generate test plans for many pages at once.

```bash
npx testnux batch-plan --urls urls.txt [--industry general] [--max-spend 10.00]
```

Spawns parallel LLM agents (one per URL). Requires `CLAUDE_API_KEY`. Rate-limited
automatically. Combine with `--max-spend` to avoid runaway costs.

---

### `br` — Business Requirements layer (v0.3)

**When to use:** User wants to add a `BR-XX` layer above `R-XX` requirements.
Enables UAT stakeholder sign-off tracked by business outcome, not engineering spec.

```bash
npx testnux br init <slug>
npx testnux br report <slug>
```

Generates a Business Requirements tab in the HTML report. RTM gains a `BR-XX`
column. Maps: BR-XX → R-XX → TC-XX → evidence.

---

### `sign` — UAT e-signature (v0.3)

**When to use:** A stakeholder needs to formally sign off on a UAT pass. Generates
an HMAC-signed audit record in `uat-log.jsonl`.

```bash
npx testnux sign <folder> --name "Jane Smith" --email "jane@example.com" --status accepted
```

Status options: `accepted`, `rejected`, `needs-rework`. Writes a hash-chained
entry to `uat-log.jsonl`. Produces a signed HTML summary suitable for email
or a GRC platform upload.

---

### `env` — Per-environment test passes (v0.3)

**When to use:** User wants to run the same test plan against staging vs production.

```bash
npx testnux env run <slug> --env staging
npx testnux env compare <slug> staging prod
```

`compare` produces a cross-environment diff report highlighting TCs that pass
in staging but fail in production (or vice versa).

---

### `visual` — Visual regression (v0.3)

**When to use:** User wants to detect pixel-level regressions between two runs
of the same TC.

```bash
npx testnux visual baseline <folder>
npx testnux visual diff <folder>
```

Stores per-TC baseline screenshots in `evidence/baselines/`. `diff` compares
current screenshots against baselines and emits `<TC-ID>-diff.png` for any TC
where pixel difference exceeds the threshold.

---

## Companion conventions

### Three-track discipline

TestNUX enforces three separate tracks. Do not conflate them:

| Track | Folder | What it contains | Date-prefixed? |
|-------|--------|------------------|----------------|
| Requirements | `requirements/` | Product spec, REQUIREMENTS.md, TRACEABILITY.md | No |
| Sprint log | `sprint-log/<date>_<feature>/` | What was BUILT (summaries, decisions, retros) | Yes |
| Testing log | `testing-log/<date>_<page>/` | What was TESTED (plans, specs, logs, evidence) | Yes |

Each track has its own `README.md` as the index. When debugging a problem,
follow the trail back through these — do not jump across loose docs.

### Taxonomy

| Prefix | Meaning | Example |
|--------|---------|---------|
| `R-XX` | Engineering requirement | `R-42` |
| `BR-XX` | Business requirement (v0.3) | `BR-07` |
| `TC-XX` | Test case within a plan | `TC-LOGIN-01` |
| `SCA-` | Security Control Assessment surface | `SCA-login` |

**Status values:** `DONE`, `PARTIAL`, `BLOCKED`, `DEFERRED`. Never use vague
labels. See `feedback_status_taxonomy` memory for "who has the next move" rule.

### RTM trust rule

Before marking any requirement `DONE` in TRACEABILITY.md, grep the code for
the implementing file. The status column is not authoritative — the code is.
See `feedback_backlog_verification` memory.

### Playwright runs against prod build

Always run Playwright specs against `npm run build && npm start`, not the dev
server. The dev server has hydration races that break form submits in Playwright.
See `feedback_e2e_prod_build_required` memory.

### Form submission in Playwright

Use `form.requestSubmit()` instead of `button.click()` for React form submits
in Playwright. See `feedback_form_request_submit` memory.

---

## When NOT to use this skill

- The user just needs a quick code fix — use Edit directly.
- The user wants to browse a page without documenting it — use `/browse`.
- The user wants to QA and fix bugs interactively — use `/qa`.
- The user wants a general code review — use `/review`.
- The user is asking about a specific R-XX requirement and does not need a
  full test pass — answer directly from `requirements/REQUIREMENTS.md`.

The skill adds overhead. Only invoke it when the goal is a structured,
documented test artifact that will land in `testing-log/`.

---

## Completion report format

After any command, report:

```
COMMAND: testnux <verb> <args>
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
OUTPUT: <files written, paths>
NEXT: <recommended follow-on action>
```

If `BLOCKED`: state what is blocking and what was tried.
If `DONE_WITH_CONCERNS`: list each concern with a one-line action item.

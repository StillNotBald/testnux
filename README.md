# Testing Hub™

**Turn a page-route into an audit-ready evidence package — without touching a GUI.**

```
markdown test plan + Playwright spec
        ↓
testing-hub report
        ↓
self-contained HTML + XLSX + RTM rows
```

No SaaS dependency. No CI lock-in. Output lives in your repo, versioned with your code.

---

## TL;DR

Testing Hub is a CLI that generates auditor-ready test artifacts from markdown test plans and Playwright evidence. The pipeline is **deterministic first, AI-accelerated second** — the core `report` command needs no LLM and produces the same output every run.

Target audience: regulated-fintech engineering leads and compliance leads who need evidence packages that survive SOC 2 / NYDFS / OWASP audits.

---

## Prerequisites

**Minimum (v0.1):** Node.js 20+, npm 10+, a git repo.

**Recommended (full stack):** Claude Max plan (~$200/mo) for v0.2 LLM agents, gstack for multi-agent dispatch and `/browse`, claude-in-chrome MCP for testing authenticated flows.

See [docs/prerequisites.md](docs/prerequisites.md) for the full setup guide including install commands, `testing-hub doctor --check` flags, and the hybrid browser policy (claude-in-chrome vs gstack `/browse`).

---

## 60-second quickstart

```bash
# Scaffold a new test pass
npx testing-hub init demo-login --industry general

# Run Testing Hub's own demo (no setup required)
npx testing-hub demo

# Check your environment
npx testing-hub doctor

# After filling test-plan.md and running your Playwright spec:
npx testing-hub report demo-login

# Validate a folder before reporting
npx testing-hub validate demo-login
```

The `demo` command downloads a prebuilt fixture, generates the HTML + XLSX, and opens both in your browser — then deletes the fixture. Fastest path to the "aha."

---

## Why this exists

Most testing tools are **runtime-focused** — run tests, show results. They stop there.

Regulators don't read Playwright output. They read structured evidence packages: per-TC screenshots, a traceability matrix from requirement to test result, a standards-alignment table. Building those by hand takes 4–8 hours per page. Testing Hub generates them in under 5 minutes from the same markdown and screenshot files your engineers already produce.

The gap Testing Hub fills:

| What auditors ask for | Typical answer | Testing Hub answer |
|---|---|---|
| "Show me test evidence for control IA-2" | Screenshot folder + spreadsheet pasted together | Per-TC evidence embedded in a self-contained HTML report, linked to R-XX |
| "Which requirements does this test cover?" | Manually maintained spreadsheet | `TRACEABILITY.md` generated from plan frontmatter |
| "Is this WCAG 2.2 AA compliant?" | "We think so" | Standards-alignment table baked into every report |
| "Can a non-technical reviewer sign off?" | "Here's the code" | XLSX with Pass/Fail dropdowns and priority colour-coding |

The deterministic pipeline (markdown → HTML + XLSX + RTM) is the product. The AI features that help author plans and specs are accelerators — useful, but not required.

---

## What the pipeline produces

```
testing-log/
  2026-05-01_login/
    test-plan.md                  ← TC matrix + Given/When/Then per TC
    execution-log.md              ← results + analysis narrative
    evidence/
      LOGIN-01.png
      LOGIN-02.png
      ...
    login-test-plan.xlsx          ← generated: Pass/Fail dropdowns, priority colour
    login-execution-report.html   ← generated: self-contained, TOC + tabs + screenshots
```

| Artifact | Audience | Format |
|---|---|---|
| `test-plan.md` | Engineers + AI agents | Markdown (frontmatter schema + TC matrix + G/W/T) |
| `execution-log.md` | Audit trail | Markdown (results + analysis) |
| `*.xlsx` | Non-technical testers + UAT reviewers | Excel with Pass/Fail dropdown, colour-coded priority |
| `*.html` | Stakeholders + auditors | Self-contained HTML: TOC, tabs, embedded screenshots, standards table |
| `evidence/<TC-ID>.png` | Proof of execution | Per-TC Playwright `afterEach` screenshots |
| `TRACEABILITY.md` rows | Bidirectional R-XX ↔ TC-XX mapping | Markdown matrix |

---

## The 6-phase pipeline

```
1. DISCOVER   →  page state catalogued (v0.1: manual; v0.2: LLM agent)
      ↓
2. PLAN       →  test-plan.md authored (v0.1: templates; v0.2: LLM draft)
      ↓
3. CODIFY     →  Playwright spec written (v0.1: templates; v0.2: LLM codify)
      ↓
4. EXECUTE    →  tests run, evidence captured (Playwright + afterEach hook)
      ↓
5. REPORT     →  XLSX + HTML generated (✅ fully automated today)
      ↓
6. DOC        →  RTM + session log updated (v0.1: templates; v0.2: LLM doc agent)
```

**v0.1 honest scope:** Phase 5 (REPORT) is fully automated. Phases 1, 2, 3, 6 are documented patterns and templates that a human or LLM agent fills in. v0.2 closes the manual gaps. This is intentional — the deterministic core is the foundation.

---

## What's automated vs manual at v0.1

| Phase | v0.1 state | Automated by |
|---|---|---|
| DISCOVER | Manual | Human reads page, lists what exists |
| PLAN | Template-assisted | Human fills `test-plan.md` from scaffold |
| CODIFY | Template-assisted | Human writes `spec.ts` from template pattern |
| EXECUTE | Automated | Playwright + bundled `afterEach` evidence hook |
| REPORT | Fully automated | `testing-hub report` |
| DOC | Template-assisted | Human updates RTM rows from scaffold |

The LLM features in v0.2 (discover, plan, codify, doc agents) are not stubs — they're planned and scoped — but they are not the reason to adopt v0.1. The report generation is.

---

## Industry-standards configuration

v0.1 ships `--industry general` with OWASP ASVS + WCAG 2.2 AA. Every generated report includes a standards-alignment table mapping each TC to the applicable control.

```bash
npx testing-hub init my-page --industry general
```

The standards config lives in `templates/industry/general.json`. You can drop a custom `standards.json` in any test-pass folder to override.

v0.2 will add `fintech` (NIST 800-63B, NYDFS 23 NYCRR 500, PSD2, PCI DSS) and `healthcare` (HIPAA Security Rule, HITECH). v0.2 also emits OSCAL JSON alongside markdown, making Testing Hub compatible with FedRAMP RFC-0024 (mandatory machine-readable packages from September 2026) via IBM Trestle integration.

---

## Demo

The demo target is a prebuilt Next.js dashboard at `examples/demo-dashboard/`. It ships with sample output artifacts showing what Testing Hub produces:

```
examples/demo-dashboard/
  output/
    login-test-plan.md          ← 15 TCs, full G/W/T, OWASP ASVS + WCAG aligned
    login-sca-v0.1.md           ← 8-section SCA reference artifact
    login-execution-report.html ← self-contained HTML report (generated next)
  screenshots/                  ← per-TC Playwright evidence screenshots
```

Run `npx testing-hub demo` to generate and open these locally.

A hosted live demo is available at: **[testing-hub.dev/demo]** *(link active at v0.1 launch)*

---

## Data model and architecture

See `docs/architecture/` for the full data model. The core abstraction is a directed graph:

```
Requirement (R-XX)
    └─ TestCase (TC-ID)
          ├─ Evidence (TC-ID.png)
          ├─ Result (PASS | FAIL | SKIP | BLOCKED)
          └─ Control mapping (OWASP-ASVS-XX / WCAG-2.2-AA-XX / ...)
```

The CLI verbs are surface area on this graph. The JSON Schema for `test-plan.md` frontmatter lives at `docs/schema/test-plan.schema.json`.

Note on AI-generated content: every LLM-generated cell in a report renders with a `[VERIFY]` marker until a human has reviewed and attested it. This is non-negotiable for audit defensibility.

---

## Three-track discipline (requirements / sprint-log / testing-log)

Testing Hub is built around a git-native three-track structure:

```
requirements/                    ← what you said you'd build
  REQUIREMENTS.md
  TRACEABILITY.md                ← R-XX → sprint → code → test → backlog

sprint-log/<date>_<feature>/     ← what was built
  SPRINT_SUMMARY.md

testing-log/<date>_<page>/       ← what was tested
  test-plan.md
  execution-log.md
  evidence/
  *.xlsx
  *.html
```

The date-prefix on test-pass folders creates audit snapshots — every engagement has a clear record of what was tested on what date against which version.

---

## Roadmap

### v0.1 (current)

- `testing-hub init <slug> [--industry general]` — scaffold test-pass folder
- `testing-hub report <folder>` — generate XLSX + HTML from markdown inputs
- `testing-hub validate <folder>` — lint test-plan.md against JSON Schema
- `testing-hub demo` — run bundled demo-dashboard fixture, open output in browser
- `testing-hub doctor` — preflight check (Node version, Playwright installed, env vars, common pitfalls)
- Templates: test-plan, spec, execution-log, standards-alignment table
- OWASP ASVS + WCAG 2.2 AA standards alignment out of the box
- `[VERIFY]` confidence markers on every LLM-generated cell
- JSON Schema for `test-plan.md` frontmatter

### v0.2 (~6–8 weeks post-v0.1)

- OSCAL JSON export alongside markdown (Trestle integration; 1-day spike first)
- RTM generator: `testing-hub rtm` — generates `TRACEABILITY.md` from requirements + sprint log + code grep
- SCA generator: `testing-hub sca init|generate|pdf` — Security Control Assessment from test results
- LLM agents for PLAN, CODIFY, DOC phases (draft output, human review required)
- `--industry fintech` and `--industry healthcare` standards configs
- Eval harness for LLM-generated SCA output (5 held-out examples, scoring rubric, regression CI)
- Human-edit-survives-regeneration markers for RTM rows and SCA operational notes

### v0.3 (~6–8 weeks post-v0.2)

- UAT sign-off layer: per-TC `uat_status` field, stakeholder HTML dropdown, HMAC e-signature, `uat-log.jsonl` audit trail
- Business requirements (BR-XX) layer above R-XX, RTM grows a column
- Per-environment test passes and cross-env diff: `testing-hub compare <slug> staging prod`
- Visual regression mode: per-TC baseline screenshot + pixel-diff flagging
- Cypress + Vitest adapter support

---

## FAQ

**Does Testing Hub cost anything?**  
The CLI is free (Apache 2.0). The v0.2 LLM agents use Claude's API — approximately $0.30–$0.50 per page for a full AI pass. Heavy multi-agent dispatch (8 parallel agents) can burn ~5 sessions of Claude Max quota per hour. See [docs/costs.md](docs/costs.md) for the full breakdown and recommended working patterns.

**Do I need Claude Max or an Anthropic API key?**  
Not for v0.1. The `report` command is fully deterministic — no LLM required. Claude access is required only for v0.2 agents (PLAN, CODIFY, DISCOVER, DOC phases).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

Quick version:
- All contributors must sign off commits with `git commit -s` (DCO — no CLA paperwork)
- Every PR must ship with tests
- Open an issue before a large PR so we can align on design

---

## Credits

Testing Hub's three-track discipline, multi-agent dispatch workflow, and slash-command integration patterns derive directly from **gstack** (https://github.com/garrytan/gstack) by Garry Tan. gstack is the OSS solo-builder framework that Testing Hub's methodology is built on. Testing Hub adds a deterministic CLI artifact pipeline on top of gstack's structural and methodological foundations.

Other credits: Playwright (evidence capture), IBM Trestle (OSCAL validation), NIST OSCAL (standards schema), Anthropic Claude (v0.2 LLM agents), Apache Software Foundation (license framework).

See [docs/credit.md](docs/credit.md) for the full attribution breakdown and citation format.

---

## License and trademark

Apache 2.0. See [LICENSE](LICENSE).

"Testing Hub™" is a trademark of Chu Ling. See [NOTICE](NOTICE) for trademark terms. The Apache 2.0 license covers the code; the trademark covers the name.

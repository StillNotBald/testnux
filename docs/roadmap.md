# Roadmap

> **Pacing reality:** TestNUX is a side-project as of 2026-04-26. The 60-day decision date (2026-06-25) determines whether v0.2 ships in Q3 2026 (full-time pace) or Q4 2026 (sustainable side-project pace). Either way, v0.1 ships first; everything else flows from there.

---

## Guiding principle

TestNUX's scope follows the 8-step regulator-evidence chain:

```
1. Requirements (R-XX)           ← project owns
2. Sprint log (build)            ← git owns
3. Testing log (test plans + evidence + reports)   ← TestNUX v0.1
4. Traceability matrix (RTM)                       ← TestNUX v0.2
5. Security Control Assessments (SCA)              ← TestNUX v0.2
6. UAT sign-off layer (BR-XX + e-signature)        ← TestNUX v0.3
7. External audit / pen test     ← vendor owns
8. Production launch             ← deploy owns
```

**v0.1 owns step 3.** v0.2 extends to steps 4–5. v0.3 adds step 6.

The deterministic pipeline (markdown → HTML + XLSX) ships in v0.1 and does not require any LLM or AI service. LLM features are accelerators added in v0.2, not prerequisites for the core value.

---

## v0.1 — Current release

**Theme:** Deterministic pipeline. Author tests in markdown, get audit-ready HTML evidence in one command.

**Ships:**

| Feature | Description |
|---------|-------------|
| `testnux init` | Scaffold a test-pass folder with templates |
| `testnux report` | Generate self-contained HTML + XLSX from markdown inputs |
| `testnux validate` | Lint test-plan.md against JSON Schema; CI-safe exit codes |
| `testnux demo` | Run bundled fixture, open report in browser, delete fixture — <90 seconds to first "aha" |
| `testnux doctor` | Preflight check: Node version, Playwright, dev-vs-prod server detection, config discovery |
| `--industry general` | OWASP ASVS 4.0 + WCAG 2.2 AA standards alignment out of the box |
| `--plan-only` mode | Render a report without an execution log; "PLAN ONLY" badge in header |
| `[VERIFY]` markers | Every LLM-generated cell renders with a `[VERIFY]` tag until human-attested |
| JSON Schema | Published schema for `test-plan.md` frontmatter, `standards.json`, `findings.json` |
| `--json` global flag | Structured JSON output on stdout for CI/CD pipeline integration |
| Documented exit codes | Per-command exit code table; `validate` returns non-zero on schema errors |

**Reference artefacts shipped:**

- `examples/demo-dashboard/output/login-test-plan.md` — 15 fully populated TCs
- `examples/demo-dashboard/output/login-sca-v0.1.md` — 8-section SCA, public reference artifact

**Explicitly out of scope at v0.1:**

- LLM agents (discover, plan, codify, enrich, doc) — v0.2
- RTM generator — v0.2
- SCA generator — v0.2
- `--industry fintech|healthcare` flags — v0.2 (after OSCAL spike)
- gstack skill bundle — v0.3 (optional integration, not core)
- MCP server for Claude Code — v0.3
- UAT sign-off (BR-XX, e-signature) — v0.3

---

## v0.2 — Q3 2026 target (depends on traction + founder full-time decision per launch plan)

**Theme:** LLM acceleration + RTM + SCA. Close the manual gaps; extend TestNUX to steps 4 and 5 of the regulator-evidence chain.

**New CLI verbs:**

| Command | Description |
|---------|-------------|
| `testnux rtm` | Generate `requirements/TRACEABILITY.md` from REQUIREMENTS.md + sprint log + code grep |
| `testnux sca init <surface>` | Scaffold a per-surface SCA from the 8-section template |
| `testnux sca generate <surface>` | Auto-fill per-control evidence rows from current test results |
| `testnux sca pdf <surface>` | Render latest SCA version to PDF (Chromium headless, no Pandoc required) |
| `testnux discover <url>` | LLM agent browses the target page, emits draft scenarios.md |
| `testnux plan <slug>` | LLM agent converts scenarios + DOM into test-plan.md |
| `testnux codify <slug>` | LLM agent converts test-plan.md into spec.ts |
| `testnux enrich <slug>` | LLM agent appends structural-context, a11y, and exploratory TCs to an existing plan |
| `testnux batch-plan` | Parallel LLM agents for multi-page plan generation |

**New features:**

| Feature | Description |
|---------|-------------|
| OSCAL JSON export | Emit OSCAL Assessment Results JSON alongside markdown SCA (IBM Trestle integration) |
| `--industry fintech` | NIST 800-63B + NYDFS 23 NYCRR 500 + PSD2 + PCI DSS standards |
| `--industry healthcare` | HIPAA Security Rule + HITECH + NIST 800-66 standards |
| Eval harness | 5+ held-out SCA examples, scoring rubric (precision/recall on control-to-evidence joins), regression CI |
| Human-edit markers | `<!-- human:notes -->...<!-- /human:notes -->` spans survive RTM and SCA regeneration |
| `--max-spend <USD>` | Abort LLM operations if estimated cost exceeds the threshold |
| `--dry-run` for LLM ops | Print planned LLM calls and cost estimate before executing |

**Prerequisite (before v0.2 code starts):**

Run the OSCAL feasibility spike (1 day). FedRAMP RFC-0024 mandates machine-readable OSCAL packages by September 2026. OSCAL output format is load-bearing for federal and federal-adjacent customers and must be decided before the SCA renderer is written.

---

## v0.3 — Q4 2026 target if v0.2 + paying customers happen on schedule

**Theme:** UAT layer, multi-industry, ecosystem integrations. Make TestNUX CISO-buyable.

**New features:**

| Feature | Description |
|---------|-------------|
| UAT sign-off workflow | Per-TC `uat_status` field (pending/accepted/rejected/needs-rework); stakeholder HTML dropdown; HMAC e-signature; `uat-log.jsonl` hash-chained audit trail |
| Business requirements (BR-XX) | BR-XX layer above R-XX; RTM gains a column; HTML report gains a Business Requirements tab |
| Per-environment test passes | `testnux run <slug> --env staging`; `testnux compare <slug> staging prod` cross-env diff |
| Visual regression | Per-TC baseline screenshots; pixel-diff flagging; `<TC-ID>-diff.png` alongside evidence |
| Cypress + Vitest adapters | Adapter pattern for non-Playwright test runners; one test plan, three possible spec languages |
| `--industry gov` | FedRAMP + FISMA + NIST 800-53 standards |
| gstack skill bundle | `/testnux` as a first-class gstack skill; browser-coupled discovery via claude-in-chrome MCP |
| MCP server for Claude Code | TestNUX as a Claude Code tool; inline plan generation, RTM queries, report access |
| `--industry edu` | FERPA + COPPA standards |

---

## What won't change

Three things in TestNUX's design are intentional and will be defended against well-meaning scope creep:

1. **The artifact format.** Markdown plan + Playwright spec + per-TC screenshot + self-contained HTML + XLSX is the product. It will not become "configurable output formats" or "flexible templates."

2. **Git-native, repo-tracked.** Output lives in your repo, versioned with your code. The hosted SaaS tier (roadmap) sits on top of this, not instead of it.

3. **Deterministic core, LLM accelerator.** The `report` command will always work without an API key. LLM features will always be opt-in.

---

## Versioning policy

TestNUX follows semver. Breaking changes to the test-plan.md schema or the folder convention require a major version bump. Minor versions add features; patch versions fix bugs. The JSON Schema files are versioned independently and backward-compatible within a major version.

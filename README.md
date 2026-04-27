# TestNUX™

**Turn a page-route into an audit-ready evidence package — without touching a GUI.**

```
markdown test plan + Playwright spec
        ↓
testnux report
        ↓
self-contained HTML + XLSX + RTM rows
```

No SaaS dependency. No CI lock-in. Output lives in your repo, versioned with your code.

---

## TL;DR

TestNUX is a CLI that generates auditor-ready test artifacts from markdown test plans and Playwright evidence. The pipeline is **deterministic first, AI-accelerated second** — the core `report` command needs no LLM and produces the same output every run.

Target audience: regulated-fintech engineering leads and compliance leads who need evidence packages that survive SOC 2 / NYDFS / OWASP audits.

---

## Prerequisites

**Minimum (v0.1):** Node.js 20+, npm 10+, a git repo.

**Recommended (full stack):** **Claude Max 5x (~$100/mo)** with **Opus 4.7 (extra-high effort)** as primary + **Sonnet** as subagent for v0.2 LLM agents. Plus gstack for multi-agent dispatch and `/browse`, claude-in-chrome MCP for testing authenticated flows. Realistic burn: ~1-2 hours of focused work to consume the 5-hour quota window — see [docs/costs.md](docs/costs.md).

See [docs/prerequisites.md](docs/prerequisites.md) for the full setup guide including install commands, `testnux doctor --check` flags, and the hybrid browser policy (claude-in-chrome vs gstack `/browse`).

---

## Install

```bash
# stable (deterministic core only — no LLM agents)
npm install -g testnux                # 0.1.1
testnux --version

# alpha (v0.2 capability-parity — LLM agents + signoff + per-env + visual)
npm install -g testnux@alpha          # 0.2.0-alpha.1
```

Available on npm: [npmjs.com/package/testnux](https://www.npmjs.com/package/testnux). One-shot via `npx testnux <command>` works too — no install needed.

> **v0.2.0-alpha.1 is current** (released 2026-04-27). The `@alpha` tag is opt-in so stable users on `testnux@latest` keep v0.1.1 until 0.2.0 stable. See [CHANGELOG.md](CHANGELOG.md) for what shipped.

---

## What you get

TestNUX produces a single self-contained HTML execution report:

- 📋 Sticky TOC sidebar with anchor links to every TC
- 🎯 Filter tabs: All / PASS / FAIL / BLOCKED / SKIPPED
- 📊 Per-TC card: Given/When/Then, status badge, embedded screenshots, standards mapping
- 🏛️ Banking-standards alignment matrix at the bottom
- 🛡️ Threat coverage table (OWASP / NIST / WCAG)
- 📈 Summary banner: total TCs, pass rate, P0 status

Open `examples/demo-dashboard/output/login-execution-report.html` in your browser to see it live.

---

## 60-second quickstart

```bash
# Scaffold a new test pass
testnux init demo-login --industry general

# Run TestNUX's own demo (no setup required)
testnux demo

# Check your environment
testnux doctor

# After filling test-plan.md and running your Playwright spec:
testnux report demo-login

# Validate a folder before reporting
testnux validate demo-login
```

The `demo` command downloads a prebuilt fixture, generates the HTML + XLSX, and opens both in your browser — then deletes the fixture. Fastest path to the "aha."

---

## Premium tier (planned v0.4+)

The CLI is free forever (Apache 2.0). The premium tier adds hosted infrastructure, a multi-tenant auditor portal, GRC platform integrations, and human services (white-glove onboarding, training, quarterly review, advisory). Enterprise-grade features (liability cover, cryptographic notarization, WORM evidence retention) are on the roadmap but not yet offered — see `docs/premium.md` for the honest status.

See **[docs/premium.md](docs/premium.md)** for the full tier breakdown, pricing matrix, feature list, and what stays free forever. First 3 customers in each tier get founder-rate pricing — contact `ccling1998@gmail.com`.

---

## How TestNUX compares to alternatives

|  | TestNUX | Vanta / Drata / Secureframe | Comp AI / Delve |
|---|---|---|---|
| **Distribution** | OSS CLI (Apache 2.0); local-first | Hosted SaaS, per-seat | Hosted SaaS / OSS hybrid |
| **Where evidence lives** | Your git repo (markdown + screenshots + OSCAL JSON) | Vendor's cloud (lock-in) | Vendor's cloud |
| **What it produces** | Test plans + RTM + SCA + UAT log | Continuous evidence collection + auditor portal | AI-drafted policies + auto-screenshot |
| **Auditor handoff** | Export package (markdown + OSCAL); auditor reads in any tool | Auditor logs into their platform | Auditor logs into their platform |
| **Pricing** | Free OSS forever; paid SaaS layer (planned v0.4+) | $8K-$50K+/yr per company | $$ per company |
| **AI-assisted plan/test authoring** | v0.2 (opt-in, BYO Claude API key) | No (focus on policy + evidence) | Yes (core feature) |
| **Federal compliance (OSCAL)** | v0.2 emit-native | Partial via integrations | Limited |
| **Lock-in risk** | None (your data, your repo, exit anytime) | High (data lives in their DB) | Medium |
| **Best fit** | Engineering-led teams that want git-native evidence + want to keep their auditor relationship | Teams that want a turnkey GRC dashboard for their CISO | Teams that want AI to write their policies for them |

**Where TestNUX feeds into the others:** v0.2 will export your evidence package as OSCAL JSON (NIST 1.1.2) which Vanta/Drata/Secureframe/RegScale all import. TestNUX is the eng-side authoring layer; GRC platforms are the CISO dashboard layer. They're complementary, not competitive — pick TestNUX if you want git-native authorship; pick a GRC platform on TOP if you want a hosted dashboard for your CISO.

---

## Best practices (optional)

If you want consistent outcomes across teams, see [docs/adoption-checklist.md](docs/adoption-checklist.md) for 4 must-do practices.

---

## Why this exists

Most testing tools are **runtime-focused** — run tests, show results. They stop there.

Regulators don't read Playwright output. They read structured evidence packages: per-TC screenshots, a traceability matrix from requirement to test result, a standards-alignment table. Building those by hand takes 4–8 hours per page. TestNUX generates them in under 5 minutes from the same markdown and screenshot files your engineers already produce.

The gap TestNUX fills:

| What auditors ask for | Typical answer | TestNUX answer |
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
1. DISCOVER   →  page state catalogued (testnux discover)
      ↓
2. PLAN       →  test-plan.md authored (testnux plan)
      ↓
3. CODIFY     →  Playwright spec written (testnux codify)
      ↓
4. EXECUTE    →  tests run, evidence captured (Playwright + afterEach hook)
      ↓
5. REPORT     →  XLSX + HTML generated (testnux report)
      ↓
6. DOC        →  RTM + session log updated (testnux rtm)
```

**Honest scope at v0.2.0-alpha.1:** Phase 5 (REPORT) is the deterministic foundation — no LLM, same output every run. Phases 1, 2, 3, 6 are LLM-assisted in alpha (Claude API, opt-in via `CLAUDE_API_KEY`); every LLM-generated cell renders with a `[VERIFY]` marker until a human attests it. The deterministic core is what gets audited; the LLM agents accelerate authoring.

---

## What's automated vs manual

| Phase | v0.1.1 (stable) | v0.2.0-alpha.1 (current) |
|---|---|---|
| DISCOVER | Manual | `testnux discover <url>` (Claude API, [VERIFY] markers) |
| PLAN | Template-assisted | `testnux plan <slug>` (Claude API, [VERIFY] markers) |
| CODIFY | Template-assisted | `testnux codify <slug>` (Claude API, preserves XFF + form.requestSubmit + afterEach patterns) |
| EXECUTE | Automated | Same — Playwright + bundled `afterEach` evidence hook |
| REPORT | Fully automated (no LLM) | Same — fully deterministic, no LLM |
| DOC | Template-assisted | `testnux rtm` (deterministic) + `testnux enrich` (LLM, append-only) |

The deterministic `report` pipeline is the audit-defensible core in both versions. v0.2-alpha adds LLM agents that draft scenarios → plans → specs → enrichments — every output flagged `[VERIFY]` until a human reviews. Use `testnux batch-plan --pages "login,register,..."` for parallel multi-page authoring.

---

## Industry-standards configuration

`--industry general` ships in v0.1.1+ with OWASP ASVS + WCAG 2.2 AA. Every generated report includes a standards-alignment table mapping each TC to the applicable control.

```bash
npx testnux init my-page --industry general
```

The standards config lives in `templates/industry/general.json`. You can drop a custom `standards.json` in any test-pass folder to override.

v0.2-alpha adds OSCAL emission (`testnux sca oscal`) — making TestNUX compatible with FedRAMP RFC-0024 (mandatory machine-readable packages from September 2026) via IBM Trestle integration. v0.3 will add `--industry fintech` (NIST 800-63B, NYDFS 23 NYCRR 500, PSD2, PCI DSS) and `--industry healthcare` (HIPAA Security Rule, HITECH).

---

## Demo

The demo target is a prebuilt Next.js dashboard at `examples/demo-dashboard/`. It ships with sample output artifacts showing what TestNUX produces:

```
examples/demo-dashboard/
  output/
    login-test-plan.md          ← 15 TCs, full G/W/T, OWASP ASVS + WCAG aligned
    login-sca-v0.1.md           ← 8-section SCA reference artifact
    login-execution-report.html ← self-contained HTML report (generated next)
  screenshots/                  ← per-TC Playwright evidence screenshots
```

Run `npx testnux demo` to generate and open these locally.

**Live demo:** Browse the [sample execution report](./examples/demo-dashboard/output/login-execution-report.html) — a real `testnux report` output from a Playwright run against the demo-dashboard project (13 PASS / 2 BLOCKED-CONFIG out of 15 TCs, 13 embedded screenshots), regenerated in v0.2-alpha to replace the original hand-crafted sample. Self-contained HTML — open offline, no SaaS dashboard required.

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

TestNUX is built around a git-native three-track structure:

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

### v0.1.1 (stable on `@latest`)

- `testnux init <slug> [--industry general]` — scaffold test-pass folder
- `testnux report <folder>` — XLSX + HTML from markdown inputs (deterministic, no LLM)
- `testnux validate <folder>` — lint test-plan.md frontmatter against JSON Schema
- `testnux demo` — run bundled demo-dashboard fixture, open output in browser
- `testnux doctor` — preflight check (Node, Playwright, env vars, common pitfalls)
- OWASP ASVS + WCAG 2.2 AA standards alignment out of the box
- `[VERIFY]` confidence markers on every LLM-generated cell

### v0.2.0-alpha.1 (current on `@alpha`, shipped 2026-04-27)

**LLM agent suite** (real Claude API; require `CLAUDE_API_KEY` + `npm install @anthropic-ai/sdk`):
- `testnux discover <url>` — browse a page, emit `scenarios.md` with G/W/T TCs
- `testnux plan <slug>` — `scenarios.md` → `test-plan.md` with frontmatter + R-IDs + [VERIFY]
- `testnux codify <slug>` — `test-plan.md` → Playwright `spec.ts`; preserves XFF + form.requestSubmit + afterEach patterns; `--safe` mode for hand-edited specs
- `testnux enrich <slug>` — three append-only passes (design-review / qa-structural / graph-context), marker-bounded so human edits survive regeneration
- `testnux batch-plan --pages "login,register,..."` — parallel multi-page pipeline with cumulative `--max-spend` enforcement and replacement-agent failure isolation
- Eval harness at `test/eval/` — 3 fixture pages with golden outputs, scoring on TC count / R-ID format / [VERIFY] placement / standards alignment

**Signoff suite (S1-S5):**
- `testnux sign <surface>` — record an attestation (chained HMAC log)
- `testnux sign pdf <surface>` — render the UAT signoff ledger to PDF with hash-chain verification badge
- `testnux sign stale-check <surface> --threshold 90d` — flag entries older than threshold (CI gate via `--strict`)
- OSCAL `assessment-log` integration — `testnux sca oscal` populates `responsible-parties` + `assessments[].assessment-log.entries` (validated against OSCAL 1.1.2 schema)
- `testnux sign --justify-with-llm` — optional LLM-drafted justification text; reviewer edits + confirms; auto-prefixed `[VERIFY] LLM-drafted, reviewer-confirmed:`
- Multi-reviewer N-of-M — `required_reviewers` field in BR frontmatter; `testnux br rtm` shows partial-attestation status; revocation supported (append-only)

**Per-env + visual regression:**
- `testnux run <slug> --env staging|prod|local` — env-suffixed test-pass folders; auto-injects `env:` and `base_url:` into frontmatter
- `testnux compare <slug> staging prod` — per-TC verdict: MATCH / PROMOTION / REGRESSION / DIVERGE / MISSING-A / MISSING-B; CI gate via `--threshold`
- `testnux visual baseline <slug>` — capture full-page Playwright screenshots to `<folder>/visual-baseline/<TC-ID>.png`
- `testnux visual compare <slug> --threshold 0.05 [--strict]` — pixelmatch diffs against baseline; graceful degrade if `pixelmatch` not installed

**Deterministic generators:**
- `testnux rtm` — generate `TRACEABILITY.md` from REQUIREMENTS.md + sprint-log + code grep + test-plan.md (human-edit-survives-regeneration markers)
- `testnux sca init|generate|pdf` — Security Control Assessment from test results
- `testnux mcp` — stdio MCP server for Claude Code integration (mount via `.claude/settings.json`)
- `testnux report` is **no longer a stub** — full XLSX + self-contained HTML (TOC sidebar, status tabs, embedded screenshots, standards alignment matrix, threat coverage, base64-inlined assets)

**Tests:** 152 → 365 (all green). 0 lint errors.

> **Why "alpha":** the LLM agents are wired but not yet hardened with eval-set regression testing across many real customer pages. Use in preview; expect prompt-quality iteration before 0.2.0 stable.

### v0.3 (next; needs traction + founder full-time decision)

- `--industry fintech` (NIST 800-63B, NYDFS 23 NYCRR 500, PSD2, PCI DSS) and `--industry healthcare` (HIPAA Security Rule, HITECH) standards configs
- gstack `/testnux` skill bundle published to the official catalog (slash-command-callable from any Claude Code session)
- Cypress + Vitest adapter support
- Eval harness expansion: 10+ real customer pages, regression CI gate before any LLM prompt change ships
- Premium tier launch: hosted multi-tenant auditor portal, GRC platform integrations, white-glove onboarding

---

## FAQ

**Does TestNUX cost anything?**  
The CLI is free (Apache 2.0). The v0.2 LLM agents use Claude's API — approximately **$0.30–$0.50 per page** for a full AI pass (Sonnet-class). On a Claude Max subscription (recommended: **5x tier ~$100/mo** with Opus 4.7 + Sonnet subagents), heavy multi-agent dispatch consumes a fresh 5-hour quota window in **~1-2 hours of focused work**. Plan two 5-hour blocks per day max. See [docs/costs.md](docs/costs.md) for the empirical burn rates + recommended working patterns.

OSS = self-serve via markdown docs. Premium tier (v0.4+) = white-glove onboarding + consulting + auditor facilitation. See [docs/adoption-checklist.md](docs/adoption-checklist.md) for what's included.

**Do I need Claude Max or an Anthropic API key?**  
Not for the deterministic core. `testnux report`, `testnux validate`, `testnux rtm`, `testnux sca`, `testnux run`/`compare`, `testnux visual baseline`/`compare`, and the entire signoff suite work without any LLM. Claude API access is required only for the v0.2-alpha LLM agents (`discover`, `plan`, `codify`, `enrich`, `batch-plan`, optional `sign --justify-with-llm`).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

Quick version:
- All contributors must sign off commits with `git commit -s` (DCO — no CLA paperwork)
- Every PR must ship with tests
- Open an issue before a large PR so we can align on design

---

## Credits

TestNUX's three-track discipline, multi-agent dispatch workflow, and slash-command integration patterns derive directly from **gstack** (https://github.com/garrytan/gstack) by Garry Tan. gstack is the OSS solo-builder framework that TestNUX's methodology is built on. TestNUX adds a deterministic CLI artifact pipeline on top of gstack's structural and methodological foundations.

Other credits: Playwright (evidence capture), IBM Trestle (OSCAL validation), NIST OSCAL (standards schema), Anthropic Claude (v0.2 LLM agents), Apache Software Foundation (license framework).

See [docs/credit.md](docs/credit.md) for the full attribution breakdown and citation format.

---

## Contributing back to the ecosystem

TestNUX exists because of two ecosystems we depend on. We want to feed both.

### → gstack (the methodological foundation)

[gstack](https://github.com/garrytan/gstack) by Garry Tan is the OSS framework
TestNUX's discipline derives from. We're committed to upstreaming patterns that
benefit gstack core, not just TestNUX:

- **Marker convention for human-edits-survive-regeneration** — The
  `<!-- testnux:row R-XX begin/end -->` pattern is gstack-shaped. We'd like
  to propose a `gstack-marker` helper module in gstack core so other gstack
  skills (e.g., `/plan-ceo-review`, `/design-review`) can reuse it.
- **Per-test rate-limit isolation pattern** — The XFF approach in
  `templates/spec.ts` (proven against production rate limiters) is universal
  enough to land in gstack's `/qa` skill, not just TestNUX.
- **Hash-chained sign-off log (HMAC-SHA256 + JSONL)** — `src/lib/uat-log.mjs`
  could become a gstack utility for any skill that needs tamper-evident
  attestation (e.g., `/ship` could sign release approvals).

**If you're a gstack maintainer or contributor:** open an issue here
referencing what you'd like to upstream — we'll co-write the PR.

The gstack `/testnux` skill bundle is on the v0.3 roadmap — planned for inclusion
in the official gstack skill catalog once shipped.

### → Anthropic / Claude Code native team

TestNUX is designed to be Claude-Code-friendly from day one. Three integration
points where we'd love collaboration with Anthropic:

- **MCP server registration** — v0.3 will ship a stdio MCP server exposing
  TestNUX's commands as Claude Code tools. We'd like TestNUX listed in the
  official Anthropic MCP server directory once it ships.
- **Native skill catalog** — Once gstack's `/testnux` skill is upstream,
  TestNUX commands become slash-command-callable in any Claude Code session.
  An official cross-listing in Anthropic's skill marketplace (when it exists)
  would amplify reach.
- **Verified evidence chain pattern** — The `[VERIFY]` confidence marker
  convention TestNUX uses for LLM-generated cells is generalizable to any
  Claude-output workflow. We'd like to propose it as an Anthropic-blessed
  pattern for AI-generated content in regulated contexts.

**If you're at Anthropic** (Claude Code team, MCP team, applied AI
engineering): reach out at `ccling1998@gmail.com`. We'd love a 30-min
conversation about official integration paths. No expectations — just
genuinely useful conversations.

### → Everyone else

Standard OSS contribution: see `CONTRIBUTING.md` for the DCO sign-off
process. Issues + PRs welcome. First-time contributors: look for
`good-first-issue` labels (we're seeding these as the project ages).

The OSS gives users the SKILL. Co-developing the ecosystem is how the
SKILL keeps getting sharper.

---

## License and trademark

Apache 2.0. See [LICENSE](LICENSE).

"TestNUX™" is a trademark of Chu Ling. See [NOTICE](NOTICE) for trademark terms. The Apache 2.0 license covers the code; the trademark covers the name.

---

## Contact

Single point of contact for all matters (security, premium, partnerships, contributions): **ccling1998@gmail.com**

For security vulnerabilities, please use [GitHub Private Vulnerability Reporting](https://github.com/StillNotBald/testnux/security/advisories/new) (preferred — gives us a private collaboration channel + CVE assignment workflow). Email is the fallback.

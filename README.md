# 5-NUX

**AI-native OSS PM tool in CLI** — purpose-built for regulated software, with auto-generated RTM, SCA, and OSCAL evidence out of the box.

> 5-NUX gives you a whole tree. You provide the soil and you ship yourself.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Tests: 587 passing](https://img.shields.io/badge/tests-587%20passing-brightgreen.svg)]()
[![Version: v0.5.0-alpha.1](https://img.shields.io/badge/version-v0.5.0--alpha.1-orange.svg)](CHANGELOG.md)
[![AI-agent native](https://img.shields.io/badge/AI--agent-native-9333ea.svg)]()

---

## What 5-NUX does for your project

Runs the **regulated-software artifact + evidence chain — requirement → sprint → test → validation → audit handoff** — entirely from the CLI, in plain files in your git repo. No SaaS. No login. No vendor lock-in.

Two things make it different from every other OSS project tool:

1. **Purpose-built for regulated software.** Auto-generates the artifacts regulators actually ask for — RTM, SCA, OSCAL 1.1.2, HMAC-signed evidence packages. The OSS replacement for IBM DOORS / Polarion / Jama / codeBeamer ($1k–$5k+/seat/year, locked databases). See [`docs/scope.md`](docs/scope.md) for the full positioning vs. enterprise tooling and other OSS PM tools.
2. **AI-agent native.** Designed in the LLM era — every artifact is a plain file, every action is a CLI verb, every output has a `--json` mode. An LLM agent operates 5-NUX the same way a human does. No custom SDK integration, no proprietary API, no auth dance. `branchnux mcp` starts a Model Context Protocol (MCP) server on stdio so Claude Code can invoke every BranchNuX verb as a native tool — mount it once in `.claude/settings.json` and your agent has the full CLI surface. See [`docs/collaboration.md`](docs/collaboration.md) for how AI agents and humans collaborate at each stage.

What you get, concretely:

| You run | You get |
|---|---|
| `branchnux rtm` | Requirements Traceability Matrix regenerated from REQUIREMENTS.md + sprint folders + source-code annotations + test files |
| `branchnux sca <surface>` | Security Control Assessment (8 standard sections, regulator-ready) |
| `branchnux sca oscal <surface>` | NIST OSCAL 1.1.2 JSON — the format FedRAMP auditors and SOC 2 examiners prefer |
| `branchnux sign <surface>` | HMAC-chained tamper-evident attestation; signed PDF for handoff |
| `rootnux adr-new <title>` | Sequentially numbered ADR scaffold |
| `rootnux risk-add` | Risk register entry |
| `trunknux new-sprint <slug>` | Date-prefixed sprint folder with scaffolded README + LOG |
| `leafnux health` | RAG-status snapshot of your whole project (requirements, risks, ADRs, sprint freshness) |

> **Is 5-NUX OSS alone enough to ship + pass audits?** Yes. Adjacent tools (kanban, chat, dashboards, build pipelines) are optional pairings, not requirements.

### What 5-NUX OSS does *not* include — and your three options

For each capability outside 5-NUX OSS scope, you have three orthogonal options:

| If you want... | A: Existing market apps | B: Build yourself | C: Engage LeapNuX premium |
|---|---|---|---|
| **Active task tracking + kanban boards** | GitHub Issues, Linear, Jira, Asana, Trello | Custom kanban over your `requirements/` + sprint-log/ | LeapNuX 6-NUX hosted board |
| **Visual roadmap / Gantt timeline** | Productboard, Aha!, GitHub Projects | Render a Gantt from sprint-log/ folder dates | LeapNuX 6-NUX roadmap view |
| **Real-time team chat + notifications** | Slack, Discord, Microsoft Teams | Self-host Mattermost / Rocket.Chat | LeapNuX 6-NUX notification hub |
| **Build + deploy pipelines** | GitHub Actions, CircleCI, Jenkins, Vercel | Self-host Drone / Concourse | Out of scope (use existing tooling) |
| **GUI for non-technical stakeholders** (compliance officers, executives, board) | None that surface RTM / SCA / OSCAL natively | Render `--json` outputs into your own dashboard | LeapNuX 6-NUX premium GUI — purpose-built for compliance |
| **Multi-user hosted dashboards / signed evidence portal** | None mapping cleanly to OSCAL + HMAC ledger | Stand up a portal yourself with the JSON outputs | LeapNuX 6-NUX premium evidence portal |
| **Account-bound auditor access + per-firm scoping** | DocuSign Rooms, ShareFile (generic) | Build access control on your repo + cloud storage | LeapNuX 6-NUX premium audit-room |
| **Professional support contract + SLA** | None for OSS RTM tooling | Hire a freelance compliance engineer | LeapNuX 6-NUX premium support tier |

**Column A** is what most teams reach for first — pair them with 5-NUX, no integration needed. **Column B** is the DIY path against the `--json` outputs of every 5-NUX verb. **Column C** is when you want a turn-key commercial product with hosted infra, multi-user RBAC, and account-bound access — that's [LeapNuX 6-NUX premium](docs/MOTTO.md).

For the full "what's enough" breakdown, comparison vs DOORS / Polarion / Jama / codeBeamer, and adoption sequence — see [`docs/scope.md`](docs/scope.md).

---

## The 7 packages

| Package | Layer | Status | Verbs |
|---|---|---|---|
| `@leapnux/rootnux` | intent (specs, ADRs, risks, KB) | active | `init`, `lint`, `adr-new`, `risk-add`, `status`, `kb-init` |
| `@leapnux/trunknux` | build (sprint scaffolding) | active | `new-sprint`, `summarize`, `lint`, `log` |
| `@leapnux/branchnux` | verification (test plans, RTM, SCA, OSCAL, sign) | active | `init`, `plan`, `codify`, `report`, `validate`, `sca`, `sca oscal`, `rtm`, `sign`, `sign pdf`, `visual`, `discover`, `enrich`, `br`, `doctor` (15+) |
| `@leapnux/leafnux` | continuous health | active | `health` |
| `@leapnux/fruitnux` | external deliverables | scoped (verbs in design) | (`pack` candidate for v0.5.1+) |
| `@leapnux/6nux-core` | shared library | active | (no CLI; shared schemas, conventions, IDs, utils) |
| `@leapnux/5nux` | meta-package | active | (no CLI; installs all 5 active NUX CLIs + 6nux-core) |

---

## Install

```sh
npm install -g @leapnux/5nux        # full stack (all 5 active NUX CLIs + 6nux-core)
npm install -g @leapnux/rootnux     # just requirements + ADRs + risks + KB
npm install -g @leapnux/trunknux    # just sprint scaffolding
npm install -g @leapnux/branchnux   # just verification + RTM + SCA + OSCAL + sign-off
npm install -g @leapnux/leafnux     # just continuous-health snapshots
```

> **Note:** `@leapnux/*` packages are not yet published to npm — org claim and scope reservation are pending. For now, clone this repo and run via the package binaries from the workspace root.

---

## Quick tour

```sh
rootnux init                                          # scaffold REQUIREMENTS.md + TRACEABILITY.md + risks/ + docs/adr/
rootnux adr-new "Use PostgreSQL for primary store"    # ADR with sequential numbering
rootnux kb-init                                       # Knowledge Base scaffold (audit-prep sections)
trunknux new-sprint v1-launch                         # date-prefixed sprint folder
trunknux summarize                                    # SPRINT_SUMMARY.md from git log
branchnux plan login                                  # AI-drafted test plan with [VERIFY] markers
branchnux rtm                                         # regenerate TRACEABILITY.md
branchnux sca login                                   # 8-section Security Control Assessment
branchnux sca oscal login                             # NIST OSCAL 1.1.2 JSON
branchnux sign login                                  # HMAC-chained sign-off
leafnux health                                        # GREEN/AMBER/RED snapshot of project state
```

Full verb reference: [`docs/reference.md`](docs/reference.md). First-15-minutes walkthrough: [`docs/getting-started.md`](docs/getting-started.md).

---

## Stakeholders × AI roles

Each NUX node serves a different stakeholder, with a different relationship to AI-drafted content:

| Node | Stage | Human stakeholder | AI's typical role |
|---|---|---|---|
| **rootnux** | Requirement | Product / PM / spec author | Drafts R-XX entries, scaffolds ADRs |
| **trunknux** | Development | Dev / Eng | Summarizes git log, drafts narrative |
| **branchnux** | Test + validation | QA / Test lead | Discovers test scenarios, generates plans (with `[VERIFY]` markers) |
| **leafnux** | Continuous health | Eng / SRE | Reads artifacts, computes RAG status |
| **fruitnux** | Audit handoff | Compliance / Legal / external auditor | Bundles regulator-ready packets *(verbs in design)* |

Where the AI/human boundary sits at each stage, the four collab patterns (drafted-by-AI/attested-by-human, append-only enrichment, one-agent-per-slug, cost-gated automation), and the typical end-to-end cycle — see [`docs/collaboration.md`](docs/collaboration.md).

---

## Project folder layout

The five NUX nodes are **peers** at your project root — different stakeholders, different folders, parallel views of the same project. Nothing is nested under another node:

```
your-project/
├── requirements/                  ← rootnux  (Product / PM)
│   ├── REQUIREMENTS.md            ← R-XX specs
│   ├── TRACEABILITY.md            ← RTM (generated by branchnux rtm)
│   ├── risks/risks.md             ← risk register
│   └── validations/<surface>/     ← branchnux + fruitnux output (SCAs, audit packets)
│
├── docs/                          ← rootnux  (Product / PM)
│   ├── adr/NNNN-<slug>.md         ← ADRs (rootnux adr-new)
│   └── KNOWLEDGE_BASE.md          ← KB scaffold (rootnux kb-init)
│
├── sprint-log/                    ← trunknux  (Dev / Eng)
│   └── <date>_<slug>/
│       ├── README.md              ← sprint scaffold (trunknux new-sprint)
│       ├── LOG.md                 ← weekly journal entries (trunknux log)
│       └── SPRINT_SUMMARY.md      ← git-log roll-up (trunknux summarize)
│
├── testing-log/                   ← branchnux  (QA / Test lead)
│   └── <date>_<surface>/
│       ├── test-plan.md           ← TC matrix + Given/When/Then (branchnux plan)
│       ├── execution-log.md       ← run results (auto-generated)
│       └── evidence/              ← screenshots, logs (auto)
│
├── <your-app-source>/             ← your code (whatever framework you use — outside 5-NUX scope)
│
└── (leafnux output: lives in your CI / dependabot / observability stack — not in the repo)
```

NUX packages do **not** import each other — they communicate via file-system conventions in `@leapnux/6nux-core`. Implementation spec: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 📚 Documentation

- **[`docs/MOTTO.md`](docs/MOTTO.md)** — OSS / Premium product split (and why it stays sharp)
- **[`docs/scope.md`](docs/scope.md)** — what 5-NUX is, isn't, and what's actually enough; comparison vs. DOORS / Polarion / Jama
- **[`docs/collaboration.md`](docs/collaboration.md)** — stakeholders + AI/human collaboration patterns at each stage
- **[`docs/6-NUX.md`](docs/6-NUX.md)** — taxonomy schema (the conceptual model)
- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — implementation spec (monorepo layout, package contracts, security model)
- **[`docs/concepts.md`](docs/concepts.md)** — three-track discipline, `[VERIFY]` markers, HMAC chain, deterministic-core vs. opt-in-AI split
- **[`docs/getting-started.md`](docs/getting-started.md)** — first 15 minutes
- **[`docs/reference.md`](docs/reference.md)** — full verb reference
- **[`docs/adr/`](docs/adr/)** — Architecture Decision Records (7 locked decisions documented via `rootnux adr-new` itself)
- **[`CHANGELOG.md`](CHANGELOG.md)** — release history
- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — how to contribute (DCO, hygiene rules, workspace workflow)

---

## Roadmap

- **v0.4.x** — alpha series; rootnux + trunknux + branchnux mature; leafnux + fruitnux brought into active OSS scope
- **v0.5.0-alpha.1** — `trunknux log`, `rootnux kb-init`, `leafnux health` shipped; `fruitnux pack` in design
- **v1.0** — stability + landing page at leapnux.com + 6-NUX commercial spec

[Open an issue](https://github.com/leapnux/5nux/issues) to propose what to prioritize next.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Quick version: sign commits with `git commit -s` (DCO, no CLA), ship tests with every PR, open an issue before a large change.

---

## License

Apache 2.0. See [LICENSE](LICENSE).

"BranchNuX™" and "LeapNuX™" are trademarks of Chu Ling. See [NOTICE](NOTICE) for trademark terms. The Apache 2.0 license covers the code; the trademark covers the name.

## Author

Chu Ling ([StillNotBald](https://github.com/StillNotBald)) — ccling1998@gmail.com.
Security reports: [GitHub Private Vulnerability Reporting](https://github.com/leapnux/5nux/security/advisories/new) (preferred).

# 5-NUX

**A regulated-software artifact + audit-evidence toolchain in your CLI — AI-agent native, with auto-generated Requirements Traceability Matrix (RTM) out of the box.**

> 5-NUX gives you a whole tree. You provide the soil and you ship yourself.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Tests: 587 passing](https://img.shields.io/badge/tests-587%20passing-brightgreen.svg)]()
[![Version: v0.5.0-alpha.1](https://img.shields.io/badge/version-v0.5.0--alpha.1-orange.svg)](CHANGELOG.md)
[![AI-agent native](https://img.shields.io/badge/AI--agent-native-9333ea.svg)]()

## What 5-NUX does for your project

5-NUX runs the **regulated-software artifact + evidence chain — requirement → sprint → test → validation → audit handoff** — entirely from the CLI, using plain files in your git repo. No SaaS. No login. No vendor lock-in.

Two things make it different from every other OSS project tool:

1. **Purpose-built for regulated software.** It auto-generates the artifacts regulators actually ask for (RTM, SCA, OSCAL, signed evidence packages).
2. **AI-agent native.** Designed in the LLM era — every artifact is a plain file, every action is a CLI verb, every output has a `--json` mode. An LLM agent operates 5-NUX the same way a human does. No custom SDK integration, no proprietary API, no auth dance.

If you ship under SOC 2, ISO 27001, NYDFS, GDPR, OSCAL, SOX, or HIPAA, every regulator asks for the same artifact: a **Requirements Traceability Matrix (RTM)** that maps each requirement → sprint → code commit → test case → audit evidence. Today your two real options are bad ones:

1. **Build the RTM manually in Excel.** Re-do every audit cycle. Drift between docs and reality. Lose hours under deadline pressure when the auditor arrives.
2. **Buy enterprise compliance tooling** — IBM DOORS, Polarion, Jama Connect, codeBeamer. **$1,000–$5,000+ per seat per year.** Your evidence locked inside their proprietary database. Vendor lock-in for a regulator-mandated artifact.

**5-NUX gives you the same automation, for free, in plain files that live in your own git repo.**

| You run | You get |
|---|---|
| `branchnux rtm` | `TRACEABILITY.md` regenerated from `REQUIREMENTS.md` + sprint folders + source-code `// R-XX` annotations + test files |
| `branchnux sca <surface>` | A Security Control Assessment document (8 standard sections, regulator-ready) |
| `branchnux sca-oscal <surface>` | Same evidence as **NIST OSCAL 1.1.2 JSON** — the format FedRAMP auditors and SOC 2 examiners prefer |
| `branchnux sign <surface>` | **HMAC-chained tamper-evident attestation.** Auditors verify the chain independently of the tool |
| `branchnux sign-pdf <surface>` | Signed PDF with hash-chain badge for legal/compliance handoff |

**This is the gap 5-NUX fills.** Most OSS PM tools stop at "kanban board." Most compliance tools live behind a paywall and a SaaS portal. **5-NUX is the missing middle:** regulated-grade evidence generation, end-to-end, in plain files, free.

## AI-agent native — human + LLM as partners

5-NUX was designed in the era where Claude, GPT, or another LLM is your daily collaborator — not a tool you bolt AI onto later.

**The competitive angle:** enterprise compliance tools (DOORS, Polarion, Jama, codeBeamer) were built pre-LLM. Their data lives in proprietary databases. Their UIs are click-driven. Their APIs require custom SDK integration per agent. **5-NUX is plain files + CLI verbs.** An LLM agent operates 5-NUX the same way a human does — by reading the markdown, running a verb, parsing the output.

| Why agents thrive on 5-NUX |
|---|
| **Plain-file artifacts** — Markdown, YAML, JSON. Agents read, write, and grep your project state directly. No proprietary schema. |
| **CLI-first interface** — every verb is one shell call. Agents already know how to run shell. |
| **File-system convention contract** — cross-cutting actions ("find every R-XX without test coverage") are a single grep, not a custom integration. |
| **`[VERIFY]` markers on every LLM-drafted cell** — explicit AI/human boundary built into the file format. Agents author, humans attest. |
| **Cost gates on every LLM verb** — `--max-spend`, `--dry-run`, `--json` throughout. Predictable cost + structured output in agent-driven workflows. |
| **HMAC-chained sign-off** — tamper-evident attestation works the same whether a human or agent appended the entry. |
| **MCP integration on the roadmap** (v0.3+) — Claude Code will invoke 5-NUX verbs as native tools. |

**The same person runs `branchnux rtm` in their terminal in the morning, and has a Claude Code agent run it in a CI pipeline that afternoon.** Same artifact, same evidence chain, same sign-off ledger. The agent isn't "integrating with" 5-NUX — it's USING 5-NUX, the same way you do.

If your team treats AI as a partner (Claude Code, Cursor, Aider, Cline, MCP-enabled tooling), 5-NUX is built for that workflow. Most regulated-software tooling isn't.

## What 5-NUX is *not* (and what's actually enough)

**For shipping real regulated software, 5-NUX OSS on its own is more than sufficient.** The artifacts it produces (RTM, SCA, OSCAL, signed evidence packages) are exactly what auditors ask for. You don't need to buy anything else to pass a SOC 2, ISO 27001, NYDFS, GDPR, or HIPAA review.

That said, 5-NUX is deliberately scoped — it doesn't try to replace adjacent tools, and you don't have to use them either. Here's what's outside scope and where to get it if you want it:

| If you want... | What to use |
|---|---|
| Active task tracking + kanban boards | GitHub Issues / Linear / Jira (pair with 5-NUX — no integration work needed; 5-NUX writes plain files, your tracker manages your tickets) |
| Visual roadmap / Gantt timeline | Productboard / Aha! / GitHub Projects / Asana |
| Real-time team chat + notifications | Slack / Discord / Teams |
| Build + deploy pipelines | GitHub Actions / CircleCI / Jenkins (5-NUX hands these off — see "ship is yours" in [`docs/MOTTO.md`](docs/MOTTO.md)) |
| **GUI for non-technical stakeholders** (compliance officers, executives, board) | Build it yourself, **or engage LeapNuX 6-NUX premium when shipped** |
| **Multi-user hosted dashboards, signed evidence portal, account-bound access** | Build it yourself, **or engage LeapNuX 6-NUX premium when shipped** |

**The honest version:**

- ✅ Ship a SOC 2 / ISO 27001 / NYDFS regulated app using just 5-NUX OSS + GitHub free tier? **Yes.**
- ✅ Pass an external audit with 5-NUX-generated artifacts? **Yes** — RTM, SCA, OSCAL, and HMAC-signed evidence is exactly what auditors review.
- ✅ Run the whole evidence pipeline as part of CI, with an LLM agent driving it? **Yes** — every verb is CLI + plain files + `--json` modes; agents drive 5-NUX the same way humans do.
- ⚠️ Want a click-driven UI for non-engineers, multi-user hosted dashboards, or an account-bound evidence portal for external stakeholders? **Either build it yourself, or engage [LeapNuX 6-NUX premium](docs/MOTTO.md) when it ships** (commercial product, future).

If you're shopping for "Jira-in-CLI," 5-NUX isn't it. If you're shopping for "DOORS/Polarion-replaced-with-OSS-files-and-an-LLM-friendly-CLI" — **5-NUX is exactly that, and 5-NUX alone is enough to ship.**

## What this is (the bigger picture)

**5-NUX is the entire project/product development practice in your CLI.** Each of the five OSS nodes maps directly to a standard software-lifecycle stage and to the stakeholder who owns that stage:

| Node | Lifecycle stage | Stakeholder who owns it | Where the artifacts live |
|---|---|---|---|
| **rootnux** | **Requirement** | Product / PM / spec author | `requirements/`, `docs/adr/` |
| **trunknux** | **Development** | Dev / Eng / contributor | `sprint-log/` |
| **branchnux** | **Test + validation** | QA / Test lead / auditor-facing | `testing-log/`, `requirements/validations/` |
| **leafnux** | **Continuous health** | Eng / SRE / dev-loop | local health signals (RAG status, ADR currency, sprint freshness, test trend) |
| **fruitnux** | **Audit-ready handoff** | Compliance / Legal / external auditor | bundled regulator-ready packets *(verbs in design)* |

The five nodes are **peers**, not nested layers. Each lives in its own folder at the project root and serves its own stakeholder. They cooperate via file-system conventions, not API calls — every artifact is a plain file (Markdown, XLSX, HTML, PDF, JSON) that lives in your git repo and can be read by auditors without installing anything.

The sixth node — **soil** (your hosting, vendors, multi-user backend) — is the user's environment. Premium territory in the future 6-NUX commercial product. The act of shipping is yours.

5-NUX is a 7-package npm-workspaces monorepo: one CLI per node + a shared core library + a meta-package that installs the full stack. The intended audience is engineering and QA leads at regulated-software teams who need a defensible audit-evidence trail but do not want to pay for a hosted SaaS or cede control of their evidence to a vendor.

Apache 2.0, ESM-only, Node 20+. This is the anchor, not the revenue product. The OSS/Premium boundary is sharp: anything local + single-user + file-native is OSS. Anything hosted + multi-user + account-bound is premium (soil + 6-NUX). See [`docs/MOTTO.md`](docs/MOTTO.md) for the full split.

---

## The 7 packages

| Package | Layer | Status | Verbs |
|---|---|---|---|
| `@leapnux/rootnux` | intent (specs, ADRs, risks) | active | `init`, `lint`, `adr-new`, `risk-add`, `status` |
| `@leapnux/trunknux` | build (sprint scaffolding) | active | `new-sprint`, `summarize`, `lint` |
| `@leapnux/branchnux` | verification (test plans, RTM, SCA) | active | `init`, `plan`, `codify`, `report`, `validate`, `sca`, `sca-oscal`, `rtm`, `sign`, `sign-pdf`, `visual`, `discover`, `enrich`, `br`, `doctor` (15+ verbs) |
| `@leapnux/leafnux` | continuous health | active — `health` verb in v0.5.0 | `health` |
| `@leapnux/fruitnux` | external deliverables | scoped — verbs in design | (verbs in design) |
| `@leapnux/6nux-core` | shared library | active | (no CLI; shared schemas, conventions, IDs, utils) |
| `@leapnux/5nux` | meta-package | active | (no CLI; installs all 5 NUX packages) |

---

## Install

**Full stack (all 5 NUX packages):**

```sh
npm install -g @leapnux/5nux
```

**Just one node:**

```sh
npm install -g @leapnux/rootnux
npm install -g @leapnux/trunknux
npm install -g @leapnux/branchnux
```

> Note: `@leapnux/*` packages are not yet published to npm — org claim and scope reservation are pending.
> For now, clone this repo and run via the package binaries from the workspace root.

---

## Quick tour

### State your requirements

```sh
rootnux init
```

Scaffolds `REQUIREMENTS.md`, `TRACEABILITY.md`, a risks register, and `docs/adr/`.

### Record an architectural decision

```sh
rootnux adr-new "Use PostgreSQL for primary store"
```

Creates `docs/adr/0001-use-postgresql-for-primary-store.md` with sequential numbering.

### Start a sprint

```sh
trunknux new-sprint v1-launch
```

Creates `sprint-log/2026-04-28_v1-launch/` with a sprint scaffold.

### Summarize what was built

```sh
trunknux summarize
```

Generates `SPRINT_SUMMARY.md` from `git log`, grouped by conventional-commit type.

### Generate a test plan

```sh
branchnux plan login
```

Produces `testing-log/<date>_login/test-plan.md` with TC matrix, Given/When/Then per TC, R-ID frontmatter, and `[VERIFY]` markers on every LLM-drafted cell.

### Produce a Security Control Assessment

```sh
branchnux sca login
```

Produces an 8-section SCA document (Markdown + optional PDF) for the login surface.

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

The act of shipping (your CI, release pipeline, deploys) is also yours — outside 5-NUX scope by design.

## How the nodes cooperate

NUX packages do **not** import each other. They communicate by reading and writing well-known file paths defined in `@leapnux/6nux-core`. Concretely:

- `rootnux` writes specs to `requirements/REQUIREMENTS.md`
- `branchnux rtm` reads that file (by path) and writes `requirements/TRACEABILITY.md`
- `branchnux plan` reads R-XX IDs from REQUIREMENTS.md to anchor test plans
- `leafnux health` reads the same file to compute completion percentage

This keeps each package independently installable (`npm install -g @leapnux/rootnux` works without the others) and avoids coupling release cycles. A new stakeholder adopting just their node doesn't drag in the rest.

See [`docs/6-NUX.md`](docs/6-NUX.md) for the full taxonomy schema and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the implementation spec.

---

## Why branchnux?

BranchNuX is the most mature node in the tree. A few design decisions worth knowing before you adopt it:

- **Three-track discipline.** `requirements/` (what you said you'd build) + `sprint-log/` (what was built) + `testing-log/` (what was tested). One traceable graph, all in your repo, date-stamped for audit snapshots.
- **`[VERIFY]` markers on every LLM-drafted cell.** Explicit annotation that no human has attested the content yet. AI accelerates authoring; humans gate evidence. Removing a `[VERIFY]` without reading the underlying content is the one way to make your evidence package fail under audit.
- **HMAC-chained signoff ledger.** Tamper-evident attestation. The signoff PDF carries a hash-chain verification badge that auditors can verify independently of the tool.
- **Deterministic core, opt-in AI.** `branchnux report`, `validate`, `rtm`, `sca`, and the signoff suite require no LLM. The Claude API (`discover`, `plan`, `codify`, `enrich`) is opt-in with explicit cost gates (`--max-spend`, `--dry-run`).
- **Audience split.** Most branchnux users never run the CLI — they read the HTML report, XLSX, signed PDF, or OSCAL JSON that the CLI produced. The artifact formats (HTML, Excel, PDF, JSON, Markdown) were chosen so compliance officers, legal counsel, and external auditors can open them without installing anything.

---

## Documentation

- [`docs/MOTTO.md`](docs/MOTTO.md) — OSS / Premium product split and strategic posture
- [`docs/6-NUX.md`](docs/6-NUX.md) — taxonomy schema
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — monorepo implementation spec
- [`docs/concepts.md`](docs/concepts.md) — key concepts (three-track discipline, VERIFY markers, HMAC chain)
- [`docs/getting-started.md`](docs/getting-started.md) — first 15 minutes
- [`docs/reference.md`](docs/reference.md) — full verb reference
- [`CHANGELOG.md`](CHANGELOG.md) — release history
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to contribute

---

## Roadmap

- **v0.4.x** — alpha series; rootnux + trunknux + branchnux mature; leafnux + fruitnux brought into active OSS scope
- **v0.5.0-alpha.1** — `trunknux log`, `rootnux kb-init`, `leafnux health` (three verbs shipping in parallel); fruitnux scoped with first verb candidate (`fruitnux pack`) in design
- **v1.0** — stability milestone + landing page at leapnux.com + 6-NUX commercial spec

If you want the roadmap to prioritize a specific artifact type, [open an issue](https://github.com/leapnux/5nux/issues).

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

Quick version: sign commits with `git commit -s` (DCO, no CLA), ship tests with every PR, open an issue before a large change.

---

## License

Apache 2.0. See [LICENSE](LICENSE).

"BranchNuX™" and "LeapNuX™" are trademarks of Chu Ling. See [NOTICE](NOTICE) for trademark terms. The Apache 2.0 license covers the code; the trademark covers the name.

## Author

Chu Ling ([StillNotBald](https://github.com/StillNotBald)) — ccling1998@gmail.com

Security reports: [GitHub Private Vulnerability Reporting](https://github.com/leapnux/5nux/security/advisories/new) (preferred) or email.

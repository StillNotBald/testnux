# 5-NUX

**A complete software-project audit-evidence trail in your CLI — file-native, OSS, and free.**

> 5-NUX gives you a whole tree. You provide the soil and you ship yourself.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Tests: 587 passing](https://img.shields.io/badge/tests-587%20passing-brightgreen.svg)]()
[![Version: v0.5.0-alpha.1](https://img.shields.io/badge/version-v0.5.0--alpha.1-orange.svg)](CHANGELOG.md)

## What 5-NUX does for your project

If your team ships regulated software — SOC 2, ISO 27001, NYDFS, GDPR, OSCAL, SOX, HIPAA — every regulator asks for the same artifact: a **Requirements Traceability Matrix (RTM)** that maps each requirement → sprint → code commit → test case → audit evidence. Today, your two real options are bad ones:

1. **Build the RTM manually in Excel.** Re-do it every audit cycle. Drift between docs and reality. Lose hours under deadline pressure when the auditor arrives.
2. **Buy enterprise compliance tooling** — IBM DOORS, Polarion, Jama Connect, codeBeamer. **$1,000–$5,000+ per seat per year.** Your evidence locked inside their proprietary database. Vendor lock-in for a regulator-mandated artifact.

**5-NUX gives you the same automation, for free, in plain files that live in your own git repo.**

Run `branchnux rtm` and your `TRACEABILITY.md` regenerates from your existing `REQUIREMENTS.md` + sprint folders + source-code annotations + test files. Run `branchnux sca` and you get a Security Control Assessment document. Run `branchnux sca-oscal` and you get the same evidence as NIST OSCAL 1.1.2 JSON (the format SOC 2 examiners and FedRAMP auditors prefer). Run `branchnux sign` and every attestation is **HMAC-chained for tamper evidence** — auditors verify the chain independently of the tool.

**This is the gap 5-NUX fills.** No other OSS tool generates RTM, SCA, OSCAL, and HMAC-signed audit packages end-to-end from your existing project files. Most OSS PM tools stop at "kanban board." Most compliance tools live behind a paywall and a SaaS portal. 5-NUX is the missing middle: regulated-grade evidence generation, file-native, in your CLI, in your repo, free.

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

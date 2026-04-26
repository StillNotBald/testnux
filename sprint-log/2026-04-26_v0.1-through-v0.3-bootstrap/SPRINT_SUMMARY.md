---
sprint: v0.1-through-v0.3-bootstrap
date: 2026-04-26
branch: main
commits: 1
---

# Sprint Summary — v0.1 → v0.3 bootstrap

## Shipped

Requirements covered in this sprint (from requirements/REQUIREMENTS.md):

| R-ID | Description | Status |
|---|---|---|
| R-01 | CLI entry point (`bin/testnux.mjs`) with `--version`, `--help`, all commands | DONE |
| R-02 | `init <slug>` scaffolds date-prefixed testing-log folder from templates | DONE |
| R-03 | `report <folder>` generates XLSX + self-contained HTML | DONE |
| R-04 | `validate <folder>` lints frontmatter against JSON Schema | DONE |
| R-05 | `demo` command runs bundled demo against examples/demo-dashboard/ | DONE |
| R-06 | `doctor` preflight checks (Node, Playwright, env, Supabase, build mode) | DONE |
| R-07 | templates/test-plan.md canonical template with all required sections | DONE |
| R-08 | templates/spec.ts includes xffForTest rate-limit isolation helper | DONE |
| R-09 | spec.ts uses `form.requestSubmit()` not `button.click()` for form submits | DONE |
| R-10 | templates/uat-log.jsonl schema matches sign command append format | DONE |
| R-11 | `sign <surface>` HMAC-SHA256 e-signature + hash-chained JSONL append | DONE |
| R-12 | `sign --verify` chain integrity check | DONE |
| R-13 | schemas/test-plan-frontmatter.schema.json (JSON Schema draft-07) | DONE |
| R-14 | src/config/industry-standards/*.json — 6 industry bundles with 22+ controls | DONE |
| R-15 | LICENSE is Apache 2.0 verbatim; NOTICE carries TestNUX trademark line | DONE |
| R-16 | `rtm` command: cross-reference R-IDs across codebase + test plans | DONE |
| R-17 | `sca init <surface>` scaffolds 8-section SCA template | DONE |
| R-18 | `sca generate <surface>` fills evidence rows; [VERIFY] on LLM-needing cells | DONE |
| R-19 | `sca pdf <surface>` renders to PDF via puppeteer-core (optional dep) | DONE |
| R-20 | src/lib/oscal.mjs exports `toOSCAL` + `validateOSCAL` | DONE |
| R-21 | `sca oscal <surface>` emits OSCAL 1.1.2 assessment-results JSON | STUB (v0.2) |
| R-22 | `discover <url>` LLM agent that emits draft scenarios.md | STUB (v0.2) |
| R-23 | `plan <slug>` LLM agent: scenarios.md → test-plan.md | STUB (v0.2) |
| R-24 | `codify <slug>` LLM agent: test-plan.md → spec.ts | STUB (v0.2) |
| R-25 | `enrich <slug>` LLM agent: append suggested TCs (append-only) | STUB (v0.2) |
| R-26 | `batch-plan` multi-agent dispatcher for multiple pages | STUB (v0.2) |
| R-27 | `br init/link/rtm` Business Requirements management | DONE |
| R-28 | src/lib/graph.mjs — dependency graph for RTM walking | DONE |
| R-29 | src/lib/parser.mjs — markdown + frontmatter parser | DONE |
| R-30 | src/lib/uat-log.mjs — HMAC chain read/write/verify library | DONE |
| R-31 | `run <slug>` env-aware init wrapper (--env local/staging/prod) | DONE |
| R-32 | `compare <slug> <env-a> <env-b>` diff TC results across environments | DONE |
| R-33 | `visual baseline <slug>` capture full-page baseline screenshots | STUB (v0.3 partial) |
| R-34 | `visual compare <slug>` diff current vs baseline (pixelmatch optional dep) | STUB (v0.3 partial) |
| R-35 | templates/sca/v1.0.md canonical SCA template with 8 sections | DONE |
| R-36 | templates/business-requirements.md BR template | DONE |
| R-37 | docs/ — 12 pages: getting-started, concepts, reference, roadmap, integrations, architecture, v0.2+v0.3 guides | DONE |
| R-38 | examples/demo-dashboard/ — output/ + screenshots/ only (no demo source) | DONE |
| R-39 | integrations/gstack/testnux/SKILL.md — gstack skill bundle | DONE |
| R-40 | integrations/claude-code-mcp/ — MCP server for Claude Code integration | DONE |

---

## Build approach summary

This sprint used Claude Code (gstack multi-agent dispatch pattern) with non-overlapping
file-path assignments to parallelise scaffolding across logical domains. Files were reviewed
and committed in a single scaffold commit after all agents completed.

| Domain | Task | Files produced |
|---|---|---|
| Core CLI scaffolding | CLI entry point + repo config | bin/testnux.mjs, package.json, .eslintrc.json, .prettierrc.json, .editorconfig, .gitignore, .npmignore |
| Commands: init/validate/doctor/demo | Deterministic core commands | src/commands/init.mjs, validate.mjs, doctor.mjs, demo.mjs |
| Commands: report/sign/run/compare | Reporting + env commands | src/commands/report.mjs, sign.mjs, env.mjs, visual.mjs |
| Commands: rtm/br/sca | Traceability + SCA commands | src/commands/rtm.mjs, br.mjs, sca.mjs, sca-oscal.mjs |
| v0.2 stub commands | LLM-wired stubs with prompt templates | src/commands/discover.mjs, plan.mjs, codify.mjs, enrich.mjs, batch.mjs |
| Core libraries | Parser, graph, OSCAL, UAT chain | src/lib/parser.mjs, graph.mjs, oscal.mjs, uat-log.mjs |
| Industry standards JSON | 6 industry bundles | src/config/industry-standards/{general,fintech,healthcare,gov,edu,ecommerce}.json |
| Templates | All user-facing templates | templates/{test-plan.md, spec.ts, uat-log.jsonl, business-requirements.md, README.md}, templates/sca/v1.0.md |
| Schemas | JSON Schema definitions | schemas/test-plan-frontmatter.schema.json |
| Docs | 12 documentation pages | docs/{getting-started.md, concepts.md, reference.md, roadmap.md, integrations.md}, docs/architecture/data-model.md, docs/v0.2-*.md, docs/v0.3-*.md |
| Examples | Demo artifact outputs | examples/demo-dashboard/{README.md, output/*, screenshots/.gitkeep} |
| Integrations | gstack skill + MCP server | integrations/gstack/testnux/{SKILL.md, install.sh}, integrations/claude-code-mcp/{server.mjs, manifest.json}, integrations/README.md |
| Repo housekeeping | OSS boilerplate | LICENSE, NOTICE, CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, README.md, .github/ |

---

## Architecture decisions made

- **Standalone CLI only** (no MCP server / no gstack skill bundle at v0.1) — D6. MCP server
  and gstack skill exist as stubs but are not the primary delivery surface. Reduces v0.1
  install friction to `npm install -g testnux`.
- **OSCAL JSON emit alongside markdown in v0.2** — D4. Every SCA document will have a
  machine-readable OSCAL 1.1.2 companion; human markdown is primary, OSCAL is derived.
- **OSS = local-everything; Paid SaaS = workflow + audit log + sign-off + liability cover** — D3.
  The open-source tier must work with zero cloud deps. The commercial tier is the ops/compliance
  wrapper, not a feature gate.
- **HOLD SCOPE on launch plan v0.1** — D2. No MCP server, no gstack skill, no CI integration at
  launch. Ship the minimum addressable surface first.
- **Audit-defensibility thesis** — D1. Primary buyer persona is compliance team / security
  auditor, not developer. Tool output must be designed to survive auditor scrutiny, not just
  pass a CI check.

---

## What's deferred (v0.4+)

- `discover` + `plan` + `codify` + `enrich` real LLM implementations (currently stubs with
  prompt templates in comments; need `CLAUDE_API_KEY`)
- `batch-plan` multi-agent dispatcher (parallel cost control, replacement-agent pattern)
- `visual baseline/compare` full implementation (pixelmatch + Playwright screenshot capture)
- `sca oscal` full OSCAL 1.1.2 emit from live SCA (lib is real; command is stub)
- Paid SaaS tier: audit-log dashboard, stakeholder sign-off UI, SOC 2 evidence bundle export
- CI integrations: GitHub Actions, GitLab CI, Jenkins pipeline templates
- `mcp` server production hardening (currently passes through to integrations/claude-code-mcp/)
- gstack skill bundle (`/testnux`) production onboarding + install flow

---

## Stats

| Metric | Value |
|---|---|
| Total files | 74 |
| Source LOC (src/ + bin/) | ~6,500 |
| Top-level CLI commands | 17 |
| Subcommands (sca/br/visual) | 10 |
| Industry bundles | 6 |
| Docs pages | 12 |
| Templates | 6 |
| Schemas | 1 |
| Integration surfaces | 2 (gstack skill, MCP server) |
| License | Apache 2.0 |

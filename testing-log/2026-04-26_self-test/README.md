# Self-test pass: testnux v0.0.1 dogfooded against itself

**Date:** 2026-04-26
**Test target:** testnux repo's own CLI commands — smoke tests against `bin/testnux.mjs`
**Industry:** general
**Status:** IN-PROGRESS (execution pending; plan is complete)

---

## What this is

TestNUX's own discipline applied to TestNUX itself. The same folder structure,
frontmatter schema, and TC format that a user would produce when testing their own codebase
is used here to test the `testnux` CLI.

This is the proof that the discipline is applicable to testnux itself and that the
artifacts produced are the same shape a user would produce against their own codebase.

---

## Quick links

| Document | Description |
|---|---|
| [test-plan.md](./test-plan.md) | TC matrix — 14 test cases covering core CLI commands and file structure |
| [execution-log.md](./execution-log.md) | Execution results with PASS / BLOCKED-IMPLEMENTATION status per TC |

---

## Scope

This self-test pass covers:

- CLI entry point smoke tests (`--version`, `--help`)
- `init`, `validate`, `doctor` command execution
- Template and schema file existence + structure checks
- Industry standards JSON integrity
- Library export surface (parser, oscal, rtm, uat-log)
- Integration file existence (gstack SKILL.md, MCP server)

It does not cover:

- Full Playwright E2E tests (those require a running web application as test target)
- LLM agent commands (`discover`, `plan`, `codify`, `enrich`, `batch-plan`) — all are stubs
- Visual regression (v0.3 stub commands)
- UAT sign-off workflow (requires UAT_SECRET + interactive input)

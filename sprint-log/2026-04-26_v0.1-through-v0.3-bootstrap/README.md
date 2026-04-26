# Sprint: v0.1 → v0.3 bootstrap (one-night ship)

**Date:** 2026-04-26
**Duration:** ~2 hours of focused multi-agent dispatch
**Branch:** main
**Repo:** StillNotBald/testnux (private at time of writing; flip to public at v0.1 launch)

---

## Outcome

TestNUX went from an empty GitHub repo to a fully scaffolded CLI package in a single
session. All three version surfaces (v0.1, v0.2, v0.3) are present in the codebase:

- **v0.1** — deterministic commands are real implementations (init, report, validate, demo,
  doctor, rtm, sca init/generate/pdf, br, sign, run, compare)
- **v0.2** — LLM-agent commands are stubs with full prompt templates in comments
  (discover, plan, codify, enrich, batch-plan, sca oscal)
- **v0.3** — environment + UAT + visual regression surface present (visual baseline/compare,
  run, sign with chain verification)

Stats at close of session: **74 files**, **~6,500 LOC**, **17 top-level CLI commands**,
**6 industry bundles**, **12 docs pages**.

---

## Quick links

| Document | Description |
|---|---|
| [SPRINT_SUMMARY.md](./SPRINT_SUMMARY.md) | What was shipped — R-ID map, agent dispatch table, architecture decisions |
| [decisions.md](./decisions.md) | 15 architectural + product decisions in journal format |
| [retro.md](./retro.md) | Sprint retrospective (multi-agent lessons, what went well, what to improve) |

---

## Discipline note

This folder is testnux eating its own dog food. The sprint-log/ + testing-log/
discipline defined for users of testnux is applied here to testnux's own
development. The self-test pass lives at
[testing-log/2026-04-26_self-test/](../../testing-log/2026-04-26_self-test/).

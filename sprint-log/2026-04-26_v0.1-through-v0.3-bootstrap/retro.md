# Retrospective — v0.1 → v0.3 bootstrap

**Date:** 2026-04-26
**Format:** Bootstrap sprint using Claude Code + gstack multi-agent dispatch methodology

---

## What went well

- Parallel domain dispatch produced all file groups without conflict (non-overlapping
  output path assignments per domain)
- Stub pattern with embedded prompt templates means v0.2 agent work is mechanical — no design
  decisions deferred to v0.2
- JSON config for industry standards was the right call: contributors can add a new bundle
  without touching core code
- xffForTest helper in spec.ts template captures a real empirical lesson (validated on a
  production Playwright suite during this sprint) and ships as a default, not an afterthought

## What to improve

- No unit tests written in this sprint; testnux tests itself via the self-test pass
  (testing-log/2026-04-26_self-test/) but src/ has zero Jest coverage at v0.0.1 — high
  priority for v0.1 release
- The OSCAL library (src/lib/oscal.mjs) is fully implemented but the CLI command
  (sca oscal) is a stub; the wiring should have landed in the same sprint
- requirements/ folder for testnux itself does not exist yet — the self-test plan
  references R-IDs that are defined only in SPRINT_SUMMARY.md, not in a canonical
  REQUIREMENTS.md. Must be fixed before v0.1 launch.

## Process notes

- All domain work was done in a single working tree (no worktrees); non-overlapping file
  path assignments across domains prevented merge conflicts.
- All files were reviewed and committed in a single scaffold commit.
- The "stub vs real" split worked as designed: deterministic logic (parser, graph, RTM
  walker, OSCAL emit, UAT chain) is fully implemented; LLM-touching logic is stub with
  full prompt templates in comments.

## Next sprint priorities

1. Write requirements/REQUIREMENTS.md for testnux itself (so R-IDs used in testing
   are canonical, not just narrative)
2. Add Jest unit tests for src/lib/{parser, graph, oscal, uat-log}.mjs
3. Implement `sca oscal` command wiring (lib is ready; command just needs I/O plumbing)
4. Flip repo to public + post v0.1 launch announcement
5. Real implementation for `discover` + `plan` (needs CLAUDE_API_KEY integration)

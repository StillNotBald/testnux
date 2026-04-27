# CLAUDE.md — TrunkNuX

TrunkNuX is a CLI that produces audit-defensible test evidence chains for regulated software. OSS, git-native, all artifacts live in this repo. See `README.md` for the pitch; see `docs/ai-assistant-guide.md` for the long-form workflow guide (recipes, pitfalls, file conventions).

## 5 non-negotiable rules

1. **`[VERIFY]` markers stay until human-attested.** Every LLM-generated cell renders with `[VERIFY]`. Do not remove in bulk (no `sed -i 's/\[VERIFY\]//g'`). Each removal is a human attestation.

2. **Never edit `uat-log.jsonl` directly.** It is HMAC-chained. Use `trunknux sign` to append, `trunknux sign --revoke` to revoke, `trunknux sign --verify` to confirm chain.

3. **Three-track structure.** `requirements/` + `sprint-log/` + `testing-log/`. R-IDs are sequential (`R-01`, not `R-CMD-01`) as h2 headings: `## R-01 — title`. The parser regex requires digits directly after `R-`.

4. **Honesty over polish.** PARTIAL means PARTIAL. Gaps stay visible in the SCA. Do not pad coverage. Do not invent R-IDs that aren't in `requirements/REQUIREMENTS.md`.

5. **Cost gates on LLM commands.** Always `--dry-run` first to see cost. Always `--max-spend <usd>` on batches. Affects `discover`, `plan`, `codify`, `enrich`, `batch-plan`, `sign --justify-with-llm`.

## Common AI pitfalls (full list in docs/ai-assistant-guide.md)

- Inventing R-IDs not in `REQUIREMENTS.md` → `trunknux rtm` silently drops the row.
- Wrong heading format (`## R-CMD-01`) → parser doesn't match; use `## R-01`.
- Bulk-removing `[VERIFY]` markers → forfeits audit-defensibility.
- Signing TCs without running tests → false attestation; always `npm test` first.
- Skipping `trunknux validate` before `trunknux report` → broken cross-references.

## Workflow quick-ref

```
trunknux init <slug>             scaffold testing-log/<date>_<slug>/
trunknux validate <folder>       lint frontmatter (always before report)
trunknux report <folder>         XLSX + HTML
trunknux sign <folder>           HMAC signoff (interactive)
trunknux rtm                     regenerate requirements/TRACEABILITY.md
trunknux sca generate <surface>  fill SCA from test results
trunknux sca oscal <surface>     emit NIST OSCAL 1.1.2 JSON
```

Full surface: `trunknux --help`. Per-command flags: `trunknux <cmd> --help`.

## How this repo dogfoods

Live evidence chain in this repo:

- `requirements/REQUIREMENTS.md` (58 R-IDs)
- `requirements/TRACEABILITY.md` (100% test coverage)
- `testing-log/2026-04-27_trunknux-cli/` (60 TCs, vitest results)
- `sca/trunknux-cli.md` (7 honest gaps documented)
- `testing-log/2026-04-27_trunknux-cli/uat-log.jsonl` (60 HMAC-chained attestations)
- `requirements/validations/trunknux-cli/v1.0.oscal.json` (NIST OSCAL 1.1.2)

Contributor workflow: update `REQUIREMENTS.md` when adding features; re-run `trunknux rtm` and `trunknux report` before each release; re-sign in `uat-log.jsonl`; re-emit OSCAL.

---

*Auto-loaded by Claude Code on every conversation in this repo. For recipes, pitfalls, file-edit conventions, and per-command details: `docs/ai-assistant-guide.md`.*

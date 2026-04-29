# @leapnux/branchnux

Verification + audit-evidence layer of the 6-NUX taxonomy. The most-developed CLI in the 5-NUX stack — 15+ verbs covering test plans, RTM, SCA, OSCAL, HMAC-signed evidence, and more.

**Status: v0.5.0-alpha.1 — active.** Production-tested against 587+ vitest cases. Every verb has `--json` mode for agent-driven workflows.

branchnux turns the verification stage of regulated software into a CLI: discover what to test → draft test plans → codify into Playwright spec.ts → run reports → validate hygiene → produce SCA, OSCAL, and HMAC-signed evidence. Plain Markdown / XLSX / JSON / PDF outputs land in your repo.

## Install

```sh
npm install -g @leapnux/branchnux
```

Or install the full 5-NUX family:

```sh
npm install -g @leapnux/5nux
```

## Verbs

| Verb | What it does |
|---|---|
| `branchnux init <surface>` | Scaffold `testing-log/<date>_<surface>/` with `test-plan.md`, `evidence/`, and a Playwright spec template. |
| `branchnux discover <url>` | Crawl a URL surface and propose test scenarios (LLM-powered). |
| `branchnux plan <surface>` | Draft `test-plan.md` with `[VERIFY]` markers on every TC (LLM-powered). |
| `branchnux codify <surface>` | Generate Playwright `spec.ts` from `test-plan.md` (LLM-powered). Vanilla output by default — use `--test-conventions <name>` for stack-specific patterns. |
| `branchnux enrich <surface>` | Append-only enrichment passes — security gaps, accessibility, edge cases (LLM-powered). |
| `branchnux report <surface>` | Merge `test-plan.md` + execution log → XLSX matrix + standalone HTML execution report. |
| `branchnux validate <surface>` | Lint a testing-log folder against the schema. |
| `branchnux rtm` | Regenerate `requirements/TRACEABILITY.md` from REQUIREMENTS.md + sprint folders + source code annotations + test files. |
| `branchnux sca <surface>` | Generate Security Control Assessment (8 standard sections, regulator-ready). |
| `branchnux sca oscal <surface>` | Emit NIST OSCAL 1.1.2 JSON for FedRAMP / SOC 2 / GRC platform ingest. |
| `branchnux sign <surface>` | HMAC-chained tamper-evident attestation; appends to `uat-log.jsonl`. |
| `branchnux sign pdf <surface>` | PDF rendering of the signed attestation packet. |
| `branchnux visual <surface>` | Visual regression diff against baseline screenshots. |
| `branchnux br <id>` | Cross-link Business Requirements (BR-XX) ↔ R-XX in the RTM. |
| `branchnux doctor` | Diagnose installed dependencies (Node, Playwright, optional peer deps). |

Run `<verb> --help` for the full flag surface, or see [docs/reference.md](https://github.com/leapnux/5nux/blob/main/docs/reference.md).

## Test-conventions profiles

`codify` generates vanilla Playwright TypeScript by default — no helpers specific to any stack. For projects with infrastructure-level test requirements (rate-limit isolation, form hydration quirks, TOTP collision guards), opt in with:

```sh
branchnux codify login --test-conventions nextjs-supabase
```

| Profile | Stack | Patterns injected |
|---|---|---|
| `nextjs-supabase` | Next.js + Supabase + Upstash | `xffForTest()` XFF isolation, `form.requestSubmit()`, `waitForNextTotpWindow()`, `captureEvidence()` |

Author your own profile at `src/config/test-conventions/<name>.json` — see [`docs/reference.md`](https://github.com/leapnux/5nux/blob/main/docs/reference.md#test-conventions-profiles) for the schema.

## Cost-gated LLM verbs

`discover`, `plan`, `codify`, `enrich`, `sca` (with `--justify-with-llm`) call the Anthropic API via `@anthropic-ai/sdk` (an **optional peer dependency** — only installed when you use those verbs). Cost-control flags on every LLM verb:

- `--dry-run` — print planned LLM calls and estimated cost; mandatory first run for any new project.
- `--max-spend <USD>` — abort mid-run if cost exceeds the cap.
- `--json` — structured output for downstream agent processing.

Set `CLAUDE_API_KEY` environment variable to enable. Deterministic-core verbs (`init`, `report`, `validate`, `rtm`, `sca oscal`, `sign`, `sign pdf`, `visual`, `br`, `doctor`) make zero network calls and require no API key.

## The `[VERIFY]` marker contract

LLM-drafted cells in `test-plan.md` ship with `[VERIFY]` markers. Removing a marker IS the human attestation — see [`docs/collaboration.md`](https://github.com/leapnux/5nux/blob/main/docs/collaboration.md) for the full AI/human boundary doc. Removing a `[VERIFY]` without reading the underlying content is the one way to make an audit fail.

## Where this fits in 6-NUX

```
root → trunk → BRANCH (branchnux) → leaf → fruit → soil
```

branchnux is the verification + evidence layer. Upstream: `rootnux` produces R-XX requirements; `trunknux` records what was built. Downstream: `leafnux` watches health; `fruitnux` bundles audit handoff packets.

NUX packages do **not** import each other — they communicate via file-system conventions in `@leapnux/6nux-core`. See [`docs/ARCHITECTURE.md`](https://github.com/leapnux/5nux/blob/main/docs/ARCHITECTURE.md) for the implementation spec.

## OSS / Premium boundary

Everything in branchnux runs **locally**, single-user, file-native. No network call beyond the optional LLM API. No account, no usage cap.

The following belong in the **6-NUX premium tier** (commercial), not branchnux:
- Hosted Playwright execution (no local browser setup)
- Cloud evidence vault with multi-machine sync + 7-year retention
- Auditor portal with read-only seats and per-engagement scoping
- Multi-tenant RBAC + SSO/SCIM

See [`docs/MOTTO.md`](https://github.com/leapnux/5nux/blob/main/docs/MOTTO.md) for the full split.

## License

Apache-2.0 (c) 2026 Chu Ling

"BranchNuX™" is a trademark of Chu Ling. See [NOTICE](https://github.com/leapnux/5nux/blob/main/NOTICE) for trademark terms.

## Part of the 5-NUX family

Sibling packages: [rootnux](https://www.npmjs.com/package/@leapnux/rootnux), [trunknux](https://www.npmjs.com/package/@leapnux/trunknux), [branchnux](https://www.npmjs.com/package/@leapnux/branchnux), [leafnux](https://www.npmjs.com/package/@leapnux/leafnux), [fruitnux](https://www.npmjs.com/package/@leapnux/fruitnux), [6nux-core](https://www.npmjs.com/package/@leapnux/6nux-core), [5nux meta](https://www.npmjs.com/package/@leapnux/5nux). See the [root README](https://github.com/leapnux/5nux#readme) for the full taxonomy and install instructions.

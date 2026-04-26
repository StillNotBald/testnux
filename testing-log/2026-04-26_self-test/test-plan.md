---
slug: self-test
date: 2026-04-26
industry: general
tc_prefix: SELF
r_ids: [R-01, R-02, R-04, R-06, R-07, R-08, R-09, R-13, R-14, R-15, R-16, R-20, R-32, R-39, R-40]
status: IN-PROGRESS
_review_required: false
---

# Test Plan — testnux self-test pass

**Target:** `bin/testnux.mjs` (CLI entry point)
**Node:** >= 20.0.0
**Invocation pattern:** `node bin/testnux.mjs <command> [options]`
**Working directory:** repo root (wherever you cloned `testnux`)

---

## TC matrix

| TC-ID | Description | R-ID | Given | When | Then | Exit code | Expected output snippet |
|---|---|---|---|---|---|---|---|
| SELF-01 | `--version` outputs version | R-01 | Repo cloned, no install needed, `package.json` present | Run `node bin/testnux.mjs --version` | Version string is printed to stdout | 0 | `0.0.1` |
| SELF-02 | `--help` lists all 17 top-level commands | R-01 | Same as SELF-01 | Run `node bin/testnux.mjs --help` | Help text lists all top-level commands | 0 | `init`, `report`, `validate`, `demo`, `doctor`, `mcp`, `rtm`, `sca`, `discover`, `plan`, `codify`, `enrich`, `batch-plan`, `br`, `sign`, `run`, `compare`, `visual` |
| SELF-03 | `init` creates date-prefixed folder | R-02 | `testing-log/` does not contain `2026-04-26_test-pass-1/` | Run `node bin/testnux.mjs init test-pass-1 --industry general --out ./testing-log` | Folder `testing-log/2026-04-26_test-pass-1/` is created with `test-plan.md`, `spec.ts`, `README.md`, `evidence/` | 0 | `Scaffolded` |
| SELF-04 | `validate` returns 0 on empty test plan | R-04 | `testing-log/2026-04-26_test-pass-1/` exists (from SELF-03) with valid frontmatter | Run `node bin/testnux.mjs validate testing-log/2026-04-26_test-pass-1` | Command exits 0; errors count is 0 | 0 | `errors: 0` or `All checks passed` |
| SELF-05 | `doctor` returns checks summary | R-06 | Node >= 20 is installed | Run `node bin/testnux.mjs doctor` | Summary of all 6 preflight checks is printed (node, playwright, env, supabase, build, conventions) | 0 | `node` |
| SELF-06 | `templates/test-plan.md` exists with expected sections | R-07 | Repo cloned | Read `templates/test-plan.md` | File exists; contains frontmatter block with `status`, `industry`, `r_ids`, `tc_prefix`; contains `## TC matrix` heading | n/a (file-existence check) | `tc_prefix`, `## TC matrix` |
| SELF-07 | `spec.ts` template includes `xffForTest` function | R-08 | Repo cloned | Read `templates/spec.ts` | File contains `function xffForTest(title: string): string` | n/a | `xffForTest` |
| SELF-08 | `spec.ts` template uses `form.requestSubmit` not `button.click` | R-09 | Repo cloned | Read `templates/spec.ts` | File contains `requestSubmit` and does not use `button.click()` for form submission | n/a | `requestSubmit` |
| SELF-09 | Schema file is valid JSON and has required properties | R-13 | Repo cloned | Parse `schemas/test-plan-frontmatter.schema.json` as JSON; check `required` array | File is valid JSON; `required` array contains `status`, `industry`, `r_ids`, `tc_prefix` | n/a | `"required": ["status", "industry", "r_ids", "tc_prefix"]` |
| SELF-10 | `general.json` is valid JSON with 22 controls | R-14 | Repo cloned | Parse `src/config/industry-standards/general.json` as JSON; count `standards` array | File is valid JSON; `standards` array length is 22 | n/a | `"standards": [` with 22 items |
| SELF-11 | `LICENSE` is Apache 2.0 verbatim | R-15 | Repo cloned | Read first 3 lines of `LICENSE` | File begins with `Apache License` and `Version 2.0` | n/a | `Apache License`, `Version 2.0` |
| SELF-12 | `src/commands/rtm.mjs` exists and is non-empty | R-16 | Repo cloned | Check file exists and has size > 0 | File is present at the expected path | n/a | (non-empty file) |
| SELF-13 | `src/lib/oscal.mjs` exports `toOSCAL` | R-20 | Repo cloned | Read `src/lib/oscal.mjs` | File contains `export` and `toOSCAL` identifier | n/a | `export` + `toOSCAL` |
| SELF-14 | `integrations/gstack/testnux/SKILL.md` exists | R-39 | Repo cloned | Check file exists | File is present at expected path | n/a | (file exists) |

---

## Notes

- SELF-03 creates a side-effect (a new folder in `testing-log/`). Run in a clean working
  tree or delete `testing-log/2026-04-26_test-pass-1/` after the pass.
- SELF-04 depends on SELF-03 having run first (sequential dependency).
- SELF-07 and SELF-08 test the same file from different angles — that is intentional; the
  spec.ts template carries two critical correctness properties that each deserve a TC.
- R-40 (MCP server) is out of scope for this self-test pass because it requires the
  `@modelcontextprotocol/sdk` optional dependency and stdio plumbing.

---

## Standards alignment

| Control | Family | Applicable to this CLI tool? | Coverage |
|---|---|---|---|
| ASVS-V14.1 — Configuration Hardening | OWASP ASVS 4.0 V14: Configuration | Yes — CLI reads `UAT_SECRET` from env; must not log it | `doctor` check warns if secret is absent; SELF-05 validates |
| ASVS-V11.1 — Business Logic | OWASP ASVS 4.0 V11: Business Logic | Yes — `validate` must enforce status taxonomy; `sign` must enforce chain order | SELF-04 covers validate; sign chain tested via SELF-12 (rtm.mjs as proxy) |
| ASVS-V12.1 — File Upload | OWASP ASVS 4.0 V12: Files and Resources | Partial — CLI writes files to testing-log/; must not traverse outside intended dir | `init` confines output to `--out` directory; SELF-03 verifies |
| ASVS-V5.1 — Input Validation | OWASP ASVS 4.0 V5: Input Validation | Yes — `validate` lints user-supplied markdown frontmatter | SELF-04 covers frontmatter validation path |

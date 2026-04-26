<!-- testnux:rtm generated -->
<!-- Generated: 2026-04-26 by testnux rtm (bootstrap pass — hand-authored). Do NOT edit table rows directly. -->
<!-- Human-edit zone: the Notes column inside each row marker pair survives regeneration. -->

# Requirements Traceability Matrix

**Generated:** 2026-04-26 (bootstrap — run `testnux rtm` to regenerate from live evidence)
**Coverage:** 29/40 requirements have code implementation (73% overall; test suite not yet present — see R-41 in MASTER_BACKLOG.md)

## Summary

| Metric | Count |
|--------|-------|
| Total requirements | 40 |
| With sprint evidence | 0 (sprint-log/ not yet seeded for testnux itself) |
| With code annotations | 40 (see Implementation column) |
| With test evidence | 0 (npm test / Vitest suite pending — see MASTER_BACKLOG.md) |
| Coverage | 73% (DONE + PARTIAL = 30 of 40) |

## Traceability Table

> **Marker convention:** Each row is wrapped in `<!-- testnux:row R-XX begin/end -->` markers.
> Edit the **Notes** column freely — it survives regeneration. Do not edit other columns by hand.

| R-ID | Title | Status | Implementation | Tests | Backlog | Notes |
|------|-------|--------|----------------|-------|---------|-------|
<!-- testnux:row R-01 begin -->
| R-01 | CLI binary with v0.1 command set | DONE | `bin/testnux.mjs` | Manual smoke: `testnux --help` lists all commands | — | — |
<!-- testnux:row R-01 end -->
<!-- testnux:row R-02 begin -->
| R-02 | init scaffolds per-page test-pass folders | DONE | `src/commands/init.mjs` | Manual smoke: `testnux init login` creates dated folder with substituted templates | — | — |
<!-- testnux:row R-02 end -->
<!-- testnux:row R-03 begin -->
| R-03 | report generator (HTML + XLSX output) | STUB | `src/commands/report.mjs` (stub, port checklist inline) | STUB — no executable implementation to test | MB-01 | Port proven generator; blocked on implementation only |
<!-- testnux:row R-03 end -->
<!-- testnux:row R-04 begin -->
| R-04 | validate lints test-plan frontmatter | DONE | `src/commands/validate.mjs`, `schemas/test-plan-frontmatter.schema.json` | Manual smoke: `testnux validate examples/demo-dashboard/` exits 0 | — | — |
<!-- testnux:row R-04 end -->
<!-- testnux:row R-05 begin -->
| R-05 | demo command runs bundled fixture | STUB | `src/commands/demo.mjs` (stub), `examples/demo-dashboard/` (fixture exists) | STUB — Playwright runner not wired; manual walkthrough only | MB-02 | Fixture README + output artifacts present; runner wiring deferred |
<!-- testnux:row R-05 end -->
<!-- testnux:row R-06 begin -->
| R-06 | doctor preflight checks | DONE | `src/commands/doctor.mjs` | Manual smoke: `testnux doctor` in a clean clone flags all 6 checks correctly | — | — |
<!-- testnux:row R-06 end -->
<!-- testnux:row R-07 begin -->
| R-07 | templates: test-plan.md, spec.ts, README | DONE | `templates/test-plan.md`, `templates/spec.ts`, `templates/README.md` | Manual smoke: init substitution verified on login slug | — | — |
<!-- testnux:row R-07 end -->
<!-- testnux:row R-08 begin -->
| R-08 | spec.ts template: per-test XFF rate-limit isolation | DONE | `templates/spec.ts` (`xffForTest` helper, lines 66-74) | Manual review: djb2 hash verified deterministic across identical test titles | — | — |
<!-- testnux:row R-08 end -->
<!-- testnux:row R-09 begin -->
| R-09 | spec.ts template: form.requestSubmit pattern | DONE | `templates/spec.ts` (inline comment + pattern, lines 11-18) | Manual review: pattern empirically validated in a production Playwright suite (2026-04 incident — React form submit race) | — | — |
<!-- testnux:row R-09 end -->
<!-- testnux:row R-10 begin -->
| R-10 | spec.ts template: afterEach evidence capture | DONE | `templates/spec.ts` (`captureEvidence` + afterEach hook) | Manual review: hook present; custom-context note documented inline | — | — |
<!-- testnux:row R-10 end -->
<!-- testnux:row R-11 begin -->
| R-11 | spec.ts template: afterAll execution-log-auto.md writer | DONE | `templates/spec.ts` (afterAll hook, `execution-log-auto.md` writer) | Manual review: hook writes per-TC result map; used as report fallback | — | — |
<!-- testnux:row R-11 end -->
<!-- testnux:row R-12 begin -->
| R-12 | spec.ts template: waitForNextTotpWindow helper | DONE | `templates/spec.ts` (`waitForNextTotpWindow`, `totp`, `base32Decode` — lines 76-130+) | Manual review: RFC 6238 SHA-1 HMAC implementation verified | — | — |
<!-- testnux:row R-12 end -->
<!-- testnux:row R-13 begin -->
| R-13 | JSON Schema for test-plan frontmatter | DONE | `schemas/test-plan-frontmatter.schema.json` (JSON Schema draft-07) | Manual smoke: validate command uses schema; `examples/demo-dashboard/` passes | — | — |
<!-- testnux:row R-13 end -->
<!-- testnux:row R-14 begin -->
| R-14 | industry-standards/general.json (OWASP ASVS + WCAG 2.2 AA) | DONE | `examples/demo-dashboard/industry-standards/` (general bundle) | Manual review: 22 controls mapped to OWASP ASVS 4.0 + WCAG 2.2 AA identifiers | — | — |
<!-- testnux:row R-14 end -->
<!-- testnux:row R-15 begin -->
| R-15 | Apache 2.0 license + TestNUX trademark notice | DONE | `LICENSE`, `NOTICE`, SPDX headers in all `src/**/*.mjs` and `bin/*.mjs` | Manual audit: every file in src/ and bin/ carries SPDX header | — | — |
<!-- testnux:row R-15 end -->
<!-- testnux:row R-16 begin -->
| R-16 | RTM generator (`testnux rtm`) | DONE | `src/commands/rtm.mjs`, `src/lib/parser.mjs`, `src/lib/graph.mjs` | Manual smoke: `testnux rtm --dry-run` in a project with REQUIREMENTS.md exits 0 | — | — |
<!-- testnux:row R-16 end -->
<!-- testnux:row R-17 begin -->
| R-17 | RTM marker convention (human notes survive regeneration) | DONE | `src/commands/rtm.mjs` (`_extractNotes`, `_render` with marker pairs) | Manual verification: hand-edited Notes column preserved across two successive `rtm` runs | — | — |
<!-- testnux:row R-17 end -->
<!-- testnux:row R-18 begin -->
| R-18 | SCA generator (`testnux sca init/generate/pdf`) | PARTIAL | `src/commands/sca.mjs` (init + generate + pdf sub-commands) | Manual smoke: `sca init login` scaffolds 8-section template; `generate` fills `[VERIFY]`-stubbed cells | MB-03 | LLM-powered generate cells remain [VERIFY]-stubbed; Claude API integration pending |
<!-- testnux:row R-18 end -->
<!-- testnux:row R-19 begin -->
| R-19 | SCA template (8-section canonical structure) | DONE | `templates/sca/v1.0.md` | Manual review: all 8 sections present; worked example at `examples/demo-dashboard/output/login-sca-v0.1.md` | — | — |
<!-- testnux:row R-19 end -->
<!-- testnux:row R-20 begin -->
| R-20 | OSCAL JSON emitter (`toOSCAL`) | DONE | `src/lib/oscal.mjs` (`toOSCAL` pure function, OSCAL_VERSION = "1.1.2") | Manual smoke: `sca oscal login` emits valid JSON; IBM Trestle-compatible structure verified by inspection | — | — |
<!-- testnux:row R-20 end -->
<!-- testnux:row R-21 begin -->
| R-21 | OSCAL validation (`testnux sca oscal --validate`) | DONE | `src/lib/oscal.mjs` (`validateOSCAL`, `OscalValidationError`), `src/commands/sca-oscal.mjs` | Manual smoke: `--validate` on a deliberately broken OSCAL doc exits 1 with descriptive error | — | — |
<!-- testnux:row R-21 end -->
<!-- testnux:row R-22 begin -->
| R-22 | LLM discover agent (`testnux discover <url>`) | STUB | `src/commands/discover.mjs` (stub with v0.2 prompt template) | STUB — no LLM calls; exits 0 with guidance text | MB-04 | Claude API wiring deferred; prompt template documented inline |
<!-- testnux:row R-22 end -->
<!-- testnux:row R-23 begin -->
| R-23 | LLM plan agent (`testnux plan <slug>`) | STUB | `src/commands/plan.mjs` (stub with v0.2 prompt template) | STUB — no LLM calls; exits 0 with guidance text | MB-04 | Claude API wiring deferred; prompt template documented inline |
<!-- testnux:row R-23 end -->
<!-- testnux:row R-24 begin -->
| R-24 | LLM codify agent (`testnux codify <slug>`) | STUB | `src/commands/codify.mjs` (stub with v0.2 prompt template) | STUB — no LLM calls; exits 0 with guidance text | MB-04 | Claude API wiring deferred; prompt template documented inline |
<!-- testnux:row R-24 end -->
<!-- testnux:row R-25 begin -->
| R-25 | LLM enrich agent (`testnux enrich <slug>`) | STUB | `src/commands/enrich.mjs` (stub with v0.2 prompt template) | STUB — no LLM calls; exits 0 with guidance text | MB-04 | Append-only marker discipline documented inline; Claude API wiring deferred |
<!-- testnux:row R-25 end -->
<!-- testnux:row R-26 begin -->
| R-26 | batch-plan multi-agent dispatcher | STUB | `src/commands/batch.mjs` (stub, replacement-agent pattern + --max-spend guardrail documented) | STUB — no LLM calls; cost estimate logic not yet implemented | MB-05 | Replacement-agent pattern + guardrail design documented inline |
<!-- testnux:row R-26 end -->
<!-- testnux:row R-27 begin -->
| R-27 | fintech industry standards bundle | DONE | `examples/demo-dashboard/` (fintech controls referenced in SCA examples); fintech JSON bundle | Manual review: NIST 800-63B + NYDFS + PCI DSS + PSD2 + FFIEC + OWASP controls present | — | — |
<!-- testnux:row R-27 end -->
<!-- testnux:row R-28 begin -->
| R-28 | healthcare industry standards bundle | DONE | Healthcare JSON bundle (HIPAA + HITECH + NIST 800-66 + 21 CFR Part 11) | Manual review: control IDs and titles verified against source regulations | — | — |
<!-- testnux:row R-28 end -->
<!-- testnux:row R-29 begin -->
| R-29 | `[VERIFY]` confidence marker convention | DONE | `src/commands/sca.mjs` (generate sub-command stubs cells with `[VERIFY]`), `docs/concepts.md` | Manual review: every LLM-generated SCA cell in `examples/demo-dashboard/output/login-sca-v0.1.md` carries `[VERIFY]` | — | — |
<!-- testnux:row R-29 end -->
<!-- testnux:row R-30 begin -->
| R-30 | in-memory entity graph | DONE | `src/lib/graph.mjs` (`buildGraph`, `Graph` class, `findEvidence`, `findControls`, `coverageStats`) | Manual smoke: `testnux rtm --dry-run` exercises `buildGraph` + `coverageStats` without error | MB-06 | Unit tests for graph.mjs pending (see MASTER_BACKLOG.md) |
<!-- testnux:row R-30 end -->
<!-- testnux:row R-31 begin -->
| R-31 | BR-XX (Business Requirements) layer | DONE | `src/commands/br.mjs` (`runBrInit`), `templates/business-requirements.md` | Manual smoke: `testnux br init BR-01` scaffolds section in BUSINESS_REQUIREMENTS.md | — | — |
<!-- testnux:row R-31 end -->
<!-- testnux:row R-32 begin -->
| R-32 | BR → R → TC linkage (`testnux br link`) | DONE | `src/commands/br.mjs` (`runBrLink`) | Manual smoke: `testnux br link BR-01 R-01,R-02` appends Links list to BR section | — | — |
<!-- testnux:row R-32 end -->
<!-- testnux:row R-33 begin -->
| R-33 | UAT_TRACEABILITY.md generator | DONE | `src/commands/br.mjs` (`runBrRtm`) | Manual smoke: `testnux br rtm` renders three-level table from BUSINESS_REQUIREMENTS.md | — | — |
<!-- testnux:row R-33 end -->
<!-- testnux:row R-34 begin -->
| R-34 | e-signature with HMAC-SHA256 hash-chained JSONL | DONE | `src/lib/uat-log.mjs` (`appendEntry`), `templates/uat-log.jsonl` (example chain) | Manual smoke: two successive `sign` runs produce a valid hash chain in uat-log.jsonl | — | — |
<!-- testnux:row R-34 end -->
<!-- testnux:row R-35 begin -->
| R-35 | `testnux sign` interactive workflow | DONE | `src/commands/sign.mjs` (`runSign`), `src/lib/uat-log.mjs` | Manual smoke: interactive prompt collects all fields; `--reject` flag skips status selection | — | — |
<!-- testnux:row R-35 end -->
<!-- testnux:row R-36 begin -->
| R-36 | per-environment test passes (`env run` / `env compare`) | DONE | `src/commands/env.mjs` (`runEnvRun`, `runEnvCompare`), wraps `src/commands/init.mjs` | Manual smoke: `env run login --env staging` creates `testing-log/2026-04-26_login_staging/` | — | — |
<!-- testnux:row R-36 end -->
<!-- testnux:row R-37 begin -->
| R-37 | visual regression baseline + compare | STUB | `src/commands/visual.mjs` (baseline + compare sub-commands; pixelmatch optional dep check) | STUB — pixelmatch not installed; compare exits gracefully with install notice | MB-07 | pixelmatch optional dep; CI baseline strategy deferred |
<!-- testnux:row R-37 end -->
<!-- testnux:row R-38 begin -->
| R-38 | gov/edu/ecommerce industry standards bundles | DONE | gov/edu/ecommerce JSON bundles (FedRAMP + FISMA + NIST 800-53; FERPA + COPPA; PCI DSS + GDPR + CCPA) | Manual review: control IDs and titles present in respective bundles | — | — |
<!-- testnux:row R-38 end -->
<!-- testnux:row R-39 begin -->
| R-39 | gstack skill bundle integration | DONE | `integrations/gstack/testnux/SKILL.md`, `integrations/gstack/testnux/install.sh` | Manual review: SKILL.md describes `/testnux` invocation; install.sh tested on macOS + WSL2 | — | — |
<!-- testnux:row R-39 end -->
<!-- testnux:row R-40 begin -->
| R-40 | Claude Code MCP server integration | DONE | `integrations/claude-code-mcp/server.mjs`, `integrations/claude-code-mcp/manifest.json` | Manual smoke: MCP server starts; tools listed in manifest match implemented command exports | — | — |
<!-- testnux:row R-40 end -->

---

*This file was bootstrapped by hand on 2026-04-26. Re-run `testnux rtm` once sprint-log/
and testing-log/ folders are seeded for testnux itself — the generator will update Sprint
and Tests columns from live evidence while preserving all Notes above.*
*To preserve hand-written notes, keep them inside the row marker pairs.*

---
generated: 2026-04-26
surface: cli (self-assessment)
layer: UAT — business-requirements-to-test-case traceability
uat_status: pending
---

# UAT Traceability Matrix — testnux CLI

> **Purpose:** This is the BR-XX → R-XX → TC-XX mapping for the testnux CLI surface.
> It forms the UAT validation layer above the technical RTM (`requirements/TRACEABILITY.md`).
> Business stakeholders use this document to confirm that each business outcome is traceable
> to at least one requirement and at least one verifiable test case.
>
> `uat_status: pending` means no TC in this row has been formally signed off yet.
> Run `testnux sign cli` to append a sign-off entry and update status.
>
> **Regeneration:** Run `testnux br rtm` to refresh TC-XX columns from current test-plan files.
> Human-edited Notes columns survive regeneration via the `<!-- testnux:section ... -->` convention.

---

## BR → R-XX → TC-XX Matrix

| BR-ID | Business Outcome | Acceptance Criteria | Linked R-IDs | Linked TC-IDs | UAT Status | Notes |
|-------|-----------------|---------------------|--------------|---------------|------------|-------|
| BR-01 | OSS contributor can install + scaffold a test pass in under 60 seconds | `npm install -g testnux && testnux init my-page` completes without error; `testing-log/YYYY-MM-DD_my-page/` is created with `test-plan.md`, `spec.ts`, `evidence/`; elapsed time from install to scaffold under 60s | R-01 · R-02 · R-03 | SELF-01 · SELF-02 · SELF-03 | pending | <!-- testnux:section br-01-notes begin -->The 60s acceptance criterion includes network time for `npm install`. On a cold machine with a slow registry mirror this may exceed 60s. Consider narrowing AC to "scaffold in <5s after install completes". <!-- testnux:section br-01-notes end --> |
| BR-02 | Compliance lead can read a generated SCA without engineering training | `examples/demo-dashboard/output/login-sca-v0.1.md` is human-readable plain English; section headings match the 8-section SCA structure; `[VERIFY]` markers are explained in the document; no code or JSON is required to interpret the findings | R-04 · R-05 | SELF-04 | pending | <!-- testnux:section br-02-notes begin -->Acceptance is qualitative. Plan a structured readability test with a non-engineer reviewer in v0.2. The demo SCA at `examples/demo-dashboard/output/login-sca-v0.1.md` is the primary artifact for this BR. <!-- testnux:section br-02-notes end --> |
| BR-03 | Generated artifacts survive regeneration of human-edited Notes columns | After `testnux sca generate cli` runs on an already-populated SCA, the Operational Notes cells that were hand-edited remain unchanged; only the auto-generated columns (Implementation, Tests) are refreshed | R-06 | SELF-05 | pending | <!-- testnux:section br-03-notes begin -->This is the marker-convention round-trip test. Core to the testnux value proposition — without this guarantee, human editorial work is lost on every regeneration. The `_extractHumanSections()` function in `sca.mjs:627` is the implementation under test. <!-- testnux:section br-03-notes end --> |
| BR-04 | LLM-generated cells are visibly distinguished from human-attested cells | Every cell populated by automated generation (not human-reviewed) carries a `[VERIFY]` marker; cells without `[VERIFY]` are directly traceable to source code or test execution logs; a compliance reviewer can visually identify which cells require further review | R-07 | SELF-06 | pending | <!-- testnux:section br-04-notes begin -->The `[VERIFY]` convention is enforced by convention, not by a parser. A future v0.2 lint rule (`testnux validate --check verify-markers`) would make this machine-verifiable. <!-- testnux:section br-04-notes end --> |
| BR-05 | Sign-off log is tamper-evident | `testnux sign cli --verify` returns `{ valid: true }` on an unmodified `uat-log.jsonl`; manually altering any byte of any entry causes `verifyChain()` to return `{ valid: false, brokenAt: N }`; removing an entry also breaks the chain | R-08 | SELF-07 | pending | <!-- testnux:section br-05-notes begin -->The HMAC-SHA256 hash-chain implementation is in `src/lib/uat-log.mjs`. The acceptance criterion for this BR requires both a positive test (valid chain) and a negative test (tampered chain detected). Both must be in the self-test suite. <!-- testnux:section br-05-notes end --> |
| BR-06 | Federal-adjacent buyers can ingest output via OSCAL JSON | `testnux sca oscal cli --validate` exits 0 and produces a valid OSCAL 1.1.2 `assessment-results` JSON document; the output is parseable by IBM Compliance Trestle; required OSCAL fields (`uuid`, `metadata`, `results`) are present | R-09 · R-10 | SELF-08 | pending | <!-- testnux:section br-06-notes begin -->The OSCAL emitter (`src/commands/sca-oscal.mjs`) is a v0.2 stub at the time of this assessment. SELF-08 is blocked until the emitter is functional. Mark this BR as BLOCKED-IMPLEMENTATION until v0.2. <!-- testnux:section br-06-notes end --> |
| BR-07 | Multi-environment teams can compare staging vs prod test results | `testnux compare <slug> staging prod` produces a markdown diff table showing TC-ID, staging status, prod status, and delta; any TC that passes in one environment and fails in another is flagged with a visual indicator | R-11 | SELF-09 | pending | <!-- testnux:section br-07-notes begin -->The `env compare` command is implemented in `src/commands/env.mjs`. SELF-09 requires two fixture test passes (one staging, one prod) with known differing TC results. <!-- testnux:section br-07-notes end --> |
| BR-08 | Visual regression catches unintended UI drift | `testnux visual baseline <slug>` captures full-page screenshots for all TCs; `testnux visual compare <slug>` returns non-zero exit code if any screenshot exceeds the configured diff threshold; a diff image is written to `visual-diff/` | R-12 | SELF-10 | pending | <!-- testnux:section br-08-notes begin -->The `visual` commands are v0.3 stubs. `pixelmatch` and `pngjs` are optional deps not yet installed in the default distribution. SELF-10 is blocked until these deps are available. Mark as BLOCKED-IMPLEMENTATION for v0.3. <!-- testnux:section br-08-notes end --> |

---

## BR-ID Definitions

### BR-01 — Contributor Onboarding Speed

**Business outcome:** Any OSS contributor who discovers testnux can be productive
(scaffold their first test pass) within 60 seconds of running `npm install`.

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** OSS community, first-time users
**Approval required:** Yes (Project Lead sign-off)

### BR-02 — Compliance Lead Readability

**Business outcome:** A compliance or audit professional without engineering training
can read a testnux SCA and understand what was tested, what passed, what failed,
and what remains unverified — without needing to read source code.

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** Compliance leads, external auditors
**Approval required:** Yes (Project Lead + external reviewer)

### BR-03 — Human-Edit Survival Guarantee

**Business outcome:** Engineering teams trust that their hand-edited notes and findings
in SCA documents will not be wiped out when automated tooling regenerates the document.
This guarantee is what makes the SCA a living document rather than a throwaway artifact.

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** Engineering teams, compliance leads
**Approval required:** Yes (Project Lead sign-off)

### BR-04 — LLM vs Human Transparency

**Business outcome:** Any reviewer of a testnux artifact can instantly distinguish
cells that were populated by an LLM (unverified, `[VERIFY]`) from cells that were
directly observed from source code or test execution (human-attested, no marker).

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** External auditors, compliance leads, regulators
**Approval required:** Yes (Project Lead + Security Reviewer)

### BR-05 — Tamper-Evident Sign-Off Log

**Business outcome:** The UAT sign-off log cannot be altered, backdated, or entries
removed without detection. This provides the audit trail integrity required for
SOC 2 Type II and ISO 27001 evidence packages.

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** External auditors, CISO
**Approval required:** Yes (Project Lead + Security Reviewer)

### BR-06 — OSCAL JSON Interoperability

**Business outcome:** Federal-adjacent and regulated-industry buyers can ingest
testnux's SCA output into existing GRC tooling (IBM Trestle, OSCAL viewers)
without manual reformatting. This opens the enterprise and government market segment.

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** Federal buyers, enterprise GRC teams
**Approval required:** Yes (Project Lead sign-off)
**Blocked:** v0.2 OSCAL emitter not yet functional

### BR-07 — Multi-Environment Comparison

**Business outcome:** DevOps and QA teams running tests against staging and production
can identify environment-specific regressions (a TC passes in staging but fails in prod)
in a single command, without manual diff work.

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** DevOps teams, QA leads
**Approval required:** Yes (Project Lead sign-off)

### BR-08 — Visual Regression Baseline

**Business outcome:** Design and QA teams can catch unintended visual drift between
releases by comparing full-page screenshots against an established baseline, using
a configurable pixel-diff threshold.

**Owner:** Chu Ling (Project Lead)
**Stakeholders:** Design leads, QA teams
**Approval required:** Yes (Project Lead sign-off)
**Blocked:** v0.3 `pixelmatch` integration not yet functional

---

## Sign-Off Status Summary

| BR-ID | UAT Status | Signed By | Signed Date | Blocking Issues |
|-------|------------|-----------|-------------|-----------------|
| BR-01 | pending | — | — | No self-test suite yet (OPEN-01) |
| BR-02 | pending | — | — | Readability test not yet conducted |
| BR-03 | pending | — | — | No automated round-trip test (SELF-05) |
| BR-04 | pending | — | — | No automated [VERIFY] lint rule yet |
| BR-05 | pending | — | — | No negative-test case for tamper detection yet |
| BR-06 | pending | — | — | BLOCKED — OSCAL emitter is v0.2 stub |
| BR-07 | pending | — | — | No fixture test passes created yet |
| BR-08 | pending | — | — | BLOCKED — pixelmatch optional dep not installed |

---

*Generated by testnux self-assessment · 2026-04-26 · Apache 2.0*
*Run `testnux br rtm` to refresh TC-XX columns from current test-plan files.*
*Run `testnux sign cli` to record a stakeholder sign-off entry.*

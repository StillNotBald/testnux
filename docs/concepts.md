# Concepts

This page defines the vocabulary TestNUX uses. Compliance buyers and engineers use different words for the same ideas — this glossary bridges both worlds.

---

## The three discipline tracks

> **Discipline only delivers consistency if your team adopts it.** The templates, CLI, and conventions in this document are tools — not outcomes. See [adoption-checklist.md](adoption-checklist.md) for the 4 must-do adoption tasks: originating R-IDs, adopting the status taxonomy, setting up UAT sign-off, and validating your SCA shape with an auditor. The checklist includes time estimates and exit criteria so you can plan a real onboarding.

TestNUX is built around a git-native, three-track structure. Each track answers a different question:

| Track | Folder | Answers |
|-------|--------|---------|
| **Requirements** | `requirements/` | What did we say we'd build? |
| **Sprint log** | `sprint-log/<date>_<feature>/` | What was built, and when? |
| **Testing log** | `testing-log/<date>_<page>/` | What was tested, and what happened? |

These three tracks are the input and output of TestNUX. The CLI reads from all three and writes into the testing log. v0.2's RTM generator reads all three to produce the traceability matrix.

**Why date-prefixed folders?** Each test-pass folder is a point-in-time snapshot. When an auditor asks "what was tested on May 1, 2026 against version 2.3?", the answer is a single folder: `testing-log/2026-05-01_login/`. No search required.

---

## R-XX — Requirements

A requirement is a named, numbered statement of what the system is supposed to do. It lives in `requirements/REQUIREMENTS.md`.

Format: `R-01`, `R-02`, ... `R-102` (zero-padded to two digits by convention; your project may use more digits).

Example:

```
R-42: Users must be able to authenticate using TOTP (time-based one-time password).
```

Requirements are **inputs** to TestNUX. The parser extracts R-IDs from:
- `## R-42` headings in `requirements/REQUIREMENTS.md`
- `describe('R-42', ...)` blocks in Playwright specs
- `// R-42` inline comments in source code (optional, enriches the RTM)

A requirement is not a test case. A single requirement may map to many test cases. The traceability matrix (see below) captures this mapping.

---

## TC-XX — Test Cases

A test case is a single, executable scenario. It lives in `testing-log/<date>_<page>/test-plan.md`.

Format: `LOGIN-01`, `REG-04`, `DASH-12` — the prefix is derived from the page slug you pass to `testnux init`. Each TC must have:

- A unique ID within the test pass
- A priority (`P1` through `P4`)
- A Given / When / Then statement (the scenario)
- A standards mapping (which OWASP ASVS / WCAG control this covers)
- A status after execution (`PASS`, `FAIL`, `SKIP`, `BLOCKED`, or one of the extended statuses below)

Test cases are **the unit of audit evidence**. The HTML report generates one card per TC, with the embedded screenshot and result badge. The XLSX generates one row per TC, with a colour-coded Pass/Fail dropdown for UAT reviewers.

---

## BR-XX — Business Requirements (v0.3)

Business requirements sit above functional requirements in the hierarchy. Where R-XX defines *what the system does* (functional), BR-XX defines *what the business outcome must be* (intent).

Example:
```
BR-01: A user who loses their MFA device must be able to recover their account within 24 hours without administrator involvement.
  └── R-99  (WebAuthn recovery codes)
  └── R-100 (Self-service reset flow)
```

BR-XX is a v0.3 feature. At v0.1 and v0.2, the RTM uses R-XX as the top-level entity. When BR-XX ships, the RTM gains a column and the HTML report gains a "Business Requirements" tab.

---

## Status taxonomy

Every test case and requirement carries a status. Use the right status — it signals who has the next move.

| Status | Meaning | Who has next move |
|--------|---------|-------------------|
| `DONE` | Implemented and tested | Nobody — work is complete |
| `PARTIAL` | Partially implemented or tested; known gap | Engineering |
| `BLOCKED` | Blocked on an external dependency (vendor, legal, infra) | External party |
| `DEFERRED` | Scope-cut by product decision; not forgotten | Product — revisit next quarter |
| `DECLINED` | Out of scope by design; documented rationale required | Nobody — intentional |
| `SKIPPED` | TC not executed in this pass; may be executed in a later pass | Test lead — schedule |
| `BLOCKED-CONFIG` | Feature exists but environment config is missing | DevOps / Platform |
| `BLOCKED-IMPLEMENTATION` | UI/API exists but underlying logic is placeholder | Engineering |

**The distinction that matters most:** `BLOCKED` (external dep) vs `BLOCKED-IMPLEMENTATION` (internal placeholder). Confusing the two sends the wrong signal to auditors. A `BLOCKED` row prompts follow-up with the vendor. A `BLOCKED-IMPLEMENTATION` row prompts engineering to ship the missing logic.

---

## The 8-step regulator-evidence chain

Most engineering teams live in steps 1–2. Most compliance tools live in steps 6–8. TestNUX owns steps 3–5.

```
1. Requirements (R-XX)
   └── "requirements/REQUIREMENTS.md" — what you said you'd build
         │
2. Sprint log (build)
   └── "sprint-log/<date>_<feature>/" — git + sprint summaries
         │
3. Testing log ◄─── TestNUX v0.1
   └── test plans, Playwright specs, evidence screenshots
         │
4. Traceability matrix (RTM) ◄─── TestNUX v0.2
   └── R-XX → sprint → code → test → backlog — one row per requirement
         │
5. Security Control Assessment (SCA) ◄─── TestNUX v0.2
   └── per-surface evidence binder — what auditors actually read
         │
6. UAT sign-off ◄─── TestNUX v0.3
   └── stakeholder review, e-signature, uat-log.jsonl audit trail
         │
7. External audit / pen test
   └── vendor owns (EY, Schellman, A-LIGN, etc.)
         │
8. Production launch
   └── deploy owns
```

TestNUX does not replace a GRC platform (Vanta, Drata, ServiceNow GRC). It produces the artifacts those platforms import. The positioning is **"OSS evidence layer in your repo → feeds your GRC platform"**, not "replace your GRC platform."

---

## The traceability matrix (RTM)

The Requirements Traceability Matrix maps every R-XX to its sprint, code, test, and backlog state. At v0.1 this is a hand-maintained `requirements/TRACEABILITY.md`. At v0.2, `testnux rtm` generates it automatically.

Columns: `Status | Sprint | Code file(s) | Test case(s) | Backlog items | Notes`

The RTM is the artifact a SOC 2 auditor uses to verify that every stated requirement has evidence of implementation and testing. Without it, auditors must construct the mapping manually — which is weeks of work for a mid-size platform.

---

## Security Control Assessment (SCA)

An SCA is a per-surface document that maps every applicable security control to its implementation evidence. The canonical structure has 8 sections:

1. Executive Summary
2. Methodology
3. Per-Control Inventory
4. Standards Alignment
5. Threat Coverage
6. Declined-by-Design controls
7. Open Items
8. Sign-Off

The SCA is what external auditors (KPMG, Schellman, A-LIGN, and similar firms) look at in the first week of an engagement. TestNUX v0.2 generates the SCA from test results. v0.1 ships a template and a complete worked example (see `examples/demo-dashboard/output/login-sca-v0.1.md`).

**`[VERIFY]` markers:** any cell in the SCA that was generated by an LLM — rather than authored or reviewed by a human — renders with a `[VERIFY]` tag in the final PDF. This is non-negotiable for audit defensibility. An examiner who catches one wrong citation can invalidate the entire SCA; the `[VERIFY]` marker ensures human attestation before submission.

---

## Industry standards — what `--industry general` loads

The `--industry general` flag loads:

- **OWASP ASVS 4.0** (Application Security Verification Standard) — the most widely recognised web-application security control framework. Freely available. No licence restrictions.
- **WCAG 2.2 AA** (Web Content Accessibility Guidelines, level AA) — the EU/US accessibility standard. Required for public-sector procurement in most jurisdictions.

These two standards cover the foundational controls for authentication, session management, input validation, error handling, and accessibility that apply to every web application regardless of industry.

**Why only `general` at v0.1?** Per-industry libraries require regulatory-content work, not code work. NIST 800-63B (fintech MFA) cites ~80 controls; NYDFS 23 NYCRR 500 adds another ~40. Shipping empty templates is worse than not shipping them. TestNUX ships `general` with substance and expands to `fintech` and `healthcare` in v0.2 once the OSCAL integration (which gives access to machine-readable NIST catalogs) is resolved.

**Roadmap:**

| Version | Industry flag | Standards |
|---------|--------------|-----------|
| v0.1 | `general` | OWASP ASVS 4.0 + WCAG 2.2 AA |
| v0.2 | `fintech` | + NIST 800-63B, NYDFS 23 NYCRR 500, PSD2, PCI DSS |
| v0.2 | `healthcare` | + HIPAA Security Rule, HITECH, NIST 800-66 |
| v0.3 | `gov` | + FedRAMP, FISMA, NIST 800-53 |

v0.2 also emits **OSCAL JSON** alongside markdown, making TestNUX compatible with FedRAMP RFC-0024 (machine-readable control packages, mandatory September 2026). The OSCAL integration uses IBM Compliance Trestle as the serialiser; TestNUX provides the UX.

---

## Evidence

Evidence is a per-TC artefact that proves a test case was executed. At v0.1, evidence is a Playwright `afterEach` screenshot saved to `evidence/<TC-ID>.png`. The HTML report embeds the screenshot directly in the TC card (no external hosting required).

The spec template provides a `captureEvidence(page, tcId)` helper. Tests that create their own browser context (e.g., incognito-mode tests) must call this helper inline — before the context closes — because the `afterEach` hook runs after the context is gone.

---

## The self-contained HTML report

The output of `testnux report` is a single `.html` file. "Self-contained" means:

- No CDN dependencies — the CSS, JS, and screenshots are all inlined
- Opens in any browser without a web server
- Can be emailed, committed to git, or attached to a Jira ticket
- Typically 1–5 MB depending on screenshot count

The report structure: a summary header, then tabs — All TCs, Pass, Fail, Skip, Blocked, Standards Alignment. Each tab renders TC cards. TC IDs in the DOM are unique and anchor-link-able (`#LOGIN-01`). Only the "All TCs" tab carries DOM IDs; other tabs use `data-tc-id` attributes so TOC links always resolve.

---

## OSCAL (v0.2)

OSCAL (Open Security Controls Assessment Language) is NIST's machine-readable format for control assessments. FedRAMP RFC-0024 mandates machine-readable OSCAL packages by September 2026. TestNUX v0.2 emits OSCAL JSON alongside its markdown SCA output, using IBM Compliance Trestle as the serialiser.

Positioning: TestNUX is "OSCAL with a UX" — not an alternative to OSCAL, but a developer-workflow-native authoring layer that produces OSCAL-compatible output.

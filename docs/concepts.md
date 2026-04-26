# Concepts

This page walks through how the TestNUX model works in practice, then ends with a reference glossary. Read the narrative once; refer back to the glossary as needed.

---

## The problem this solves

You are the engineering lead at a Series B fintech. Your SOC 2 Type II audit window opens in six weeks. The auditor emails: "Please provide evidence for controls CC6.1 through CC6.8 — specifically, show us how session timeout (R-23) is implemented and tested."

You know the feature shipped. The question is whether you can *prove* it.

You open Jira and find three tickets spread across two sprints with different status labels. You open Confluence and find a test plan that was last updated four months ago and references a URL that no longer exists. You ping the QA lead, who finds a spreadsheet with a tab labeled "Login testing April" — but it has no screenshots, no result column, and no link back to a requirement ID. The security engineer has a separate Notion page with the OWASP control reference, maintained independently.

Assembling a coherent answer takes two days and involves four people. The answer you produce still has gaps the auditor will probe.

This is the standard outcome when testing discipline lives in four different tools with no shared vocabulary. The evidence exists, but it is not structured as evidence.

TestNUX gives you one model that handles all three of these: the requirement, the test, and the proof that the test was executed against the right thing.

---

## Moment 1: "The auditor asks for evidence on R-23"

The auditor's question — "how is R-23 tested?" — is not a hard question if your traceability is intact. It is a catastrophic question if it is not.

In TestNUX, every requirement has an R-XX ID that lives in `requirements/REQUIREMENTS.md`. Every test case has a TC-XX ID that lives in a `testing-log/<date>_<page>/test-plan.md`. The relationship between them — which TCs cover which R-IDs, which sprint shipped the implementation, which code files carry the logic — is recorded in the Requirements Traceability Matrix (RTM).

At v0.1, the RTM is a hand-maintained `requirements/TRACEABILITY.md`. At v0.2, `testnux rtm` generates it automatically from the three tracks.

When the auditor asks about R-23, the answer is:

```
testnux rtm | grep R-23
```

Output:

```
R-23 | DONE | sprint-log/2026-03-15_auth/ | src/lib/session.ts | TC-LOGIN-07, TC-LOGIN-08 | testing-log/2026-04-26_login/
```

One line. The auditor gets the sprint that built it, the code file that implements it, the test cases that cover it, and the folder that holds the execution evidence — including screenshots.

**The marker convention** keeps the RTM editable by humans without being overwritten by `testnux rtm` on regeneration. Wrap any hand-authored block in:

```
<!-- testnux:row R-23 begin -->
... your annotations ...
<!-- testnux:row R-23 end -->
```

The generator preserves anything inside those markers. Edit outside them and regeneration will overwrite your changes. This is intentional: it forces a clear boundary between machine-generated linkage and human-authored rationale.

**BR-XX** (Business Requirements, v0.3) sit above R-XX in the hierarchy. Where R-23 says "session must time out after 15 minutes of inactivity," the parent BR-04 might say "a user who walks away from a shared workstation must not leave an authenticated session exposed." The distinction matters for audit conversations: the regulator cares about the business outcome; the engineer implements the functional requirement. The RTM gains a column when BR-XX ships. At v0.2, R-XX is the top-level entity.

---

## Moment 2: "Status is ambiguous — is this DONE or PARTIAL?"

In a shared spreadsheet, "DONE" means whatever the person who typed it thought it meant. In a regulated platform, the status of a requirement is a legal statement about your compliance posture.

TestNUX enforces a fixed taxonomy. Each status has a specific meaning and implies a specific next move:

| Status | Meaning | Who acts next |
|--------|---------|---------------|
| `DONE` | Implemented and tested; evidence exists | Nobody |
| `PARTIAL` | Gap exists; known and tracked | Engineering |
| `BLOCKED` | Waiting on an external party | Vendor / legal / IT |
| `DEFERRED` | Scope-cut by product decision; not forgotten | Product, next cycle |
| `DECLINED` | Out of scope by design; rationale documented | Nobody — intentional |
| `SKIPPED` | TC not executed in this pass | Test lead — schedule |
| `BLOCKED-CONFIG` | Feature exists; environment config is missing | DevOps / Platform |
| `BLOCKED-IMPLEMENTATION` | UI/API exists; underlying logic is placeholder | Engineering |

The distinction that matters most in practice is `BLOCKED-CONFIG` versus `BLOCKED-IMPLEMENTATION`. They look similar from the outside — "it doesn't work" — but they require completely different responses.

Consider TC-LOGIN-09: TOTP second-factor verification. The UI exists. The Playwright test exists. The test fails because the identity provider's "Verify TOTP" toggle is disabled in the admin console — a config change that only a platform admin can make. This is `BLOCKED-CONFIG`. Engineering cannot fix it. The action item is a ticket to IT, not a code change.

If the test fails because the TOTP verification endpoint returns a 200 regardless of the code — that is `BLOCKED-IMPLEMENTATION`. Engineering owns the fix. The action item is a code change, not a ticket to IT.

An auditor reading `BLOCKED-CONFIG` on TC-LOGIN-09 understands immediately: the control exists, it is enabled in code, and the gap is an administrative configuration pending external action. That is a materially different finding than `BLOCKED-IMPLEMENTATION`, which signals the control is not yet built.

Confusing the two does not just muddy the audit. It sends engineering to fix the wrong thing.

---

## Moment 3: "How do we prove this sign-off is real and unforged?"

After testing, someone with authority must attest that they reviewed the results and accepted the risk of any open items. That sign-off has to be tamper-evident, or it is worthless as audit evidence.

TestNUX uses a hash-chained UAT log. Every entry in `uat-log.jsonl` contains the HMAC-SHA256 signature of its own payload and the hash of the previous entry. The chain is signed with a shared secret (`UAT_SECRET` in your environment). The result is a ledger where any modification — to any entry, in any position — breaks the chain at that point and is immediately detectable.

Five ways an attacker could try to forge the log, and why each fails:

1. **Mutate a past entry** — the entry's hash changes, breaking every subsequent entry's `prev_hash` pointer
2. **Overwrite the signature** — the new signature does not match the entry's payload, caught on first verify
3. **Delete an entry** — the `prev_hash` in the next entry points to a hash that no longer exists in the chain
4. **Reorder entries** — `prev_hash` pointers are sequential; reordering breaks the chain at the swap point
5. **Sign with a different secret** — all signatures fail `testnux sign verify` because they do not match `UAT_SECRET`

When the compliance team needs a sign-off artifact for an auditor, the workflow is:

```
testnux sign verify testing-log/2026-04-26_login/uat-log.jsonl
```

Output:

```
Chain verified: 12 entries, 0 gaps, 0 signature mismatches.
Signed by: eng-lead@yourcompany.com at 2026-04-26T14:33:02Z
```

The auditor gets a printed ledger PDF. `testnux sign verify` confirms chain integrity in under a second. The sign-off is either valid or it is not — there is no ambiguity and no way to retroactively alter a past attestation without detection.

---

## Reference glossary

Quick-reference for the full vocabulary. See the narrative above for the "why" behind each term.

| Term | Definition |
|------|-----------|
| **R-XX** | Requirement ID. Lives in `requirements/REQUIREMENTS.md`. Format: `R-01` through `R-999`. The parser extracts R-IDs from `## R-XX` headings, `describe('R-XX', ...)` spec blocks, and `// R-XX` inline comments. |
| **TC-XX** | Test case ID. Lives in `testing-log/<date>_<page>/test-plan.md`. Prefix is derived from the page slug (`LOGIN-01`, `DASH-04`). Each TC has a unique ID, priority (P1–P4), G/W/T statement, standards mapping, and execution status. |
| **BR-XX** | Business requirement ID (v0.3). Sits above R-XX — defines the business outcome; R-XX defines the functional implementation. Not yet in the RTM at v0.1/v0.2. |
| **RTM** | Requirements Traceability Matrix. Maps R-XX → sprint → code → TC → result. Hand-maintained at v0.1; generated by `testnux rtm` at v0.2. |
| **Marker convention** | `<!-- testnux:row R-XX begin/end -->` — wraps human-authored annotations inside a generated RTM file. Generator preserves content inside markers on regeneration. |
| **Three-track structure** | `requirements/` (what you said you'd build), `sprint-log/<date>_<feature>/` (what was built), `testing-log/<date>_<page>/` (what was tested). Each track answers a different audit question. |
| **Status: DONE** | Implemented and tested; evidence exists. |
| **Status: PARTIAL** | Known gap; engineering has next move. |
| **Status: BLOCKED** | Waiting on external party (vendor, legal, IT). |
| **Status: DEFERRED** | Scope-cut; product revisits next cycle. |
| **Status: DECLINED** | Out of scope by design; rationale required. |
| **Status: SKIPPED** | TC not executed this pass; test lead schedules. |
| **Status: BLOCKED-CONFIG** | Feature built; environment config missing. DevOps acts. |
| **Status: BLOCKED-IMPLEMENTATION** | UI/API exists; logic is placeholder. Engineering acts. |
| **HMAC chain** | Hash-chained UAT log. Each entry signs its own payload with `UAT_SECRET` and includes the hash of the previous entry. Tamper-evident: any mutation, deletion, or reordering breaks the chain detectably. |
| **SCA** | Security Control Assessment. Per-surface document mapping each security control to implementation evidence. Eight sections; generated from test results at v0.2. `[VERIFY]` markers flag LLM-generated cells that require human review before submission. |
| **OSCAL** | Open Security Controls Assessment Language. NIST machine-readable format for control assessments. TestNUX v0.2 emits OSCAL JSON alongside markdown SCA output, satisfying FedRAMP RFC-0024 (mandatory September 2026). |

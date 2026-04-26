# Adoption checklist

> **TL;DR:** Forking gives you the tooling. These 4 tasks turn the tooling into actual outcomes — consistency, RTM, UAT, auditor acceptance.

---

## What forking testnux doesn't do for you

The OSS ships:

- Templates, schemas, conventions
- CLI commands for `init` / `validate` / `report` / `rtm` / `sca`
- Marker convention so human edits survive regeneration
- HMAC-chained sign-off mechanics

But these 4 things are on **you** (and your team). Each has a time estimate so you can plan a real onboarding:

---

## Task 1 — Originate your R-IDs (1–3 days)

**What this is:** Writing the numbered requirement statements that are the root of the entire traceability chain. TestNUX can generate reports, RTM rows, and SCA sections — but it cannot invent what your product is supposed to do. That knowledge lives in your team's heads, your existing requirement docs, your legal/compliance obligations, and your customer contracts.

**Why it's non-negotiable:** The traceability matrix maps every R-XX to sprint → code → test → backlog. If you skip this step, you have no R-IDs, so the RTM is empty, the SCA has no per-control inventory, and the audit evidence chain has no starting node. The CLI has nothing to trace.

**Steps:**

1. **Gather your existing requirements sources.** Pull together: PRD, user stories, BRD, regulatory obligation matrix, acceptance criteria in Linear/Jira, security questionnaire from your last vendor audit. Anything that says "the system must..." or "the user shall..."
2. **Choose a granularity level.** Each R-XX should be one testable statement. "Users can log in" is too broad. "Users must be able to authenticate with email + password" is right. "Users must be able to authenticate with email + password and receive a session cookie valid for 24 hours" is two requirements.
3. **Number sequentially and write to `requirements/REQUIREMENTS.md`.** Format: `## R-01` heading, one-line statement, optional context paragraph. Start at `R-01`; zero-pad to two digits for up to 99 requirements, three digits for more.
4. **Tag each R-ID to a source.** Note in the same file which input document drove each requirement — PRD section, regulatory clause, security questionnaire item. This is your provenance trail for auditors who ask "where did this requirement come from?"
5. **Review as a team.** One engineer alone cannot know all the requirements. A 90-minute session with engineering lead + product lead + compliance lead (if you have one) to walk the list and catch omissions is worth more than a week of solo drafting.
6. **Stub `requirements/TRACEABILITY.md`.** Add one row per R-XX with status `PARTIAL` (because nothing is traced yet). This is the scaffold the v0.2 RTM generator will populate.

**Who's responsible:** The person who owns the product specification. On most early teams this is the engineering lead working with a founder or PM. On regulated teams, the compliance officer should review before it's final.

**Time estimate:** 1 day if your requirements are already written somewhere in rough form and you're converting them. 2–3 days if you're starting from scratch or your existing docs are inconsistent.

**Exit criteria:** `requirements/REQUIREMENTS.md` exists, contains at least the R-IDs for the area you're testing first, and each R-XX is a single testable statement. Running `testnux validate` on a test plan that references those R-IDs produces no "unknown R-ID" warnings.

**Common mistakes:**
- Copying Jira ticket titles verbatim — they're usually too vague ("Improve login flow").
- Using the same R-ID for two different requirements because they're related.
- Skipping the provenance tag and then having no answer when an auditor asks "why does R-42 exist?"

---

## Task 2 — Adopt the status labeling discipline (2 hours one-time + ongoing)

**What this is:** Consistently applying the 8-status taxonomy (below) to every requirement and test case, so the RTM tells the truth about what's actually done vs what's still open.

**Why it's non-negotiable:** The RTM is only as honest as the statuses in it. A spreadsheet full of `DONE` when the real state is `PARTIAL` or `BLOCKED` is worse than no RTM — it's a trap for auditors and a false signal for engineering. The discipline is cultural, not technical. No CLI flag enforces it.

**The 8-status taxonomy:**

| Status | Meaning | Who has the next move |
|---|---|---|
| `DONE` | Implemented and tested; evidence exists | Nobody — work is complete |
| `PARTIAL` | Partially implemented or tested; known gap remains | Engineering |
| `BLOCKED` | Blocked on an external dependency (vendor, legal, infra) | External party |
| `DEFERRED` | Scope-cut by product decision; not forgotten | Product — revisit next quarter |
| `DECLINED` | Out of scope by design; documented rationale required | Nobody — intentional |
| `SKIPPED` | TC not executed in this test pass; may run in a later pass | Test lead — schedule |
| `BLOCKED-CONFIG` | Feature exists but environment config is missing | DevOps / Platform |
| `BLOCKED-IMPLEMENTATION` | UI/API exists but underlying logic is placeholder | Engineering |

**Decision rule — "who has the next move?"** If the answer is your engineering team, the status is `PARTIAL` or `BLOCKED-IMPLEMENTATION`. If the answer is a third party (vendor, legal, AWS support), the status is `BLOCKED`. If the answer is a product decision you've explicitly made and recorded, it's `DEFERRED` or `DECLINED`. If the answer is nobody because it's done, it's `DONE`. Never mark `DONE` until evidence of testing exists — implementation alone doesn't count.

**Steps:**

1. **Run a 90-minute team session** ("status taxonomy onboarding"). Walk through the 8 statuses using real examples from your own backlog. Have each team member practice assigning a status to 3–5 recent items.
2. **Print or pin the cheat sheet.** Create a 1-page reference (the table above, plus the decision rule) and post it in your team Slack as a pinned message and in your engineering wiki. Refer to it in PR reviews when status tags appear.
3. **Add a status review step to your sprint retro.** Once per sprint (or biweekly), open `requirements/REQUIREMENTS.md` and `requirements/TRACEABILITY.md` together and ask: "is any `DONE` item actually still `PARTIAL`? Is any `BLOCKED` actually unblocked now?"
4. **Enforce in PR comments.** When a reviewer sees a status change in `REQUIREMENTS.md` that looks wrong (e.g., R-XX flipped to `DONE` but no test evidence exists), comment and block merge until evidence is cited.

**Common anti-patterns:**
- Marking `PARTIAL` when the real status is `BLOCKED-on-vendor` — sends the signal that engineering needs to act, when actually you're waiting on Stripe or Okta.
- Marking `DONE` after a happy-path test when the error paths are untested.
- Using `DEFERRED` as a dumping ground for items nobody wants to own. Deferred requires a named quarter and a named decision-maker.
- Letting statuses go stale between sprints because nobody owns the review step.

**Time estimate:** 90-minute onboarding session is a one-time cost. The ongoing cost is 15–30 minutes per sprint review if the habit is established. If the habit isn't established, the cost is much higher: a wrong RTM that you have to repair before an audit.

**Exit criteria:** Every team member can answer "what status would I use if we're waiting on a vendor API to be ready?" without looking at the cheat sheet. (Answer: `BLOCKED`.) And every status in `REQUIREMENTS.md` has been reviewed within the last sprint cycle.

---

## Task 3 — Set up UAT_SECRET + sign-off workflow (1 hour technical + 1 day cultural)

**What this is:** Configuring the HMAC-chained e-signature layer that makes UAT sign-offs non-repudiable. The technical setup is one hour. The cultural setup — deciding who signs what, when, and what happens if a signer leaves — takes a day of internal conversation.

**Why it's non-negotiable:** Without the sign-off chain, your UAT evidence is a dropdown value in an Excel file. Any auditor who has seen a self-signed spreadsheet will not accept it as evidence of independent review. The HMAC chain makes each sign-off cryptographically tied to the reviewer's identity and the document state at the time of signing. That's what makes it defensible.

**Technical setup (1 hour):**

```bash
# 1. Generate a strong secret (minimum 32 bytes)
openssl rand -base64 32

# 2. Set UAT_SECRET in your environment
#    — for local dev, add to .env.local (never commit this file)
#    — for CI, add as a repository secret in GitHub Actions / GitLab CI
echo "UAT_SECRET=<your-generated-secret>" >> .env.local

# 3. Verify the secret is detected
testnux doctor --check uat
# Expected: ✔ UAT_SECRET detected (32+ bytes)

# 4. Run your first sign-off against a completed test pass
testnux uat sign <folder> --reviewer "Jane Smith" --role "QA Lead"
# This writes a signed entry to uat-log.jsonl and updates uat_status in the XLSX
```

**Who holds the secret:** One designated "UAT owner" per project. Usually the QA lead or compliance lead. Do not share the secret with everyone — the point is that sign-offs are attributed. Store the secret in your secrets manager (1Password, AWS Secrets Manager, Vault) with a named owner.

**Rotation policy:** Rotate `UAT_SECRET` when:
- A reviewer who had access leaves the team
- You believe the secret was exposed (e.g., accidentally committed to git)
- You're starting a new audit engagement (clean boundary)

When you rotate, update the secret in all environments before the next sign-off. Old `uat-log.jsonl` entries signed with the previous key remain valid — they are timestamped proof of the state at that time.

**What happens when a reviewer leaves:** Their past sign-offs remain valid (timestamped, HMAC-chained). Future sign-offs require a new reviewer. If you're mid-engagement when someone leaves, note the reviewer change in `execution-log.md` with a date and reason. Auditors expect turnover; they need the documentation, not continuity.

**Cultural setup (1 day of internal conversation):**

Answer these questions before your first real UAT cycle:

1. **Who is authorized to sign off on each TC category?** (Security TCs may require a different reviewer than UX TCs.)
2. **What does a sign-off mean?** ("I reviewed the screenshot and the G/W/T description and I attest that the TC result matches the evidence.") Write this definition down — it goes in your `execution-log.md` header.
3. **What is the turnaround SLA?** If UAT sign-off is required before a release, reviewers need to know their expected response time.
4. **What happens if a TC is `FAIL` at sign-off?** Define the escalation path. Do not let sign-off be used to quietly flip a `FAIL` to `PASS`.

**Exit criteria:** `testnux doctor --check uat` passes. At least one sign-off has been made in a real test pass, and the `uat-log.jsonl` entry is committed to git. The sign-off definition is written in `execution-log.md`.

---

## Task 4 — Get one auditor to validate your SCA shape (1 month elapsed; 30 minutes auditor time)

**What this is:** Showing your first generated SCA (Security Control Assessment) to a qualified external auditor and getting their verbal or written confirmation that the artifact structure and content meet the bar for their engagement. This is not a full audit — it is a 30-minute Zoom where you share your screen and they tell you whether the format works for them.

**Why it's non-negotiable:** TestNUX generates SCA artifacts that follow the 8-section structure (Executive Summary → Methodology → Per-Control Inventory → Standards Alignment → Threat Coverage → Declined-by-Design → Open Items → Sign-Off). That structure is based on real SOC 2 / NYDFS / ISO 27001 engagements. But every auditor and audit firm has preferences for how evidence is formatted. Without validation, you may spend six months producing artifacts that your specific auditor won't accept in their specific form.

**Thirty minutes now saves weeks later.** The most common failure mode: a team spends a sprint producing beautiful HTML reports and RTM matrices, only to find out their auditor wants everything in a GRC platform (Vanta, Drata) and doesn't accept markdown-native artifacts. Find this out before you're three sprints deep.

**Steps:**

1. **Generate your first SCA.** Run `testnux sca generate <folder>` against your first completed test pass. The output is a `login-sca-v0.1.md` (or similar) in your testing-log folder. Also open the reference example at `examples/demo-dashboard/output/login-sca-v0.1.md` — you can share this as a preview even before your first real SCA is ready.

2. **Identify who to ask.** In order of preference:
   - **Your existing auditor** — if you already have a SOC 2 / HIPAA / NYDFS engagement, ask the examiner directly. They'll tell you in one email whether the format works.
   - **Your GRC platform's CSM** — if you're on Vanta, Drata, or similar, ask whether they accept markdown artifacts or need a specific import format.
   - **A first-time auditor introduction** — if you have no auditor relationship yet, the firms listed below accept brief pre-engagement calls: **A-LIGN** (SOC 2 specialist, approachable for early-stage companies), **Schellman** (SOC 2 + HITRUST, strong for healthcare and fintech), **BDO** (broader engagements, good if you're also doing financial audit), **Coalfire** (FedRAMP + SOC 2, government-adjacent).

3. **Draft the email.** Keep it short:

   > Subject: 30-minute Zoom — testing artifact format validation  
   >
   > Hi [Name],  
   >
   > We're using an OSS tool called TestNUX to generate structured test evidence packages (HTML reports, RTM, SCA) for our [SOC 2 / NYDFS / ISO 27001] audit. Before we generate a full engagement's worth of artifacts, we'd like 30 minutes to show you the format and confirm it meets your bar.  
   >
   > I can share a sample SCA and HTML report in advance. Does [date/time] work?  
   >
   > Best,  
   > [Name]

4. **Run the 30-minute Zoom.** Share your screen. Show: (1) the HTML report with embedded screenshots and standards-alignment table, (2) the SCA markdown with `[VERIFY]` markers on LLM-generated cells, (3) the TRACEABILITY.md RTM. Ask explicitly: "Does this format work for your engagement? Is there anything you'd need to see differently?"

5. **Document the outcome.** If the auditor says it works, get that in writing — even an email confirmation is enough. Add a note to `requirements/TRACEABILITY.md` or a dedicated `requirements/AUDITOR_VALIDATION.md`: "Artifact format validated by [Firm, Name, Date]. Verbatim: '[quote from their email or Zoom notes].'" This quote is evidence you can use in future engagements with the same firm.

6. **If they flag issues:** TestNUX's artifact structure is configurable. Most issues are fixable by adjusting section ordering, adding a cover page, or changing the standards-alignment table format. Raise a GitHub issue with the specific ask — if it's a common request, it will be addressed in v0.2.

**What "validated" means:** You have a written or recorded statement from a qualified auditor at a named firm saying that the artifact structure is acceptable for a [framework] engagement. It does not mean the artifacts pass the audit — it means the format passes the auditor's intake check.

**Time estimate:** 30 minutes of auditor time. 2–4 weeks of calendar time to schedule the call (auditors are busy; send the email early). 1–2 hours of your time to generate the sample SCA and prep for the call.

**Exit criteria:** You have a written confirmation from an external auditor that the TestNUX artifact format meets their requirements for your target framework. This confirmation is committed to your repo or your GRC platform.

---

## Total time

| Task | Engineer time | Calendar time | Critical path? |
|---|---|---|---|
| 1 — Originate R-IDs | 1–3 days | 1 week | Yes — gates everything |
| 2 — Adopt status labeling discipline | 2 hr + ongoing | 1 day onboarding | Yes — gates RTM accuracy |
| 3 — Set up UAT_SECRET + workflow | 1 hr technical + 1 day cultural | 2 days | Yes — gates UAT sign-off |
| 4 — Auditor SCA validation | 30 min Zoom + 1–2 hr prep | 2–4 weeks | Yes — gates auditor acceptance |
| **Total** | **~5 days** | **~4 weeks elapsed** | All 4 are critical |

Tasks 1–3 can run in parallel once you have your first test pass scaffolded. Task 4 must wait until Task 1 is complete (you need real R-IDs in the SCA). The 4-week elapsed time is driven by Task 4's scheduling lag — start that email on day 1.

---

## What you get when all 4 are done

| Dimension | Without the discipline | With all 4 tasks done |
|---|---|---|
| **Requirements** | Jira tickets no auditor can read | R-XX statements, each traceable to a source document |
| **RTM** | Missing or manually-maintained spreadsheet | `TRACEABILITY.md` generated from real R-IDs, with honest statuses |
| **Test evidence** | Screenshots in a folder with no structure | Per-TC HTML report with embedded evidence, standards alignment, TC-to-R-XX links |
| **UAT sign-off** | "QA approved it" in Slack | HMAC-chained `uat-log.jsonl` with named reviewer, role, timestamp, and document hash |
| **Auditor intake** | "We'll figure out the format when the auditor asks" | Pre-validated artifact shape; auditor has already confirmed the format works |
| **SCA** | No SCA, or a static document that drifts from reality | Generated SCA with `[VERIFY]` markers on LLM cells; human-reviewed before submission |
| **Audit prep time** | 4–8 hours per page, manually assembled | Under 5 minutes per page from existing markdown + screenshots |
| **Regulator confidence** | "We think we're compliant" | Bidirectional traceability from requirement to evidence; auditor has seen it and confirmed |

---

## What if you can't do this work yourself? — Premium tier

If the 4 tasks above are blockers — no team capacity, no auditor relationship, no time for cultural change — the **premium tier** (planned v0.4+) covers this and much more.

See **[docs/premium.md](docs/premium.md)** for the full offering: hosted runs, auditor portal, liability cover, cryptographic notarization, WORM retention, GRC integrations, white-glove onboarding, training, quarterly review, and embedded consulting. The OSS is not a limited version of the paid product — it is the complete tool. Premium sells the hosted infrastructure, the assurance, and the human time that the CLI was never designed to provide.

**Contact:** `ccling1998@gmail.com` — first 3 customers in each tier get founder-rate pricing.

---

## How Claude (and other AIs) should read this checklist

If you're a Claude or other AI agent helping a user adopt TestNUX, follow this sequence:

1. **Run `testnux doctor` first.** This flags missing prereqs (Node version, Playwright, UAT_SECRET, env vars). Fix anything red before continuing.

2. **Walk the user through Task 1 (R-ID origination) interactively.** Ask the user to point at their existing requirements doc — a PRD, a BRD, Jira backlog export, or even a product brief. Parse it and propose R-IDs in the TestNUX format. Present them one at a time and ask the user to confirm, reject, or rephrase each one before writing to `requirements/REQUIREMENTS.md`. Do not batch-write without confirmation.

3. **For Task 2 (status discipline), output a 1-page status-taxonomy cheat sheet** for the team to reference. Use the table from this document. Format it as clean markdown the team can paste into their wiki or Notion. Do not skip this — the biggest adoption failure is teams who set up the CLI but never adopt the taxonomy.

4. **For Task 3 (UAT_SECRET), use `testnux doctor --check uat`** to validate setup. If the check fails, walk the user through the `openssl rand -base64 32` step and the environment variable setup. Do not proceed to UAT sign-off until the check passes.

5. **For Task 4 (auditor validation), draft the 30-minute Zoom request email** using the template in this document. Populate the user's name, target framework (SOC 2, NYDFS, ISO 27001, etc.), and suggested time slots. Ask the user to review and send — do not send on their behalf.

6. **Sequence check:** If the user skips Task 1 and jumps to running reports, flag it. An RTM with no R-IDs is an empty RTM. If the user skips Task 3, flag it. A UAT sign-off without HMAC is a spreadsheet dropdown. If the user skips Task 4, warn them: "you may produce correct artifacts in an unacceptable format." Don't let users treat the CLI as a shortcut past the discipline.

If you skip any of the 4 tasks, the user will end up with the same inconsistency they had before — just hidden inside TestNUX's CLI output. A well-formatted empty RTM is worse than no RTM, because it looks done. Don't let that happen.

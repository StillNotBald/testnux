# TestNUX Premium

> The OSS gives you the SKILL. Premium gives you the SaaS, the service,
> the assurance, and the relationships when you need them.

Everything below is **planned v0.4+ and not yet built**. This document describes the intended offering so enterprise procurement leads, CISOs, and compliance teams can evaluate fit ahead of the launch window (Q3 2026 target). If you have requirements that aren't covered here, contact `ccling1998@gmail.com` — pre-launch input shapes the roadmap.

---

## What stays free forever (per CEO commitment)

The following features are Apache 2.0 and will remain free and self-hostable, permanently, regardless of what the paid tiers include. This commitment was made at the project's founding ceremony (CEO D3) and is documented in the LICENSE and NOTICE files.

**Free forever:**
- The full CLI: `init`, `report`, `validate`, `doctor`, `demo`, `rtm`, `sca`, `uat`
- RTM (Requirements Traceability Matrix) generation
- SCA (Security Control Assessment) generation and PDF export
- OSCAL JSON emit (FedRAMP RFC-0024 interoperability — federal interop must remain free)
- All 6 industry standards bundles: `general`, `fintech`, `healthcare`, `gov`, `edu`, `ecommerce`
- All templates, schemas, and JSON Schema definitions
- The `[VERIFY]` marker system for LLM-generated content
- HMAC-chained UAT sign-off mechanics
- Local evidence capture and storage
- All documentation, including this document

**What the premium tiers sell:** hosted infrastructure you don't have to run, workflow features that require a persistent server, and human time (consulting, training, advisory). Assurance services (liability cover, cryptographic notarization, WORM storage) are on the longer-term roadmap — see the Enterprise section below for current status. None of this gates anything that currently runs on your machine.

---

## Premium tiers — overview

| Tier | Target audience | Starting price | Anchor value |
|---|---|---|---|
| **Solo / Pro** | Solo founders, small teams (1–10 people) | $99–499/mo | Hosted runs, no infra setup |
| **Team** | Series A–B startups, mid-market (10–200 people) | $999–2,999/mo | Multi-tenant + auditor portal |
| **Service add-ons** | Any tier, or standalone | Project-based | White-glove onboarding, advisory, training |

Pricing is TBD and will be finalized after OSS validation. Numbers above are indicative ranges.

**Founder-rate pricing:** The first 3 customers in each tier receive 50% off year-one in exchange for being a named case study and reference customer. Contact `ccling1998@gmail.com` to get on the list.

---

## Solo / Pro tier

*Target: solo founders, early-stage startups, small compliance teams. You're sold on the discipline but don't want to manage infrastructure.*

### Hosted runs ($99–199/mo base)

The OSS CLI runs Playwright on your machine. The Pro tier runs it in the cloud so you don't need to maintain browsers, Playwright versions, or a CI machine.

- Cloud-hosted Playwright execution — no local browser setup, no machine maintenance
- Trigger from CI: `testnux run --hosted` posts results back to your dashboard
- Trigger from web UI: paste a URL, select an industry bundle, get results
- **100 page-test-passes/month included**; $0.40/pass overage
- Evidence screenshots captured and stored automatically in your cloud vault

### Cloud evidence vault

The OSS produces evidence in your local repo. The vault makes it team-accessible, versioned across machines, and retention-configured for auditors.

- Versioned storage of test plans, execution logs, screenshots, and SCA documents
- Diff viewer: see what changed between v1.0 and v1.1 of any SCA or test plan
- Cross-machine sync — laptop, desktop, and CI all see the same evidence set
- 7-year retention default (standard for SOC 2 / NYDFS audit windows); configurable per project
- All data exportable as markdown + JSON at any time; no exit fee

### Notifications and reports

- Weekly email digest: coverage trends, new findings, attestation expirations approaching
- Slack and Microsoft Teams integration: post test failures, PR review prompts, sign-off requests
- Push notification when an attestation goes stale (configurable threshold; default 90 days)
- Monthly summary PDF suitable for board or compliance committee reporting

### Hosted demo landing page

- Auto-deploys from your repo's `examples/<slug>/output/` folder
- Public-facing or password-protected
- Use case: share a sample SCA with prospects or auditors without exposing your codebase
- Custom domain support at the $199/mo tier

---

## Team tier

*Target: Series A–B startups, mid-market companies with a dedicated compliance function. You have multiple teams, a compliance lead, and an upcoming audit.*

**Includes everything in Solo / Pro, plus:**

### Multi-tenant org structure ($999–1,499/mo base)

- Org → Workspace → Project hierarchy (parent company + subsidiaries or BUs)
- Separate evidence vaults per business unit; aggregate dashboards roll up to org level
- Role-based access control with 5 built-in roles:
  - **Owner** — full org admin
  - **Admin** — manage workspaces and users
  - **Maintainer** — push evidence, generate reports, manage R-IDs
  - **Reviewer** — sign off attestations, comment on SCA sections
  - **Auditor** — read-only; see below

### SSO and SCIM provisioning

- SAML 2.0 and OIDC SSO: Okta, Auth0, Google Workspace, Azure Active Directory
- SCIM provisioning — accounts stay in sync with your IdP automatically
- SSO enforcement (org-level setting: no password login allowed)
- Audit log of every action: who attested what, when, with what justification, from which IP

### Auditor portal ($1,999–2,999/mo tier)

The current OSS workflow for sharing evidence with auditors: export a PDF, email it, wait for comments in a Google Doc, repeat. The auditor portal replaces this.

- **Read-only auditor seats** — your auditor logs in directly; no email PDF dance
- Auditor capabilities: view SCA, navigate per-control inventory, comment per control, mark "evidence reviewed", flag follow-ups
- All comments versioned, attributed to the auditor by name and firm, and timestamped
- Auditor access is scoped to a specific engagement (start date / end date); access auto-expires
- Compatible with major US audit firms: A-LIGN, Schellman, BDO, Coalfire, KPMG
- Replaces the "share a Google Doc back-and-forth" pattern that creates version confusion

### Multiple-reviewer attestations

- Per-control sign-off can require N reviewers (configurable, default 1, typical enterprise 2)
- Each reviewer sees the comments of prior reviewers before attesting
- Attestation chain extends the HMAC log started by the OSS UAT sign-off mechanic
- Useful for: SOC 2 CC6 (logical access controls require two independent reviewers), NYDFS Section 500.16 (incident response sign-off)

### White-label HTML reports

- Your company branding: logo, color palette, custom CSS, domain
- Custom footer text for legal disclaimers, contact information, and engagement reference numbers
- Report header shows your company name, not "TestNUX"
- Use case: send to enterprise customers as your security posture proof, or to auditors with your firm branding

### Priority support

- 24-hour first response SLA (vs community best-effort)
- Dedicated Slack channel with the TestNUX team
- Monthly office hours call (30 minutes, scheduled)
- Issue escalation path for audit-critical blockers

---

## Enterprise needs?

The features mid-market and large enterprises typically need (liability cover via insurance partner, WORM evidence retention, multi-region data residency, custom SLA, white-glove embedded consulting) are on the roadmap but NOT currently offered. If you're an enterprise compliance lead with specific needs, email `ccling1998@gmail.com` — we'll tell you honestly whether we can help today vs whether you should look at Vanta, Drata, or a GRC consultancy. The OSS is free and useful regardless.

---

## Service add-ons

*Available to any tier, or as standalone engagements for OSS users who want human support without a SaaS subscription.*

### White-glove onboarding (3-day remote engagement, $15K–30K)

The 4 must-do adoption tasks in `docs/adoption-checklist.md` take approximately 4 weeks elapsed and 5 engineer-days. This service compresses that to 3 days with us doing the heavy lifting.

**Day 1 — R-ID extraction and RTM scaffold:**
- We review your existing requirements docs (PRD, BRD, Jira export, regulatory obligations matrix)
- We draft R-IDs in TestNUX format and walk them with your product/compliance lead
- We write the final set to `requirements/REQUIREMENTS.md` with provenance tags
- We stub `requirements/TRACEABILITY.md`

**Day 2 — Status taxonomy, UAT setup, and first test pass:**
- 90-minute status taxonomy workshop with your full team against your real backlog
- We configure `UAT_SECRET` in all environments and run the first 5 sign-off attestations
- We generate your first SCA from your first completed test pass
- We review the SCA together and resolve any `[VERIFY]` markers that need human input

**Day 3 — Auditor introduction and validation:**
- We facilitate the auditor introduction (see auditor introductions note below)
- We run the 30-minute auditor validation Zoom with you
- We document the outcome in `requirements/AUDITOR_VALIDATION.md`
- We hand off a written onboarding summary your team can reference going forward

**Output:** working RTM, validated SCA, 5 signed-off attestations in `uat-log.jsonl`, auditor confirmation of artifact format, trained team.

### Custom training (per-day rate, $5K–15K/day)

- **"TestNUX for compliance leads" (4-hour workshop, $5K):** what the discipline produces and why, how to read an RTM, how to interpret SCA sections, how to use the auditor portal, what `[VERIFY]` markers mean and why they matter
- **"TestNUX for engineering teams" (full day, $10K):** R-ID origination, status taxonomy, test plan authoring, Playwright evidence capture, the 6-phase pipeline, CI integration, OSCAL emit
- **"Auditor handoff workshop" (2-day, $15K, includes mock audit):** full simulation of the auditor review cycle — running the Zoom, fielding questions, demonstrating the artifact chain, responding to follow-up requests
- Recorded sessions become your internal training library (rights assigned to you)
- Remote delivery standard; on-site available at travel cost

### Quarterly review (4 hours/quarter, $5K/year)

- We review your current SCA, RTM, and UAT artifacts against a standard drift checklist
- We flag: stale attestations (>90 days), missing TC coverage for open requirements, broken HMAC chain entries, status taxonomy violations, `[VERIFY]` markers still unresolved
- We recommend fixes ranked by audit risk
- Output: 1-page quarterly review report in your repo (committed as `requirements/QUARTERLY_REVIEW_<date>.md`)
- Four sessions per year, one per quarter, 30-day scheduling window

### Annual SOC 2 / NYDFS / HIPAA / FedRAMP readiness assessment ($20K–100K)

- 4-week engagement timed to run 6–8 weeks before your scheduled audit
- Week 1: artifact review and gap identification
- Week 2: gap remediation support (we work alongside your team)
- Week 3: auditor pre-brief preparation (we draft the evidence index and the auditor intake package)
- Week 4: final readiness scorecard + handoff to your auditor
- Output: readiness scorecard (control-by-control PASS / PARTIAL / GAP), gap remediation plan, auditor pre-brief document, evidence index
- Pricing range: $20K (SOC 2 Type I, early-stage) to $100K (FedRAMP Moderate, full program)

### Industry-specific advisory (retainer, $5K–15K/month)

- Quarterly strategy calls (1 hour each; your compliance lead + our team)
- Real-time Slack access for compliance questions during your active audit or policy drafting work
- Heads-up on regulatory changes affecting your industry: NYDFS amendments, HIPAA Safe Harbor updates, PCI DSS revisions, sector-specific guidance
- Industry-specific SCA template extensions developed for your engagement (delivered as TestNUX marker files; compatible with OSS CLI)
- Suitable for: fintech (NYDFS 500, PSD2), healthcare (HIPAA / HITECH), defense contractors (CMMC 2.0), financial services (SEC cyber rules, DORA)

### Insurance partnership tier (planned; timeline depends on traction)

- We are in early conversations with Coalition, At-Bay, and Resilience to offer cyber insurance premium discounts to TestNUX users
- Rationale: a well-attested SCA package is actuarially better risk than an undocumented posture — insurers should price that difference
- Exact discount structure depends on underwriter agreements (not yet signed)
- TestNUX customers who opt in will share their SCA attestation summary (not full evidence) with the insurer as part of their application
- This is not yet active; we are listing it here because multiple early conversations have raised it as a buying signal

### Auditor introductions (when relationships develop)

We don't yet have formal partnerships with audit firms. Once we have one or two reference engagements completed, we'll publish which firms have used TestNUX-produced evidence in their assessments. For now, your auditor will read the SCA + OSCAL output without us needing to introduce them — the artifacts are designed to be self-explanatory.

---

## Marketplace and ecosystem (planned v0.5+)

These features are further out than the tier launch. Listed here for enterprise planning cycles that think 12–18 months ahead.

### Industry add-on packs

- Community-contributed bundles for regional or niche frameworks not in the 6 we ship
- Paid bundles for: NHS UK (DSP Toolkit), Australian Privacy Act (APP entities), Singapore PDPA, Canadian PIPEDA, Japan APPI, DORA (EU financial entities)
- Review process: community bundles go through a standards accuracy review before listing
- Pricing: free for community bundles; $500–2,000 one-time for vetted paid bundles

### Auditor partner program

- Audit firms (A-LIGN, Schellman, Coalfire, and others) use TestNUX Premium internally for their own evidence review workflow
- Benefit to firms: native interface for reviewing artifacts instead of PDF review
- Benefit to you: your auditor is already familiar with the tool before your engagement starts
- Reseller margin for certified partners (to be announced)

### Integration partners

- Official integrations with: Vanta, Drata, Secureframe, Hyperproof, ServiceNow GRC, ZenGRC
- Integration means: certified, tested, and maintained by both parties (not a one-way JSON export)
- Certification process for integration partners: documented API, test suite, and versioning commitment

### Solution provider program

- Implementation partners (Big 4, mid-tier advisory, regional GRC consultants) certified to deliver TestNUX onboarding
- Training and certification program (2-day, $5K per practitioner)
- Partner portal: access to pre-release bundles, early access to new industry standards, co-marketing

---

## How to buy / contact

| Tier | Path | Timeline |
|---|---|---|
| Solo / Pro | Self-serve via testnux.dev when launched | Q3 2026 target (once v0.1 validates) |
| Team | Sales-assisted: intro Zoom + 14-day trial | once usage justifies it post-v0.1 |
| Service add-ons | Statement of work; 2-week kickoff | Available now (limited capacity) |

**Contact:** `ccling1998@gmail.com`

**Founder-rate pricing:** First 3 customers in each tier get 50% off year-one pricing in exchange for being the case study and reference customer. This is a genuine trade: we work closely with you, you let us write about the outcome. Contact early — first 3 is first 3.

We're solo-founded. Bandwidth is limited. We respond to every email, but we prioritize conversations with procurement teams that have a real audit coming up.

---

## What is NOT in the premium tier (deliberately)

| What stays free | Why |
|---|---|
| SCA generation | OSS commitment per CEO ceremony D3 — generation stays free |
| RTM generation | Same commitment — the tooling is always free |
| OSCAL emit | Federal interop must remain free; FedRAMP RFC-0024 is a public-interest standard |
| All 6 industry bundles | The bundles we ship are free forever; only NEW custom-built industries are paid (custom dev work) |
| Validate / doctor / demo | Developer workflow commands; never paywalled |
| Data export | All your evidence is exportable as markdown + JSON at any time, from any tier, with no exit fee |
| Telemetry or data harvesting | Zero, ever. We make money from features and human time, not from your compliance data. |
| Local CLI for any v0.1+ feature | The CLI that runs on your machine works for everyone, forever |

---

## Pricing principles

1. **Free forever for the local CLI.** Everything that runs on your machine stays free. Always.
2. **Pay for hosting and workflow.** Hosted runs, the cloud vault, the auditor portal — these cost real infrastructure. You pay for infrastructure, not for the generation capability.
3. **Pay for assurance.** Liability cover, cryptographic notarization, WORM retention — these are financial and legal commitments we make on your behalf. They are priced accordingly.
4. **Pay for human time.** Consulting, training, and advisory are our hours. We price them transparently and don't bundle them into SaaS seats to inflate ARR.
5. **No paywalls on commodity generation features.** SCA generation, RTM generation, OSCAL emit — these are the reason you're here. They're free.
6. **Founder-rate for first 3 in each tier.** We want early customers to succeed, not to pay full price for an unproven product. The trade is honest.
7. **No lock-in.** No auto-renewal traps. No per-seat creep that balloons your invoice. No exit fees. Your data leaves in markdown + JSON whenever you want.

---

## Roadmap

| Target | Tier / feature |
|---|---|
| **Q3 2026 target** | Solo / Pro tier: hosted runs + cloud vault + notifications + hosted demo page |
| **post-validation** | Team tier: multi-tenant + auditor portal + SSO + SCIM + multiple-reviewer attestations |
| **once usage justifies it** | GRC platform push integrations (Vanta, Drata, Secureframe) |
| **once usage justifies it** | Multi-region data residency + compliance content auto-update |
| **once usage justifies it** | Marketplace v1: industry add-on packs + auditor partner program |

Service add-ons (onboarding, training, quarterly review, advisory) are available now in limited capacity via `ccling1998@gmail.com`. These are delivered by the founder directly and do not depend on the SaaS launch.

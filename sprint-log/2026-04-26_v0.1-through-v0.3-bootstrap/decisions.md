# Architectural + Product Decisions — v0.1 → v0.3 bootstrap

Decision journal for the 2026-04-26 bootstrap sprint.
Format: Date / Context / Options / Chosen path / Rationale / Consequences.

---

## D1 — Audit-defensibility thesis (primary positioning)

**Date:** 2026-04-26 ~18:00

**Context:** Two possible positionings for testnux: (a) developer productivity tool
("generate Playwright tests faster"), or (b) compliance evidence tool ("produce artifacts
that survive auditor scrutiny"). The two require different output formats, different
success metrics, and different buyer personas.

**Options considered:**
1. Developer productivity: focus on speed to first test, DX polish, IDE integration
2. Compliance evidence: focus on traceability, sign-off chain, OSCAL export, auditor-readable output

**Chosen path:** Option 2 — compliance evidence / audit-defensibility.

**Rationale:** Compliance buyers are under-served by existing test tooling. A developer
can write Playwright tests without testnux; a compliance officer cannot produce a
hash-chained audit trail without significant bespoke work. The moat is in the regulated
buyer, not the developer.

**Consequences:** Output verbosity prioritised over speed; every command emits
structured artifacts (markdown + JSONL) rather than terminal-only output; MCP server
and gstack skill are secondary to the CLI artifact pipeline.

---

## D2 — HOLD SCOPE on launch plan (v0.1 surface only)

**Date:** 2026-04-26 ~18:10

**Context:** Several surface areas were requested in the CEO ceremony: MCP server, gstack
skill bundle, CI integrations, visual regression, multi-agent batch dispatch. Shipping all
of them in v0.1 would delay launch by weeks.

**Options considered:**
1. Ship all surfaces in v0.1 (fully implemented)
2. Ship CLI only in v0.1; stub v0.2+ surfaces with clear guidance
3. Ship nothing; plan more

**Chosen path:** Option 2 — CLI as primary v0.1 surface; all other surfaces are stubs
with full prompt templates in comments so v0.2 implementation is mechanical.

**Rationale:** The CLI artifact pipeline (init → validate → report → rtm → sca → sign)
is the core value prop and can ship standalone. Stubs with embedded prompt templates
accelerate v0.2 without blocking v0.1 launch.

**Consequences:** Stub commands (`discover`, `plan`, `codify`, `enrich`, `batch-plan`,
`sca oscal`) exit 0 with guidance text in v0.1. Users who run them get a clear
"v0.2 stub — here's the manual equivalent" message.

---

## D3 — OSS tier = local-everything; Paid SaaS tier = ops/compliance wrapper

**Date:** 2026-04-26 ~18:20

**Context:** Need to define the boundary between free OSS and commercial offering without
feature-gating core functionality (which alienates OSS community).

**Options considered:**
1. Freemium: OSS has limited commands; paid unlocks the rest
2. OSS = local + paid = cloud: same commands, different backends
3. OSS = local-everything (zero cloud deps); paid = ops/compliance wrapper (audit dashboard,
   SOC 2 bundle export, liability cover)

**Chosen path:** Option 3.

**Rationale:** Feature-gating creates community resentment and fork risk. The compliance
buyer needs ops infrastructure (dashboards, role-based sign-off, SLA) that an OSS user
does not. The upsell is in the wrapper, not in crippling the core.

**Consequences:** Every command in the OSS CLI must work with `UAT_SECRET` in a local
.env file and no external services. Paid tier adds a hosted audit log and stakeholder
sign-off UI as an overlay, not a replacement.

---

## D4 — OSCAL JSON emitted alongside markdown in v0.2

**Date:** 2026-04-26 ~18:30

**Context:** Security control assessments could be stored as markdown-only (human readable)
or as OSCAL JSON (machine readable, regulatory standard). Both have trade-offs.

**Options considered:**
1. Markdown only — simpler, human-editable, not machine-parseable by compliance toolchains
2. OSCAL JSON only — machine-readable, hard to author manually
3. Markdown primary + OSCAL derived — humans author/edit markdown; OSCAL is generated

**Chosen path:** Option 3.

**Rationale:** Auditors increasingly require OSCAL-compatible evidence for FedRAMP, NIST
RMF, and ISO 27001 submissions. Markdown remains the human interface; `sca oscal` derives
the OSCAL companion. The `src/lib/oscal.mjs` library is real (not a stub) so the v0.2
command wiring is mechanical.

**Consequences:** Every SCA document will have a `v<X.Y>.oscal.json` companion once
`sca oscal` is fully implemented. The `toOSCAL()` function is pure and stateless —
callers own I/O, making testing trivial.

---

## D5 — Standalone CLI only at v0.1 (no MCP server or gstack skill bundle)

**Date:** 2026-04-26 ~18:40

**Context:** MCP server and gstack skill are useful distribution channels but require
separate install flows, dependency management, and onboarding docs that are not ready.

**Options considered:**
1. Ship CLI + MCP server + gstack skill all in v0.1
2. Ship CLI only; MCP and gstack are stubs that exist in the repo but are not announced
3. Do not include stubs at all; build them fresh in v0.2

**Chosen path:** Option 2.

**Rationale:** The MCP server shell exists (integrations/claude-code-mcp/) and the gstack
SKILL.md is present (integrations/gstack/testnux/). Neither is announced in v0.1 docs.
The `mcp` CLI command passes through to the server but is not in the v0.1 getting-started
guide. This lets v0.2 flip a switch rather than build from scratch.

**Consequences:** integrations/ folder exists and is wired but not marketed. `testnux mcp`
works if `@modelcontextprotocol/sdk` is installed separately; the CLI prints clear install
instructions if it is not.

---

## D6 — Repo: StillNotBald/testnux PRIVATE first; flip at v0.1 launch

**Date:** 2026-04-26 ~17:45

**Context:** Building in public invites premature criticism of stubs and incomplete docs.
Building fully private risks losing momentum and external accountability.

**Options considered:**
1. Public repo from day one
2. Private until launch; flip at launch announcement
3. Private permanently

**Chosen path:** Option 2 — private during bootstrap; public at v0.1 announcement.

**Rationale:** A private repo during scaffolding means stub commands and placeholder docs
do not generate bad first impressions. The flip happens with a launch post, not a
"is anyone looking?" soft launch.

**Consequences:** Any collaborators need explicit GitHub access during the private phase.
CONTRIBUTING.md, SECURITY.md, and CODE_OF_CONDUCT content must be polished before flip.

---

## D7 — Apache 2.0 license + TestNUX trademark in NOTICE

**Date:** 2026-04-26 ~17:50

**Context:** License choice affects fork-ability, commercial use, and contributor
expectations. Trademark placement affects brand protection.

**Options considered:**
1. MIT — maximum permissiveness, no trademark protection
2. Apache 2.0 — permissive + patent grant + trademark clause
3. AGPL — copyleft, would deter commercial adoption
4. BSL (Business Source License) — converts to OSS after delay; alienates community

**Chosen path:** Apache 2.0 + explicit trademark notice in NOTICE file.

**Rationale:** Apache 2.0 provides patent protection (important for compliance tooling
where patent trolls are a real risk) and allows commercial use without copyleft. The
NOTICE file carries the "TestNUX" trademark reservation separately from the Apache
grant so it survives downstream redistribution.

**Consequences:** Commercial users can embed testnux without open-sourcing their
own code. The trademark reservation in NOTICE means third parties cannot ship a product
called "TestNUX" without a licence.

---

## D8 — DCO over CLA for contributors

**Date:** 2026-04-26 ~17:55

**Context:** Contribution agreements protect the project's ability to relicense or dual-license.
CLAs require tooling (GitHub App, legal review). DCO is lightweight and enforceable via
commit trailers.

**Options considered:**
1. CLA (Contributor License Agreement) — legal sign-off, heavy tooling
2. DCO (Developer Certificate of Origin) — commit trailer, no tooling, OSS community norm
3. No agreement — maximum contributor friction removed, but relicensing rights unclear

**Chosen path:** DCO. Every commit should carry `Signed-off-by:` trailer.

**Rationale:** The OSS community increasingly prefers DCO over CLA (Linux kernel precedent).
CLA tooling adds onboarding friction that deters casual contributors. Apache 2.0 already
handles patent grants; DCO handles "contributor confirms they have the right to submit."

**Consequences:** CONTRIBUTING.md documents the `git commit -s` convention. No GitHub App
or legal infrastructure required. Relicensing requires broader community agreement rather
than unilateral move (acceptable trade-off at this stage).

---

## D9 — Demo target: existing demo-dashboard (not building widgetly from scratch)

**Date:** 2026-04-26 ~19:00

**Context:** The CEO ceremony mentioned "widgetly" as a possible demo target — a fictional
SaaS product built from scratch to show testnux against. Building widgetly requires
significant additional scope.

**Options considered:**
1. Build widgetly from scratch — maximum narrative control, large scope increase
2. Use an existing demo dashboard (renamed from apple-apex-dashboard) — real but not built for us
3. Use a purely fictional markdown-only scenario — no real app, no browser tests

**Chosen path:** Option 2 — examples/demo-dashboard/ contains output artifacts from
running testnux against an existing dashboard app. No source code for the demo app
is included.

**Rationale:** The demo value is in the testnux output artifacts (HTML report, SCA,
execution log), not in the demo app itself. Shipping a full demo app doubles scope.

**Consequences:** examples/demo-dashboard/ has output/ + screenshots/ only. The README
explains users should point testnux at their own app. No source code from the demo
target is committed (avoids licence entanglement).

---

## D10 — Examples folder: output/ + screenshots/ only (no demo app source)

**Date:** 2026-04-26 ~19:05

**Context:** Including demo app source in the examples/ folder creates licence questions,
maintenance burden, and inflates package size.

**Options considered:**
1. Include full demo app source
2. Include output artifacts only; link to separate demo app repo
3. Include nothing (empty examples folder)

**Chosen path:** Option 2 — output/ has pre-generated artifacts; screenshots/ has a
.gitkeep. README links to external demo app.

**Rationale:** Users learn from reading the output artifacts (HTML report, SCA markdown,
execution log) more than from reading the demo app source. Separation avoids licence mixing.

**Consequences:** examples/demo-dashboard/ is self-contained documentation, not a runnable
app. Any future demo app lives in a separate repo.

---

## D11 — Per-test XFF rate-limit isolation in spec template

**Date:** 2026-04-26 ~19:15 (empirically validated on a separate codebase earlier tonight)

**Context:** Sequential auth tests in a Playwright suite can burn a shared rate-limit bucket.
If test N triggers 6 wrong-password attempts, test N+1 hits 429 within the same 60s window.

**Options considered:**
1. Add `waitForTimeout(60000)` between tests — correct but slow (~10 min for a 10-TC suite)
2. Use a unique `X-Forwarded-For` header per test derived from the test title hash
3. Disable rate limiting in test environment — weakens the test (not testing the real path)

**Chosen path:** Option 2 — `xffForTest(title)` function in spec.ts template derives a
deterministic `10.99.X.Y` IP from the test title hash. The rate-limiter trusts LAST-HOP XFF.

**Rationale:** Validated empirically on a production Playwright suite: each test gets its own IP bucket, reruns
get the same IP (deterministic), no artificial sleeps needed. Requires rate-limiter to
trust last-hop XFF (not first-hop — trivially spoofable by clients).

**Consequences:** spec.ts template ships xffForTest as a first-class helper with a
large explanatory comment. Users inherit this pattern by default.

---

## D12 — Marker convention `<!-- testnux:row begin/end -->` for human-edit survival

**Date:** 2026-04-26 ~19:30

**Context:** The `rtm` and `sca generate` commands regenerate rows in existing markdown
tables. Human-edited notes in those rows must survive regeneration.

**Options considered:**
1. Regenerate the entire file every time — human edits lost
2. Use YAML frontmatter to track human-edited cells — fragile, non-standard
3. Use HTML comment markers `<!-- testnux:row begin -->` / `<!-- testnux:row end -->`
   — human edits inside markers survive; everything outside is regenerated

**Chosen path:** Option 3 — marker convention.

**Rationale:** HTML comments are invisible in rendered markdown, survives copy-paste,
and are trivially parseable. The pattern is inspired by git conflict markers and code-gen
region annotations (e.g. `// @generated` / `// end @generated`).

**Consequences:** Every row written by `rtm` or `sca generate` is wrapped in these
markers. Parser logic in src/lib/parser.mjs extracts and preserves human-edited content
before re-emitting the machine-generated frame.

---

## D13 — [VERIFY] confidence markers on LLM-generated cells

**Date:** 2026-04-26 ~19:40

**Context:** When `sca generate` fills evidence rows using test results, some cells
require LLM inference or human judgment (e.g. "Does this test prove the control is met?").
Silently asserting PASS would be audit fraud risk.

**Options considered:**
1. Leave cells blank — unhelpful; human must fill everything manually
2. Fill cells with a PASS/FAIL assertion — may be wrong; audit liability
3. Fill cells with `[VERIFY]` prefix to mark LLM-inferred content needing human review

**Chosen path:** Option 3 — `[VERIFY]` marker on any cell where the fill is inferential
rather than deterministic.

**Rationale:** Auditors can scan for `[VERIFY]` to find cells needing human sign-off.
The CLI's `validate` command emits a warning when `_review_required: true` + status
is READY or higher, catching plans promoted without clearing [VERIFY] cells.

**Consequences:** SCA outputs shipping with [VERIFY] cells are not audit-ready by default.
The `doctor` command and `validate --strict` surface uncleared markers.

---

## D14 — E-signature: HMAC-SHA256 + hash-chained JSONL (audit-trail, not court-admissible)

**Date:** 2026-04-26 ~20:00

**Context:** Stakeholder sign-off on test passes needs to be tamper-evident and
attributable, but implementing a full PKI or qualified e-signature is out of scope for v0.1.

**Options considered:**
1. No signature — just a markdown note with a name
2. Full PKI / qualified e-signature (DocuSign, Adobe Sign) — expensive, external dep
3. HMAC-SHA256 over the record + hash-chaining the JSONL log

**Chosen path:** Option 3, with an explicit NOTICE in the CLI output and template that
this is "audit-trail signature only — not a court-admissible e-signature."

**Rationale:** HMAC-SHA256 with a shared secret (UAT_SECRET env var) is sufficient to
prove tampering after the fact. Hash-chaining means any modification to a previous record
breaks the chain, which is detectable by `sign --verify`. The explicit disclaimer manages
legal expectations.

**Consequences:** `sign` command requires `UAT_SECRET` in the environment. The `uat-log.jsonl`
format is append-only; each record carries the HMAC of the previous record's hash.
The compliance buyer gets tamper-evidence; the legal team knows not to use this as the
sole evidence in litigation.

---

## D15 — Industry standards as JSON config (not code) — easy contributor extension

**Date:** 2026-04-26 ~20:10

**Context:** TestNUX ships with 6 industry bundles (general, fintech, healthcare, gov,
edu, ecommerce). New industries should be addable by contributors without touching core code.

**Options considered:**
1. Hard-code standards in JavaScript — fast to implement, hard to contribute to
2. JSON config files in src/config/industry-standards/ — loaded at runtime, fully declarative
3. External plugin system — maximum flexibility, large implementation cost

**Chosen path:** Option 2 — JSON config files. Each bundle is a standalone JSON document
with a $schema reference, making it self-validating and editor-autocomplete-friendly.

**Rationale:** A contributor adding a new industry (e.g. "insurance") only needs to add
one JSON file following the existing schema. No JavaScript knowledge required. The schema
at schemas/industry-standards.schema.json (if added) can lint contributions in CI.

**Consequences:** All 6 shipped bundles follow the same structure. The `--industry` flag
on `init` and `sca init` resolves to a file in this directory. Custom industries can be
added without forking.

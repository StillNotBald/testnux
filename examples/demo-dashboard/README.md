# Sample output: TestNUX run against Demo Dashboard

This folder shows what TestNUX **PRODUCES** when run against a real codebase (demo-dashboard, a public Next.js admin app). The source code being tested is NOT in this repo — only the outputs. To reproduce, fork demo-dashboard separately and run `testnux init demo-dashboard-login --industry general` against it.

> **These outputs are real `testnux` artifacts generated against the demo-dashboard project, not handcrafted samples.**  
> The HTML report (`output/login-execution-report.html`) and XLSX were produced by running `testnux report` against a live Playwright test pass on 2026-04-27.  
> To regenerate: see [`output/real-run/REGENERATE.md`](output/real-run/REGENERATE.md)

---

## What is in this folder?

| Artifact | Path | What it demonstrates |
|----------|------|---------------------|
| Test plan | `output/login-test-plan.md` | 15 fully populated TCs (LOGIN-01..LOGIN-15) with Given/When/Then, P1/P2/P3 priority distribution, OWASP ASVS + WCAG 2.2 AA standards alignment, and BLOCKED-CONFIG status usage for unimplemented MFA surfaces |
| HTML report | `output/login-execution-report.html` | Self-contained execution report: tabbed view (Pass / Fail / Blocked / Skipped), per-TC cards with embedded screenshots, standards-alignment table, TOC with anchor links |
| SCA | `output/login-sca-v0.1.md` | Complete 8-section Security Control Assessment: executive summary, per-control inventory, threat coverage, declined-by-design documentation, open items, and sign-off table |
| Screenshots | `screenshots/` | Per-TC Playwright `afterEach` evidence screenshots (populated when you run the spec) |
| UAT sign-off log | `output/uat-log.jsonl` | HMAC-SHA256 hash-chained sign-off log (machine-readable; tamper-evident) |
| UAT sign-off ledger | `output/uat-sign-off.md` | Human-readable rendered version of the sign-off ledger produced by `testnux sign --verify` |

---

## How to reproduce this output

### Prerequisites

Clone demo-dashboard into a sibling directory and start it:

```bash
git clone https://github.com/testnux-oss/demo-dashboard.git
cd demo-dashboard
npm install
npm run build
npm start          # starts on http://localhost:3737 by default
```

Keep the server running. Open a second terminal for TestNUX commands.

### Init a new test pass

```bash
# From the testnux directory:
testnux init demo-dashboard-login --industry general --target-url http://localhost:3737/login
```

This scaffolds:

```
testing-log/
  <date>_demo-dashboard-login/
    test-plan.md
    execution-log.md
    spec.ts
    standards.json
    evidence/
```

### Use the reference test plan

Copy the reference plan from this examples folder instead of filling in a blank one:

```bash
cp examples/demo-dashboard/output/login-test-plan.md \
   testing-log/<date>_demo-dashboard-login/test-plan.md
```

### Run the Playwright spec

```bash
npx playwright test testing-log/<date>_demo-dashboard-login/spec.ts
```

Screenshots land in `testing-log/<date>_demo-dashboard-login/evidence/`.

### Generate the report

```bash
testnux report demo-dashboard-login
```

The generated HTML and XLSX open automatically in your browser.

---

## Patterns demonstrated in these artifacts

| Pattern | Where |
|---------|-------|
| TC ID format and zero-padding | LOGIN-01..LOGIN-15 |
| P1/P2/P3 priority distribution | `login-test-plan.md` — TC matrix |
| Given / When / Then for auth flows | All 15 TCs |
| OWASP ASVS control mapping | Standards-alignment table |
| WCAG 2.2 AA control mapping | Standards-alignment table |
| BLOCKED-CONFIG status usage | LOGIN-13 (TOTP), LOGIN-14 (WebAuthn) |
| Rate-limit test placement | LOGIN-15 at end of file (`// @rate-limit-test`) |
| `[VERIFY]` confidence markers | SCA Per-Control Inventory, 3+ cells |
| 8-section SCA structure | `login-sca-v0.1.md` |
| Declined-by-Design documentation | SCA Section 6 |
| Hash-chained UAT sign-off log | `uat-log.jsonl` (schema sentinel + 5 entries) |
| Human-readable sign-off ledger | `uat-sign-off.md` (summary table + per-entry detail + tamper-evidence notes) |
| `needs-rework` sign-off status | LOGIN-13 entry — TOTP backend not wired |

### Production lessons baked in

These patterns come from real-world first-pass experience and are baked into the templates:

- **`form.requestSubmit()` not `button.click()`** — avoids React hydration races on form submits
- **Rate-limit tests last** — LOGIN-15 (6 wrong-password attempts) is the last test in the spec so it does not exhaust the rate-limit bucket for subsequent tests
- **Production build required** — tests run against `npm run build && npm start`, not `npm run dev`
- **Inline `captureEvidence` for custom contexts** — any TC that opens its own browser context calls `captureEvidence(page, tcId)` inline before closing the context
- **`PLAN ONLY` mode** — run `testnux report demo-dashboard-login --plan-only` before execution to give stakeholders a pre-review XLSX

---

Want to use TestNUX on YOUR codebase? → see [docs/getting-started.md](../../docs/getting-started.md)

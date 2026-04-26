# Getting Started

**Time to first report: ~60 seconds with `demo`, ~20 minutes with your own repo.**

---

## Prerequisites

- Node.js 20 or later (`node --version`)
- Playwright browsers (installed by TestNUX on first use)
- A terminal

---

## Step 1 — Install

```bash
npm install -g testnux
testnux --version    # verify
```

Expected output:

```
0.1.0
```

That's it. The package is on npm — `npm install -g testnux` works on any machine with Node 20+.

**Alternative — install from GitHub** (for unreleased commits / contributors):

```bash
npm install -g github:StillNotBald/testnux
```

**Alternative — clone for development:**

```bash
git clone https://github.com/StillNotBald/testnux.git
cd testnux && npm install && npm link
```

---

## Step 2 — Preflight check

```bash
testnux doctor
```

Expected output:

```
testnux doctor v0.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔  Node 20.x detected
✔  Playwright chromium installed
✔  No CLAUDE_API_KEY required for v0.1 core
✔  No git hooks conflicting
✔  Template directory intact

All checks passed. You're ready to go.
```

If anything is red, `doctor` prints the exact fix command. Address warnings before continuing.

---

## Step 3 — See the "aha" moment in 60 seconds

Before touching your own repo, run the bundled demo:

```bash
testnux demo
```

Expected output:

```
testnux demo v0.1.0
Downloading demo fixture... done (1.2 MB)
Running demo-dashboard test pass...
  ✔ LOGIN-01  Valid credentials — PASS
  ✔ LOGIN-02  Empty email — PASS
  ✔ LOGIN-03  Empty password — PASS
  ...
  ✔ LOGIN-15  Forgot-password link — PASS

Generated:
  demo-dashboard-test-plan.xlsx
  demo-dashboard-execution-report.html

Opening report in browser... done
Cleaning up fixture... done
```

You will see a self-contained HTML report with embedded screenshots, a standards-alignment table (OWASP ASVS + WCAG 2.2 AA), and a XLSX with Pass/Fail colour coding. That is the complete output TestNUX produces for every page.

---

## Step 4 — Scaffold your first test pass

Navigate to your repo root, then:

```bash
cd path/to/your/repo
testnux init my-first-pass --industry general
```

Expected output:

```
testnux init v0.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scaffolding test pass: my-first-pass
  Industry: general (OWASP ASVS + WCAG 2.2 AA)

Created:
  testing-log/my-first-pass/test-plan.md
  testing-log/my-first-pass/execution-log.md
  testing-log/my-first-pass/spec.ts
  testing-log/my-first-pass/standards.json  ← industry config
  testing-log/my-first-pass/evidence/       ← Playwright writes screenshots here

Next steps:
  1. Edit testing-log/my-first-pass/test-plan.md (~5 min)
  2. Write testing-log/my-first-pass/spec.ts using the template pattern
  3. Run your spec: npx playwright test testing-log/my-first-pass/spec.ts
  4. Generate the report: testnux report my-first-pass
```

---

## Step 5 — Fill in the test plan

Open `testing-log/my-first-pass/test-plan.md`. The scaffold contains:

- A YAML frontmatter block (slug, industry, date, coverage summary)
- A TC matrix table (TC-ID / Title / Priority / Given / When / Then / Standards)
- A placeholders section for the standards-alignment table

**Minimum to fill in (5 minutes):**

1. Set `slug`, `target_url`, and `date` in the frontmatter
2. Replace the placeholder TC rows with your actual test cases
3. Give each TC a `TC-ID` matching your prefix (e.g. `LOGIN-01`)

The template includes comments explaining each field. See [concepts.md](concepts.md) for the full vocabulary.

---

## Step 6 — Write the Playwright spec

Open `testing-log/my-first-pass/spec.ts`. The scaffold includes:

- The `captureEvidence(page, tcId)` helper — call this inside each test so screenshots land in `evidence/`
- The `waitForNextTotpWindow(secret)` helper — use for MFA tests to avoid code-window collisions
- An example test with proper `form.requestSubmit()` pattern (safer than `button.click()` for React forms)
- A `// @rate-limit-test` annotation comment — rate-limit / lockout tests go at the bottom of the file

**Critical:** run tests against a production build, not the dev server:

```bash
npm run build && npm start &   # start prod server
npx playwright test testing-log/my-first-pass/spec.ts
```

Running against `npm run dev` causes hydration races that break form submits.

---

## Step 7 — Generate the report

```bash
testnux report my-first-pass
```

Expected output:

```
testnux report v0.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reading: testing-log/my-first-pass/test-plan.md
Reading: testing-log/my-first-pass/execution-log.md
Reading: testing-log/my-first-pass/evidence/ (8 screenshots)

Generated:
  testing-log/my-first-pass/my-first-pass-test-plan.xlsx
  testing-log/my-first-pass/my-first-pass-execution-report.html

Summary: 8 PASS · 1 FAIL · 0 SKIP · 0 BLOCKED
Opening report in browser...
```

The HTML report is self-contained — one file, no external dependencies. Email it to a stakeholder or commit it to the repo.

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
| `2` | No test plan found in folder |
| `3` | Test-plan parse error (run `validate` first) |
| `4` | Render failed (check `--json` output for details) |

---

## What's in the report

| Section | Content |
|---------|---------|
| Summary tab | Pass/Fail/Skip/Blocked counts, execution date, target URL |
| All TCs tab | Every TC card with status badge and embedded screenshot |
| Standards tab | OWASP ASVS and WCAG 2.2 AA alignment table |
| Traceability tab | R-XX → TC-XX → Result matrix rows |

---

## Next steps

- **Understand the vocabulary** — read [concepts.md](concepts.md) before writing more than one test plan
- **See a fully worked example** — the demo-dashboard login test plan at [examples/demo-dashboard/output/login-test-plan.md](../examples/demo-dashboard/output/login-test-plan.md) shows 15 real TCs with G/W/T and standards alignment
- **See what a finished SCA looks like** — [examples/demo-dashboard/output/login-sca-v0.1.md](../examples/demo-dashboard/output/login-sca-v0.1.md) is the public reference artifact
- **CLI reference** — [reference.md](reference.md) for full flag tables and exit codes
- **Architecture** — [architecture/data-model.md](architecture/data-model.md) if you want to understand the data model before extending TestNUX

---

## What's next: the 4 must-do adoption tasks

The CLI works. Getting consistent outcomes requires the discipline and the auditor conversation.

See **[docs/adoption-checklist.md](adoption-checklist.md)** for the 4 must-do adoption tasks — originating your R-IDs, adopting the status labeling discipline, setting up UAT_SECRET, and validating your SCA shape with an auditor. Each task has a time estimate, exit criteria, and common mistakes. If you skip any of them, the CLI produces well-formatted artifacts that still have the same consistency problems you had before.

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

## First 15 minutes — pick your depth

Three tiers, each builds on the last. Stop wherever the value stops compounding for you.

### 60 seconds — see what you get

```
npx testnux demo
```

Opens a sample execution report in your browser. This is the artifact `testnux report` produces. If this looks like the kind of evidence you want, continue.

### 5 minutes — scaffold your first test pass

```
testnux init my-page
```

Creates `testing-log/2026-04-27_my-page/` with:
- `test-plan.md` — TC matrix template you fill in
- `spec.ts` — Playwright spec template
- `evidence/` — folder for screenshots from your tests
- `README.md` — what each file is for

Look at the folder, read the templates. You should now understand the shape: one folder per page-test-pass, three artifacts per folder, traceability via R-IDs in the frontmatter.

### 15 minutes — generate your first real report

1. Edit `testing-log/2026-04-27_my-page/test-plan.md` — fill in 3-5 TCs from the template
2. Edit `spec.ts` — write the Playwright assertions to match each TC (the template has the patterns: `form.requestSubmit`, XFF header, evidence afterEach hook)
3. Run the spec: `npx playwright test testing-log/2026-04-27_my-page/spec.ts`
4. Generate the report: `testnux report testing-log/2026-04-27_my-page`
5. Open the generated `.html` — it's a self-contained file you can email to an auditor

You now have the full loop. From here, scale: more pages, more TCs, `testnux rtm` for traceability across all pages, `testnux sign` for sign-off ledger, `testnux sca` for control assessments.

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

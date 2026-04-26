# How to regenerate the real-run artifacts

This folder contains a real TestNUX test pass against demo-dashboard's `/login` page.
Follow these steps to reproduce the full output from scratch.

## Prerequisites

1. **Node.js 20+** and **npm** installed
2. **demo-dashboard** cloned at a known path (e.g. `C:\Users\Chu Ling\Desktop\demo-dashboard\`)
3. **testnux** repo at a known path (e.g. `C:\Users\Chu Ling\Desktop\Projects\testnux\`)
4. Playwright Chromium browser installed:
   ```bash
   cd "C:\Users\Chu Ling\Desktop\demo-dashboard"
   npx playwright install chromium
   ```

## Steps

### 1 — Start demo-dashboard dev server

Open a terminal and keep it running:

```bash
cd "C:\Users\Chu Ling\Desktop\demo-dashboard"
npm install          # if first time
npm run dev          # starts on http://localhost:3737
```

Wait until you see `✓ Ready on http://localhost:3737` in the terminal output.

### 2 — Run the Playwright spec

Open a second terminal:

```bash
cd "C:\Users\Chu Ling\Desktop\Projects\testnux\examples\demo-dashboard\output\real-run"
npx playwright test --config=playwright.config.ts --reporter=list
```

Expected output: **13 passed, 2 skipped** (LOGIN-13 and LOGIN-14 are BLOCKED-CONFIG).

Screenshots land in `evidence/LOGIN-01.png` through `evidence/LOGIN-15.png`
(except LOGIN-13 and LOGIN-14 which are skipped).

The spec also auto-writes `execution-log-auto.md` alongside itself.

### 3 — Generate the report

```bash
cd "C:\Users\Chu Ling\Desktop\Projects\testnux"
node bin/testnux.mjs report examples/demo-dashboard/output/real-run
```

This produces:
- `real-run/real-run-execution-report.html` — self-contained HTML report (~2 MB with embedded screenshots)
- `real-run/real-run-test-plan.xlsx` — TC matrix spreadsheet

### 4 — Promote the report to the examples output

```bash
cp examples/demo-dashboard/output/real-run/real-run-execution-report.html \
   examples/demo-dashboard/output/login-execution-report.html
```

### 5 — Stop the dev server

Go back to the first terminal and press `Ctrl+C`.

---

## Running against the prod build (recommended for CI)

The dev server has a hydration race that can cause form submits to behave differently.
For CI-accurate results, run against the production build:

```bash
cd "C:\Users\Chu Ling\Desktop\demo-dashboard"
npm run build
npm start           # starts on http://localhost:3737 (same port)
```

Then follow steps 2–4 above. Expected result: all 13 runnable TCs PASS,
LOGIN-11 title now reads "Sign In — Apex Dashboard" (prod build deduplicates `<title>`).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Error: connect ECONNREFUSED 127.0.0.1:3737` | Dev server not running — go back to Step 1 |
| `ReferenceError: __dirname is not defined` | testnux is ESM; spec uses `import.meta.url` shim — ensure Node 20+ |
| Screenshots blank | Playwright ran before page hydrated — add `await page.waitForLoadState('networkidle')` |
| `testnux report` produces PLAN ONLY mode | `execution-log-auto.md` missing — re-run the Playwright spec first |

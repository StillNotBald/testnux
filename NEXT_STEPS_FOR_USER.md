# v0.2.0-alpha.1 shipped — manual steps for you

**Date:** 2026-04-27
**What ran overnight:** the 22-item v0.2.0-alpha autonomous playbook (4 waves of multi-agent dispatch).

## TL;DR

- **Code:** shipped. 365/365 tests pass. 0 lint errors. 0 FirstLeap leaks.
- **Git:** pushed direct to `main`. Commits visible in `git log --oneline -10`.
- **GitHub release:** `v0.2.0-alpha.1` tagged, marked **pre-release** (so v0.1.1 stays "Latest"). Tarball attached.
- **npm:** **NOT published.** That's your job (needs OTP — see step 2 below).

## What you need to do

### 1. Verify the work landed

```bash
cd "C:/Users/Chu Ling/Desktop/Projects/testnux"
git log --oneline -10           # should see ~5 new commits dated 2026-04-27
git status                       # should be clean
npm test                         # should report 365 passed
node bin/testnux.mjs --version   # should print 0.2.0-alpha.1
```

GitHub release page: <https://github.com/StillNotBald/testnux/releases/tag/v0.2.0-alpha.1>

### 2. Publish to npm (when you're ready)

```bash
cd "C:/Users/Chu Ling/Desktop/Projects/testnux"
npm publish --tag alpha --otp=<6-digit-code-from-authenticator-or-recovery>
```

Notes:
- `--tag alpha` is critical. Without it, npm would tag `0.2.0-alpha.1` as `latest` and break users who installed `testnux` expecting the stable v0.1.1.
- After publish: `npm view testnux@alpha version` should return `0.2.0-alpha.1`.
- `npm view testnux version` should still return `0.1.1` (the stable latest).
- Smoke test: `npm install -g testnux@alpha && testnux --version`.

### 3. Manual smoke test before announcing (recommended)

```bash
# Install the alpha somewhere clean
mkdir /tmp/testnux-smoke && cd /tmp/testnux-smoke
npm install testnux@alpha
npx testnux --version   # 0.2.0-alpha.1
npx testnux demo        # opens sample report in browser
npx testnux init my-page
ls testing-log/         # should have 2026-04-27_my-page/
```

If anything looks broken, the alpha tag means you can fix and republish (`0.2.0-alpha.2`) without affecting `latest`.

### 4. Roll forward to 0.2.0 stable when ready

When the LLM agents have soaked through ~10+ real customer pages and the eval-harness scores stay green:

```bash
# bump to stable
npm version 0.2.0
git push origin main --follow-tags
gh release create v0.2.0 --title "v0.2.0" --notes-file CHANGELOG.md --latest
npm publish --otp=<code>   # NO --tag alpha → becomes "latest"
```

That moves the `latest` tag from v0.1.1 → v0.2.0.

## What's in v0.2.0-alpha.1

See **CHANGELOG.md** for the full breakdown. Highlights:

- **LLM agents wired up:** `plan`, `codify`, `enrich` (3-pass), `batch-plan` — all real Claude API
- **`testnux report` is no longer a stub** — it's the headline command, ports the proven generator (XLSX + self-contained HTML, embedded screenshots, standards alignment matrix, threat coverage)
- **Signoff suite:** `sign pdf`, `sign stale-check`, multi-reviewer N-of-M, OSCAL assessment-log, optional `--justify-with-llm`
- **Per-env testing:** `testnux run <slug> --env staging`, `testnux compare <slug> staging prod`
- **Visual regression:** `testnux visual baseline`, `testnux visual compare` (pixelmatch-based)
- **Eval harness** at `test/eval/` — 3 fixtures (easy/medium/hard), goldens, scoring, mock-mode for CI
- **Real demo dogfood:** `examples/demo-dashboard/output/login-execution-report.html` is now a genuine 2.29MB testnux output (replaced the 70KB hand-crafted mock). 13 PASS / 2 BLOCKED-CONFIG out of 15 TCs. See `examples/demo-dashboard/output/real-run/REGENERATE.md` for repro.
- **Adoption polish:** README, concepts.md (story-style rewrite), getting-started.md (60s/5m/15m tiers)

## What's NOT in v0.2.0-alpha.1

- npm publish (that's step 2 above — you do this)
- README screenshot (puppeteer-core not installed; ASCII fallback used. To add: `npx puppeteer-screenshot examples/demo-dashboard/output/login-execution-report.html docs/img/demo-report-screenshot.png` then swap the ASCII block for an `![image]()` embed)

## Real findings from the demo run

The P2 wave found two genuine accessibility issues in demo-dashboard's login page (these are demo-dashboard's problems, not testnux's — file in their repo):

- **F-01 (WCAG 2.4.2)**: duplicate `<title>` tags in `<head>` — root layout's title shadows page title in dev mode. Verify against prod build.
- **F-02 (WCAG 1.3.1 / 2.4.6)**: `CardTitle` from `@dashboardpack/core` renders as `<div>` not `<h1>`/`<h2>`. No programmatic heading on the login page. Fix: add `headingLevel` prop to `CardTitle`.

## If anything went wrong overnight

Look in `WAVE3_P2_BLOCKER.md` (only exists if Wave 3 P2 hit a blocker — if not present, P2 went clean).

`git log --oneline -15` shows what shipped; if you want to back out, each wave was a separate commit so you can `git revert` granularly.

---

**Quota note:** This run used the multi-agent dispatch pattern — Opus 4.7 orchestrator + 7 parallel Sonnet subagents in Wave 1, 5 in Wave 2, 3 in Wave 3. Per the `docs/costs.md` empirical estimate, expect ~1-2 hours of Claude Max 5x quota consumed by this run.

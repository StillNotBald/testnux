# Prerequisites & Setup Guide

Everything you need to run Testing Hub — from the bare minimum to the full-power stack.

---

## Required (v0.1 minimum)

These are the only hard requirements to run `testing-hub report` and produce audit artifacts.

| Requirement | Version | Why |
|---|---|---|
| Node.js | 20 LTS or higher | CLI runtime |
| npm | 10 or higher | Package resolution |
| A git repo | any | Three-track discipline requires version control |

**Three-track discipline** — Testing Hub expects your repo to have (or be willing to adopt) this structure:

```
requirements/        ← what you said you'd build
sprint-log/          ← what was built
testing-log/         ← what was tested
```

If your repo doesn't have this yet, `npx testing-hub init` will scaffold it. You don't need it pre-existing.

---

## Recommended (unlocks the full product)

These are optional for v0.1 but required or strongly recommended for v0.2 LLM agents and the full workflow.

### Claude Max plan

**URL:** https://claude.ai/pricing  
**Cost:** ~$200/month  
**Required for:** v0.2 LLM agents (discover, plan, codify, enrich, batch)

The v0.2 agents use Claude as the reasoning engine. Without a Claude API token or Claude Max subscription, the AI-acceleration phases (PLAN, CODIFY, DISCOVER, DOC) do not run. The deterministic core (`testing-hub report`) works without Claude — but you'll be authoring test plans and Playwright specs by hand.

If you're using Claude Max, you get API access through the Claude interface. If you want pay-per-use with no rate limits, use an Anthropic API key instead (see [docs/costs.md](costs.md)).

### gstack

**URL:** https://github.com/garrytan/gstack  
**Cost:** Free (OSS)  
**Required for:** `/browse`, `/qa`, `/design-review`, multi-agent dispatch

gstack is the OSS solo-builder framework by Garry Tan that Testing Hub's discipline derives from. The three-track structure, slash-command pattern, multi-agent dispatch workflow, and marker-comment audit trail all originate in gstack. Install it to unlock the `/browse` headless browser, `/qa` automated QA pipeline, and the full agent-dispatch workflow.

Testing Hub works without gstack — but the recommended working pattern (agent dispatch → merge → validate → report) assumes gstack is available. See [docs/credit.md](credit.md) for full attribution.

```bash
# Install gstack (follow the repo README for the current install path)
# https://github.com/garrytan/gstack
```

### claude-in-chrome MCP

**What it is:** An MCP server that gives Claude control of your real Chrome browser — with your existing logged-in session (cookies, auth tokens, all of it).

**Required for:** Testing authenticated flows (login-gated pages, session state, role-based access)

**How it works:** Runs locally. Claude connects to your real Chrome profile, not a clean Playwright instance. This means it can test pages that require real login without you managing session tokens in test code.

**Install:** Follow the setup guide in your Claude Desktop / Claude Code MCP settings. The server runs locally and never sends your session data anywhere.

### Playwright

**Auto-installed via:**
```bash
npx playwright install
```

Playwright is the evidence-capture engine. Testing Hub's `afterEach` hook uses it to take per-TC screenshots that become the proof-of-execution embedded in your HTML reports. You don't need to install it manually — `npx playwright install` handles it.

---

## Optional (extended capabilities)

### Visual regression (v0.3+)

- **Pixelmatch** + **Sharp** — pixel-diff comparison between baseline and current screenshots. Used by the `--visual-regression` flag in v0.3. Install separately when v0.3 ships.

### PDF generation

Two options — either works:

- **Pandoc** — lightweight, document-quality PDF from markdown. Install from https://pandoc.org.
- **Headless Chromium** — already present if Playwright is installed. Testing Hub can use it to print-to-PDF from the HTML report.

The `testing-hub doctor --check pdf` command will tell you which is available.

### Extended OSCAL validation (v0.2+)

- **IBM Trestle** (Python package) — validates OSCAL JSON output against the full NIST OSCAL schema. Required only if you're emitting OSCAL for FedRAMP RFC-0024 compliance. Install with `pip install trestle`.

---

## Permissions overview

| Tool | What it can access | When it's used |
|---|---|---|
| claude-in-chrome MCP | Your real Chrome: tabs, cookies, DOM, navigation | Testing authenticated / logged-in flows |
| gstack `/browse` | Isolated Playwright Chromium (clean profile, no your cookies) | QA pipelines, design audits, headless screenshots |
| Testing Hub CLI | Your local filesystem (repo only) | Scaffolding, report generation, validation |

**Hybrid policy (recommended):** Use claude-in-chrome for anything that requires a real login. Use gstack `/browse` for everything else. The two are complementary — `/browse` keeps session isolation; claude-in-chrome preserves your real auth state. Never use `/browse` where you need real cookies; never use chrome-mcp where you want a clean profile.

---

## Quick install (60 seconds)

```bash
# 1. Verify Node + npm
node --version   # must be 20+
npm --version    # must be 10+

# 2. Install Playwright browsers
npx playwright install

# 3. Run Testing Hub's preflight check
npx testing-hub doctor

# 4. Scaffold your first test pass
npx testing-hub init my-first-page --industry general

# 5. (Optional) Run the bundled demo to verify output generation
npx testing-hub demo
```

No global install required — everything runs via `npx`. If you want the `testing-hub` command available globally:

```bash
npm install -g testing-hub
```

---

## Verifying your setup

The `testing-hub doctor` command checks your environment and reports what's missing:

```bash
# Full preflight check
npx testing-hub doctor

# Check Claude API / Claude Max access only
npx testing-hub doctor --check claude

# Check gstack installation only
npx testing-hub doctor --check gstack

# Check claude-in-chrome MCP availability
npx testing-hub doctor --check chrome-mcp

# Check PDF generation capability
npx testing-hub doctor --check pdf
```

A green `doctor` output means you're ready to run `testing-hub report`. Yellow warnings are optional capabilities. Red errors block core functionality.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | v0.2 agents only | Your Anthropic API key (alternative to Claude Max session) |
| `TESTING_HUB_INDUSTRY` | No | Default industry preset (`general`, `fintech`, `healthcare`) |

Set `ANTHROPIC_API_KEY` if you're using pay-per-use API access instead of Claude Max. If you're using Claude Max through the Claude interface with gstack, no env var is needed.

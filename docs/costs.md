# Costs

An honest breakdown of what Testing Hub costs to run.

---

## Testing Hub CLI: free

Testing Hub is Apache 2.0 open-source software. The CLI has:

- No license fee
- No telemetry
- No SaaS dependency
- No vendor lock-in

It runs entirely on your local machine. Output lives in your repo. Nothing is sent to any external service by the CLI itself.

---

## Claude API cost (v0.2 LLM agents)

The v0.1 core (`testing-hub report`, `validate`, `init`, `demo`) has **zero API cost**. It's deterministic — markdown in, HTML + XLSX out.

The v0.2 LLM agents (discover, plan, codify, enrich, batch) call Claude's API. Here's an honest per-page estimate using Sonnet-class models:

| Agent phase | Approx tokens | Estimated cost |
|---|---|---|
| DISCOVER | ~5K in + 3K out | ~$0.04 |
| PLAN | ~8K in + 5K out | ~$0.07 |
| CODIFY | ~10K in + 7K out | ~$0.10 |
| ENRICH | ~3 passes combined | ~$0.15 |
| **Total per page** | | **$0.30 – $0.50** |

**Real-world estimates:**

| Scope | Estimated API cost |
|---|---|
| 1 page, full AI pass | $0.30 – $0.50 |
| 10-page site, full AI pass | $3 – $5 |
| 30-page site, full AI pass | $10 – $20 |
| 30-page site with enrich reruns | $20 – $40 |

These are estimates with Sonnet-class models. Opus-class models cost ~3x more per token but produce higher-quality plan drafts — worth it for complex pages, not for boilerplate.

---

## Claude Max session-burn rate (THE key metric)

If you're using Claude Max (~$200/mo) instead of pay-per-use API, cost shows up as **rate limit consumption**, not dollars per call.

**The critical number: heavy multi-agent dispatch (8 parallel agents) can burn approximately 5 sessions of Claude Max quota in a single hour.**

What that means in practice:

| Dispatch pattern | Quota consumed per hour |
|---|---|
| 1 agent at a time, sequential | ~0.5 sessions/hr |
| 4 parallel agents | ~2.5 sessions/hr |
| 8 parallel agents (full dispatch) | ~5 sessions/hr |

**Claude Max rate limit resets approximately every 5 hours.** After hitting the limit:

1. **Wait** — 5-hour cooldown and resume
2. **Upgrade tier** — higher Claude Max tier has larger quota
3. **Switch to pay-per-use** — Anthropic API keys have no rate limit, only a dollar cap you set

**Recommended working pattern:**

- Schedule heavy multi-agent dispatch (full-site codify runs, batch plan generation) at the start of a session when quota is fresh
- Use `--max-spend <dollars>` on `batch-plan` to cap runaway costs before they happen
- Spread 30-page site passes across multiple sessions/days rather than one marathon run
- Use sequential mode (`--sequential`) for exploratory work to preserve quota for production runs

---

## gstack: free

gstack (https://github.com/garrytan/gstack) is OSS with no cost. There is no commercial gstack license required to use Testing Hub.

---

## MCP servers: free

Both MCP servers are free and run locally:

- **claude-in-chrome MCP** — runs in your local browser. No cost.
- **testing-hub-mcp** (planned v0.3) — local MCP server. No cost.

---

## Hosted SaaS layer (planned v0.4+)

A hosted SaaS tier is planned for v0.4 and beyond. It will be a paid tier with pricing determined after OSS validation is complete.

**The OSS CLI remains free and fully functional regardless of SaaS tier.** This commitment was made at the project's founding and is documented in the LICENSE and NOTICE files. The hosted layer adds convenience (shared artifact storage, team dashboards, managed evidence hosting) — it does not gate any current functionality.

---

## Cost comparison: AI-accelerated vs manual

The question isn't "is AI-accelerated testing free?" — it's "what's the alternative?"

| Method | Time per page | Direct cost |
|---|---|---|
| Fully manual (no AI) | 4–8 hours | $0 API, ~$200–800 labor |
| Testing Hub v0.1 (no AI) | 1–2 hours | $0 |
| Testing Hub v0.2 (AI agents) | 15–30 min | $0.30 – $0.50 API |

At $0.50/page and 30 pages, you're spending $15 in API costs to save 60–180 hours of manual work. For regulated environments where evidence packages are mandatory, that math is straightforward.

---

## Summary

| Cost item | Amount |
|---|---|
| Testing Hub CLI | Free |
| Playwright | Free |
| gstack | Free |
| claude-in-chrome MCP | Free |
| Claude API (v0.2 agents) | $0.30 – $0.50 per page |
| Claude Max quota burn | ~5 sessions/hr at full 8-agent dispatch |
| Hosted SaaS (v0.4+) | TBD, OSS always free |

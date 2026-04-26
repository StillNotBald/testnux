# Integrations

---

## v0.1 — Standalone CLI

TestNUX v0.1 is a standalone Node.js CLI. It has no runtime dependencies on Claude Code, gstack, or any AI service for its core `init`, `report`, `validate`, `demo`, and `doctor` commands.

**Install:**

```bash
npm install -g testnux@next
# or without global install:
npx testnux <command>
```

**Requirements:** Node.js 20+, Playwright chromium (auto-installed on first `demo` or `doctor --fix`).

No API keys. No SaaS registration. No network calls during `report` or `validate`. Output lives in your repo.

---

## Roadmap

### v0.2 — LLM acceleration (optional)

v0.2 adds LLM-powered commands (`plan`, `codify`, `discover`, `enrich`, `rtm`, `sca generate`). These are opt-in and require a `CLAUDE_API_KEY` environment variable.

The v0.1 deterministic core (`init`, `report`, `validate`, `demo`, `doctor`) remains fully functional without any API key.

LLM integration details:

- Model: configurable via `--model` flag; default is a cost/speed-balanced Sonnet-class model for mechanical tasks, Opus-class for reasoning tasks (see `docs/v0.2-llm-agents.md`)
- All LLM-generated cells render with `[VERIFY]` markers until human-attested
- `--dry-run` flag prints planned LLM calls and estimated cost before executing
- `--max-spend <USD>` aborts if estimated cost exceeds the threshold

### v0.3 — gstack skill bundle

v0.3 ships `/testnux` as a first-class gstack skill. The skill wraps the standalone CLI and adds:

- Browser-coupled discovery (`testnux discover` via `claude-in-chrome` MCP)
- Multi-agent batch plan generation (`testnux batch-plan`)
- Design-review and QA enrichment loops

The standalone CLI remains the primary distribution path. gstack is an optional integration for teams already using gstack.

Install (once gstack integration ships):

```
/testnux init login --industry general
/testnux report login
```

### v0.3 — MCP server for Claude Code

v0.3 also ships an MCP (Model Context Protocol) server that exposes TestNUX as a tool in Claude Code. This enables inline test-plan generation, report access, and RTM queries without leaving the editor.

Server entry point: `integrations/claude-code-mcp/server.mjs`

Usage (once shipped):

```json
// .claude/settings.json
{
  "mcpServers": {
    "testnux": {
      "command": "node",
      "args": ["./node_modules/testnux/integrations/claude-code-mcp/server.mjs"]
    }
  }
}
```

---

## GRC platform compatibility

TestNUX produces artefacts that import into common GRC platforms. No native integrations exist at v0.1; these are manual exports:

| Platform | Import method | Artefact |
|----------|--------------|---------|
| Vanta | Upload evidence ZIP | `evidence/*.png` + `execution-report.html` |
| Drata | Evidence upload | `execution-report.html` per control |
| ServiceNow GRC | CSV import | `test-plan.xlsx` (one row per TC) |
| Jira | Attachment or JSON import | `findings.json` (v0.2, from `findings.schema.json`) |

v0.2's OSCAL JSON output enables native import into any FedRAMP-compliant GRC platform (GovReady, RegScale, IBM OpenPages). This is the path for federal and federal-adjacent customers.

---

## Questions?

Open a GitHub Discussion on the `testnux` repo. Tag it `integrations` for routing.

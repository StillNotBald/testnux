# Integrations

TestNUX ships as a standalone CLI. This directory contains optional
integrations for editor tooling — drop-in accelerators that sit on top of
the same CLI commands.

---

## Available integrations

| Integration | Directory | Status | Requires |
|-------------|-----------|--------|---------|
| **gstack skill** | `gstack/testnux/` | v0.3 | gstack installed |
| **Claude Code MCP server** | `claude-code-mcp/` | v0.3 | `@modelcontextprotocol/sdk` |
| Cursor adapter | — | Planned v0.4 | — |
| Continue adapter | — | Planned v0.4 | — |
| VS Code extension | — | Planned v0.4 | — |

---

## gstack skill — `gstack/testnux/`

Makes `/testnux` a first-class slash command in Claude Code sessions that
have gstack installed.

**Files:**
- `SKILL.md` — gstack skill definition (YAML frontmatter + markdown body)
- `install.sh` — symlinks or copies the skill into `~/.claude/skills/gstack/`

**Install:**

```bash
bash integrations/gstack/testnux/install.sh
```

Then in Claude Code:

```
/testnux init login --industry general
/testnux doctor
```

Full documentation: `docs/v0.3-integrations.md` — Option 2.

---

## Claude Code MCP server — `claude-code-mcp/`

Exposes testnux commands as tools in the Claude Code chat pane via the
Model Context Protocol (MCP).

**Files:**
- `server.mjs` — stdio MCP server; imports command modules directly
- `manifest.json` — Claude Code settings snippet with install instructions

**Install:**

```bash
npm install @modelcontextprotocol/sdk
```

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "testnux": {
      "command": "npx",
      "args": ["-y", "testnux", "mcp"]
    }
  }
}
```

Or invoke the server directly:

```bash
npx testnux mcp
```

Full documentation: `docs/v0.3-integrations.md` — Option 3.

---

## Status table

| Feature | v0.1 | v0.2 | v0.3 | Planned |
|---------|------|------|------|---------|
| Standalone CLI (`init`, `report`, `validate`, `demo`, `doctor`) | DONE | DONE | DONE | — |
| LLM commands (`rtm`, `sca`, `discover`, `plan`, `codify`, `enrich`, `batch-plan`) | — | DONE | DONE | — |
| gstack skill bundle | — | — | DONE | — |
| MCP server (stdio) | — | — | DONE | — |
| UAT sign-off (`br`, `sign`) | — | — | DONE | — |
| Per-environment passes (`env`) | — | — | DONE | — |
| Visual regression (`visual`) | — | — | DONE | — |
| Cursor adapter | — | — | — | v0.4 |
| Continue adapter | — | — | — | v0.4 |
| VS Code extension | — | — | — | v0.4 |

---

## Contributing a new integration

Integrations follow a simple convention:

1. Create a directory under `integrations/<name>/`.
2. Include a `README.md` with: what it does, what it requires, how to install,
   failure modes.
3. Keep the integration thin — it should call the CLI or import from
   `src/commands/` directly. Do not duplicate business logic.
4. Add an `install.sh` (or `install.ps1` for Windows-first integrations) that
   handles the setup without user intervention.
5. Add a row to the status table in this file.
6. Add documentation to `docs/v0.3-integrations.md` (or a new docs file if
   the integration warrants it).

**Adapter patterns to follow:**

- **gstack skill:** copy the structure of `gstack/testnux/SKILL.md`.
  YAML frontmatter declares `name`, `version`, `description`, `model`,
  `triggers`, and `allowed-tools`. The body is markdown instructions.
- **MCP server:** reuse `claude-code-mcp/server.mjs` as a template.
  Import from `src/commands/` and expose tools with JSON Schema inputs.
  The `@modelcontextprotocol/sdk` import guard pattern is required.
- **Editor extension:** use the MCP server as the backend; add only the
  UI layer in the extension.

Open a pull request with the integration. Tag it `integrations` for routing
to the right reviewer.

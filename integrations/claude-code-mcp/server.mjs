// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * integrations/claude-code-mcp/server.mjs
 *
 * Stdio MCP server for TestNUX.
 *
 * Exposes TestNUX commands as Claude Code tools so users can invoke
 * testnux operations directly from the Claude Code editor without
 * switching to a terminal.
 *
 * Exposed tools:
 *   testnux_init      — scaffold a test-pass folder
 *   testnux_report    — generate XLSX + HTML report
 *   testnux_validate  — lint markdown frontmatter
 *   testnux_doctor    — preflight checks
 *   testnux_rtm       — generate / refresh traceability matrix
 *   testnux_sca       — security control assessment operations
 *
 * This file is intentionally a standalone ESM module with no build step.
 * The @modelcontextprotocol/sdk is an OPTIONAL peer dependency — if it is
 * not installed, the server exits with a friendly installation prompt.
 *
 * Usage:
 *   node integrations/claude-code-mcp/server.mjs
 *   # or, after `npm install -g testnux`:
 *   npx testnux mcp
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

// ── Optional SDK guard ────────────────────────────────────────────────────────

let Server, StdioServerTransport, CallToolRequestSchema, ListToolsRequestSchema;

try {
  const sdk = await import('@modelcontextprotocol/sdk/server/index.js');
  const stdio = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const types = await import('@modelcontextprotocol/sdk/types.js');

  Server = sdk.Server;
  StdioServerTransport = stdio.StdioServerTransport;
  CallToolRequestSchema = types.CallToolRequestSchema;
  ListToolsRequestSchema = types.ListToolsRequestSchema;
} catch {
  process.stderr.write(
    [
      '',
      'ERROR: @modelcontextprotocol/sdk is not installed.',
      '',
      'The TestNUX MCP server requires the MCP SDK as a peer dependency.',
      'Install it with:',
      '',
      '  npm install @modelcontextprotocol/sdk',
      '',
      'Then restart the server.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

// ── Command imports ───────────────────────────────────────────────────────────

const { runInit } = await import('../../src/commands/init.mjs');
const { runReport } = await import('../../src/commands/report.mjs');
const { runValidate } = await import('../../src/commands/validate.mjs');
const { runDoctor } = await import('../../src/commands/doctor.mjs');

// RTM and SCA are v0.2 commands — gracefully stub if not yet shipped.
let runRtm, runSca;
try {
  ({ runRtm } = await import('../../src/commands/rtm.mjs'));
} catch {
  runRtm = async () => {
    throw Object.assign(new Error('rtm command is not yet available (ships in v0.2)'), {
      exitCode: 1,
    });
  };
}
try {
  ({ runSca } = await import('../../src/commands/sca.mjs'));
} catch {
  runSca = async () => {
    throw Object.assign(new Error('sca command is not yet available (ships in v0.2)'), {
      exitCode: 1,
    });
  };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'testnux_init',
    description:
      'Scaffold a per-page test-pass folder under testing-log/. ' +
      'Creates test-plan.md, spec.ts, README.md, and evidence/. ' +
      'Run this first before report or validate.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description:
            'Kebab-case identifier for the page or feature being tested ' +
            '(e.g. "dashboard-login", "data-room-upload").',
          pattern: '^[a-z0-9][a-z0-9-]*$',
        },
        industry: {
          type: 'string',
          description: 'Standards profile to use for alignment.',
          enum: ['general', 'fintech', 'healthcare', 'gov', 'edu'],
          default: 'general',
        },
        outDir: {
          type: 'string',
          description: 'Root directory for the testing-log output. Defaults to ./testing-log.',
          default: './testing-log',
        },
      },
      required: ['slug'],
    },
  },

  {
    name: 'testnux_report',
    description:
      'Generate an XLSX + self-contained HTML audit report from test-plan.md ' +
      'and execution-log.md inside the given folder. ' +
      'Returns the paths to the generated report.xlsx and report.html files.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description:
            'Path to the test-pass folder (e.g. "testing-log/2026-04-26_login"). ' +
            'Must contain test-plan.md.',
        },
        planOnly: {
          type: 'boolean',
          description:
            'Render without execution results. Adds "PLAN ONLY" badge in the header.',
          default: false,
        },
      },
      required: ['folder'],
    },
  },

  {
    name: 'testnux_validate',
    description:
      'Lint markdown frontmatter in a test-pass folder. ' +
      'Checks required keys, R-XX format, TC-ID consistency, industry field, and status taxonomy. ' +
      'Returns a list of errors and warnings. Exits non-zero if errors are found.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Path to the test-pass folder to validate.',
        },
        strict: {
          type: 'boolean',
          description: 'Treat warnings as errors (recommended for CI gates).',
          default: false,
        },
      },
      required: ['folder'],
    },
  },

  {
    name: 'testnux_doctor',
    description:
      'Run preflight checks: Node version, Playwright browsers installed, ' +
      '.env.local variables, dev-vs-prod server detection, and testing-log/ conventions. ' +
      'Returns a pass/warn/fail result for each check with actionable messages.',
    inputSchema: {
      type: 'object',
      properties: {
        check: {
          type: 'string',
          description: 'Run only a specific check instead of all checks.',
          enum: ['node', 'playwright', 'env', 'supabase', 'build', 'conventions'],
        },
        projectRef: {
          type: 'string',
          description: 'Supabase project ref. Required for --check supabase.',
        },
      },
      required: [],
    },
  },

  {
    name: 'testnux_rtm',
    description:
      'Generate or refresh requirements/TRACEABILITY.md — the Requirements ' +
      'Traceability Matrix. Maps every R-XX identifier to sprint folder, code ' +
      'file(s), and test file(s). Requires requirements/REQUIREMENTS.md to exist. ' +
      'NOTE: ships in v0.2 — returns an error if not yet available.',
    inputSchema: {
      type: 'object',
      properties: {
        out: {
          type: 'string',
          description: 'Output path for the traceability matrix.',
          default: 'requirements/TRACEABILITY.md',
        },
      },
      required: [],
    },
  },

  {
    name: 'testnux_sca',
    description:
      'Security Control Assessment operations. Scaffold a per-surface SCA, ' +
      'auto-fill evidence rows, or render to PDF. ' +
      'NOTE: ships in v0.2 — returns an error if not yet available.',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: {
          type: 'string',
          description: 'SCA operation to perform.',
          enum: ['init', 'generate', 'pdf'],
        },
        surface: {
          type: 'string',
          description:
            'Surface identifier (e.g. "login", "data-room"). ' +
            'Determines the SCA output filename.',
        },
      },
      required: ['subcommand', 'surface'],
    },
  },
];

// ── Result helpers ────────────────────────────────────────────────────────────

/**
 * Capture stdout from an async command function by temporarily monkey-patching
 * process.stdout.write. Returns captured lines as a string.
 *
 * @param {() => Promise<void>} fn
 * @returns {Promise<{ output: string, error: string | null }>}
 */
async function captureCommand(fn) {
  const lines = [];
  const origWrite = process.stdout.write.bind(process.stdout);

  process.stdout.write = (chunk) => {
    lines.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    return true;
  };

  let error = null;
  try {
    await fn();
  } catch (err) {
    error = err.message ?? String(err);
  } finally {
    process.stdout.write = origWrite;
  }

  return { output: lines.join(''), error };
}

function successResult(output) {
  return {
    content: [{ type: 'text', text: output || '(command completed with no output)' }],
    isError: false,
  };
}

function errorResult(message) {
  return {
    content: [{ type: 'text', text: `ERROR: ${message}` }],
    isError: true,
  };
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async function callTool(name, args) {
  switch (name) {
    case 'testnux_init': {
      const { slug, industry = 'general', outDir = './testing-log' } = args;
      if (!slug) return errorResult('slug is required');
      const { output, error } = await captureCommand(() =>
        runInit(slug, { industry, outDir, json: false }),
      );
      return error ? errorResult(error) : successResult(output);
    }

    case 'testnux_report': {
      const { folder, planOnly = false } = args;
      if (!folder) return errorResult('folder is required');
      const { output, error } = await captureCommand(() =>
        runReport(folder, { planOnly, open: false, json: false }),
      );
      return error ? errorResult(error) : successResult(output);
    }

    case 'testnux_validate': {
      const { folder, strict = false } = args;
      if (!folder) return errorResult('folder is required');
      const { output, error } = await captureCommand(() =>
        runValidate(folder, { strict, json: false }),
      );
      return error ? errorResult(error) : successResult(output);
    }

    case 'testnux_doctor': {
      const { check, projectRef } = args;
      const { output, error } = await captureCommand(() =>
        runDoctor({ check, projectRef, json: false }),
      );
      return error ? errorResult(error) : successResult(output);
    }

    case 'testnux_rtm': {
      const { out = 'requirements/TRACEABILITY.md' } = args;
      const { output, error } = await captureCommand(() => runRtm({ out, json: false }));
      return error ? errorResult(error) : successResult(output);
    }

    case 'testnux_sca': {
      const { subcommand, surface } = args;
      if (!subcommand) return errorResult('subcommand is required');
      if (!surface) return errorResult('surface is required');
      const { output, error } = await captureCommand(() =>
        runSca({ subcommand, surface, json: false }),
      );
      return error ? errorResult(error) : successResult(output);
    }

    default:
      return errorResult(`Unknown tool: ${name}`);
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'testnux',
    version: '0.3.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  return callTool(name, args);
});

// ── Stdio transport + graceful shutdown ───────────────────────────────────────

const transport = new StdioServerTransport();

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});

await server.connect(transport);

// Emit a startup marker to stderr (not stdout — stdout is the MCP channel).
process.stderr.write('[testnux MCP] server ready on stdio\n');

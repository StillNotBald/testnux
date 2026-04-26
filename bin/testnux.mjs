#!/usr/bin/env node
// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * bin/testnux.mjs
 *
 * CLI entry point for TestNUX.
 *
 * Verbs:
 *   init <slug>      — scaffold a per-page test-pass folder from templates
 *   report <folder>  — generate XLSX + self-contained HTML report
 *   validate <folder>— lint markdown frontmatter, check R-XX format consistency
 *   demo             — run bundled demo against examples/demo-dashboard/
 *   doctor           — preflight checks for Playwright, Node, Supabase config
 *   mcp              — start the MCP server on stdio (Claude Code integration)
 *
 * Exit codes:
 *   0  success
 *   1  generic error
 *   2  missing or invalid input
 *   3  parse error (malformed markdown / frontmatter)
 *   4  render failed (XLSX or HTML generation error)
 *
 * Global flags:
 *   --json           — emit all output as newline-delimited JSON records
 *   --help           — show help for any command
 */

import { Command } from 'commander';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, '..', 'package.json');
let version = '0.1.0';
try {
  version = JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? version;
} catch {
  // package.json not present during development — use default
}

// ── Command imports ──────────────────────────────────────────────────────────

const { runInit } = await import('../src/commands/init.mjs');
const { runReport } = await import('../src/commands/report.mjs');
const { runValidate } = await import('../src/commands/validate.mjs');
const { runDemo } = await import('../src/commands/demo.mjs');
const { runDoctor } = await import('../src/commands/doctor.mjs');
const { runRtm } = await import('../src/commands/rtm.mjs');
const { runScaInit, runScaGenerate, runScaPdf } = await import('../src/commands/sca.mjs');
const { runBrInit, runBrLink, runBrRtm } = await import('../src/commands/br.mjs');
const { runSign } = await import('../src/commands/sign.mjs');
const { runEnvRun, runEnvCompare } = await import('../src/commands/env.mjs');
const { runVisualBaseline, runVisualCompare } = await import('../src/commands/visual.mjs');
// v0.2 stubs — LLM agents + OSCAL
const { runScaOscal }  = await import('../src/commands/sca-oscal.mjs');
const { runDiscover }  = await import('../src/commands/discover.mjs');
const { runPlan }      = await import('../src/commands/plan.mjs');
const { runCodify }    = await import('../src/commands/codify.mjs');
const { runEnrich }    = await import('../src/commands/enrich.mjs');
const { runBatchPlan } = await import('../src/commands/batch.mjs');

// ── Root program ─────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('testnux')
  .description('TestNUX — structured test-pass documentation for regulated web apps')
  .version(version)
  .option('--json', 'emit all output as newline-delimited JSON records');

// ── init ─────────────────────────────────────────────────────────────────────

program
  .command('init <slug>')
  .description(
    'Scaffold a per-page test-pass folder using templates. ' +
    'Creates testing-log/<date>_<slug>/ with test-plan.md, spec.ts, README.md, evidence/.',
  )
  .option('--industry <industry>', 'industry profile to use for standards alignment', 'general')
  .option('--out <dir>', 'output root (default: ./testing-log/)', './testing-log')
  .action(async (slug, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runInit(slug, { industry: opts.industry, outDir: opts.out, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── report ───────────────────────────────────────────────────────────────────

program
  .command('report <folder>')
  .description(
    'Generate XLSX + self-contained HTML report from test-plan.md + execution-log.md ' +
    'inside <folder>. Writes report.xlsx and report.html alongside the source files.',
  )
  .option('--plan-only', 'render without execution results (PLAN ONLY badge in header)')
  .option('--open', 'open the generated HTML in the default browser after rendering')
  .action(async (folder, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runReport(folder, { planOnly: opts.planOnly, open: opts.open, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 4);
    }
  });

// ── validate ─────────────────────────────────────────────────────────────────

program
  .command('validate <folder>')
  .description(
    'Lint markdown frontmatter in <folder>: check required keys, R-XX format, TC-ID ' +
    'consistency, industry field, status taxonomy. Exits non-zero if errors found.',
  )
  .option('--strict', 'treat warnings as errors')
  .action(async (folder, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runValidate(folder, { strict: opts.strict, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 3);
    }
  });

// ── demo ─────────────────────────────────────────────────────────────────────

program
  .command('demo')
  .description(
    'Run the bundled demo test suite against examples/demo-dashboard/. ' +
    'Opens the resulting HTML report in your default browser. ' +
    'The fastest path to "aha" for first-time users.',
  )
  .action(async (_opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runDemo({ json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── doctor ───────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description(
    'Preflight checks: Node version, Playwright browsers, .env.local variables, ' +
    'Supabase MFA toggle mismatch (Enroll vs Verify), prod-build vs dev-server detection.',
  )
  .option('--check <check>', 'run only a specific check (node|playwright|env|supabase)')
  .option('--project-ref <ref>', 'Supabase project ref (required for --check supabase)')
  .action(async (opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runDoctor({
        check: opts.check,
        projectRef: opts.projectRef,
        json: global.json,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── mcp ──────────────────────────────────────────────────────────────────────

program
  .command('mcp')
  .description(
    'Start the TestNUX MCP server on stdio. ' +
    'Mount this in Claude Code via .claude/settings.json mcpServers. ' +
    'Requires @modelcontextprotocol/sdk — install separately: ' +
    'npm install @modelcontextprotocol/sdk',
  )
  .action(async () => {
    // Resolve server path relative to this file so it works whether testnux
    // is invoked via `npx testnux mcp`, a global install, or a local clone.
    const serverUrl = new URL(
      '../integrations/claude-code-mcp/server.mjs',
      import.meta.url,
    );

    try {
      await import(serverUrl.href);
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND' && err.message.includes('@modelcontextprotocol')) {
        console.error(
          '\nERROR: @modelcontextprotocol/sdk is not installed.\n\n' +
            'Install it with:\n\n  npm install @modelcontextprotocol/sdk\n\n' +
            'Then run: npx testnux mcp\n',
        );
        process.exit(1);
      }
      console.error(err.message);
      process.exit(1);
    }
  });

// ── rtm ───────────────────────────────────────────────────────────────────────

program
  .command('rtm')
  .description(
    'Generate requirements/TRACEABILITY.md by cross-referencing R-IDs across ' +
    'REQUIREMENTS.md, sprint-log summaries, inline code annotations (// R-XX), ' +
    'and test-plan.md files. Human-edited Notes columns survive regeneration.',
  )
  .option('--dry-run', 'print generated content to stdout without writing the file')
  .option('--strict', 'exit 1 if any R-ID has no code or test evidence')
  .option('--config <path>', 'path to testnux.config.mjs for glob overrides')
  .action(async (opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runRtm({
        dryRun: opts.dryRun ?? false,
        strict: opts.strict ?? false,
        config: opts.config,
        json: global.json,
        cwd: process.cwd(),
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── sca ───────────────────────────────────────────────────────────────────────

const scaCmd = program
  .command('sca')
  .description(
    'Security Control Assessment generator. Subcommands: init, generate, pdf. ' +
    'Produces an 8-section SCA markdown document mapped to R-IDs and test evidence.',
  );

scaCmd
  .command('init <surface>')
  .description(
    'Scaffold requirements/validations/<surface>/v1.0_<DATE>.md from the canonical ' +
    '8-section SCA template. Human-edited sections survive subsequent generate runs.',
  )
  .option('--industry <industry>', 'industry standards profile (general|fintech|healthcare)', 'general')
  .option('--dry-run', 'print generated content to stdout without writing the file')
  .option('--config <path>', 'path to testnux.config.mjs')
  .option('--standards-version <version>', 'standards snapshot version recorded in frontmatter', '1.0.0')
  .action(async (surface, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runScaInit(surface, {
        industry: opts.industry,
        dryRun: opts.dryRun ?? false,
        config: opts.config,
        json: global.json,
        standardsVersion: opts.standardsVersion,
        cwd: process.cwd(),
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

scaCmd
  .command('generate <surface>')
  .description(
    'Fill per-control evidence rows in the latest SCA for <surface> using current ' +
    'test results and R-ID mappings. [VERIFY] marks cells needing human or LLM review.',
  )
  .option('--dry-run', 'print updated content to stdout without writing the file')
  .option('--config <path>', 'path to testnux.config.mjs')
  .option('--standards-version <version>', 'standards snapshot version recorded in frontmatter', '1.0.0')
  .action(async (surface, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runScaGenerate(surface, {
        dryRun: opts.dryRun ?? false,
        config: opts.config,
        json: global.json,
        standardsVersion: opts.standardsVersion,
        cwd: process.cwd(),
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

scaCmd
  .command('pdf <surface>')
  .description(
    'Render the latest SCA for <surface> to PDF via puppeteer-core (optional dep). ' +
    'Set CHROME_PATH env var if Chrome is not auto-detected.',
  )
  .option('--dry-run', 'show what would be rendered without writing the file')
  .option('--config <path>', 'path to testnux.config.mjs')
  .action(async (surface, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runScaPdf(surface, {
        dryRun: opts.dryRun ?? false,
        config: opts.config,
        json: global.json,
        cwd: process.cwd(),
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── sca oscal (v0.2 OSCAL emitter) ───────────────────────────────────────────

scaCmd
  .command('oscal <surface>')
  .description(
    'Emit an OSCAL 1.1.2 assessment-results JSON document from the latest SCA ' +
    'for <surface>. Compatible with IBM Compliance Trestle. ' +
    'Output: requirements/validations/<surface>/v<X.Y>.oscal.json',
  )
  .option('--validate', 'run schema check on the emitted OSCAL JSON; exit 1 if invalid')
  .option('--out <dir>', 'write OSCAL JSON to <dir> instead of alongside the source file')
  .option('--dry-run', 'parse and validate but do not write the output file')
  .action(async (surface, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runScaOscal(surface, {
        validate: opts.validate ?? false,
        out:      opts.out,
        dryRun:   opts.dryRun ?? false,
        json:     global.json,
        cwd:      process.cwd(),
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── discover (v0.2 ALPHA — wired to Claude API) ───────────────────────────────

program
  .command('discover <url>')
  .description(
    '[v0.2 ALPHA] Browse a page and emit scenarios.md with Given/When/Then TCs. ' +
    'Fetches page HTML, extracts DOM summary, calls Claude API, writes scenarios.md. ' +
    'Requires: CLAUDE_API_KEY env var + npm install @anthropic-ai/sdk',
  )
  .option('--slug <slug>', 'override the derived slug used in frontmatter')
  .option('--output <dir>', 'output directory for scenarios.md (default: .)', '.')
  .option('--model <model>', 'Claude model to use', 'claude-sonnet-4-6')
  .option('--max-tokens <n>', 'max tokens in LLM response', (v) => parseInt(v, 10), 8000)
  .option('--dry-run', 'print the prompt and cost estimate without calling the API')
  .action(async (url, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runDiscover(url, {
        slug:      opts.slug,
        output:    opts.output,
        model:     opts.model,
        maxTokens: opts.maxTokens,
        dryRun:    opts.dryRun ?? false,
        json:      global.json,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── plan (v0.2 LLM agent stub) ───────────────────────────────────────────────

program
  .command('plan <slug>')
  .description(
    '[v0.2 stub] Convert scenarios.md + page DOM into a structured test-plan.md. ' +
    'In v0.1, prints what v0.2 will do and guides manual plan creation. ' +
    'Requires CLAUDE_API_KEY in v0.2.',
  )
  .option('--url <url>', 'live page URL for DOM snapshot (optional)')
  .option('--industry <industry>', 'industry profile for standards alignment', 'general')
  .option('--out <dir>', 'output root for testing-log/', './testing-log')
  .action(async (slug, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runPlan(slug, {
        url:      opts.url,
        industry: opts.industry,
        out:      opts.out,
        json:     global.json,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── codify (v0.2 LLM agent stub) ─────────────────────────────────────────────

program
  .command('codify <slug>')
  .description(
    '[v0.2 stub] Convert test-plan.md into a Playwright TypeScript spec.ts. ' +
    'In v0.1, prints what v0.2 will do and points to the scaffolded spec.ts. ' +
    'Requires CLAUDE_API_KEY in v0.2.',
  )
  .option('--base-url <url>', 'base URL for Playwright tests', 'http://localhost:3000')
  .option('--out <dir>', 'output root for testing-log/', './testing-log')
  .action(async (slug, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runCodify(slug, {
        baseUrl: opts.baseUrl,
        out:     opts.out,
        json:    global.json,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── enrich (v0.2 LLM agent stub) ─────────────────────────────────────────────

program
  .command('enrich <slug>')
  .description(
    '[v0.2 stub] Run design-review + QA-structural + graph-context passes to append ' +
    'suggested TCs to an existing test plan (append-only; never overwrites human content). ' +
    'In v0.1, adds section markers and prints guidance. Requires CLAUDE_API_KEY in v0.2.',
  )
  .option('--url <url>', 'live page URL for design-review pass (optional)')
  .option('--passes <passes>', 'comma-separated passes to run: design,qa,graph', 'design,qa,graph')
  .option('--out <dir>', 'output root for testing-log/', './testing-log')
  .action(async (slug, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runEnrich(slug, {
        url:    opts.url,
        passes: opts.passes.split(',').map((p) => p.trim()),
        out:    opts.out,
        json:   global.json,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── batch-plan (v0.2 multi-agent stub) ───────────────────────────────────────

program
  .command('batch-plan')
  .description(
    '[v0.2 stub] Dispatch parallel LLM agents to run discover→plan→codify→enrich ' +
    'for multiple pages in one command. Uses replacement-agent pattern for cost control. ' +
    'In v0.1, prints cost estimate and per-page manual workflow.',
  )
  .requiredOption('--pages <pages>', 'comma-separated page slugs or URLs')
  .option('--max-spend <usd>', 'abort if estimated cost exceeds this USD amount', parseFloat)
  .option('--pages-per-agent <n>', 'pages per sub-agent batch (default: 5)', parseInt, 5)
  .option('--dry-run', 'estimate cost without running any LLM calls')
  .option('--out <dir>', 'output root for testing-log/', './testing-log')
  .action(async (opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runBatchPlan({
        pages:         opts.pages,
        maxSpend:      opts.maxSpend ?? null,
        pagesPerAgent: opts.pagesPerAgent ?? 5,
        dryRun:        opts.dryRun ?? false,
        out:           opts.out,
        json:          global.json,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── br ────────────────────────────────────────────────────────────────────────

const brCmd = program
  .command('br')
  .description(
    'Business Requirements (BR-XX) management. Subcommands: init, link, rtm. ' +
    'Adds a BR layer above R-XX in the traceability matrix for stakeholder UAT sign-off.',
  );

brCmd
  .command('init <id>')
  .description(
    'Scaffold a BR-XX entry in requirements/BUSINESS_REQUIREMENTS.md. ' +
    'Creates the file if it does not exist. Idempotent — skips if BR-ID already present.',
  )
  .option('--out <dir>', 'project root (default: current directory)', '.')
  .action(async (id, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runBrInit(id, { outDir: opts.out, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

brCmd
  .command('link <br-id> <r-ids>')
  .description(
    'Add a BR-XX → R-ID mapping in requirements/BUSINESS_REQUIREMENTS.md. ' +
    'r-ids is a comma-separated list (e.g. R-01,R-02,R-03).',
  )
  .option('--out <dir>', 'project root (default: current directory)', '.')
  .action(async (brId, rIds, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runBrLink(brId, rIds, { outDir: opts.out, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

brCmd
  .command('rtm')
  .description(
    'Render requirements/UAT_TRACEABILITY.md — a BR-XX → R-XX → TC-XX mapping table. ' +
    'Reads BUSINESS_REQUIREMENTS.md; TC-XX column is informational until `br codify`.',
  )
  .option('--out <dir>', 'project root (default: current directory)', '.')
  .action(async (opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runBrRtm({ outDir: opts.out, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── sign ──────────────────────────────────────────────────────────────────────

program
  .command('sign <surface>')
  .description(
    'Interactive stakeholder sign-off for a test pass. ' +
    'Computes HMAC-SHA256 e-signature and appends to <surface>/uat-log.jsonl (hash-chained). ' +
    'Requires UAT_SECRET env var. ' +
    'NOTICE: audit-trail signature only — not a court-admissible e-signature.',
  )
  .option('--reject <tc-id>', 'batch-reject a specific TC-ID (status set to rejected)')
  .option('--verify', 'verify chain integrity of <surface>/uat-log.jsonl and exit')
  .option('--out <dir>', 'project root (default: current directory)', '.')
  .action(async (surface, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      if (opts.verify) {
        const { verifyChain } = await import('../src/lib/uat-log.mjs');
        const pathMod = await import('path');
        const logPath = pathMod.default.resolve(opts.out, surface, 'uat-log.jsonl');
        const secret = process.env.UAT_SECRET;
        if (!secret) {
          emit(global.json, { error: 'UAT_SECRET is required for chain verification' });
          process.exit(2);
        }
        const result = verifyChain(logPath, secret);
        emit(global.json, { event: 'sign.verify', ...result });
        if (!global.json) {
          if (result.valid) {
            console.log(`[sign --verify] Chain is valid (${logPath})`);
          } else {
            console.log(`[sign --verify] Chain BROKEN at line ${result.brokenAt}`);
            for (const e of result.errors) console.log(`  ${e}`);
          }
        }
        process.exit(result.valid ? 0 : 1);
      }
      await runSign(surface, { reject: opts.reject, outDir: opts.out, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── run (env-aware) ───────────────────────────────────────────────────────────

program
  .command('run <slug>')
  .description(
    'Scaffold a per-environment test-pass folder (wraps `init` with --env suffix). ' +
    'Creates testing-log/<date>_<slug>-<env>/ for isolated environment tracking.',
  )
  .option('--env <env>', 'target environment: local|staging|prod', 'local')
  .option('--industry <industry>', 'industry profile', 'general')
  .option('--out <dir>', 'output root (default: ./testing-log/)', './testing-log')
  .action(async (slug, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runEnvRun(slug, {
        env: opts.env,
        industry: opts.industry,
        outDir: opts.out,
        json: global.json,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── compare ───────────────────────────────────────────────────────────────────

program
  .command('compare <slug> <env-a> <env-b>')
  .description(
    'Diff TC results between two environment passes for the same slug. ' +
    'Flags TCs that pass in one environment and fail in another. ' +
    'Output: markdown table — TC-ID | env-a status | env-b status | delta.',
  )
  .option('--out <dir>', 'testing-log root (default: ./testing-log/)', './testing-log')
  .action(async (slug, envA, envB, opts, cmd) => {
    const global = cmd.parent.opts();
    try {
      await runEnvCompare(slug, envA, envB, { outDir: opts.out, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── visual ────────────────────────────────────────────────────────────────────

const visualCmd = program
  .command('visual')
  .description(
    'Visual regression testing. Subcommands: baseline, compare. ' +
    'Optional dep: npm install pixelmatch pngjs. ' +
    'Configurable via testnux.config.mjs visual.diffThreshold (default 5%).',
  );

visualCmd
  .command('baseline <slug>')
  .description(
    'Capture full-page baseline screenshots for all TCs in <slug>/. ' +
    'Stored at <slug>/visual-baseline/<TC-ID>.png. ' +
    'v0.3 stub: scaffolds directories + placeholders; full capture needs Playwright + pixelmatch.',
  )
  .option('--out <dir>', 'testing-log root (default: ./testing-log/)', './testing-log')
  .action(async (slug, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runVisualBaseline(slug, { outDir: opts.out, json: global.json });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

visualCmd
  .command('compare <slug>')
  .description(
    'Compare current screenshots against baseline. ' +
    'Diffs stored at <slug>/visual-diff/<TC-ID>-diff.png. ' +
    'Threshold configurable in testnux.config.mjs (default 5%).',
  )
  .option('--strict', 'exit 1 if any TC exceeds the diff threshold')
  .option('--report', 'flag-only mode — no exit code change on diff (default)')
  .option('--threshold <n>', 'override diffThreshold for this run (0.0–1.0)')
  .option('--out <dir>', 'testing-log root (default: ./testing-log/)', './testing-log')
  .action(async (slug, opts, cmd) => {
    const global = cmd.parent.parent.opts();
    try {
      await runVisualCompare(slug, {
        strict: opts.strict ?? false,
        outDir: opts.out,
        json: global.json,
        threshold: opts.threshold != null ? parseFloat(opts.threshold) : undefined,
      });
    } catch (err) {
      emit(global.json, { error: err.message });
      process.exit(err.exitCode ?? 1);
    }
  });

// ── helpers ──────────────────────────────────────────────────────────────────

function emit(isJson, payload) {
  if (isJson) {
    process.stdout.write(JSON.stringify(payload) + '\n');
  } else if (payload.error) {
    // In non-JSON mode, print errors to stderr so they are visible and catchable
    process.stderr.write(`ERROR: ${payload.error}\n`);
  }
}

// ── parse ────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});

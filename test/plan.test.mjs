// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/plan.test.mjs
 *
 * Unit tests for `testnux plan` (src/commands/plan.mjs).
 *
 * All Anthropic API calls are mocked via vi.mock — no real API key required.
 * All file system side-effects write to a temp directory per test.
 *
 * Note on mocking strategy:
 *   plan.mjs uses a dynamic `import('@anthropic-ai/sdk')` inside runPlan().
 *   Vitest's vi.mock() hoisting intercepts this dynamic import at module
 *   evaluation time. We register the mock before the first import of plan.mjs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Module mock: @anthropic-ai/sdk ────────────────────────────────────────────
//
// vi.mock is hoisted to the top by Vitest — runs before any imports below.

const mockMessageCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: mockMessageCreate };
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a mock Anthropic API response object. */
function makeMockApiResponse(content, usage = { input_tokens: 1800, output_tokens: 1200 }) {
  return {
    id:            'msg_mock_plan_001',
    type:          'message',
    role:          'assistant',
    content:       [{ type: 'text', text: content }],
    model:         'claude-sonnet-4-6',
    stop_reason:   'end_turn',
    stop_sequence: null,
    usage,
  };
}

/** Builds a realistic mock scenarios.md for a slug. */
function makeMockScenarios(slug = 'login', tcCount = 3) {
  const frontmatter = `---
slug: ${slug}
url: https://example.com/${slug}
generated_by: testnux discover v0.2
generated_at: 2026-04-26T12:00:00.000Z
tc_count: ${tcCount}
review_required: true
---`;

  const tcs = Array.from({ length: tcCount }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `
## TC-${n} — Email field accepts valid input

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: OWASP ASVS 2.1.1

**Given** the user is on the ${slug} page
**When** they enter valid credentials
**Then** the system accepts the input

> [VERIFY] Confirm behavior matches product specification before execution.
`;
  }).join('\n');

  return frontmatter + '\n' + tcs;
}

/** Builds a realistic mock test-plan.md response body from the LLM. */
function makeMockTestPlan(slug = 'login', tcPrefix = 'LOGIN', tcCount = 3) {
  const frontmatter = `---
slug: ${slug}
title: Login Page [VERIFY]
industry: general
status: DRAFT
r_ids: []
tc_prefix: ${tcPrefix}
standards:
  - OWASP ASVS 4.0 v2.1.1
review_required: true
---`;

  const tcs = Array.from({ length: tcCount }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `
## ${tcPrefix}-${n} — Email field accepts valid input

| Field       | Value |
|-------------|-------|
| R-ID        | R-01 [VERIFY] |
| Priority    | P1 |
| Category    | FUNCTIONAL |
| Standards   | OWASP ASVS 2.1.1 |
| Status      | DRAFT |

**Preconditions**
- User is on the ${slug} page

**Steps**
1. Navigate to /${slug}
2. Enter valid credentials in the email field

**Expected Result**
The field accepts the input without validation errors.

**Evidence**
- [ ] Screenshot: \`evidence/${tcPrefix}-${n}-valid-email.png\`

> [VERIFY] Confirm R-ID mapping and expected result before execution.
`;
  }).join('\n');

  const summary = `
## Summary

- Total TCs: ${tcCount}
- P0: 0 | P1: ${tcCount} | P2: 0
- Standards covered: OWASP ASVS 4.0 v2.1.1
`;

  return frontmatter + '\n' + tcs + summary;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'));

  vi.clearAllMocks();

  // Default: successful API response
  mockMessageCreate.mockResolvedValue(makeMockApiResponse(makeMockTestPlan('login', 'LOGIN', 3)));
});

afterEach(() => {
  delete process.env.CLAUDE_API_KEY;

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ── Import runPlan after mocks are established ────────────────────────────────

const { runPlan } = await import('../src/commands/plan.mjs');

// ── Helper: create a scenarios.md inside tmpDir so plan can find it ──────────
//
// plan.mjs's findScenariosFile() scans `path.resolve(out)/<entry>/scenarios.md`
// for entries whose name includes the slug.  We create a date-prefixed subfolder
// inside tmpDir so the out-dir scan picks it up without touching cwd.

function writeScenarios(slug, content, datePrefix = '2026-04-27') {
  const subDir = path.join(tmpDir, `${datePrefix}_${slug}`);
  fs.mkdirSync(subDir, { recursive: true });
  const file = path.join(subDir, 'scenarios.md');
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('plan — missing CLAUDE_API_KEY', () => {
  it('throws with exitCode 1 when CLAUDE_API_KEY is not set', async () => {
    delete process.env.CLAUDE_API_KEY;

    // Write scenarios so the only failure is the missing API key
    const scenariosPath = writeScenarios('login', makeMockScenarios('login'));

    let thrown;
    try {
      await runPlan('login', { out: tmpDir, json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/CLAUDE_API_KEY/i);
  });

  it('JSON mode emits a plan.error event on stderr when API key missing', async () => {
    delete process.env.CLAUDE_API_KEY;
    writeScenarios('login', makeMockScenarios('login'));

    const stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    try {
      await runPlan('login', { out: tmpDir, json: true });
    } catch {
      // expected
    }

    const combined = stderrLines.join('');
    expect(combined.length).toBeGreaterThan(0);
    const parsed = JSON.parse(combined.trim().split('\n')[0]);
    expect(parsed.event).toBe('plan.error');
    expect(parsed.message).toMatch(/CLAUDE_API_KEY/i);
  });
});

describe('plan — missing @anthropic-ai/sdk guard (source inspection)', () => {
  it('source code contains ERR_MODULE_NOT_FOUND guard', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/plan.mjs'),
      'utf-8',
    );
    expect(src).toContain('ERR_MODULE_NOT_FOUND');
    expect(src).toContain('npm install @anthropic-ai/sdk');
    expect(src).toContain('exitCode = 1');
  });

  it('source code uses dynamic import() for @anthropic-ai/sdk', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/plan.mjs'),
      'utf-8',
    );
    expect(src).toContain("import('@anthropic-ai/sdk')");
    expect(src).not.toMatch(/^import\s+.*@anthropic-ai\/sdk/m);
  });
});

describe('plan — missing scenarios.md', () => {
  it('throws exitCode 1 with a message suggesting testnux discover', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    // Do NOT write a scenarios.md — use a slug with no file present
    let thrown;
    try {
      // Use a slug unlikely to have any file on disk; pass a non-existent outDir
      await runPlan('no-such-slug-xyz', { out: path.join(tmpDir, 'empty'), json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/no scenarios file found/i);
  });
});

describe('plan — --dry-run', () => {
  it('does NOT call the Anthropic API', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    await runPlan('login', { out: tmpDir, dryRun: true, json: false });

    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('does NOT write test-plan.md', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    await runPlan('login', { out: tmpDir, dryRun: true, json: false });

    // No date-prefixed subfolder should be created
    const entries = fs.readdirSync(tmpDir);
    const hasPlanFile = entries.some((e) => {
      const sub = path.join(tmpDir, e);
      if (!fs.statSync(sub).isDirectory()) return false;
      return fs.existsSync(path.join(sub, 'test-plan.md'));
    });
    expect(hasPlanFile).toBe(false);
  });

  it('prints SYSTEM PROMPT, USER PROMPT, and DRY-RUN COMPLETE sections', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    const consoleLines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLines.push(args.join(' '));
    });

    await runPlan('login', { out: tmpDir, dryRun: true, json: false });

    const combined = consoleLines.join('\n');
    expect(combined).toContain('SYSTEM PROMPT');
    expect(combined).toContain('USER PROMPT');
    expect(combined).toContain('DRY-RUN COMPLETE');
    expect(combined).toContain('Estimated cost');
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('--dry-run with --json emits a plan.dry-run event with cost estimate', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runPlan('login', { out: tmpDir, dryRun: true, json: true });

    expect(mockMessageCreate).not.toHaveBeenCalled();

    const parsed = JSON.parse(stdoutLines.join('').trim().split('\n')[0]);
    expect(parsed.event).toBe('plan.dry-run');
    expect(parsed.slug).toBe('login');
    expect(parsed).toHaveProperty('systemPrompt');
    expect(parsed).toHaveProperty('userPrompt');
    expect(parsed).toHaveProperty('costEstimateUsd');
    expect(parsed.costEstimateUsd).toBeGreaterThan(0);
  });
});

describe('plan — mock API success', () => {
  it('writes test-plan.md to the output directory', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    await runPlan('login', { out: tmpDir, json: false });

    // Find the date-prefixed subfolder
    const entries = fs.readdirSync(tmpDir).filter((e) =>
      fs.statSync(path.join(tmpDir, e)).isDirectory() && e.includes('login'),
    );
    expect(entries.length).toBeGreaterThan(0);

    const planFile = path.join(tmpDir, entries[0], 'test-plan.md');
    expect(fs.existsSync(planFile)).toBe(true);

    const content = fs.readFileSync(planFile, 'utf-8');
    expect(content).toContain('slug: login');
    expect(content).toContain('status: DRAFT');
    expect(content).toContain('LOGIN-01');
  });

  it('calls the Anthropic API exactly once', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    await runPlan('login', { out: tmpDir, json: false });

    expect(mockMessageCreate).toHaveBeenCalledOnce();
  });

  it('written test-plan.md has frontmatter, TC sections, and [VERIFY] markers', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    await runPlan('login', { out: tmpDir, json: false });

    const entries = fs.readdirSync(tmpDir).filter((e) =>
      fs.statSync(path.join(tmpDir, e)).isDirectory() && e.includes('login'),
    );
    const content = fs.readFileSync(path.join(tmpDir, entries[0], 'test-plan.md'), 'utf-8');

    // Has YAML frontmatter
    expect(content).toMatch(/^---\s*\n[\s\S]*?\n---/m);
    // Has at least one TC heading
    expect(content).toMatch(/^##\s+LOGIN-\d+/m);
    // Has [VERIFY] markers
    expect(content).toContain('[VERIFY]');
  });

  it('--json emits a plan.done event with tcCount, tokensIn, tokensOut, costUsd', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    mockMessageCreate.mockResolvedValue(
      makeMockApiResponse(makeMockTestPlan('login', 'LOGIN', 3), { input_tokens: 2000, output_tokens: 1500 }),
    );
    writeScenarios('login', makeMockScenarios('login'));

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runPlan('login', { out: tmpDir, json: true });

    const events = stdoutLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const done = events.find((e) => e.event === 'plan.done');
    expect(done).toBeDefined();
    expect(done.slug).toBe('login');
    expect(done.tcCount).toBeGreaterThan(0);
    expect(done.tokensIn).toBe(2000);
    expect(done.tokensOut).toBe(1500);
    expect(done.costUsd).toBeGreaterThan(0);
    expect(done.outFile).toContain('test-plan.md');
  });
});

describe('plan — mock API 429 rate limit', () => {
  it('throws with exitCode 2', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    mockMessageCreate.mockRejectedValue(
      Object.assign(new Error('Rate limit exceeded'), {
        status:  429,
        headers: { 'retry-after': '30' },
      }),
    );

    vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown;
    try {
      await runPlan('login', { out: tmpDir, json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
  });

  it('error output mentions 429 or rate limit and retry', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    mockMessageCreate.mockRejectedValue(
      Object.assign(new Error('Rate limit exceeded'), {
        status:  429,
        headers: { 'retry-after': '45' },
      }),
    );

    const errorLines = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorLines.push(args.join(' '));
    });

    try {
      await runPlan('login', { out: tmpDir, json: false });
    } catch {
      // expected
    }

    expect(errorLines.join('\n')).toMatch(/429|rate limit/i);
    expect(errorLines.join('\n')).toMatch(/retry/i);
  });

  it('--json 429 error emits a plan.error JSON record on stderr', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    mockMessageCreate.mockRejectedValue(
      Object.assign(new Error('Rate limit exceeded'), { status: 429 }),
    );

    const stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    try {
      await runPlan('login', { out: tmpDir, json: true });
    } catch {
      // expected
    }

    const combined = stderrLines.join('').trim();
    expect(combined.length).toBeGreaterThan(0);
    const parsed = JSON.parse(combined.split('\n')[0]);
    expect(parsed.event).toBe('plan.error');
    expect(parsed.message).toMatch(/429|rate limit/i);
  });
});

describe('plan — mock parse error (LLM returns garbage)', () => {
  it('saves test-plan.raw.txt and throws with exitCode 3', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    const garbledResponse = 'Sorry, I cannot generate a test plan for this page.';
    mockMessageCreate.mockResolvedValue(makeMockApiResponse(garbledResponse));

    vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown;
    try {
      await runPlan('login', { out: tmpDir, json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(3);

    // Find the date-prefixed subfolder with the raw file
    const entries = fs.readdirSync(tmpDir).filter((e) =>
      fs.statSync(path.join(tmpDir, e)).isDirectory() && e.includes('login'),
    );
    expect(entries.length).toBeGreaterThan(0);

    const rawFile = path.join(tmpDir, entries[0], 'test-plan.raw.txt');
    expect(fs.existsSync(rawFile)).toBe(true);
    expect(fs.readFileSync(rawFile, 'utf-8')).toBe(garbledResponse);
  });

  it('empty LLM response → exitCode 3 + test-plan.raw.txt written', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    mockMessageCreate.mockResolvedValue(makeMockApiResponse(''));

    vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown;
    try {
      await runPlan('login', { out: tmpDir, json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(3);
  });
});

describe('plan — --max-spend enforcement', () => {
  it('aborts BEFORE API call when estimated cost exceeds --max-spend 0.001', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown;
    try {
      await runPlan('login', {
        out:      tmpDir,
        maxSpend: 0.001, // absurdly low — estimate will exceed this
        json:     false,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/max-spend/i);
    // Critical: must NOT have called the API
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('proceeds to API call when estimated cost is within --max-spend 100', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    writeScenarios('login', makeMockScenarios('login'));

    await runPlan('login', {
      out:      tmpDir,
      maxSpend: 100,
      json:     false,
    });

    expect(mockMessageCreate).toHaveBeenCalledOnce();
  });
});

describe('plan — JSON output mode', () => {
  it('done event has required NDJSON shape fields', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    mockMessageCreate.mockResolvedValue(
      makeMockApiResponse(makeMockTestPlan('login', 'LOGIN', 2), { input_tokens: 1000, output_tokens: 800 }),
    );
    writeScenarios('login', makeMockScenarios('login', 2));

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runPlan('login', { out: tmpDir, json: true });

    const events = stdoutLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const done = events.find((e) => e.event === 'plan.done');
    expect(done).toBeDefined();
    expect(typeof done.slug).toBe('string');
    expect(typeof done.industry).toBe('string');
    expect(typeof done.tcPrefix).toBe('string');
    expect(typeof done.model).toBe('string');
    expect(typeof done.outFile).toBe('string');
    expect(typeof done.tcCount).toBe('number');
    expect(typeof done.tokensIn).toBe('number');
    expect(typeof done.tokensOut).toBe('number');
    expect(typeof done.costUsd).toBe('number');
  });
});

describe('plan — [VERIFY] auto-injection', () => {
  it('injects [VERIFY] on TC blocks missing it', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    // Strip one [VERIFY] blockquote from the mock response
    const withMissingVerify = makeMockTestPlan('login', 'LOGIN', 3).replace(
      /> \[VERIFY\] Confirm R-ID mapping.*\n/,
      '',
    );
    mockMessageCreate.mockResolvedValue(makeMockApiResponse(withMissingVerify));
    writeScenarios('login', makeMockScenarios('login'));

    await runPlan('login', { out: tmpDir, json: false });

    const entries = fs.readdirSync(tmpDir).filter((e) =>
      fs.statSync(path.join(tmpDir, e)).isDirectory() && e.includes('login'),
    );
    const content = fs.readFileSync(path.join(tmpDir, entries[0], 'test-plan.md'), 'utf-8');

    const tcCount     = (content.match(/^##\s+LOGIN-\d+/gm) ?? []).length;
    const verifyCount = (content.match(/\[VERIFY\]/g) ?? []).length;

    expect(tcCount).toBeGreaterThan(0);
    // ensureVerifyMarkers guarantees at least one [VERIFY] per TC block
    expect(verifyCount).toBeGreaterThanOrEqual(tcCount);
  });
});

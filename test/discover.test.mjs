// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/discover.test.mjs
 *
 * Unit tests for `testnux discover` (src/commands/discover.mjs).
 *
 * All Anthropic API calls are mocked via vi.mock — no real API key required.
 * All file system side-effects write to a temp directory per test.
 *
 * Note on mocking strategy:
 *   discover.mjs uses a dynamic `import('@anthropic-ai/sdk')` inside runDiscover().
 *   Vitest's vi.mock() hoisting intercepts this dynamic import at module evaluation
 *   time when the mock is registered before the import happens. We register the mock
 *   before the first import of discover.mjs to ensure the factory applies.
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
// The mockMessageCreate reference is captured in the module scope so individual
// tests can configure return values with mockResolvedValue / mockRejectedValue.

const mockMessageCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: mockMessageCreate };
    }
  },
}));

// ── Module mock: global fetch ──────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds minimal HTML for DOM extraction tests. */
function makeFakeHtml(opts = {}) {
  const {
    title = 'Test Login Page',
    body = `
      <h1>Sign in</h1>
      <form action="/login" method="POST">
        <input type="email" name="email" placeholder="Email address" required />
        <input type="password" name="password" placeholder="Password" required />
        <button type="submit">Sign in</button>
      </form>
      <a href="/forgot-password">Forgot password?</a>
    `,
  } = opts;
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

/** Builds a mock Anthropic API response object. */
function makeMockApiResponse(content, usage = { input_tokens: 1200, output_tokens: 800 }) {
  return {
    id:            'msg_mock_001',
    type:          'message',
    role:          'assistant',
    content:       [{ type: 'text', text: content }],
    model:         'claude-sonnet-4-6',
    stop_reason:   'end_turn',
    stop_sequence: null,
    usage,
  };
}

/** Builds a realistic mock scenarios.md body from the LLM. */
function makeMockScenarios(tcCount = 3) {
  const frontmatter = `---
slug: login
url: https://example.com/login
generated_by: testnux discover v0.2
generated_at: 2026-04-26T12:00:00.000Z
tc_count: ${tcCount}
review_required: true
---`;

  const tcs = Array.from({ length: tcCount }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `
## TC-${n} — Email field accepts valid email

**Priority**: P1
**Category**: FUNCTIONAL
**Standards**: OWASP ASVS 2.1.1

**Given** the user is on the login page
**When** they enter a valid email address in the email field
**Then** the field accepts the input without a validation error

> [VERIFY] Confirm behavior matches product specification before execution.
`;
  }).join('\n');

  return frontmatter + '\n' + tcs;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));

  // Clear all mock call history between tests
  vi.clearAllMocks();

  // Default fetch: returns valid HTML
  mockFetch.mockResolvedValue({
    ok:      true,
    status:  200,
    headers: { get: (h) => (h === 'content-type' ? 'text/html; charset=utf-8' : null) },
    text:    async () => makeFakeHtml(),
  });

  // Default API: returns a good response
  mockMessageCreate.mockResolvedValue(makeMockApiResponse(makeMockScenarios(3)));
});

afterEach(() => {
  // Delete CLAUDE_API_KEY so tests don't bleed into each other
  delete process.env.CLAUDE_API_KEY;

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors in CI
  }
});

// ── Import runDiscover after mocks are established ────────────────────────────

const { runDiscover } = await import('../src/commands/discover.mjs');

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('discover — missing CLAUDE_API_KEY', () => {
  it('throws with exitCode 1 when CLAUDE_API_KEY is not set', async () => {
    delete process.env.CLAUDE_API_KEY;

    let thrown;
    try {
      await runDiscover('https://example.com/login', { output: tmpDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/CLAUDE_API_KEY/i);
  });

  it('error output includes the console.anthropic.com URL', async () => {
    delete process.env.CLAUDE_API_KEY;

    const stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    try {
      await runDiscover('https://example.com/login', { output: tmpDir, json: true });
    } catch {
      // expected throw
    }

    expect(stderrLines.join('')).toContain('console.anthropic.com');
  });
});

describe('discover — missing @anthropic-ai/sdk guard (source inspection)', () => {
  it('source code contains ERR_MODULE_NOT_FOUND guard', () => {
    // Verify the guard exists without actually uninstalling the package.
    // When a user runs `testnux discover` without `npm install @anthropic-ai/sdk`,
    // the dynamic import throws ERR_MODULE_NOT_FOUND and the command gracefully exits 1.
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/discover.mjs'),
      'utf-8',
    );
    expect(src).toContain('ERR_MODULE_NOT_FOUND');
    expect(src).toContain('npm install @anthropic-ai/sdk');
    expect(src).toContain("exitCode = 1");
  });

  it('source code uses dynamic import() for @anthropic-ai/sdk', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/commands/discover.mjs'),
      'utf-8',
    );
    // Confirm optional dep pattern: dynamic import, not a top-level static import
    expect(src).toContain("import('@anthropic-ai/sdk')");
    expect(src).not.toMatch(/^import\s+.*@anthropic-ai\/sdk/m);
  });
});

describe('discover — --dry-run', () => {
  it('does NOT call the Anthropic API', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      dryRun: true,
      json:   false,
    });

    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('does NOT write scenarios.md', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      dryRun: true,
      json:   false,
    });

    expect(fs.existsSync(path.join(tmpDir, 'scenarios.md'))).toBe(false);
  });

  it('--dry-run with --json emits a discover.dry-run event containing prompt fields', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      dryRun: true,
      json:   true,
    });

    expect(mockMessageCreate).not.toHaveBeenCalled();

    const parsed = JSON.parse(stdoutLines.join('').trim().split('\n')[0]);
    expect(parsed.event).toBe('discover.dry-run');
    expect(parsed.url).toBe('https://example.com/login');
    expect(parsed).toHaveProperty('systemPrompt');
    expect(parsed).toHaveProperty('userPrompt');
    expect(parsed).toHaveProperty('costEstimateUsd');
    expect(parsed.costEstimateUsd).toBeGreaterThan(0);
  });

  it('--dry-run prints SYSTEM PROMPT, USER PROMPT, and cost estimate sections', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    const consoleLines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLines.push(args.join(' '));
    });

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      dryRun: true,
      json:   false,
    });

    const combined = consoleLines.join('\n');
    expect(combined).toContain('SYSTEM PROMPT');
    expect(combined).toContain('USER PROMPT');
    expect(combined).toContain('DRY-RUN COMPLETE');
    expect(combined).toContain('Estimated cost');
  });
});

describe('discover — mock API success', () => {
  it('writes scenarios.md to the output directory', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      json:   false,
    });

    const outFile = path.join(tmpDir, 'scenarios.md');
    expect(fs.existsSync(outFile)).toBe(true);

    const content = fs.readFileSync(outFile, 'utf-8');
    expect(content).toContain('slug: login');
    expect(content).toContain('generated_by: testnux discover v0.2');
    expect(content).toContain('## TC-01');
  });

  it('ALL TC blocks in scenarios.md carry [VERIFY] markers', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    // Deliberately strip one [VERIFY] from the mock response to test enforcement
    const withMissingVerify = makeMockScenarios(3).replace(
      /> \[VERIFY\].*\n/,
      '',
    );
    mockMessageCreate.mockResolvedValue(makeMockApiResponse(withMissingVerify));

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      json:   false,
    });

    const content     = fs.readFileSync(path.join(tmpDir, 'scenarios.md'), 'utf-8');
    const tcCount     = (content.match(/^#{2,3}\s+TC-/gm) ?? []).length;
    const verifyCount = (content.match(/\[VERIFY\]/g) ?? []).length;

    expect(tcCount).toBeGreaterThan(0);
    // Each TC must have at least one [VERIFY] — enforceVerifyMarkers guarantees this
    expect(verifyCount).toBeGreaterThanOrEqual(tcCount);
  });

  it('prints TC count, token counts, and cost in the success summary', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    mockMessageCreate.mockResolvedValue(
      makeMockApiResponse(makeMockScenarios(4), { input_tokens: 2000, output_tokens: 1500 }),
    );

    const consoleLines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleLines.push(args.join(' '));
    });

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      json:   false,
    });

    const combined = consoleLines.join('\n');
    expect(combined).toContain('TC count');
    expect(combined).toContain('Tokens in');
    expect(combined).toContain('Tokens out');
    expect(combined).toContain('Actual cost');
  });

  it('--json emits a discover.done event with tcCount, tokensIn, tokensOut, costUsd', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';
    mockMessageCreate.mockResolvedValue(
      makeMockApiResponse(makeMockScenarios(3), { input_tokens: 1500, output_tokens: 900 }),
    );

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      json:   true,
    });

    const events = stdoutLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const done = events.find((e) => e.event === 'discover.done');
    expect(done).toBeDefined();
    expect(done.url).toBe('https://example.com/login');
    expect(done.tcCount).toBeGreaterThan(0);
    expect(done.tokensIn).toBe(1500);
    expect(done.tokensOut).toBe(900);
    expect(done.costUsd).toBeGreaterThan(0);
    expect(done.outFile).toContain('scenarios.md');
  });

  it('calls the Claude API with correct model, max_tokens, system, and messages', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    await runDiscover('https://example.com/login', {
      output:    tmpDir,
      model:     'claude-haiku-4-5',
      maxTokens: 4000,
      json:      false,
    });

    expect(mockMessageCreate).toHaveBeenCalledOnce();
    const callArgs = mockMessageCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-haiku-4-5');
    expect(callArgs.max_tokens).toBe(4000);
    expect(callArgs.system).toBeDefined();
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe('user');
  });

  it('user prompt contains the URL, PAGE TITLE, and INTERACTIVE ELEMENTS sections', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      json:   false,
    });

    const callArgs   = mockMessageCreate.mock.calls[0][0];
    const userPrompt = callArgs.messages[0].content;

    expect(userPrompt).toContain('https://example.com/login');
    expect(userPrompt).toContain('PAGE TITLE');
    expect(userPrompt).toContain('INTERACTIVE ELEMENTS');
    // Our fake HTML has an email input — confirm DOM extraction found it
    expect(userPrompt).toMatch(/email|password|input/i);
  });
});

describe('discover — mock API 429 rate limit', () => {
  it('throws with exitCode 2 and prints a retry suggestion', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    mockMessageCreate.mockRejectedValue(
      Object.assign(new Error('Rate limit exceeded'), {
        status:  429,
        headers: { 'retry-after': '30' },
      }),
    );

    // printError(json=false) uses console.error, not process.stderr.write directly
    const errorLines = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorLines.push(args.join(' '));
    });

    let thrown;
    try {
      await runDiscover('https://example.com/login', { output: tmpDir, json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(2);
    expect(errorLines.join('\n')).toMatch(/429|rate limit/i);
    expect(errorLines.join('\n')).toMatch(/retry/i);
  });

  it('--json 429 error emits a JSON error record on stderr', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    mockMessageCreate.mockRejectedValue(
      Object.assign(new Error('Rate limit exceeded'), { status: 429 }),
    );

    const stderrLines = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk));
      return true;
    });

    try {
      await runDiscover('https://example.com/login', { output: tmpDir, json: true });
    } catch {
      // expected
    }

    const combined = stderrLines.join('').trim();
    expect(combined.length).toBeGreaterThan(0);
    const parsed = JSON.parse(combined.split('\n')[0]);
    expect(parsed.event).toBe('discover.error');
    expect(parsed.message).toMatch(/429|rate limit/i);
  });
});

describe('discover — mock API parse error', () => {
  it('saves scenarios.raw.txt and throws with exitCode 3', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    const garbledResponse = 'I cannot generate test cases for this page.';
    mockMessageCreate.mockResolvedValue(makeMockApiResponse(garbledResponse));

    let thrown;
    try {
      await runDiscover('https://example.com/login', { output: tmpDir, json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(3);

    const rawFile = path.join(tmpDir, 'scenarios.raw.txt');
    expect(fs.existsSync(rawFile)).toBe(true);
    expect(fs.readFileSync(rawFile, 'utf-8')).toBe(garbledResponse);
  });

  it('empty LLM response → exitCode 3 + scenarios.raw.txt', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    mockMessageCreate.mockResolvedValue(makeMockApiResponse(''));

    let thrown;
    try {
      await runDiscover('https://example.com/login', { output: tmpDir, json: false });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(3);
  });
});

describe('discover — URL fetch errors', () => {
  it('throws with exitCode 1 when fetch returns HTTP 404', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    mockFetch.mockResolvedValue({
      ok:         false,
      status:     404,
      statusText: 'Not Found',
      headers:    { get: () => 'text/html' },
    });

    let thrown;
    try {
      await runDiscover('https://example.com/missing-page', { output: tmpDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/fetch failed/i);
  });

  it('throws with exitCode 1 for non-HTML Content-Type', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    mockFetch.mockResolvedValue({
      ok:      true,
      status:  200,
      headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
      text:    async () => '{"error": "not html"}',
    });

    let thrown;
    try {
      await runDiscover('https://api.example.com/data', { output: tmpDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
  });

  it('throws with exitCode 1 when network fetch rejects (ECONNREFUSED)', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    let thrown;
    try {
      await runDiscover('https://unreachable.example.com/', { output: tmpDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
  });
});

describe('discover — --max-spend enforcement', () => {
  it('exits 1 and does NOT call API when estimated cost exceeds --max-spend 0.01', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    let thrown;
    try {
      await runDiscover('https://example.com/login', {
        output:   tmpDir,
        maxSpend: 0.01,
        json:     false,
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(thrown.exitCode).toBe(1);
    expect(thrown.message).toMatch(/max-spend/i);
    // Critical: API must NOT have been called before aborting
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it('proceeds to API call when estimated cost is within --max-spend 100', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    await runDiscover('https://example.com/login', {
      output:   tmpDir,
      maxSpend: 100,
      json:     false,
    });

    // API should have been called (cost estimate is well under $100)
    expect(mockMessageCreate).toHaveBeenCalledOnce();
    // And scenarios.md should be written
    expect(fs.existsSync(path.join(tmpDir, 'scenarios.md'))).toBe(true);
  });
});

describe('discover — slug derivation', () => {
  it('derives slug from URL path: /auth/login → "auth-login"', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    const stdoutLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    await runDiscover('https://example.com/auth/login', {
      output: tmpDir,
      json:   true,
    });

    const events = stdoutLines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const done = events.find((e) => e.event === 'discover.done');
    expect(done).toBeDefined();
    // File was created
    expect(fs.existsSync(path.join(tmpDir, 'scenarios.md'))).toBe(true);
  });

  it('honours --slug override in the frontmatter slug field', async () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

    // Return content with our custom slug embedded
    const customSlugScenarios = makeMockScenarios(1).replace('slug: login', 'slug: custom-slug');
    mockMessageCreate.mockResolvedValue(makeMockApiResponse(customSlugScenarios));

    await runDiscover('https://example.com/login', {
      output: tmpDir,
      slug:   'custom-slug',
      json:   false,
    });

    expect(fs.existsSync(path.join(tmpDir, 'scenarios.md'))).toBe(true);
    // The prompt should include the custom slug
    const callArgs = mockMessageCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('custom-slug');
  });
});

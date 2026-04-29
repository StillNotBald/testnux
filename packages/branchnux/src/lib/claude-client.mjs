// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * src/lib/claude-client.mjs
 *
 * Centralized Anthropic API wrapper for branchnux commands.
 *
 * Provides:
 *   - Single PRICING constant (source of truth for all commands)
 *   - callClaude()     — wraps client.messages.create with AbortController timeout
 *   - estimateCost()   — token-count → USD estimate
 *   - getClient()      — lazy Anthropic client initializer (dynamic import, once)
 *
 * Consumers: commands/enrich.mjs, commands/codify.mjs, commands/plan.mjs
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL      = 'claude-sonnet-4-6';
export const DEFAULT_MAX_TOKENS = 10_000;
export const API_TIMEOUT_MS     = 60_000;

/**
 * Pricing as of April 2026 — Anthropic published rates.
 * Single source of truth: imported by enrich, codify, and plan.
 * Units: USD per 1M tokens.
 */
export const PRICING = {
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  output:  4.00 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00 },
};

// ── SDK loader (dynamic import, cached) ─────────────────────────────────────

let _AnthropicClass = null;

/**
 * Dynamically imports @anthropic-ai/sdk and caches the constructor.
 * Throws a friendly Error (exitCode 1) if the package is not installed.
 *
 * @returns {Promise<typeof import('@anthropic-ai/sdk').default>}
 */
export async function loadAnthropicClass() {
  if (_AnthropicClass) return _AnthropicClass;
  try {
    const mod = await import('@anthropic-ai/sdk');
    _AnthropicClass = mod.default ?? mod.Anthropic;
    return _AnthropicClass;
  } catch (importErr) {
    if (importErr.code === 'ERR_MODULE_NOT_FOUND' || importErr.code === 'MODULE_NOT_FOUND') {
      const err = new Error(
        '@anthropic-ai/sdk is not installed.\n\n' +
        '  Install with:\n\n' +
        '    npm install @anthropic-ai/sdk\n\n' +
        '  Then re-run your branchnux command.',
      );
      err.exitCode = 1;
      throw err;
    }
    throw importErr;
  }
}

// ── API call ─────────────────────────────────────────────────────────────────

/**
 * Calls the Anthropic Messages API with a timeout guard.
 *
 * @param {{
 *   Anthropic:    Function,   // Anthropic constructor (from loadAnthropicClass)
 *   apiKey:       string,
 *   model:        string,
 *   maxTokens:    number,
 *   systemPrompt: string,
 *   userPrompt:   string,
 * }} p
 * @returns {Promise<import('@anthropic-ai/sdk').Message>}
 */
export async function callClaude({ Anthropic, apiKey, model, maxTokens, systemPrompt, userPrompt }) {
  const client     = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Cost estimation ──────────────────────────────────────────────────────────

/**
 * Estimates cost for a given token count and model.
 *
 * @param {{
 *   inputTokens:  number,
 *   outputTokens: number,
 *   model:        string,
 * }} p
 * @returns {number}  USD cost
 */
export function estimateCost({ inputTokens, outputTokens, model }) {
  const pricing = PRICING[model] ?? PRICING[DEFAULT_MODEL];
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

/**
 * Rough pre-call estimate: converts prompt character count to token count.
 * Uses the heuristic of 4 chars per token.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {number}  estimated input token count
 */
export function estimateInputTokens(systemPrompt, userPrompt) {
  return Math.ceil((systemPrompt.length + userPrompt.length) / 4);
}

// ── Error handling ───────────────────────────────────────────────────────────

/**
 * Handles Anthropic API errors with user-friendly messages.
 * Always throws with an appropriate exitCode.
 *
 * @param {Error & { status?: number, statusCode?: number, headers?: Record<string, string> }} err
 * @param {{
 *   json:     boolean,
 *   slug?:    string,
 *   context?: string,   // extra context string, e.g. "(pass: design-review)"
 *   command:  string,   // 'enrich' | 'codify' | 'plan'
 *   printError: (json: boolean, slug: string|undefined, message: string) => void,
 * }} opts
 */
export function handleApiError(err, { json, slug, context = '', command, printError }) {
  const status = err.status ?? err.statusCode;
  const ctx    = context ? ` ${context}` : '';

  if (status === 401) {
    printError(json, slug,
      `API key is invalid (401 Unauthorized)${ctx}.\n\n` +
      '  Check that CLAUDE_API_KEY is set correctly.\n' +
      '  Get a new key at: https://console.anthropic.com/',
    );
    const e = new Error('API 401 Unauthorized');
    e.exitCode = 2;
    throw e;
  }

  if (status === 429) {
    const retryAfter = err.headers?.['retry-after'] ?? '60';
    printError(json, slug,
      `Rate limit exceeded (429 Too Many Requests)${ctx}.\n\n` +
      `  Retry after: ${retryAfter}s\n\n` +
      '  Options:\n' +
      `    - Wait and re-run: branchnux ${command}${slug ? ' ' + slug : ''}\n` +
      '    - Use --max-tokens to reduce response size\n' +
      '    - Spread requests across multiple sessions',
    );
    const e = new Error('API 429 Rate Limit');
    e.exitCode = 2;
    throw e;
  }

  if (status >= 500) {
    printError(json, slug,
      `Anthropic API server error (${status})${ctx}.\n\n` +
      '  This is a transient error. Retry in a few minutes.\n' +
      '  Status page: https://status.anthropic.com/',
    );
    const e = new Error(`API ${status} Server Error`);
    e.exitCode = 2;
    throw e;
  }

  if (err.name === 'AbortError' || err.message?.includes('abort')) {
    printError(json, slug,
      `API call timed out after ${API_TIMEOUT_MS / 1000}s${ctx}.\n\n` +
      '  Try:\n' +
      '    - Reducing --max-tokens to shorten the response\n' +
      '    - Re-running when the API is less loaded',
    );
    const e = new Error('API call timed out');
    e.exitCode = 2;
    throw e;
  }

  printError(json, slug, `Anthropic API error${ctx}: ${err.message ?? String(err)}`);
  const e = new Error(`API error: ${err.message}`);
  e.exitCode = 2;
  throw e;
}

// Copyright (c) 2026 Chu Ling and LeapNuX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/claude-client.test.mjs
 *
 * Unit tests for src/lib/claude-client.mjs.
 *
 * Covers:
 *   1. Cost estimation for known input/output token counts (estimateCost)
 *   2. PRICING constant is the same object reference across all consumers
 *      (singleton sanity check — no duplicate PRICING tables)
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

import {
  PRICING,
  estimateCost,
  estimateInputTokens,
  DEFAULT_MODEL,
} from '../src/lib/claude-client.mjs';

// ══════════════════════════════════════════════════════════════════════════════
// 1. Cost estimation — known token counts
// ══════════════════════════════════════════════════════════════════════════════

describe('claude-client — estimateCost', () => {
  it('calculates correct USD cost for claude-sonnet-4-6 at known token counts', () => {
    // claude-sonnet-4-6: $3.00 / 1M input, $15.00 / 1M output
    // 1,000 input tokens + 500 output tokens:
    //   input:  (1000 / 1_000_000) * 3.00 = 0.003
    //   output: (500  / 1_000_000) * 15.00 = 0.0075
    //   total:  0.0105
    const cost = estimateCost({
      inputTokens:  1_000,
      outputTokens: 500,
      model:        'claude-sonnet-4-6',
    });
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it('calculates correct USD cost for claude-haiku-4-5', () => {
    // claude-haiku-4-5: $0.80 / 1M input, $4.00 / 1M output
    // 10,000 input + 10,000 output:
    //   input:  (10000 / 1_000_000) * 0.80  = 0.008
    //   output: (10000 / 1_000_000) * 4.00  = 0.04
    //   total:  0.048
    const cost = estimateCost({
      inputTokens:  10_000,
      outputTokens: 10_000,
      model:        'claude-haiku-4-5',
    });
    expect(cost).toBeCloseTo(0.048, 6);
  });

  it('calculates correct USD cost for claude-opus-4-5', () => {
    // claude-opus-4-5: $15.00 / 1M input, $75.00 / 1M output
    // 2,000 input + 1,000 output:
    //   input:  (2000 / 1_000_000) * 15.00 = 0.030
    //   output: (1000 / 1_000_000) * 75.00 = 0.075
    //   total:  0.105
    const cost = estimateCost({
      inputTokens:  2_000,
      outputTokens: 1_000,
      model:        'claude-opus-4-5',
    });
    expect(cost).toBeCloseTo(0.105, 6);
  });

  it('falls back to DEFAULT_MODEL pricing for unknown model names', () => {
    const costUnknown = estimateCost({
      inputTokens:  1_000,
      outputTokens: 500,
      model:        'claude-does-not-exist',
    });
    const costDefault = estimateCost({
      inputTokens:  1_000,
      outputTokens: 500,
      model:        DEFAULT_MODEL,
    });
    expect(costUnknown).toBe(costDefault);
  });

  it('returns 0 for zero tokens', () => {
    const cost = estimateCost({ inputTokens: 0, outputTokens: 0, model: 'claude-sonnet-4-6' });
    expect(cost).toBe(0);
  });
});

describe('claude-client — estimateInputTokens', () => {
  it('approximates 4 chars per token (Math.ceil)', () => {
    // 40-char system + 60-char user = 100 chars → ceil(100/4) = 25 tokens
    const result = estimateInputTokens('a'.repeat(40), 'b'.repeat(60));
    expect(result).toBe(25);
  });

  it('always rounds up (ceil not floor)', () => {
    // 101 chars → ceil(101/4) = 26, NOT 25
    const result = estimateInputTokens('a'.repeat(50), 'b'.repeat(51));
    expect(result).toBe(26);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. PRICING singleton — same object across all consumers
// ══════════════════════════════════════════════════════════════════════════════

describe('claude-client — PRICING singleton sanity check', () => {
  it('PRICING is defined and has the three expected model keys', () => {
    expect(PRICING).toBeDefined();
    expect(PRICING).toHaveProperty('claude-sonnet-4-6');
    expect(PRICING).toHaveProperty('claude-haiku-4-5');
    expect(PRICING).toHaveProperty('claude-opus-4-5');
  });

  it('each PRICING entry has numeric input and output fields', () => {
    for (const [model, rates] of Object.entries(PRICING)) {
      expect(typeof rates.input,  `${model}.input`).toBe('number');
      expect(typeof rates.output, `${model}.output`).toBe('number');
      expect(rates.input).toBeGreaterThan(0);
      expect(rates.output).toBeGreaterThan(0);
    }
  });

  it('PRICING is not duplicated in enrich.mjs (no local const PRICING = {)', () => {
    const enrichSrc = fs.readFileSync(
      path.join(__dirname, '../src/commands/enrich.mjs'),
      'utf-8',
    );
    // Must NOT define its own PRICING constant
    expect(enrichSrc).not.toMatch(/^\s*const PRICING\s*=/m);
    // Must import from claude-client.mjs
    expect(enrichSrc).toContain("from '../lib/claude-client.mjs'");
    expect(enrichSrc).toContain('PRICING');
  });

  it('PRICING is not duplicated in codify.mjs (no local const PRICING = {)', () => {
    const codifySrc = fs.readFileSync(
      path.join(__dirname, '../src/commands/codify.mjs'),
      'utf-8',
    );
    expect(codifySrc).not.toMatch(/^\s*const PRICING\s*=/m);
    expect(codifySrc).toContain("from '../lib/claude-client.mjs'");
    expect(codifySrc).toContain('PRICING');
  });

  it('PRICING is not duplicated in plan.mjs (no local const PRICING = {)', () => {
    const planSrc = fs.readFileSync(
      path.join(__dirname, '../src/commands/plan.mjs'),
      'utf-8',
    );
    expect(planSrc).not.toMatch(/^\s*const PRICING\s*=/m);
    expect(planSrc).toContain("from '../lib/claude-client.mjs'");
    expect(planSrc).toContain('PRICING');
  });

  it('PRICING object in claude-client.mjs is the sole canonical copy', () => {
    // Read claude-client.mjs and count how many `const PRICING` definitions exist
    const clientSrc = fs.readFileSync(
      path.join(__dirname, '../src/lib/claude-client.mjs'),
      'utf-8',
    );
    const matches = clientSrc.match(/^\s*export const PRICING\s*=/gm) ?? [];
    expect(matches.length).toBe(1);
  });
});

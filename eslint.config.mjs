// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * eslint.config.mjs
 *
 * ESLint v9 flat config for testnux.
 *
 * Rules:
 *   - ESM (type: "module" in package.json)
 *   - @eslint/js recommended as the base
 *   - no-unused-vars: warn, underscore-prefix allowed
 *   - no-undef: error (catches missing imports)
 *   - Apache-2.0 file-header: documented below as a future addition
 *
 * Apache-2.0 header check:
 *   A custom eslint-plugin-header (or eslint-plugin-license-header) rule can
 *   enforce that every file starts with the SPDX header comment. This dep is NOT
 *   installed by default to keep the zero-dep install lean. To enable:
 *     npm install --save-dev eslint-plugin-header
 *   Then add to this config:
 *     import header from 'eslint-plugin-header';
 *     plugins: { header }
 *     rules: { 'header/header': [2, 'line', '// SPDX-License-Identifier: Apache-2.0'] }
 *
 * Ignored paths:
 *   - node_modules/   (ESLint v9 ignores by default, listed here for clarity)
 *   - examples/       (third-party / generated demo assets)
 *   - dist/           (compiled output)
 *   - test/fixtures/  (any future fixture files with intentionally bad code)
 */

import js from '@eslint/js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'examples/**',
      'test/fixtures/**',
      'coverage/**',
    ],
  },

  // ── Base: @eslint/js recommended ────────────────────────────────────────────
  js.configs.recommended,

  // ── src/ + bin/ + test/ — ESM source files ──────────────────────────────────
  {
    files: ['src/**/*.mjs', 'bin/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Node.js built-ins available in ESM modules
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        globalThis: 'readonly',
        structuredClone: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        ReadableStream: 'readonly',
        WritableStream: 'readonly',
      },
    },
    rules: {
      // ── Unused variables ───────────────────────────────────────────────────
      'no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          // Allow variables prefixed with _ (intentionally unused / pattern match)
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ── Undefined globals ──────────────────────────────────────────────────
      'no-undef': 'error',

      // ── General quality ────────────────────────────────────────────────────
      'no-console': 'off',            // CLI tool — console output is intentional
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-var': 'error',              // ESM always; no var
      'prefer-const': 'warn',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
    },
  },
];

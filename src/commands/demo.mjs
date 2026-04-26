// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/commands/demo.mjs
 *
 * Implements `testnux demo`.
 *
 * The demo command is the "aha moment" for first-time users:
 *   1. Run npx playwright test against examples/demo-dashboard/spec.ts
 *   2. Call `testnux report` on the resulting folder
 *   3. Open the generated HTML in the default browser
 *
 * v0.1 STUB — demo-dashboard content ships in the next agent run.
 *
 * When completing this for v0.2:
 *   [ ] Port the widgetly demo app target (examples/demo-dashboard/)
 *   [ ] Wire up npx playwright test --reporter=list examples/demo-dashboard/spec.ts
 *   [ ] Capture stdout/stderr and surface live progress
 *   [ ] On success: call runReport() then open the HTML
 *   [ ] On failure: print the failing TC(s) and exit 1
 *   [ ] Support --no-open to suppress browser launch (CI-friendly)
 *
 * v0.1 placeholder — see launch plan v0.2 for completion.
 */

/**
 * @param {{ json: boolean }} opts
 */
export async function runDemo(opts = {}) {
  const { json = false } = opts;

  const message =
    'v0.1 demo target: examples/demo-dashboard/ — content coming in next agent run. ' +
    'The demo will run Playwright against a bundled widgetly-style app and open the HTML report.';

  if (json) {
    process.stdout.write(
      JSON.stringify({
        event: 'demo.stub',
        message,
        status: 'pending',
      }) + '\n',
    );
  } else {
    console.log('');
    console.log('🚀  TestNUX — Demo');
    console.log('');
    console.log('   v0.1 demo target is coming in the next release.');
    console.log('');
    console.log('   When ready, `testnux demo` will:');
    console.log('     1. Spin up the bundled widgetly demo app');
    console.log('     2. Run the full Playwright test suite (examples/demo-dashboard/spec.ts)');
    console.log('     3. Generate XLSX + HTML report automatically');
    console.log('     4. Open the HTML report in your default browser');
    console.log('');
    console.log('   In the meantime, try the manual quickstart:');
    console.log('     testnux init my-first-page --industry general');
    console.log('     # edit test-plan.md + spec.ts');
    console.log('     npx playwright test');
    console.log('     testnux report testing-log/<date>_my-first-page/');
    console.log('');
  }

  // Exit 0 — stub is intentional, not an error
}

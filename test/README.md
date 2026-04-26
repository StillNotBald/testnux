# TestNUX — Unit Test Suite

## What is tested

| File | Tests | Focus |
|---|---|---|
| `oscal.test.mjs` | 26 test cases | `toOSCAL()` NIST OSCAL 1.1.2 output structure, UUID/date validation, determinism, `validateOSCAL()` error paths |
| `uat-log.test.mjs` | 24 test cases | `appendEntry()` chain construction, `verifyChain()` integrity (including tampering, deletion, reordering, wrong-secret), `getLatest()` lookup |

### Security-critical coverage (uat-log.test.mjs)

The UAT log is a HMAC-SHA256 hash-chained forensic trail. The following tamper
models are explicitly tested:

- **Content mutation** — changing the `status` field of a mid-chain entry (TC-UAT-11)
- **Signature overwrite** — replacing a valid signature with an arbitrary hex string (TC-UAT-12)
- **Entry deletion** — removing entry 2 of 5; chain breaks at what becomes line 2 (TC-UAT-13)
- **Entry reordering** — swapping entries 2 and 3; chain breaks at line 2 (TC-UAT-14)
- **Wrong HMAC secret** — verifying with a different secret; breaks from line 1 (TC-UAT-15)

All tamper tests assert `valid: false` and a specific `brokenAt` line number.

## What is NOT tested here

- **CLI integration tests** (`appendEntry` / `verifyChain` invoked via the `testnux` binary) — these live in `test/cli.test.mjs` (parallel agent scope).
- **OSCAL round-trip via `sca-oscal` command** — covered in `test/commands.test.mjs`.
- **Playwright E2E tests** — run separately via `npm run test:e2e`.
- **Full JSON Schema validation against the NIST OSCAL metaschema** — `validateOSCAL()` performs minimal required-field checks only; full schema validation requires the `oscal-cli` tool (see `docs/integrations.md`).

## How to run

```bash
# All unit tests (single run)
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# With coverage report
npm run test:coverage
```

Vitest config is at `vitest.config.mjs` in the repo root. Tests run against
Node 20+ with ESM (`"type": "module"` in `package.json`).

## Expected coverage targets

| Module | Statement | Branch | Line |
|---|---|---|---|
| `src/lib/oscal.mjs` | ≥ 85 % | ≥ 75 % | ≥ 85 % |
| `src/lib/uat-log.mjs` | ≥ 90 % | ≥ 85 % | ≥ 90 % |

Run `npm run test:coverage` and open `coverage/index.html` to inspect per-file
coverage details.

# CLI Reference

All commands follow the pattern: `testnux <command> [arguments] [flags]`

---

## Global flags

These flags work on every command.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | false | Emit all output as newline-delimited JSON. Useful for CI/CD pipelines and tool integrations. Exit codes are unchanged. |
| `--dry-run` | boolean | false | Print the actions that would be taken without executing them. Especially important for commands that call paid LLM APIs (v0.2+). |
| `--version` | boolean | — | Print the TestNUX version and exit. |
| `--help` | boolean | — | Print command help and exit. |

---

## `testnux init`

Scaffold a new test-pass folder.

### Synopsis

```
testnux init <slug> [--industry <industry>] [--target-url <url>] [--out <dir>]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `slug` | yes | A short kebab-case identifier for this test pass. Used as the folder name suffix and as the TC prefix. Example: `login` produces `testing-log/<date>_login/` and TC prefix `LOGIN-`. |

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--industry` | string | `general` | Industry standards config to load. v0.1 supports `general` only (OWASP ASVS + WCAG 2.2 AA). |
| `--target-url` | string | `http://localhost:3000` | URL of the page under test. Written into the test-plan frontmatter and spec template. |
| `--out` | string | `testing-log` | Output root directory. The scaffold lands at `<out>/<date>_<slug>/`. |
| `--date` | string | today | Override the date prefix (ISO 8601: `2026-05-01`). Useful for retroactive pass creation. |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Scaffold created successfully |
| `1` | Slug already exists at the target path |
| `2` | Invalid slug (contains spaces or uppercase letters) |
| `3` | Unknown industry flag value |

### Output

```
testing-log/<date>_<slug>/
  test-plan.md        ← Fill this in (~5 min)
  execution-log.md    ← Fill this after running the spec
  spec.ts             ← Playwright spec template
  standards.json      ← Industry standards config
  evidence/           ← Playwright writes screenshots here
```

### Examples

```bash
# Scaffold a login test pass with general industry standards
testnux init login --industry general

# Target a specific URL and output to a custom directory
testnux init dashboard --target-url http://localhost:3737/dashboard --out qa/passes

# JSON output for CI (parses the created path)
testnux init checkout --json
# → {"slug":"checkout","path":"testing-log/2026-05-01_checkout","industry":"general"}

# Dry run — see what would be created without creating it
testnux init login --dry-run
```

---

## `testnux report`

Generate XLSX and self-contained HTML from a test-pass folder.

### Synopsis

```
testnux report <folder> [--open] [--plan-only] [--out <dir>]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `folder` | yes | Path to the test-pass folder, or just the slug if the folder is under the default `testing-log/` root. Both `testnux report login` and `testnux report testing-log/2026-05-01_login` are accepted. |

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--open` | boolean | true | Open the generated HTML in the default browser. Pass `--no-open` to suppress. |
| `--plan-only` | boolean | false | Render the report without an `execution-log.md`. Result column shows empty cells; report header shows a "PLAN ONLY" badge. Use for pre-review of a test plan before execution. |
| `--out` | string | same folder | Write generated files to this directory instead of the test-pass folder. |
| `--standards` | string | auto-detect | Path to a `standards.json` config. Defaults to the one in the test-pass folder, then to the built-in `general` config. |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Report generated successfully |
| `2` | Folder not found or contains no `test-plan.md` |
| `3` | `test-plan.md` parse error — run `testnux validate <folder>` first |
| `4` | Render failed — run with `--json` for structured error details |

### Output

Generated files are written into the test-pass folder (or `--out` if specified):

```
<folder>/
  <slug>-test-plan.xlsx
  <slug>-execution-report.html
```

### Examples

```bash
# Generate report (opens browser automatically)
testnux report login

# Generate without opening the browser (CI mode)
testnux report login --no-open

# Generate from a plan with no execution log yet
testnux report login --plan-only

# JSON output for CI pipeline integration
testnux report login --json --no-open
# → {"pass":"PARTIAL","total":15,"pass_count":12,"fail_count":2,"skip_count":1,"blocked_count":0,"html":"testing-log/2026-05-01_login/login-execution-report.html"}

# Write outputs to a separate artifacts directory
testnux report login --out artifacts/login
```

---

## `testnux validate`

Lint a test-pass folder against the JSON Schema and structural rules.

### Synopsis

```
testnux validate <folder> [--strict] [--fix]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `folder` | yes | Path to the test-pass folder (same resolution as `report`). |

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--strict` | boolean | false | Treat warnings as errors. Returns exit code `1` for any finding. Recommended in CI. |
| `--fix` | boolean | false | Auto-fix trivially correctable issues (trailing whitespace, missing `evidence/` directory, frontmatter date format). Does not modify TC content. |

### What validate checks

| Rule | Level | Description |
|------|-------|-------------|
| Frontmatter schema | Error | All required fields present; types match JSON Schema |
| TC ID format | Error | Each TC-ID matches `^[A-Z]+-\d+$`; no duplicates |
| Priority values | Error | Priority is `P1`, `P2`, `P3`, or `P4` |
| Status values | Warning | Status is one of the 8 canonical values |
| Given/When/Then completeness | Warning | All three sections present per TC |
| Standards alignment | Warning | At least one standard cited per TC |
| Evidence files | Warning | Each PASS TC has a corresponding `evidence/<TC-ID>.png` |
| Execution log | Warning | Execution log present if any TC status is `PASS` or `FAIL` |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No errors (warnings may be present; use `--strict` to treat as errors) |
| `1` | One or more errors found |
| `2` | Folder not found or contains no `test-plan.md` |

### Examples

```bash
# Validate a folder before reporting
testnux validate login

# Strict mode — fail on any finding (recommended in CI)
testnux validate login --strict

# Auto-fix trivial issues, then validate
testnux validate login --fix

# JSON output (one finding object per line)
testnux validate login --json
# → {"level":"error","rule":"tc-id-format","tc":"LOGIN-1","message":"TC ID must be zero-padded: LOGIN-01"}
```

---

## `testnux demo`

Run the bundled demo-dashboard fixture and open the generated report.

### Synopsis

```
testnux demo [--keep] [--no-open]
```

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--keep` | boolean | false | Keep the fixture files after the demo instead of deleting them. Useful for inspecting the generated XLSX and HTML. |
| `--no-open` | boolean | false | Generate the report without opening it in the browser. |

### What `demo` does

1. Downloads the prebuilt demo-dashboard fixture (~1.2 MB) into a temporary directory
2. Runs the bundled Playwright test pass against the fixture
3. Calls `report` to generate the XLSX and HTML
4. Opens the HTML in the default browser
5. Deletes the fixture (unless `--keep` is passed)

The demo uses a pre-recorded fixture so it does not require a running server. Total time: under 90 seconds.

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Demo completed successfully |
| `1` | Download failed (check network) |
| `2` | Report generation failed |

### Examples

```bash
# Run the demo (fastest path to seeing a report)
testnux demo

# Keep the files so you can inspect them
testnux demo --keep

# CI mode — generate without opening browser
testnux demo --no-open --keep
```

---

## `testnux doctor`

Run preflight checks and report on environment health.

### Synopsis

```
testnux doctor [--fix]
```

### Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--fix` | boolean | false | Attempt to auto-fix detected issues (e.g., install missing Playwright browsers). |

### What `doctor` checks

| Check | Fix available | Description |
|-------|--------------|-------------|
| Node version | No | Must be 20 or later |
| Playwright chromium | Yes (`--fix`) | Downloads browsers if missing |
| `CLAUDE_API_KEY` | No | Warns if absent (required for v0.2 LLM features, not for v0.1 core) |
| Prod-build detection | No | Warns if a dev server (`npm run dev`) is running on the target port; tests should run against `npm run build && npm start` |
| Config discovery | No | Reports which `testnux.config.mjs` (if any) will be used |
| Git hooks | No | Warns if a pre-commit hook might interfere with test artefact commits |
| Windows line endings | No | Warns if git `core.autocrlf=true` (can corrupt evidence screenshots) |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed |
| `1` | One or more errors detected |

### Examples

```bash
# Run all preflight checks
testnux doctor

# Run checks and attempt auto-fixes
testnux doctor --fix

# JSON output for automated environment validation
testnux doctor --json
# → [{"check":"node-version","status":"pass","value":"20.11.0"},...]
```

---

## Configuration

TestNUX looks for a config file in the following order:

1. `testnux.config.mjs` in the current directory
2. `testnux.config.mjs` in the git repo root
3. Built-in defaults

Config file example:

```js
// testnux.config.mjs
export default {
  testingLogRoot: "testing-log",       // default: "testing-log"
  requirementsRoot: "requirements",    // default: "requirements"
  sprintLogRoot: "sprint-log",         // default: "sprint-log"
  defaultIndustry: "general",          // default: "general"
  defaultTargetUrl: "http://localhost:3000",
  evidenceDir: "evidence",             // relative to test-pass folder
  openOnReport: true,                  // default: true
};
```

All paths in the config are relative to the config file's directory (normally the repo root).

# TrunkNuX CLI — Execution Log

**Run date:** 2026-04-27
**Test framework:** vitest 4.1.5
**Test runner command:** `npm test`
**Environment:** Node.js 22.x, Windows 11 Pro, testnux v0.2.2
**Result summary:** 16 test files, 370 passed, 0 failed, 0 skipped
**Lint result:** 0 errors, 18 warnings (`npm run lint`). Warnings are unused-var in test files only; no production code affected. Blocked publish? No — prepublishOnly requires 0 errors, not 0 warnings.

---

## Visual evidence note

TrunkNuX is a CLI, not a web app. Per-TC visual evidence (screenshots) is not applicable. Test results are captured via vitest console output and persisted to this execution log. The `trunknux report` command runs in `--plan-only` mode for this pass since there is no UI surface to screenshot. The `evidence/` folder is intentionally empty.

---

## TC Execution Results

| TC ID | Title | Status | Source describe block | Notes |
|---|---|---|---|---|
| TRUNK-01 | CLI help + version | PASS | cli.test.mjs — help + version | --version semver match; --help lists all 17 commands |
| TRUNK-02 | init: scaffold folder structure | PASS | cli.test.mjs — init | Date-prefixed folder + 4 artifacts confirmed |
| TRUNK-03 | init: idempotency | PASS | cli.test.mjs — init | Single folder on re-run |
| TRUNK-04 | init: unknown industry value | PASS | cli.test.mjs — init | Exits cleanly; no stack trace |
| TRUNK-05 | validate: missing folder exits 2 | PASS | cli.test.mjs — validate | Exit 2 + descriptive error |
| TRUNK-06 | validate: valid test-plan.md exits 0 | PASS | cli.test.mjs — validate | Exit 0 on clean frontmatter |
| TRUNK-07 | validate: malformed frontmatter exits 3 | PASS | cli.test.mjs — validate | Exit 3 on invalid status + non-array r_ids |
| TRUNK-08 | validate: --json mode | PASS | cli.test.mjs — validate | JSON line has event key |
| TRUNK-09 | doctor: runs without crashing | PASS | cli.test.mjs — doctor | Exit 0 or 1; no TypeError |
| TRUNK-10 | doctor: --json output shape | PASS | cli.test.mjs — doctor | doctor.result + checks array + passed bool |
| TRUNK-11 | report: missing test-plan.md exits 1 | PASS | cli.test.mjs — report | Exit 1 + helpful error message |
| TRUNK-12 | report: generates XLSX + HTML | PASS | cli.test.mjs — report v0.2 real generator | Both files written |
| TRUNK-13 | rtm: missing requirements/ exits 2 | PASS | cli.test.mjs — rtm | Exit 2 + descriptive error |
| TRUNK-14 | rtm: --dry-run prints RTM to stdout | PASS | cli.test.mjs — rtm | RTM table + R-01 + R-02 in stdout |
| TRUNK-15 | global --json flag: valid JSON on failure | PASS | cli.test.mjs — global flags | JSON parseable even on error |
| TRUNK-16 | malaysia-banking: bundle file structure | PASS | cli.test.mjs — industry-standards: malaysia-banking | industry/version/standards present |
| TRUNK-17 | malaysia-banking: control schema completeness | PASS | cli.test.mjs — industry-standards: malaysia-banking | All 5 fields on every control |
| TRUNK-18 | malaysia-banking: PDPA/BNM/CSA counts | PASS | cli.test.mjs — industry-standards: malaysia-banking | >= 8/12/3/25 counts |
| TRUNK-19 | malaysia-banking: no proprietary references | PASS | cli.test.mjs — industry-standards: malaysia-banking | Zero banned terms |
| TRUNK-20 | report: parsers — parseTestPlanContent | PASS | report.test.mjs | Frontmatter + TC matrix correctly parsed |
| TRUNK-21 | report: parsers — parseExecutionLogContent | PASS | report.test.mjs | Status rows parsed and normalized |
| TRUNK-22 | report: XLSX renderer | PASS | report.test.mjs | ExcelJS workbook written and readable |
| TRUNK-23 | report: HTML renderer | PASS | report.test.mjs | Self-contained HTML; no external HTTP refs |
| TRUNK-24 | report: plan-only mode | PASS | report.test.mjs | --plan-only renders without execution columns |
| TRUNK-25 | sign-pdf: HMAC badge in PDF | PASS | sign-pdf.test.mjs | setContent + mockPdf called; badge in HTML |
| TRUNK-26 | sign-pdf: broken chain badge | PASS | sign-pdf.test.mjs | CHAIN BROKEN banner; no abort |
| TRUNK-27 | sign-pdf: Chrome path env respected | PASS | sign-pdf.test.mjs | executablePath matches CHROME_PATH |
| TRUNK-28 | uat-log: append + chain integrity | PASS | uat-log.test.mjs | 3 JSONL entries with prev_hash + hmac |
| TRUNK-29 | uat-log: verifyChain passes valid chain | PASS | uat-log.test.mjs | Valid chain returns success |
| TRUNK-30 | uat-log: tamper detection — mutation | PASS | uat-log.test.mjs | Chain invalid on mutated entry |
| TRUNK-31 | uat-log: tamper detection — deletion | PASS | uat-log.test.mjs | Chain invalid on deleted entry |
| TRUNK-32 | uat-log: tamper detection — reorder | PASS | uat-log.test.mjs | Chain invalid on swapped entries |
| TRUNK-33 | uat-log: wrong secret fails verify | PASS | uat-log.test.mjs | Wrong secret → invalid chain |
| TRUNK-34 | uat-log: justify-with-llm fallback | PASS | uat-log.test.mjs | Missing key continues without error |
| TRUNK-35 | sign-stale: parseThreshold parses duration strings | PASS | sign-stale.test.mjs | 7d/365d correctly parsed to ms |
| TRUNK-36 | sign-stale: stale entry detection | PASS | sign-stale.test.mjs | Stale entries flagged; clean run silent |
| TRUNK-37 | oscal: toOSCAL returns assessment-results | PASS | oscal.test.mjs — TC-OSCAL-01 | assessment-results key present and object |
| TRUNK-38 | oscal: OSCAL structure — UUID and dates | PASS | oscal.test.mjs | UUIDs and ISO dates valid |
| TRUNK-39 | oscal: validateOSCAL rejects malformed doc | PASS | oscal.test.mjs | OscalValidationError thrown |
| TRUNK-40 | oscal: assessment-log extension merge | PASS | oscal.test.mjs | uat-log entries merged into assessment-log |
| TRUNK-41 | parser: parseRequirements happy path | PASS | parser.test.mjs | R-ID, title, status parsed from ## R-XX |
| TRUNK-42 | parser: parseRequirements edge cases | PASS | parser.test.mjs | Null → []; BLOCKED/PARTIAL/DEFERRED; four-hash ignored |
| TRUNK-43 | br-attestations: appendAttestation + chain | PASS | br-attestations.test.mjs | 2 JSONL entries; chain fields present |
| TRUNK-44 | br-attestations: revokeAttestation | PASS | br-attestations.test.mjs | Revocation appended; prior entries intact |
| TRUNK-45 | br-attestations: N-of-M attestation status | PASS | br-attestations.test.mjs | 2 distinct reviewers counted |
| TRUNK-46 | br-attestations: chain tamper detection | PASS | br-attestations.test.mjs | Mutated entry → invalid chain |
| TRUNK-47 | visual: parseViewport | PASS | visual.test.mjs | 1280x800 and 1920X1080 parsed |
| TRUNK-48 | visual: resolveUrl and parseUrlsFlag | PASS | visual.test.mjs | TC-ID=URL map built correctly |
| TRUNK-49 | visual: decideDiffStatus | PASS | visual.test.mjs | PASS below threshold; FAIL above |
| TRUNK-50 | plan: LLM-assisted plan generation with [VERIFY] markers | PASS | plan.test.mjs | [VERIFY] in output; file written |
| TRUNK-51 | plan: --dry-run cost estimate | PASS | plan.test.mjs | No file written; API mock not called |
| TRUNK-52 | discover: LLM scenario generation | PASS | discover.test.mjs | scenarios.md written with GWT blocks |
| TRUNK-53 | discover: --dry-run mode | PASS | discover.test.mjs | No file; no API call |
| TRUNK-54 | codify: generates spec with requestSubmit + afterEach | PASS | codify.test.mjs | requestSubmit + afterEach in output |
| TRUNK-55 | codify: --max-spend gate | PASS | codify.test.mjs | API not called; exit 1 with estimate |
| TRUNK-56 | enrich: append-only marker boundaries | PASS | enrich.test.mjs | Human content preserved; no duplication |
| TRUNK-57 | enrich: [VERIFY] markers on enrichment blocks | PASS | enrich.test.mjs | [VERIFY] at start of each block |
| TRUNK-58 | batch-plan: parallel pipeline with failure isolation | PASS | batch.test.mjs | One failure does not abort batch |
| TRUNK-59 | sca-sanitize: XSS payload stripped from SCA markdown | PASS | sca-sanitize.test.mjs | script/onerror stripped; SCA content intact |
| TRUNK-60 | graph: buildGraph and Graph structure | PASS | graph.test.mjs | Graph nodes/edges correct |

**Total: 60/60 PASS, 0 FAIL, 0 SKIPPED**

---

## Skipped / blocked TCs

None. All 60 mapped TCs have PASS status backed by the 370/370 vitest result.

---

## Failure analysis

No failures to analyze. Vitest result: 370 passed, 0 failed across 16 test files.

---

## Lint summary

`npm run lint` exit code: 0
Errors: 0
Warnings: 18 (unused-var in test files — `buildXlsx` in report.test.mjs, `vi` in visual.test.mjs, and similar test-only imports). No production code warnings.

---

## Known limitations

1. TRUNK-06 (R-CMD-06 / mcp command): v0.2.x stub behavior only — the full MCP server is planned for v0.3. The stub exits 1 cleanly; no test covers the full MCP protocol yet.
2. Evidence folder is empty for this CLI surface pass. This is intentional and honest. The report runs in `--plan-only` mode.
3. Cross-platform CI matrix (Windows / macOS / Linux) not yet configured. Tests pass on Windows 11 only for this run.
4. ESLint warnings (18) in test files are expected and documented; they do not affect publishability (0 errors).

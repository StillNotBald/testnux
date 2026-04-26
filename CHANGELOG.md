# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.1.1] - 2026-04-26

### Fixed
- `testnux validate` no longer rejects scaffolded templates as errors. Placeholder R-IDs (`R-XX`, `R-YY`, `R-ZZ`) and tc_prefix placeholders (`MYPROJ`, `YOUR-PREFIX`, `EXAMPLE`, `TBD`, etc.) now produce **warnings** instead of errors with exit code 0. Use `--strict` to treat warnings as errors. Real invalid formats (e.g., `RR-1`, `r-01`) still error. — Closes the `init → validate` UX bug surfaced in the v0.1.0 self-test.

### Added
- New rule `r_ids.placeholder` and `tc_prefix.placeholder` in validate output (warning level by default).

---

## [0.1.0] - 2026-04-26

### Added
- First public npm release. CLI surface includes `init`, `report`, `validate`, `demo`, `doctor`, `rtm`, `sca`, `discover`, `plan`, `codify`, `enrich`, `batch-plan`, `br`, `sign`, `env`, `visual`, `mcp` (17 commands).
- Templates for test-plan, spec.ts, README, business-requirements, SCA v1.0, uat-log.jsonl.
- 6 industry standards bundles: general, fintech, healthcare, gov, edu, ecommerce (~140 controls total).
- JSON Schema for test-plan frontmatter validation.
- `examples/demo-dashboard/` with sample HTML execution report (1344 lines, self-contained), sample SCA, sample UAT sign-off log, sample test plan.
- 152 unit tests covering parser, graph, OSCAL emit, HMAC chain (10 security-critical tamper-detection tests), CLI smoke, discover Claude API integration, SCA HTML sanitization.
- Branch protection on `main` (linear history, required CI checks, force-push blocked, deletion blocked).
- Repo security: secret scanning, push protection, Dependabot security + version updates, Private Vulnerability Reporting, CODEOWNERS.

### Removed
- Internal dogfooding artifacts (`sprint-log/`, `testing-log/`, `requirements/`) — meta-narrative of how testnux was built; not relevant to OSS users.
- v0.3 integrations folder (`integrations/gstack/`, `integrations/claude-code-mcp/`) — feature is on the roadmap (v0.3 target) but the in-progress code did not belong in the v0.1 release.

### Security
- HMAC-SHA256 hash-chained UAT sign-off log with tamper detection (mutation, signature overwrite, deletion, reordering, wrong-secret).
- DOMPurify sanitization on SCA-markdown → HTML rendering (strips `<script>`, `<iframe>`, `<form>`, all `on*` event handlers, `javascript:` URLs).
- SSRF + URL-scheme allowlist on `discover` command (rejects `file://`, `javascript:`, `data:`, AWS metadata IPs).
- CI lint script blocks PRs that introduce `fetch()`, `child_process`, `eval()`, or unrestricted `process.env.*` in template files.
- GitHub Actions pinned to commit SHAs (with version-tag comments for Dependabot).
- DCO check via inline shell script (zero external action dep — supply-chain safe).
- OSCAL UUID generation uses RFC-4122 v5 (`uuid` package) with stable namespace.

---

## [0.0.1] - 2026-04-26

### Added
- Initial project scaffold: CLI entry point, command structure, templates, schemas, and docs. (Internal pre-publish version; not on npm.)

[Unreleased]: https://github.com/StillNotBald/testnux/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/StillNotBald/testnux/releases/tag/v0.1.1
[0.1.0]: https://github.com/StillNotBald/testnux/releases/tag/v0.1.0
[0.0.1]: https://github.com/StillNotBald/testnux/releases/tag/v0.0.1

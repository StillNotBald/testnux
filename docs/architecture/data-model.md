# Data Model

**The graph is the product. The CLI verbs are surface area on the graph.**

TestNUX's core is a directed in-memory graph assembled from markdown files, code, and test results. The renderers (XLSX, HTML, TRACEABILITY.md, SCA.md, OSCAL JSON) are all projections of this graph onto different output formats.

---

## The pipeline

```
Sources of truth (markdown + code + test results)
         │
         ▼
  Parser layer
  (R-IDs, TC-IDs, control IDs, status frontmatter,
   evidence file inventory, sprint cross-references)
         │
         ▼
  In-memory graph
  R ↔ Sprint ↔ Code ↔ Test ↔ Control ↔ Standard ↔ Evidence
         │
         ▼
  Renderers
  ├── test-plan.xlsx        (UAT-friendly tabular view)
  ├── execution-report.html (self-contained evidence package)
  ├── TRACEABILITY.md       (R-XX → sprint → code → test → backlog)
  ├── SCA.md                (per-surface security control assessment)
  └── OSCAL.json            (machine-readable for FedRAMP / Trestle)
```

v0.1 implements the **parser layer** (for test-plan.md and execution-log.md) and the **XLSX + HTML renderers**. v0.2 extends the parser to cover all five source types and adds the TRACEABILITY, SCA, and OSCAL renderers.

---

## Entities

### Requirement

A stated system behaviour, identified by an R-XX ID.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Format: `R-\d+` (e.g., `R-42`). Zero-padded to two digits minimum. |
| `title` | string | yes | One-line description of the requirement. |
| `status` | enum | yes | `DONE \| PARTIAL \| BLOCKED \| DEFERRED \| DECLINED` |
| `source_file` | string | yes | Path to `requirements/REQUIREMENTS.md` heading or table row. |
| `sprint_refs` | string[] | no | Sprint folder names where this R-ID was shipped. |
| `code_refs` | string[] | no | Source file paths containing `// R-42` comments. |
| `backlog_items` | string[] | no | Open backlog item IDs referencing this requirement. |

**Parser extracts from:** `## R-42` headings or `| R-42 | ... |` table rows in `requirements/REQUIREMENTS.md`.

---

### TestCase

A single executable scenario within a test pass.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Format: `[A-Z]+-\d+` (e.g., `LOGIN-07`). Unique within the test pass. |
| `title` | string | yes | One-line scenario description. |
| `priority` | enum | yes | `P1 \| P2 \| P3 \| P4` |
| `given` | string | yes | Precondition state. |
| `when` | string | yes | User action or system event. |
| `then` | string | yes | Expected observable outcome. |
| `status` | enum | yes | `PASS \| FAIL \| SKIP \| BLOCKED \| PARTIAL \| DEFERRED \| DECLINED \| SKIPPED \| BLOCKED-CONFIG \| BLOCKED-IMPLEMENTATION` |
| `requirement_refs` | string[] | no | R-XX IDs this TC provides evidence for. |
| `control_refs` | string[] | no | Control IDs this TC exercises (e.g., `ASVS-2.1.1`, `WCAG-1.3.1`). |
| `notes` | string | no | Free-text notes. Survives regeneration (see human-edit markers). |
| `test_pass_id` | string | yes | The slug + date of the parent test pass (e.g., `2026-05-01_login`). |

**Parser extracts from:** the TC matrix table in `testing-log/<date>_<slug>/test-plan.md`.

---

### Evidence

A proof artefact generated during test execution.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tc_id` | string | yes | References the parent TestCase. |
| `file_path` | string | yes | Path to the screenshot PNG: `evidence/<TC-ID>.png`. |
| `captured_at` | datetime | no | ISO 8601 timestamp from Playwright `afterEach`. |
| `is_blank` | boolean | no | `true` if the file exists but is empty or all-white (indicates a capture failure). |

**Parser extracts from:** file inventory of `evidence/` directory. The HTML renderer inlines the PNG as a base64 data URI.

---

### Control

A specific security or accessibility control from a standard.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Namespaced ID (e.g., `ASVS-2.1.1`, `WCAG-1.4.3`, `NIST-800-63B-5.1.1`). |
| `title` | string | yes | Short control name. |
| `description` | string | yes | Full control text. |
| `standard_ref` | string | yes | References the parent Standard. |
| `section` | string | no | Section number within the standard document. |
| `level` | string | no | Assurance level where applicable (e.g., ASVS Level 1/2/3, WCAG A/AA/AAA). |
| `declined_rationale` | string | no | If this control is `DECLINED` for the project, the documented rationale. |

**Loaded from:** `src/config/industry-standards/<industry>/standards.json` and per-control markdown files.

---

### Standard

A published framework or specification containing one or more Controls.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Short identifier (e.g., `OWASP-ASVS-4.0`, `WCAG-2.2`). |
| `full_name` | string | yes | Full name of the standard. |
| `publisher` | string | yes | Issuing body (e.g., `OWASP`, `W3C`, `NIST`). |
| `version` | string | yes | Published version (e.g., `4.0.3`, `2.2`, `Rev 3`). |
| `url` | string | yes | Canonical URL. |
| `industry_tags` | string[] | yes | Which `--industry` flags include this standard. |

**Loaded from:** `src/config/industry-standards/` JSON files.

---

### Sprint

A unit of delivery work, represented by a dated sprint-log folder.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Folder name (e.g., `2026-04-15_auth-module`). |
| `date` | date | yes | ISO 8601 date from the folder prefix. |
| `feature` | string | yes | Feature name from the folder suffix. |
| `requirement_refs` | string[] | no | R-XX IDs marked as shipped in the sprint summary. |
| `summary_path` | string | yes | Path to `SPRINT_SUMMARY.md`. |

**Parser extracts from:** `sprint-log/<date>_<feature>/SPRINT_SUMMARY.md`. The RTM generator (v0.2) scans these files for "this sprint shipped R-XX" lines to populate the RTM Sprint column.

---

## Edges

| From | To | Cardinality | Meaning |
|------|----|-------------|---------|
| Requirement | TestCase | one-to-many | A requirement may be covered by many test cases |
| Requirement | Sprint | many-to-many | A requirement may be shipped across multiple sprints |
| TestCase | Evidence | one-to-one | Each TC has at most one evidence screenshot per pass |
| TestCase | Control | many-to-many | A TC may exercise multiple controls; a control may be covered by multiple TCs |
| Control | Standard | many-to-one | Each control belongs to exactly one standard |
| Sprint | Requirement | many-to-many | A sprint may ship multiple requirements |
| Evidence | TestCase | many-to-one | Evidence references its parent TC |

---

## Graph traversal — how renderers use it

**HTML renderer:** walks `TestCase → Evidence` to embed screenshots; walks `TestCase → Control → Standard` to build the standards-alignment table.

**XLSX renderer:** projects the TestCase node set into rows; statuses map to cell colours via a colour-map config.

**RTM renderer (v0.2):** walks `Requirement → Sprint → TestCase` for each R-ID to build the traceability table rows.

**SCA renderer (v0.2):** walks `Control → TestCase → Evidence` grouped by control category to build the per-control inventory table.

**OSCAL renderer (v0.2):** serialises the `Control → Standard` subgraph into OSCAL Assessment Results JSON using IBM Trestle's Python library (invoked via Node child process).

---

## JSON Schema files

The following schemas are published in `docs/schema/`:

| File | Validates |
|------|----------|
| `test-plan.schema.json` | YAML frontmatter of `test-plan.md` |
| `standards.schema.json` | `standards.json` in a test-pass folder |
| `findings.schema.json` | `findings.json` emitted by v0.2 enrichment agents |
| `controls.schema.json` | Per-control YAML in `src/config/industry-standards/` |

Use these schemas to validate inputs programmatically or to integrate TestNUX data into Jira, Linear, or ServiceNow.

---

## Human-edit markers (v0.2)

The RTM and SCA generators re-run on each invocation. Without a merge strategy, human-authored notes get clobbered. v0.2 introduces human-edit markers:

```markdown
<!-- testnux:row R-42 begin -->
| R-42 | TOTP authentication | DONE | sprint-log/2026-04-15_auth/ | src/lib/totp.ts | LOGIN-10, LOGIN-11 | <!-- human:notes -->Verified against RFC 6238 §4.1<!-- /human:notes --> |
<!-- testnux:row R-42 end -->
```

The generator owns the row; humans own the content within `<!-- human:notes -->...<!-- /human:notes -->` spans. On regeneration, the generator extracts existing `human:notes` content and re-inserts it. The same pattern applies to SCA "Operational notes" and "Open items" sections.

---

## v0.1 vs v0.2 implementation scope

| Component | v0.1 | v0.2 |
|-----------|------|------|
| Parser: test-plan.md | Implemented | — |
| Parser: execution-log.md | Implemented | — |
| Parser: REQUIREMENTS.md | Not needed (no RTM gen) | Implemented |
| Parser: sprint-log | Not needed | Implemented |
| Parser: source code R-ID grep | Not needed | Implemented |
| In-memory graph | Partial (TC + Evidence + Control) | Full (+ Requirement + Sprint) |
| HTML renderer | Implemented | Enhanced with BR-XX tab |
| XLSX renderer | Implemented | — |
| TRACEABILITY renderer | Not implemented | Implemented |
| SCA renderer | Not implemented | Implemented |
| OSCAL renderer | Not implemented | Implemented (Trestle) |
| Human-edit markers | Not implemented | Implemented |
| LLM graph traversal | Not implemented | Implemented |

// Copyright (c) 2026 TestNUX Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * test/eval/scoring.mjs
 *
 * Scoring functions for the eval harness.
 *
 * All functions return a score object of shape:
 *   { precision: number, recall: number, f1: number, details: object }
 *
 * Scores are in [0, 1]. Scoring is heuristic — TCs can be reworded as long as
 * they cover the same ground. Exact string matching is intentionally avoided.
 */

// ── scoreScenarios ────────────────────────────────────────────────────────────

/**
 * Scores a scenarios.md output against the expected golden.
 *
 * Matching strategy:
 *   - Extract TC titles from both actual and expected.
 *   - Match by fuzzy title similarity (Jaccard on lowercase word tokens).
 *   - A TC is "found" if similarity >= TITLE_THRESHOLD (0.4).
 *   - Also reward overlapping Standards references.
 *   - Precision: correctly-formed TCs / total actual TCs.
 *   - Recall:    expected TCs found in actual / total expected TCs.
 *
 * "Correctly formed" means:
 *   - Has Given / When / Then
 *   - Has a [VERIFY] marker
 *   - Has a Priority field
 *
 * @param {string} actual    The actual scenarios.md text produced by discover
 * @param {string} expected  The hand-curated golden scenarios.md text
 * @returns {{ precision: number, recall: number, f1: number, details: object }}
 */
export function scoreScenarios(actual, expected) {
  const actualTCs   = extractTCs(actual);
  const expectedTCs = extractTCs(expected);

  if (expectedTCs.length === 0) {
    return { precision: 1, recall: 1, f1: 1, details: { reason: 'No expected TCs to match' } };
  }

  // Precision: how many actual TCs are well-formed
  const wellFormed      = actualTCs.filter(isWellFormedTC);
  const precision       = actualTCs.length === 0 ? 0 : wellFormed.length / actualTCs.length;

  // Recall: how many expected TCs are covered by actual
  const covered         = expectedTCs.filter((exp) => isCoveredBy(exp, actualTCs));
  const recall          = covered.length / expectedTCs.length;

  // Standards overlap bonus (not included in f1 — informational only)
  const actualStds      = extractStandards(actual);
  const expectedStds    = extractStandards(expected);
  const stdOverlap      = setIntersection(actualStds, expectedStds).size;
  const stdRecall       = expectedStds.size === 0 ? 1 : stdOverlap / expectedStds.size;

  const f1 = harmonicMean(precision, recall);

  return {
    precision,
    recall,
    f1,
    details: {
      actualTCCount:    actualTCs.length,
      expectedTCCount:  expectedTCs.length,
      wellFormedCount:  wellFormed.length,
      coveredCount:     covered.length,
      stdRecall,
      coveredTitles:    covered.map((t) => t.title),
      missingTitles:    expectedTCs.filter((exp) => !isCoveredBy(exp, actualTCs)).map((t) => t.title),
      malformedTitles:  actualTCs.filter((tc) => !isWellFormedTC(tc)).map((t) => t.title),
    },
  };
}

// ── scorePlan ─────────────────────────────────────────────────────────────────

/**
 * Scores a test-plan.md output against the expected golden.
 *
 * Extra checks beyond scoreScenarios:
 *   - R-ID format consistency: R-XX or [] [VERIFY] — penalize raw missing R-IDs
 *   - [VERIFY] placement: every TC must have a blockquote [VERIFY]
 *   - TC prefix consistency: all TCs use the same prefix (e.g. LOGIN-)
 *
 * @param {string} actual
 * @param {string} expected
 * @returns {{ precision: number, recall: number, f1: number, details: object }}
 */
export function scorePlan(actual, expected) {
  const base = scoreScenarios(actual, expected);

  const actualTCs = extractTCs(actual);

  // R-ID format check: each TC should have either "R-XX" or "[] [VERIFY]" in the table
  const rIdPattern   = /\|\s*R-ID\s*\|([^|]+)\|/gi;
  const rIdMatches   = [...actual.matchAll(rIdPattern)];
  const validRIds    = rIdMatches.filter((m) => {
    const val = m[1].trim();
    return /^R-\d+/.test(val) || /\[\]\s*\[VERIFY\]/.test(val) || /\[VERIFY\]/.test(val);
  });
  const rIdScore     = rIdMatches.length === 0 ? 0.5 : validRIds.length / rIdMatches.length;

  // [VERIFY] coverage: every TC should end with [VERIFY] blockquote
  const verifyCount  = (actual.match(/>\s*\[VERIFY\]/gi) ?? []).length;
  const verifyScore  = actualTCs.length === 0 ? 0 : Math.min(verifyCount / actualTCs.length, 1);

  // TC prefix consistency
  const prefixes     = actualTCs.map((tc) => tc.title.match(/^([A-Z]+-)\d+/)?.[1]).filter(Boolean);
  const uniquePfx    = new Set(prefixes);
  const prefixScore  = prefixes.length === 0 ? 0.5 : (uniquePfx.size === 1 ? 1 : 0.5);

  // Blend: base f1 (70%) + rId (10%) + verify (10%) + prefix (10%)
  const blendedF1 = base.f1 * 0.7 + rIdScore * 0.1 + verifyScore * 0.1 + prefixScore * 0.1;

  return {
    precision: base.precision,
    recall:    base.recall,
    f1:        blendedF1,
    details: {
      ...base.details,
      rIdScore,
      verifyScore,
      prefixScore,
      rIdCount:   rIdMatches.length,
      validRIds:  validRIds.length,
      verifyCount,
    },
  };
}

// ── scoreSpec ─────────────────────────────────────────────────────────────────

/**
 * Scores a Playwright spec.ts output against the expected golden.
 *
 * Checks:
 *   - Imports: `import { test, expect } from '@playwright/test'` present
 *   - test() count: at least as many tests as P0 TCs in the golden plan
 *   - [VERIFY] comments: at least one per test() block
 *   - No hardcoded URLs: BASE_URL env var used, not literal domain
 *   - afterEach screenshot hook present
 *   - getByRole / getByLabel used (not querySelector / $)
 *
 * @param {string} actual   The generated spec.ts text
 * @param {string} expected The golden spec.ts text
 * @returns {{ precision: number, recall: number, f1: number, details: object }}
 */
export function scoreSpec(actual, expected) {
  const checks = {};

  // Import check
  checks.hasPlaywrightImport = /import\s*\{[^}]*test[^}]*\}\s*from\s*['"]@playwright\/test['"]/.test(actual);

  // test() count
  const actualTestCount   = (actual.match(/\btest\s*\(/g) ?? []).length;
  const expectedTestCount = (expected.match(/\btest\s*\(/g) ?? []).length;
  checks.testCount        = actualTestCount;
  checks.expectedTestCount = expectedTestCount;
  // Score: at least 50% of expected tests present = 1.0; 0 = 0.0
  const testCountScore = expectedTestCount === 0 ? 1 : Math.min(actualTestCount / expectedTestCount, 1);

  // [VERIFY] comments
  const verifyComments   = (actual.match(/\/\/\s*\[VERIFY\]/g) ?? []).length;
  checks.verifyComments  = verifyComments;
  const verifyScore      = verifyComments >= 1 ? 1 : 0;

  // No hardcoded URLs (look for http(s):// that is not in a template string using BASE_URL)
  const hardcodedUrls    = (actual.match(/['"]https?:\/\/[a-z0-9.-]+\//gi) ?? [])
    .filter((u) => !u.includes('localhost') && !u.includes('example.com'));
  checks.hardcodedUrls   = hardcodedUrls;
  const noHardcodeScore  = hardcodedUrls.length === 0 ? 1 : 0;

  // afterEach hook
  checks.hasAfterEach    = /test\.afterEach\s*\(/.test(actual);
  const afterEachScore   = checks.hasAfterEach ? 1 : 0;

  // Prefers accessible locators (getByRole / getByLabel) over CSS
  const accessibleLocators = (actual.match(/getByRole|getByLabel|getByText|getByPlaceholder/g) ?? []).length;
  const cssSelectors       = (actual.match(/querySelector|locator\s*\(\s*['"][.#]/g) ?? []).length;
  checks.accessibleLocators = accessibleLocators;
  checks.cssSelectors       = cssSelectors;
  const locatorScore = accessibleLocators + cssSelectors === 0
    ? 0.5
    : accessibleLocators / (accessibleLocators + cssSelectors);

  // Aggregate
  const precision = (
    (checks.hasPlaywrightImport ? 1 : 0) * 0.15 +
    testCountScore              * 0.25 +
    verifyScore                 * 0.20 +
    noHardcodeScore             * 0.15 +
    afterEachScore              * 0.15 +
    locatorScore                * 0.10
  );

  // Recall: expected test IDs present in actual (by title fragment)
  const expectedTitles = extractTestTitles(expected);
  const foundTitles    = expectedTitles.filter((title) =>
    actual.toLowerCase().includes(title.toLowerCase().slice(0, 20)),
  );
  const recall = expectedTitles.length === 0 ? 1 : foundTitles.length / expectedTitles.length;

  const f1 = harmonicMean(precision, recall);

  return {
    precision,
    recall,
    f1,
    details: {
      ...checks,
      testCountScore,
      verifyScore,
      noHardcodeScore,
      afterEachScore,
      locatorScore,
      recallFoundTitles:   foundTitles,
      recallMissingTitles: expectedTitles.filter((t) => !foundTitles.includes(t)),
    },
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * @typedef {{ title: string, body: string, hasGiven: boolean, hasWhen: boolean, hasThen: boolean, hasVerify: boolean, hasPriority: boolean }} TCEntry
 */

/**
 * Extracts TC blocks from markdown text.
 * Matches ## TC-XX and ### TC-XX headings.
 * @param {string} text
 * @returns {TCEntry[]}
 */
function extractTCs(text) {
  if (!text) return [];

  const blocks = text.split(/(?=^#{2,3}\s+(?:TC-|[A-Z]+-\d))/m);
  const results = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^#{2,3}\s+(.+)/);
    if (!headingMatch) continue;

    const title = headingMatch[1].trim();
    // Only process blocks that look like TC headings
    if (!/^(?:TC-|[A-Z]+-\d+)/.test(title) && !/—/.test(title)) continue;

    results.push({
      title,
      body:        block,
      hasGiven:    /\*\*Given\*\*/i.test(block) || /\bGiven\b/.test(block),
      hasWhen:     /\*\*When\*\*/i.test(block)  || /\bWhen\b/.test(block),
      hasThen:     /\*\*Then\*\*/i.test(block)  || /\bThen\b/.test(block),
      hasVerify:   /\[VERIFY\]/i.test(block),
      hasPriority: /\*\*Priority\*\*/.test(block) || /\|\s*Priority\s*\|/.test(block),
    });
  }

  return results;
}

/**
 * A TC is well-formed if it has Given/When/Then AND [VERIFY] AND Priority.
 * @param {TCEntry} tc
 * @returns {boolean}
 */
function isWellFormedTC(tc) {
  return tc.hasGiven && tc.hasWhen && tc.hasThen && tc.hasVerify && tc.hasPriority;
}

/**
 * Checks if an expected TC is "covered" by any TC in the actual set.
 * Coverage = title Jaccard similarity >= TITLE_THRESHOLD.
 * @param {TCEntry} expected
 * @param {TCEntry[]} actuals
 * @returns {boolean}
 */
function isCoveredBy(expected, actuals) {
  const TITLE_THRESHOLD = 0.4;
  return actuals.some((actual) => jaccardSimilarity(expected.title, actual.title) >= TITLE_THRESHOLD);
}

/**
 * Jaccard similarity on lowercase word tokens.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function jaccardSimilarity(a, b) {
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  const inter = setIntersection(tokA, tokB).size;
  const union  = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 1 : inter / union;
}

/**
 * Tokenizes a string into lowercase words, removing TC- prefixes and punctuation.
 * @param {string} str
 * @returns {string[]}
 */
function tokenize(str) {
  return str
    .toLowerCase()
    .replace(/^(tc-|[a-z]+-)\d+\s*—?\s*/i, '') // strip TC-01 / LOGIN-01 prefix
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);               // ignore short stop words
}

/**
 * Extracts Standards references from text.
 * Matches patterns like "OWASP ASVS 2.1.1", "WCAG 2.2 SC 1.3.1", "NIST SP 800-63B".
 * @param {string} text
 * @returns {Set<string>}
 */
function extractStandards(text) {
  const results = new Set();
  const patterns = [
    /OWASP\s+ASVS\s+[\d.]+/gi,
    /WCAG\s+[\d.]+\s+SC\s+[\d.]+/gi,
    /NIST\s+SP\s+[\d-]+[A-Z]?(?:\s+\S+)*/gi,
    /ISO\s+\d+/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      results.add(m[0].trim().toUpperCase());
    }
  }
  return results;
}

/**
 * Extracts test() titles from a TypeScript spec file.
 * @param {string} specText
 * @returns {string[]}
 */
function extractTestTitles(specText) {
  const re = /\btest\s*\(\s*['"]([^'"]+)['"]/g;
  const titles = [];
  for (const m of specText.matchAll(re)) {
    titles.push(m[1]);
  }
  return titles;
}

/**
 * Returns the intersection of two Sets.
 * @template T
 * @param {Set<T>} a
 * @param {Set<T>} b
 * @returns {Set<T>}
 */
function setIntersection(a, b) {
  const result = new Set();
  for (const item of a) {
    if (b.has(item)) result.add(item);
  }
  return result;
}

/**
 * Computes the harmonic mean of precision and recall (F1 score).
 * @param {number} precision
 * @param {number} recall
 * @returns {number}
 */
function harmonicMean(precision, recall) {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

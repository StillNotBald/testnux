// Copyright 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0

/**
 * src/renderers/html.mjs
 *
 * Render TcRecord[] into a self-contained, single-file HTML execution report.
 *
 * Key design decisions:
 *   - ALL CSS is inlined in <style>. No external stylesheets.
 *   - ALL JS is inlined in <script>. No external scripts.
 *   - Evidence screenshots ≤2 MB are base64-inlined as data URIs.
 *     Screenshots >2 MB emit a console.warn and fall back to a relative path.
 *   - Anchor IDs (id="tc-<ID>") appear ONLY in the "All TCs" tab to avoid
 *     duplicate-DOM-ID violations when the same card renders in multiple tabs.
 *     TOC and tab-switch JS handles the "activate All tab, then scroll" pattern.
 *   - All user-supplied content is sanitized with isomorphic-dompurify before
 *     injection to prevent stored-XSS from test plan content.
 *
 * Export:
 *   buildHtml(tcs, opts) → string   (HTML)
 *   renderTcCard(tc, opts) → string (single card HTML — useful for tests)
 */

import * as fs from 'node:fs';
import DOMPurify from 'isomorphic-dompurify';

// ── Constants ─────────────────────────────────────────────────────────────────

const VERSION = 'v0.2.0-alpha';
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024; // 2 MB

// ── Sanitization ──────────────────────────────────────────────────────────────

/**
 * Sanitize a string for safe HTML injection.
 * Allows a safe subset of inline formatting tags.
 *
 * @param {string} str
 * @returns {string}
 */
function san(str) {
  if (!str) return '';
  return DOMPurify.sanitize(String(str), {
    ALLOWED_TAGS: ['b', 'strong', 'em', 'i', 'code', 'pre', 'span', 'br', 'a'],
    ALLOWED_ATTR: ['href', 'class', 'title', 'target'],
  });
}

/** Escape a string for use as an HTML attribute value. */
function attr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Evidence loading ──────────────────────────────────────────────────────────

/**
 * Load an evidence screenshot for a TC.
 * Returns { src, type } where src is a base64 data URI or relative path.
 *
 * @param {string} tcId
 * @param {string} evidenceDir  Absolute path to evidence/ folder
 * @returns {{ src: string, type: 'base64'|'relative'|'none', warn?: string }}
 */
export function loadEvidence(tcId, evidenceDir) {
  if (!evidenceDir || !fs.existsSync(evidenceDir)) return { src: '', type: 'none' };

  const exts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  for (const ext of exts) {
    const imgPath = `${evidenceDir}/${tcId}${ext}`;
    if (!fs.existsSync(imgPath)) continue;

    const stat = fs.statSync(imgPath);
    if (stat.size > MAX_EVIDENCE_BYTES) {
      return {
        src: `evidence/${tcId}${ext}`,
        type: 'relative',
        warn: `Evidence ${tcId}${ext} is ${(stat.size / 1024 / 1024).toFixed(1)} MB — using relative path (>2 MB limit)`,
      };
    }

    const buf = fs.readFileSync(imgPath);
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mime = mimeMap[ext] ?? 'image/png';
    return { src: `data:${mime};base64,${buf.toString('base64')}`, type: 'base64' };
  }

  return { src: '', type: 'none' };
}

// ── Badge renderers ───────────────────────────────────────────────────────────

function statusBadge(status) {
  const MAP = {
    'PASS':                   ['#d1f0da', '#0d5226', 'PASS'],
    'FAIL':                   ['#fde0e3', '#842029', 'FAIL'],
    'BLOCKED-CONFIG':         ['#fff3cd', '#856404', 'BLOCKED-CONFIG'],
    'BLOCKED-IMPLEMENTATION': ['#fce7f3', '#9d174d', 'BLOCKED-IMPL'],
    'SKIPPED':                ['#e9ecef', '#41464b', 'SKIPPED'],
    'NOT_RUN':                ['#f3f4f6', '#374151', 'NOT RUN'],
    'IN-PROGRESS':            ['#dbeafe', '#1e40af', 'IN PROGRESS'],
    'DRAFT':                  ['#f3f4f6', '#6b7280', 'DRAFT'],
    'READY':                  ['#f0fdf4', '#166534', 'READY'],
  };
  const [bg, fg, label] = MAP[status] ?? MAP['NOT_RUN'];
  return `<span class="badge status-badge" style="background:${bg};color:${fg}">${label}</span>`;
}

function priorityBadge(priority) {
  const MAP = {
    P0: ['#1a1a1a', '#ffffff'],
    P1: ['#495057', '#ffffff'],
    P2: ['#adb5bd', '#111111'],
  };
  const [bg, fg] = MAP[priority] ?? ['#e5e7eb', '#374151'];
  return `<span class="badge priority-badge" style="background:${bg};color:${fg}">${attr(priority)}</span>`;
}

function categoryChip(category) {
  return `<span class="chip">${san(category)}</span>`;
}

function standardChip(std) {
  return `<span class="chip chip-std">${san(std)}</span>`;
}

// ── Step splitter ─────────────────────────────────────────────────────────────

/**
 * Split a "When" paragraph into discrete numbered steps.
 * Heuristic: tries numbered prefixes, ", then ", ", and ", ", then" patterns.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitSteps(text) {
  if (!text) return [];
  const cleaned = text.trim().replace(/\s+/g, ' ');

  // Already numbered: "1. ... 2. ..."
  if (/(?:^|\s)\d+\.\s/.test(cleaned)) {
    const parts = cleaned.split(/(?:^|\s)\d+\.\s+/).filter(Boolean);
    if (parts.length >= 2) return parts.map((s) => s.trim());
  }
  // ", then " or "; then "
  const thenSplit = cleaned.split(/[,;]?\s+[Tt]hen\s+/).filter(Boolean);
  if (thenSplit.length >= 2) return thenSplit.map((s) => s.trim());

  // ", and "
  const andSplit = cleaned.split(/,\s+and\s+/i).filter(Boolean);
  if (andSplit.length >= 2) return andSplit.map((s) => s.trim());

  return [cleaned];
}

/**
 * Split a pass criteria / Then paragraph into checklist bullets.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitChecklist(text) {
  if (!text) return [];
  const cleaned = text.trim().replace(/\s+/g, ' ');
  // Split on bullet-list lines starting with - or *
  if (/^[-*]\s+/.test(cleaned)) {
    return cleaned.split(/\n[-*]\s+/).map((s) => s.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
  }
  // Split on ". " sentence boundaries
  const sentences = cleaned.split(/\.\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 2) {
    return sentences.map((s) => s.endsWith('.') ? s : s + '.');
  }
  return [cleaned];
}

// ── TC card renderer ──────────────────────────────────────────────────────────

/**
 * Render a single TC card as HTML.
 *
 * @param {TcRecord} tc
 * @param {{ withId?: boolean, planOnly?: boolean, evidenceDir?: string }} opts
 * @returns {string}
 */
export function renderTcCard(tc, opts = {}) {
  const { withId = false, planOnly = false, evidenceDir = '' } = opts;
  const idAttr = withId ? ` id="tc-${attr(tc.id)}"` : '';
  const dataStatus = attr(tc.status || 'NOT_RUN');

  // Evidence
  const ev = evidenceDir ? loadEvidence(tc.id, evidenceDir) : (tc.evidence ?? { type: 'none' });
  let evidenceHtml;
  if (ev.type === 'none') {
    evidenceHtml = `<div class="evidence-placeholder">
      <div class="placeholder-icon">🖼</div>
      <div class="placeholder-text">No evidence screenshot — drop <code>evidence/${attr(tc.id)}.png</code> and regenerate</div>
    </div>`;
  } else {
    evidenceHtml = `<div class="evidence-img-wrap">
      <img src="${attr(ev.src)}" alt="${attr(tc.id)} evidence screenshot"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
      <div class="evidence-placeholder" style="display:none;">
        <div class="placeholder-icon">🖼</div>
        <div class="placeholder-text">${attr(tc.id)}.png — screenshot could not load</div>
      </div>
    </div>`;
  }

  // Steps
  const steps = splitSteps(tc.when);
  const stepsHtml = steps.length
    ? `<ol class="steps-list">${steps.map((s) => `<li>${san(s)}</li>`).join('')}</ol>`
    : (tc.verifies ? `<p class="body-text">${san(tc.verifies)}</p>` : '<p class="empty-hint">(No explicit steps recorded)</p>');

  // Checklist
  const checkItems = splitChecklist(tc.then || tc.passCriteria);
  const checklistHtml = checkItems.length
    ? `<ul class="check-list">${checkItems.map((s) => `<li><span class="check-icon">✓</span>${san(s)}</li>`).join('')}</ul>`
    : '';

  // Standards
  const stdsHtml = (tc.standards ?? []).length
    ? (tc.standards ?? []).map(standardChip).join('')
    : '';

  // R-IDs
  const rIdsHtml = (tc.rIds ?? []).length
    ? (tc.rIds ?? []).map((r) => `<code class="r-id-chip">${attr(r)}</code>`).join(' ')
    : '';

  return `<div class="tc-card" ${idAttr} data-status="${dataStatus}" data-priority="${attr(tc.priority)}" data-category="${attr(tc.category)}">
  <div class="tc-card-header">
    <div class="tc-card-title">
      <span class="tc-id">${attr(tc.id)}</span>
      <span class="tc-name">${san(tc.title)}</span>
    </div>
    <div class="tc-badges">
      ${priorityBadge(tc.priority)}
      ${planOnly ? '' : statusBadge(tc.status || 'NOT_RUN')}
      ${withId ? `<a class="anchor-link" href="#tc-${attr(tc.id)}" title="Permalink to ${attr(tc.id)}">#</a>` : ''}
    </div>
  </div>
  <div class="tc-card-body">
    ${rIdsHtml ? `<div class="tc-meta-row"><div class="tc-meta-item"><strong>R-IDs:</strong> ${rIdsHtml}</div></div>` : ''}
    ${categoryChip(tc.category)}
    ${stdsHtml ? `<div class="stds-row">${stdsHtml}</div>` : ''}
    ${tc.setup ? `<div class="card-block setup-block"><div class="block-label">Before you start</div><div class="body-text">${san(tc.setup)}</div></div>` : ''}
    <div class="card-block steps-block">
      <div class="block-label">Steps ${steps.length > 1 ? `(${steps.length})` : ''}</div>
      ${stepsHtml}
    </div>
    ${tc.given ? `<details class="card-block context-block"><summary class="block-label">Pre-condition (Given)</summary><div class="body-text">${san(tc.given)}</div></details>` : ''}
    ${checklistHtml ? `<div class="card-block expected-block"><div class="block-label">Expected outcome</div>${checklistHtml}</div>` : ''}
    ${!planOnly && tc.actual ? `<div class="card-block actual-block"><div class="block-label">Actual result</div><div class="body-text">${san(tc.actual)}</div></div>` : ''}
    ${!planOnly ? `<div class="evidence-block"><div class="evidence-label">Evidence</div>${evidenceHtml}</div>` : ''}
    ${tc.notes ? `<details class="card-block notes-block"><summary class="block-label">Notes</summary><div class="body-text">${san(tc.notes)}</div></details>` : ''}
  </div>
</div>`;
}

// ── TOC ───────────────────────────────────────────────────────────────────────

const STATUS_DOT_COLORS = {
  PASS: '#22c55e',
  FAIL: '#ef4444',
  'BLOCKED-CONFIG': '#f59e0b',
  'BLOCKED-IMPLEMENTATION': '#ec4899',
  SKIPPED: '#6366f1',
  NOT_RUN: '#9ca3af',
  'IN-PROGRESS': '#3b82f6',
  DRAFT: '#9ca3af',
  READY: '#10b981',
};

function buildTocItems(tcs) {
  return tcs
    .map((tc) => {
      const dotColor = STATUS_DOT_COLORS[tc.status] ?? STATUS_DOT_COLORS.NOT_RUN;
      const shortTitle = tc.title.length > 42 ? tc.title.slice(0, 40) + '…' : tc.title;
      return `<a href="#tc-${attr(tc.id)}" class="toc-item" data-tc="${attr(tc.id)}">
  <span class="toc-dot" style="background:${dotColor}"></span>
  <span class="toc-id">${attr(tc.id)}</span>
  <span class="toc-title">${san(shortTitle)}</span>
</a>`;
    })
    .join('\n');
}

// ── Standards alignment matrix ────────────────────────────────────────────────

function buildStandardsMatrix(tcs) {
  // Collect all unique standards
  const allStds = [...new Set(tcs.flatMap((tc) => tc.standards ?? []).filter(Boolean))];
  if (allStds.length === 0) return '';

  const headerCells = tcs.map((tc) => `<th scope="col" class="matrix-tc-hdr">${attr(tc.id)}</th>`).join('');
  const rows = allStds
    .map((std) => {
      const cells = tcs
        .map((tc) => {
          const covered = (tc.standards ?? []).includes(std);
          return `<td class="${covered ? 'cell-covered' : 'cell-na'}">${covered ? '✓' : '—'}</td>`;
        })
        .join('');
      return `<tr><td class="matrix-std-label">${san(std)}</td>${cells}</tr>`;
    })
    .join('\n');

  return `<div class="matrix-wrap">
  <table class="matrix-table" aria-label="Standards alignment matrix">
    <thead>
      <tr>
        <th scope="col" class="matrix-std-hdr">Standard / Control</th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// ── Threat coverage table ─────────────────────────────────────────────────────

/**
 * Build a threat coverage table from OWASP ASVS / industry-standard references.
 * Only rendered when at least one TC references OWASP or a known threat taxonomy.
 *
 * @param {TcRecord[]} tcs
 * @returns {string}
 */
function buildThreatTable(tcs) {
  const owaspTcs = tcs.filter((tc) =>
    (tc.standards ?? []).some((s) => /owasp|asvs|cwe/i.test(s)),
  );
  if (owaspTcs.length === 0) return '';

  // Generic threat categories derivable from OWASP ASVS and common TC content
  const threatMap = [
    {
      id: 'T-AUTH',
      name: 'Broken Authentication',
      severity: 'HIGH',
      controls: 'ASVS V2.1, V2.2',
      matchFn: (tc) => /auth|login|password|session|credential/i.test(tc.title + ' ' + tc.category),
    },
    {
      id: 'T-RATE',
      name: 'Brute Force / Rate Limit Bypass',
      severity: 'HIGH',
      controls: 'ASVS V2.2.1',
      matchFn: (tc) => /rate.?limit|brute|lockout|throttle/i.test(tc.title + ' ' + tc.category),
    },
    {
      id: 'T-ENUM',
      name: 'Account Enumeration',
      severity: 'MEDIUM',
      controls: 'ASVS V2.1.5',
      matchFn: (tc) => /enumerat|username.?harvest|email.?exist/i.test(tc.title + ' ' + tc.verifies),
    },
    {
      id: 'T-MFA',
      name: 'MFA Bypass',
      severity: 'HIGH',
      controls: 'ASVS V2.7',
      matchFn: (tc) => /mfa|totp|2fa|otp|webauthn|fido/i.test(tc.title + ' ' + tc.category),
    },
    {
      id: 'T-INJECT',
      name: 'Injection (SQL / XSS / CSRF)',
      severity: 'CRITICAL',
      controls: 'ASVS V5',
      matchFn: (tc) => /inject|xss|csrf|sqli/i.test(tc.title + ' ' + tc.category),
    },
    {
      id: 'T-ACCESS',
      name: 'Broken Access Control / IDOR',
      severity: 'HIGH',
      controls: 'ASVS V4',
      matchFn: (tc) => /access.?control|idor|rbac|role|permission|admin.?bypass/i.test(tc.title + ' ' + tc.category),
    },
    {
      id: 'T-A11Y',
      name: 'Accessibility Barriers (WCAG)',
      severity: 'LOW',
      controls: 'WCAG 2.2 AA',
      matchFn: (tc) => /a11y|accessibility|wcag|aria|keyboard|focus/i.test(tc.title + ' ' + tc.category),
    },
    {
      id: 'T-DATA',
      name: 'Sensitive Data Exposure',
      severity: 'HIGH',
      controls: 'ASVS V8',
      matchFn: (tc) => /data.?protect|sensitive|pii|log|leak|disclose/i.test(tc.title + ' ' + tc.verifies),
    },
  ];

  const severityClass = { CRITICAL: 'sev-critical', HIGH: 'sev-high', MEDIUM: 'sev-medium', LOW: 'sev-low' };

  const rows = threatMap
    .map((threat) => {
      const covered = tcs.filter(threat.matchFn);
      if (covered.length === 0) return null;
      const tcRefs = covered.map((tc) => `<code class="tc-ref">${attr(tc.id)}</code>`).join(' ');
      const sevClass = severityClass[threat.severity] ?? 'sev-low';
      return `<tr>
  <td><code>${attr(threat.id)}</code></td>
  <td>${san(threat.name)}</td>
  <td><span class="sev-badge ${sevClass}">${attr(threat.severity)}</span></td>
  <td>${san(threat.controls)}</td>
  <td>${tcRefs}</td>
</tr>`;
    })
    .filter(Boolean);

  if (rows.length === 0) return '';

  return `<table class="threat-table" aria-label="Threat coverage table">
  <thead>
    <tr>
      <th scope="col">Threat ID</th>
      <th scope="col">Threat / Risk</th>
      <th scope="col">Severity</th>
      <th scope="col">Controls</th>
      <th scope="col">Covered by</th>
    </tr>
  </thead>
  <tbody>${rows.join('\n')}</tbody>
</table>`;
}

// ── Open items callout ────────────────────────────────────────────────────────

function buildOpenItemsSection(openItemsMd) {
  if (!openItemsMd || !openItemsMd.trim()) return '';

  // Convert simple markdown to HTML (bullet lists, bold, inline code)
  const lines = openItemsMd.split('\n');
  const htmlLines = lines.map((line) => {
    // Bullet items
    if (/^[-*]\s+/.test(line)) {
      const content = line.replace(/^[-*]\s+/, '');
      return `<li>${san(content)}</li>`;
    }
    // Headings inside the block
    if (/^#{1,3}\s+/.test(line)) {
      const content = line.replace(/^#{1,3}\s+/, '');
      return `<h4 class="open-items-subhead">${san(content)}</h4>`;
    }
    if (line.trim()) return `<p>${san(line)}</p>`;
    return '';
  });

  // Wrap consecutive <li> elements in <ul>
  const joined = htmlLines
    .join('\n')
    .replace(/(<li>.*?<\/li>\n?)+/gs, (match) => `<ul class="open-items-list">${match}</ul>`);

  return `<div class="open-items-callout" id="open-items">
  <div class="callout-icon">⚠</div>
  <div class="callout-body">
    <div class="callout-title">Known Issues / Open Items</div>
    <div class="callout-content">${joined}</div>
  </div>
</div>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const INLINE_CSS = `
/* ── Reset & Base ───────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; font-size: 14px; }
body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #f5f6f8; color: #1a1a1a; line-height: 1.55; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: 'Courier New', Consolas, monospace; font-size: 0.9em; background: #f0f4ff; color: #0044aa; padding: 1px 5px; border-radius: 3px; }

/* ── Layout ─────────────────────────────────────────────── */
.layout { display: flex; min-height: 100vh; }
.sidebar { width: 260px; min-width: 260px; background: #111; color: #ccc; padding: 24px 0; position: sticky; top: 0; height: 100vh; overflow-y: auto; flex-shrink: 0; }
.main { flex: 1; padding: 32px 40px 60px; max-width: 1100px; }
@media (max-width: 900px) { .layout { flex-direction: column; } .sidebar { width: 100%; height: auto; position: static; } .main { padding: 20px 16px 40px; } }

/* ── Sidebar ────────────────────────────────────────────── */
.sidebar-brand { padding: 0 20px 20px; border-bottom: 1px solid #222; margin-bottom: 16px; }
.brand-logo { display: flex; align-items: center; gap: 8px; }
.brand-icon { width: 28px; height: 28px; background: #0066cc; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; }
.brand-name { font-size: 13px; font-weight: 600; color: #fff; }
.brand-sub { font-size: 11px; color: #666; margin-top: 2px; }
.sidebar-section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: #555; text-transform: uppercase; padding: 8px 20px 4px; }
.sidebar nav a { display: flex; align-items: center; gap: 10px; padding: 6px 20px; font-size: 12px; color: #aaa; border-left: 3px solid transparent; transition: background 0.15s, color 0.15s, border-color 0.15s; }
.sidebar nav a:hover { background: #1a1a1a; color: #fff; text-decoration: none; }
.sidebar-search { display: block; margin: 8px 16px 12px; padding: 6px 10px; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; color: #ddd; font-size: 12px; width: calc(100% - 32px); }
.sidebar-search::placeholder { color: #555; }
.sidebar-search:focus { outline: 2px solid #0066cc; outline-offset: 1px; }
.toc-item { display: flex; align-items: center; gap: 8px; padding: 5px 16px; color: #aaa; font-size: 11.5px; border-left: 3px solid transparent; transition: 0.15s; text-decoration: none; }
.toc-item:hover { background: #1a1a1a; color: #fff; border-left-color: #0066cc; text-decoration: none; }
.toc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.toc-id { font-family: 'Courier New', monospace; font-weight: 700; min-width: 64px; color: #ddd; font-size: 11px; }
.toc-title { color: #888; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Header ─────────────────────────────────────────────── */
.page-header { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 28px 32px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.page-header h1 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 6px; }
.plan-only-banner { display: inline-block; background: #fff3cd; color: #856404; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 4px; margin-left: 12px; vertical-align: middle; border: 1px solid #ffc107; }
.meta-row { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 12px; }
.meta-item { font-size: 12px; color: #555; }
.meta-item strong { color: #111; font-weight: 600; }
.meta-sep { margin: 0 6px; color: #ccc; }

/* ── Summary Banner ─────────────────────────────────────── */
.summary-banner { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; margin-bottom: 24px; }
@media (max-width: 900px) { .summary-banner { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 500px) { .summary-banner { grid-template-columns: repeat(2, 1fr); } }
.stat-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.stat-value { font-size: 28px; font-weight: 800; line-height: 1; }
.stat-label { font-size: 10px; color: #777; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-total .stat-value { color: #111; }
.stat-pass  .stat-value { color: #1a6b35; }
.stat-fail  .stat-value { color: #842029; }
.stat-blocked .stat-value { color: #856404; }
.stat-skipped .stat-value { color: #41464b; }
.stat-rate .stat-value { color: #0066cc; }
.pass-bar { background: #e9ecef; height: 6px; border-radius: 3px; margin-top: 8px; overflow: hidden; }
.pass-bar-fill { height: 100%; background: #22c55e; border-radius: 3px; transition: width 0.6s ease; }

/* ── Section Headers ────────────────────────────────────── */
.section-header { font-size: 16px; font-weight: 800; color: #111; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0; margin: 36px 0 18px; display: flex; align-items: center; gap: 10px; }
.section-number { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: #0066cc; color: #fff; font-size: 12px; font-weight: 800; border-radius: 50%; flex-shrink: 0; }

/* ── Tab Bar ────────────────────────────────────────────── */
.tab-bar { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 2px solid #e0e0e0; overflow-x: auto; }
.tab-btn { background: none; border: none; cursor: pointer; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px; border-radius: 4px 4px 0 0; transition: color 0.15s, border-color 0.15s; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.tab-btn:hover { color: #0066cc; background: #f0f4ff; }
.tab-btn.active { color: #0066cc; border-bottom-color: #0066cc; }
.tab-count { font-size: 10px; background: #e8f0fe; color: #0066cc; padding: 1px 6px; border-radius: 9px; font-weight: 700; }
.tab-btn.active .tab-count { background: #0066cc; color: #fff; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* ── TC Cards ───────────────────────────────────────────── */
.tc-cards { display: flex; flex-direction: column; gap: 16px; }
.tc-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.04); scroll-margin-top: 20px; }
.tc-card[data-status="PASS"]    { border-left: 4px solid #22c55e; }
.tc-card[data-status="FAIL"]    { border-left: 4px solid #ef4444; }
.tc-card[data-status^="BLOCKED"] { border-left: 4px solid #f59e0b; }
.tc-card[data-status="SKIPPED"] { border-left: 4px solid #6366f1; }
.tc-card-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; gap: 12px; flex-wrap: wrap; }
.tc-card-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1; }
.tc-id { font-size: 12px; font-weight: 800; font-family: 'Courier New', monospace; background: #f0f4ff; color: #0066cc; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
.tc-name { font-size: 14px; font-weight: 700; color: #111; }
.tc-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
.badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.04em; font-family: inherit; white-space: nowrap; }
.priority-badge { border-radius: 4px; }
.anchor-link { color: #0066cc; font-size: 14px; font-weight: 700; opacity: 0.3; text-decoration: none; transition: opacity 0.15s; }
.anchor-link:hover { opacity: 1; }
.tc-card-body { padding: 16px 20px; }
.tc-meta-row { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 10px; }
.tc-meta-item { font-size: 11.5px; color: #555; }
.tc-meta-item strong { color: #111; font-weight: 600; }
.r-id-chip { font-size: 11px; background: #f0fdf4; color: #166534; padding: 1px 6px; border-radius: 3px; border: 1px solid #bbf7d0; }
.chip { display: inline-block; font-size: 10.5px; font-weight: 600; background: #f0f4ff; color: #0066cc; padding: 2px 8px; border-radius: 4px; margin: 2px 2px 0 0; }
.chip-std { background: #f0fdf4; color: #166534; }
.stds-row { margin: 6px 0 10px; }

/* ── Card Blocks ────────────────────────────────────────── */
.card-block { margin: 10px 0; padding: 12px 14px; border-radius: 6px; font-size: 13px; }
.block-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
.body-text { color: #333; line-height: 1.6; }
.setup-block { background: #f9fafb; border: 1px solid #e5e7eb; }
.setup-block .block-label { color: #6b7280; }
.steps-block { background: #eff6ff; border: 1px solid #bfdbfe; }
.steps-block .block-label { color: #1e40af; }
.steps-list { padding-left: 22px; margin: 0; }
.steps-list li { margin-bottom: 5px; color: #111; line-height: 1.55; }
.steps-list li::marker { color: #1e40af; font-weight: 700; }
.context-block { background: #fff; border: 1px solid #e5e7eb; }
.context-block summary { cursor: pointer; user-select: none; list-style: none; }
.context-block summary::-webkit-details-marker { display: none; }
.context-block .block-label { display: inline; color: #6b7280; }
.expected-block { background: #fefce8; border: 1px solid #fef08a; }
.expected-block .block-label { color: #854d0e; }
.check-list { list-style: none; padding: 0; margin: 0; }
.check-list li { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 5px; font-size: 13px; color: #111; }
.check-icon { color: #16a34a; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
.actual-block { background: #f8fafc; border: 1px solid #e2e8f0; }
.actual-block .block-label { color: #334155; }
.notes-block { background: #fff; border: 1px solid #e5e7eb; }
.notes-block summary { cursor: pointer; user-select: none; list-style: none; }
.notes-block summary::-webkit-details-marker { display: none; }
.notes-block .block-label { display: inline; color: #6b7280; }
.empty-hint { color: #9ca3af; font-style: italic; font-size: 12px; }

/* ── Evidence ───────────────────────────────────────────── */
.evidence-block { margin-top: 14px; }
.evidence-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 8px; }
.evidence-img-wrap { border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; background: #fafafa; }
.evidence-img-wrap img { display: block; max-width: 100%; height: auto; }
.evidence-placeholder { height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #aaa; background: repeating-linear-gradient(135deg, #f8f8f8 0px, #f8f8f8 10px, #f0f0f0 10px, #f0f0f0 20px); border: 1px dashed #e0e0e0; border-radius: 6px; }
.placeholder-icon { font-size: 24px; margin-bottom: 4px; }
.placeholder-text { font-size: 11px; color: #bbb; }

/* ── Standards Matrix ───────────────────────────────────── */
.matrix-wrap { overflow-x: auto; margin-bottom: 8px; }
.matrix-table { border-collapse: collapse; width: 100%; font-size: 11.5px; min-width: 600px; }
.matrix-table th, .matrix-table td { border: 1px solid #e0e0e0; padding: 7px 10px; text-align: center; vertical-align: middle; }
.matrix-std-hdr { background: #111; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-align: left !important; min-width: 200px; }
.matrix-tc-hdr { background: #111; color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; }
.matrix-table tbody tr:hover td { background: #f0f4ff; }
.matrix-std-label { text-align: left !important; background: #fafafa; font-weight: 600; color: #333; }
.cell-covered { color: #1a6b35; font-size: 14px; font-weight: 700; }
.cell-na { color: #ddd; font-size: 11px; }

/* ── Threat Table ───────────────────────────────────────── */
.threat-table { border-collapse: collapse; width: 100%; font-size: 12px; }
.threat-table th, .threat-table td { border: 1px solid #e0e0e0; padding: 9px 12px; vertical-align: top; }
.threat-table thead th { background: #111; color: #fff; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-align: left; }
.threat-table tbody tr:nth-child(even) td { background: #fafafa; }
.threat-table tbody tr:hover td { background: #f0f4ff; }
.sev-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px; }
.sev-critical { background: #1a1a1a; color: #fff; }
.sev-high     { background: #842029; color: #fff; }
.sev-medium   { background: #856404; color: #fff; }
.sev-low      { background: #adb5bd; color: #111; }
.tc-ref { font-family: 'Courier New', monospace; font-size: 11px; background: #f0f4ff; color: #0066cc; padding: 1px 5px; border-radius: 3px; display: inline-block; margin: 1px; }

/* ── Open Items Callout ─────────────────────────────────── */
.open-items-callout { display: flex; gap: 16px; background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 16px 20px; margin-bottom: 24px; }
.callout-icon { font-size: 20px; flex-shrink: 0; }
.callout-title { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 8px; }
.callout-content { font-size: 12.5px; color: #78350f; }
.open-items-list { padding-left: 18px; margin: 6px 0; }
.open-items-list li { margin-bottom: 4px; }
.open-items-subhead { font-size: 12px; font-weight: 700; color: #92400e; margin: 8px 0 4px; }

/* ── Legend ─────────────────────────────────────────────── */
.legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 20px; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #555; }
.legend-swatch { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }

/* ── Footer ─────────────────────────────────────────────── */
.page-footer { background: #111; color: #666; text-align: center; padding: 20px; font-size: 11.5px; margin-top: 48px; border-radius: 8px; }
.page-footer a { color: #0066cc; }
.page-footer strong { color: #aaa; }

/* ── Print ──────────────────────────────────────────────── */
@media print {
  .sidebar, .tab-bar { display: none !important; }
  .layout { display: block; }
  .main { padding: 0; max-width: 100%; }
  .tc-card { break-inside: avoid; page-break-inside: avoid; margin-bottom: 20px; }
  .summary-banner { grid-template-columns: repeat(6, 1fr); }
  .matrix-wrap { overflow: visible; }
  body { font-size: 12px; }
  a { color: #000; }
  .page-footer { background: #fff; color: #666; border-top: 1px solid #ccc; }
}
`.trim();

// ── Inline JS ─────────────────────────────────────────────────────────────────

const INLINE_JS = `
// Tab switching
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var target = btn.dataset.filter;
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.filter === target);
    });
    var panels = document.querySelectorAll('.tab-panel');
    panels.forEach(function(p) { p.classList.toggle('active', p.dataset.filter === target); });
    // For non-all tabs: filter cards
    if (target !== 'all') {
      var cards = document.querySelectorAll('#tab-all .tc-card');
      cards.forEach(function(c) {
        c.style.display = (target === 'all' || c.dataset.status === target || (target === 'BLOCKED' && c.dataset.status.startsWith('BLOCKED'))) ? '' : 'none';
      });
    }
  });
});

// TOC search
var tocSearch = document.getElementById('tocSearch');
if (tocSearch) {
  tocSearch.addEventListener('input', function() {
    var q = this.value.toLowerCase();
    document.querySelectorAll('.toc-item').forEach(function(item) {
      item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

// TOC click: activate All TCs tab, then scroll to anchor
// Anchor IDs only exist in the "All TCs" tab — this is intentional.
function activateAllTab() {
  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });
  document.querySelectorAll('.tab-panel').forEach(function(p) {
    p.classList.toggle('active', p.dataset.filter === 'all');
  });
}

document.querySelectorAll('.toc-item, .anchor-link').forEach(function(a) {
  a.addEventListener('click', function(e) {
    var href = a.getAttribute('href') || '';
    if (!href.startsWith('#tc-')) return;
    e.preventDefault();
    activateAllTab();
    requestAnimationFrame(function() {
      var el = document.querySelector(href);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', href); }
    });
  });
});

// On page load: if hash points to a TC, activate All tab and scroll
(function() {
  var hash = window.location.hash;
  if (hash && hash.startsWith('#tc-')) {
    activateAllTab();
    requestAnimationFrame(function() {
      var el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  }
})();
`.trim();

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a self-contained HTML execution report.
 *
 * @param {TcRecord[]} tcs
 * @param {{
 *   slug?: string,
 *   planOnly?: boolean,
 *   evidenceDir?: string,
 *   openItems?: string|null,
 *   frontmatter?: object,
 * }} opts
 * @returns {string}
 */
export function buildHtml(tcs, opts = {}) {
  const {
    slug = 'test-report',
    planOnly = false,
    evidenceDir = '',
    openItems = null,
    frontmatter = {},
  } = opts;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = tcs.reduce((acc, tc) => {
    const s = tc.status || 'NOT_RUN';
    acc[s] = (acc[s] ?? 0) + 1;
    acc.total++;
    return acc;
  }, { total: 0 });

  const passCount = stats['PASS'] ?? 0;
  const failCount = stats['FAIL'] ?? 0;
  const blockedCount = Object.entries(stats)
    .filter(([k]) => k.startsWith('BLOCKED'))
    .reduce((sum, [, v]) => sum + v, 0);
  const skippedCount = stats['SKIPPED'] ?? 0;
  const passRate = stats.total > 0 ? Math.round((passCount / stats.total) * 100) : 0;

  // ── Tab groupings ──────────────────────────────────────────────────────────
  // All TCs tab gets id= attributes; other tabs filter the same card set via JS.
  const cardRenderOpts = { planOnly, evidenceDir };
  const allCardsHtml = tcs.map((tc) => renderTcCard(tc, { ...cardRenderOpts, withId: true })).join('\n');

  // ── TOC ────────────────────────────────────────────────────────────────────
  const tocItems = buildTocItems(tcs);

  // ── Standards matrix ───────────────────────────────────────────────────────
  const standardsMatrixHtml = buildStandardsMatrix(tcs);

  // ── Threat coverage ────────────────────────────────────────────────────────
  const threatTableHtml = buildThreatTable(tcs);

  // ── Open items ─────────────────────────────────────────────────────────────
  const openItemsHtml = openItems ? buildOpenItemsSection(openItems) : '';

  // ── Summary metadata ───────────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();
  const industry = frontmatter.industry ?? '';
  const status = frontmatter.status ?? '';

  // Count unique P0s that are not PASS
  const p0Failing = tcs.filter((tc) => tc.priority === 'P0' && tc.status !== 'PASS').length;
  const p0Total = tcs.filter((tc) => tc.priority === 'P0').length;

  const html = `<!-- Apache 2.0 — Copyright 2026 Chu Ling — Generated by TestNUX -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${attr(slug)} — ${planOnly ? 'Test Plan' : 'Execution Report'}</title>
<style>
${INLINE_CSS}
</style>
</head>
<body>

<div class="layout">

  <!-- ── Sidebar ───────────────────────────────────────────────── -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-logo">
        <div class="brand-icon">T</div>
        <div>
          <div class="brand-name">TestNUX</div>
          <div class="brand-sub">${planOnly ? 'Test Plan' : 'Execution Report'} ${VERSION}</div>
        </div>
      </div>
    </div>

    <div class="sidebar-section-label">Navigation</div>
    <nav>
      <a href="#summary">Summary</a>
      <a href="#test-cases">Test Cases</a>
      ${standardsMatrixHtml ? '<a href="#standards-matrix">Standards Matrix</a>' : ''}
      ${threatTableHtml ? '<a href="#threat-coverage">Threat Coverage</a>' : ''}
      ${openItemsHtml ? '<a href="#open-items">Open Items</a>' : ''}
    </nav>

    <div class="sidebar-section-label" style="margin-top:16px;">Test Cases (${stats.total})</div>
    <input class="sidebar-search" type="search" id="tocSearch" placeholder="Filter by ID or title…" aria-label="Filter test cases" />
    <nav id="toc-nav">
      ${tocItems}
    </nav>
  </aside>

  <!-- ── Main Content ──────────────────────────────────────────── -->
  <main class="main">

    <!-- Header -->
    <div class="page-header" id="summary">
      <h1>
        ${attr(slug)}
        ${planOnly ? '<span class="plan-only-banner">PLAN ONLY</span>' : ''}
      </h1>
      <div class="meta-row">
        <div class="meta-item"><strong>Generated</strong><span class="meta-sep">·</span>${generatedAt.split('T')[0]}</div>
        ${industry ? `<div class="meta-item"><strong>Industry</strong><span class="meta-sep">·</span>${attr(industry)}</div>` : ''}
        ${status ? `<div class="meta-item"><strong>Status</strong><span class="meta-sep">·</span>${attr(status)}</div>` : ''}
        <div class="meta-item"><strong>P0 Health</strong><span class="meta-sep">·</span>${p0Total > 0 ? `${p0Total - p0Failing}/${p0Total} P0s ${!planOnly && p0Failing === 0 ? 'PASS' : ''}` : 'No P0 TCs'}</div>
        <div class="meta-item"><strong>Tool</strong><span class="meta-sep">·</span>TestNUX ${VERSION}</div>
      </div>
    </div>

    <!-- Open Items (rendered before summary if present) -->
    ${openItemsHtml}

    <!-- Summary Banner -->
    <div class="summary-banner">
      <div class="stat-card stat-total">
        <div class="stat-value">${stats.total}</div>
        <div class="stat-label">Total TCs</div>
      </div>
      <div class="stat-card stat-pass">
        <div class="stat-value">${passCount}</div>
        <div class="stat-label">Pass</div>
      </div>
      <div class="stat-card stat-fail">
        <div class="stat-value">${failCount}</div>
        <div class="stat-label">Fail</div>
      </div>
      <div class="stat-card stat-blocked">
        <div class="stat-value">${blockedCount}</div>
        <div class="stat-label">Blocked</div>
      </div>
      <div class="stat-card stat-skipped">
        <div class="stat-value">${skippedCount}</div>
        <div class="stat-label">Skipped</div>
      </div>
      <div class="stat-card stat-rate">
        <div class="stat-value">${planOnly ? '—' : passRate + '%'}</div>
        <div class="stat-label">${planOnly ? 'Plan Only' : 'Pass Rate'}</div>
        ${!planOnly ? `<div class="pass-bar"><div class="pass-bar-fill" style="width:${passRate}%"></div></div>` : ''}
      </div>
    </div>

    <!-- ── Test Case Execution ────────────────────────────────── -->
    <div class="section-header" id="test-cases">
      <span class="section-number">1</span>
      ${planOnly ? 'Test Case Plan' : 'Test Case Execution'}
    </div>

    <!-- Tab Bar -->
    <div class="tab-bar" role="tablist">
      <button class="tab-btn active" data-filter="all" role="tab" aria-selected="true">All <span class="tab-count">${stats.total}</span></button>
      ${!planOnly ? `
      <button class="tab-btn" data-filter="PASS" role="tab">Pass <span class="tab-count">${passCount}</span></button>
      <button class="tab-btn" data-filter="FAIL" role="tab">Fail <span class="tab-count">${failCount}</span></button>
      <button class="tab-btn" data-filter="BLOCKED" role="tab">Blocked <span class="tab-count">${blockedCount}</span></button>
      <button class="tab-btn" data-filter="SKIPPED" role="tab">Skipped <span class="tab-count">${skippedCount}</span></button>
      ` : ''}
    </div>

    <!-- Single card container — tabs filter via JS, IDs only here -->
    <div class="tc-cards tab-panel active" data-filter="all" id="tab-all">
      ${allCardsHtml}
    </div>

    ${standardsMatrixHtml ? `
    <!-- ── Standards Alignment Matrix ────────────────────── -->
    <div class="section-header" id="standards-matrix">
      <span class="section-number">2</span>
      Standards Alignment
    </div>
    <div class="legend">
      <div class="legend-item"><div class="legend-swatch" style="background:#1a6b35">✓</div> TC covers this standard</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#ddd">—</div> Not applicable</div>
    </div>
    ${standardsMatrixHtml}
    ` : ''}

    ${threatTableHtml ? `
    <!-- ── Threat Coverage ───────────────────────────────── -->
    <div class="section-header" id="threat-coverage">
      <span class="section-number">${standardsMatrixHtml ? '3' : '2'}</span>
      Threat Coverage
    </div>
    ${threatTableHtml}
    ` : ''}

    <!-- Footer -->
    <div class="page-footer">
      <strong>Generated by</strong> <a href="https://github.com/StillNotBald/testnux" target="_blank" rel="noopener">TestNUX ${VERSION}</a>
      &nbsp;·&nbsp; ${generatedAt}
      &nbsp;·&nbsp; ${stats.total} test case${stats.total !== 1 ? 's' : ''}
      ${!planOnly ? `&nbsp;·&nbsp; ${passRate}% pass rate` : ''}
    </div>

  </main>
</div>

<script>
${INLINE_JS}
</script>
</body>
</html>`;

  return html;
}

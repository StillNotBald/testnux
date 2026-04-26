# Credits

TestNUX stands on the shoulders of prior work — most significantly gstack. This document names the sources, describes what was borrowed, and explains how to credit TestNUX in your own work.

---

## gstack — the foundation

**Repository:** https://github.com/garrytan/gstack  
**Author:** Garry Tan  
**License:** OSS (see repo)

TestNUX's discipline, methodology, and structural patterns derive directly from gstack. gstack is a solo-builder OSS framework that defines how to reason about software development in a structured, AI-accelerated way. Without gstack's prior work, TestNUX would not exist in its current form.

**Specific gstack ideas TestNUX builds on:**

| gstack idea | How TestNUX uses it |
|---|---|
| `/plan-ceo-review`, `/plan-eng-review` | The "plan before build" discipline — TestNUX scaffolds plans before specs |
| `/browse` (isolated Playwright Chromium) | Headless browser for QA pipelines; hybrid browser policy for auth flows |
| Memory + sprint-log + testing-log three-track structure | TestNUX's `requirements/` + `sprint-log/` + `testing-log/` is a direct adoption |
| Multi-agent dispatch pattern | v0.2 batch agents (discover/plan/codify/enrich) follow gstack's parallel-dispatch model |
| DCO contributor convention | TestNUX requires `git commit -s` sign-off, following gstack's contributor convention |
| Marker-comment audit trail | The `[VERIFY]` marker on every LLM-generated cell follows gstack's "human must attest AI output" principle |
| Slash-command pattern | `/qa`, `/browse`, `/design-review` integration in TestNUX's recommended workflow |

The three-track discipline deserves specific credit: the idea that `requirements/` (what you said you'd build), `sprint-log/` (what was built), and `testing-log/` (what was tested) should be separate, date-indexed, git-native tracks — that is a gstack pattern. TestNUX codifies it into a CLI and artifact pipeline, but the intellectual origin is gstack.

---

## Other shoulders

**Apex Dashboard**  
The demo target used in TestNUX's example outputs. A Next.js admin dashboard used as a representative SPA for demonstrating test plan generation and HTML report output.

**NIST OSCAL**  
The Open Security Controls Assessment Language. TestNUX's v0.2 OSCAL export targets the assessment-results and component-definition layers of NIST SP 800-18/800-53 OSCAL schemas. NIST work is in the public domain.

**IBM Trestle**  
Python library for OSCAL document management and validation. TestNUX's optional extended OSCAL validation path uses Trestle. Apache 2.0 licensed.  
Repository: https://github.com/IBM/compliance-trestle

**Anthropic Claude**  
The LLM engine behind v0.2 agents. TestNUX is not affiliated with Anthropic. Claude API usage is governed by Anthropic's usage policies and terms of service.  
Website: https://anthropic.com

**Playwright**  
Microsoft's end-to-end testing framework. The evidence-capture engine for per-TC screenshots. Apache 2.0 licensed.  
Website: https://playwright.dev

**Apache Software Foundation**  
TestNUX is released under the Apache License 2.0. The Apache 2.0 license framework, NOTICE file convention, and contributor governance patterns are ASF contributions to the OSS ecosystem.  
Website: https://apache.org

---

## How to credit TestNUX in your work

If TestNUX is part of your regulated compliance workflow, your audit package, or your published methodology:

1. **Preserve `LICENSE` and `NOTICE`** — the Apache 2.0 license requires you to include the license and NOTICE file when distributing or bundling TestNUX.

2. **Trademark restriction** — "TestNUX™" is a trademark of Chu Ling. You may describe your use of the software ("we use TestNUX for evidence generation") but may not use the name in a way that implies endorsement, affiliation, or that your product is TestNUX.

3. **Link to the repository** — https://github.com/StillNotBald/testnux (or the canonical URL at time of your publication)

4. **Sign commits per DCO** — if you contribute back to TestNUX, all commits must be signed off with `git commit -s`. No CLA required. The DCO sign-off is your legal attestation that you have the right to contribute the code.

### Optional citation format

For academic papers, audit reports, or methodology documentation that references TestNUX:

```
Methodology powered by TestNUX (Apache 2.0, github.com/StillNotBald/testnux)
and gstack (github.com/garrytan/gstack).
```

If citing only one, cite both. TestNUX's methodology is not separable from gstack's foundation.

---

## What is not claimed

TestNUX does not claim to have invented:

- The three-track requirements / sprint-log / testing-log structure (gstack)
- The multi-agent dispatch workflow (gstack)
- OSCAL as a standard (NIST)
- The `[VERIFY]` marker concept in AI-assisted compliance (gstack convention)
- Playwright's evidence capture model

What TestNUX adds: a deterministic CLI pipeline that turns the above patterns into reproducible, auditor-ready artifact packages without requiring manual assembly.

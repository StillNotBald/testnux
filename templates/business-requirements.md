---
uat_status: pending
owner: TBD
stakeholders: []
approval_required: true
# required_reviewers — optional; remove this block for single-reviewer sign-off (backward compat).
# When present, `testnux br rtm` tracks N-of-M attestation progress per role.
# Attestations stored in <surface>/br-attestations.jsonl (HMAC-chained, append-only).
# required_reviewers:
#   - role: QA
#     count: 1
#   - role: Compliance
#     count: 1
#   - role: Security
#     count: 1
---

# Business Requirements — {{br_id}}

<!-- testnux: business-requirements-template v1 -->
<!-- Fill in each section. Run `testnux br rtm` to regenerate the UAT traceability matrix. -->

## {{br_id}}

### Business Outcome

> _Describe what the business needs this requirement to achieve. Write in plain language
> from the perspective of the user or stakeholder — not the technical implementation.
> One or two sentences maximum._

### Acceptance Criteria

Each criterion is a verifiable, binary condition.

- [ ] AC-1: 
- [ ] AC-2: 
- [ ] AC-3: 

### Linked R-IDs

<!-- br:linked-r-ids:{{br_id}} -->
_(none yet — run `testnux br link {{br_id}} R-01,R-02`)_

### Linked TC-IDs

_(populated automatically via RTM — run `testnux br rtm`)_

### Stakeholder Sign-Off Matrix

<!-- Updated by `testnux sign`. Do not hand-edit. -->

| Reviewer | Role | Status | Date | Signature (truncated) |
|----------|------|--------|------|-----------------------|
| | | pending | | |

### Notes

_Any additional context, regulatory references, or audit trail links._

---

**Stale acceptance:** Entries older than 90 days must be re-attested.
Run `testnux validate --check stale-uat` to detect expired sign-offs.

# Sign-Off Log — cli

<!-- testnux: sign-off log -->

<!-- Entries appended by `testnux sign`. Do not hand-edit. -->

## Schema

Each entry in `uat-log.jsonl` carries the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `tc_id` | string | Test case ID being signed off (e.g. `SELF-01`) |
| `status` | string | `accepted` \| `rejected` \| `needs-rework` |
| `reviewer` | string | Full name of the human reviewer |
| `reviewer_role` | string | Role of the reviewer (e.g. `Project Lead`, `Security Reviewer`) |
| `ts` | ISO 8601 | UTC timestamp of the sign-off |
| `prev_hash` | hex | HMAC-SHA256 of the raw JSON string of the previous entry (chain anchor) |
| `signature` | hex | HMAC-SHA256 of `tc_id + "|" + status + "|" + reviewer + "|" + ts` |

The `prev_hash` for the very first entry is `HMAC(UAT_SECRET, "")` — a deterministic sentinel
that verifiers can reproduce without any prior state.

## Chain integrity

Run `testnux sign cli --verify` to validate the hash-chain. Any tampered, removed, or
reordered entry will cause `verifyChain()` to return `{ valid: false, brokenAt: <line> }`.

## Current state

No sign-offs yet — run `testnux sign cli` to add an attestation entry.

Once sign-offs are recorded they will appear below, one block per entry, appended automatically.

---

# MC-V1 Closeout

## Decision

**MC-V1 RELEASE DEFERRED — BASELINE PRESERVED**

Current product recommendation: **OPTION C — RELEASE DEFERRED**.

Conditional future option: **OPTION B — SNAPSHOT REFERENCE ONLY WITH FRESHNESS LIMITATION**. It is not approved for automatic assignment, automatic ranking, or final matching confirmation.

## Baseline and preservation

| Area | Recorded state |
|---|---|
| Original WIP | `50a5c16d3953a7c746372fd90bcaf44c99bfa92e`; modified and untracked files preserved |
| Matching implementation worktree | `d18aec47ef7d8fac3307044aa4076d0d5e44fd8a`; existing changes preserved |
| Integration directory | Exists as a filesystem copy, but no `.git` directory was present; integration HEAD is **UNAVAILABLE** |
| Production changes | None |
| Git operations | No commit, push, reset, clean, rebase, or deploy |

The original WIP was not edited, reset, cleaned, or merged. The implementation worktree was not reset or cleaned.

## Preserved matching scope

The isolated implementation and its evidence preserve:

- independent user/worker search;
- user-fixed and worker-fixed comparison modes;
- default waiting filter and all-status view;
- filter, sort, display-column, and comparison-state behavior;
- `match / mismatch / needs review` semantics;
- RC3 rehire and lifecycle contract;
- read-only comparison behavior;
- isolated contract and browser-test harnesses.

The following remain unapproved for production:

- production MatchingComparison connection;
- automatic assignment, ranking, or confirmation;
- automatic projection synchronization;
- broad CRUD migration;
- any claim that a snapshot is current source-consistent.

## Evidence summary

| Evidence | Status | Closeout interpretation |
|---|---|---|
| Baseline/implementation failure separation | PASS | Baseline debt was kept separate from new regressions |
| Matching comparison contract tests | PASS | Core isolated contracts passed, including RC3 status cases |
| Auth/Rules isolated verification | PASS / conditional by candidate Rules revision | Candidate rules were tested in isolated emulators only |
| Authenticated Chromium flows | PASS for isolated flows | Admin/staff access, fixed modes, responsive flows, and management-row entry were exercised |
| Projection adapter equivalence | PASS, limited synthetic scope | Seven equivalence cases passed; not a production integration proof |
| Projection privacy minimization PoC | PASS in isolated projection path | Projection excluded phone, detailed address, counseling, handwriting, and unrelated raw fields |
| Projection freshness after source mutation | NOT TESTED / NOT PROVEN | Projection-only clients cannot observe all later source mutations |
| Automatic invalidation with current write paths | BLOCKED | Existing sequential, legacy, bulk, and possible direct-console paths are not centrally covered |
| `getAfter()` atomic invalidation in a real integrated path | NOT TESTED | No production Rules or write-path migration was performed |
| Full production-scale privacy minimization | NOT MEASURED | Browser transfer reduction was demonstrated only in the isolated PoC |
| Production release safety | BLOCKED | Freshness and source-change coverage are unresolved |

Tests that were not run or measured are not represented as PASS.

## Privacy and freshness risks

The current production comparison path can subscribe to complete `users` and `workers` documents. `cache: false` prevents the comparison hook from using the existing local cache; it does not reduce the fields delivered by Firestore. Limited DOM rendering therefore does not prove limited browser exposure.

The existing staff read contract is broad at document level. Phone numbers, detailed addresses, counseling content, and other sensitive fields may be delivered even when not displayed.

An approved snapshot can become stale after retirement, rehire, assignment, service-status, or source-document changes. Existing sequential updates and legacy paths can partially update bilateral assignment data. Older clients and direct console edits were not proven to participate in invalidation.

Therefore:

- snapshot publication proves a point-in-time snapshot only;
- it does not prove `CURRENT SOURCE CONSISTENCY VERIFIED`;
- a snapshot must not be used alone to finalize a matching decision;
- current source status and assignment must be rechecked before any operational decision.

## Approved operating boundary if Option B is later selected

Option B requires explicit approval for all of the following:

1. snapshot reference-only use;
2. administrator ownership of regeneration and approval;
3. published-at timestamp and stale-risk disclosure;
4. mandatory current-source recheck before final staff judgment;
5. no automatic assignment, ranking, or confirmation;
6. privacy/access review for the projection schema and Rules;
7. rollback and stale-snapshot handling.

If current-source consistency is required instead, a separate migration proposal must cover centralized writes, legacy-client control, direct-console control, bilateral assignment atomicity, and Rules validation before implementation resumes.

## Production impact

`Production Changes: NONE`


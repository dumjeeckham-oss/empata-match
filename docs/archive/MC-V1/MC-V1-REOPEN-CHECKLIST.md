# MC-V1 Reopen Checklist

Reopen implementation only after the applicable items below have explicit approval and evidence.

## Required product decision

- [ ] Choose and approve **Option B snapshot reference-only** or continue with **Option C release deferred**.
- [ ] Confirm that automatic assignment, ranking, and matching confirmation remain out of scope.
- [ ] Define whether snapshot use is advisory only and how staff sees its publish time/stale limitation.

## Privacy and access

- [ ] Complete privacy review for fields delivered to the staff browser.
- [ ] Approve the minimal projection allowlist, including name, region summary, schedule, service types, status, and assignment identifiers only where justified.
- [ ] Exclude phone, detailed address, counseling, handwriting, guardian, health, and unrelated employment-history data.
- [ ] Confirm admin/social-worker read scope and deny roleless/anonymous access.
- [ ] Confirm that no sensitive projection data is written to localStorage/sessionStorage.

## Snapshot operations

- [ ] Assign the administrator responsible for generation, validation, approval, rollback, and stale-snapshot handling.
- [ ] Define regeneration cadence and the maximum tolerated age.
- [ ] Define how failed, incomplete, orphaned, or source-mismatched projections are blocked.
- [ ] Preserve the previous approved version until the replacement is fully validated.
- [ ] Record source digest/version and publish timestamp without claiming current-source consistency unless proven.

## Current-source recheck

- [ ] Before any operational decision, re-read current user and worker status.
- [ ] Re-read current bilateral assignment relationships.
- [ ] Re-check retirement, rehire, service termination, and pending status.
- [ ] Require staff final judgment; do not auto-assign or auto-confirm from the snapshot.
- [ ] Record the recheck result in an approved operational workflow if required by policy.

## If automatic freshness is required

- [ ] Inventory and own every source mutation path, including legacy clients, bulk import, admin correction, and direct console changes.
- [ ] Centralize the relevant writes before relying on invalidation.
- [ ] Define bilateral assignment atomicity and recovery behavior.
- [ ] Obtain approval for Rules changes using `getAfter()` or another independently enforceable invariant.
- [ ] Prove old-client and direct-console behavior is controlled.
- [ ] Re-run isolated failure, concurrency, orphan, and stale-source tests.

## Verification gate

- [ ] Run TypeScript, lint, build, contract tests, Rules tests, and authenticated browser tests in an isolated environment.
- [ ] Verify original WIP and implementation worktree preservation before and after testing.
- [ ] Separate PASS, CONDITIONAL, BLOCKED, NOT TESTED, and NOT MEASURED in the report.
- [ ] Obtain explicit approval before any production-code change, migration, Rules update, or integration.

## Release gate

Do not reopen for production integration unless all required checks are evidenced and the decision is recorded as one of:

- `OPTION B APPROVED — SNAPSHOT REFERENCE ONLY WITH FRESHNESS LIMITATION`
- `OPTION C CONTINUES — RELEASE DEFERRED`
- a separately approved architecture for current-source consistency.


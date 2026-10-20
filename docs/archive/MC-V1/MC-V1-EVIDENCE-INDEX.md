# MC-V1 Evidence Index

This index records the evidence available at closeout. It intentionally distinguishes runtime evidence from source inspection and from unperformed work.

## Source and implementation references

| Area | Reference |
|---|---|
| Comparison page | `src/pages/MatchingComparison.tsx` |
| Comparison logic | `src/lib/matchingComparison.ts` |
| Lifecycle contract | `src/lib/statusLifecycle.ts` |
| Firestore hook | `src/hooks/useFirestore.ts` |
| User management entry | `src/pages/UserManagement.tsx` |
| Worker management entry | `src/pages/WorkerManagement.tsx` |
| Assignment synchronization | `src/lib/assignments.ts` |
| Comparison contract tests | `src/test/matchingComparison.test.ts` |
| Lifecycle tests | `src/test/statusLifecycle.test.ts` |

## Phase evidence

| Phase range | Result captured |
|---|---|
| MC-V1-E1–E6 | Emulator isolation, authenticated browser gates, and external harness recovery; incomplete emulator/runtime items retained as limitations |
| MC-V1-RC1–RC5 | Baseline debt analysis, RC3 rehire contract, regression and browser evidence; no production release approval |
| MC-V1-INT1–INT3 | Isolated integration, management-row entry, bounded Playwright diagnosis; original WIP preserved |
| MC-V1-REL1 | Release readiness review; privacy data-transfer risk remained |
| MC-V1-REL2–REL4 | Projection alternatives, Spark feasibility, integrity and freshness risks; Option B recommended only with limitations |
| MC-V1-REL5–REL8B | Isolated projection publication, Auth/Rules verification, failure and performance PoCs; not production integration |
| MC-V1-REL9–REL11 | Matching equivalence and adapter proof; limited synthetic equivalence, not current-source proof |
| MC-V1-REL12–REL13 | Chromium projection access, privacy checks, P1–P3 baseline measurements, incomplete freshness/orphan coverage |
| MC-V1-REL14–REL15 | Source mutation inventory and atomic invalidation feasibility; current write paths incompatible with safe automatic invalidation |
| MC-V1-REL16 | Final decision: Option C release deferred; Option B remains conditional |

## Runtime evidence classification

### PASS

- Isolated matching comparison contracts and RC3 rehire status cases.
- Isolated authenticated admin/social-worker access and fixed comparison modes.
- Projection adapter equivalence in the recorded seven synthetic cases.
- Projection privacy allowlist checks in the PoC.
- Isolated projection publication and approved-only read behavior for the tested candidate Rules.
- Browser management-row entry and responsive comparison flows in the recorded isolated runs.

### CONDITIONAL

- Candidate Rules results depend on the exact isolated Rules file and hash; production Rules were not changed.
- Projection performance evidence is synthetic and does not establish production-scale behavior.
- Snapshot validity is limited to publish-time verification.

### BLOCKED

- Production release using the current full-document read path without explicit privacy-risk acceptance.
- Automatic projection invalidation across current sequential, legacy, bulk, and possible external write paths.
- Any claim that an approved projection is always current with source data.

### NOT TESTED / NOT MEASURED

- Complete real integrated `getAfter()` invalidation enforcement across all production write paths.
- Production-data-scale browser transfer and heap measurement.
- Complete detection of direct console or every old-client mutation.
- Guaranteed current-source consistency after every source mutation.

## Key measured isolated browser baseline

Recorded projection snapshot timings (milliseconds, three samples each):

| Dataset | Samples |
|---|---:|
| 100 users / 300 workers | 547.3, 235.0, 238.1 |
| 100 users / 500 workers | 554.5, 419.0, 328.1 |
| 500 users / 500 workers | 828.1, 533.2, 455.1 |

Network-byte and Chrome JS-heap measurements were not established and must not be inferred from these timings.

## Protection evidence

- Original WIP remained at `50a5c16d3953a7c746372fd90bcaf44c99bfa92e` with its pre-existing dirty state.
- Matching implementation worktree remained at `d18aec47ef7d8fac3307044aa4076d0d5e44fd8a` with its pre-existing changes.
- The integration directory had no `.git` metadata at closeout, so no integration HEAD was asserted.
- No production Firebase, Auth, Firestore, Rules, Functions, Indexes, commit, push, or deploy was performed.


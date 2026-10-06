# Safe Delete V2 review

Base: isolated HEAD 192d454aef8ba85f5faa331960d2f843b1a72910. No original worktree or production mutations.
This review supersedes the earlier D6/schema-blocked design notes.

## Confirmed threat model

D6 means an authenticated admin/social_worker explicitly submits an acknowledgement for current handwriting and formal counseling state. It does not attest a physical UI click or prohibit that same staff from issuing an otherwise valid SDK acknowledgement.

## Minimal schema

Formal counseling gains revision. New create = 1; missing legacy revision first update = 1; otherwise exactly old+1. Every writer sets updatedAt using a server timestamp to preserve the existing timestamp-based B3 stale-edit check. New createdAt uses server time; an existing createdAt is preserved, including legacy null/string values.
Memo gains transcribedCounselingRevision (initial/reset -1), confirmedBy (initial/reset empty string), confirmedAt (initial/reset null). Persisted V2 memos require all 18 fields. Optional TypeScript properties accommodate pre-V2 in-memory drafts; the API writes explicit defaults/upgrades.
No confirmedMemoRevision/confirmedCounselingRevision fields are needed: both stroke save and transcription are required to clear acknowledgement, while formal modifications advance an independently enforced revision. No new collection, Function or migration is introduced.

## Write coverage

| Writer | Implementation |
| --- | --- |
| Counseling -> useCollection.add | delegates to createCounselingRecord, revision 1 |
| Generic counseling update | delegates to updateCounselingRecord, transaction plus atomic increment; caller revision overridden |
| saveTranscription | transaction calculates next formal revision and binds memo to it; acknowledgement cleared |
| saveRecoveredTranscription | same next formal revision; never recreates deleted memo |
| cascadeUserProfile/cascadeWorkerProfile | unique queued counseling batch updates use increment(1) and serverTimestamp; other collections retain previous behavior |
| Generic counseling delete | remains staff-only; linked memo cannot be deleted while formal record is missing |

Repository source search found no additional formal counseling writers. Salary counselingNotes belongs to a different document model. User/worker detail, Matching, Dashboard and counseling list/search are readers and accept optional revision.

## Rules and confirmation

Rules fixture: src/test/fixtures/handwriting-safe-delete-v2.rules. Demo config: firebase.handwriting-v2-test.json.
Only counseling and counselingHandwritingMemos are excluded from the prior generic wildcard. Dedicated matches enforce their invariants. A structural test removes the two matches and exclusions and reproduces the production snapshot exactly.

The UI still asks for deletion confirmation, then removeAfterTranscription invokes two separate transactions:
1. confirmTranscription reads memo and formal record, checks current handwriting revision plus the expected formal revision, then writes authenticated UID and server acknowledgement time.
2. deleteConfirmed rereads both documents. Rules verify staff, matching target, current transcribed handwriting revision, current transcribed counseling revision, and acknowledgement by the deleting UID.

getAfter on the formal record rejects a batch attempting to change formal counseling and delete the memo atomically. New strokes and re-transcription clear acknowledgement. Formal edits leave physical memo metadata intact but make it invalid by revision mismatch.
New formal records have server createdAt, which cannot change on update; checking it against transcription time also prevents delete/recreate at revision 1 from reusing old confirmation. Legacy non-timestamp createdAt remains compatible.

All failure paths leave memo and local draft intact. Clearing local handwriting occurs only after server-confirmed deletion. No automatic deletion and no revision metadata is displayed to users.

## Verification scope

The normal SDK/Emulator E2E uses actual demo Auth login/claims, actual hook timers/save/listener, 5-second autosave interval, PC reopening, formal transcription, a separately persisted acknowledgement, and safe deletion with formal record retained. Target-selection UI gates are independently exercised through the existing UI-1..6 suite.
An additional unified UI E2E now renders the actual Counseling/Entry/Whiteboard against real demo Auth/Firestore (only Firebase initialization is substituted). It clicks the target selector and handwriting controls, draws real pointer strokes, waits for autosave, clears memory to reopen from server, appends a second stroke to the same memo, transcribes, cancels confirmation (memo retained), then confirms safe deletion (formal record retained). jsdom raster drawing is stubbed; vector/pointer/UI/storage logic is real. This is not a physical browser/stylus test.
Race tests cover R1..R8, stale acknowledgement, same-batch formal edit/delete, and deletion retry after re-transcription. Actual profile cascade functions run against demo Firestore, including legacy and revisioned records.
The historical same-staff SDK acknowledgement proof remains valid under the approved threat model and is not an attack failure.

No Firebase production data/Auth/Rules/Indexes/Functions operations, staging, commit, push or deployment are performed. Operational rollout is a separate review: V2 app and compatible Rules must be coordinated; Rules-only rollout would reject old clients' counseling writes without revision.

## Final Emulator evidence

Demo Emulator command: firebase emulators:exec --project demo-dongbaek-forms --config firebase.handwriting-v2-test.json --only auth,firestore, with HANDWRITING_RULES_FIXTURE pointing to the V2 fixture and the eight related test files running serially.
Result: 60/60 PASS, 8 files PASS. Includes Auth, policy semantics probes, actual SDK lifecycle, actual UI lifecycle, R1..R8, direct attacks, legacy transitions, formal-only recovery, and both real profile cascades. Historical semantics probes are separately named and are not represented as V2 attack denials.

## Changed scope in this V2 phase

- src/lib/counselingRevision.ts (new)
- src/hooks/useFirestore.ts
- src/lib/cascadeSync.ts
- src/types/index.ts
- src/lib/counselingHandwriting.ts
- src/lib/counselingHandwritingApi.ts
- src/hooks/useCounselingHandwriting.ts (metadata reset only; concurrency algorithm preserved)
- src/components/CounselingWhiteboard.tsx (pass displayed/saved formal revision into confirmation)
- src/test/fixtures/handwriting-safe-delete-v2.rules (new candidate, not production Rules)
- firebase.handwriting-v2-test.json (demo-only config)
- src/test/counselingHandwritingRules.test.ts (legacy fixture seeded as existing data; valid formal edits now increment revision)
- src/test/counselingHandwritingPolicy.test.ts
- src/test/counselingHandwritingAutosaveRules.test.tsx
- src/test/counselingSafeDeleteV2.test.ts (new)
- src/test/counselingRevisionWritePaths.test.ts (new)
- src/test/counselingHandwritingEmulatorUI.test.tsx (new)
- docs/handwriting-safe-delete-v2-review.md
- docs/handwriting-safe-delete-v2.patch

The previous phase's Auth repair, test dependency and node setup remain in the isolated environment unchanged. App.tsx, Matching/UserManagement/WorkerManagement page source, useAuth and Firebase production initialization remain identical to the base HEAD.

## Final regression and safety (2026-10-06)

- npx tsc --noEmit -p tsconfig.app.json: PASS.
- npm run lint: PASS, 0 errors / 37 existing warnings.
- npm test -- --maxWorkers=2: 248 PASS / 58 conditional Emulator skips (306 total). Handwriting-related general checks: 147 PASS.
- AUTH-1..5, UI-1..6, B1..B4 and deterministic save/listener race 100/100: PASS. B3 also passes through actual Emulator transactions.
- Final combined demo Emulator suite: 60/60 PASS, 8 test files. Includes the unified real UI E2E; console warnings were already disclosed and the final run limits their output with --silent without changing assertions.
- npm run build: PASS; index-B_8pg3Xi.js and CounselingWhiteboard-BvixhCdG.js. Existing Browserslist age and bundle-size warnings remain.
- Original worktree status and all 24 dirty/untracked hashes unchanged. App.tsx SHA-256: 17B053421592F1E857D2043BCBD7CDFD2922DAAB7CED375CB695E3FF87183B88.
- No original source edits, staging, commit, push, reset/restore/clean/stash or production Firebase/deployment actions.

Disposition: READY FOR PRODUCTION CHANGE REVIEW, not deployed. Physical browser/stylus checks remain NOT TESTED; actual UI component/SDK/Emulator E2E is passing.

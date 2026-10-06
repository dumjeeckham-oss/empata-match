# Safe Delete V2 release preflight

Prepared 2026-10-06. Base: `192d454aef8ba85f5faa331960d2f843b1a72910`.
This is a candidate and deployment plan. No staging, commit, push or production mutation is authorized in this phase.

## Production baseline and rollback

- Web: https://admin.dong100.org/, GitHub Pages.
- Known-good commit: `192d454aef8ba85f5faa331960d2f843b1a72910`.
- Successful Pages workflow: https://github.com/dumjeeckham-oss/empata-match/actions/runs/36950777052.
- Current asset: `/assets/index-CUYVfIw2.js`, Last-Modified `Fri, 02 Oct 2026 01:25:05 GMT`.
- Firebase project: `dong100-51735`.
- Current Rules SHA-256: `04D46D9EC51D167493DD0C92ACEC89DEF0FE1DFB462B699D5E6B7C93B4F71948`.
- Final V2 Rules SHA-256: `5D7418D1948883ACA400F6BBBCAE027D9FD77A337CA3AAB7EA2869E1A8999487`.
- `targetKey` single-field ASC/DESC/ARRAY indexes: READY. No new composite index or index deployment.
- Production snapshot fixture is the exact Rules rollback artifact. A separate rollback directory/config also exists outside the RC.

## Scope and audit

Only the isolated candidate is used. App.tsx, useAuth.ts, Firebase initialization, Matching, UserManagement, WorkerManagement and event architecture test remain the remote base versions.
The shared-file changes are the approved handwritten memo entry, collection constant, optional formal revision type, counseling-only generic create/update delegation and counseling-only profile-cascade revision increment/server timestamp.
All other original WIP is excluded. Historical hardening/boundary review documents and old Emulator configs are excluded from this RC.

`firestore.rules` was assembled from a fresh production API snapshot by inserting only the verified counseling and handwriting matches and exactly two wildcard exclusions. It is byte-identical to the verified V2 candidate, but was not copied blindly from a test fixture.
Removing those two matches and exclusions restores the exact production snapshot. Other collection allow semantics are unchanged. There is no source usage of counseling subcollections; the generic wildcard no longer authorizes descendants of either protected collection.
Full production-to-final diff: `handwriting-release-rules.patch`.

`firebase.release.json` contains only `firestore.rules`; no indexes, Storage, Functions or Hosting configuration.
Emulator config and all three Rules fixtures are test-only. They may be committed for reproducible tests, but must never be selected as deployment targets.

## Deployment sequence

| Sequence | Compatibility and risk | Decision |
| --- | --- | --- |
| Rules then Web | Current client's counseling create/update/profile cascades omit revision and use client timestamps; V2 Rules reject these writes. | REJECT |
| Web then Rules | V2 runtime writes are allowed by existing staff wildcard. Existing weak authorization remains until Rules switch; old open tabs still need reload. | Recommended |
| Minimal-gap consecutive deployment | GitHub Pages Actions and Firebase Rules are separate services and cannot form an atomic transaction. Rules must follow confirmed Web success, never precede it. | Use as the execution discipline for Web then Rules |

After separate final authorization:
1. Recheck remote SHA, production baseline and exact staged file list. Coordinate a brief pause in counseling/handwriting/profile writes for the rollout window; keep the new handwriting flow unused until the V2 Rules hash is verified.
2. Commit the coherent app/Rules/test/config/docs change on an isolated release branch; push its HEAD to remote main without force.
3. Wait for the particular commit's Pages build/deploy success. If it fails, stop; keep old Rules.
4. Confirm production HTML and JS have the new hashes and the three required user messages. Ask staff to save work and reload; confirm the new UI is loaded.
5. Deploy ONLY the reviewed Rules with explicit project and release config.
6. Verify deployed Rules source hash matches the approved final hash; perform the controlled smoke test, then resume staff writes.

There is a temporary weak-security window after Web deployment and before Rules hardening. Same authenticated staff can bypass client revision/confirmation checks under the old wildcard. Do not describe that window as hardened or atomic.
Even after new HTML is served, an old open tab continues executing the old JavaScript. The existing service worker forwards GETs to the network; it does not reload running pages. A coordinated refresh/brief pause in counseling/profile editing is necessary at Rules transition. If uninterrupted mixed-client writing is required, this candidate needs a separately designed compatibility rollout before deployment.

## Rollback order and limitations

If Web fails before Rules switch: leave production Rules unchanged, stop deployment.
If Rules switch fails: do not automatically rerun or deploy other resources; inspect the failure and current deployed source first.
If a coordinated rollback is required after V2 Rules are active:
1. Pause counseling/profile writes and retain memos; avoid deletes.
2. Restore the exact old Rules snapshot before making the old Web client active. This intentionally restores weaker security and needs explicit incident authorization.
3. Roll Web back to the known-good Pages deployment/commit. The existing push-only workflow has no dispatch rollback; prepare an explicitly authorized rollback commit on the current release history, without force/reset, or use a separately approved artifact deployment mechanism.
4. Reload staff tabs and verify ordinary counseling/profile operations.

Prefer a forward repair while retaining the V2 app/revision contract when feasible. A full old-client rollback is a degraded-security incident procedure, not an automatically safe git revert.

Old `updateDoc` and profile batch updates preserve unknown revision/metadata fields, but do not increment revision. Old new-record creates omit revision. Generic update paths do not replace whole documents. A direct non-merge `setDoc` could remove metadata under the weak snapshot; it is not an observed old app path.
Therefore old Web must not remain active with V2 Rules. After Rules rollback, retained revision values are no longer trustworthy for safe deletion while old clients can edit. Do not reuse old confirmations. Before reenabling V2 safe deletion, reload into V2 and explicitly re-transcribe/re-confirm retained memos against the current formal record. No data migration or automatic deletion is part of rollback.

## Commands prepared, NOT executed

Use only the isolated RC directory, never the original dirty worktree.
Git command details and exact selective add list are generated in the release artifact `selective-staging-plan.txt`.

```powershell
git fetch origin
git rev-parse origin/main
# Stop unless still the reviewed base.
git switch -c release/handwriting-safe-delete-v2 192d454aef8ba85f5faa331960d2f843b1a72910
# Run the exact selective add command, review cached names/stat/diff.
git commit -m "feat: add safe temporary counseling handwriting workflow"
git fetch origin
# Stop on any unexpected remote change; do not merge/rebase/force.
git push origin HEAD:main
```

Rules command uses an existing Firebase CLI installation; no CLI package is added to production dependencies. `projects:list` is a read-only target check. Inspect its JSON for projectId exactly `dong100-51735`, and do not rely on a CLI default project.

```powershell
firebase projects:list --json
# Explicit operator assertion: projectId must equal dong100-51735.
firebase deploy --project dong100-51735 --config firebase.release.json --only firestore:rules
```

The actual production CLI command is prepared only. Rules source-only compilation uses `projects/dong100-51735:test` with zero test cases; it creates no ruleset/release and performs no document request.

## Post-deploy smoke test

Coordinate with an admin and use a pre-existing designated test target, with synthetic non-sensitive text. Do not invent a real service-user identity or modify unrelated records. Record any formal counseling document ID for an explicit later cleanup decision; safe delete removes only the temporary memo.

1. Open admin.dong100.org and log in as staff; reload the page.
2. Open counseling, new counseling. Before target selection confirm the disabled handwriting button and target guide.
3. Select the designated target. Confirm the active entry and open the whiteboard.
4. Draw a small synthetic stroke with mouse/tablet; wait for saved status (minimum interval 5 seconds).
5. Close/reopen and confirm the same draft/stroke remains. Confirm ordinary form content/result were retained.
6. On PC transcribe into formal counseling with a clearly marked synthetic message.
7. Cancel delete confirmation; verify memo remains.
8. Confirm again; verify memo deleted and formal record retained.
9. In a separate retained test memo, transcribe but do not accept delete confirmation yet. From a second staff session change the linked formal content through its normal revision-aware path; the first session's stale confirmation/delete must be rejected and memo retained. Reopen/re-transcribe/re-confirm to finish deliberately. The tighter race after a persisted confirmation and before delete is covered by the Emulator tests; the UI immediately runs those two transactions and exposes no artificial pause.
10. Repeat the equivalent stale-new-stroke check if practical. Verify user-facing changed-state guidance.

Physical browser/stylus behavior is not established by jsdom E2E. Actual production writes and smoke steps are reserved for the separately approved deployment phase.

## Verification results

Plain npm ci initially failed on the base project's existing react-day-picker/date-fns peer mismatch. The current Pages workflow already uses --legacy-peer-deps. The RC adds .npmrc with that exact setting so the required plain npm ci uses the same dependency-resolution policy without changing package versions or the lockfile. This configuration is part of the explicit release scope, not an undisclosed retry.

Fresh clean RC results:

| Check | Result |
| --- | --- |
| npm ci (RC .npmrc, unchanged approved lockfile) | PASS, 704 packages |
| npx tsc --noEmit -p tsconfig.app.json | PASS |
| npm run lint | PASS, 0 errors / 37 unchanged warnings |
| npm test -- --maxWorkers=2 | PASS, 249 passed / 61 conditional skips, 41 files |
| Original handwriting general checks | PASS, 147; plus 1 new release-artifact structural check |
| AUTH-1..5 / UI-1..6 / B1..B4 | PASS |
| Deterministic save/listener race | PASS, 100/100 |
| Demo Auth/Firestore Emulator, 9 suites serially | PASS, 64/64, 78.50 seconds |
| R1..R8, attacks, recovery, legacy, profile cascades, actual UI SDK lifecycle | PASS |
| Deployment-order and rollback compatibility | PASS, both staff roles under old Rules; old client writes rejected by V2 Rules |
| npm run build | PASS, 3164 modules |
| git diff --check | PASS |
| Production Rules API source-only validation | PASS, HTTP 200 / issues [] / testResults [] |

The first new preflight test used the wrong return shape of createCounselingRecord; TypeScript caught it and the test now uses the returned DocumentReference correctly. No runtime implementation was changed. The first Emulator runner invocation had a --silent argument parsing error before any tests; --silent=true corrected the runner. Sandbox spawn/network failures were rerun with approved execution permissions. All final checks above used the final RC.

The 64 Emulator checks include 60 prior gates and 4 release checks (one structural plus three compatibility scenarios); historical Rules-semantics probes remain separately identified, not claimed as V2 attack denials. Normal tests skip 61 Emulator-dependent checks; those are exercised by the Emulator gate.

Build assets: index-B_8pg3Xi.js and CounselingWhiteboard-BvixhCdG.js. Main JS SHA-256: F37BCAB6A776805E1C934AB3374226FF56927C4A55B62B052B29578E6FEC5715.
Build contains handwriting entry, target-selection guide and changed-state guidance. Existing Browserslist and bundle-size warnings remain.

npm ci reports 43 audit findings (7 moderate / 33 high / 3 critical). No audit fix/package upgrade was applied; this is a separately disclosed dependency review risk, not evidence that this feature's security tests failed. This preflight does not claim a clean dependency security audit.

Original worktree: 24/24 dirty/untracked hashes and status unchanged, staging empty. App SHA-256: 17B053421592F1E857D2043BCBD7CDFD2922DAAB7CED375CB695E3FF87183B88.
RC: exactly 44 intended changed files, no excluded WIP diff, all runtime files byte-identical to the verified isolated implementation, package lock unchanged from it. Remote main rechecked at the same 192d454 base.

Production changes, staging, commit, push and deployment: NONE. Production browser/stylus smoke: NOT TESTED; the real component/Auth/SDK lifecycle passes in jsdom plus local Emulator.

Final feature release gate: APPROVAL REQUIRED — READY TO DEPLOY, using the reviewed Web-first rollout and coordinated staff reload. This is not approval to execute it and not an atomic/mixed-client compatibility guarantee.

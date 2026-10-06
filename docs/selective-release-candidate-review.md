# Selective Release Candidate Review

검증일: 2026-10-06. 이 문서는 새 RC 작업공간에서 실행한 결과만 RC 검증 근거로 사용한다. 기존 격리 작업공간의 PASS를 대신 사용하지 않는다.

## A. RC Baseline

- `git fetch origin` 성공 후 `origin/main`: `11743d218179cd54cfc6caf3013ad9c31ab041cd`.
- 요청 baseline과 동일: 경우 A. remote 변경에 대한 semantic 재분석은 필요하지 않았다.
- 새 RC: `C:/Users/Public/Documents/ESTsoft/CreatorTemp/force-delete-rc`.
- 독립 로컬 Git 복제, baseline detached checkout, 적용 전 clean 상태 확인. 원본 dirty working tree는 복사하지 않았다.
- 원본 Git index를 RC에 공유하지 않았다. dependencies는 검토 작업공간에서 RC의 독립 `node_modules`로 복사했다. package/lockfile 변경 없음.
- 정확한 production Rules baseline SHA-256: `5D7418D1948883ACA400F6BBBCAE027D9FD77A337CA3AAB7EA2869E1A8999487`.
- RC Rules SHA-256: `F942726508479CCC2D6FA553F0306F9798423901F1A96965645B5FE1637211C2`.
- production Rules 정체성은 사용자가 제공한 SHA와 baseline Git blob의 일치로 확인했다. production에 접속하거나 변경하지 않았다.

## B. Selected Files

`implementation-review.patch` 실제 변경 목록 21개를 먼저 산출하고 각 항목을 검토했다. Rules patch와 구현 patch의 Rules 부분도 동일함을 확인했다. 아래 source/test 경로를 명시적으로 선택해 적용했다.

| 분류 | 파일 | 이유 |
|---|---|---|
| REQUIRED | `firestore.rules` | Force Delete / registration 전용 계약 |
| REQUIRED | `src/components/CounselingHandwritingEntry.tsx` | 미전사 목록의 열기/수동 삭제 분리 |
| REQUIRED | `src/components/ForceDeleteMemoButton.tsx` | 공통 2단계 확인, dirty 보호, busy/error 처리 |
| REQUIRED | `src/components/RegistrationHandwriting.tsx` | 두 신규등록 화면의 board와 orphan 목록 |
| REQUIRED | `src/hooks/useCounselingHandwriting.ts` | 기존 저장/listener 알고리즘에 service 주입 |
| REQUIRED | `src/lib/collectionNames.ts` | registration collection 상수 |
| REQUIRED | `src/lib/counselingHandwritingApi.ts` | 별도 Force Delete API 연결 |
| REQUIRED | `src/lib/manualForceDeleteApi.ts` | 공통 revision/UID 확인과 삭제 transaction |
| REQUIRED | `src/lib/registrationHandwritingApi.ts` | UUID draft, memo 저장, 원자적 등록 연결 |
| REQUIRED | `src/pages/UserManagement.tsx` | 이용자 신규등록 연결, 안정적인 빈 schedule |
| REQUIRED | `src/pages/WorkerManagement.tsx` | 지원사 신규등록 연결, 안정적인 빈 schedule |
| TEST ONLY | `src/test/counselingHandwritingAutosaveRules.test.tsx` | RC Rules 선택 및 원격 삭제 시 dirty 보호 |
| TEST ONLY | `src/test/counselingHandwritingEmulatorUI.test.tsx` | 실제 상담 component 회귀에 RC Rules 사용 |
| TEST ONLY | `src/test/counselingRevisionWritePaths.test.ts` | 기존 실제 write/cascade 경로에 RC Rules 사용 |
| TEST ONLY | `src/test/counselingSafeDeleteV2.test.ts` | 기존 R1~R8과 공격 테스트에 RC Rules 사용 |
| TEST ONLY | `src/test/handwritingReleaseCompatibility.test.ts` | 과거 Rules 비교의 registration 추가 부분 반영 |
| TEST ONLY | `src/test/counselingForceDelete.test.ts` | Force Delete SDK/Rules 계약 |
| TEST ONLY | `src/test/counselingForceDeleteEmulatorUI.test.tsx` | 실제 목록 component + SDK + Emulator 삭제 |
| TEST ONLY | `src/test/counselingForceDeleteUI.test.tsx` | 두 확인 취소, busy, 오류, 목록 제어 |
| TEST ONLY | `src/test/registrationHandwritingRules.test.ts` | 이용자/지원사 계약 및 공격 |
| TEST ONLY | `src/test/userRegistrationHandwritingUI.test.tsx` | 두 실제 관리 component lifecycle |
| TEST ONLY, RC 추가 | `src/test/selectiveRcCompatibility.test.ts` | 정확한 현재 production V2와 C1/C2/rollback |
| TEST ONLY, RC 추가 | `src/test/fixtures/rc-baselineHandwritingApi.ts` | baseline의 기존 Web API를 Git blob에서 추출 |
| TEST ONLY, RC 추가 | `src/test/fixtures/rc-production-v2.rules` | 정확한 baseline Rules Git blob, SHA 검증 |
| DOC ONLY, RC 추가 | `docs/selective-release-candidate-review.md` | 이 보고서 |
| GENERATED / EXCLUDE | `node_modules`, `dist`, `tmp`, Emulator logs, 검토 JSON, 개발용 `*.cjs`, `review.index`, 검토 patch 파일 | release 변경에 포함하지 않음 |
| GENERATED / EXCLUDE | 기존 `src/test/fixtures/*.rules` 3개의 checkout EOL 변환 | LF Git 원문으로 복원했으며 Git content diff 0, semantic 변경 없음 |
| DOC ONLY / EXCLUDE | 이전 검토 보고서 | 읽기 자료로만 사용, 이전 PASS를 RC PASS로 전용하지 않음 |
| UNRELATED / EXCLUDE | 원본 WIP, indexes, App/router, Matching, 배포 설정, package/lockfile | 이번 patch에서 선택한 변경 없음 |

선택된 실제 content 변경: REQUIRED 11 / TEST ONLY 13 / DOC ONLY 1. 원래 patch의 21개는 모두 기능 또는 검증에 직접 필요했다. 전용 API/공통 component가 서로 의존하므로 이 중 일부 source만 제거하는 것은 불완전한 추출이다.

### WeeklySchedule 최소 변경

`emptyUser`/`emptyWorker`에 각각 `weeklySchedule: []`만 추가했다. Picker의 `value = []`는 undefined일 때 렌더마다 새 배열을 만들고 `[value]` effect에서 다시 state를 설정한다. 안정적인 기본 배열은 이 반복 경로를 제거한다. 일정 해석은 기존의 빈 일정과 같으며 일정 선택기, 기존 대상 편집, 매칭 알고리즘을 변경하지 않았다. 실제 U/W 신규등록 component lifecycle과 일반 회귀에서 재검증했다.

## C. Force Delete

- `confirmForceDelete()`와 `forceDeleteConfirmed()`는 각각 별도 transaction이다.
- `forceDeleteConfirmedBy/At/Revision`은 Safe Delete의 `confirmedBy/At`과 별개다.
- confirmation은 UID = 요청 UID, timestamp = 요청 시간, revision = 현재 memo revision이어야 한다.
- 삭제는 같은 UID와 현재 revision 일치를 재확인한다. 다른 memo/UID, stale revision, 미확인/nonstaff 삭제를 거부한다.
- 미전사 legacy memo도 migration 없이 새 확인 metadata를 추가한 후 삭제한다.
- 공통 UI는 첫 확인 → 두 번째 확인 → metadata commit → delete 순서다. 취소 시 memo/metadata는 그대로다.
- local dirty/recovery가 있으면 UI 삭제를 막고, 원격 삭제를 감지한 기존 hook은 dirty 필기를 보존하며 재생성을 차단한다.
- `deleteConfirmed()` 본문은 baseline과 정확히 동일하다. 기존 Safe Delete semantics를 변경하지 않았다.

## D. User Registration

이용자 신규등록에서 손글씨 board, 실제 pointer 입력, 저장/닫기/재열기, validation 실패와 cancel 보존, UUID 대상 등록과 원자적 연결, 직원 확인 후 삭제를 검증했다. 취소한 memo는 orphan 목록에 남고 다음 신규등록은 다른 UUID를 사용한다. 기존 동명 대상 덮어쓰기와 편집 흐름은 기존 API/sync/cascade 경로를 유지하며, 기존 대상에 registration memo를 사후 연결하지 않는다.

## E. Worker Registration

동일한 공통 component/API/schema/hook으로 활동지원사 신규등록 lifecycle을 검증했다. 이용자/지원사 targetType을 분리하고, 기존 syncWorkerToUsers 및 profile cascade/승인 흐름을 유지했다. UUID에는 이름/전화번호 등 개인정보를 넣지 않는다.

## F. Rules Semantic Diff

| 영역 | production V2 대비 추가/변경 | 보존 및 검증 |
|---|---|---|
| counseling revision | 변경 없음 | 기존 create=1 / update +1, 전사와 상담 revision binding 유지 |
| counseling memo schema | 선택적인 Force metadata 3개를 all-or-none으로 허용 | 기존 필수 필드/제한 유지, create에서 Force metadata 위조 금지 |
| counseling memo update | Force metadata와 updatedBy/At만 바꾸는 확인 branch 추가 | UID/request.time/current revision 강제, 기존 save/transcription/confirmation branch 유지 |
| counseling memo delete | 기존 Safe Delete 또는 별도 Force contract | 전체 expression에 staff guard, 기존 Safe Delete branch 그대로 |
| registrationHandwritingMemos | 전용 staff/schema/create/update/delete 규칙 | UUID v4, targetId=draftId, type/creator/identity/dimensions immutable, 크기·타입·extra field 검증 |
| registration 연결 | 아직 없는 UUID 대상 create와 memo.registered=true를 getAfter로 검증 | targetType/creator/marker 연결, 기존 대상/다른 target/다른 type 거부 |
| users | 기존 staff read/delete, 검증된 marker create, marker immutable update | marker 없는 기존 생성/수정 유지 |
| workers | users와 같은 전용 구조 | marker 없는 기존 생성/수정 유지 |
| users/ workers 하위 collection | 명시적 staff recursive allow | 기존 업무 subcollection read/write/delete 회귀 통과 |
| wildcard | registrationHandwritingMemos/users/workers 제외 3개 추가 | Firestore OR semantics로 전용 계약이 우회되지 않게 함 |
| 기타 collection | 변경 없음 | 기존 prefix/suffix Rules 비교 및 행사/Auth/전체 Emulator 회귀 |

전용 user/worker 하위 match는 적어도 한 subcollection segment를 요구하므로 root document 검증을 OR로 우회하지 않는다. 기존 counselingHandwritingMemos/counseling wildcard 제외도 유지한다. Rules 전체를 무조건 교체하는 검토가 아니라 추가 branch와 접근 경로를 검토했다.

## G. Force Delete Tests

FD1~FD14와 FD-R1~6: **PASS**. 최종 RC 재실행 근거는 아래 최종 Emulator JSON 및 실제 component 테스트다.

| 번호 | 검증 |
|---|---|
| FD1~2 | 미전사 목록과 별도 열기/삭제 버튼 |
| FD3~4 | 첫/두 번째 확인 취소 시 무변경 |
| FD5~7 | 실제 두 transaction 삭제, formal 기록과 다른 memo 보존 |
| FD8 | confirmation 없는 SDK delete DENY |
| FD9 | UID 위조/다른 직원 confirmation 재사용 DENY |
| FD10~11 | A 확인 → B 수정 → stale 삭제 DENY → 최신 재확인 ALLOW |
| FD12 | unauthenticated/nonstaff 확인·삭제 DENY |
| FD13 | Force metadata 없는 legacy V2 memo |
| FD14 | 원격 삭제 후 local dirty 보존/재생성 차단 |

## H. Registration Tests

U1~U11 / W1~W11: **PASS**. parameterized 실제 UserManagement/WorkerManagement + 실제 SDK/Auth/Firestore Emulator 테스트에서 실행했다. board 버튼/열기/pointer 필기/저장/재열기/validation·취소 보호/원자적 등록 연결/삭제 취소/직원 확인 삭제/정식 대상 보존을 검증한다. 실제 oversized Firestore 대상 write 실패 시 transaction 전체가 거부되어 memo와 registered 상태가 보존되는 추가 API 테스트도 실행했다.

## I. Existing Safe Delete Regression

AUTH-1~5, UI-1~6, B1~B4, R1~R8, 정상 Safe Delete, stale PC의 timestamp/revision 검사, 실제 profile cascade, deterministic save/listener race 100/100: **PASS**, RC에서 다시 실행했다. 과거 약한 Rules의 동작을 보여주는 historical probe는 현재 RC 공격 방어 PASS로 계산하지 않는다.

## J. Security Attacks

최종 RC Rules security attacks: **PASS**. 다음 불변식을 실제 SDK 공격으로 검증했다: 미확인 삭제/다른 UID/다른 memo/stale revision/nonstaff DENY, 최신 revision 재확인과 정상 Safe Delete ALLOW. registration은 두 type 각각 UUID/draft/target 불일치, cross-target/type, 다른 creator UID, malformed schema, oversized payload, extra field, immutable 변경, 미확인/stale 삭제, 기존 대상 marker 사후 추가, marker 변경을 거부한다.

Rules는 JSON 문자열 내부의 모든 stroke 의미를 파싱하지 않는다. schema/type/ASCII/배열 외형/512 KiB 제한은 Rules에서, stroke JSON 파싱과 좌표 등은 API decoder에서 검증한다. malformed schema DENY를 모든 임의 JSON 내부 의미 검증으로 확대해서 주장하지 않는다. 이 경계는 기존 handwriting 설계와 같다.

## K. General Gate

최종 결과는 아래 machine-readable evidence에 기록한다.

- `npx tsc --noEmit -p tsconfig.app.json`: exit 0.
- `npm run lint`: exit 0, 0 errors / 37 warnings. 수정된 기존 파일 각각의 warning 메시지/규칙을 baseline과 비교해 동일함을 확인했다. 새 source/test에는 새 warning 없음.
- `npm test -- --maxWorkers=2`: **255 PASS / Emulator 조건부 96 skip / 0 failures, exit 0**. 최종 `tmp/rc-general-final.json`.
- `npm run build`: exit 0. 기존 chunk-size warning 유지.
- `git diff --check`: exit 0. conflict marker 없음.
- production bundle `index-ClZj4SXs.js`에 `손글씨 메모`, `전사되지 않은 임시 손글씨`, `옮겨 적은 후 삭제`, 이용자/지원사 신규등록 UI 문자열 포함.
- `CounselingWhiteboard-B8xG0ywZ.js` lazy chunk에도 손글씨 메모 문자열 포함. 신규등록 화면은 baseline의 eager imports를 유지하여 main bundle에 포함되며 별도 registration lazy chunk는 없다.

초기 실행의 Windows sandbox spawn 거부는 승인된 실행으로 재시도했다. 초기 Git checkout의 CRLF로 historical fixture SHA/문자열 비교가 실패하여 fixture를 정확한 LF Git 원문으로 복원했고 최종 Gate를 다시 실행했다. 새 compatibility 테스트의 초기 DENY 예상은 기존 wildcard의 실제 ALLOW 결과로 반증되었으며, 이를 명시적인 compatibility/security-gap 검증으로 수정했다. product source를 테스트에 맞춰 바꾸지 않았다.

## L. Emulator Gate

최종 실행은 RC cwd, demo project, `HANDWRITING_RULES_FIXTURE=firestore.rules`, Auth+Firestore Emulator, `--maxWorkers=1 --fileParallelism=false`였다. 각 테스트가 Rules를 바꿀 수 있으므로 file 병렬 실행을 하지 않았다. 새 Rules 관련 회귀는 RC Rules를 사용하며 historical/compatibility 테스트는 명시한 별도 fixture를 사용한다.

최종 집계: **47 files / 351 tests PASS, 0 failures / 0 skipped, exit 0**.

## M. Production Compatibility

정확한 현재 production V2 Rules와 baseline Web API로 C1/C2를 admin/social_worker 모두 실제 실행했다. 과거 pre-V2 배포 테스트와 혼동하지 않는다.

| 동작 | C1: production V2 Rules + RC Web | C2: RC Rules + baseline Web |
|---|---|---|
| counseling create/update | ALLOW, revision 정상 | ALLOW, revision 정상 |
| 기존 handwriting save/update | ALLOW, Force metadata 없는 memo | ALLOW |
| 정상 Safe Delete | ALLOW, 정식 기록 유지 | ALLOW, 정식 기록 유지 |
| user create/update | ALLOW | ALLOW |
| worker create/update | ALLOW | ALLOW |
| counseling Force Delete confirmation | DENY, memo 유지 | 기존 Web에 해당 UI 없음 |
| registration save/register | 기능상 ALLOW | 기존 등록 방식 ALLOW |
| registration 보안 contract | **미적용**: wildcard 때문에 malformed/미확인 삭제 ALLOW | 전용 신규 Rules 적용 |
| 기존 user/worker 하위 collection | 기존 접근 유지 | 실제 staff write/read 유지 |

C1은 안전한 release 상태가 아니다. C2는 기존 production workflow를 보존한다. 새 Web의 정상 lifecycle과 새 Rules 계약은 RC 전체 회귀에서 별도로 검증했다.

## N. Required Deployment Order

**Rules → Web**.

RC Rules 적용 후 기존 Web의 업무/Safe Delete가 그대로 동작한다(C2). Web을 먼저 배포하면 Force Delete가 실패하고 신규 registration 자료는 기존 wildcard 아래에서 새 보안 불변식 없이 동작한다(C1). 따라서 정확한 RC Rules 적용/확인 후 RC Web을 배포해야 한다. 이 단계에서는 실제 배포하지 않았다.

## O. Rollback Plan

- Web 문제만 발생: **기존 Web으로 rollback하고 RC Rules 유지**. C2에서 기존 업무 정상 동작을 검증했다. 신규 registration memo는 서버에 보존되며 기존 Web은 해당 UI를 제공하지 않는다.
- Rules도 반드시 rollback해야 한다면: **Web을 먼저 baseline으로 rollback → Rules를 지정 baseline SHA로 rollback**. 새 Web을 유지한 Rules-only rollback은 허용할 안전한 운영 상태가 아니다.
- Rules-only rollback 실제 검증: 등록된 user 수정 가능, registration 자료 보존/저장 가능하지만 미확인 삭제가 허용되어 registration 계약을 잃는다. Force metadata가 이미 추가된 counseling memo는 읽기는 가능하나 기존 schema의 save/update 및 Force Delete가 거부된다. 원문 필기는 유지된다.
- baseline Web + baseline Rules에서 새 clean memo의 transcription/confirmation/Safe Delete workflow 재개를 실제 검증했다. 그러나 이미 Force metadata가 추가된 memo의 편집 차단은 Web rollback만으로 해결되지 않는다. 해당 memo는 보존하고 검증된/수정된 새 Rules를 재적용한 뒤 처리한다. rollback 때 자동 필드 제거, memo 삭제, migration을 하지 않는다.
- offline/cached RC Web은 Rules rollback 뒤에도 새 동작을 시도할 수 있으므로 Rules-only 상태를 정상으로 간주하지 않는다. production rollback 승인 시 cached-client 처리도 운영 절차에 포함해야 한다.

## P. Original WIP Safety

작업 전후 원본: **24/24 hash/status unchanged, staging unchanged (0 staged)**. 최종 검증 JSON: `tmp/original-wip-final.json`. 원본 source/index 변경, restore/reset/clean/stash 또는 임의 복구 없음. fetch는 요청에 따른 remote ref 확인만 수행했다.

## Q. Production Changes

**NONE**.

commit/push/Rules deploy/Pages deploy/production Firestore data/Auth/Indexes/Functions 변경 없음. 모든 데이터 write/delete는 합성 데이터와 demo Emulator에 한정했다.

## R. Final Verdict

**READY FOR SELECTIVE COMMIT/PUSH/DEPLOY APPROVAL**

FD1~FD14, U1~U11/W1~W11, AUTH/UI/B/R, deterministic race 100/100, security attacks, 일반 Gate, 전체 Emulator Gate 모두 RC에서 PASS. C1은 안전하지 않으므로 Rules → Web 순서와 위 rollback 제약을 따른다. 이 결과는 승인용이며 commit/push/deploy를 수행하지 않았다.

## Evidence

- `tmp/rc-emulator-final.json`, `tmp/emulator-final.log`
- `tmp/rc-general-final.json`, `tmp/general-final.log`
- `tmp/ts-final.log`, `tmp/lint-final.log`, `tmp/build.log`
- `tmp/lint-baseline-comparison.json`, `tmp/bundle-evidence.json`
- `tmp/original-wip-final.json`

`tmp`, build output, dependency directory, test logs는 검증 자료이며 release content에 포함하지 않는다.

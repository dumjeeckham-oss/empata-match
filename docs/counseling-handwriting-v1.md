# 임시 손글씨 전달 V1 — 로컬 구현

## 정책

손글씨는 상담기록이 아닌 전달용 임시자료다. `작성 → Firestore 임시저장 → PC 전사 → 정식 상담 저장 성공 → 직원 확인 → 손글씨 삭제 → EMPTY`가 정상 흐름이다. 원본을 상담기록, archive, history, 인쇄 또는 복구용 백업에 포함하지 않는다. Functions·Storage·Blaze·자동 TTL은 사용하지 않는다.

상담기록과 이용자·지원사 상세, 매칭의 선택 이용자에서 **손글씨 메모**를 연다. 상담기록 화면에는 미전사 목록과 3일 이상 지난 임시자료 경고가 표시된다. 오래되었다는 이유로 삭제하지 않는다. 태블릿은 펜/지우개/굵기/Undo/Redo/전체 지우기/저장 상태/닫기, 데스크톱은 손글씨와 기존 상담내용·상담결과 입력을 나란히 제공한다. 좁은 화면은 전사 패널을 선택해 상하로 연다.

## 데이터·권한

`counselingHandwritingMemos`에 무작위 메모 ID, 대상 유형·ID·targetKey, 작성자·수정자 UID, 서버 생성·수정 시각, revision, 논리 Canvas 크기, strokesJson, 연결 상담기록 ID, 전사 확인 revision·시각만 저장한다. 이름·주소·연락처는 메타데이터에 중복 저장하지 않는다.

Custom Claim `admin`/`social_worker`만 읽기·쓰기가 가능하다. 전용 Rules를 포괄 staff Rules에서 제외해 우회가 없도록 했다. 기존 업무·행사폼 권한 조건은 유지한다. strokesJson은 ASCII JSON 최대 512KiB, 문서 상한에 여유를 둔다. 인덱싱을 제외한다. 클라이언트는 최대 3,000 stroke/50,000 좌표, 유한 좌표·영역·압력·굵기·JSON 형태를 검증한다. **Rules는 JSON 내부 좌표까지 검증하지 못한다.** 잘못된 데이터는 화면 중단 없이 오류 안내하고 덮어쓰기를 차단한다.

## 저장·삭제 안전장치

진행 중 stroke도 pointerdown부터 UID별 메모리 draft에 전달하며 dirty/종료 경고 대상이다. pointerup/cancel/lostcapture 및 정상 닫기(X/Escape/닫기)는 먼저 finalize한다. unmount cleanup의 비동기 저장에 의존하지 않는다. 단일 점은 빈 stroke가 아니라 펜으로 찍은 점이다.

완료된 stroke는 1.5초 debounce와 별도의 최소 성공 쓰기 간격 5초를 적용한다. 연속 입력은 dirty 시작 후 5초 deadline을 적용하고 15초 체크는 fallback이다. 닫기/수동 저장도 최소 간격을 기다리고 그동안 삭제·충돌·계정 변경을 다시 확인한다. 5/10/15초 실제 훅 비교에서 5초를 선택했다: 쓰기 감소보다 상담 중 손실 범위를 짧게 유지하는 것을 우선한다. 활성 gesture의 미완료 stroke, 오프라인, 서버 지연에는 5초 저장 완료를 보장하지 않는다.

revision이 달라지면 CONFLICT로 자동저장을 중단한다. 내 필기/최신 서버 필기를 별도로 보고 정식 상담으로 옮길 수 있다. 최신 서버본으로 전환은 로컬 미저장 필기를 버린다는 별도 확인 후에만 실행한다. 자동 병합·서버 덮어쓰기는 없다. 재접속해도 충돌 상태를 보존한다.

서버 삭제 + dirty는 REMOTE_DELETED_WITH_LOCAL_CHANGES로 로컬 필기를 유지하며 기존 문서 재생성을 차단한다. 명시적 복구 전사는 기존 상담 동시성 검사 또는 안정적인 복구 상담 ID를 이용해 정식 상담만 저장하고, 직원 확인 후 로컬 필기를 삭제한다. 서버에서 이미 삭제한 메모는 절대로 복구·archive하지 않는다. 닫힌 clean 캐시는 대상 목록의 서버 확인 스냅샷에서 제거한다. dirty 캐시는 복구 항목으로 남긴다. 캐시/pending-write 스냅샷을 서버 삭제 근거로 사용하지 않는다.

정식 상담 저장은 기존 `counseling` 기록과 전사 확인 메타데이터를 하나의 트랜잭션으로 저장한다. 두 PC의 중복 새 상담 생성은 차단한다. 기존 연결 기록은 읽었던 updatedAt의 seconds/nanoseconds를 서버와 비교한다. legacy updatedAt 없는 기록은 null 기준 첫 수정 후 서버 시각을 기록하므로 두 번째 stale 수정이 거부된다. migration은 없다. 충돌 시 textarea를 유지하고 최신 기록을 별도 확인한다. 최신 기록 확인 후 명시적 재저장 준비 외에는 baseline을 자동 갱신하지 않는다. 이 검사는 손글씨 전사 API 경로에 적용되며 다른 기존 업무 편집 API를 개편하지 않는다.

삭제 트랜잭션은 최신 revision, 전사 확인 revision, 정식 기록 존재·대상 일치·비어 있지 않은 내용 및 저장 시각 일치를 검사하고 손글씨 문서만 삭제한다. 성공 후 해당 UID의 메모리 draft·React state를 비우고 `✓ 전사 완료 — 임시 손글씨가 삭제되었습니다.`를 표시한다. 다른 열린 기기는 clean이면 제거하고 dirty면 보호한다. 닫힌 기기의 메모리는 직접 원격 삭제하지 못하므로 다음 대상 목록 접근 시 재조정한다. 정식 상담기록은 남는다.

열람/입력 시작/저장 실패/연결 끊김/창 닫기/PC 종료로 서버 메모를 자동 삭제하지 않는다. 전체 지우기는 Canvas 내용을 비우는 Undo 가능한 편집이며 서버 문서 폐기와 다르다.

## 로컬 임시자료·한계

손글씨용 IndexedDB/localStorage/sessionStorage 파일은 만들지 않는다. Firestore 기본 메모리 캐시와 현재 탭의 UID별 메모리 draft만 쓴다. 전사 삭제·로그아웃·계정 변경 시 draft를 비운다. 같은 탭에서 창을 닫고 다시 열면 미저장 필기를 복구할 수 있다.

**서버에 저장되지 않은 필기는 브라우저 종료·새로고침·기기 종료 시 손실될 수 있다.** 미저장 닫기는 저장을 먼저 시도하고 실패하면 창을 유지하며 안내한다. beforeunload 경고는 브라우저 정책에 따라 무시될 수 있다. 오프라인 영구 복구를 약속하지 않는다. 서버에 저장된 메모는 삭제 확인 전까지 유지된다.

실물 Apple Pencil/Android 스타일러스, 실제 모바일 OS 키보드·팜리젝션은 별도 현장 확인이 필요하다. V1은 Pointer Events 기반 단일 포인터와 화면 회전에 따른 논리 좌표 보존을 사용하며 완전한 하드웨어 팜리젝션을 보장하지 않는다.

## 운영 경계

운영 Firebase/Rules/Indexes 변경, Git staging/commit/push, 배포를 하지 않았다. 새 컬렉션의 Rules 및 strokesJson 비인덱싱을 운영에 반영하려면 별도 승인·백업·배포 전후 권한 검증이 필요하다. 기존 WIP 브랜치를 수정하지 않는다.

검증은 `demo-dongbaek-forms`의 Auth·Firestore·Hosting Emulator와 합성 데이터만 사용한다. 테스트 파일: counselingHandwriting, counselingHandwritingHook, counselingWhiteboard, counselingHandwritingRules. Rules 9건과 기존 Spark Rules 18건의 합계 27건 통과. Temporary Data Lifecycle 최종 임시 손글씨 0건·로컬 draft 0건·정식 상담기록 유지 확인.

Chrome 154에서도 390px 작성 → Firestore 존재 → 다른 social_worker PC 열람 → 정식 저장 → 직원 확인 삭제 → 태블릿에서 원격 삭제 반영을 확인했다. 최종 임시 문서 0건, 정식 상담 1건. 360/390/430/1024px와 844px 가로 회전의 clientWidth=scrollWidth, 모달 가로 경계 확인. 1440×1000 PC 전사 완료, 치명적 브라우저 pageerror 0건. 실제 터치 하드웨어 검증과는 구분한다.

### V1 초안 실행 기록 — Fix Phase 이전 (2026-10-02)

- `npm test`: 187 통과/0 실패/48 건 Emulator 조건부 skip. 별도 실행한 30건을 아래에 구분한다. 미사용 Blaze Functions/Storage 테스트는 이번 작업에서 실행하지 않았다.
- `firebase emulators:exec --only auth,firestore --project demo-dongbaek-forms` 안에서 handwriting Rules, Spark Rules, Spark Auth, Spark Integration: 30 통과/0 실패. 프로세스의 TEMP/TMP만 짧은 로컬 임시 경로로 지정했다.
- `npx tsc --noEmit -p tsconfig.app.json`: 종료 코드 0.
- `npm run lint`: 종료 코드 0, 오류 0/기존 경고 37.
- `npm run build`, `npm run build:emulator`: 종료 코드 0. 기존 500KB 청크·Browserslist 경고는 숨기지 않았다.
- 변경 파일의 충돌 마커·자격증명 패턴: 발견 없음. `git diff --check`: 통과. 이 검사는 모든 가능한 비밀값의 부재를 수학적으로 보장하는 것은 아니다.
- 브라우저 검증용 합성 스크립트는 검사 종료 후 제거했다. PDF·손글씨 이미지 파일·다운로드 파일은 생성하지 않았다.

손글씨 전용 Rules와 비인덱싱 설정은 **로컬 후보**이며 운영에 적용되지 않았다. 실물 펜·손가락·모바일 키보드와 장시간 최대 필기량의 현장 성능은 아직 미검증이다. 이 한계까지 포함해 전체 실기기 출시 판정은 PARTIAL이다.

## BLOCKER Fix Phase — 소프트웨어 검증 (2026-10-02)

Fix Gate: PARTIAL. B1~B4 및 HIGH의 결정적 회귀 테스트는 통과했으나, 브라우저 충돌 단계에서 발생했던 시간 초과의 원인은 확정되지 않았다. 재실행 성공만으로 검증 안정성을 PASS로 판정하지 않는다. 실제 태블릿·펜 하드웨어 Device Gate는 NOT TESTED이며 운영 출시 승인이 아니다.
최종 Chrome 실행은 외부 요청을 차단한 상태에서 정상 전사, dirty 원격 삭제 보호, 닫힌 clean 캐시 제거, 충돌본 비교·명시적 전환, 두 PC stale 상담 저장 거부, 동일 프로필 다중 탭 보호 모두 통과했다. 360/390/430/1440px에서 clientWidth=scrollWidth, pageerror 0건. 앞선 한 차례 충돌 단계 시간 초과는 재실행에서 재현되지 않았으며 브라우저 검증 안정성 한계로 남긴다.

Fix Gate는 아래 로컬 검증에 한정한다. 실물 기기 출시 Gate와 구분한다.

| ID | 수정 전 | 수정 후·근거 |
| --- | --- | --- |
| B1 | 원격 삭제가 dirty 필기를 지움 | clean만 제거. dirty와 진행 stroke 보존, 재생성 차단. 삭제/저장 응답 경합 테스트 포함 |
| B2 | 닫힌 clean 캐시가 서버 메모로 재출현 | 서버 확인 목록에서 clean 캐시 제거. dirty는 복구 항목. 같은 탭 재진입·실제 Chrome 0건 목록 확인 |
| B3 | 두 PC의 기존 상담 수정이 모두 성공 | expected updatedAt 트랜잭션 검사. stale PC 거부, 첫 내용·두 번째 textarea·손글씨 유지. legacy 무버전 문서 포함 |
| B4 | pointerup 전 unmount/닫기 시 ref 필기 유실 | pointerdown부터 로컬 보호, 정상 닫기에서 finalize. cancel/lost capture/resize/unmount 및 한 점 테스트 |
| HIGH | reopen 후 revision 충돌 반복 | CONFLICT 보존, 내 필기/최신 서버 보기, 확인 후 서버본 전환 또는 양쪽 내용을 정식 상담으로 전사 |

### State Model

- CLEAN: 서버와 일치하거나 신규 빈 메모.
- DIRTY: 완료/진행 필기에 미저장 변경. 진행 중에는 서버 저장 대신 로컬에서 보호.
- SAVING: 최소 간격 대기 및 트랜잭션 처리. 대기 후 상태 재검사.
- SAVE_ERROR: 실패/오프라인. 필기 유지, 명시적 재시도.
- CONFLICT: 서버 revision 차이. 자동저장 중단, 양쪽 확인 및 명시적 처리.
- REMOTE_DELETED: 서버 삭제 및 로컬 clean. 화면/로컬에서 제거.
- REMOTE_DELETED_WITH_LOCAL_CHANGES: 서버 삭제 및 dirty. 로컬 유지, 옛 문서 저장 금지.

삭제 복구 전사는 정식 counseling에만 기록한다. 안정적인 복구 기록 ID를 탭 메모리에 두어 재시도 중복 생성을 피하고, 상담 저장 확인 후 직원의 별도 전사 완료 확인으로 로컬을 비운다. 서버에 손글씨·archive·history를 새로 만들지 않는다. 로그아웃은 UID별 임시 메모리를 삭제하며 서버 문서 삭제는 하지 않는다.

### Failure Injection Matrix

| 시나리오 | 검증 경계 |
| --- | --- |
| remote clean / remote dirty | 실제 훅 + Chrome 독립 기기 컨텍스트 |
| closed stale clean / closed dirty | 서버 목록 재조정 + 재열기 훅, clean은 Chrome 대상 목록도 확인 |
| active stroke + close | 실제 Canvas, 실제 Chrome pointerup 전 Escape |
| counseling concurrent update | 두 독립 Firestore 클라이언트, 실제 PC 화면 stale 거부 및 textarea 유지 |
| revision conflict / conflict reopen | 실제 훅, 최신 서버본 확인·명시 전환 Chrome |
| save failure | 훅 재열기·미저장 보존, UI 저장 실패 시 삭제 비활성화 |
| delete failure / duplicate delete | 실제 Rules 거부·재확인·중복 삭제, 정식 기록 유지 |
| offline | 훅 저장 호출 0, 로컬 유지 |
| oversized payload | codec·훅·Rules 상한 거부 |
| different worker | UID별 로컬 정리 격리, 서로 다른 역할의 PC 전사 |
| different target / different draft | Rules 대상 일치 검증·다른 메모 보존 |
| multiple browser tabs | 같은 로그인 브라우저 컨텍스트의 별도 페이지, 다른 탭 전사/삭제 시 dirty 보호 |

### Temporary Lifecycle

Chrome 태블릿 작성 → Firestore 존재 → 독립 PC 조회 → 정식 상담 저장 → 직원 확인 → 손글씨 문서 0건. 정상 시나리오의 정식 상담 1건 유지. clean 캐시 대상 목록 0건. dirty 삭제 복구는 별도 시나리오로 정식 기록만 추가하며 임시 문서 재생성 0건.

### Firestore Load — 실제 훅 + 가상 시계 30분

모든 패턴은 stroke당 두 좌표의 합성 입력이다. A는 초당 1 stroke, B는 2초당 1 stroke, C는 10초 집중 필기(초당 1) + 20초 대화 반복. 마지막 pending 저장까지 포함한다. 네트워크 즉시 응답 가정이며 서버 부하 시험은 아니다.

| 최소 간격 | A writes | B writes | C writes | 정상 완료 stroke 최대 미저장 시간 |
| --- | ---: | ---: | ---: | --- |
| 5초 (선택) | 360 | 361 | 120 | 5초 |
| 10초 | 180 | 181 | 60 | 10초 |
| 15초 | 120 | 121 | 60 | A/B 15초, C 11초 |

이전 B 약 900회 → 361회(약 59.9% 감소). 이전 연속 필기는 15초 fallback으로 약 120회였으므로 A는 360회로 증가하는 trade-off다. 10/15초가 더 적게 쓰지만 강제 종료 전 미저장 범위를 길게 만들므로 5초를 선택했다. 이 정책은 전역 요금 제한이나 모든 기기 합산 쓰기 제한이 아니다.

각 write의 성공 트랜잭션 read는 1회로 A/B/C 360/361/120회. 6개 구독자가 각 변경을 한 번 받는 가정의 추가 read 추정은 2,160/2,166/720회다. 구독 read는 실제 과금 계측값이 아니며 초기 query, Rules 종속 read, transaction retry, reconnect는 제외했다.

마지막 strokesJson UTF-8 크기: A 101,491 / B 50,746 / C 33,811 bytes. 문서 전체의 메타데이터·문서명·Firestore 저장 오버헤드는 제외한 **실측 필기 본문**이다. 이전 10좌표 fixture와 바이트 크기를 직접 비교하지 않는다. 512KiB 필기 상한은 그대로다.

### Security / Regression

- 직접 공격 28건 모두 deny: 비로그인·무역할·viewer·익명 각각 get/set/delete/list/기존 업무 쓰기(20), 불변/추가 필드 조작(7), 하위 archive 경로(1).
- 일반 전체: `npm test -- --maxWorkers=2`, 205 통과 / 0 실패 / 53 조건부 skip, 종료 0.
- 로컬 `firebase emulators:exec --only auth,firestore --project demo-dongbaek-forms` 안에서 handwriting Rules 14, Spark Rules 18, Auth 1, Integration 2: 총 35 통과 / 0 실패, 종료 0. 일반 테스트 skip 중 35건은 여기서 별도 실행했다. 미사용 Functions/Storage/이전 Blaze 경계 테스트 18건은 실행하지 않았다.
- `npx tsc --noEmit -p tsconfig.app.json`: 종료 0.
- `npm run lint`: 종료 0, 오류 0 / 기존 경고 37.
- `npm run build`, `npm run build:emulator`: 종료 0. 기존 청크/Browserslist 경고 유지.
- Chrome 154: 360/390/430/1440px에서 clientWidth=scrollWidth, page error 0. 독립 PC stale 상담 저장 거부·textarea 유지·최신 기록 비교 확인.
- 브라우저 검증은 Emulator 빌드 완료 후 순차 실행. 검증 컨텍스트는 localhost 외 네트워크 요청을 차단한다. 일반/Emulator 빌드가 같은 dist를 사용하므로 병행 실행하지 않는다.
- `git diff --check`, 변경 파일 충돌/자격증명 패턴 검사: 발견 없음. 전체 가능한 비밀값 부재의 증명은 아니다.

### 이번 수정 파일

`src/lib/counselingHandwriting.ts`, `src/lib/counselingHandwritingApi.ts`, `src/hooks/useCounselingHandwriting.ts`, `src/components/CounselingHandwritingEntry.tsx`, `src/components/HandwritingCanvas.tsx`, `src/components/CounselingWhiteboard.tsx`, `src/test/counselingHandwriting.test.ts`, `src/test/counselingHandwritingHook.test.tsx`, `src/test/counselingHandwritingRules.test.ts`, `src/test/counselingWhiteboard.test.tsx`, `src/test/handwritingCanvas.test.tsx`, 이 문서.

기존 미커밋 페이지 통합·Rules·Indexes·collectionNames·행사폼 구조 테스트는 이번 Fix Phase에서 추가로 수정하지 않았다. WIP 브랜치와 HEAD는 그대로 유지한다. 운영 Firebase 변경·staging·commit·push·배포 없음.

### Manual Device Gate / 한계

- iPad + Apple Pencil: NOT TESTED.
- Android tablet + stylus: NOT TESTED.
- 실제 손가락 touch 및 하드웨어 palm rejection: NOT TESTED. 합성 Pointer Events의 cancel/lostcapture/resize는 테스트했다.
- 강제 종료·새로고침·OS 종료 시 비동기 저장 성공 보장 없음. beforeunload 경고가 무시될 수 있다.
- 장시간 오프라인, 저장 실패, 연속 pointerdown gesture 중 필기는 탭 메모리에만 남을 수 있다. 메모리 복구는 영구 오프라인 저장이 아니다.
- 기존 손글씨 외 상담 편집 경로까지 optimistic concurrency를 확대하지 않았다. 기존 updatedAt을 갱신하지 않는 별도 경로의 수정까지 검출하려면 별도 범위 검토가 필요하다.

실물 출시 여부는 MANUAL DEVICE TEST REQUIRED이며 소프트웨어 Fix Gate와 혼동하지 않는다.

# 고정 링크 2개 재활용 입력폼 — 로컬 구현

운영 Firebase 연결·설정·Rules 변경, Git staging/commit/push, 배포는 하지 않는다.
슬롯 연결·전체 회차 내보내기·영구 초기화 API에는 `demo-*` Emulator 전용 잠금이 있다.
이 잠금 해제와 운영 적용은 이번 작업에 포함하지 않는다.

## 기존 데이터 연결

- `eventFormSlots/1`, `/2`에 formId를 기록한다. 세 번째 슬롯은 Rules에서 거부한다.
- 기존 폼의 formId/token/tokenHash/소유자/최초 생성일은 변경하지 않는다.
- 기존 자료가 있으면 관리자가 연결할 폼을 명시적으로 선택한다. 자동 선택·덮어쓰기는 하지 않는다.
- 2개보다 많은 기존 폼은 슬롯 미연결 자료로 보존하고 결과 조회 링크를 유지한다.
- 운영 자료의 개수나 내용은 조사하지 않았다. 운영 연결 계획은 별도 승인이 필요하다.
- 레거시 폼에 필수 생성 메타데이터가 없으면 Rules가 연결을 거부할 수 있다. 임의 보정하지 않는다.

## 설명과 필수 설정

기존 `description`을 그대로 재사용하며 새 중복 필드를 만들지 않는다.
문항 설명은 여러 줄 Textarea이며 placeholder와 별도다. 공개·미리보기·응답 상세·인쇄·엑셀 문항 정의에 줄바꿈을 유지한다.
필수 스위치, 공백 검사, 실재 날짜 검사, 주소 양쪽 입력, 기타 내용, 필수 동의를 클라이언트에서 검사한다.
첫 오류 질문으로 스크롤·포커스를 이동한다.

공개 문서의 `requiredQuestionIds`와 제출 문서의 `answeredQuestionIds`를 Rules에서 검증한다.
**한계:** Rules는 Base64 내부 답변을 디코딩하지 못한다. 조작된 클라이언트가 필수 ID만 넣고 내부 값을 비워 보내는 것을 이 검사만으로 완전히 막지 못한다. 서버 수준 의미 검증 PASS로 주장하지 않는다.

## 내보내기와 초기화

1. 접수 마감으로 신규 제출을 차단한다.
2. 모든 회차·버전·응답·메모·통계를 내보낸다. 필터된 현재 회차 엑셀은 초기화 증빙으로 사용하지 않는다.
3. 문항 정의에는 ID/순서/제목/상세설명/필수/placeholder가 포함된다. 주소는 도로명주소와 상세주소 열로 나눈다.
4. 파일 SHA-256, 전체 응답 수, 활성 roundId/versionId, 자료 fingerprint, 다운로드 요청 시각, 실행 직원 UID를 receipt로 보존한다.
5. 관리자의 파일 저장 확인 체크와 제목 재입력이 필요하다. 0건은 다운로드 확인을 생략한다.
6. 응답·버전·메모 변경 시 fingerprint/수정 revision이 달라져 재내보내기가 필요하다.
7. `resetting` 전환 후 공개 조회·제출과 직원 자료 수정을 차단한다.
8. 삭제는 400개 이하씩 묶는다. 진행상태 갱신을 합쳐 batch당 최대 401개 write다.
9. 시작 관리자와 30초 실행 lease를 기록한다. 같은 관리자가 lease 만료 후 중단 작업을 재개한다.
10. 모든 종속 문서가 0건인지 확인하고 빈 draft/새 회차/빈 문항 버전을 만든다. 기존 슬롯·링크는 유지한다.

브라우저는 OS의 실제 파일 저장 완료를 증명할 수 없다. receipt는 다운로드 요청 증빙이며 관리자의 저장 확인과 함께 사용한다.
Rules는 임의 쿼리의 전체 응답 수나 SHA-256 파일 내용을 재계산할 수 없다. admin은 신뢰된 삭제 권한자이며, UI/API의 전체 내보내기 확인을 우회하는 악의적인 admin까지 방어한다고 주장하지 않는다.
손상된 응답이나 누락된 문항 버전이 있으면 내보내기를 중단하고 원본을 보존한다.

## 검증 상태

- 합성 Auth/Firestore Emulator에서 신규 작성·제출·회차 보존 및 2개 슬롯 제한 확인.
- 확장 Rules에서 필수 ID 누락, 초기화 공개 차단, admin 전용 삭제, 다른 슬롯 삭제 거부 확인.
- 400/1000건 삭제와 의도적 중단·재개 시험을 수행한다.
- 기존 Matching 관련 일반 테스트 유지.
- 모바일 실제 390px 화면과 브라우저 인쇄 미리보기는 아직 실측하지 않았다. 컴포넌트 테스트와 CSS 검사만으로 PASS 처리하지 않는다.
- 사용량 표시는 문서 JSON 바이트의 추정치이며 Firestore 인덱스/메타데이터 과금 저장량과 동일하지 않다.

운영 승인 전에는 실제 초기화 기능을 활성화하지 않는다.

## 2026-10-01 실행 결과

| 검사 | 명령/결과 | 종료 코드 |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p tsconfig.app.json` 통과 | 0 |
| ESLint | `npm run lint` 오류 0, 기존 경고 37 | 0 |
| 일반 테스트 | `npm test` 173 통과 / 실패 0 (Emulator 전용 등은 별도 실행) | 0 |
| 일반 빌드 | `npm run build` 통과, 큰 chunk 경고는 숨기지 않음 | 0 |
| Emulator 빌드 | `npm run build:emulator` 통과 | 0 |
| Spark Rules | Auth·Firestore Emulator에서 18/18 통과 | 0 |
| 익명 Auth·통합 | 같은 Emulator에서 3/3 통과 | 0 |
| 공백 검사 | `git diff --check` 통과 | 0 |

Emulator 명령: `firebase emulators:exec --only auth,firestore --project demo-dongbaek-forms "npm test -- --run src/test/eventFormSparkRules.test.ts src/test/eventFormSparkAuth.test.ts src/test/eventFormSparkIntegration.test.ts --maxWorkers=1 --no-file-parallelism"`
프로세스 범위 TEMP/TMP는 기존 Windows 우회 경로를 사용했다. 테스트 종료 후 Emulator가 정상 종료했다.

최신 합성 데이터 초기화 측정 (Excel 생성·다운로드 요청은 측정 시간에서 제외):

- 0건: 339ms
- 1건: 647ms
- 400건: 2,524ms
- 1,000건: 6,641ms (의도적 중단·실행 잠금 확인·재개 포함, lease 만료는 테스트에서만 조정)

엑셀 저장 뒤 메모 변경 시 receipt 무효화와 재내보내기, 다른 슬롯 보존, token 유지, 응답 0건, 기존 이미지 0건, 새 빈 draft 회차/버전 1개를 확인했다.
숫자는 작은 합성 응답 기준이며 50KB 최대 payload 1,000건의 성능을 의미하지 않는다.

미완료: 실제 390px 브라우저 가로 넘침 및 인쇄 미리보기 실측. 등록된 브라우저 가이드 파일/브라우저 자동화 런타임을 사용할 수 없어 이 두 항목은 미검증으로 남긴다.

운영 Firebase·Rules·Auth·App Check 변경 없음. staging/commit/push/배포 없음. 기존 WIP 브랜치 변경 없음.

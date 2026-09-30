# 행사·교육 입력폼 Spark 운영 준비서

작성 기준일: 2026-09-29
상태: 로컬 구현·Emulator 검증 대상. 운영 Firebase·Auth·Firestore·App Check·GitHub Pages에는 아직 반영하지 않았다.

## 1. 운영 구조

- 호스팅: 기존 GitHub Pages와 `/#/forms/{token}` 공유 주소 유지
- 인증: 직원은 기존 Email 인증과 `admin`/`social_worker` Custom Claim, 신청자는 별도 Firebase 앱의 Anonymous Auth
- 데이터: Firestore 직접 읽기·쓰기
- 보호: Firestore Security Rules, App Check 측정 모드, 클라이언트 검증
- 사용하지 않음: Callable Functions, Firebase Storage, Secret Manager, Scheduled Function, IP rate limit

기존 `functions/`와 `src/lib/eventFormApi.ts`는 Blaze 전용 미사용 구현으로 보존한다. Spark 화면은 `src/lib/eventFormSparkApi.ts`만 사용한다.

## 2. Blaze 방식과 차이

| 항목 | Blaze 대안 | Spark 운영 후보 |
|---|---|---|
| 관리자 작업 | Callable Functions | staff Claim + Firestore Rules |
| 공개 조회·제출 | Function 서버 검증 | Anonymous Auth + 정확한 문서 get/create |
| 이미지 | Storage + 검증 Trigger | 브라우저 디코딩·WebP 변환 후 Firestore blob |
| 중복 차단 | 연락처 키 원자 생성 가능 | 익명 UID 1건 + 결과의 연락처 중복 경고 |
| 호출 제한 | IP·token rate limit | App Check·결정적 문서 ID·버튼 재클릭 차단 |
| 이미지 정리 | Scheduled Function | 관리자가 수동 정리 |

## 3. 데이터와 공개 경계

- 비공개: `eventForms`, `eventFormVersions`, `eventFormRounds`, `eventFormSubmissions`, `eventFormAuditLogs`, `eventFormImageBlobs`
- 공개 투영: `eventFormPublic/{sha256(token)}`
- 공개 문서에는 폼 제목·설명·일시·장소·활성 회차/버전·문항 스냅샷·기간·상태·완료 안내·공개 이미지 ID만 둔다.
- 원본 token, 관리자 UID·메모, 응답 목록, 연락처·주소, 감사 기록은 공개 문서에 저장하지 않는다.
- 공개 컬렉션과 이미지 컬렉션의 list/query는 금지하며, 익명 사용자는 알고 있는 hash/asset ID의 정확한 문서 get만 할 수 있다.

## 4. 제출 보장과 남은 한계

- 문서 ID는 `{roundId}__{anonymousUid}`이므로 회차당 익명 UID 1건만 create 가능하다.
- Rules가 `open`, 신청 기간, 활성 round/version, UID, 서버 시각, 상태, 허용 문항 key, 관리자 필드 부재를 재검사한다.
- 공개 사용자는 자신의 응답도 read/update/delete할 수 없다.
- 문항별 필수값·이메일·연락처·날짜·주소 상세주소·동의·선택지 형식과 길이는 브라우저에서도 검사한다.
- 답변은 UTF-8 JSON을 Base64로 저장한다. Rules는 Base64 길이 68,268자 이하를 강제하므로 디코딩 전 JSON 본문을 최대 50KB로 제한하며, 허용 문항 ID 목록도 최대 100개로 별도 검사한다.
- Firestore Rules는 Base64 내부 JSON의 문항별 자료형·필수값·선택지 일치 여부나 `answerIds`와 내부 key의 완전한 일치를 파싱할 수 없다. 관리자 로더는 파싱 실패를 빈 답변과 `응답 형식 오류` 상태로 처리하고, 결과 포맷터도 조작된 선택형·주소 자료형을 빈 값으로 처리하여 결과·검색·통계·엑셀 화면이 중단되지 않게 한다. 화면은 답변을 React 텍스트로만 출력하며 HTML로 직접 삽입하지 않는다.
- 익명 계정은 브라우저 저장소 삭제, 시크릿 모드, 다른 기기 사용으로 새 UID를 만들 수 있다. 따라서 연락처 기반 강제 중복 차단을 보장하지 않는다.
- App Check는 정상 앱 요청 여부를 보조하며 IP rate limit이나 완전한 스팸 차단을 대신하지 않는다.

## 5. 이미지 정책

- 입력 허용: JPEG, PNG, WebP. SVG, GIF, HTML, 임의 MIME 거부
- 브라우저에서 실제 이미지 decode 후 방향을 반영하고 최대 변 1,600px로 축소
- WebP로 변환하고 base64 인코딩 문자열을 문서당 250KB 이하로 제한
- 폼 버전당 최대 12개, 공개 이미지 합계 최대 2MB
- `dataBase64`는 Firestore 인덱스 제외 설정 사용
- temp/unused 이미지는 자동 삭제하지 않는다. 관리자가 수동 정리하며 모든 과거 버전의 참조를 확인해 참조 중인 이미지는 보존한다.

## 6. 무료 한도 보호

- 문항 최대 100개
- 응답 답변 JSON 최대 50KB. UTF-8 JSON을 Base64로 저장하고 Rules에서 Base64 길이 68,268자 이하를 강제한다.
- 긴 서술형은 문항당 최대 5,000자, 문항은 최대 100개, 복수 선택값은 답변당 최대 100개로 제한한다.
- 편집 화면에 이미지 개수·공개 이미지 합계·예상 대상 인원 기준 이미지 전송량을 표시
- Firestore 저장량은 `현재 이미지 인코딩 크기 + 예상 인원 × Base64 응답 최대 68,268바이트`로 보수적인 상한을 표시한다. 50KB JSON이 Base64로 약 4/3 증가하는 저장 오버헤드를 포함하며, 실제 사용량은 응답 길이에 따라 더 작다.
- 결과 수는 저장된 `responseCount` 증가값 대신 Firestore count 집계 및 실제 조회 결과로 계산
- Spark 무료 한도를 넘을 때 자동 과금된다고 안내하지 않는다. 무료 할당량 소진 시 읽기·쓰기·전송 또는 서비스가 제한될 수 있음을 안내한다.

## 7. 월 400명 기준 용량 계산

이미지는 Firestore에 한 번 저장되지만, 사용자가 조회할 때마다 네트워크로 전송된다. 따라서 저장량과 전송량을 별도로 계산한다. 아래는 공개 이미지 2MB, 응답 400건, 답변 JSON 최대 50KB(저장 시 Base64 최대 68,268바이트)를 모두 사용하는 보수적 상한이며 인덱스·문서 메타데이터는 별도다.

| 항목 | 계산 | 상한 추정 |
|---|---:|---:|
| 회차 1개 저장 | 이미지 2MiB + 응답 400 × 68,268바이트 | 약 28.0MiB |
| 연 10회 저장 | 28.0MiB × 10 | 약 280MiB |
| 연 20회 저장 | 28.0MiB × 20 | 약 561MiB |
| 월 이미지 전송·평균 1회 접속 | 400 × 2MB | 약 800MB (0.78GiB) |
| 월 이미지 전송·평균 2회 접속 | 400 × 2MB × 2 | 약 1.6GB (1.56GiB) |
| 월 이미지 전송·평균 3회 접속 | 400 × 2MB × 3 | 약 2.4GB (2.34GiB) |

공개 폼 1건과 이미지 최대 12건을 모두 별도 문서로 읽는 최악 조건은 접속당 약 13 reads다. 400명이 같은 날 각각 1·2·3회 접속하면 약 5,200·10,400·15,600 reads이고, 제출 400건은 최소 400 writes다. 관리자 결과 조회와 이미지·폼 편집 쓰기는 여기에 추가된다.

운영 판단 기준은 Firestore 저장 1GiB, reads 50,000/일, writes 20,000/일, 외부 전송 10GiB/월을 기준으로 한다.

| 사용률 | 저장량 | reads/일 | writes/일 | 전송/월 | 관리자 확인 사항 |
|---|---:|---:|---:|---:|---|
| 70% | 약 716.8MiB | 35,000 | 14,000 | 7GiB | 이미지 재사용·접속 횟수·비정상 반복 요청 확인 |
| 85% | 약 870.4MiB | 42,500 | 17,000 | 8.5GiB | 신규 대형 이미지와 불필요한 재접속을 줄이고 Firebase 사용량을 매일 확인 |
| 95% | 약 972.8MiB | 47,500 | 19,000 | 9.5GiB | 새 회차 공개 전 용량 확보, 필요 시 접수 일시 중단·이미지 축소·운영 방식 재승인 |

Spark 한도 초과는 자동 과금으로 전환되는 것이 아니라 읽기·쓰기·전송 또는 서비스가 제한될 수 있다. 과거 회차가 참조하는 이미지는 용량 절약을 이유로 삭제하지 않는다.

## 8. App Check

- 웹용 reCAPTCHA Enterprise 공급자를 기본 앱과 공개 익명 앱 모두에 초기화할 수 있게 구성한다.
- 운영 초기에는 enforcement를 켜지 않고 측정한다.
- 정상/실패 요청 비율과 현장 모바일 브라우저 호환성을 확인한 뒤 별도 승인으로 enforcement를 결정한다.

## 9. 직원 권한

- 기존 4개 `admin`/`social_worker` Claim을 유지한다.
- 브라우저는 다른 계정의 Claim을 수정하지 않는다.
- Functions 기반 직원 권한 관리 메뉴는 Spark 기본 모드에서 숨기고, 직접 URL 접근 시 무료 운영 모드 안내만 표시한다.
- 신규 직원 권한은 Firebase Console 또는 별도 승인을 받은 신뢰된 로컬 Admin SDK 스크립트로 수동 설정한다.

## 10. 운영 전 필요한 무료 설정

1. 운영 Firebase Authentication에서 Anonymous 공급자 활성화
2. Firestore Rules와 인덱스 변경분 백업·검토
3. App Check 웹 앱·사이트 키 등록 후 측정 모드로 시작
4. 실제 개인정보가 아닌 가짜 데이터로 운영 프로젝트 스모크 테스트 승인
5. GitHub Pages 프런트 커밋·push·배포 승인

Functions, Storage bucket, Secret Manager, Blaze 전환과 결제수단은 필요하지 않다.

## 11. 롤백

- 배포 전 Firestore Rules와 indexes 원본을 보관한다.
- 문제가 발생하면 이전 Rules를 재배포하고 GitHub Pages를 직전 프런트 커밋으로 되돌린다.
- 신규 Spark 컬렉션은 즉시 삭제하지 않고 읽기 차단 상태로 보존한다.
- Anonymous Auth 공급자와 App Check enforcement 변경은 각각 별도 승인으로 되돌린다.
- 기존 이용자·활동지원사 컬렉션과 과거 행사 응답은 롤백 과정에서 삭제하지 않는다.

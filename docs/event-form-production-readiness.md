# 행사·교육 신청 폼 운영 전환 보고서 (초안)

> **Blaze 전용 기존 설계 — 현재 운영에 사용하지 않음**
> 이 문서는 Functions·Storage·Secret Manager를 사용하는 유료 전환 대안의 기록이다. 현재 운영 후보는 `event-form-spark-readiness.md`의 Spark 직접 Firestore 방식이며, 아래 Functions와 Storage 코드는 별도 Blaze 승인 전까지 배포하지 않는다.

작성 기준일: 2026-09-29. 프런트엔드는 GitHub Pages에 반영되어 있으나 행사 폼 운영 Functions·Rules·Storage는 아직 배포하지 않았다. 운영 데이터 변경, Blaze 전환, Firebase Hosting 배포는 하지 않았다.

## 1. 운영에 필요한 Firebase Functions

| Function | 목적 | 최대 인스턴스 |
|---|---|---:|
| `createEventForm` | 고정 공개 token, 폼, 최초 회차를 함께 생성 | 2 |
| `saveEventFormDraft` | 관리자 문항·기본정보 저장과 제거 이미지 상태 전환 | 2 |
| `publishEventForm` | 문항 스냅샷 생성, 이미지 활성화, 접수 시작 | 2 |
| `setEventFormStatus` | 접수 준비·시작·마감 상태 변경 | 2 |
| `startEventFormRound` | 과거 회차 보관과 새 회차·activeRoundId 원자 전환 | 1 |
| `getPublicEventForm` | token으로 공개 가능한 정보만 반환 | 5 |
| `submitEventForm` | token/회차/버전/문항/중복/기간을 재검증하고 원자 저장 | 5 |
| `updateEventSubmission` | 관리자 메모와 응답 상태 변경 | 2 |
| `verifyEventFormImage` | Storage 업로드의 MIME·용량·실제 디코딩·해상도 확인 | 2 |
| `cleanupEventFormImages` | 참조되지 않는 temp/unused 이미지와 rate-limit 문서 정리 | 1 |

`cleanupEventFormImages`는 Scheduled Function이므로 현재는 코드와 Emulator 설계만 포함하며 운영 배포 대상에서 제외한다.

## 2. Functions 없이 구현할 수 없는 이유

- 로그인하지 않은 공개 사용자의 제출을 허용하면서 Firestore 전체 쓰기 권한을 열지 않으려면 신뢰할 수 있는 서버 검증 경계가 필요하다.
- 제출 순간의 `token`, `activeRoundId`, 공개 문항 버전, 접수 상태를 다시 읽고 한 트랜잭션에서 확인해야 회차 전환 직전 제출이 과거 회차에 섞이지 않는다.
- 회차별 중복 차단은 동시에 들어온 두 요청에도 하나만 성공하도록 원자적 duplicate key 생성이 필요하다.
- Storage Rules는 이미지 픽셀 크기나 실제 디코딩 성공 여부를 검사할 수 없으므로 서버의 이미지 디코딩 검증이 필요하다.
- 고정 token 매핑, 공개 응답의 입력값/선택지 ID 검증, rate limit은 클라이언트 코드만으로 우회 방지가 불가능하다.

## 3. 예상 사용량

보수적 소규모 가정: 연 20개 행사, 행사당 200명(연 4,000응답), 폼당 이미지 2개, 최적화 이미지 평균 1MB.

- Firestore: 제출 1건당 대략 읽기 6~8회, 쓰기 3~4회. 연간 약 읽기 24,000~32,000회, 쓰기 12,000~16,000회에 관리자 결과 조회가 추가된다.
- Functions: 공개 폼 조회와 제출을 각각 1회로 보면 연 8,000회 안팎에 관리자 편집 호출과 이미지 Trigger가 추가된다.
- Storage: 폼 이미지 약 40MB/년. 공개 조회량은 포스터·선택지 사진 수와 참여자 수에 비례한다.
- Hosting: 현재 빌드 약 2.8MB(압축 전)이며 실제 전송은 압축·캐시된다. 월 방문 수와 이미지 로딩량에 따라 전송량이 달라진다.

이는 실제 행사의 수, 이미지 수, 결과 화면 새로고침 빈도에 따라 달라지는 추정치이며 운영 전 1개월 측정 후 갱신한다.

## 4. 무료 한도 안에서 운영될 가능성

위 소규모 가정은 Firestore의 일일 무료 제공량(읽기 50,000, 쓰기 20,000, 삭제 20,000, 저장 1GiB)과 Functions 월 무료 제공량(호출 2백만 회 등)보다 매우 낮아 사용량 자체는 무료 구간에 머물 가능성이 높다. 다만 Functions와 Cloud Storage 운영 사용에는 Blaze 요금제가 필요하고, Functions 컨테이너/Artifact Registry 저장처럼 소액 비용이 발생할 수 있으므로 “완전 무료”를 보장할 수 없다.

공식 기준:

- Firestore: https://firebase.google.com/docs/firestore/pricing
- Functions: https://firebase.google.com/docs/functions/faq-and-troubleshooting
- Storage/전체 가격: https://firebase.google.com/pricing
- Hosting: https://firebase.google.com/docs/hosting/usage-quotas-pricing

## 5. 비용이 발생할 수 있는 조건

- Firestore 문서 읽기·쓰기·삭제·저장·네트워크가 무료 한도를 넘는 경우
- Functions 호출, CPU/메모리 실행 시간, 외부 전송, 배포 컨테이너 저장이 무료 한도를 넘는 경우
- 이미지 저장량·다운로드·업로드/다운로드 작업 수가 Storage 무료 구간을 넘는 경우
- Hosting 저장 10GB 또는 전송 10GB/월을 넘는 경우
- reCAPTCHA 평가가 조직 합산 월 10,000회를 넘는 경우. 결제 미연결 Essentials는 이후 요청이 429로 실패할 수 있고, 결제 연결 시 과금 구간으로 이어질 수 있다.
- 스팸·봇·잘못된 클라이언트 재시도로 공개 조회/제출이 비정상 증가하는 경우

App Check 공식 안내: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider

## 6. 과도한 호출과 비용 방지

- Callable Functions `maxInstances`를 1~5로 제한했다.
- 공개 제출은 회차별로 동일 IP+token 10회/분, token 전체 120회/분, token 전체 600회/10분으로 제한한다.
- 같은 중복키로 거절된 요청은 5회/10분으로 제한한다. 가족·보호자 연락처 공유 가능성을 고려해 기본 정책은 차단이 아닌 `warn`이다.
- IP·공개 token·중복값 원문은 저장하지 않고 운영 비밀값을 사용한 HMAC 식별자만 저장한다.
- 응답 payload는 200KB, 문항은 100개로 제한한다.
- 회차별 중복 key와 트랜잭션으로 동시 중복 제출을 제어한다.
- 이미지 원본 5MB, JPEG/PNG/WebP, 최대 변 2,560px로 제한하고 클라이언트에서 WebP로 최적화한다.
- App Check는 먼저 측정 모드로 배포하고 정상/실패 비율 확인 후 별도 승인으로 enforcement를 켠다.
- Google Cloud 예산 알림을 낮은 단계(예: 50%, 80%, 100%)로 구성하고 Functions/Firestore/Storage/Hosting 사용량 대시보드를 주기적으로 확인한다.
- 로그에 원문 연락처·주소·응답 내용을 남기지 않고 식별자는 해시/문서 ID만 사용한다.

## 7. 운영 배포와 롤백 절차

### 배포 전 승인 후 진행

1. 별도 개발/운영 Firebase 프로젝트와 환경변수를 확인한다.
2. Blaze 전환, 결제수단, 예산 알림을 사용자 승인 후 설정한다.
3. Rules 및 Functions를 staging 프로젝트에서 Emulator 테스트와 동일 시나리오로 검증한다.
4. Firestore indexes → Rules → Functions → Storage Rules → Hosting 순으로 작은 단위 배포한다.
5. App Check는 등록만 하고 enforcement는 끈 상태로 지표를 수집한다.
6. 가짜 폼으로 공개 조회·제출·회차 전환·엑셀·인쇄를 점검한 뒤 실제 폼을 만든다.

### 롤백

1. 문제가 있는 폼을 `closed`로 전환해 신규 제출을 먼저 중단한다.
2. Hosting은 Firebase release history에서 직전 정상 버전으로 rollback한다.
3. Functions/Rules는 직전 검증 소스 버전을 재배포한다.
4. 회차 데이터는 삭제하지 않고 audit log를 확인해 `activeRoundId`와 상태를 복구 트랜잭션으로 되돌린다.
5. App Check 오탐이면 enforcement만 해제하고 원인을 분석한다.
6. Storage 이미지는 active/archived 참조를 보존하며 임의 일괄 삭제하지 않는다.

운영 배포 명령, 프로젝트 ID, 도메인/DNS 변경은 현재 승인 범위가 아니므로 실행하지 않았다.

## 8. 권한과 감사 기록

- 관리 권한은 Firebase Custom Claims의 `admin` 또는 `social_worker` 역할로 판정한다.
- 로그인 여부만으로는 행사 폼, 결과, 통계, 관리자 메모, 이미지 관리에 접근할 수 없다.
- Emulator Seed는 네 가짜 계정에만 Claim을 부여하며 운영 계정 Claim은 변경하지 않는다.
- 폼 생성·수정·공개, 새 회차 시작, 응답 관리자 수정에는 작업자 UID와 서버 시각을 기록한다.

## 9. 운영 전 남은 승인 사항

- 네 실제 직원 계정에 Custom Claims를 설정하는 작업
- Blaze 전환과 운영 Functions·Storage·Hosting 배포
- App Check 운영 측정 및 enforcement 활성화
- 운영용 HMAC 비밀값과 예산 알림 설정
- 실제 개인정보를 사용하지 않는 staging 최종 검증
# 로컬 출시 후보 최종 점검 (2026-09-28)

## 검증 완료

- Node 20.20.2에서 Functions 빌드, 단위·구성 테스트, Functions Emulator 통합 테스트, Firestore·Storage Rules 테스트, App Check enforcement 테스트를 통과했다.
- 운영 런타임과 다른 Node 24 전용 API 또는 의존성 오류는 발견되지 않았다.
- 공개 폼과 관리자 경로를 route lazy loading으로 분리하고, 결과 엑셀은 저장 버튼 클릭 시 동적 import하도록 변경했다.
- 초기 JavaScript는 2,761.00KB(gzip 803.54KB)에서 817.76KB(gzip 219.34KB)로 감소했다.
- XLSX는 429.35KB(gzip 143.18KB) 별도 청크이며 공개 폼 최초 접속에서 내려받지 않는다.
- 실제 Chrome Emulator 흐름에서 관리자와 전담사회복지사 접근, 역할 없는 계정 차단, 비로그인 모바일 공개 폼, 이미지 등록, Kakao 도로명주소 검색·선택, 제출, 결과·통계, 엑셀, 인쇄 호출, 새 회차와 과거 스냅샷 보존을 확인했다.
- 400건 주소 포함 응답은 최초 표시 2.117초, 검색 0.292초, 필터 0.666초, 엑셀 다운로드 준비 0.975초로 측정됐다. 엑셀은 178,991바이트였고 JS heap 사용량은 약 26MB였으며 브라우저 응답이 유지됐다.

## 운영 전 남은 승인

- 운영 Firebase 프로젝트 연결
- 실제 직원 네 계정의 Custom Claims 설정
- Blaze 요금제와 결제수단 등록
- Firebase Hosting·Functions·Storage 운영 배포
- App Check 운영 측정 후 enforcement 활성화
- 예산 알림과 호출량 모니터링 설정
- 운영 롤백 절차 승인

현재 점검은 demo 프로젝트 ID를 사용하는 Local Emulator와 가짜 데이터만 사용했다. 운영 데이터, 운영 Auth, 운영 Storage에는 변경이 없다.

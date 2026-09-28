# 행사·교육 신청 폼 — Firebase Emulator 실행 안내

이 기능은 현재 `demo-dongbaek-forms` 로컬 프로젝트에서만 개발·검증합니다. 운영 Firebase 프로젝트, 운영 DB, 운영 사용자, 운영 Storage에는 연결하지 않습니다.

## 실행

1. `npm install`
2. `npm --prefix functions install`
3. `npm run build:emulator`
4. `npm --prefix functions run build`
5. `npx firebase-tools emulators:start --project demo-dongbaek-forms`
6. 별도 터미널에서 `npm --prefix functions run seed`
7. Hosting Emulator `http://127.0.0.1:5000` 접속

가짜 관리자 계정은 `social-worker-1@example.test`부터 `social-worker-4@example.test`까지이며 암호는 `emulator-only-1234`입니다. Seed 실행 시 1번 계정에는 `admin`, 2~4번 계정에는 `social_worker` Custom Claim을 설정합니다. 실제 개인정보는 입력하지 않습니다. Claim 변경 후에는 로그아웃·재로그인 또는 ID token 강제 갱신이 필요합니다.

공개 폼 예시는 `http://127.0.0.1:5000/forms/demo-public-form-token-0000000001`입니다. `/forms/{token}` 새로고침은 Hosting rewrite로 `index.html`에 연결됩니다.

## 안전장치

- `.firebaserc` 기본값은 `demo-` 접두사 프로젝트이며, 앱도 Emulator 모드에서 `demo-*`가 아니면 즉시 중단합니다.
- 공개 사용자는 Firestore 결과·관리 문서를 직접 읽거나 쓸 수 없습니다.
- 행사 폼 관리 Function, Firestore 관리 데이터, Storage 업로드는 `admin` 또는 `social_worker` Claim이 있는 계정만 허용합니다. 로그인만 된 일반 계정은 차단합니다.
- 공개 조회와 제출은 Callable Function에서 token, activeRoundId, versionId, 상태, 문항/선택지 ID를 다시 검증합니다.
- 이미지 업로드는 로그인 사용자만 가능하며 JPEG/PNG/WebP, 원본 5MB 이하, 최대 변 2,560px 조건을 클라이언트와 Storage Trigger에서 나누어 검사합니다.
- App Check 강제 적용은 `ENFORCE_APP_CHECK=true`가 명시된 승인된 운영 환경에서만 활성화됩니다. 현재 Emulator에서는 비활성입니다.
- 제출 제한은 회차별로 분리하며 `동일 IP+token 10회/분`, `token 전체 120회/분`, `token 전체 600회/10분`, `같은 중복키 거절 5회/10분`입니다. IP·token·중복값 원문은 저장하지 않고 HMAC 식별자만 저장합니다.
- 운영에서는 `RATE_LIMIT_HASH_SECRET`을 Secret Manager 등으로 주입해야 합니다. Emulator만 로컬 고정값을 사용합니다.

## 로컬 검증 범위

- 가짜 응답 100건·400건으로 통계와 동적 문항 엑셀 생성 시간을 검증합니다.
- 주소가 포함된 400건 응답도 메모리에서 XLSX 파일로 생성하고, 연락처 앞자리 0과 한글 주소를 확인합니다.
- 생성자·수정자·공개자·회차 시작자·응답 수정자의 UID와 시각을 감사 필드로 남깁니다.

> Windows에서 Firestore Emulator가 `Unable to establish loopback connection`으로 시작되지 않으면 Java/로컬 네트워크 스택 문제입니다. 코드·규칙 테스트와 별개로 Java 17/21 런타임 및 loopback 정책을 점검한 뒤 위 명령을 다시 실행하세요.

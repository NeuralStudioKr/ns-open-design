# Main SSO ↔ Design BFF 계정 불일치 — 현황 보고 · 예방 로드맵 (45)

**대상:** CTO / Design 플랫폼 리드
**작성일:** 2026-07-21
**상태:** Stage 0 (감지 + 자동 재바인딩) staging 반영, Stage 1–4 미승인
**SSOT 인접 문서:**
- [41 Design Drive 인증 계약 권고](./41_Design_Drive_인증_계약_권고.md) — 토큰 패밀리·프록시 계약
- [39_10 HA 세션쿠키 경합 해결](./39_10_HA_세션쿠키_경합_해결.md) — BFF 쿠키 경합
- [22 Drive 인증 · Usage 연동 검토](./22_Drive_인증_Usage_연동_검토.md) — 계약 히스토리
- [00 구현 내역 누적](./00_구현_내역_누적.md) — 2026-07-21 항목

---

## 0. TL;DR (CTO용 1페이지)

- **무엇이 문제인가.** 브라우저에 상주하는 두 쿠키 — Main SSO(`teamver_access_token`, 부모도메인 `.teamver.com`)와 Design BFF 세션(`teamver_design_bff_session`, 호스트 한정) — 이 **서로 다른 Teamver 사용자**를 가리키는 상태가 존재할 수 있다. Drive/Canvas 프록시는 두 쿠키를 함께 사용하므로 이 상태에서 Main이 opaque `error.forbidden` 403을 낸다.
- **왜 생기는가.** 다른 탭·창에서 Main에 **다른 계정으로 로그인/계정 전환** 하면 부모도메인 SSO 쿠키만 새 계정으로 덮어써지고, Design 호스트 쿠키는 **원래 사용자로 남는다**. 두 쿠키의 수명이 **의도적으로 분리**돼 있어(플랫폼 SSO ↔ 앱 세션) 계약상 언제든 발생 가능하다.
- **지금까지 한 것 (Stage 0, 이미 배포됨).** BFF가 프록시 전에 mismatch를 감지해 401 `main_sso_user_mismatch` 반환 → FE가 **조용히 Main logout + Design cold start**로 자동 재바인딩. 사용자에게 “계정 불일치”·수동 재로그인 CTA를 노출하지 않는다.
- **한계.** Stage 0은 **감지 후 복구**다. 발생 자체는 허용된다. **다음 Drive 호출 시점**까지 mismatch가 유지될 수 있고, 그 순간 리다이렉트가 사용자에게 잠깐 튄다.
- **예방 로드맵 (4단계, 아래 §6).**
  1. **Stage 1 — 세션에 Main user pin (Design-only, S/W).** exchange 시점의 Main 사용자 식별자를 BFF 세션에 고정, 세션 응답에 노출.
  2. **Stage 2 — FE 사전 비교 (Design-only, S/W).** 포커스/`visibilitychange`/BroadcastChannel wake 시 Main 쿠키 JWT의 `user_id`를 즉시 비교 → 어긋나면 Drive 호출 전에 재바인딩. **사용자가 “문제 상황을 만난 뒤” 복구하는 대신 “문제가 생기자마자” 복구**.
  3. **Stage 3 — 크로스탭 브로드캐스트 (Design-only, M).** Main 사용자 변경을 감지한 첫 탭이 `teamver-embed` 채널로 `main-user-changed`를 전파해 다른 Design 탭까지 동시에 재바인딩.
  4. **Stage 4 — Main Drive Dual-auth (Main 플랫폼 변경, L).** Drive가 Apps JWT를 수용하도록 하여 부모 SSO 쿠키와 무관하게 ACL이 일치. 41 §3.2 방안 B. 구조적 완결책, 플랫폼 팀 협의 필요.
- **의사결정 필요.**
  - Stage 1·2·3는 Design 팀 단독으로 3–5 영업일 내 가능. **승인 요청**.
  - Stage 4는 Main 플랫폼 팀과 로드맵/스코프 조율. **분기 단위 결정 요청**.
- **성공 지표.** § 9 참고 (mismatch 감지 이벤트 수, 사용자에게 노출된 복구 flash 비율, Drive 403 SR).

---

## 1. 문제 정의

Design 앱은 두 종류의 자격증명을 병용한다.

| 쿠키 / 토큰 | 발급·수명 소유 | Domain | 담긴 사용자 | 용도 |
|---|---|---|---|---|
| `teamver_access_token` (Main HS256 platform JWT) | **Main** 로그인/로그아웃 | `.teamver.com` (parent SSO) | Main에 마지막으로 로그인한 사용자 | Drive / Asset REST가 요구 (HS256 platform 검증기) |
| `teamver_design_bff_session` (Apps RS256 + `user_id` + workspace) | **Design BFF**만 | Design host-only | Design cold-start exchange 당시 사용자 | Design 자체 API, workspace 컨텍스트 |

Drive 프록시(`GET /teamver-bff/drive/*`, `POST /projects/{id}/publish`, `POST /projects/{id}/import-canvas`, `POST /projects/{id}/import-drive`)는 **Main 쿠키를 Bearer로 forward + Design BFF workspace를 `X-Workspace-Id`로 전송**한다. 두 쿠키가 같은 사용자를 가리키면 정상, 어긋나면 Main이 `{"message":"error.forbidden"}` 403.

**증상 원문 (사용자 관점, Stage 0 이전):**

> Drive 모달 열기 → 리스트/탐색만 되던 것이 특정 사용자에서 opaque 403. Design 세션·workspace는 정상. Main 원문에는 사유가 없어 “권한 문제인가?”로 오해됨.

**Stage 0 이후 사용자 관점:**

> Drive 열기 → 잠깐 “연결 확인 중” 상태 후 Main 로그인 페이지로 이동 → 원래 슬라이드로 복귀. **잠깐의 화면 튐이 남는다.**

---

## 2. 재현 조건 · 관측 신호

### 2.1 재현 (staging 기준)

1. 브라우저 A 프로필로 Design cold-start 로그인 (User A).
2. **같은 브라우저 다른 탭**에서 Main(`teamver.com`)에 User B로 로그인 (또는 계정 전환).
3. Design 탭으로 복귀 → Drive 모달을 열거나 슬라이드 발행 시도.
4. Stage 0 배포 전: opaque 403. 배포 후: 자동 리다이렉트 → 재바인딩.

### 2.2 원격 관측 신호

- BFF 응답 `{"detail":"main_sso_user_mismatch","code":"main_sso_user_mismatch"}` 401 카운트.
- FE `sessionStorage["teamver_main_sso_mismatch_recover"]` 스탬프 기반의 사용자당 발생 빈도(현재 로그로는 집계 안 됨 — Stage 1에서 계측 추가 필요).
- Main Drive 원문 `error.forbidden`은 다른 원인과 섞이므로 단독 지표로는 부적합.

### 2.3 발생 시나리오 목록

| 시나리오 | 빈도 | 비고 |
|---|---|---|
| 다른 탭 Main 계정 전환 | 상시 잠재 | 지원팀·사내 다계정 사용자에서 특히 관측 |
| 브라우저 프로필 공유 | 중 | 개발/QA |
| Main 강제 로그아웃 후 재로그인 (다른 계정) | 저 | 세션 만료 유도 케이스 |
| 확장 프로그램·SSO 대리 로그인 | 저 | 관리자 대행 접속 |

---

## 3. 근본 원인 (구조적)

### 3.1 왜 두 쿠키인가

[41 §2](./41_Design_Drive_인증_계약_권고.md) 참고. 요약:

- **Main Drive 등 platform REST**는 HS256 platform JWT만 수용한다 (`aud=teamver.com`, Main secret로 검증).
- **Design 자체 API**는 Apps RS256 (`aud=teamver-design`) 기반 BFF 세션을 쓴다.
- 둘을 하나의 쿠키로 합치려면 (a) Main이 Apps JWT를 수용하거나 (b) Apps 세션을 없애야 하는데, 두 경로 모두 플랫폼 계약을 흔든다. 그래서 **부모도메인 SSO 쿠키 + 호스트 한정 BFF 세션**의 이중 구조를 유지한다 (권고: [41 방안 A](./41_Design_Drive_인증_계약_권고.md#4-권고-결정)).

### 3.2 왜 “저절로” 어긋날 수 있는가

- `teamver_access_token`은 `.teamver.com` 부모 도메인에 걸려 있어, **Main에서 다른 계정으로 로그인/계정 전환이 발생하면 전 서브도메인의 쿠키가 새 사용자로 덮어써진다.** Design은 이 이벤트를 알 방법이 없다 (cross-origin 로그인).
- `teamver_design_bff_session`은 Design host-only이며 Design cold-start exchange만이 이를 갱신한다. **Design은 자기가 갱신하기 전까지 원래 사용자로 남는다.**
- 즉 “한쪽만 갱신되는 창”이 존재하고, 그 창 동안 Drive 프록시가 두 사용자 사이에서 실행되면 mismatch가 실제 실패로 표면화된다.

### 3.3 왜 지금까지 Drive만 아팠나

- Design 자체 API(`/projects`, `/artifacts` 등)는 **BFF 세션만 사용**한다 → Main 쿠키가 바뀌어도 Design 관점에서는 정상 동작.
- Drive / publish / canvas / import는 **두 쿠키를 모두 사용**한다 → mismatch가 폭로된다.
- Mail 등 유사 BFF는 Main Drive REST를 프록시하지 않는 한 동일 함정에 걸리지 않는다 ([41 §7 FAQ](./41_Design_Drive_인증_계약_권고.md#7-faq)).

---

## 4. 지금까지 한 것 (Stage 0 — 감지 + 자동 재바인딩)

**커밋:** `9c5038786`, `4fa8408e2`, `51af11d48` (staging 반영)
**문서:** [00 §2026-07-21](./00_구현_내역_누적.md), [41 §6.3](./41_Design_Drive_인증_계약_권고.md#63-main-sso--design-계정-불일치-main_sso_user_mismatch)

### 4.1 BE (proxy 이전에 차단)

- `deploy/teamver/be/app/auth/main_sso.py:45-58` — `main_sso_user_mismatches_bff(request, bff_user_id)`가 Main 쿠키 JWT의 unverified `user_id`와 Design BFF `auth.user_id`를 대소문자 무시 비교.
- 라우터별 게이트:
  - `deploy/teamver/be/app/routers/drive.py:173-179`
  - `deploy/teamver/be/app/routers/projects.py:72-73` (publish)
  - `deploy/teamver/be/app/routers/canvas.py:29-30`
- 응답 형태(Drive형 통일): `401 { "detail": "main_sso_user_mismatch", "code": "main_sso_user_mismatch", "re_login_scope": "main", "login_url": ... }` (`exception_handlers.py:115-`).

### 4.2 FE (자동 재바인딩)

- `apps/web/src/teamver/mainSsoMismatchRecovery.ts` — `beginMainSsoMismatchRecovery()`:
  1. Main `POST /api/auth/logout` (`clearOrphanTeamverAuthCookies`) — 잘못된 parent 쿠키 폐기
  2. Design BFF `POST /auth/logout` — mismatch된 BFF 세션 폐기
  3. `returnTo` 유지한 채 Main cold-start 로그인으로 리다이렉트
  cooldown(`sessionStorage["teamver_main_sso_mismatch_recover"]`, 45s)로 리다이렉트 루프 방지.
- 프록시 catch에서 자동 트리거:
  - `driveApi.ts:297` (Drive browse/fetch), `importDriveAssets.ts:198`, `publishToDrive.ts:308`, `importCanvas.ts:200`
  - `ChatComposer.tsx:1634,1744` (사용자 액션 catch)
- 사용자 카피: mismatch일 때 “계정이 다릅니다 / 다시 로그인” 문구·CTA **없음**. 리다이렉트 직전에 잠깐 “연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.” 정도만 표시.
- Apps refresh loop 방지: `withDesignBffCookieAuthRecovery`가 mismatch에서 `/auth/refresh`를 시도하지 않음.

### 4.3 테스트

- vitest: `teamver-main-sso-mismatch-recovery.test.ts`, `teamver-bff-cookie-auth-recovery.test.ts`, `teamver-drive-api.test.ts`, `teamver-canvas-import-errors.test.ts`, `teamver-bff-auth-error.test.ts`, `teamver-main-sso-gate.test.ts`
- pytest: `test_drive_router.py::test_proxy_drive_main_sso_user_mismatch_rejects_before_forward`, `test_session_expired_response.py::test_main_sso_user_mismatch_maps_to_drive_shaped_body`

### 4.4 Stage 0의 결정적 한계

| 한계 | 결과 |
|---|---|
| **감지 시점이 “첫 Drive 호출”** | 사용자가 실제로 mismatch를 만나야 복구가 시작된다. Drive 안 열면 잘못된 상태가 그대로 유지된다. |
| **리다이렉트 flash** | Main logout → Main sign-in → callback 왕복 동안 사용자가 짧게라도 화면 전환을 인지한다. |
| **다중 탭 파급 없음** | 한 탭이 복구해도 다른 Design 탭들은 여전히 mismatch 상태. 각 탭이 개별적으로 다음 Drive 호출에서 다시 복구를 시작한다. |
| **exchange 시 “Main 사용자” 스냅샷 없음** | 서버 세션은 `pin_main_user_id`를 갖고 있지 않다 — 라이브 Main 쿠키만 비교 대상. exchange 시점 사용자와의 delta 분석 불가. |
| **관측 지표 부재** | 자동 복구가 몇 명에게 몇 번 발생했는지 서버 로그로만 집계된다. 사용자 여정에 튄 flash 횟수는 계측 안 됨. |

---

## 5. Prevention gap 분석 (코드 기준)

Stage 0 코드베이스에서 **예방(“애초에 안 생기게”) 계층이 존재하지 않는다는 것**을 다음 세 지점에서 확인했다.

1. **FE cookie watcher는 존재하지만 presence-only.**
   - `apps/web/src/teamver/teamverAuthCookieHints.ts:5-8` — `document.cookie`에서 `teamver_access_token=` **문자열 존재만** 확인.
   - `apps/web/src/teamver/useTeamverEmbed.ts:597-623` — `pageshow`/`visibilitychange` 시 `cookieHintAppeared = cookieHintNow && !lastCookieHintRef.current`로 **등장 여부만** 감지. `user_id` 비교 없음.
   - `apps/web/src/teamver/teamverEmbedAuthFlow.ts:38-39` — “HttpOnly-only sessions never show document.cookie hints; do not rely on cookie hint alone for sign-in return detection.” — 존재 감지의 한계 명시.
2. **BroadcastChannel(`teamver-embed`)은 workspace/session/refresh만 전파.**
   - `apps/web/src/teamver/teamverEmbedBroadcast.ts:38-41` — 메시지 kind = `workspace-changed | embed-session-changed | bff-refresh-result`. `main-user-changed` 없음.
3. **exchange 시점에 Main 사용자 스냅샷을 저장하지 않는다.**
   - `deploy/teamver/be/app/auth/bff_tokens.py:323-358` — Apps JWT `user_id`만 저장, Main 쿠키 사용자와의 비교/기록 없음.
   - `apps/web/app/auth/callback/page.tsx:48-83` — exchange 성공 후 Main 쿠키 사용자 기록 없음.
4. **Main 로그아웃 → Design 통보 경로 없음.**
   - Main → Design 쪽으로 오는 `postMessage`/`BroadcastChannel`/iframe 브릿지 없음.

**요약:** 지금까지의 방어선은 “Drive 프록시 앞 게이트 + FE recovery redirect” 두 지점뿐. **선제 감지·선제 재바인딩·크로스탭 파급**은 아직 없다.

---

## 6. 예방 로드맵 (Stage 1 → 4)

원칙: **Design 팀 단독으로 최대한 밀어붙이고, 마지막에 Main 플랫폼 팀과 구조 개선.**

### Stage 1 — Exchange 시 Main user pin + 세션에 노출 (S / Design-only)

**목적:** BFF 세션이 “이 세션이 만들어질 때의 Main 사용자”를 기억하게 하여, FE가 서버 라운드트립 한 번으로 비교 기준을 얻는다.

**변경:**

- BE `apply_exchange_to_bff_session` (`auth/bff_tokens.py:323-358`):
  - exchange 시점의 Main 쿠키에서 `user_id_from_access_token_unverified()`로 사용자 추출.
  - `save_bff_session(pin_main_user_id=..., pin_main_user_at=now)` 추가.
- BE `auth/bff_session.py`: 필드 추가 (optional; 기존 세션 backward-compat).
- BE `bff_session_public_view` (`design_auth.py`): 응답에 `expected_main_user_hash` 노출 (raw ID 대신 해시 — 최소 노출). 세션 GET 응답에 포함.
- BE `main_sso_user_mismatches_bff`: 비교 대상을 `pin_main_user_id ?? auth.user_id`로 상향 (Apps refresh로 인해 `auth.user_id`가 회전해도 pin은 유지 → 더 엄격한 감지).
- 계측: mismatch 감지 시 라우터에서 구조화된 로그 (`event=main_sso_user_mismatch pin_user=... live_user=...`).

**투자:** 0.5d. **리스크:** 낮음 — 기존 세션은 pin이 없어도 동작. **UX 영향:** 없음. **테스트:** pytest 추가 (`test_bff_session_pin.py`).

### Stage 2 — FE 선제 사용자 비교 (S / Design-only)

**목적:** 사용자가 Drive를 열기 **전에** mismatch를 감지·해결. Stage 0의 “첫 Drive 호출 시 튐”을 제거.

**변경:**

- 신규 `apps/web/src/teamver/teamverMainSsoUserProbe.ts`:
  - `readMainSsoUserIdFromCookie(): string | null` — `document.cookie`에서 `teamver_access_token` 값을 읽어 unverified JWT payload의 `user_id`/`sub`를 반환 (해시 형태로 반환 옵션 포함, PII 최소화).
  - `checkMainSsoUserMatchesSession(session): "match" | "mismatch" | "unknown"`.
- `useTeamverEmbed.ts:597-623`의 focus 훅에 hook-in:
  - `visibilitychange`/`pageshow`/cookie hint 변화 시 세션 fetch 결과와 비교 → `mismatch`면 즉시 `beginMainSsoMismatchRecovery()`.
  - `unknown` (parent 쿠키 없음, split cookie, opaque)이면 Stage 0 경로 유지.
- `ChatComposer` 및 Drive 모달 open 훅에도 얕은 pre-check 배선 (모달 열기 직전에 unknown/mismatch면 recovery 유도).

**투자:** 1d. **리스크:** parent 쿠키가 HttpOnly로 전환될 경우 `unknown`으로 fallback (Stage 0 경로 유지). **UX 영향:** 사용자 액션 없이도 mismatch가 백그라운드에서 해결됨.

### Stage 3 — 크로스탭 브로드캐스트 (`main-user-changed`) (M / Design-only)

**목적:** 한 탭이 감지하면 다른 Design 탭까지 즉시 재바인딩.

**변경:**

- `teamverEmbedBroadcast.ts`에 메시지 kind 추가:
  ```ts
  | { kind: "main-user-changed"; expectedHash: string | null; sourceId: string; postedAt: number }
  ```
- Stage 2의 probe 결과가 `mismatch`이면 recovery 시작 **전에** 브로드캐스트 → 다른 탭이 자기 세션과 비교해 즉시 Stage 2 recovery로 진입.
- `useTeamverEmbed`에 handler 추가 (기존 `embed-session-changed`처럼 debounce·echo drop).
- 옵션: `storage` fallback (`teamver_design_main_user_last`) — BroadcastChannel 미지원 브라우저 대비.

**투자:** 0.5d. **리스크:** 낮음 (기존 브로드캐스트 인프라 재사용). **UX 영향:** 다중 탭 사용자에게 “한 탭에서만 재로그인이 튀고 나머지 탭은 조용히 정렬”되는 경험.

### Stage 4 — Main Drive Dual-auth (L / Main 플랫폼 변경)

**목적:** 구조적 완결. Drive가 Apps RS256 (`aud=teamver-design`) JWT를 받도록 하면 부모 SSO 쿠키가 어긋나 있어도 Drive ACL이 BFF 세션 사용자로 일치한다.

**정합성:** [41 §3.2 방안 B](./41_Design_Drive_인증_계약_권고.md#3-선택지-비교). 41 문서에서 이미 조건부 중기 옵션으로 명시.

**변경 요건:**

- Main Drive 검증기가 (a) `iss` allowlist, (b) `aud` allowlist, (c) HS256에 더해 RS256 공개키 검증을 수용해야 함.
- Design BFF는 Apps JWT를 Bearer로 전송 (현재 Main 쿠키 forward를 조건부로 대체).
- Drive 감사 로그·rate-limit·quota가 `sub=Apps user_id`로 이관돼도 문제가 없는지 확인.
- 롤아웃: shadow accept → percentage rollout → cutover. 롤백 스위치 필요.

**투자:** Design 2–3d + Main 팀 코스트(별도 산정). **리스크:** Main 정책 변경 — 보안 리뷰 필요. **UX 영향:** mismatch 자체가 원천 소거 (Drive ACL이 BFF 세션과 항상 일치).

**전제 조건:** Main 플랫폼 리드 승인. 승인 없이 Design 단독으로는 실행 불가.

### Stage 요약표

| Stage | 소유 | 노력 | 사용자 flash 제거 | 원천 소거 | 승인 |
|---|---|---|---|---|---|
| 0 (완료) | Design | — | 아니오 (첫 Drive 호출 시 튐) | ✗ | 완료 |
| 1 | Design BE | 0.5d | 그대로 | ✗ (지원 계층) | Design 리드 |
| 2 | Design FE | 1d | **예** | ✗ (감지 시점 앞당김) | Design 리드 |
| 3 | Design FE | 0.5d | **예 (다중 탭까지)** | ✗ | Design 리드 |
| 4 | Main + Design | Design 2–3d + Main 별도 | **예 (원천 소거)** | **✓** | **CTO / Main 리드** |

---

## 7. 리스크 · 트레이드오프

- **Stage 2 unverified JWT decode.** 서명 검증 없이 `user_id`를 읽는다. 위조된 쿠키로 잘못된 “mismatch”를 유도해 재로그인 리다이렉트를 강제할 여지 → 로컬 DoS 성격. **완화:** recovery는 항상 “Main login으로 이동”이므로 데이터 노출 없음. cooldown 45s로 리다이렉트 루프 방지 (이미 Stage 0에서 구현).
- **Stage 1 pin 유출.** raw `user_id`를 세션 응답에 넣지 않고 SHA-256 해시(옵션: HMAC with server pepper)만 노출한다. FE는 라이브 쿠키의 `user_id`도 동일하게 해시해 비교. **PII 노출 최소화.**
- **Stage 3 브로드캐스트 폭주.** 채널·`storage` 조합은 이미 debounce/echo-drop 구조 (`teamverEmbedBroadcast.ts:20-25`). 새 kind에도 동일 규약 적용.
- **Stage 4 감사 로그 축 변경.** Drive 감사 로그가 “Main user_id” 축으로 서있다면 Apps JWT 축으로 이전할 계획이 필요. Main 팀과 사전 확인.
- **HttpOnly 전환 회귀.** 만약 Main이 향후 `teamver_access_token`을 HttpOnly로 만들면 Stage 2 probe는 `unknown` fallback으로 자연 축소되며, Stage 0 자동 recovery만 남는다 (안전한 축소).

---

## 8. 관측성 · 계측 (Stage 1과 동반)

- **BE 로그(구조화):**
  - `event=main_sso_user_mismatch`, 필드 `pin_user_hash`, `live_user_hash`, `route`, `user_agent_class`, `duration_ms`.
  - Drive 프록시 성공 시에도 `pin==live` 확인만 카운터 증가 (기준선 확보).
- **FE 텔레메트리:**
  - `mismatch_detected_proactive` (Stage 2 detection), `mismatch_detected_reactive` (Stage 0 catch).
  - `mismatch_recovery_started`, `mismatch_recovery_completed`, `mismatch_recovery_flash_ms` (사용자에게 노출된 시간).
  - `mismatch_broadcast_received` (Stage 3).
- **대시보드:** Datadog / 관측 스택에 “주간 mismatch 감지 vs 리다이렉트 flash 건수” 패널.

---

## 9. 성공 지표 · SLA

| 지표 | Stage 0 기준선 (측정 필요) | Stage 1+ 목표 | Stage 2+ 목표 | Stage 4 목표 |
|---|---|---|---|---|
| Drive 프록시 mismatch 401 / 사용자 · 주 | 측정치 확보 필요 | 기준선 유지 (감지 정확도 향상만) | –70% (선제 감지가 프록시 도달 전 차단) | ≈0 (구조적 소거) |
| 사용자에게 노출된 recovery flash / 사용자 · 주 | 미측정 | 미측정 → 측정 시작 | –80% (백그라운드 정렬) | ≈0 |
| Recovery 완료 median 시간 | 미측정 | 미측정 → 측정 시작 | ≤ 2s | N/A |
| 다중 탭에서 “한 탭만 flash” 비율 | 0% (모든 탭 개별 튐) | 0% | 0% | 100% (Stage 3 후) |

---

## 10. 커밋·문서 인덱스

**Stage 0 커밋:** `9c5038786`, `4fa8408e2`, `51af11d48`.
**Stage 0 코드 앵커:**
- BE: `deploy/teamver/be/app/auth/main_sso.py`, `deploy/teamver/be/app/routers/{drive,projects,canvas}.py`, `deploy/teamver/be/app/exception_handlers.py`
- FE: `apps/web/src/teamver/mainSsoMismatchRecovery.ts`, `apps/web/src/teamver/teamverBffAuthError.ts`, `apps/web/src/teamver/driveApi.ts`, `apps/web/src/teamver/{importDriveAssets,publishToDrive,importCanvas}.ts`, `apps/web/src/components/ChatComposer.tsx`
- 테스트: `apps/web/tests/teamver-main-sso-mismatch-recovery.test.ts` 등 위 §4.3

**관련 문서:**
- [41 §6.3](./41_Design_Drive_인증_계약_권고.md#63-main-sso--design-계정-불일치-main_sso_user_mismatch) — 계약 SSOT
- [39_10 §1 F행](./39_10_HA_세션쿠키_경합_해결.md) — HA 원인 분해에서 F열
- [00 2026-07-21](./00_구현_내역_누적.md#2026-07-21--drive-main-sso--design-계정-불일치--opaque-403-제거) — 구현 내역

---

## 11. 요청 사항 (CTO)

1. **Stage 1·2·3 승인** — Design 팀 단독, 총 2일 이내. 승인 즉시 착수 가능.
2. **Stage 4 스코프 결정** — Main 플랫폼 팀과의 협의 채널을 열 것인지, 다음 분기 로드맵에 올릴 것인지.
3. **관측성 우선순위** — Datadog/관측 팀에 “mismatch 계측 대시보드” 슬롯 확보.
4. **보안 리뷰 트리거** — Stage 2의 unverified JWT decode 사용에 대한 보안팀 승인 (표면적 노출 없음이지만 원칙상 리뷰).

---

## 12. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-21 | 문서 신설. Stage 0 배포 완료 · Stage 1–4 로드맵 제안. |

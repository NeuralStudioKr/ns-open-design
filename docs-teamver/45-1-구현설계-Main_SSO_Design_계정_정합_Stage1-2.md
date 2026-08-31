# 45-1 구현설계 — Main SSO ↔ Design BFF 계정 정합 (Stage 1·2)

**SSOT:** [45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md)  
**관련:** [41 Design Drive 인증 계약 권고](./41_Design_Drive_인증_계약_권고.md) · [39_10 HA 세션 쿠키](./39_10_HA_세션쿠키_경합_해결.md) · Apps cold start [00 §2026-07-01](./00_구현_내역_누적.md)

**상태:** 구현 진행 (2026-07-27)

---

## 1. 문제·목표

### 1.1 사용자 증상

Main Teamver에서 **로그아웃 → 다른 계정 로그인** 후 Design으로 이동하면, **Main 현재 계정이 아니라 이전 계정**의 프로젝트·워크스페이스·프로필이 보인다.

### 1.2 구조적 원인 (Apps 설계와의 관계)

| 계층 | 내용 |
|------|------|
| **Apps 설계 SSOT** | Design API identity = **BFF HttpOnly 세션**. Cold start = `code` → `design/auth/exchange` **1회**. 이후 `/auth/session` · `/auth/refresh`로 수명 연장. |
| **의도적으로 분리된 수명** | Main platform SSO (`teamver_access_token`, `.teamver.com`) vs Design BFF (`teamver_design_bff_session`, Design host). Main에서 계정 전환해도 **Design BFF는 자동 갱신되지 않음**. |
| **Stage 0 한계** | `main_sso_user_mismatch` + `beginMainSsoMismatchRecovery()`는 **Drive/publish/canvas 프록시**에서만 동작. Design-only 화면만 쓰면 잘못된 BFF 세션이 **Drive 열기 전까지** 유지됨. |

**본 구현은 Apps SSOT를 바꾸지 않는다.** 매 navigation마다 exchange를 강제하지 않고, **드rift 감지 시에만** 기존 cold-start 재바인딩(Stage 0과 동일)을 **더 이른 시점**에 실행한다.

---

## 2. 설계 원칙

1. **일치(`match`)** — 추가 network·exchange 없음. BFF refresh/session 경로 유지.
2. **불명(`unknown`)** — HttpOnly-only Main 세션 등 비교 불가 → Stage 0 reactive 경로 유지.
3. **불일치(`mismatch`)** — `beginMainSsoMismatchRecovery()` 1회 (coalesce + 45s cooldown).
4. **BE pin (Stage 1)** — exchange 시점 Main SSO `user_id`를 BFF에 고정. Apps refresh로 BFF `user_id`가 회전해도 **Main 대응 기준**은 pin.
5. **비교 값 노출** — raw `user_id` 대신 SHA-256(hex, `user_id`.casefold())를 `/auth/session`에 `main_sso_identity_hash`로 노출.

---

## 3. Stage 1 — BFF pin + session API

### 3.1 데이터

- BFF cookie payload `teamver_bff_v1`에 optional `pin_main_user_id` (backward compatible).
- `apply_exchange_to_bff_session`: `pin = read_main_sso_user_id(request) or apps_jwt_user_id`.

### 3.2 공개 API

- `bff_session_public_view` → `main_sso_identity_hash` (pin ?? `user_id` 기준).
- `main_sso_user_mismatches_bff`: design 기준 `(pin_main_user_id or bff_user_id)` vs live Main cookie.

### 3.3 테스트

- pytest: exchange mock request with Main cookie → pin 저장 · hash 필드 · mismatch gate.

---

## 4. Stage 2 — FE 선제 reconcile

### 4.1 모듈

| 파일 | 역할 |
|------|------|
| `teamverMainSsoUserProbe.ts` | cookie JWT payload(unverified) → `user_id` · hash · `checkMainSsoUserMatchesSession` |
| `teamverMainSsoUserReconcile.ts` | `maybeReconcileMainSsoWithDesignSession` → mismatch 시 recovery |

### 4.2 호출 지점 · Phase 2 보강 (0825-N01 Plan A)

- `useTeamverEmbed` — session fetch 성공 + `authenticated` 직후 reconcile (**유지**).
- **추가 (FR-10):** focus/visibility에서 **session fetch를 ladder보다 먼저** — `main_sso_status` 서버 판정 우선.
- reconcile 입력: **`session.mainSsoStatus === "mismatch"`** (0825-N01 FR-9) → cookie probe는 fallback only.

**HttpOnly 한계:** Plan B `teamver_access_token`은 `document.cookie`에 없음 → [0825-N01-2 §12](./0825-N01-2-구현설계-[BFF_session-probe_refresh_401_완전해결].md) Plan A가 Stage 2 probe 공백을 메움.

---

## 5. Main logout → App BFF 폐기 (보조 · Design 단건 ☑ · **멀티앱 Phase 2b**)

Main FE `teamver.com`에서 앱 host-only 쿠키는 `fetch(credentials)`로 전송되지 않음.

- Design `/auth/logout-bridge` — 마운트 시 `postDesignAuthLogout()` best-effort. **☑**
- Main `/auth/logout` — Main `fetchLogout()` 후 hidden iframe으로 Design bridge URL 로드 (3s cap). **☑ 단건**

**한계 (단건):** Docs 등 다른 AI App BFF는 orphan. iframe 차단·ITP에서는 Stage 2/Plan A가 다음 앱 진입 시 정합.

**후속:** orphan 기본 정리는 [0831-N01-1](./0831-N01-1-상위기획-[Apps_Main_auth_멀티앱_정합_구현후보].md) **FR-P0** (`unknown` → 앱 로컬 logout). Main 레지스트리 fan-out은 **가속(선택)** — [0825-N01-1 §12.0.3](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md).

---

## 6. 비목표 (본 단계 · 45-1)

- Stage 3 BroadcastChannel `main-user-changed` (**동일 origin만**)
- Stage 4 Main Drive dual-auth (`aud` allowlist 전제)
- 웹 Main→Design **매 클릭 auth code handoff**
- Phase 2b FR-P0 / Docs 포트 / (선택) fan-out — 0825-N01 슬라이스 R·Q·P

---

## 7. 검증·롤백

- vitest: `teamver-main-sso-user-probe.test.ts`, `teamver-main-sso-mismatch-recovery` 회귀.
- pytest: pin + mismatch gate.
- 수동: Main logout → 계정 B 로그인 → Design 진입 → B 프로필 또는 자동 cold start.

롤백: FE reconcile 호출 제거만으로 Stage 0 동작 복귀. BE `pin_main_user_id` 미설정 세션은 기존 `user_id` 비교 fallback.

# BFF Auth 401 완전 해결 — CTO 전달 요약

| 항목 | 값 |
|------|-----|
| **문서 ID** | `0825-N01-0` |
| **대상** | CTO · 플랫폼 리드 |
| **작성일** | 2026-08-26 |
| **Epic SSOT** | [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) · [0825-N01-2](./0825-N01-2-구현설계-[BFF_session-probe_refresh_401_완전해결].md) · [0825-N01-3](./0825-N01-3-구현현황-[BFF_session-probe_refresh_401_완전해결].md) |
| **관련** | [36](./36_BFF_auth_refresh_401_정리.md) · [45](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md) · [45-1](./45-1-구현설계-Main_SSO_Design_계정_정합_Stage1-2.md) |

---

## 1. 한 줄 요약

staging Design에서 **로그아웃·세션 만료·계정 전환** 시 DevTools에 `POST /auth/refresh 401` → `GET /auth/session-probe 401 ×2`가 반복 노출되며 “인증이 또 깨졌다”로 오인되는 문제를 해결 중이다. **Phase 1(Design FE ladder)은 코드 완료.** Phase 2는 **Main 변경 없이** Design BFF `GET /auth/session`에서 **서버가 Main SSO ↔ BFF pin을 판정**(`main_sso_status`)하고, FE가 그 결과로 선제 reconcile하는 **표준 BFF 패턴**을 1순위로 한다.

---

## 2. 증상 · 영향

| 관점 | 내용 |
|------|------|
| **사용자** | 대부분 soft sticky 후에도 카탈로그·편집은 가능. 로그아웃/계정 전환 직후 깜빡임·재로그인 유도 가능 |
| **QA/개발** | Network 401 도배 → 회귀 판별·오진 비용 ↑ |
| **인프라** | 불필요 BFF/nginx auth_request 부하 (ALB 2노드에서 증폭) |
| **보안** | 401 자체는 정상 거부. 문제는 **불필요 재시도**와 **Main/Design 사용자 불일치** |

---

## 3. 원인 (2층)

### 3.1 Design FE — “죽은 세션인데 HA 복구 probe×2” (Phase 1, ☑)

refresh 401 후 sibling 노드 Set-Cookie 가능성을 위해 **무조건 session-probe 2회**를 치던 ladder.

**조치:** 확정 dead body면 HA probe **0회** · transition pause · 단일 ladder. (vitest 52 pass)

### 3.2 Main ↔ Design — mismatch 선제 감지 공백 (Phase 2, 잔여)

- Main SSO(`teamver_access_token`, `.teamver.com`, **HttpOnly**)와 Design BFF(host-only)는 **의도적으로 분리** ([41](./41_Design_Drive_인증_계약_권고.md)).
- 45-1: pin · reconcile · logout iframe bridge — **코드 반영됨**.
- **잔여:** Stage 2 FE probe가 `document.cookie`에서 Main JWT를 읽는데, **HttpOnly라 대부분 `unknown`** → Drive 호출 전까지 mismatch 미감지. 전환 직후 refresh 401 1회 가능.

**1순위 해결:** BFF가 요청에 실린 Main 쿠키를 **서버에서** 읽어 `/auth/session` 응답에 `main_sso_status` 포함 — **업계 일반적인 BFF session 판정**.

---

## 4. 진행 현황

| 구분 | 내용 | 상태 |
|------|------|------|
| **Phase 1** | Design FE auth ladder (FR-1~5) | ☑ 코드·vitest |
| **45-1** | BFF pin · reconcile · Main logout iframe bridge | ☑ 코드 |
| **Phase 1 검증** | staging S1/S2 수동 | ☐ |
| **Phase 2 Plan A** | `/auth/session` 서버 `main_sso_status` + FE reconcile | 설계 확정 · **Design-only** |
| **Phase 2 Plan B** | Main back-channel logout (M2M) | P2 · 선택 |
| **Phase 2 Plan C** | readable epoch 쿠키 | P3 · session-first 후에도 레이스 남을 때만 |

---

## 5. CTO 승인 요청

### 5.1 Phase 2 Plan A — Session 서버 판정 (권장 · P0 · **Main 변경 없음**)

**제안:** Design BFF `GET /auth/session` 응답 확장:

```json
{
  "authenticated": true,
  "main_sso_identity_hash": "...",
  "main_sso_status": "match" | "mismatch" | "unknown"
}
```

| 항목 | 내용 |
|------|------|
| **판정 주체** | Design BE — `main_sso_user_mismatches_bff()` + pin (이미 Drive gate에 사용) |
| **Main 쿠키** | HttpOnly `teamver_access_token` — 브라우저가 Design 요청에 **자동 전송**, BFF가 서버에서 검증 |
| **FE** | focus/visibility 시 **session fetch → mismatch면 pause + reconcile** (refresh/probe **이전**) |
| **Main 변경** | **없음** |
| **Design 변경** | BE 응답 필드 + FE reconcile 입력 전환 (~1d) |
| **하위 호환** | 필드 없으면 Stage 0 reactive 유지 |

**왜 epoch보다 낫나:** OIDC/OAuth 표준에 가까운 **서버 session 판정**. HttpOnly 환경에서 FE `document.cookie` probe 한계를 제거.

### 5.2 Phase 2 Plan B — Back-channel logout (P2 · 선택)

Main `POST /auth/logout` 시 Design BE에 M2M invalidate (OIDC back-channel과 동형). iframe bridge(45-1, ☑) 보강. **Main BE 변경 필요** — epoch보다 표준적.

### 5.3 Phase 2 Plan C — Epoch 쿠키 (P3 · 최후 수단)

session-first 후에도 **동기 pause**가 부족할 때만 readable `teamver_auth_epoch` 검토. **현재 승인 요청 대상 아님.**

### 5.4 Stage 4 Dual-auth (Epic 밖 · 중기)

Main Drive Apps JWT 수용 → mismatch 원천 소거. [45 §Stage 4](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md).

---

## 6. 권장 일정

```text
[즉시]  staging Phase 1 수동 S1/S2 (30분)
[0.5d]  Design BE: main_sso_status on /auth/session (G)
[0.5d]  Design FE: server-status reconcile + session-first ordering (H·I)
[0.5d]  S8–S11 수동
[선택]  크로스탭 broadcast (L) · back-channel logout (M)
```

**배포:** Design BE → Design FE (Main 변경 없음).

---

## 7. 성공 기준

| ID | Pass |
|----|------|
| S1–S2 | 금지 패턴 `refresh 401 → probe 401 ×2` **0회** |
| S5·S8 | Main logout/계정전환 → focus 시 refresh/probe **0**, reconcile만 |
| S9 | Drive 열기 **전** 올바른 계정 UI |
| S4·S7 | HA 2노드 Drive · publish 회귀 없음 |

---

## 8. 하지 않는 것

- OD upstream main 전체 merge
- Drive Apps JWT 재도입 (41 위반)
- 매 navigation auth code exchange 강제
- **Plan A로 해결되는 한 epoch 쿠키 추가하지 않음**

---

## 9. 의사결정 체크리스트

- [ ] **Phase 2 Plan A 승인** — Design-only session 서버 판정 (G~I)
- [ ] **Plan B back-channel** — 중기 Main M2M logout 편입 여부
- [ ] **Stage 4 Dual-auth** — 별도 CTO 트랙
- [ ] ~~epoch 쿠키~~ — Plan C 보류 (session-first bake 후 재평가)

---

## 10. 문서·코드 앵커

| 영역 | 경로 |
|------|------|
| Design ladder | `apps/web/src/teamver/designBffClient.ts` |
| BFF pin · mismatch gate | `deploy/teamver/be/app/auth/main_sso.py` |
| session 응답 | `deploy/teamver/be/app/routers/auth.py` |
| FE reconcile | `apps/web/src/teamver/teamverMainSsoUserReconcile.ts` |
| Main logout bridge (☑) | `ns-teamver-fe-v2/web/src/lib/clearDesignBffSessionOnLogout.ts` |

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 15:45 | **개정** — Plan A session 서버 판정 1순위 · epoch Plan C로 강등 |
| 2026-08-26 15:30 | CTO 전달용 초안 — epoch 중심 (폐기) |

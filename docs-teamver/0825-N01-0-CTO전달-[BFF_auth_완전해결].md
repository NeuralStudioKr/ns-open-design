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

staging Design에서 **로그아웃·세션 만료·계정 전환** 시 DevTools에 `POST /auth/refresh 401` → `GET /auth/session-probe 401 ×2`가 반복 노출되며 “인증이 또 깨졌다”로 오인되는 문제를 해결 중이다. **Design FE ladder(Phase 1)는 코드 완료**했고, **Main SSO와 Design BFF 정합(Phase 2)** 을 위해 **Main BE에 readable epoch 쿠키 1개 추가** 승인이 필요하다.

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

### 3.1 Design FE — “죽은 세션인데 HA 복구 probe×2” (Phase 1, 해결됨)

refresh 401 후 sibling 노드 Set-Cookie 가능성을 위해 **무조건 session-probe 2회**를 치던 ladder. 세션이 이미 확정 dead(`session_missing` 등)여도 probe×2가 그대로 콘솔에 찍힘.

**조치:** 확정 dead body면 HA probe **0회** · transition pause · 단일 ladder 진입점. (vitest 52 pass)

### 3.2 Main ↔ Design — 크로스 서브도메인 auth 신호 공백 (Phase 2, 잔여)

- Main SSO 쿠키(`.teamver.com`)와 Design BFF 쿠키(host-only)는 **의도적으로 분리** ([41](./41_Design_Drive_인증_계약_권고.md)).
- Main에서 logout/계정 전환해도 Design 탭은 **즉시 알 수 없음** (cross-origin).
- Stage 0~45-1으로 mismatch **감지·재바인딩·logout bridge**는 이미 구현. **전환 직전 1회 refresh 401**과 **Drive 열기 전까지 이전 사용자 UI** 잔존이 남음.

---

## 4. 진행 현황

| 구분 | 내용 | 상태 |
|------|------|------|
| **Phase 1** | Design FE auth ladder (FR-1~5) | ☑ 코드·vitest |
| **45-1** | BFF pin · 선제 reconcile · Main logout iframe bridge | ☑ 코드 |
| **Phase 1 검증** | staging S1/S2 수동 | ☐ |
| **Phase 2 신규** | Main BE `teamver_auth_epoch` + Design FE watcher | 설계 확정 · **승인 대기** |
| **Phase 2 선택** | 크로스탭 broadcast · quiet probe | P1~P2 |

---

## 5. CTO 승인 요청

### 5.1 Phase 2 — Platform Auth Epoch (권장 · P0)

**제안:** Main BE가 login/logout/계정전환 시 parent domain에 readable 쿠키 1개 발행.

```text
Cookie: teamver_auth_epoch = {rev}:{userHash16}
Domain: .teamver.com  (HttpOnly 아님 — Design이 동기 비교)
```

| 항목 | 내용 |
|------|------|
| **목적** | Design 탭이 Main auth lifecycle 변화를 **네트워크 이전**에 감지 → refresh/probe pause → reconcile |
| **PII** | raw `user_id` 미포함. SHA256 16hex hash만 |
| **Main 변경** | `auth_epoch_cookie.py` + login/logout/refresh hook (~0.5d) |
| **Design 변경** | epoch watcher (~0.5d), G 배포 후 |
| **하위 호환** | epoch 없으면 기존 45-1 경로 유지 (`unknown` fallback) |
| **리스크** | 로컬 DoS 성격(위조 hash → 재로그인 유도). 데이터 노출 없음 · 45s cooldown |

### 5.2 Stage 4 Dual-auth (본 Epic 밖 · 중기)

Main Drive가 Apps RS256 JWT를 수용하면 mismatch **원천 소거**. Design 2–3d + Main 별도 · **보안 리뷰·CTO 승인 전제**. [45 §Stage 4](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md).

### 5.3 승인 불필요 (Design 단독 · 이미 반영 또는 P2)

- BFF pin · reconcile · logout bridge (45-1) — **이미 코드 반영**
- quiet probe (DevTools 노이즈만 감소) — 선택
- BFF Redis 세션 공유 — 장기 인프라

---

## 6. 권장 일정

```text
[즉시]  staging Phase 1 수동 S1/S2 (30분)
[0.5d]  Main BE epoch (G) → staging
[0.5d]  Design FE watcher (I) → staging
[0.5d]  S8–S11 수동 (logout/계정전환/4탭)
[선택]  크로스탭 broadcast (L)
```

**배포 순서:** Main BE → Design FE (Main FE bridge는 이미 연동됨).

---

## 7. 성공 기준 (측정 가능)

| ID | Pass |
|----|------|
| S1–S2 | 비로그인·만료 후 **금지 패턴** `refresh 401 → probe 401 ×2` **0회** |
| S5·S8 | Main logout/계정전환 → Design focus 시 refresh/probe **0**, 재바인딩만 |
| S9 | Drive 열기 **전** 올바른 계정 UI |
| S4·S7 | HA 2노드 Drive · publish 회귀 없음 |

---

## 8. 하지 않는 것 (명시)

- OD upstream main 전체 merge
- Drive에 Apps JWT 재도입 (41 위반)
- 매 navigation마다 auth code exchange 강제

---

## 9. 의사결정 체크리스트

- [ ] **Phase 2 epoch 쿠키(G+I) 승인** — Main BE readable cookie 추가
- [ ] **Stage 4 Dual-auth** — 중기 로드맵 편입 여부 (별도 트랙)
- [ ] **보안 리뷰** — epoch hash + unverified JWT compare (45-1 Stage 2, 표면적 노출 없음)

---

## 10. 문서·코드 앵커

| 영역 | 경로 |
|------|------|
| Design ladder | `apps/web/src/teamver/designBffClient.ts` |
| BFF pin | `deploy/teamver/be/app/auth/bff_session.py` |
| Main logout bridge | `ns-teamver-fe-v2/web/src/lib/clearDesignBffSessionOnLogout.ts` |
| Design bridge | `apps/web/app/auth/logout-bridge/` |

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 15:30 | CTO 전달용 초안 — Phase 1/2 · 승인 요청 · 일정 |

# BFF session-probe/refresh 401 — 구현설계 (0825-N01-2)

| 항목 | 값 |
|------|-----|
| **문서 ID** | `0825-N01-2` |
| **역할** | 2 — 구현설계 |
| **상위** | [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) |
| **작성일** | 2026-08-26 |
| **범위** | Phase 1: FR-1~7 (☑) · **Phase 2: FR-8~16 · Phase 2b FR-P\*** (Plan A Design reference + 멀티앱 플랫폼) |

---

## 1. 목표

확정 dead refresh 401에서 HA `session-probe×2`를 제거하고, cookie 부재·known-dead에서 불필요 refresh를 막으며, transition pause 누락을 막는다.

---

## 2. 파일·심볼

| 파일 | 변경 |
|------|------|
| `apps/web/src/teamver/designBffClient.ts` | `extractDesignAuthErrorCode` · `isDefinitiveAuthRefreshDead` · refresh 401 분기 · `shouldAttemptCookieRefresh` 강화 |
| `apps/web/src/teamver/useTeamverEmbed.ts` | logout / 「다시 로그인」 직전 `pauseDesignBffAuthDuringTransition` |
| `apps/web/src/teamver/teamverAuthOrphanJwt.ts` | orphan clear 직전 pause (네트워크 이전) |
| `apps/web/tests/teamver-bff-cookie-auth-recovery.test.ts` | FR-1/2 helpers · probe 0 assert · HA race는 `refresh_failed` |
| `docs-teamver/0825-N01-3-…` · `00` · `36` | 현황·누적 |

**건드리지 않음:** Drive Dual-auth, Redis 세션, quiet 204(FR-6), analytics `provider.tsx`.

---

## 3. 슬라이스 A — FR-1

### 3.1 `extractDesignAuthErrorCode(bodyText)`

JSON에서 `code` 또는 `detail`(string) / `detail.code` 추출. 실패 시 `""`.

### 3.2 `isDefinitiveAuthRefreshDead(status, bodyText)`

401일 때만:

1. `code ∈ {session_missing, session_cookie_invalid}` → true  
2. `code === session_expired` **또는** detail이 `session_expired`이고 **쿠키 힌트 없음** (`!hasProbableTeamverAuthCookie()`) → true  
3. 그 외(`refresh_failed` · unknown + 쿠키 있음) → false → 기존 HA probe×2

### 3.3 `refreshDesignAuthCookie` 401 분기

```text
401
  → knownDead? → soft decline (기존)
  → definitiveDead? → soft decline + probe 0 (ensure도 skip)
  → else → HA probe×2 + ensure (기존)
```

확정 dead에서는 `ensureDesignBffSessionAuthenticated`도 호출하지 않는다(추가 401 방지).

---

## 4. 슬라이스 B — FR-2

`shouldAttemptCookieRefresh`:

1. sticky declined → false (기존)
2. `sessionProbeKnownDeadUntil` 유효 → false (POST 자체를 막음)
3. bootstrap → 기존
4. **embed** + 쿠키 없음 + embed 세션 메모리 false + `!authRecoveryRefreshActive` → **false** (cold unauthenticated refresh 0)
5. cookie 또는 authenticated memory → true
6. standalone bare → `!unauthenticatedRefreshAttempted` (기존)

`allowSoftForcePost` / soft sticky 경로는 `shouldAttempt` 이전에 이미 분기됨 — 유지.

---

## 5. 슬라이스 C — FR-3

| 진입점 | 조치 |
|--------|------|
| `mainSsoMismatchRecovery.ts` | 이미 pause 있음 — 유지 |
| `useTeamverEmbed.ts` logout / 재로그인 직전 | pause **추가** (prepare/clear sticky 전에) |
| `clearOrphanTeamverAuthCookies` | pause 호출 후 logout fetch |

소스 가드 테스트: logout 경로에 `pauseDesignBffAuthDuringTransition` 문자열.

---

## 6. 테스트 계획

| 케이스 | expect |
|--------|--------|
| refresh 401 `code:session_missing` | probe call = 0, soft sticky |
| refresh 401 `code:session_cookie_invalid` | probe = 0 |
| refresh 401 `detail:session_expired` + no cookie | probe = 0 |
| refresh 401 `code:refresh_failed` + probe 204 | recover true, sticky false |
| embed cold: no cookie, not authenticated | refresh not attempted (shouldAttempt false) |
| known-dead then refresh | POST 0 |

회귀: 기존 HA recover · soft force · hard sticky 테스트는 `refresh_failed` 또는 cookie mock으로 맞춤.

---

## 7. 검증·배포

- vitest `teamver-bff-cookie-auth-recovery` (+ 관련 gate/session)
- staging bake 양 노드
- 수동 S1/S2 (확정 dead → refresh≤1, 추가 probe 0)

---

## 8. 슬라이스 D — FR-4 (래핑만)

`ensureDesignAuthLadder(reason, { mode, allowSoftForcePost, bypassNegativeCache })`

| reason | 호출부 |
|--------|--------|
| `boot` | `teamverEmbedSessionBoot` |
| `daemon_401` | `teamverDaemonHeaders` |
| `drive_recover` | `driveApi.recoverDriveAuthSession` |
| `passive` | `teamverEmbedPassiveAuth` |
| `project_view` | ProjectView conversation/messages 401 복구 |
| `workspace` | `setActiveTeamverWorkspace` |
| `c1_escalate` / `soft_force` | `useTeamverEmbed` |

내부 `refreshDesignAuthCookie` HA ladder는 그대로 — 외부만 단일 진입.

## 9. 슬라이스 E — FR-5·7

- FR-5: `devLog.info('[teamver] auth-ladder', { reason, phase, code, probeCount, stats })` + 탭 통계 `getDesignAuthLadderTabStats`
- FR-7: [36](./36_BFF_auth_refresh_401_정리.md)에 「확정 dead → HA probe 금지」 절 · vitest FR-4/5

**FR-6 quiet probe:** Phase 2 슬라이스 M(선택). Phase 1에서는 Epic 비목표 유지.

---

## 10. Phase 2 — Plan A: Session 서버 판정 (FR-8~10 · Design **reference**)

**플랫폼 계약·N앱 복제·Main fan-out:** [N01-1 §12.0](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) · 본 문서 **§15b**.  
아래 파일 맵은 Design 첫 구현체. Docs/후속은 동형 포트(FR-P4).

### 10.1 레포·파일 맵

| 레포 | 파일 | FR | 변경 요약 |
|------|------|-----|-----------|
| **ns-open-design BE** | `deploy/teamver/be/app/auth/main_sso.py` | FR-8 | `resolve_main_sso_status(request, session) -> str` |
| | `deploy/teamver/be/app/routers/auth.py` | FR-8 | `_bff_auth_session_response` · bootstrap view에 `main_sso_status` |
| | `deploy/teamver/be/app/auth/bff_session.py` | FR-8 | `bff_session_public_view` 확장 (선택) |
| | `deploy/teamver/be/tests/test_main_sso_session_status.py` (신규) | FR-8 | match/mismatch/unknown |
| **ns-open-design FE** | `apps/web/src/teamver/designBffClient.ts` | FR-8·9 | `DesignAuthSession.mainSsoStatus` · **session fetch 중앙 gate** |
| | `apps/web/src/teamver/teamverMainSsoUserReconcile.ts` | FR-9 | `mainSsoStatus === "mismatch"` 우선 |
| | `apps/web/src/teamver/teamverMainSsoUserProbe.ts` | FR-9 | cookie probe → **fallback only** |
| | `apps/web/src/teamver/useTeamverEmbed.ts` · `teamverEmbedAuthFlow.ts` | FR-10 | focus: session → reconcile · authenticated `force` |
| | `apps/web/tests/teamver-main-sso-user-probe.test.ts` | FR-9 | server status 우선 케이스 |

**이미 완료 (45-1):** pin · reconcile hook · Design `/auth/logout-bridge` · Main FE Design-only iframe (**Phase 2b에서 레지스트리화**).

**건드리지 않음 (Plan A Design):** Main BE epoch · readable cross-app cookie · Drive dual-auth.  
**Phase 2b에서 건드림:** Main FE logout fan-out · Docs Plan A.

---

## 11. 슬라이스 G — BE `main_sso_status` (FR-8)

### 11.1 `resolve_main_sso_status`

```python
def resolve_main_sso_status(request: Request, session: BffSession | None) -> str:
    if session is None or not session.user_id:
        return "unknown"
    if main_sso_user_mismatches_bff(request, session.user_id, session=session):
        return "mismatch"
    live = read_main_sso_user_id(request)
    if not live:
        return "unknown"
    return "match"
```

- `main_sso_user_mismatches_bff` — pin 우선 비교 (기존 Drive gate와 동일 SSOT).
- 응답 필드명: snake `main_sso_status` → FE camel `mainSsoStatus`.

### 11.2 `/auth/session` 응답

모든 authenticated bootstrap / `bff_session_public_view` 경로에 포함:

```json
{
  "authenticated": true,
  "main_sso_identity_hash": "a1b2…",
  "main_sso_status": "match"
}
```

비인증 `_empty_session()` → `main_sso_status` 생략 또는 `"unknown"`.

### 11.3 pytest

| 케이스 | expect |
|--------|--------|
| pin == Main cookie user | `match` |
| pin != Main cookie user | `mismatch` |
| Main cookie 없음 | `unknown` |
| BFF 세션 없음 | `unknown` |

---

## 12. 슬라이스 H — FE server-status reconcile (FR-9)

### 12.1 `maybeReconcileMainSsoWithDesignSession` 변경

```text
1. session.mainSsoStatus === "mismatch" → recovery (cookie probe 생략)
2. mainSsoStatus === "match" → return false
3. mainSsoStatus === "unknown" | absent → 기존 checkMainSsoUserMatchesSession (cookie fallback)
```

### 12.2 `teamverMainSsoUserProbe.ts`

- 주석: HttpOnly Plan B에서 cookie path는 **fallback**.
- vitest: `mainSsoStatus: "mismatch"` alone triggers reconcile mock.

---

## 13. 슬라이스 I — session-first ordering (FR-10)

### 13.1 `useTeamverEmbed` focus 훅

**Before (문제):** visibility → cookie hint / ladder refresh → session fetch → reconcile (늦음)

**After:**

```text
visibilitychange / pageshow (authenticated embed)
  → fetchDesignAuthSession({ reason: "focus-sso-check" })   // coalesced
  → maybeReconcileMainSsoWithDesignSession(session)       // mismatch → pause + recovery, STOP
  → (no mismatch) existing cookie hint / passive auth / ladder
```

`pauseDesignBffAuthDuringTransition`은 reconcile **직전** (mismatch 확정 시).

### 13.3 테스트

- vitest: focus handler ordering — session fetch before `refreshDesignAuthCookie` mock.
- mismatch session mock → refresh POST count = 0.

---

## 14. 슬라이스 L — 크로스탭 broadcast (FR-13 · P1)

`main-user-changed` in `teamverEmbedBroadcast.ts`. reconcile mismatch **전** post.

**범위:** **동일 앱 origin 탭만.** Design↔Docs 등 크로스앱은 BroadcastChannel로 정렬하지 않는다 — [N01-1 §12.0.4](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md). 크로스앱 SSOT = Main fan-out + 앱별 Plan A.

---

## 15. 슬라이스 M·N·O — 선택 (FR-14~16)

### 15.1 quiet probe (FR-14 · M)

session-probe 401에 `code` · `?quiet=1` → 204 (FE negative-cache 전용). **앱 공통 계약**으로 복제.

### 15.2 back-channel logout (FR-15 · N · **레지스트리**)

```text
Main POST /auth/logout
  → for app in registry:
       M2M POST {app}/internal/auth/main-logout { user_hash }
       + iframe {app}/auth/logout-bridge
  → 각 App: invalidate BFF for user_hash (best-effort)
```

**금지:** Design URL 단건 hardcode를 N개로 복제. fan-out은 **선택 가속**일 때만 레지스트리 단일 표 ([0831-N01-1](./0831-N01-1-상위기획-[Apps_Main_auth_멀티앱_정합_구현후보].md)).

OIDC back-channel 동형. **기본 orphan 정리는 FR-P0 · fan-out/M2M은 후순위.**

### 15.3 epoch 쿠키 (FR-16 · O · Plan C · 보류)

readable `teamver_auth_epoch` — **FR-P0 bake 후** 잔여 레이스 있을 때만 재개.

---

## 15b. Phase 2b — 멀티앱 (슬라이스 R·Q · 선택 P)

상위 SSOT: [N01-1 §12.0](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) · 후보 비교: [0831-N01-1](./0831-N01-1-상위기획-[Apps_Main_auth_멀티앱_정합_구현후보].md).

**채택:** Plan A + **FR-P0 unknown 정합** = 기본. Main fan-out = 가속.

### 15b.1 슬라이스 R — FR-P0 unknown 정합 (P0 · Design 먼저)

| 파일 (예상) | 변경 |
|-------------|------|
| `designBffClient` / reconcile / embed refresh | `mainSsoStatus === "unknown"` ∧ embed authenticated(또는 BFF cookie) → `pause` + `POST /auth/logout` + UI unauth · refresh/probe 0 |
| vitest | logout 후 focus → session unknown → local logout · refresh 0 |

**성공:** S12a.

### 15b.2 슬라이스 Q — Docs Plan A + FR-P0 포트 (FR-P4)

Design G~I·R을 Docs에 동형 포트. onboarding = §12.0.2 표 + FR-P0.

### 15b.3 슬라이스 P — Main fan-out (FR-P1·P2 · **선택**)

| 파일 (예상) | 변경 |
|-------------|------|
| `aiAppLaunchUrls` / registry | `{ origin, logoutBridgePath }[]` |
| `clearDesignBffSessionOnLogout.ts` | 일반화 · Design+Docs 순회 — **S12b 요구 시에만** |

### 15b.4 FR-P5 / M2M

mismatch recovery 형제 bridge · M2M — **선택**. FR-P0로 대부분 대체.

---

## 16. Phase 2 검증·배포

| 슬라이스 | 자동화 | 수동 |
|----------|--------|------|
| G | `test_main_sso_session_status.py` | session JSON DevTools |
| H·I | probe + embed focus vitest | S8·S9 |
| L | broadcast echo-drop | S10 (**동일 origin**) |
| P | Main FE unit (registry) | **S12b (선택)** |
| **R** | unknown 정합 vitest | **S12a** |
| Q | Docs 동형 테스트 | **S13** |

**배포:** Design BE(G) → FE(H·I) → **R(FR-P0)** → S12a → Q → S13.  
**선택:** P → S12b.

---

## 17. Phase 2 위험·가드

| 위험 | 완화 |
|------|------|
| session fetch latency | focus · coalesce · authenticated only |
| `unknown` 과다 | Main cookie 없으면 Stage 0 · FR-P0는 **hadLiveBff**일 때만 |
| mismatch 오탐 | Drive gate와 동일 SSOT |
| **fan-out을 필수로 오해** | [0831-N01-1](./0831-N01-1-상위기획-[Apps_Main_auth_멀티앱_정합_구현후보].md) — 가속만 |
| Stage 3을 크로스앱으로 오해 | §14 · N01-1 §12.0.4 |
| Stage 4 aud 단일 | allowlist |

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-31 15:20 | 재검토 — §15b 슬라이스 R(FR-P0) · P=가속 · [0831-N01-1](./0831-N01-1-상위기획-[Apps_Main_auth_멀티앱_정합_구현후보].md) |
| 2026-08-31 15:05 | Phase 2b §15b · Plan B 레지스트리 · L same-origin |
| 2026-08-26 15:45 | Phase 2 Plan A §10~17 · epoch 보류 |
| 2026-08-26 11:35 | Phase 2 epoch 중심 (폐기) |
| 2026-08-26 11:00 | 슬라이스 D/E |
| 2026-08-26 10:40 | 초안 FR-1~3 |

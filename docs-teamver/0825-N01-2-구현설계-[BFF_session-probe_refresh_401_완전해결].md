# BFF session-probe/refresh 401 — 구현설계 (0825-N01-2)

| 항목 | 값 |
|------|-----|
| **문서 ID** | `0825-N01-2` |
| **역할** | 2 — 구현설계 |
| **상위** | [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) |
| **작성일** | 2026-08-26 |
| **범위** | Phase 1: FR-1~7 (☑) · **Phase 2: FR-8~15 (통합·Main 포함)** |

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

## 10. Phase 2 — 통합 스택 파일·계약 (FR-8~15)

### 10.1 레포·파일 맵

| 레포 | 파일 | FR | 변경 요약 |
|------|------|-----|-----------|
| **ns-teamver-be** | `src/service/auth_epoch_cookie.py` (신규) | FR-8 | epoch set/bump/clear |
| | `src/service/auth_cookie.py` | FR-8 | login/refresh/logout에서 epoch 호출 |
| | `src/router/auth.py` | FR-8 | `_with_auth_cookie` · `logout` · refresh 경로 |
| | `src/core/config.py` | FR-8 | `AUTH_EPOCH_COOKIE_NAME` (default `teamver_auth_epoch`) |
| | `tests/test_auth_epoch_cookie.py` (신규) | FR-8 | rev monotonic · logout clear |
| **ns-teamver-fe-v2** | `web/src/lib/teamverAuthEpoch.ts` (신규) | FR-9 | read/parse epoch · logout bridge |
| | `web/src/services/auth.ts` | FR-9 | `fetchLogout` 후 bridge iframe |
| | `web/src/lib/teamverSharedCookie.ts` | FR-9 | cookie name 상수 export |
| | `web/tests/teamverAuthEpoch.test.ts` (신규) | FR-9 | parse · bridge URL |
| **ns-open-design** | `apps/web/src/teamver/teamverMainAuthEpoch.ts` (신규) | FR-10 | watcher · pause 선행 |
| | `apps/web/src/teamver/teamverMainSsoUserProbe.ts` | FR-12 | [45-1](./45-1-구현설계-Main_SSO_Design_계정_정합_Stage1-2.md) |
| | `apps/web/src/teamver/teamverMainSsoUserReconcile.ts` | FR-12 | reconcile coalesce |
| | `apps/web/src/teamver/teamverEmbedBroadcast.ts` | FR-13 | `main-user-changed` kind |
| | `apps/web/src/teamver/useTeamverEmbed.ts` | FR-10·12 | epoch + reconcile hook-in |
| | `apps/web/app/auth/logout-bridge/page.tsx` (신규) | FR-9 | `postDesignAuthLogout` |
| | `deploy/teamver/be/app/auth/bff_session.py` | FR-11 | `pin_main_user_id` |
| | `deploy/teamver/be/app/auth/bff_tokens.py` | FR-11 | exchange 시 pin |
| | `deploy/teamver/be/app/auth/main_sso.py` | FR-11 | pin 기준 mismatch |
| | `deploy/teamver/be/app/routers/auth.py` | FR-14 | probe `code` · `?quiet=1` |
| | `deploy/teamver/devops/nginx/teamver-design-api-public-auth.inc.conf` | FR-14 | quiet location (선택) |

**건드리지 않음:** Drive dual-auth · Redis BFF · analytics `provider.tsx` · OD upstream merge.

---

## 11. 슬라이스 G — Main BE Auth Epoch (FR-8)

### 11.1 `auth_epoch_cookie.py`

```python
# 의사코드 — 구현 시 auth_cookie.py 패턴 재사용
EPOCH_COOKIE = settings.AUTH_EPOCH_COOKIE_NAME  # teamver_auth_epoch

def user_id_hash_16(user_id: str) -> str:
    return hashlib.sha256(user_id.strip().casefold().encode()).hexdigest()[:16]

def bump_auth_epoch_cookie(response: Response, user_id: str | None) -> None:
    rev = _read_rev_from_request_or_start() + 1
    value = f"{rev}:{user_id_hash_16(user_id)}" if user_id else f"{rev}:"
    _set_readable_cookie(response, EPOCH_COOKIE, value, max_age=7d)

def clear_auth_epoch_cookie(response: Response) -> None:
    bump_auth_epoch_cookie(response, user_id=None)  # rev++ + empty hash
```

**호출 지점:**

| API | 시점 |
|-----|------|
| `issue_login_response` / `_with_auth_cookie` | login·OAuth callback 성공 |
| `POST /auth/refresh` | 200 + Set-Cookie |
| `POST /auth/logout` | clear auth cookie **직후** epoch bump |

**보안:** raw `user_id` 미포함. rev는 monotonic(int). 로컬/테스트는 domain 생략.

### 11.2 테스트

- login → Set-Cookie `teamver_auth_epoch` 존재 · `:` 구분 2파트.
- logout → hash 빈값 · rev 증가.
- 연속 refresh → rev 증가(또는 동일 user면 rev 유지 정책 선택 — **권고: refresh마다 bump 안 함**, login/logout/switch만 bump).

**정책 결정 (권고):** `refresh` 성공 시 rev **유지**, **user_id 변경** 시에만 bump. logout은 항상 bump.

---

## 12. 슬라이스 H — Main FE logout bridge (FR-9)

### 12.1 `teamverAuthEpoch.ts`

- `readTeamverAuthEpoch(): { rev: number; userHash: string } | null`
- `buildDesignLogoutBridgeUrl(): string` — `NEXT_PUBLIC_DESIGN_APP_URL` + `/auth/logout-bridge`

### 12.2 `fetchLogout` 후처리

```text
await api.post('/auth/logout')
  → hidden iframe src = buildDesignLogoutBridgeUrl() (3s remove)
  → localStorage token clear (기존)
```

iframe: `width=0 height=0` · `sandbox` 없음(same-site parent) · `referrerpolicy=no-referrer`.

### 12.3 Design `logout-bridge` 페이지

- 마운트 시 `postDesignAuthLogout()` (기존 BFF logout fetch, credentials include).
- 완료/실패 무관 2s 후 `window.close()` 시도 (iframe이면 parent만 unload).

---

## 13. 슬라이스 I — Design FE epoch watcher (FR-10)

### 13.1 `teamverMainAuthEpoch.ts`

```typescript
let lastSnapshot: { rev: number; userHash: string } | null = null;

export function pollMainAuthEpoch(reason: string): "unchanged" | "changed" | "unknown" {
  const snap = readTeamverAuthEpochFromDocumentCookie();
  if (!snap) return "unknown";
  if (!lastSnapshot || snap.rev !== lastSnapshot.rev || snap.userHash !== lastSnapshot.userHash) {
    lastSnapshot = snap;
    return lastSnapshot === snap && reason !== "boot" ? "changed" : "unchanged"; // boot는 seed만
  }
  return "unchanged";
}
```

### 13.2 `useTeamverEmbed` 통합

```text
visibilitychange / pageshow
  → pollMainAuthEpoch
  → changed?
      yes → pauseDesignBffAuthDuringTransition()
          → maybeReconcileMainSsoWithDesignSession({ reason: "epoch-changed" })
  → (기존 cookie hint / session refresh)
```

**순서 중요:** pause가 **어떤** `refreshDesignAuthCookie`보다 앞.

### 13.3 테스트

- vitest: rev 변경 mock → `pauseDesignBffAuthDuringTransition` 호출 · refresh POST 0.
- epoch `unknown` → 기존 경로 유지.

---

## 14. 슬라이스 J·K — BFF pin + 선제 reconcile (FR-11·12)

[45-1](./45-1-구현설계-Main_SSO_Design_계정_정합_Stage1-2.md) SSOT. 본 Epic에서 추가할 연동만 명시:

| 항목 | N01-2 보강 |
|------|------------|
| hash 알고리즘 | `SHA256(user_id.casefold()).hex()[:16]` — **Main epoch `userHash`와 동일** |
| reconcile 입력 | `session.main_sso_identity_hash` vs epoch `userHash` **또는** cookie JWT unverified hash |
| epoch changed + hash match | cold start **없이** ladder resume (`resetRefreshState`만) |
| epoch changed + hash mismatch | `beginMainSsoMismatchRecovery()` |

**pytest:** `test_bff_session_pin.py` · `test_main_sso_gate.py` 회귀.

**vitest:** `teamver-main-sso-user-probe.test.ts` · epoch+pin 조합 케이스 추가.

---

## 15. 슬라이스 L — 크로스탭 broadcast (FR-13)

`teamverEmbedBroadcast.ts`:

```typescript
| { kind: "main-user-changed"; userHash: string | null; sourceId: string; postedAt: number }
```

- reconcile이 `mismatch` 판정 시 recovery **전에** `postEmbedBroadcast({ kind: "main-user-changed", userHash })`.
- `useTeamverEmbed` 수신 → debounce 300ms → 동일 reconcile (echo drop by `sourceId`).

---

## 16. 슬라이스 M·N — quiet probe · M2M 코드 (FR-14·15, 선택)

### 16.1 session-probe `code` (FR-14)

401 body:

```json
{ "detail": "session_expired", "code": "session_missing|session_cookie_invalid|bff_not_loaded", "login_url": "..." }
```

`GET /auth/session-probe?quiet=1` — unauthenticated 시 **204** (nginx auth_request 호환 확인 필요).  
FE negative-cache 경로만 `quiet=1` 사용 — HA recover는 기존 401 유지.

### 16.2 Main M2M refresh (FR-15)

`POST /api/apps/auth/refresh` 실패 시 body:

```json
{ "code": "refresh_token_invalid|refresh_token_missing|user_disabled", "detail": "..." }
```

Design `bff_tokens.py` → Design `POST /auth/refresh` `code` 매핑 확장 (`refresh_failed` 세분화는 ops 로그만, FE HA 분기는 기존 `refresh_failed` 유지).

---

## 17. Phase 2 검증·배포

| 슬라이스 | 자동화 | 수동 |
|----------|--------|------|
| G | `test_auth_epoch_cookie.py` | staging cookie DevTools |
| H | `teamverAuthEpoch.test.ts` | Main logout → iframe network |
| I·K | epoch + reconcile vitest | S8·S9 |
| J | pytest pin | — |
| L | broadcast echo-drop test | S10 4탭 |
| M | probe code pytest | Console 401 감소 |

**배포:** Main BE(G) → Design BE(J) 병렬 가능 → Main FE(H) → Design FE(I,K,L) → staging bake 2노드 → S1–S11.

---

## 18. Phase 2 위험·가드

| 위험 | 완화 |
|------|------|
| epoch rev 폭주(refresh마다 bump) | login/logout/switch만 bump |
| hash 충돌(16hex) | ops용 full hash는 BE pin에만 |
| iframe bridge CSP 차단 | epoch watcher fallback |
| reconcile 오탐 | `unknown` → Stage 0 유지 · 45s cooldown |
| quiet probe가 nginx auth_request 깨뜨림 | `quiet=1`은 FE probe 전용, nginx는 기존 401 |

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 11:35 | **Phase 2 통합** — §10~18 Main BE/FE · Design BE/FE · 슬라이스 G~N |
| 2026-08-26 11:00 | 슬라이스 D/E — ensureDesignAuthLadder · 계측 · FR-7 |
| 2026-08-26 10:40 | 초안 — FR-1~3 파일·분기·테스트 |

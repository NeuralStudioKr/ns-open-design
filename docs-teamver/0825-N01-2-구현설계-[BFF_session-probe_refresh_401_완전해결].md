# BFF session-probe/refresh 401 — 구현설계 (0825-N01-2)

| 항목 | 값 |
|------|-----|
| **문서 ID** | `0825-N01-2` |
| **역할** | 2 — 구현설계 |
| **상위** | [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) |
| **작성일** | 2026-08-26 |
| **범위** | FR-1 · FR-2 · FR-3 (P0). FR-4~6은 후속 슬라이스 |

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

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 11:00 | 슬라이스 D/E — ensureDesignAuthLadder · 계측 · FR-7 |
| 2026-08-26 10:40 | 초안 — FR-1~3 파일·분기·테스트 |

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

**FR-6 quiet probe:** 이번 루프 제외.

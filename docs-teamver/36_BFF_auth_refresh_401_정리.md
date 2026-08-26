# BFF Auth Refresh 401 정리

## 증상

Teamver embed 프로젝트 상세 페이지 진입 중 DevTools Network에 다음 요청이 보일 수 있었다.

```text
POST /teamver-bff/auth/refresh -> 401 Unauthorized
```

## 원인

현재 hosted Design은 Apps JWT + design-api BFF HttpOnly session을 사용한다. BFF 세션이 없으면 `/teamver-bff/auth/session`은 `authenticated:false` 또는 401 계열로 판단되고, `/teamver-bff/auth/refresh`는 세션이 없기 때문에 401을 반환하는 것이 정상이다.

문제는 FE가 이 상태를 일반 프로젝트 상세 진입에서도 “refresh를 한 번 시도해 볼 수 있는 상태”로 오판한 점이다. 이는 과거 Plan B cookie SSO 시절의 `authenticated:false -> refresh once` 회복 로직이 Apps JWT bootstrap 모드에도 남아 있었기 때문이다.

## 수정

- bootstrap auth mode에서는 bare `authenticated:false`만으로 `/teamver-bff/auth/refresh`를 호출하지 않는다.
- refresh는 다음 경우에만 허용한다.
  - 명시적 인증 회복 경로: 로그인 복귀, 배너의 세션 재시도처럼 `resetRefreshState`가 지정된 경우
  - 이미 embed BFF 세션이 인증된 상태였는데 세션 probe가 401로 만료된 경우
- legacy visible cookie hint(`teamver_access_token`)만으로는 hosted bootstrap 모드에서 refresh를 호출하지 않는다.

## 검증

- `apps/web`: `pnpm exec vitest run tests/teamver-design-auth-session.test.ts` -> 13 passed.
- `apps/web`: `pnpm exec vitest run tests/teamver-use-embed.test.tsx tests/teamver-design-auth-session.test.ts` -> 24 passed.

## 운영 확인

staging 배포 후 프로젝트 상세 페이지를 새로고침해, 일반 진입에서 `POST /teamver-bff/auth/refresh`가 발생하지 않는지 확인한다. 로그인 복귀나 세션 재시도 버튼 클릭 시에만 refresh 호출이 발생해야 한다.

## 2026-07-02 추가 확인

프로젝트 상세 진입 중 보이는 CORS 에러 중 일부는 `/teamver-bff/auth/refresh` 자체가 아니라 daemon `/api/version`, `/api/runs`가 nginx auth_request에서 Main signin 302를 반환하고 브라우저 fetch가 cross-origin redirect를 따라가며 발생했다. 해당 경로는 `fetchTeamverDaemon`으로 통일하고 redirect를 manual 처리해 signin CORS preflight로 확산되지 않도록 보강했다.

## 2026-07-06 production 재점검

추가 증상: `provider.tsx`에서 `POST /teamver-bff/auth/refresh -> 401`이 계속 콘솔에 보였다. 이전 패치는 Design BFF 호출 옵션에 `skipAuthRecovery:true`를 강제했지만, SDK의 기본 HTTP recovery는 `refreshUrl`이 없어도 401에서 기본 `/auth/refresh`를 시도한다. 즉, 새 호출 경로에서 옵션이 빠지거나 SDK domain wrapper가 직접 호출되면 브라우저 Network에 refresh 401이 다시 노출될 수 있었다.

수정:
- `getDesignBffClient()`가 SDK에 넘기는 fetch를 Design 전용 wrapper로 교체했다.
- wrapper는 SDK 내부 recovery가 생성하는 `POST */auth/refresh`만 synthetic 401 응답으로 차단한다. 실제 네트워크 요청은 발생하지 않으므로 DevTools Network/Console에 401 POST가 찍히지 않는다.
- 명시적 수동 회복 경로인 `refreshDesignAuthCookie()`는 global fetch를 계속 사용하므로 로그인 복귀/사용자 재시도 흐름은 유지된다.

검증:
- `apps/web`: `vitest run tests/teamver-design-bff-client.test.ts tests/teamver-design-auth-session.test.ts tests/teamver-bff-request-options.test.ts` -> 16 passed.
- `apps/web`: 전체 `tsc --noEmit`은 기존 test 타입 debt(`proxy-abort-conversation-scope`, `runtime/exports`, `teamver-project-cover-*` 등)로 실패. 이번 변경 파일의 targeted vitest는 통과.

## 2026-07-14 — 이중화 후 Drive `session_expired`와의 구분

임베드 일반 진입에서 불필요한 `/auth/refresh` 401(본 문서)과, **ALB multi-node에서 Drive API가 `session_expired`로 깨지는 문제**는 別개다.

- 초기엔 refresh를 “너무 자주 호출해서”가 아니라, **형제 노드가 stale BFF cookie를 Set-Cookie로 덮어쓰는 경합**이 원인으로 보였고 그것도 실제 있었다.
- **다만 재로그인 이후에도 `/auth/refresh` 200 + Drive 401이 반복**되는 상황은 위와는 별개의 근본 원인: Main `/api/drive/*`, `/api/asset/*`, `/api/v2/shared-drive/*`가 **HS256 platform JWT 전용**이라 BFF Apps RS256 JWT를 언제나 거절한다. 권고·선택지 SSOT는 **[41](./41_Design_Drive_인증_계약_권고.md)**, 구현은 [39_10 §8](./39_10_HA_세션쿠키_경합_해결.md).
- SSOT: **[41](./41_Design_Drive_인증_계약_권고.md)** · **[39_10](./39_10_HA_세션쿠키_경합_해결.md)** (§1~§7 stale Set-Cookie, §8 Main HS256 forwarding) · [22 §3.2g, §3.2f](./22_Drive_인증_Usage_연동_검토.md)
- 운영 시 Network에 Drive `session_expired`가 보이면 본 문서의 FE refresh 억제 로직부터 건드리지 말고, **41 → 39_10 §8 → §5** 순으로 체크리스트를 본다.

## 2026-08-05 — session-probe×2 + refresh + probe×2 폭풍

**증상:** 세션 만료 시 DevTools에 probe×2 → refresh 401 → probe×2 (`provider.tsx`는 analytics fetch wrapper 스택).

**원인:** boot가 `authenticated=true`를 nginx ladder보다 먼저 공표 → App session-changed runtime-config probe×2 레이스 + refresh HA `bypassNegativeCache` probe×2.

**수정:** boot ladder 후 공표 · App boot-incomplete skip · confirm 재probe 제거 · known-dead 시 HA skip · decline 시 negative cache 시드 · sticky quiet 60s cooldown.

**기대:** 확정 dead에서 불필요 401 반복 없음. cold-cache 첫 refresh 401의 HA sibling probe는 유지.

**2026-08-25 후속 (잔여):** refresh 401 **직후** `sessionProbeKnownDeadUntil` 미설정이면 HA probe×2가 여전히 나간다(사용자 보고: refresh→probe→probe). 완전 해결 기획: [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md).

**2026-08-26 P0 (A–C):** 확정 dead body · embed cold · known-dead에서 HA probe/refresh POST 제거. 구현: [0825-N01-2](./0825-N01-2-구현설계-[BFF_session-probe_refresh_401_완전해결].md) · [0825-N01-3](./0825-N01-3-구현현황-[BFF_session-probe_refresh_401_완전해결].md).

### HA probe×2 금지 (확정 dead) — FR-7

| 조건 | HA probe |
|------|----------|
| `code=session_missing` / `session_cookie_invalid` | **0** |
| `session_expired` + 쿠키 힌트 없음 | **0** |
| `sessionProbeKnownDeadUntil` 유효 | **0** (POST도 스킵) |
| `code=refresh_failed` (또는 unknown + 쿠키) | ≤2 + ensure 허용 |

외부 호출은 `ensureDesignAuthLadder(reason)` — DevTools에서 `auth-ladder` 로그로 reason/code/probeCount 확인.

**2026-08-26 Phase 2 (통합·Main 포함):** 크로스오리진 logout/계정전환·선제 mismatch는 Design ladder만으로 부족. `teamver_auth_epoch` 쿠키(Main BE) + logout bridge(Main FE) + epoch watcher(Design FE) + [45](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md) Stage 1–3. SSOT: [0825-N01-1 §12](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) · [0825-N01-2 §10~18](./0825-N01-2-구현설계-[BFF_session-probe_refresh_401_완전해결].md).

## 2026-07-16 — `GET /runtime-config` visibility 401 (본 문서와 구분)

탭 focus마다 `GET /teamver-bff/runtime-config → 401 session_expired` 가 반복되는 현상은 **refresh POST가 아님**.  
원인·대안 비교·세션 가드+401 백오프 채택은 **[43](./43_runtime_config_visibility_401.md)**.

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 11:35 | Phase 2 통합 링크 (Main epoch · 45 Stage 1–3) |
| 2026-08-26 11:00 | FR-7 HA probe 금지 표 · ladder 계측 링크 |
| 2026-08-26 10:45 | P0 A–C 반영 링크 (확정 dead → probe 0) |
| 2026-08-25 17:40 | 08-05 폭풍 절에 잔여 G1(refresh→probe×2) 및 [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) 링크 |

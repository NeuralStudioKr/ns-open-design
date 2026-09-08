# 0908-N01-2 구현설계 — Design 활성 워크스페이스 새로고침 유실 (루프477)

상위: [0908-N01-1](./0908-N01-1-상위설계-[Design_활성WS_새로고침_유실].md) · 현황: [0908-N01-3](./0908-N01-3-구현현황-[Design_활성WS_새로고침_유실].md)

## 목표

새로고침·재진입에서 Design 안의 사용자 워크스페이스 선택(P1 stored_wins)을 보존하고, 부트 reconcile을 1회로 줄이며(P3), 불가피한 자동 전환은 사용자에게 알린다(P2).

## 파일

| 경로 | 역할 |
|------|------|
| `apps/web/src/teamver/teamverEmbedAuthNavigation.ts` | 런치 WS 힌트 stash · one-shot consume |
| `apps/web/src/teamver/syncTeamverWorkspace.ts` | 저장값 검증 헬퍼 export · 자동 전환 사유 dispatch |
| `apps/web/src/teamver/teamverEmbedSessionBoot.ts` | 부트 stored_wins 분기 |
| `apps/web/app/auth/callback/page.tsx` | cold 경로 동일 정책 + BFF 재정렬 |
| `apps/web/src/teamver/useTeamverEmbed.ts` | 부트 대기 후 단일 reconcile · 전환 notice state |
| `apps/web/src/teamver/teamverWorkspaceEvents.ts` | 자동 전환 이벤트 |
| `apps/web/src/components/TeamverSessionBanner.tsx` | 전환 안내 노출 |

## 슬라이스 A — P1 stored_wins + P3 단일 reconcile

### A1. 런치 힌트를 스크럽에서 살려낸다

`COSMETIC_LAUNCH_PARAMS`에서 `workspace_id`·`workspace`를 **제거하지는 않는다**(주소창 정리는 유지). 대신 삭제 **직전에** 값을 읽어 별도 sessionStorage 키에 stash한다.

- 신규 상수 `LAUNCH_WORKSPACE_KEY = "teamver:embed-launch-workspace"` — `LAUNCH_PREFS_KEY`(theme/locale)와 **분리**. `consumeEmbedLaunchPrefs()`가 prefs를 지우면서 읽기 때문에 같은 키에 얹으면 소비자끼리 충돌한다.
- 신규 `consumeLaunchWorkspaceIdHint(): string | null` — URL 우선(콜백처럼 스크럽 전 호출 대비), 없으면 stash. **읽는 즉시 sessionStorage에서 제거**한다.

one-shot이 필수인 이유: sessionStorage는 새로고침에도 살아남으므로, 남겨두면 두 번째 새로고침에서 런치 힌트가 다시 적용돼 P1을 깬다.

기존 `readLaunchWorkspaceIdFromBrowserUrl()`은 비파괴 peek으로 유지한다(다른 호출처 영향 없음).

### A2. 저장값 검증 헬퍼

`syncTeamverWorkspace.ts`에 export 추가:

```ts
readStoredWorkspaceIdOnSession(session, workspacesInput?): Promise<string | null>
```

`store.get()` 값이 세션 워크스페이스 목록에 **존재할 때만** 반환한다. `appEnabled`는 보지 않는다 — 비활성 판단은 P2(자동 전환+알림)가 담당하고, 여기서는 "사용자가 고른 값이 아직 유효한가"만 본다.

### A3. 부트 분기 (`teamverEmbedSessionBoot.ts:113-129`)

```text
launchHint = consumeLaunchWorkspaceIdHint()
storedOnSession = await readStoredWorkspaceIdOnSession(session)

if (launchHint && !storedOnSession)  → 기존 override 래더 (setActiveTeamverWorkspace + preferredIdOverride)
else                                 → syncTeamverWorkspaceFromSession(session)
```

즉 런치 힌트는 **저장값이 없는 최초 진입에서만** 시드가 된다. override 래더 자체(BFF POST → 복구 → `preferredIdOverride`)는 §16 드리프트 방지를 위해 그대로 둔다.

### A4. cold 경로 통일 (`app/auth/callback/page.tsx`)

`exchangeAuthCodeForDesignSession(code, redirectUrl, ws)`는 그대로 둔다 — BFF 세션 수립에 필요하다. 그 다음 적용 단계만 P1에 맞춘다.

```text
storedOnSession = await readStoredWorkspaceIdOnSession(session)

storedOnSession 없음        → 기존 preferred(ws) override 경로
storedOnSession 있고 ws≠stored → setActiveTeamverWorkspace(stored) 로 BFF 재정렬
                                 + sync(preferredIdOverride: stored)
storedOnSession 있고 ws=stored → sync(session)
```

BFF 재정렬이 필요한 이유: exchange가 서버 세션 워크스페이스를 `ws`로 확정했기 때문에, 로컬만 stored로 두면 `X-Workspace-Id`와 쿠키가 어긋난다(§13/§14).

### A5. 부트 중 중복 reconcile 제거 (`useTeamverEmbed.ts:608-619`)

마운트 effect가 부트 미완료 상태에서 곧바로 `refresh()`를 던지지 않게 한다.

```text
boot 스냅샷 authenticated → state 반영
boot 완료?  → return
미완료      → await waitForTeamverEmbedBoot()   // 3.5s fallback race 내장
              부트 후 스냅샷 authenticated → state 반영하고 return (부트가 이미 reconcile 했다)
              여전히 아님 → refresh()
```

`waitForTeamverEmbedBoot()`는 `TEAMVER_EMBED_BOOT_FALLBACK_MS`와 race하므로 부트가 걸려도 무한 대기하지 않는다. effect cleanup에서 `cancelled` 플래그로 늦은 setState를 막는다.

`useTeamverEmbed.ts:410`의 `preserveStoredWorkspace` 식은 **바꾸지 않는다** — 부트/명시적 복구가 reconcile 권한을 갖는다는 기존 계약이 P2(auto_switch)와 정합한다. 고치는 것은 "부트와 동시에 두 번 도는" 레이스뿐이다.

## 슬라이스 B — P2 자동 전환 알림

### B1. 전환 사유 이벤트

`syncTeamverWorkspaceFromSession`에서 `resolved !== stored`이고 **직전 저장값이 존재했던** 경우에만 자동 전환으로 간주한다. 반환형(`string | null`)은 유지해 호출처를 건드리지 않고, 이벤트로만 알린다.

`teamverWorkspaceEvents.ts`:

- `TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT = "teamver-design-workspace-auto-switched"`
- `detail: { from: string; to: string; reason: "app-disabled" | "revoked" }`
- `dispatchTeamverWorkspaceAutoSwitched` / `subscribeTeamverWorkspaceAutoSwitched`
- 크로스탭 브로드캐스트는 **하지 않는다** — 알림은 전환이 실제로 일어난 탭에서만 띄운다.

reason 판정: 직전 저장값(`storedRaw`)이 세션 목록에 있으나 `appEnabled === false` → `app-disabled`, 목록에 아예 없음 → `revoked`.

### B2. state + 표시

`TeamverEmbedState`에 추가:

- `workspaceAutoSwitch: { from: string; to: string; reason: ... } | null`
- `dismissWorkspaceAutoSwitch: () => void`

`useTeamverEmbed`가 `subscribeTeamverWorkspaceAutoSwitched`로 채우고, `switchWorkspace`(사용자 명시 전환) 시 clear한다.

`TeamverSessionBanner`는 이미 `designAppEnabled` warn 칩을 렌더하므로 그 옆에 전환 안내 칩 + 닫기를 추가한다. `data-testid="teamver-embed-workspace-auto-switch"`.

## 테스트

`apps/web/tests/teamver/`:

- `teamver-embed-auth-navigation.test.ts` 확장 — 스크럽이 `workspace_id`를 stash하고 주소창에서 지운다 · `consumeLaunchWorkspaceIdHint()`가 one-shot(두 번째 호출 null) · URL 우선순위.
- 신규 `embed-workspace-persistence.test.ts`
  - 저장값 B가 목록에 있으면 런치 힌트 A를 **무시**하고 B 유지
  - 저장값 없으면 런치 힌트 A를 시드
  - 저장값이 `appEnabled=false` → 전환되고 `auto-switched(reason: "app-disabled")` 발행
  - 저장값이 목록에서 사라짐 → `reason: "revoked"`
  - 부트 완료 전 마운트에서 `syncTeamverWorkspaceFromSession` 비보존 호출이 1회

실행: `NODE_OPTIONS='--experimental-require-module' pnpm exec vitest run tests/teamver/...` (ESM require 이슈 회피 — 기존 관례).

## 비범위

- Main FE(`ns-teamver-fe-v2`) 활성 WS 결함 4건 — 별도 에픽
- BE `_resolve_default_workspace_id` org-claim 정책
- `driveWorkspaceRecovery` 비보존 전환

## 변경 이력

| 2026-09-08 | 루프477 구현설계 (슬라이스 A: P1·P3 / 슬라이스 B: P2 알림) |

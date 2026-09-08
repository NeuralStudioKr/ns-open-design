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

---

# 슬라이스 E·F — 배포된 P1이 브라우저에서 듣지 않는 이유 (루프481)

슬라이스 A~D가 **staging에 배포된 상태에서** 같은 증상이 재현된다는 신고를 받았다.
배포 여부는 실측으로 확정했다(현황 문서 §배포 커밋 범위 확정). 따라서 원인은 P1 로직이 아니라
**P1이 서버 세션을 정렬하지 않는다**는 절반짜리 구현과, **WS가 바뀐 뒤에도 이전 WS 카드가 남는**
목록 적용 규칙이다.

## E. 부트 경로가 BFF 세션을 정렬하지 않는다 (증상 1·2 공통 뿌리)

### E1. 진단

슬라이스 A는 `runTeamverEmbedSessionBoot`의 분기를 이렇게 바꿨다.

```text
if (launchWorkspaceId && !storedOnSession) → setActiveTeamverWorkspace(hint)  // BFF POST
else                                       → syncTeamverWorkspaceFromSession(session)  // 로컬 전용
```

`else`가 **로컬 전용**이다. 저장값이 이기는 정상 경로에서 Design은 자신이 고른 WS를
BFF에 **한 번도 알리지 않는다**. 커밋 메시지(`8c2ca83e7e`)는 "stored 를 유지할 때 BFF 세션도
재정렬해 X-Workspace-Id 드리프트 방지"라고 적었지만, 그 재정렬은 `app/auth/callback/page.tsx`
**에만** 들어갔다.

| 진입 경로 | 부트 함수 | BFF 재정렬 |
|---|---|---|
| Main FE 로그인 왕복 (`/auth/callback?code=…`) | 콜백 페이지 인라인 | ☑ `needsRealign` |
| **새로고침(F5)** | `runTeamverEmbedSessionBoot` | ☐ |
| **주소 직접 진입 · Main FE 재진입(쿠키 살아있음)** | `runTeamverEmbedSessionBoot` | ☐ |
| 탭 포커스/유휴 세션 갱신 | `useTeamverEmbed.refresh` | ☐ (`preserveStoredWorkspace: true`) |
| Drive 403 복구 | `recoverStaleDriveWorkspace` | ☐ |
| 뒤로가기(popstate) | **부트 없음** — 모듈 1회성(`teamverEmbedBoot.bootDone`) | 해당 없음 |

즉 **로그인 왕복만 정렬되고, 그 뒤의 모든 새로고침·재진입은 정렬되지 않는다.**
사용자가 신고한 "새로고침 하는 경우"가 정확히 이 칸이다.

### E2. 드리프트가 두 증상으로 갈라지는 경로

`X-Workspace-Id`는 로컬 저장값에서 나오고(`teamverDaemonHeaders.ts:328`, `driveApi.ts:254`),
`DesignAuthSession`에는 **BFF 세션의 현재 WS 필드가 아예 없다**(`designBffClient.ts:57-67`).
클라이언트는 드리프트를 관측할 수단이 없다.

```text
Main FE 런치 → BFF 세션 = A
Design 저장값 = B (사용자가 Design 안에서 고름)
새로고침 → P1: 로컬 B 유지, BFF에는 아무 말도 안 함
  → 라벨·헤더 = B / BFF 쿠키 세션 = A
  → 레지스트리 GET /projects (X-Workspace-Id: B) 가 서버 정책과 어긋남
      · 거절되면    → 증상 2 (목록 잔존, 아래 F)
      · 서버가 이기면 → 다음 reconcile이 저장값을 A로 되돌림 = 증상 1
```

### E3. 유닛 테스트가 이 간극을 못 잡은 이유

`tests/teamver/embed-session-boot-workspace.test.ts:126`

```ts
// The launch hint must not be pushed to the BFF, otherwise the server
// session drifts to WS-A while the client renders WS-B.
expect(h.setActiveTeamverWorkspace).not.toHaveBeenCalled();
```

단정이 **반대로** 걸려 있다. 힌트를 밀지 않으면 "힌트로의 드리프트"는 막지만,
서버는 **이전 값 그대로** 남는다. 이 테스트는 드리프트 없음을 검증한 게 아니라
**드리프트를 계약으로 고정**했다. 협력자 mock만 보는 테스트라 "서버에 아무 말도 안 한 상태"가
정상인지 비정상인지 판단할 근거가 테스트 안에 없었다.

### E4. 수정

부트도 콜백과 같은 모양으로 만든다 — **이긴 쪽을 서버에 밀어준다.**

```text
preferred = storedOnSession ?? launchWorkspaceId
if (preferred) {
  advanced = setActiveTeamverWorkspace(preferred, userId, { skipEventWhenUnchanged: true })
  sync(session, undefined, advanced ? { preferredIdOverride: preferred } : undefined)
} else {
  sync(session)
}
```

- `advanced === false`(BFF 거절)이면 override를 붙이지 않아 서버 진실로 재조정된다 — 기존 계약 유지.
- `skipEventWhenUnchanged`: 저장값이 이미 `preferred`인 정상 경로에서 `setActiveTeamverWorkspace`가
  `workspace-changed`를 발행하면, `App.tsx:1877`의 부트 전 가드가 이를 `pendingWorkspaceSwitchIdRef`에
  넣고 부트 후 재발행 → **모든 새로고침이 전체 워크스페이스 전환 사이드이펙트(목록 wipe + 레지스트리 동기)를
  돌게 된다.** 값이 실제로 바뀌지 않았으면 발행하지 않는 것이 옳은 불변식이다.

## F. WS가 바뀐 뒤에도 이전 WS 카드가 남는다 (증상 2)

### F1. 진단 — 캐시가 아니라 React state

WS별 캐시는 이미 정상적으로 키가 잡혀 있다.

| 캐시 | 키 | 교차 노출 |
|---|---|---|
| `projectRegistry.registryListCache` | `workspaceId` + `userId` | 없음 |
| `driveHomeRecentCache` | `${workspaceId}::${include}` | 없음 |
| `listRecentProjectsInflight` | `embed:${workspaceId}:${limit}` | 없음 |

문제는 `App.tsx`의 `projects` state가 **WS 태그를 갖지 않는다**는 점이다. 두 지점이 겹친다.

1. **실패 시 잔존** — 뒤로가기로 루트에 돌아오면 `App.tsx:4305`의 라우트 전이 effect가
   `loadRecentProjectsForHome()`을 돌린다. `!result.ok`면 "transient 401에 빈 화면을 깜빡이지 않는다"는
   의도로 **이전 행을 그대로 남긴다**(`4322-4327`). 그 이전 행이 *다른 WS* 것일 수 있다는 판단이 없다.
2. **합집합 병합** — 성공 시에도 `upsertRecentProjects` → `mergeRecentProjectsIntoList`는
   `current ∪ incoming`이다(`embedProjectListRefresh.ts:56-79`). WS가 바뀐 뒤 이 경로로 들어오면
   홈 레일에 **두 워크스페이스의 프로젝트가 동시에** 뜬다.

`beginProjectListRequest()`가 워크스페이스를 캡처하지만(`App.tsx:757`) 부트 경로에서는
`embedActiveWorkspaceIdRef.current`가 아직 `null`이라 `request.workspaceId = null`이 되고,
`isStaleProjectListWorkspace`는 `request.workspaceId`가 falsy면 **항상 false**를 반환한다(`783-797`).
즉 부트에서 시작한 apply는 어떤 WS 변경으로도 무효화되지 않는다.

### F2. 교차 노출 판정

- **서버에서 남의 WS 데이터를 받아오는 경로는 없다** — 멤버십 SSOT는 워크스페이스 스코프 레지스트리이고,
  캐시 키에 WS가 들어 있다.
- **그러나 화면에는 두 WS가 섞여 보일 수 있다.** 카드 클릭 시 상세는 `assertTeamverProjectAccessIfNeeded`로
  막히지만, **제목·타임스탬프·표지 썸네일은 이미 렌더된 상태**다. 데이터 유출 등급은 낮지만
  "이전 워크스페이스의 프로젝트 제목이 새 워크스페이스 홈에 남는다"는 사용자 관점 결함이다.

### F3. 수정

`projects` state에 **어느 WS에서 칠했는지** 태그를 붙인다.

- 신규 순수 모듈 `teamver/embedProjectListWorkspaceTag.ts`
  - `isProjectListWorkspaceMismatch(painted, active)` = `Boolean(painted && active && painted !== active)`
  - 둘 중 하나라도 모르면 **불일치로 보지 않는다**(보수적) — 부트처럼 태그가 아직 없는 구간에서
    멀쩡한 목록을 지우지 않기 위함.
- `App.tsx`
  - `paintedProjectsWorkspaceIdRef` — apply가 성공할 때 현재 활성 WS로 갱신.
  - `upsertRecentProjects` — 불일치면 병합이 아니라 **교체**.
  - 홈 recent 실패 경로 2곳(`refreshProjects` · 라우트 전이 effect) — 불일치면 잔존이 아니라 **비운다**.

## 테스트

| 파일 | 무엇을 고정하나 |
|---|---|
| `tests/teamver/embed-session-boot-workspace.test.ts` | 저장값이 이길 때도 **BFF에 그 값을 POST**한다 (E3의 뒤집힌 단정 정정) · BFF 거절 시 override 없음 · 저장값·힌트 모두 없으면 POST 없음 |
| `tests/teamver-set-active-workspace.test.ts` | `skipEventWhenUnchanged`가 값이 같을 때 `workspace-changed`를 발행하지 않고, 다를 때는 발행한다 |
| 신규 `tests/teamver/embedProjectListWorkspaceTag.test.ts` | 불일치 판정 · 모르는 값은 불일치 아님 |
| 신규 `tests/teamver/embed-home-recent-workspace-retention.test.ts` | 실패 시 같은 WS면 잔존 / 다른 WS면 비움 · 성공 시 다른 WS면 교체 |

## 비범위

- design-api(`stg-design-api.teamver.com`) 쪽 `POST /auth/workspace` 구현 — 이 모노레포에 소스가 없다.
- `/auth/session`에 BFF 세션의 현재 WS를 실어 클라이언트가 드리프트를 **관측**하게 하는 것 —
  BE 변경이 필요하므로 후속(현황 §남은 위험).

## 변경 이력

| 2026-09-08 18:40 | 루프481 슬라이스 E·F 설계 — 부트 BFF 재정렬 누락 · 홈 레일 WS 태그 |
| 2026-09-08 | 루프477 구현설계 (슬라이스 A: P1·P3 / 슬라이스 B: P2 알림) |

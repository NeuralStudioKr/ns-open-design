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

---

# 슬라이스 G — 읽기 함수가 durable 선택을 덮어쓰는 문제 (남은 위험 2·3)

슬라이스 E·F 이후에도 남은 위험 2·3을 처리한다. 대상은 **뒤로가기 증폭**이다:
`route.kind`가 `project → home`으로 바뀌면 `resolveActiveTeamverWorkspaceId()`가 4~10회 **동시** 호출되고,
이 함수는 읽기 함수인데 **비보존 reconcile로 저장값을 쓴다**. 세션 응답이 한 번만 흔들려도
사용자의 durable 선택이 날아가고, 그 판정이 동시 호출 수만큼 중복된다.

## G0. 결함의 정확한 기계 (코드로 확정)

`activeTeamverWorkspace.ts:24-54` 현재 흐름:

```text
storeId = store.get()
skip/decline        → storeId                      (쓰기 없음)
session 실패·미인증  → storeId                      (쓰기 없음)
storeId ∈ workspaces → storeId                     (쓰기 없음)
그 외               → syncTeamverWorkspaceFromSession(session, workspaces)   ← 옵션 없음 = 비보존
```

마지막 줄이 문제다. `storeId`가 세션 목록에 **없을 때**만 도달하지만, 그 조건은 진짜 회수 말고도
**세션 응답이 흔들릴 때** 성립한다.

| 세션 응답 | `pickDefaultWorkspaceId` | 결과 |
|---|---|---|
| `workspaces: []` (또는 필드 누락) | pool 없음 → `null` | `store.set` 없음, `active`(=bootstrap 선호=storeId) 반환 — **무해** |
| `workspaces`가 **비어 있지 않은데 B가 빠진** 부분 응답 | `preferredId=B`는 pool에 없음 → `defaultWorkspaceId`(A) | `store.set(A)` + `setLastForUser(A)` + `workspace-changed` + auto-switch(`revoked`) — **durable 유실** |

즉 위험한 칸은 **"목록은 왔지만 B가 빠진"** 한 가지다. 그리고 그 한 번이
`store.set` 뿐 아니라 `setLastForUser`까지 덮어써 **계정별 마지막 선택까지 A로 승격**시킨다.
그래서 B가 목록에 다시 나타나도 돌아갈 좌표가 남지 않는다 — 사용자가 말한 "계속 바뀐다"의 지속성이 여기서 나온다.

동시성이 이걸 증폭한다. 8회 동시 호출은 8개의 독립 판정이고, 그중 **하나만** 흔들린 응답을 보면
그 하나가 저장값을 옮긴다(각 호출은 서로를 모른다). 앞의 7개가 정상이어도 결과는 이동이다.

## G1. 읽기를 진짜 읽기로 만든다 (위험 2 주 처리)

`resolveActiveTeamverWorkspaceId`는 **어떤 경우에도 쓰지 않는다.** 대신 그 요청에 유효한 좌표를
계산해 반환한다. reconcile 권한은 부트 / 세션 refresh / 명시적 복구가 그대로 갖는다.

신규 순수 모듈 `teamver/activeWorkspaceReadPolicy.ts`:

```ts
resolveActiveWorkspaceIdForRead({
  storedId, workspaces, defaultWorkspaceId, durablePreferenceId,
}): string | null
```

| 입력 | 판정 | 근거 |
|---|---|---|
| `workspaces` 비어 있음 | `storedId` | **근거 없음**. 빈 목록은 회수의 증거가 아니다 |
| `storedId ∈ workspaces` | `storedId` | 기존 계약 |
| 그 외 | `pickDefaultWorkspaceId(workspaces, { preferredId: durablePreferenceId, defaultWorkspaceId })` ?? `storedId` | 헤더는 항상 **유효한** WS 를 가리킨다 |

교착이 생기지 않는 이유: 세 번째 칸이 항상 유효한 WS 를 돌려주므로 `X-Workspace-Id`가 죽은 WS 로 고정되지 않는다.
`teamverDaemonHeaders.ts:326`·`driveApi.ts:254`가 요청 시점에 이 함수를 호출하므로,
저장하지 않아도 "활성 상태는 항상 요청에 유효"가 유지된다(슬라이스 E 성질 보존).

저장값의 실제 수리는 다음 지점이 계속 담당한다 — 각각 **문서당/포커스당 1회**이고 P2 알림을 발행한다.

| 수리 지점 | 함수 | 옵션 |
|---|---|---|
| 부트 | `runTeamverEmbedSessionBoot` | 비보존 reconcile (+ BFF 재정렬, 슬라이스 E) |
| 포커스·유휴 세션 refresh | `useTeamverEmbed.refresh` | `preserveStoredWorkspace: !resetRefreshState && bootComplete` — 저장값이 목록에 없으면 preserve 분기를 타지 못해 비보존으로 떨어진다 |
| 명시적 "다시 시도" | `refresh({ resetRefreshState: true })` | 비보존 |
| Drive 403 복구 | `recoverStaleDriveWorkspace` | 명시 복구 |

## G2. 동시 호출 single-flight

읽기가 쓰지 않게 되면 중복 판정은 무해해지지만, 8회 동시 호출이 8번 판정하는 것 자체가
"한 번만 흔들려도 진다"의 표면을 8배로 넓힌다. 합류시켜 **버스트당 판정 1회**로 만든다.

`activeTeamverWorkspace.ts` 모듈 스코프:

```text
inflightPromise / inflightRevision = readTeamverWorkspaceStoreRevisionMs()

resolve():
  revision = readTeamverWorkspaceStoreRevisionMs()
  inflight 있고 revision 동일 → 같은 promise 반환 (합류)
  아니면 새 flight 시작, finally 에서 자기 자신일 때만 정리
```

**revision 키가 필요한 이유:** `bumpTeamverWorkspaceStoreRevision()`은 `setActiveTeamverWorkspace`
(=명시적 전환·부트 재정렬)만 호출한다. 전환 직후의 호출이 전환 이전에 시작된 flight 에 합류하면
새 WS 를 물어봤는데 옛 WS 를 받는다. revision 을 키로 두면 전환이 곧 flight 무효화가 된다.

`resetActiveTeamverWorkspaceFlightForTests()`를 export 한다 (선례: `resetTeamverEmbedSessionRelayForTests`).

## G3. durable 선호는 재조정으로 승격되지 않는다 (Main T3 정합)

`syncTeamverWorkspaceFromSession`의 꼬리에서 `setLastForUser(userId, active)`가 **무조건** 돈다.
비보존 reconcile 이 이 줄을 타면 시스템이 떠넘긴 값이 "사용자의 계정별 마지막 선택"으로 승격된다.

신규 순수 모듈 `teamver/workspaceDurablePreference.ts`:

```ts
mayPromoteWorkspaceToDurablePreference({ storedBefore, resolved, requestedByCaller }): boolean
```

`false`는 **요청되지 않은 이동**일 때만 — `!requestedByCaller && storedBefore && resolved !== storedBefore`.
시드(`storedBefore === null`)와 확인(`resolved === storedBefore`)과 명시 요청(`override`)은 모두 승격한다.

`store.set`(=활성/헤더 키)은 그대로 이동하므로 교착이 없다. Main FE `setSessionActiveWorkspaceId`와 같은 균형이다.

## G4. 부트가 durable 선택으로 되돌아온다

G3이 `teamver_design_last_workspace_by_user`에 B 를 남겨도, 읽는 쪽이 없으면 의미가 없다.
`store.getPreferredWorkspaceIdForBootstrap`은 **활성 키를 먼저** 보므로 재조정된 A 를 그대로 돌려준다.

`readStoredWorkspaceIdOnSession`(부트·콜백 전용)이 durable 선호를 본다.

```text
active     = store.get()            // 목록에 있으면 후보
durable    = store.getLastForUser(userId)
durable 이 목록에 있고 appEnabled 이고 active 와 다르면 → durable  (한 번의 플레이크 복구)
그 외                                                  → active
```

- **`appEnabled` 조건이 필수:** B 가 Design 비활성이라 P2 로 A 로 옮겼는데 다시 B 를 집어오면
  매 새로고침이 A↔B 를 왕복한다.
- **부트에서만** 한다. 세션 중간에 B 가 재활성됐다고 사용자를 끌어가면 놀란다.
- 명시적 전환은 활성·durable 을 **같이** 쓰므로(`setActiveTeamverWorkspace.ts:132-136`) 둘이 어긋나는 경우는
  **재조정이 활성만 옮겼을 때뿐**이다. 그래서 "다르면 durable" 이 곧 "플레이크 복구"다.

## G5. 부트 프로젝트 목록 요청이 실제 WS 를 캡처한다 (위험 3)

`beginProjectListRequest()`(`App.tsx:760-767`)는 `embedActiveWorkspaceIdRef.current`를 캡처하는데,
그 ref 는 `App.tsx:1757`의 부트 대기 effect 가 채운다. 부트에서 시작한 요청은 `workspaceId: null`을 갖고,
`isStaleProjectListWorkspace`는 `request.workspaceId`가 falsy 면 **항상 false** 다.
슬라이스 F 의 painted 태그도 같은 이유로 부트 첫 페인트에서는 `null` 이라 판정을 못 한다.

동기 스냅샷을 도입한다.

- 신규 `teamver/activeWorkspaceIdSnapshot.ts` — `TEAMVER_ACTIVE_WORKSPACE_STORAGE_KEY` 상수 +
  `readTeamverActiveWorkspaceIdSnapshot()`. `store.get()`은 `Promise`라 동기 캡처에 쓸 수 없어
  같은 localStorage 키를 직접 읽는다. `designBffClient`의 `activeKey`가 이 상수를 쓰게 해
  읽는 키와 쓰는 키가 갈라지지 않게 한다.
- `embedProjectListWorkspaceTag.ts`(슬라이스 F 모듈)에 순수 판정 2개 추가:
  - `resolveProjectListWorkspaceId(refWorkspaceId, snapshotWorkspaceId)` — ref 우선, 없으면 스냅샷.
  - `isProjectListWorkspaceStale(requestWorkspaceId, activeWorkspaceId)` — 양쪽을 알 때만 판정.
- `App.tsx`는 `beginProjectListRequest` · `isStaleProjectListWorkspace` ·
  `markProjectsPaintedByActiveWorkspace` · `isPaintedProjectListFromOtherWorkspace` 네 곳에서
  ref 대신 이 결합값을 쓴다.

`\0boot-flush:` 센티넬(`App.tsx:1765`)은 non-null 이므로 ref 우선 규칙에 그대로 걸린다 — 스냅샷이 이를 덮지 않는다.

## Main FE T3 와 같은 점 / 다른 점

| 항목 | Main FE (T3) | Design 슬라이스 G |
|---|---|---|
| durable 키에 재조정 쓰기 | 0회 (`setSessionActiveWorkspaceId`가 `ACTIVE_STORAGE_KEY`만 쓴다) | 0회 (G3 — `setLastForUser` 승격 차단) |
| 헤더 키 이동 | 항상 허용 (교착 방지) | 항상 허용 (`store.set`) |
| 읽기 경로의 쓰기 | Provider 가 소유, 읽기 헬퍼는 순수 | **읽기 경로 쓰기 0회** (G1) — Design 은 읽기 함수가 요청 헤더를 만들므로 더 강하게 잡아야 한다 |
| single-flight | 불필요 (Provider 단일 소유자, React state) | **필요** (모듈 함수를 5개 표면이 각자 await) |
| durable 복구 | `getPreferredWorkspaceIdForBootstrap`이 부트에서 읽음 | 같음 + `appEnabled` 조건 (G4) — Design 은 WS 별 앱 활성 개념이 있어 조건이 하나 더 필요하다 |

다른 이유의 핵심은 **소유 구조**다. Main 은 `WorkspaceContext` 라는 단일 소유자가 활성 WS 를 들고 있어
"읽기 헬퍼"가 순수한 것이 자연스럽다. Design 은 `resolveActiveTeamverWorkspaceId`가
`teamverDaemonHeaders`·`driveApi`·`projectRegistry`·`publishToDrive` 등 **여러 표면에서 직접 await 되는 모듈 함수**다.
그래서 Main 에는 없던 single-flight 가 필요하고, 읽기의 순수성이 Main 보다 더 엄격해야 한다.

## 테스트

| 파일 | 무엇을 고정하나 |
|---|---|
| 신규 `tests/teamver/active-workspace-read-single-flight.test.ts` | **N=8 동시 호출**이 세션 1회·판정 1회로 합류 · 저장값이 목록에서 빠져도 `set`·`setLastForUser` **0회** · 흔들린 응답 후 목록이 회복되면 durable 선택으로 **되돌아온다** · 빈 목록은 저장값 유지 · revision 이 바뀌면 합류하지 않는다 |
| 신규 `tests/teamver/active-workspace-read-policy.test.ts` | 순수 판정 3칸 (근거 없음 / 저장값 유효 / 유효한 대체) |
| 신규 `tests/teamver/workspace-durable-preference.test.ts` | 요청되지 않은 이동만 승격 차단 |
| 신규 `tests/teamver/embed-project-list-workspace-capture.test.ts` | 부트(ref=null)에서 스냅샷 캡처 · ref 우선 · 양쪽을 알 때만 stale |
| `tests/teamver-sync-workspace.test.ts` 확장 | 비보존 reconcile 은 `setLastForUser` 미호출 · override·시드는 호출 |
| `tests/teamver-active-workspace{,-reconcile}.test.ts` 갱신 | 읽기 경로가 `syncTeamverWorkspaceFromSession`을 **부르지 않고**도 같은 id 를 반환한다 (반환값 동일, 쓰기만 제거) |
| `tests/teamver/embed-session-boot-durable-restore.test.ts` 신규 | 부트가 durable 선택을 복구한다 · 비활성이면 복구하지 않는다 |

## 비범위

- `/auth/session`에 BFF 세션의 현재 WS 를 실어 드리프트를 **관측**하게 하는 것 (남은 위험 1, BE 변경).
- 세션 중간의 durable 복구 — 부트로 제한한다(G4).

---

# 슬라이스 H — 검토 후속 (남은 위험 4 · F 구멍)

E·F·G 코드 리뷰에서 확정한 두 가지를 고친다. BE 변경·라벨↔헤더 드리프트(위험 6)는 비범위.

## H1. P2 알림 last-event latch (남은 위험 4)

`dispatchTeamverWorkspaceAutoSwitched`는 fire-and-forget `CustomEvent`다.
구독은 `useTeamverEmbed`의 `useEffect`에서만 설치된다. 부트/`syncTeamverWorkspaceFromSession`이
구독보다 먼저 이벤트를 내면 배너가 영원히 안 뜬다 — P2 위반.

**수정:** 모듈 스코프에 마지막 자동 전환 detail을 보관한다.

- `dispatch` 시 latch에 기록한 뒤 이벤트를 보낸다.
- `subscribe` 시 **최근 latch**(TTL 60s)가 있으면 microtask로 즉시 replay.
- `clearTeamverWorkspaceAutoSwitchedLatch()` — 사용자가 배너를 닫거나 명시적 전환 시 호출.
  재구독(리마운트)이 이미 닫은 배너를 다시 띄우지 않게 한다.

TTL 이유: 탭을 오래 방치한 뒤 리마운트해도 수 시간 전 전환을 다시 보여주면 안 된다.

## H2. `loadMoreProjects` WS 미검사 (F 구멍)

홈 recent·projects 페이지 첫 로드·refresh·전환 실패는 전부 `dropProjectsPaintedByOtherWorkspace` /
`isStaleProjectListWorkspace`를 타지만, **페이지네이션 `loadMoreProjects`만**
`beginProjectListRequest` 없이 `mergeProjectsByRecency`로 합친다.

전환 직후·전환 중 더보기가 돌면 이전 WS 페이지가 현재 목록에 합쳐질 수 있다.

**수정:** 더보기에도 request를 찍고, 응답 적용 전 stale이면 drop. painted가 다른 WS면
merge 전에 현재 목록을 비운 뒤(또는 drop 후) 새 페이지만 넣는다. 실패 시에도 drop.

## 테스트

| 파일 | 고정 |
|---|---|
| 신규 `tests/teamver/workspace-auto-switched-latch.test.ts` | dispatch→구독 전 유실 없이 replay · clear 후 replay 없음 · TTL 만료 시 무재생 |
| `App` 관련은 가능하면 순수 헬퍼로 빼지 않고, 기존 태그 모듈 테스트 + loadMore 경로의
  stale 호출을 소스/단위로 고정. 복잡하면 `isStale`/`mismatch` 사용 여부만 단정하지 말고
  loadMore 콜백이 request generation을 쓰도록 리팩터 후 작은 추출 함수 테스트 |

## H3~H5 — 검토 후속

### H3. painted=null 소급 (F high)
딥링크 prefetch/hydrate가 행을 넣으면서 태그를 안 남기면 wipe가 스킵된다.
- prefetch·hydrate에서 `markProjectsPaintedByActiveWorkspace`
- `isProjectListWorkspaceMismatch(..., { hasPaintedRows })`: 행이 있고 활성 WS를 알면 untagged도 mismatch

### H4. sync `store.set` → revision bump (G2 medium)
`syncTeamverWorkspaceFromSession`이 id를 바꿀 때 `bumpTeamverWorkspaceStoreRevision()` 호출.

### H5. 부트 첫 recent 실패 drop
boot catalog 실패 분기에 `dropProjectsPaintedByOtherWorkspace` 대칭.

---

# 슬라이스 I — BFF 세션 WS 관측 + focus 드리프트 수리 (남은 위험 1)

슬라이스 E는 부트에서 BFF를 **예방적으로** 재정렬한다. 그래도 부트 이후 서버 쪽 WS가
바뀌면 클라이언트가 드리프트를 **탐지**할 수단이 없다 — `GET /auth/session` JSON에
BFF 쿠키의 `workspace_id`가 실리지 않기 때문이다 (`bff_session_public_view`·session-probe
헤더에는 이미 있다). Main BE 변경 없음. design-api 소스는 `deploy/teamver/be/`.

## I1. BE — session 응답에 `active_workspace_id`

| 경로 | 값 |
|---|---|
| `_empty_session` | `null` |
| `_session_from_bootstrap_payload` | `session.workspace_id` trim, empty→`null` (세션 없으면 `null`) |
| `bff_session_public_view` 폴백 반환 | 동일 값으로 `active_workspace_id` 보강 (기존 `workspace_id`와 별도 키) |

JSON 키는 **snake** `active_workspace_id`. FE는 camel `activeWorkspaceId`.

## I2. FE — 정규화

`DesignAuthSession.activeWorkspaceId?: string | null`.
`normalizeDesignAuthSession`이 `activeWorkspaceId` / `active_workspace_id` /
`workspaceId` / `workspace_id` 폴백을 명시적으로 뽑아 정규화한다 (현재 raw cast만 함).

## I3. 드리프트 탐지·수리 (focus / session refresh)

신규 순수 모듈 `teamver/bffWorkspaceDrift.ts`:

```ts
planBffWorkspaceDriftRepair({ bffActiveWorkspaceId, localWorkspaceId })
// → { action: "noop" | "realignBff" | "seedLocal", … }
```

| BFF | 로컬 | 동작 |
|---|---|---|
| A | B | **P1**: `setActiveTeamverWorkspace(B)` — 로컬이 이기고 BFF 재정렬. 로컬을 BFF에 맞추지 않음 |
| A | null | seed A (`store.set` — BFF POST 불필요) |
| A | A | no-op |
| null | B | no-op (로컬 유지; 다음 부트/명시 sync가 담당) |

적용은 `applyBffWorkspaceDriftRepair` — focus/session refresh 경로에서
`syncTeamverWorkspaceFromSession` **직전**에 1회. durable 승격은 G3
(`mayPromote…`) 유지. 읽기 경로(`resolveActiveTeamverWorkspaceId`)는 쓰기 0회 —
드리프트 수리는 boot / focus refresh / explicit sync 만.

## 테스트

| 파일 | 고정 |
|---|---|
| `deploy/teamver/be/tests/test_auth_session.py` | authenticated session에 `active_workspace_id` 존재 · empty는 null · public-view 폴백에도 키 존재 |
| 신규 `tests/teamver/bff-workspace-drift.test.ts` | BFF A / local B → setActive(B) · BFF A / local null → seed A · 일치 no-op |

## 비범위

- Main BE / Main FE
- 읽기 경로에서의 드리프트 수리
- 라벨↔헤더 드리프트(위험 6) 자체 — 관측만 열어 focus 수리가 수렴을 당긴다

## 변경 이력

| 2026-09-10 | 루프485 슬라이스 J 설계 — G4 durable 복구 5분 TTL (위험 7) |
| 2026-09-10 11:01 | 루프484 슬라이스 I 설계 — session `active_workspace_id` · focus 드리프트 수리 (위험 1) |
| 2026-09-10 | 루프483 슬라이스 H 설계 — P2 latch · loadMore WS 가드 |
| 2026-09-10 | 루프483 슬라이스 H2 검토 후속 — painted=null 소급 · sync revision bump · 부트 실패 drop |
| 2026-09-09 11:55 | 루프482 슬라이스 G 설계 — 읽기 순수화·single-flight·durable 선호 보존·부트 WS 캡처 |
| 2026-09-08 18:40 | 루프481 슬라이스 E·F 설계 — 부트 BFF 재정렬 누락 · 홈 레일 WS 태그 |
| 2026-09-08 | 루프477 구현설계 (슬라이스 A: P1·P3 / 슬라이스 B: P2 알림) |

---

# 슬라이스 J — G4 durable 복구 TTL (남은 위험 7)

G4는 재조정(플레이크)이 활성만 옮긴 직후 **부트에서 durable로 되돌리는** 장치다.
문제는 재조정으로 A에 오래 머문 뒤에도 durable 이 B면 **다음 F5에서 B로 끌려가는** 것(위험 7).
focus preserve는 이미 `setLastForUser(stored)`로 durable을 맞추므로, 갭은 **focus 없이 F5**뿐이다.

## 정책

| 규칙 | 내용 |
|---|---|
| G4 유지 | 부트에서만 durable 선호. 세션 중 durable→active 끌어오기·G4 전면 삭제 금지 |
| TTL 창 | **비요청 reconcile**이 활성을 옮길 때 시각을 스탬프. durable≠active 복구는 **스탬프 후 5분 이내**만 |
| 창 밖 | active가 세션에 있고 appEnabled면 **active 유지** + durable를 active로 heal (`setLastForUser`) — focus preserve와 동일 |
| 스탬프 없음 | 구 플레이크/장기 불일치로 보고 **복구하지 않음**(heal). 신규 reconcile만 스탬프 |
| active 없음 | 기존처럼 durable 사용 (sign-out 후 재진입) |
| 명시 전환 | `setActiveTeamverWorkspace` 성공 시 스탬프 clear |

## 구현

신규 `teamver/durableRestoreWindow.ts` (localStorage, userId 스코프):

- `markUnrequestedWorkspaceMove({ userId, from, to, at? })`
- `shouldRestoreDurableOverActive({ userId, durableId, activeId, now? })` → boolean
- `clearUnrequestedWorkspaceMove(userId?)`
- TTL = `5 * 60_000`

배선:

- `syncTeamverWorkspaceFromSession` — 비요청 이동(`!override && storedRaw !== resolved`) 시 mark
- `readStoredWorkspaceIdOnSession` — durable≠active·enabled일 때 shouldRestore… 가 true일 때만 durable 반환. false면 active 반환 + heal
- `setActiveTeamverWorkspace` — 성공 시 clear

## 테스트

`embed-workspace-durable-restore.test.ts` 확장:

- 스탬프 직후(TTL 안) → durable 복구
- TTL 밖 → active 유지 + `setLastForUser(active)`
- 스탬프 없음 → active 유지(heal)
- active null + durable → 기존대로 durable
- disabled durable → 기존대로 복구 안 함

## 비범위

- 위험 6 라벨↔헤더 (I로 창 축소, 의도된 트레이드오프)
- 위험 8 single-flight
- Main FE

## 변경 이력

| 2026-09-10 | 루프485 슬라이스 J 설계 — G4 durable 복구 5분 TTL (위험 7) |


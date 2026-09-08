# 0908-N01-1 상위설계 — Design 활성 워크스페이스 새로고침·재진입 유실

**날짜:** 2026-09-08 · **루프:** 477
**관련:** `activeTeamverWorkspace.ts` 읽기 경로 선행 수정(주석 §14-20) · Main FE `6087f11c`(0813-N02) / `796a1a98`

## 1. 체감

Teamver Design에서 **새로고침(F5)** 또는 **Main FE에서 재진입**하면 활성 워크스페이스가 사용자가 고른 것과 다른 것으로 바뀐다. 같은 증상이 과거 *읽기* 경로에서 한 번 수정됐고(아래 주석), **부트 경로에 남아 재발**했다.

```text
activeTeamverWorkspace.ts:17-18
  Hard refresh used to re-fetch `/auth/session` (new `fetchedAt`)
  and snap back to the account default, wiping the user's explicit pick.
```

Design은 Main FE(`ns-teamver-fe-v2`)의 라우트가 아니라 **별도 오리진(`design.teamver.com`)의 독립 SPA**다. 활성 워크스페이스가 Main(`teamver_active_workspace_id`)과 Design(`teamver_design_active_workspace_id`)에 **이중 저장**되고, 이를 화해시키는 부트 경로에 결함이 있다.

## 2. 원인 (코드 확인)

### 원인 1 — 런치 `workspace_id`가 부트보다 먼저 URL에서 삭제됨

`app/[[...slug]]/client-app.tsx:13-18`에서 모듈 로드 시점에 `scrubCosmeticLaunchParamsFromBrowserUrl()`가 먼저 돌고, 그 다음 `prefetchEmbedAuthSessionOnBoot()`가 URL을 읽는다. 스크럽은 `theme`/`locale`만 sessionStorage에 보관하고 `workspace_id`·`workspace`는 **버린다**(`teamverEmbedAuthNavigation.ts:5,107-131`).

결과: `teamverEmbedSessionBoot.ts:113`의 `readLaunchWorkspaceIdFromBrowserUrl()`는 warm 경로에서 **항상 null** → 115-126행 override 분기는 사실상 죽은 코드. 반면 세션 만료로 `/auth/callback`을 타면 `useSearchParams()`가 스크럽 이전 값을 잡아 override가 **적용된다**. 같은 "재진입"인데 쿠키 생존 여부에 따라 승자가 달라진다.

### 원인 2 — 부트 reconcile이 `app_enabled=false` 워크스페이스를 탈락시킴

새로고침엔 URL에 힌트가 없어 `syncTeamverWorkspaceFromSession(session)`이 옵션 없이 호출되고(`teamverEmbedSessionBoot.ts:128`), `preserveStoredWorkspace`가 falsy가 된다. 그러면 저장값이 `pickDefaultWorkspaceId`의 후보 풀 검사를 받는데, 풀이 **활성 앱만으로 좁혀져 있다**(`workspaceUtils.ts:91-98`).

즉 활성 WS의 Design이 비활성이면 저장값이 풀에 없어 `session.defaultWorkspaceId` → 계정 기본 → `pool[0]` 순으로 흘러가고, 그 결과가 localStorage에 재기록된다 — **조용히**.

### 원인 3 — 부트 완료 전 초기 refresh가 두 번째 비보존 reconcile을 돌림

`useTeamverEmbed.ts:608-619` 마운트 effect가 부트 미완료 시 `refresh()`를 실행하고, 그 안의 보존 플래그는 부트 완료 여부에 묶여 있다.

```text
useTeamverEmbed.ts:410
  preserveStoredWorkspace: !resetRefreshState && isTeamverEmbedBootComplete(),
```

하드 리프레시 직후엔 `isTeamverEmbedBootComplete()`가 아직 false → **보존이 꺼진 reconcile이 부트와 동시에 두 번** 돌아 원인 2의 조건과 겹친다.

## 3. 정책 (확정)

| # | 정책 | 결정 |
|---|------|------|
| P1 | Main 런치 `?workspace_id=A` vs Design 저장값 B | **stored_wins** — Design 안의 사용자 선택 B가 절대 우선. 런치 힌트는 **저장값이 없을 때(최초 진입)만** 시드 |
| P2 | 활성 WS의 Design이 `app_enabled=false` | **auto_switch + 알림** — 자동 전환은 유지하되 전환 사실을 사용자에게 알린다 |
| P3 | 부트 reconcile 횟수 | 새로고침 1회당 **정확히 한 번** |

P1의 귀결: 런치 힌트는 **one-shot**이어야 한다. sessionStorage는 새로고침에도 살아남으므로, 소비 시 즉시 제거해 두 번째 새로고침에서 재적용되지 않게 한다.

## 4. 성공 조건

- Design에서 B로 전환 → 새로고침 → **B 유지**. Main에서 `?workspace_id=A`로 재진입해도 **B 유지**.
- 저장값이 없는 최초 진입은 런치 힌트 A를 시드로 사용 (warm·cold 경로 동일).
- 활성 WS의 Design이 비활성이면 전환 후 **전환 안내 노출**, 조용한 전환 없음.
- 새로고침 시 `syncTeamverWorkspaceFromSession`의 비보존 reconcile 호출이 1회.
- `X-Workspace-Id`(로컬 store)와 BFF 세션 워크스페이스가 어긋나지 않는다(§13/§14 드리프트 금지).

## 5. 비범위

- Main FE(`ns-teamver-fe-v2`)의 활성 WS 결함 — `useAlignWorkspaceForGroupSession`(796a1a98로 그룹 세션 → 전체 세션 확대), `applyWorkspaceIdFromLocationSearchSync`(멤버십 미검증 localStorage 직접 쓰기), `pickDefaultActiveId`의 `stored` 폐기, `NotificationWorkspaceUrlBootstrap` 전역 effect. **별도 에픽**으로 분리한다.
- BE `_resolve_default_workspace_id`(`app_bootstrap_service.py:127-142`)의 org-claim 우선 정책 변경.
- Drive 403 복구(`driveWorkspaceRecovery.ts`)의 비보존 전환.

## 변경 이력

| 2026-09-08 | 루프477 상위설계 초안 (정책 P1 stored_wins · P2 auto_switch+알림 확정) |

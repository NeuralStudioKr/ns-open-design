# 0908-N01-3 구현현황 — Design 활성 워크스페이스 새로고침 유실 (루프477)

상위: [0908-N01-1](./0908-N01-1-상위설계-[Design_활성WS_새로고침_유실].md) · 설계: [0908-N01-2](./0908-N01-2-구현설계-[Design_활성WS_새로고침_유실].md)

## 진행

| 단계 | 상태 |
|------|------|
| 상위설계 commit (규칙1 선행) | ☑ `d4828b6c23` |
| 구현설계·현황 초안 | ☑ `95ba95b878` |
| 슬라이스 A — P1 stored_wins + P3 단일 reconcile | ☑ `8c2ca83e7e` (push 완료) |
| 슬라이스 A 테스트 | ☑ 11건 통과 |
| 슬라이스 B — P2 자동 전환 알림 | ☑ `9a649a2955` |
| 슬라이스 B 테스트 | ☑ 5건 통과 |
| push · staging bake | ☐ |

## 슬라이스 A 구현 (완료)

| 파일 | 변경 |
|------|------|
| `teamverEmbedAuthNavigation.ts` | `LAUNCH_WORKSPACE_KEY` 신설(prefs 키와 분리) · scrub이 삭제 **직전** 힌트를 stash · `consumeLaunchWorkspaceIdHint()` one-shot |
| `syncTeamverWorkspace.ts` | `readStoredWorkspaceIdOnSession()` export — 목록 존재만 검증, `appEnabled`는 P2 담당 |
| `teamverEmbedSessionBoot.ts` | `readLaunchWorkspaceIdFromBrowserUrl` → `consumeLaunchWorkspaceIdHint` · `if (launchWorkspaceId && !storedOnSession)` |
| `app/auth/callback/page.tsx` | `preferred = storedOnSession ?? launchWs` · `needsRealign`일 때 `setActiveTeamverWorkspace`로 BFF 재정렬 |
| `useTeamverEmbed.ts` | 마운트 effect가 `waitForTeamverEmbedBoot()` 후 스냅샷 반영, 부트 중 `refresh()` 금지 (cleanup `cancelled` 가드) |

`useTeamverEmbed.ts:410`의 `preserveStoredWorkspace` 식은 의도적으로 유지 — 부트/명시적 복구가 reconcile 권한을 갖는 기존 계약이 P2와 정합하고, 고쳐야 할 것은 "부트와 동시에 두 번 도는" 레이스뿐이었다.

### 테스트 결과

신규·확장 11건 통과: `teamver-embed-auth-navigation`(8) · `teamver-sync-workspace`(+4 `readStoredWorkspaceIdOnSession`) · `embed-session-boot`(+3 부트 순서 계약).

**기존 실패 회귀 없음** — 베이스라인을 직접 측정해 대조했다.

| 스위트 | HEAD 베이스라인 | 슬라이스 A 적용 후 |
|--------|-----------------|--------------------|
| `teamver-set-active-workspace` | 4 실패 | 4 실패 |
| `teamver-active-workspace-reconcile` | 3 실패 | 3 실패 |
| `teamver-active-workspace` | 6 실패 | 6 실패 |
| `teamver-use-embed` | 7 실패 | **6 실패** |
| 합계 | 20 | **19** |

`teamver-use-embed` 1건은 부트 레이스 제거로 함께 해소됐다. 나머지 19건은 mock에 빠진 export(`shouldSkipTeamverBffAuthCalls` 등)로 인한 **선행 부채**이며 이 에픽 비범위다.

`tsc -b --noEmit`은 레포 전체에 선행 에러가 다수 있으나 **이번에 만진 5개 파일에는 에러 없음**을 확인했다.

## 진단 근거 (코드 확인 완료)

| 원인 | 위치 | 확인 |
|------|------|------|
| 런치 `workspace_id`가 부트 전에 삭제 | `client-app.tsx:13-18` · `teamverEmbedAuthNavigation.ts:5,107-131` | ☑ scrub이 theme/locale만 stash, workspace는 버림 → `teamverEmbedSessionBoot.ts:113`은 warm 경로에서 항상 null |
| warm/cold 승자 불일치 | `app/auth/callback/page.tsx:33,52` | ☑ 콜백은 `useSearchParams()`로 스크럽 이전 값을 잡아 override 적용 |
| `app_enabled=false` 저장값 탈락 | `workspaceUtils.ts:91-98` · `syncTeamverWorkspace.ts:71-74` | ☑ 풀이 활성 앱으로 좁혀져 저장값이 `preferred` 검사를 통과하지 못함 |
| 부트 완료 전 이중 reconcile | `useTeamverEmbed.ts:410,608-619` | ☑ `isTeamverEmbedBootComplete()`가 false → 보존 꺼진 reconcile이 부트와 동시 실행 |
| 재발 근거(선행 수정) | `activeTeamverWorkspace.ts:14-23` | ☑ 읽기 경로만 고쳐진 상태, 부트 경로 미수정 |

## 결정

- **P1 stored_wins** — Design 안의 사용자 선택이 Main 런치 힌트보다 우선. 힌트는 저장값이 없을 때만 시드, **one-shot**.
- **P2 auto_switch + 알림** — 비활성/회수 시 전환은 유지, 전환 사실을 배너로 통지.
- **P3** 새로고침당 비보존 reconcile 1회.

## 슬라이스 B 구현 (완료)

| 파일 | 변경 |
|------|------|
| `teamverWorkspaceEvents.ts` | `TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT` + dispatch/subscribe. **크로스탭 전파 없음** — 알림은 전환이 일어난 탭 소유 |
| `syncTeamverWorkspace.ts` | `override` 없이 저장값을 옮길 때만 발행. reason은 직전 저장값이 목록에 있으면 `app-disabled`, 없으면 `revoked` |
| `useTeamverEmbed.ts` | `workspaceAutoSwitch` state(세션 파생 state와 분리) + `dismissWorkspaceAutoSwitch`. 명시적 `switchWorkspace` 시 해제. `Omit<…>` 4곳을 `TeamverEmbedSessionState` 별칭으로 정리 |
| `TeamverSessionBanner.tsx` | 사유별 문구 칩 + 닫기 버튼 (인접 칩의 한국어 하드코딩 관례에 맞춤) |
| `teamver.css` | `__auto-switch` / `__auto-switch-dismiss` — 문장이 길어 ellipsize, 계정 그룹을 밀어내지 않게 |

`resolved !== stored`로 가는 경로가 `app-disabled`·`revoked` 두 케이스를 모두 포함하므로 dispatch 지점은 한 곳으로 충분하다.

### 부수 정리

- `tests/teamver-sync-workspace.test.ts`의 `storeGetMock`이 `Promise<null>`로 추론돼 `mockResolvedValue("WS-…")`마다 TS2345가 나던 문제를 반환 타입 명시로 해소 (선행 6건 + 신규 6건 = 12건).
- `tests/teamver-use-embed.test.tsx`의 `teamverWorkspaceEvents` mock에 신규 export 3개 추가.
- `TeamverSessionBanner.test.tsx`의 `'Design 사용 불가'` 기대값이 브랜딩 리네임(`슬라이드`) 이후 갱신되지 않아 실패하던 것을 정정.

## 남은 일

- staging 수동 검증: Design에서 B 선택 → F5 → B 유지 / Main `?workspace_id=A` 재진입 → B 유지 / 최초 진입 → A 시드 / 비활성 WS에서 전환 안내 노출
- Main FE 4건(비범위) 별도 에픽 착수 여부 결정

## 검증

| 항목 | 상태 |
|------|------|
| 저장값 B 있고 런치 A → B 유지 | ☑ 단위 (`readStoredWorkspaceIdOnSession` + 부트 분기 계약) |
| 저장값 없음 + 런치 A → A 시드 | ☑ 단위 |
| 런치 힌트 one-shot (2회 새로고침에서 재적용 없음) | ☑ 단위 |
| 스크럽 후에도 힌트 생존 | ☑ 단위 |
| 부트 중 비보존 reconcile 1회 | ☑ 소스 계약 (`waitForTeamverEmbedBoot` 선행) |
| `appEnabled=false` → 전환 + `app-disabled` 알림 | ☑ 단위 |
| 목록에서 사라짐 → 전환 + `revoked` 알림 | ☑ 단위 |
| 명시적 전환·최초 시드는 알림 없음 | ☑ 단위 |
| 배너 칩 노출 + 닫기 동작 | ☑ 단위 |
| staging bake | ☐ |

### 회귀 대조 (슬라이스 B 이후)

관련 8스위트 **89 통과 / 6 실패**. 실패 6건은 전부 `teamver-use-embed.test.tsx`의 선행 부채(HEAD 베이스라인 7건)이며, 이번 변경으로 1건이 줄었다.
`tsc -b --noEmit`: 레포 전체 451건(슬라이스 A 시점 457건) — 이번에 만진 파일 에러 0.

## 주의 — 동시 세션 충돌

작업 중 다른 세션이 `git stash`로 공유 작업 트리를 두 번 쓸어가 이 에픽의 편집이 유실됐다(한 번은 `teamverWorkspaceEvents.ts`의 상수 선언 블록만 사라져 `ReferenceError`로 드러났다). 백업 후 복원해 복구했으며, 이 현상 자체가 사용자가 신고한 "워크스페이스 상태가 바뀌는" 문제의 개발환경 판본이다.

또한 같은 날 다른 에픽(`스톨_부분덱_salvage_이어쓰기`)이 **동일한 `0908-N01`** 을 사용해 넘버링이 충돌했다(`5f2cbd654b`). 규칙상 다른 주제는 `N02`여야 하므로 재부여가 필요하다.

## 변경 이력

| 2026-09-08 | 루프477 현황 초안 (진단 확정 · 정책 P1/P2/P3 반영) |
| 2026-09-08 | 슬라이스 A 완료 (`8c2ca83e7e`) · 베이스라인 대조 기록 |
| 2026-09-08 | 슬라이스 B 완료 (`9a649a2955`) · 알림 UI·테스트·부수 정리 |

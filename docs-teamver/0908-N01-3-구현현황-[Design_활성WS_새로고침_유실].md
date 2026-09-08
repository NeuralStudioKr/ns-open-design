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

## 슬라이스 C — 검증 강화 (완료)

staging이 아직 수정 이전 빌드를 서비스해(아래 §bake) 브라우저 검증을 할 수 없으므로, 부트 정책을 **소스 문자열 검사에서 실제 동작 검사로** 승격했다.

| 파일 | 변경 |
|------|------|
| `teamverEmbedSessionBoot.ts` | 슬라이스 A에서 들어간 죽은 `activeWorkspaceId` 선언 제거 — 인증 분기 안쪽 선언이 이를 섀도잉해 외부 선언은 write-only였다. 기능 영향은 없으나 내부 선언을 지우면 조용히 동작이 바뀌는 함정이었다 |
| `tests/teamver/embed-session-boot-workspace.test.ts` | **신규.** `runTeamverEmbedSessionBoot`를 실제로 실행해 협력자 호출로 P1을 단정 (6건) |
| `tests/teamver-active-workspace.test.ts` · `…-reconcile.test.ts` | `designBffClient` mock에 `shouldSkipTeamverBffAuthCalls` 추가 — 아래 §부채로 죽어 있던 10건 복구 |

신규 테스트가 단정하는 것: 저장값이 있으면 런치 힌트를 **BFF에 밀지 않음**(서버 세션 드리프트 방지) · 저장값이 없을 때만 `preferredIdOverride`로 시드 · BFF가 전환을 거부하면 override를 붙이지 않음 · 힌트 소비 **정확히 1회** · 스냅샷에 힌트가 아니라 해소된 워크스페이스를 저장.

**뮤테이션 확인:** `if (launchWorkspaceId && !storedOnSession)`을 `if (launchWorkspaceId)`로 되돌리면 첫 테스트가 실패한다 — 소스 문자열 검사와 달리 회귀를 실제로 잡는다.

## 슬라이스 D — 테스트 스위트 부채 정리

관련 192스위트를 Node 24로 돌리면 **41건 실패**했다. 이 에픽과 무관한 선행 부채로, 원인은 두 부류다.

### 부류 1 — 인증 래더 리팩토링이 mock을 두고 감

`8096e5b419`~`607bca0884`가 `refreshDesignAuthCookie` / `probeDesignBffSessionAuthenticated` / `ensureDesignBffSessionAuthenticated` 세 헬퍼를 **`ensureDesignAuthLadder(tag, { mode })` 한 호출로 통합**했는데 테스트 mock은 구 API에 남아 있었다. 각 파일에서 mode별로 기존 spy에 라우팅해 **단정을 1:1로 보존**하며 복구했다.

| 파일 | 조치 | 결과 |
|------|------|------|
| `teamver-use-embed.test.tsx` | 래더 + `pauseDesignBffAuthDuringTransition` 보강 | 22/22 |
| `teamver/teamver-daemon-auth-retry.test.ts` | 래더 3단(mode) 라우팅 | 14/14 |
| `teamver/embed-passive-auth.test.ts` | 래더 3단(mode) 라우팅 | 13/13 |
| `teamver-set-active-workspace.test.ts` | 래더 2단(refresh/ensure)으로 스파이 재작성 | 9/9 |
| `teamver-drive-api.test.ts` | 401 복구를 래더로 재지정 (`mockedRefresh`→`mockedLadder`) | 25/25 |
| `teamver-active-workspace{,-reconcile}.test.ts` | `shouldSkipTeamverBffAuthCalls` 보강 | 10/10 |
| `teamver/bootFetchDedup.test.ts` | `TeamverDaemonUnauthorizedError` 스텁 추가 | 10/10 |

**주목:** 슬라이스 A·B에서 "선행 부채"로 넘겨두었던 `teamver-use-embed.test.tsx` 6건은 실제로 이 mock 누락이 원인이었고, 지금 22/22로 전부 통과한다.

**가려짐 주의:** `teamver-set-active-workspace.test.ts`의 4건은 mock 누락 예외가 `setActiveTeamverWorkspace`의 catch-all(`setActiveTeamverWorkspace.ts:105-108`)에 삼켜져 `ok=false`가 되므로, "mock 미완"이 아니라 평범한 단정 실패처럼 보였다. 프로덕션 코드는 정상이다.

`bootFetchDedup`에서 `importOriginal`로 실모듈을 끌어오면 그래프 전체를 컴파일해 26.5초가 걸린다. 동일 mock 안에서만 `instanceof` 비교가 일어나므로 스텁 클래스로 대체해 8.4초로 줄였다.

### 부류 2 — 소스-문자열 단정의 노후화

소스를 문자열로 읽어 `toContain` 하는 테스트가 기능 진화를 따라가지 못한 경우. **한 테스트 안에서 앞 단정이 실패하면 뒤쪽 노후화가 가려지므로, 보고된 실패 수보다 고칠 곳이 많다** — `teamver-canvas-slide-launch.test.ts`는 2건 보고였으나 실제로 6곳을 고쳐야 했다.

| 노후화 | 조치 |
|------|------|
| `shouldSkipDaemonArtifactStubGuard` → `skipArtifactStubGuard: true` 400자 창 (실제 1418자) | 중간 바인딩 `skipDaemonStubGuard`를 앵커로 쪼갬 |
| `thin-prior-top-up-no-append` → `top-up-did-not-append-slides` 400자 창 (실제 423자) | if/else 형제 분기이므로 거리 대신 **순서**만 검사 |
| `!isCloneContentFillTurn` | `isCloneHostFillTurn`(= content ∥ prompt fill, loop391/402)로 갱신 |
| `templateCloneContentFill: autoContinueOriginIsFill` | `templateCloneAutoContinueFlags(...).jsonFill`로 갱신 |
| fill 턴의 `<head>`/800자 가드레일 문구 | fill이 HTML→**JSON 아웃라인 슬롯필**로 바뀌어 현재 forbidden-output 문구로 재고정 |
| fill의 motif/deco sprite 예산 문구 | HTML 생성 턴 프롬프트로 이전 — `deck-framework-compact.test.ts`가 커버하므로 위치만 주석으로 남기고 제거 |

고정 문자 거리 정규식은 무관한 커밋이 사이에 코드를 끼워 넣으면 깨진다(이번엔 옆 에픽 `97593bb46f`의 `ProjectView.tsx` 편집). 숫자를 키우는 대신 가까운 앵커나 순서 검사로 바꿨다.

나머지 5파일은 전부 **의도된 소스 변경**을 테스트가 따라가지 못한 경우로, 커밋 SHA로 확인했다.

| 파일 | 노후화 → 현재 사실 | 근거 |
|------|------|------|
| `teamver-canvas-launch-handoff` | `updatedAt`의 `\|\| revision` 폴백 제거 (rev id는 날짜가 아님) | `3bec4255ee` |
| `teamver-canvas-slide-launch-modal` | quick settings에 `customSlideCount: null` 추가 | `11756c415e` |
| `teamver-report-usage` | 상시 마커에서 workspaceId/runId/modelName/토큰수 제거(서버 metric 소관) | `e9e1b78060` |
| `teamver-embed-slide-only` | `Teamver selected deck template guard` → `# Selected deck template guard` (브랜딩 접두 제거) | `0684989010` |
| `teamver/persistDeckDisplayTitle` | 제네릭 `슬라이드`가 제목을 고정하지 않고 브리프 주제(`expo`)를 추출 | `b29cd711d4` |

단정을 지우고 통과시키지 않도록, 제거된 필드는 다른 테스트(`console-leak-sanitization.test.ts`)가 커버함을 확인한 뒤 주석으로 위치를 남기고 마커의 실제 payload(`error`·`ts`)에 대한 단정을 새로 넣었다. `updatedAt` 건도 "rev를 timestamp 자리에 넣지 않는다"는 새 사실을 지키는 테스트를 추가했다.

### 결과

**192파일 1275테스트 전부 통과 (실패 0).** 착수 시점 41건 실패에서 전부 해소됐다.

## 남은 일

- **staging 배포 후** 수동 검증: Design에서 B 선택 → F5 → B 유지 / Main `?workspace_id=A` 재진입 → B 유지 / 최초 진입 → A 시드 / 비활성 WS에서 전환 안내 노출 — 배포는 사용자가 직접 진행
- Main FE 4건은 별도 에픽으로 착수 (0908-N03)
- `.cursor/rules`에 Node 24 요구·소스-문자열 단정의 취약성 반영 검토

## 검증

| 항목 | 상태 |
|------|------|
| 저장값 B 있고 런치 A → B 유지 | ☑ 단위 (`readStoredWorkspaceIdOnSession` + 부트 분기 계약) |
| 저장값 없음 + 런치 A → A 시드 | ☑ 단위 |
| 런치 힌트 one-shot (2회 새로고침에서 재적용 없음) | ☑ 단위 |
| 스크럽 후에도 힌트 생존 | ☑ 단위 |
| 부트 중 비보존 reconcile 1회 | ☑ 소스 계약 (`waitForTeamverEmbedBoot` 선행) + 부트 1회 실행당 sync 1회 단정 |
| 저장값 있을 때 런치 힌트를 BFF에 밀지 않음 | ☑ 동작 (신규 부트 테스트) |
| BFF가 전환 거부 시 override 미적용 | ☑ 동작 (신규 부트 테스트) |
| 하드 리프레시에서 명시적 선택 유지 (읽기 경로) | ☑ 동작 (`teamver-active-workspace-reconcile` 복구) |
| `appEnabled=false` → 전환 + `app-disabled` 알림 | ☑ 단위 |
| 목록에서 사라짐 → 전환 + `revoked` 알림 | ☑ 단위 |
| 명시적 전환·최초 시드는 알림 없음 | ☑ 단위 |
| 배너 칩 노출 + 닫기 동작 | ☑ 단위 |
| staging bake | ☐ **배포 대기** — 아래 참조 |

### staging bake 상태 (미배포)

`https://stg-design.teamver.com`이 서비스하는 번들에서 이번 변경의 지문이 **둘 다 없다**: 슬라이스 A의 `teamver:embed-launch-workspace`(JS 청크 9개 전수), 슬라이스 B의 `auto-switch`(CSS 청크 2개). 대조로 기존 `teamver:embed-launch-prefs`·`teamver-embed-bar`는 존재하므로 번들 자체는 정상 수집됐다.

`ns-open-design`은 ns_cicd 미등록이고 staging 자동 배포 워크플로도 없어, Staging EC2에서 `deploy/teamver/deploy.sh --staging`을 직접 돌려야 반영된다. push만으로는 bake되지 않는다.

### 로컬 실행 환경 주의

레포는 `"node": "~24"`를 요구하는데 Node 22.11에서는 jsdom 스위트가 **전부** 기동 실패한다(`html-encoding-sniffer@6` → `@exodus/bytes` ESM을 `require`). 무플래그 `require(ESM)`은 22.12부터라 22.11이 경계 바로 아래다. 테스트 전 Node 24 확인이 필요하다.

### 회귀 대조

| 시점 | 결과 |
|------|------|
| 슬라이스 B | 관련 8스위트 89 통과 / 6 실패 — 6건을 `use-embed`의 선행 부채로 판단 |
| 슬라이스 D | **192파일 1275테스트 전부 통과 / 실패 0** |

슬라이스 B에서 "어쩔 수 없는 코드베이스 부채"로 넘긴 6건은 오판이었다. 원인은 인증 래더 mock 누락이었고 지금은 통과한다.
`tsc -b --noEmit`: 레포 전체 451건(슬라이스 A 시점 457건) — 이번에 만진 파일 에러 0.

## 주의 — 동시 세션 충돌

작업 중 다른 세션이 `git stash`로 공유 작업 트리를 두 번 쓸어가 이 에픽의 편집이 유실됐다(한 번은 `teamverWorkspaceEvents.ts`의 상수 선언 블록만 사라져 `ReferenceError`로 드러났다). 백업 후 복원해 복구했으며, 이 현상 자체가 사용자가 신고한 "워크스페이스 상태가 바뀌는" 문제의 개발환경 판본이다.

또한 같은 날 다른 에픽(`스톨_부분덱_salvage_이어쓰기`)이 **동일한 `0908-N01`** 을 사용해 넘버링이 충돌했다(`5f2cbd654b`). 해당 세션이 `97593bb46f`에서 스스로 `N02`로 재부여해 해소됐다.

## 변경 이력

| 2026-09-08 | 루프477 현황 초안 (진단 확정 · 정책 P1/P2/P3 반영) |
| 2026-09-08 | 슬라이스 A 완료 (`8c2ca83e7e`) · 베이스라인 대조 기록 |
| 2026-09-08 | 슬라이스 B 완료 (`9a649a2955`) · 알림 UI·테스트·부수 정리 |
| 2026-09-08 | 슬라이스 C — 부트 동작 테스트 승격 · 죽은 섀도 변수 제거 · 읽기경로 가드 10건 복구 · staging 미배포 확인 |
| 2026-09-08 | 슬라이스 D — 인증 래더 mock 부채 7파일 복구(use-embed 6건 포함) · 소스-문자열 단정 노후화 정정 |

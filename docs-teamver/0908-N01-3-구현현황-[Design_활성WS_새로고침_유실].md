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

---

# 슬라이스 E·F — 배포 후 재발 (루프481)

## 배포 커밋 범위 확정 (이전 판정 정정)

슬라이스 C의 "staging 미배포" 판정은 **틀렸다**. 그 시점에는 사실이었으나 이후 배포가 일어났고,
사용자 신고는 배포된 빌드에서 나온 것이다. 재측정 방법과 결과:

```bash
curl -s https://stg-design.teamver.com/ -o /tmp/p.html
# index.html 은 eager 청크만 참조한다 — 그 청크들에서 다시 청크 URL 을 긁어야 전수가 된다
grep -ohE 'static/chunks/[A-Za-z0-9_~.-]+\.js' /tmp/p.html *.js | sort -u   # 21개
```

| 마커 | 도입 커밋 (KST) | 배포 번들 |
|---|---|---|
| `teamver:embed-launch-workspace` | `8c2ca83e7e` 13:49 (슬라이스 A) | ☑ |
| `teamver-design-workspace-auto-switched` | `9a649a2955` 13:59 (슬라이스 B) | ☑ |
| `heading_count_shortfall` · `sparse_content_top_up` | `62cc1fce6a` **17:22** (레포 최신 커밋) | ☑ |

번들 `last-modified: 2026-09-08 08:58:52 GMT` = **17:58 KST** — 최신 커밋(17:22)보다 뒤다.
**배포본은 레포 HEAD, 즉 0908-N01 슬라이스 A~D 전부를 포함한다.**

첫 조사에서 `sparse_content_top_up`이 안 잡혀 판정이 흔들렸는데, 원인은 코드가 아니라 방법이었다:
App은 `dynamic(() => import('../../src/App'))`이라 **lazy 청크가 index.html에 안 실린다**.
eager 청크 14개만 받아 검색하면 미배포로 오판한다. 청크에서 청크를 재귀로 긁어 21개를 받으면 잡힌다.

**결론: "미배포 때문" 가설 폐기.** 배포된 P1/P2가 브라우저에서 듣지 않는 이유를 찾는 것이 이 슬라이스다.

## 무대 확정 — Design 단독

| 근거 | 내용 |
|---|---|
| 사용자 확인 호스트 | `stg-design.teamver.com` |
| "최근 프로젝트 목록" | Design 전용 — `recentProjects.title` (`RecentProjectsStrip.tsx`). fe-v2 `web/src`·`web/messages`에 해당 문자열·개념 **0건** |
| "프로젝트 상세 / 루트" | Design 클라이언트 라우터 `/projects/:id` ↔ `/` (`src/router.ts`) |

Main FE는 무대가 아니다. 다만 Design이 받는 `?workspace_id=` 힌트 경로는 그대로 관련이 있다.

## 뒤로가기 경로 판정 — 부트가 아니라 **부트 부재**가 문제

Design은 `app/[[...slug]]/page.tsx` 단일 catch-all + 자체 라우터(`pushState` + `popstate`) SPA다.

- `scrubCosmeticLaunchParamsFromBrowserUrl()`는 `client-app.tsx` **모듈 평가 시 1회**만 돈다.
- `runTeamverEmbedSessionBoot`도 `teamverEmbedBoot.bootDone` 모듈 플래그로 **문서당 1회**다.
- `navigate()`의 `buildPath()`는 쿼리를 만들지 않으므로 히스토리에 `?workspace_id=`가 남지 않는다.

→ **뒤로가기가 런치 힌트를 되살리지는 않는다.** 조사 지침의 "히스토리에 남은 낡은 쿼리" 가설은 배제됐다.

뒤로가기가 실제로 하는 일은 **활성 WS 재해결을 대량으로 트리거**하는 것이다.
`route.kind`가 `project → home`으로 바뀌면 `App.tsx:4305` effect가 `loadRecentProjectsForHome()`을 돌리고,
그 한 번의 호출이 `resolveActiveTeamverWorkspaceId()`를 여러 번 부른다
(inflight 키 산출 → 레지스트리 목록 → 툼스톤 필터 → 데몬 enrich 헤더). `HomeView` 마운트도 한 번 더 부른다.
이 함수는 **읽기 함수인데 저장값을 덮어쓰는 부수효과**를 갖는다(`syncTeamverWorkspaceFromSession`, 비보존).
그래서 뒤로가기는 "새로고침과 같은 판정을 훨씬 자주, 동시에" 돌리는 증폭기다.

## 근본 원인

| # | 결함 | 위치 | 증상 |
|---|---|---|---|
| E | 부트가 저장값을 **BFF에 알리지 않는다** | `teamverEmbedSessionBoot.ts:122-136` | 라벨/헤더 = 저장값, BFF 세션 = 이전 값 → 다음 reconcile이 저장값을 서버 값으로 되돌림 (증상 1) |
| F1 | 홈 레일 실패 시 **다른 WS의 행을 잔존** | `App.tsx:4322-4327` · `1600-1612` | WS는 바뀌었는데 목록은 그대로 (증상 2) |
| F2 | 성공 시에도 **합집합 병합** | `embedProjectListRefresh.ts:56-79` | 두 WS 프로젝트가 홈에 동시 노출 |

E의 근거는 `8c2ca83e7e` 커밋 메시지가 약속한 "stored 유지 시 BFF 재정렬"이
`app/auth/callback/page.tsx`에만 들어갔고 `runTeamverEmbedSessionBoot`에는 빠진 것이다.
경로별 표는 구현설계 §E1.

## 유닛 테스트가 통과한 이유 (간극의 정체)

`tests/teamver/embed-session-boot-workspace.test.ts:126`이

```ts
expect(h.setActiveTeamverWorkspace).not.toHaveBeenCalled();
```

를 단정한다. 의도는 "런치 힌트를 서버에 밀지 말라"였지만, 실제로 고정한 것은
**서버에 아무 말도 하지 않는 상태**다. 협력자 mock만 관찰하므로 "서버가 지금 어느 WS인지"가
테스트 세계에 존재하지 않고, 따라서 드리프트가 결함으로 보이지 않았다.
슬라이스 E에서 이 단정을 **뒤집어** 재현 테스트로 만들었다.

## 교차 노출 판정

- WS별 캐시(`registryListCache`·`driveHomeRecentCache`·`listRecentProjectsInflight`)는 **모두 workspaceId 키**를 갖는다 → 서버 데이터 교차 fetch 없음.
- 반면 `App.tsx`의 `projects` state는 WS 태그가 없어 **화면에는 섞일 수 있다**.
  상세 진입은 `assertTeamverProjectAccessIfNeeded`가 막지만 제목·시각·표지는 이미 렌더된다.
  → 등급: 데이터 유출 아님 / **UI 교차 노출 있음**. 슬라이스 F가 대상.

## 진행

| 단계 | commit | 상태 |
|---|---|---|
| 슬라이스 E·F 구현설계 append | `42e38f29bf` | ☑ |
| E — 부트 BFF 재정렬 + `skipEventWhenUnchanged` | `837d61f203` | ☑ |
| F — 홈 레일 WS 태그 (실패 시 비움 / 성공 시 교체) | `6bde193b53` | ☑ |
| 소스-문자열 단정 정정 | `f7c56a1077` | ☑ |

## 검증

### 재현성 — 수정 없이는 실패한다

`teamverEmbedSessionBoot.ts`만 되돌리고 부트 테스트를 돌리면 **4건 실패**:

```text
× keeps the pick made inside Design when Main also sends a launch hint
× realigns the BFF on a plain refresh, not only through /auth/callback
× falls back to server truth when the BFF refuses the stored workspace
× seeds from the launch hint only when Design has no stored pick yet
  Tests  4 failed | 4 passed (8)
```

수정 적용 후 8/8 통과. 즉 새 테스트는 **배포된 코드에서 실패하고 수정본에서 통과**한다.

### 스코프 회귀 — `tests/teamver*` 192 파일

| 항목 | 결과 |
|---|---|
| 워크스페이스 핵심 12파일 | 78/78 통과 |
| `tests/teamver/` + `tests/teamver-*` 전체 | **192 파일 / 1279 테스트 — 1건 실패 → 정정 후 0건** |
| 유일한 실패 | `embed-session-boot.test.ts:80` — 부트 분기 **소스 문자열**을 그대로 매칭하던 단정. 슬라이스 D에서 이미 "노후화" 부채로 지목된 종류. `f7c56a1077`에서 정책 단정으로 교체 |
| `tsc --noEmit` | 신규·수정 파일 오류 0 (`_archive/`·`AssistantMessage`·`ChatComposer`·`RecentProjectsStrip` 기존 오류는 무관) |

전체 스위트(695파일)는 이 머신에서 forks worker timeout이 대량 발생해(37 errors / 11.7시간)
기준선으로 쓸 수 없다. 워크스페이스·프로젝트목록 표면을 덮는 192파일 스코프로 대조했다.

## 남은 위험 (E·F 직후 — 역사 기록)

> **최신 표는 아래 §슬라이스 G 「남은 위험」(+ H에서 갱신).** 여기 2·3·4는 G·H에서 해소됨.

| # | 내용 (당시) | 이후 |
|---|---|---|
| 1 | BFF 세션 WS 관측 불가 | **여전히 열림** — BE |
| 2 | 읽기 함수 비보존 reconcile | **G에서 해소** |
| 3 | 부트 request `workspaceId: null` | **G5에서 해소** |
| 4 | P2 알림 부트 dispatch 유실 | **H1에서 해소** |
| 5 | 수동 배포 | **여전히 열림** |

---

# 슬라이스 G — 읽기 순수화 · single-flight · durable 선호 보존 (루프482)

설계: 구현설계 §슬라이스 G. 대상은 슬라이스 E·F 가 남긴 **남은 위험 2·3**.

## 진행

| 단계 | commit | 상태 |
|---|---|---|
| 슬라이스 G 구현설계·현황 append | `6b36ba54ad` | ☑ |
| G1·G2·G3 — 읽기 순수화 + single-flight + durable 보존 | `8e0784c791` | ☑ |
| G4 — 부트 durable 복구 | `8e0784c791` | ☑ |
| G5 — 부트 프로젝트 목록 요청 WS 캡처 (위험 3) | `8e0784c791` | ☑ |
| 노후 소스-문자열 단정 정정 | `8e0784c791` | ☑ |

## 구현 (완료)

| 파일 | 변경 |
|---|---|
| `activeTeamverWorkspace.ts` | `readActiveWorkspaceIdOnce`(판정) / `resolveActiveTeamverWorkspaceId`(single-flight)로 분리. **쓰기 0회** — `syncTeamverWorkspaceFromSession` import 자체를 제거해 이 모듈에서 다시 쓰기 경로가 생기지 않게 했다 |
| 신규 `activeWorkspaceReadPolicy.ts` | 순수 판정. 빈 목록 → 저장값 유지(근거 부재) · 저장값 유효 → 저장값 · 그 외 → `pickDefaultWorkspaceId(preferredId: durable)` ?? 저장값 |
| 신규 `workspaceDurablePreference.ts` | `mayPromoteWorkspaceToDurablePreference` — **요청되지 않은 이동**만 `false`. 시드·재확인·override 는 승격 |
| `syncTeamverWorkspace.ts` | 꼬리의 무조건 `setLastForUser`를 위 판정으로 게이팅(G3) · `readStoredWorkspaceIdOnSession`이 durable 선호를 복구(G4, `appEnabled` 조건) |
| 신규 `activeWorkspaceIdSnapshot.ts` | `TEAMVER_ACTIVE_WORKSPACE_STORAGE_KEY` + 동기 스냅샷. `designBffClient`의 `activeKey`가 이 상수를 쓰므로 읽는 키와 쓰는 키가 갈라질 수 없다 |
| `embedProjectListWorkspaceTag.ts` | `resolveProjectListWorkspaceId`(ref 우선, 없으면 스냅샷) · `isProjectListWorkspaceStale` 추가 |
| `App.tsx` | `readEmbedActiveWorkspaceId()` 도입 후 `beginProjectListRequest` · `isStaleProjectListWorkspace` · `markProjectsPaintedByActiveWorkspace` · `isPaintedProjectListFromOtherWorkspace` 네 곳이 이를 사용 |

### single-flight 정리 규칙

`finally`가 `flightSeq === seq`일 때만 슬롯을 비운다. 명시적 전환이 revision 을 bump 해 새 flight 가 슬롯을
차지한 뒤, **먼저 시작한 낡은 flight 가 늦게 끝나면서 새 flight 를 몰아내는** 것을 막는다.

## 검증

| 항목 | 상태 |
|---|---|
| N=8 동시 호출이 세션 1회·`store.get` 1회로 합류 | ☑ 동작 (`active-workspace-read-single-flight`) |
| 목록이 저장값을 빠뜨린 응답에서 `set`·`setLastForUser` 0회 | ☑ 동작 |
| 흔들린 응답 직후 목록 회복 → 별도 복구 없이 durable 선택으로 복귀 | ☑ 동작 |
| 빈 목록을 회수로 오판하지 않음 | ☑ 동작 |
| 요청은 항상 세션이 인정하는 WS 를 받는다 (교착 없음) | ☑ 동작 (`ws-current`·`WS-default` 반환 단정 유지) |
| 명시 전환 후 호출이 전환 이전 flight 에 합류하지 않음 | ☑ 동작 (revision 키) |
| 재조정이 durable 선호를 승격하지 않음 / 시드·override 는 승격 | ☑ 단위 (`teamver-sync-workspace` 4건) |
| 부트가 durable 선택을 복구, 단 `appEnabled=false`면 복구하지 않음 | ☑ 동작 (`embed-workspace-durable-restore` 6건) |
| 부트 요청(ref=null)이 스냅샷으로 실제 WS 를 캡처 → WS 변경으로 무효화됨 | ☑ 동작 (`embed-project-list-workspace-capture`) |
| `\0boot-flush:` 센티넬이 스냅샷에 가려지지 않음 | ☑ 동작 |

### 회귀 대조

기준선은 **슬라이스 G 코드 착수 직전**(설계 commit `6b36ba54ad` 시점)에 직접 측정했다.

| 시점 | 결과 |
|---|---|
| 기준선 (`tests/teamver/` + `tests/teamver-*`) | 192 파일 / 1279 테스트 — **실패 0** |
| 슬라이스 G 적용 후 | **196 파일 / 1312 테스트 — 실패 0** (+4 파일 / +33 테스트) |
| 인접 스위트 (`orphan-jwt-auto-cleanup` · `TeamverSessionBanner` · `state/projects` · `byok-proxy-active` · `console-leak-sanitization`) | 5 파일 / 74 통과 |
| `tsc -b --noEmit` | 레포 전체 **450건**(기준선과 동일) — 이번에 만진 파일에 **신규 오류 0** |

`App.tsx(3243)`·`designBffClient.ts(961)`은 선행 오류다. 각각 HEAD 의 `App.tsx(3226)`·
`designBffClient.ts:358`에 같은 코드가 있고, 슬라이스 G 편집 지점(App 762~835 / designBffClient 127)과 무관하다.

전체 스위트(695파일)는 슬라이스 E·F 때와 같은 이유로 이 머신에서 기준선이 되지 못한다(forks worker timeout).

### 노후 소스-문자열 단정 1건 정정

`tests/teamver-workspace-switch.test.ts`의 "ignores stale project-list responses"가
`request.workspaceId !== embedActiveWorkspaceIdRef.current`라는 **표현식**을 매칭하고 있었다.
G5가 그 판정을 `embedProjectListWorkspaceTag`로 옮기면서 깨졌다 — 슬라이스 D §부류 2와 같은 종류다.
표현식 대신 **위임**(`readEmbedActiveWorkspaceId` · `resolveProjectListWorkspaceId` ·
`isProjectListWorkspaceStale`)을 고정하고, 실제 판정은 신규 순수 모듈 테스트가 덮게 했다.

### 재현성 확인 (뮤테이션 3종 실측)

파일 전체 revert 는 `resetActiveTeamverWorkspaceFlightForTests` export 가 사라져 스위트가 통째로
기동 실패하므로, 결함별로 **한 줄씩** 되돌려 어떤 단정이 잡는지 확인했다.

| 되돌린 것 | 실패하는 테스트 |
|---|---|
| G2 — flight 합류 분기(`if (inflight && …) return inflight`) 제거 | `joins a burst of concurrent calls into one judgement` (세션 8회 호출) |
| G1 — 읽기 결과를 다시 `store.set` + `setLastForUser` 로 저장 | `keeps the durable pick when one response in a burst omits it` · `prefers the durable pick over the account default as a fallback` |
| G3 — 꼬리의 `setLastForUser` 게이팅 제거(무조건 승격) | `does not promote an unrequested move to the durable pick` |

즉 신규 단정은 배포된 코드의 동작에서 실패하고 수정본에서 통과한다 —
소스 문자열이 아니라 결함 자체를 잡는다. 확인 후 백업에서 원상복구했다(`git status` clean).

## 사용자 증상 ↔ 방어 슬라이스 대응표

| 사용자 증상 | 직접 원인 | 막는 슬라이스 |
|---|---|---|
| 프로젝트 상세 → **뒤로가기**로 루트 복귀 시 활성 WS 가 바뀐다 | 읽기 함수의 비보존 reconcile 이 4~10회 동시 실행 | **G1**(읽기 쓰기 0회) + **G2**(버스트당 판정 1회) |
| **새로고침**에서 활성 WS 가 바뀐다 | 부트가 저장값을 BFF 에 알리지 않아 다음 reconcile 이 서버 값으로 되돌림 | **E**(부트 BFF 재정렬) |
| 한 번 바뀐 뒤 **계속 그 상태로 유지**된다 (되돌아오지 않는다) | 재조정이 `setLastForUser`까지 덮어써 돌아갈 좌표 소실 | **G3**(durable 승격 차단) + **G4**(부트 복구) |
| WS 가 바뀌었는데 **최근 프로젝트 목록은 그대로** | 실패 시 잔존 · 성공 시 합집합 병합 (WS 태그 없음) · 딥링크 untagged | **F** + **H2** + **H3** |
| 부트에서 시작한 목록 apply 가 WS 변경에도 적용된다 | `beginProjectListRequest`가 `null` 캡처 → stale 판정 항상 false | **G5**(동기 스냅샷 캡처) |
| Main 재진입(`?workspace_id=`)이 Design 선택을 덮는다 | 힌트가 저장값보다 우선 · 힌트 재적용 | **A**(P1 stored_wins · one-shot) |
| 비활성/회수 WS 로 인한 전환이 조용히 일어난다 | 알림 없음 · 또는 부트 dispatch가 구독 전 유실 | **B**(P2 배너) + **H1**(latch) |

## 남은 위험

| # | 내용 | 대응 |
|---|---|---|
| 1 | ~~클라이언트가 BFF 세션의 현재 WS를 관측할 수 없다~~ | **해소 — 슬라이스 I** (`active_workspace_id` + focus 드리프트 수리) |
| 2 | ~~`resolveActiveTeamverWorkspaceId`가 읽기 함수인데 비보존 reconcile 로 저장값을 덮어쓴다~~ | **해소 — 슬라이스 G1·G2·G3.** 읽기 경로 쓰기 0회 · 버스트당 판정 1회 · 재조정이 durable 선호를 승격하지 않음 |
| 3 | ~~`beginProjectListRequest()`가 부트 시점에 `workspaceId: null`을 캡처해 `isStaleProjectListWorkspace`가 항상 false~~ | **해소 — 슬라이스 G5.** 동기 스냅샷으로 부트 요청도 실제 WS 캡처 |
| 4 | ~~자동 전환 알림(P2)이 **부트 중 dispatch**되므로 구독 설치 시점에 따라 유실 가능~~ | **해소 — 슬라이스 H1.** last-event latch(TTL 60s) + dismiss/명시 전환 시 clear |
| 5 | `ns-open-design`은 ns_cicd 미등록 — 이번 수정도 **수동 배포**가 필요하다 (`deploy/teamver/deploy.sh --staging`) | 사용자 조치 |
| 6 | 읽기가 저장하지 않으므로 저장값이 무효인 채 남는 구간이 생긴다. 그 구간에 **라벨(저장값 기반)과 요청 헤더(계산값)가 어긋날 수 있다.** 지속 시간은 "다음 부트 / 포커스 refresh 까지"로 유한하다 | 의도된 트레이드오프. 슬라이스 I가 focus에서 수렴을 당긴다 |
| 7 | G4 durable 복구는 **부트 한정**이므로, 사용자가 A 에서 오래 작업한 뒤 원래 pick B 가 재활성되면 다음 부트에서 B 로 끌려갈 수 있다 | 완화 있음 — A 를 명시적으로 고르면 durable 도 A. 신고 시 "복구 1회만" |
| 8 | single-flight 가 모듈 스코프이므로 세션 probe 가 걸리면 버스트 전체가 함께 대기한다 | 실질 차이 작음 |
| 9 | ~~`loadMoreProjects`가 WS stale/painted 검사를 건너뜀~~ | **해소 — H2** |
| 10 | ~~painted=null 이면 wipe/교체 영구 스킵 (딥링크 prefetch)~~ | **해소 — H3** (`hasPaintedRows` + prefetch/hydrate mark) |
| 11 | ~~sync `store.set`이 revision을 bump하지 않아 flight가 옛 WS를 반환~~ | **해소 — H4** |

---

# 슬라이스 I — BFF WS 관측 + focus 드리프트 수리 (루프484)

설계: 구현설계 §슬라이스 I. 대상은 **남은 위험 1**.

## 진행

| 단계 | commit | 상태 |
|---|---|---|
| 슬라이스 I 구현설계·현황 append | `7dad7f5bc0` | ☑ |
| BE — `active_workspace_id` on `/auth/session` | `14754565f1` | ☑ |
| FE — 정규화 + `bffWorkspaceDrift` + focus 배선 | `14754565f1` | ☑ |
| 테스트 · push staging | `14754565f1` | ☑ |

## 구현 (완료)

| 파일 | 변경 |
|---|---|
| `deploy/teamver/be/app/routers/auth.py` | `_empty_session` · `_session_from_bootstrap_payload` · public-view 폴백에 `active_workspace_id` (쿠키 WS trim, empty→null) |
| `deploy/teamver/be/tests/test_auth_session.py` | authenticated 필드 단정 · empty null · public-view 폴백 · SSO mock으로 선행 SessionMiddleware 실패 해소 |
| `designBffClient.ts` | `DesignAuthSession.activeWorkspaceId` · `normalizeDesignAuthSession`이 snake/camel/`workspace_id` 폴백 정규화 |
| 신규 `bffWorkspaceDrift.ts` | `planBffWorkspaceDriftRepair` (순수) · `applyBffWorkspaceDriftRepair` (P1 realign / seed) |
| `useTeamverEmbed.ts` | focus/session refresh에서 sync **직전** drift 수리 |

### 검증

| 항목 | 결과 |
|---|---|
| BE `tests/test_auth_session.py` | **11 passed** |
| FE `bff-workspace-drift` + `teamver-use-embed` | **29 passed** (7+22) |

## 남은 위험 (갱신)

| # | 내용 | 대응 |
|---|---|---|
| 1 | ~~클라이언트가 BFF 세션의 현재 WS를 관측할 수 없다~~ | **해소 — 슬라이스 I** |
| 5 | `ns-open-design`은 ns_cicd 미등록 — **수동 배포** 필요 | 사용자 조치 (`deploy/teamver/deploy.sh --staging`) |
| 6 | 라벨↔헤더 일시 드리프트 | focus refresh가 이제 BFF도 수렴시킴. 유한 |

---

# 슬라이스 H 검토 후속 (H3~H5, 루프483)

[Design E·F·G 코드 검토](c341f54f-f23f-4b29-9d9d-03da497a4dd1) 반영.

| 항목 | 상태 |
|---|---|
| H1 P2 latch | ☑ `aa13a55ff2` |
| H2 loadMore WS 가드 | ☑ `aa13a55ff2` |
| H3 painted=null 소급 · prefetch/hydrate mark | ☑ |
| H4 sync revision bump | ☑ |
| H5 부트 recent 실패 drop | ☑ |
| H6 `decideProjectListPaintAction` + retention 결정표 테스트 | ☑ |

## 배포 전 수동 검증 체크리스트 (stg-design)

`deploy/teamver/deploy.sh --staging` 후 번들 마커로 확인:
`activeWorkspaceReadPolicy` · `isProjectListWorkspaceMismatch` · `skipEventWhenUnchanged`(또는 동등) · latch 관련 문자열이 배포 청크에 있는지.

1. Design에서 B 선택 → F5 → 스위처·목록 **B** 유지
2. Main `?workspace_id=A` 재진입 → **B** 유지
3. B Design 비활성 → A 전환 + 배너 · F5 후 A↔B 왕복 없음
4. 프로젝트 상세 → 뒤로가기 홈 → 활성 WS 임의 변경 없음 (여러 번)
5. A 목록 로드 후 B 전환 → 홈/projects에 A 카드 잔존·합집합 없음 (전환 직후 실패 포함)
6. B 프로젝트 딥링크 진입 → WS 전환 후 홈 → 이전 WS 카드 없음 · P2 배너(해당 시)
7. `/projects` load-more 중 WS 전환 → 페이지 혼합 없음
8. 헤더 `X-Workspace-Id`와 라벨이 잠깐 어긋나도 다음 포커스/F5에서 수렴

## 변경 이력

| 2026-09-10 | 루프485 슬라이스 J 착수 — 위험 7 TTL 설계 선행 |
| 2026-09-10 11:10 | 루프484 슬라이스 I 완료 — session `active_workspace_id` · focus 드리프트 수리 · 위험 1 해소 |
| 2026-09-10 11:01 | 루프484 슬라이스 I 착수 — 위험 1 대상, 설계 선행 |
| 2026-09-10 | 루프483 H6 — F 결정표 순수화 · retention 테스트 (검토 gap) |
| 2026-09-10 | 루프483 H3~H5 — painted 소급 · sync revision · 부트 drop (검토 후속) |
| 2026-09-10 | 루프483 슬라이스 H — P2 latch · loadMore WS 가드 · 위험 4·9 해소 |
| 2026-09-09 13:35 | 루프482 슬라이스 G 재현성 — 결함별 뮤테이션 3종 실측으로 대체(파일 전체 revert 는 스위트 기동 실패) |
| 2026-09-09 13:20 | 루프482 슬라이스 G 완료 — 읽기 순수화·single-flight·durable 보존·부트 복구·WS 캡처 · 196파일 1312테스트 통과 · 위험 2·3 해소, 신규 위험 3건 |
| 2026-09-09 11:55 | 루프482 슬라이스 G 착수 — 위험 2·3 대상, 설계 선행 |
| 2026-09-08 18:45 | 루프481 슬라이스 E·F — 배포 범위 확정(HEAD 배포됨) · 부트 BFF 재정렬 누락 · 홈 레일 WS 태그 |
| 2026-09-08 | 루프477 현황 초안 (진단 확정 · 정책 P1/P2/P3 반영) |
| 2026-09-08 | 슬라이스 A 완료 (`8c2ca83e7e`) · 베이스라인 대조 기록 |
| 2026-09-08 | 슬라이스 B 완료 (`9a649a2955`) · 알림 UI·테스트·부수 정리 |
| 2026-09-08 | 슬라이스 C — 부트 동작 테스트 승격 · 죽은 섀도 변수 제거 · 읽기경로 가드 10건 복구 · staging 미배포 확인 |
| 2026-09-08 | 슬라이스 D — 인증 래더 mock 부채 7파일 복구(use-embed 6건 포함) · 소스-문자열 단정 노후화 정정 |

---

# 슬라이스 J — G4 durable 복구 TTL (루프485)

설계: 구현설계 §슬라이스 J. 대상은 **남은 위험 7**.

## 진행

| 단계 | commit | 상태 |
|---|---|---|
| 슬라이스 J 구현설계·현황 append | (본 커밋) | ☐ |
| `durableRestoreWindow` + sync/boot/setActive 배선 | | ☐ |
| 테스트 · push staging | | ☐ |

## 남은 위험 (예정)

| # | 내용 | 대응 |
|---|---|---|
| 5 | 수동 배포 | 사용자 조치 |
| 6 | 라벨↔헤더 일시 드리프트 | 유한 · I로 수렴 |
| 7 | G4 부트 복구가 장기 A 체류 후 F5에 B로 끌림 | **슬라이스 J** |

## 변경 이력

| 2026-09-10 | 루프485 슬라이스 J 착수 — 위험 7 TTL 설계 선행 |


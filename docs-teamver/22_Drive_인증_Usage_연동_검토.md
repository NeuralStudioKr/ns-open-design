# Drive · Main 인증 · Usage 연동 검토 (2026-06-24)

**목적:** embed Track A의 Drive publish/import, Main Teamver cookie SSO, usage 집계·billing wiring이 코드·단위 테스트 기준으로 정상인지 점검하고, **출시 전 남은 검증·리스크**를 SSOT로 고정한다.

**관련:** [11 Usage·Drive Publish](./11_Usage·Drive_Publish_보강.md) · [10 세션·OD패치](./10_세션·OD패치_보강.md) · [14 Design Drive 연동](./14_Design_Drive_연동_설계.md) · [00 구현 내역](./00_구현_내역_누적.md) loop 354

---

## 1. 한 줄 결론

| 축 | 코드 wiring | 단위 테스트 | Staging E2E | 주요 리스크 |
|----|------------|------------|-------------|------------|
| **Drive** | ✅ | ✅ (10+ suite) | ☐ | publish full browser, 실 Drive asset |
| **Main 인증** | ✅ | ✅ | ☐ | nginx 배포 후 workspace header 실관측 |
| **Usage** | ✅ FE+daemon+BE | ✅ | ☐ | run → RDS row 실환경 |

> **loop 354**에서 workspace switch 후 daemon run identity 불일치(P1)를 **FE header + nginx map + daemon identity**로 정렬했다. **nginx conf 적용·staging E2E**가 남는다.

---

## 2. Drive 연동

### 2.1 동작 중인 항목 ✅

| 기능 | FE | BE | 비고 |
|------|----|----|------|
| Publish HTML → Drive | `publishToDrive.ts`, `TeamverPublishDriveMenuItem` | `POST /projects/{id}/publish` | SDK 3-step presigned |
| Publish target picker | `TeamverDrivePickerModal`, `drivePublishTargets.ts` | `folderId` + `sharedDriveId` | folder search/drill-down ✅ |
| Workspace switch → target reset | `subscribeTeamverWorkspaceChanged` | — | loop 335–340, 회귀 테스트 |
| Import composer 첨부 | `TeamverDriveImportModal`, `importDriveAssets.ts` | `POST /import-drive` | batch 12, policy reject |
| Drive API (browse/search/thumbnail) | `driveApi.ts` → `/teamver-bff/drive/*` BFF proxy | design-api → Main BE `/api/drive/*` |
| Publish history chip | `latestPublishSummary.ts`, publish chip | `design_outputs` | workspace-scoped cache |

**근거 테스트:** `teamver-publish-drive*.test.ts`, `teamver-drive-*` (import/list/api/thumbnails), `teamver-publish-drive-menu-item.test.tsx` (workspace switch pin).

### 2.2 Gap · 후속

| ID | 우선 | 내용 | 상태 |
|----|------|------|------|
| D-G1 | P1 | Staging E2E D-5/D-6/D-7 — publish `driveAssetId`, import happy path | ☐ `run_staging_track_a_e2e.sh` |
| D-G2 | P2 | Publish full Drive browser (import modal 수준 recent/grid) | ☐ [14 §3.4](./14_Design_Drive_연동_설계.md) |
| D-G3 | P2 | PDF publish — daemon desktop-only, embed HTML-only (의도적) | 문서화됨 |
| D-G4 | P2 | `TeamverDriveImportModal` 단독 mount 시 workspace prop 의존 | 부모 `ChatComposer`가 switch 처리 — 현재 OK |
| D-G5 | P1 | **D-B1** staging E2E — embed `/teamver-bff/drive` browse shallow folder | ✅ `run_staging_track_a_e2e.sh` |
| D-G6 | P1 | **D-B2** staging E2E — embed `/teamver-bff/drive` shared-drive list | ✅ `run_staging_track_a_e2e.sh` |
| D-G7 | P1 | **D-B3** staging E2E — embed thumbnail batch `POST object-url/batch` | ✅ `run_staging_track_a_e2e.sh` |

---

## 3. Main Teamver 인증

### 3.1 동작 중인 항목 ✅

| 기능 | 구현 | 비고 |
|------|------|------|
| Cookie-only BFF | `designBffClient.ts` — `withCredentials`, `tokenStore: null` | same-origin `/teamver-bff` |
| Session probe | `fetchDesignAuthSession` | 5s cache, in-flight dedup |
| Cookie refresh | `refreshDesignAuthCookie` | BFF → Main BE fallback |
| 401 recovery | `withDesignBffCookieAuthRecovery` | publish/import/usage 공통 |
| Workspace store | `setActiveTeamverWorkspace`, localStorage keys | `teamver_design_active_workspace_id` |
| Embed session hook | `useTeamverEmbed` | pageshow refresh, 401 → login. 일반 focus/visibility 재검증은 **5분** throttle |
| BE session relay | `deploy/teamver/be/routers/auth.py` | Set-Cookie refresh |
| nginx auth_request | `design.teamver.com*.conf` | session-check → user/workspace inject |

**근거 테스트:** `teamver-design-auth-session.test.ts`, `teamver-workspace-switcher.test.tsx`, `teamver-sync-workspace.test.ts`, `teamver-workspace-switch.test.ts`.

### 3.2 loop 354 — workspace 정렬 (P1 수정)

**문제:** workspace switch 후 FE active workspace(localStorage)와 daemon run `teamverIdentity`가 어긋날 수 있었다. nginx는 session-check **default workspace**만 `X-Teamver-Workspace-Id`로 주입하고, Drive/publish/usage(BFF)는 FE store 기준이었다.

**수정 (loop 354):**

```text
[FE embed] streamViaDaemon POST /api/runs
    │  Header: X-Workspace-Id = active store
    ▼
[nginx] map $http_x_workspace_id → $teamver_daemon_workspace_id
    │  (FE header 우선, 없으면 session-check default)
    ▼
[daemon] readTeamverIdentityFromRequest
    │  X-Workspace-Id > X-Teamver-Workspace-Id
    ▼
run.teamverIdentity.workspaceId → usage bridge · billing · S3 access
```

| 파일 | 변경 |
|------|------|
| `apps/web/src/teamver/teamverDaemonHeaders.ts` | embed `/api/runs` header |
| `apps/web/src/providers/daemon.ts` | `buildTeamverDaemonRequestHeaders` |
| `apps/daemon/src/teamver-project-access.ts` | identity workspace 우선순위 |
| `deploy/teamver/devops/nginx/*.conf` | `$teamver_daemon_workspace_id` map |

**배포 필요:** staging/prod VM에 nginx conf reload (`apply_teamver_design_*_nginx_conf.sh`).

### 3.2b loop 390 — session/runs 호출 부하 완화

| 호출 | 기존 | loop 390 이후 |
|------|------|---------------|
| `/teamver-bff/auth/session` | `useTeamverEmbed`가 tab focus/visibility 복귀마다 cache bust + force probe | 일반 focus/visibility는 **5분** 최소 간격. cookie hint 새 등장·bfcache restore만 즉시 재검증 |
| `/api/runs` | embed에서도 `setInterval(refresh, 2000)` 고정 polling | `RUNS_CHANGED_EVENT`/초기 즉시 조회, active run 5초, idle 30초. in-flight/pending guard로 중첩 요청 방지 |

운영 효과: 열린 embed 탭이 idle 상태일 때 Main BE OAuth session check와 daemon runs list 조회가 계속 2초/탭 단위로 누적되는 현상을 줄인다. 새 작업 시작은 `RUNS_CHANGED_EVENT`로 즉시 감지하므로 슬라이드 처리 UX 지연은 최소화한다.

### 3.3 Gap · 후속

| ID | 우선 | 내용 | 상태 |
|----|------|------|------|
| A-G1 | P1 | nginx loop 354 map **VM 적용** + staging 실관측 | ☐ |
| A-G2 | P1 | W-1 E2E — alt workspace + `X-Workspace-Id` permissions probe | 🟡 loop 355 script |
| A-G3 | P2 | Browser 수동 — WS-A run → WS-B switch → usage row `workspace_id` | ☐ 체크리스트 §5 |

---

## 4. Usage 기록

### 4.1 동작 중인 항목 ✅

| 경로 | 트리거 | endpoint | 멱등 |
|------|--------|----------|------|
| **FE-first** | `saveMessage` + `telemetryFinalized` | `POST /api/v1/usage/events` (user JWT) | `reportedRunIds` Set |
| **Daemon M2M** | run terminal + identity | `POST /api/internal/usage/events` | `(workspace_id, run_id)` upsert |
| **Billing** | reserve → commit/refund | `internal/billing/*` + finalize | `teamverBillingUsageId` |

**FE hook:** `state/projects.ts` → `maybeReportTeamverUsageAfterSave` → `reportUsage.ts`

**Daemon bridge:** `teamver-usage-bridge.ts` ← `server.ts` finalize reporter

**BE:** `usage_report.py` (202 + requestId), `internal_usage.py` (M2M), `token_usage_crud.aupsert_usage`

**loop 354 추가:** FE usage payload에 `runStatus` 전송.

**근거 테스트:** `teamver-usage-report.test.ts`, `teamver-report-usage.test.ts`, `teamver-usage-bridge.test.ts`, BE `test_internal_usage.py`.

### 4.2 이중 경로 정책

FE와 daemon이 **동일 run**에 usage를 보고할 수 있다. BE upsert는 `(workspace_id, run_id)` 기준 merge.

**전제:** loop 354 이후 daemon `teamverIdentity.workspaceId` = FE active workspace. 불일치 시 **다른 workspace에 2행** 가능 → W-1·수동 체크리스트로 검증.

### 4.3 Gap · 후속

| ID | 우선 | 내용 | 상태 |
|----|------|------|------|
| U-G1 | P1 | U-6 staging E2E — M2M + RDS row count | ☐ |
| U-G2 | P2 | FE `token_count_source` 전송 (daemon은 전송) | ✅ loop 363 |
| U-G3 | P2 | doc §2.2 stale “daemon ❌” | ✅ loop 354 갱신 |
| **U-G4** | **P1** | **실측 토큰 → 크레딧(T) 환산·정확 차감** — 현재 `TEAMVER_BILLING_RESERVE_AMOUNT` flat reserve, ledger 토큰 미연동 | ☐ 후속 — **[11 §4](./11_Usage·Drive_Publish_보강.md)** SSOT |
| **U-G5** | **P1** | **Registry `commit`은 `usage_id`만** — commit 시 실측 amount 전달 불가. 전략 A/B/C 중 택 1 또는 Main BE API 확장 | ☐ [11 §4.3–§4.4](./11_Usage·Drive_Publish_보강.md) |
| **U-G6** | **P2** | **embed BYOK billing 없음** — usage ledger만 FE-first, reserve/commit 미호출 | ☐ [11 §4.7](./11_Usage·Drive_Publish_보강.md) |
| **U-G7** | **P0** | **terminal hook race** — usage upsert vs commit/refund 병렬 `void`, 그리고 ledger 병합 시 `committed` snapshot이 `not_attempted`로 downgrade될 수 있던 문제 | ✅ **loop 380** — daemon 직렬화 + BE precedence 병합 + finalize stub + IntegrityError merge ([11 §2.2·§2.4·§4.8](./11_Usage·Drive_Publish_보강.md)) |
| **U-G8** | **P2** | **FE usage POST 실패 관측 부재** — non-retryable/retry 실패 시 `console.warn`만, ops grep 불가 | ✅ **loop 380** — `teamver_usage_5xx` 구조화 JSON 마커(`stage=usage.events_client_drop`/`retry_drop`) ([11 §2.2](./11_Usage·Drive_Publish_보강.md)) |
| **U-G9** | **P3** | **장기 embed tab 메모리** — `reportedRunIds` Set unbounded | ✅ **loop 380** — 1024 cap + FIFO eviction |

---

## 5. Staging E2E 체크리스트

### 5.1 자동 (`run_staging_track_a_e2e.sh`)

```bash
# env 템플릿
bash deploy/teamver/scripts/print_staging_track_a_e2e_env.sh --from-env deploy/teamver/.env.staging

# 실행 (EC2 또는 VPN)
bash deploy/teamver/scripts/run_staging_track_a_e2e.sh --staging
```

| Phase | 검증 |
|-------|------|
| S-8a/b/c | cookie session, project list, runtime-config |
| U-6a/b/c | internal usage M2M, 멱등, RDS row |
| D-5/D-7 | publish + `driveAssetId` |
| D-6b/D-6a | import policy reject, real asset import |
| S3 | tenant prefix object |
| isolation | user B → user A project 403 |
| **W-1** | alt workspace + `X-Workspace-Id` permissions (loop 355, optional) |
| **S-5** | design `/api/runs` + `X-Workspace-Id` poll probe (loop 365) |
| **D-B1** | embed `/teamver-bff/drive/api/drive/folder?shallow_tree=true` → 200 + `root_folder_id` (loop 397) |
| **D-B2** | embed `/teamver-bff/drive/api/v2/shared-drive` → 200 + list body (loop 401) |
| **D-B3** | embed `POST …/api/v2/asset/object-url/batch` → 200 or 4xx probe (loop 402) |

**strict launch:** `run_post_deploy_track_a.sh --e2e-strict` — skip-only 성공 불가.

### 5.2 Main BE 장애 triage (Drive browse·session·runs)

| 증상 | 원인 | 확인 |
|------|------|------|
| Drive import 모달 browse 502 | design-api `teamver_drive_unreachable` | `curl -sf https://stg-design-api.teamver.com/api/healthz/deps` → `checks.main_be` |
| `/api/v1/auth/session` 502 | bootstrap Main BE down | design-api 로그 `[drive_proxy]` 또는 bootstrap 502 |
| embed `/api/runs` 500 | nginx `auth_request` session-check 실패 (Main BE) | design-api/daemon 로그 없음 — Main BE·nginx 먼저 |
| D-B1 E2E fail 502 | 동일 | EC2: `bash deploy/teamver/scripts/check_sidecar_deps.sh --staging` |

**복구 순서:** Main BE health → `check_main_be_design_wiring.sh --staging --live` → design-api redeploy 불필요 시 nginx만 재적용.

### 5.3 수동 (workspace switch · browser)

1. stg-design.teamver.com 로그인 — workspace **A** 선택
2. 슬라이드 프로젝트에서 run 1회 → 완료 대기
3. workspace switcher → workspace **B**
4. publish 1회 (Drive) — Network 탭 `X-Workspace-Id: B` 확인
5. RDS: `SELECT workspace_id, run_id FROM ai_model_token_usages ORDER BY created_at DESC LIMIT 5` — 최근 row가 **B**

---

## 6. 권장 다음 작업 (우선순위)

### 6.1 서비스·제품 (코드 루프 — **우선**)

| # | 작업 | P | 상태 |
|---|------|---|------|
| S-1 | Drive publish picker **최근 위치** (workspace localStorage ring) | P1 | ✅ loop 356 |
| S-2 | Drive publish picker full browser (Drive home recent grid) | P2 | ✅ loop 359 |
| S-3 | 프로젝트 편집 surface `useTeamverT` 확대 (FileViewer 등) | P2 | ✅ loop 360 |
| S-4 | embed slide E2E wording 잔여 (FileViewer download aria 등) | P1 | ✅ loop 357 |
| S-5 | 슬라이드 lifecycle — background run workspace 경계 | P0 | 🟡 FE run API header ✅ loop 365–368 · ProjectView stream detach ✅ loop 396/399 · background publish menu 🟡 loop 398 · browser 실관측 ☐ |
| S-6 | 목록 cover-hints N+1 제거 | P0 | ✅ loop 358 + loop 392(home) + loop 393(DesignsTab) + loop 400(header) |
| S-7 | Teamver shell 컴포넌트 `useTeamverT` (chip/banner/import modal 등) | P2 | ✅ loop 364–369 |
| **S-8** | **in-project run 성공** → preview + publish menu arm | P0 | ✅ **loop 403** |
| **S-9** | publish **one-click** — 마지막 target 자동 publish | P1 | ☐ loop 404 |
| **S-10** | session logout 후 stream detach browser QA | P0 | ☐ loop 399 코드 완료 · QA만 남음 |

> **원칙:** nginx 배포·staging E2E·RDS psql은 **ops 트랙** — 제품 코드 루프와 분리. [04 §코드 루프 우선순위](./04_구현_우선순위.md) 참고.

### 6.2 Ops·출시 게이트 (별도 트랙)

| # | 작업 | 비용 |
|---|------|------|
| O-1 | nginx loop 354 map staging/prod VM 적용 | ops 1회 |
| O-2 | Staging E2E full run (cookie + RDS + Drive asset) | ops 1회 |
| O-3 | W-1 `TEAMVER_ALT_WORKSPACE_ID` E2E (loop 355) | code ✅ |
| O-4 | Browser workspace switch 수동 체크리스트 §5.3 | QA 15min |

---

## TODO (후속 작업)

**갱신:** 2026-06-25. 중앙 SSOT — [04 §TODO](./04_구현_우선순위.md#todo-후속-작업).

### Drive (§2)

| ID | ☐ | 내용 |
|----|---|------|
| D-G1 | ☐ | Staging E2E D-5/D-6/D-7 full run — `run_staging_track_a_e2e.sh --e2e-strict` |
| D-G2 | ☐ | Publish full Drive browser (import modal 수준) — [14](./14_Design_Drive_연동_설계.md) |
| D-G7 | ☐ | D-6a 실 Drive asset import (`TEAMVER_DRIVE_IMPORT_ASSET_ID`) |

### 인증 (§3)

| ID | ☐ | 내용 |
|----|---|------|
| A-G1 | ☐ | nginx loop 354 map VM 적용 + staging 실관측 |
| A-G3 | ☐ | Browser — WS-A run → WS-B switch → usage row `workspace_id` (§5.3) |

### Usage (§4)

| ID | ☐ | 내용 |
|----|---|------|
| U-G1 | ☐ | U-6 staging E2E — M2M + RDS row count |
| U-G4 | ☐ | 실측 토큰 → 크레딧(T) 환산 — [11 §4](./11_Usage·Drive_Publish_보강.md) |
| U-G5 | ☐ | Registry commit amount 전략 A/B/C — [11 §4.3](./11_Usage·Drive_Publish_보강.md) |
| U-G6 | ☐ | embed BYOK billing hook — [11 §4.7](./11_Usage·Drive_Publish_보강.md) |

### Lifecycle·UX (§6.1)

| ID | ☐ | 내용 |
|----|---|------|
| S-5 | ☐ | workspace switch 중 stream detach + publish 동선 browser QA |
| S-8 | ✅ | **loop 403** — in-project run 성공 publish menu arm |
| S-9 | ☐ | **loop 404** — one-click publish (마지막 target) |
| S-10 | ☐ | logout stream detach browser QA (loop 399) |

---

## 7. 코드 위치 빠른 참조

| 영역 | 경로 |
|------|------|
| Drive publish | `apps/web/src/teamver/publishToDrive.ts` |
| Drive import | `apps/web/src/teamver/importDriveAssets.ts` |
| Drive browse BFF | `apps/web/src/teamver/driveApi.ts` → `deploy/teamver/be/app/routers/drive.py` |
| Auth session | `apps/web/src/teamver/designBffClient.ts` |
| Embed session UI | `apps/web/src/teamver/useTeamverEmbed.ts` |
| Usage FE | `apps/web/src/teamver/maybeReportTeamverUsageAfterSave.ts` |
| Usage daemon | `apps/daemon/src/teamver-usage-bridge.ts` |
| Daemon workspace header | `apps/web/src/teamver/teamverDaemonHeaders.ts` |
| BE usage | `deploy/teamver/be/app/routers/usage_report.py` |
| BE internal usage | `deploy/teamver/be/app/routers/internal_usage.py` |
| E2E script | `deploy/teamver/scripts/run_staging_track_a_e2e.sh` |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-25 | loop 403 — in-project run success publish menu arm (S-8) |
| 2026-06-25 | loop 402 — D-B3 thumbnail batch E2E, validate_deploy_env timeout warn |
| 2026-06-25 | loop 392~401 후속 TODO — §TODO 신설, S-8~S-10 (in-project publish, one-click, logout QA) |
| 2026-06-25 | loop 401 — D-B2 shared-drive E2E, check_sidecar_deps fixture, healthz timeout config |
| 2026-06-25 | loop 397 — D-B1 drive browse BFF E2E, Main BE triage §5.2, long proxy timeout |
| 2026-06-24 | loop 354 검토 초판 — Drive/auth/usage 판정, workspace 정렬, E2E 체크리스트 |
| 2026-06-24 | loop 356 — publish picker 최근 위치 (S-1) |
| 2026-06-24 | loop 355 — W-1 alt workspace E2E probe 추가 |

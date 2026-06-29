# Design — S3 데이터 저장 시점 SSOT

**목적:** staging/production에서 “언제 S3에 뭐가 올라가는지”를 **한 문서로 고정**한다.  
**전제:** `OD_PROJECT_STORAGE=s3` (staging/prod 필수 — [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md)).  
**관련:** [03 키·Drive·DB](./03_키_저장소_Drive_DB.md) · [07 VM 배포·인프라](./07_VM_배포_인프라.md) · [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) · **[20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)** (로컬+S3·용량·Litestream) · **[19 S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md)** (폴더별 저장 내용) · **[29 BYOK api mode vs runs](./29_BYOK_api_mode_vs_runs_아키텍처.md)** (왜 BYOK 는 POST /api/runs 없음)

---

## 0. 한 줄 결론 (헷갈릴 때 이것만)

> **프로젝트 파일은 EC2 scratch(로컬)에 먼저 쓰이고, 특정 이벤트(sync-up)가 발생한 뒤에만 S3 tenant prefix로 PUT 된다.**  
> **채팅(run) 중에는 S3에 안 올라갈 수 있다 — run 종료 시점에 올라간다.**  
> **프로젝트 목록·제목 등 메타는 RDS이며 S3 버킷에 없다.**

---

## 1. 저장소 SSOT 맵 (무엇이 어디에 있는가)

| 데이터 | SSOT (staging/prod) | S3 버킷 `teamver-design-*-data`? | 언제/어떻게 반영 |
|--------|---------------------|----------------------------------|------------------|
| **프로젝트 파일** (HTML, assets, export 산출물 등) | **S3** (`design/…/proj_…/`) | ✅ | scratch → **sync-up** (아래 §4) |
| **프로젝트 registry** (workspace/user, `s3_prefix`, title, status) | **RDS** `design_projects` | ❌ | design-api가 Postgres에 즉시 commit (S3 sync 성공 후 — §4.3) |
| **Publish/Output 메타** (`design_outputs`, usage) | **RDS** | ❌ | design-api |
| **Drive에 올린 HTML/ZIP** | **Main BE Drive** (별도 S3) | ❌ (Design project-data 버킷 아님) | Publish API |
| **daemon `app.sqlite`** (채팅·로컬 OD 메타) | EC2 EBS volume | △ Litestream 켜면 `litestream/*` | Litestream **연속 복제** (§5) |
| **수동 SQLite 백업** | S3 `sqlite-backups/` (선택) | △ | `backup_sqlite_to_s3.sh` **수동 실행** |

**로컬 개발 (`OD_PROJECT_STORAGE=local`):** 위 S3 sync-up 전부 **비활성**. 파일은 `<OD_DATA_DIR>/projects/<id>/` 에만 존재.

---

## 2. 아키텍처: scratch + materialization

Agent/도구는 **로컬 working directory(scratch)** 가 필요하므로, pure “매 쓰기마다 S3 직접 PUT”이 아니다.

```text
┌──────── Browser / design-api ─────────────────────────────┐
│  registry CRUD        → design-api → RDS                  │
│  chat / run / tools   → open-design daemon                │
│  file upload / export → daemon API                        │
└───────────────────────────────────────────────────────────┘
                              │
                              ▼
              open-design daemon (OD_PROJECT_STORAGE=s3)
              ┌─────────────────────────────────────┐
              │  scratch: /app/.od/scratch/<proj>/ │  ← 실행 중 쓰기는 여기
              │  MaterializingProjectStorage        │
              │    sync-down  S3 → scratch (읽기)   │
              │    sync-up    scratch → S3 (저장)   │
              └─────────────────────────────────────┘
                              │
                              ▼
              s3://<bucket>/design/ws_<ws>/user_<u>/proj_<od>/
```

**코드 SSOT:**

| 역할 | 경로 |
|------|------|
| scratch ↔ S3 구현 | `apps/daemon/src/storage/materializing-project-storage.ts` |
| run 전/후 hook | `apps/daemon/src/storage/project-materialization-runtime.ts` |
| 파일 API lazy hook | `apps/daemon/src/storage/lazy-project-materialization.ts` |
| tenant S3 prefix | `deploy/teamver/be/app/db/crud/design_project_crud.py` (`build_project_s3_prefix`) |
| registry create → sync-up | `deploy/teamver/be/app/routers/projects.py` |

---

## 3. S3 객체 키 구조

### 3.1 버킷·환경 prefix

`.env.staging` / `.env.production` 예:

```bash
OD_S3_BUCKET=teamver-design-staging-data   # 또는 prod-data
OD_S3_REGION=ap-northeast-2
OD_S3_PREFIX=design/                       # 버킷 내 공통 루트
```

### 3.2 프로젝트(tenant) prefix — registry SSOT

design-api가 프로젝트 생성 시 **RDS `design_projects.s3_prefix`** 에 고정:

```text
design/ws_<workspaceId>/user_<ownerUserId>/proj_<odProjectId>/
```

예: `design/ws_ws1/user_u1/proj_od-abc123/index.html`

- `odProjectId`: Open Design daemon이 쓰는 프로젝트 ID (`od_project_id`)
- daemon은 design-api **access 검증** 응답의 `X-Teamver-S3-Prefix` 또는 내부 identity로 tenant remote storage를 resolve

### 3.3 Litestream / 백업 (프로젝트 파일과 별 경로)

**prefix 역할 상세:** [19 S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md)

| 경로 | 용도 |
|------|------|
| `litestream/app.sqlite` | Litestream replica (`deploy/teamver/litestream.yml`) |
| `sqlite-backups/<env>/<timestamp>/` | Litestream 불가 시 수동 fallback (`scripts/backup_sqlite_to_s3.sh`) |

---

## 4. sync-down vs sync-up

| 동작 | 방향 | 목적 |
|------|------|------|
| **sync-down** | S3 → scratch | run/API 읽기 전 최신 원격 파일을 로컬에 materialize |
| **sync-up** | scratch → S3 | 변경분을 tenant prefix에 PUT (**실제 “저장”**) |
| **evict** | scratch 삭제 | 로컬 캐시 제거 (S3 SSOT 유지) |
| **purge** | S3 tenant 객체 삭제 | registry delete 시 원격 SSOT 제거 |

sync-up은 파일마다 **최대 3회 재시도** (`withSyncUpRetry`). 실패 시 로그 JSON 마커 `od_s3_sync_up_failed` (CloudWatch 알람 대상).

---

## 5. sync-up이 발생하는 **정확한 시점** (체크리스트)

아래 표가 “S3에 언제 생기나?”에 대한 **완전 목록**이다.

### 5.1 AI 채팅 run **종료 후** (가장 흔한 경로)

**트리거:** `startChatRun` → agent/tool이 scratch에 파일 수정 → run **finish**  
**코드:** `project-materialization-runtime.ts` — `beforeChatRun` / `afterChatRun` (`wrapFinish`)

| 단계 | 시점 | 동작 |
|------|------|------|
| ① run 시작 | `beforeChatRun` | **sync-down** (S3 → scratch). `projectMaterializationStartedAt` 기록 |
| ② run 중 | agent/tools | scratch에만 read/write. **S3 PUT 없음** |
| ③ run 종료 | `afterChatRun` | **sync-up**: run 시작 **이후** mtime이 갱신된 scratch 파일만 S3 PUT |
| ④ (선택) | run 종료 직후 | `OD_SCRATCH_EVICT_AFTER_RUN=1` → **안전 evict** (`scratch-evict-policy.ts`): S3에 아직 없는 scratch 파일은 evict **보류** + `od_scratch_evict_deferred`; 성공 sync 또는 remote SSOT 확인 후 evict |

**업로드 대상 필터 (`syncUp(projectId, remote, runStartTimeMs)`):**

- `runStartTimeMs > 0` (run 종료 경로): `file.mtimeMs + 1000ms >= runStartTimeMs` 인 파일만 upload  
  (`RUN_ARTIFACT_RECONCILE_MTIME_GRACE_MS = 1000` — clock skew 완화)
- run 시작 **이전** scratch에만 있던 stale 파일은 **skipped**

**동시 run:** 같은 `projectId`에 run이 이미 active면 v1은 **sync-down을 skip**하고 경고 로그만 남긴다.

```text
[사용자] 채팅 시작
    → sync-down (S3 → scratch)
    → … agent가 index.html 등 수정 (scratch만)
    → run 완료
    → sync-up (변경 파일만 S3)
    → (evict) scratch 비움
```

> **FAQ:** “채팅 중 S3 콘솔을 보면 왜 비어 있나?” → **run이 아직 안 끝났거나**, sync-up 실패, creds 없음.

---

### 5.2 파일·업로드 API **변경 직후** (lazy sync-up)

**트리거:** daemon HTTP — mutating method가 **2xx로 끝난 직후** (`res.on('finish')`)  
**코드:** `lazy-project-materialization.ts` — `createLazyProjectMaterializationMiddleware` + `persistAfterMutation`

**대상 경로 (regex):**

- `/api/projects/:id/files|folders|search|preview-url|upload|media|finalize|deploy|design-system-package-audit`
- `/api/projects/:id/plugins/(install-folder|publish-github|contribute-open-design|share-tasks)`
- `/api/projects/:id/export`, `/archive`

| HTTP | sync-down? | sync-up? |
|------|------------|----------|
| GET / HEAD | ✅ (`ensureMaterialized`, TTL 캐시 — §6) | ❌ |
| POST / PUT / PATCH / DELETE | ❌ (handler가 scratch 씀) | ✅ **응답 2xx 후** `persistAfterMutation` |

**runStartTimeMs = 0** → scratch **전체 파일** upload 대상 (run 필터 없음).

**예:** Drive import → daemon upload API → POST 200 → 즉시 sync-up.

#### Drive import 부하 경계

design-api `drive_import_service.py`가 Drive → daemon 전송의 마지막 부하 게이트다.

- 파일당 최대 **50MB**, 요청당 실제 다운로드 합계 최대 **100MB**
- presigned GET을 **1MB chunk → 요청 전용 임시 파일**로 기록하고, 같은 파일 handle을
  daemon multipart에 전달해 대형 `bytearray/bytes` 중복 적재 제거
- 한 요청의 asset은 순차 처리하며 upload 완료 즉시 임시 디렉터리 삭제
- worker당 동시 import 요청 최대 **2개** (`download_bytes` + multipart upload + sync-up 포함)
- 전송 슬롯을 2초 안에 얻지 못하면 **429 `drive_import_busy`**로 빠르게 반환
- 중복 `asset_id` 또는 동일 목적 path는 Drive 다운로드 전에 파일별 실패 처리
- 총량을 넘긴 파일은 daemon scratch/S3에 쓰지 않고
  `drive_import_batch_too_large`로 반환

따라서 최대 12개 batch 계약은 유지하지만, 12개 × 50MB를 한 요청에서 모두
메모리에 올리지 않는다. 임시 디스크는 worker당 동시 요청 제한 기준 최대 약 100MB이며 파일별
upload 종료 즉시 회수된다. 정상 파일이 있으면 기존처럼 `207` partial success 후
정상 파일만 명시적 scratch sync-up으로 S3에 영속화한다.

---

### 5.3 daemon `POST /api/projects` (OD 네이티브 프로젝트 생성)

**트리거:** daemon에서 새 프로젝트 생성 + template 파일 seed **성공 응답 후**  
**코드:** `project-routes.ts` — `scheduleProjectStoragePersistAfterResponse`

Teamver embed/registry 경로와 별도로, daemon 단독 create 시에도 동일하게 **2xx 후 sync-up**.

---

### 5.4 design-api `POST /api/v1/projects` (registry create — Track A 표준)

**트리거:** registry row **commit 후** daemon `POST …/scratch/sync-up` (best-effort)  
**코드:** `deploy/teamver/be/app/routers/projects.py` — `_sync_daemon_scratch_after_registry`

`OD_PROJECT_STORAGE=s3` 일 때 (2026-06-22 loop 191 이후):

- access gate가 **committed** registry row를 요구 → **commit 먼저**, sync-up은 **best-effort** (실패해도 HTTP 200)
- sync 실패 시 structured log: `od_registry_scratch_sync_failed` (CloudWatch 필터 후보)
- scratch가 **비어 있으면** sync-up `uploaded=0` — S3 tenant prefix **0 객체는 정상**
- **실제 파일 SSOT**는 daemon create/run/API sync-up 경로(§5.1~5.3)가 채움

**재활성(soft-deleted row reactivation)** 도 commit 후 동일 best-effort sync.

```text
[embed] 새 프로젝트
    → design-api RDS commit
    → daemon scratch/sync-up (tenant prefix PUT — scratch에 파일 있을 때만)
    → (별도) daemon POST /api/projects template seed → 2xx 후 lazy sync-up (§5.3)
```

> **잔여 (Track A 후속):** pre-commit hard-fail(502 rollback) 복원은 access gate와 순환 의존 — [09 §13.1](./09_Design_저장소_격리_출시게이트.md#131-rds--s3-후속-작업-2026-06-25) 참고.

---

### 5.5 명시적 daemon ops API

| API | 동작 |
|-----|------|
| `POST /api/projects/:id/scratch/sync-up` | `persistAfterMutation` (= §5.2와 동일, 전체 scratch upload) |
| `POST /api/projects/:id/scratch/evict` | `onProjectRemoved` — purge + evict (§5.6) |

design-api registry create가 내부적으로 `scratch/sync-up` 을 호출한다.

---

### 5.5b BYOK terminal message PUT (embed `mode: "api"` 채팅 종료)

**트리거:** `PUT /api/projects/:id/conversations/:cid/messages/:mid` body가
`{ telemetryFinalized: true, runStatus: succeeded|failed|canceled }` 이며 saved
message 가 `runId` 없는 assistant (= BYOK terminal) 인 경우.

**코드:** `apps/daemon/src/server.ts` — 메시지 PUT 라우터에서
`shouldReportByokUsageFromMessage` gate 통과 시 `reportByokTeamverUsageAndBillingFromDaemon` 와 함께
`scheduleProjectStoragePersistAfterResponse(projectStorageHooks, req, res, projectId)` 호출.

**배경:** BYOK 채팅은 `POST /api/runs` 를 거치지 않으므로 `afterChatRun` 의 run-end
sync-up 이 절대 트리거되지 않는다. 이 hook 이 없으면 scratch 만 변하고 S3 는 비어
있는 상태로 idle-evict 가 scratch 를 지워 **영구 데이터 손실** 이 발생한다 (loop 192
운영 사고). embed `mode: "daemon"` 경로는 §5.1 그대로.

| 단계 | 시점 | 동작 |
|------|------|------|
| ① BYOK 채팅 stream | proxy 라우트가 scratch 에 artifact 작성 | S3 PUT 없음 |
| ② 최종 assistant 저장 | FE `saveMessage(..., { telemetryFinalized: true })` | daemon PUT 200 |
| ③ 응답 finish | `res.on('finish')` → `persistAfterMutation` (runStart=0 full upload) | scratch → S3 |

> FE 가 streaming 중 throttle 한 intermediate PUT 은 `telemetryFinalized: true` 가
> 아니므로 sync-up 을 발생시키지 않는다. terminal 시점에만 1 회 발생.

---

### 5.6 프로젝트 **삭제** — 저장이 아님

**트리거:** design-api `DELETE /api/v1/projects/{od_project_id}` → daemon `POST …/scratch/evict`  
**코드:** `onProjectRemoved` (`lazy-project-materialization.ts`)

| 단계 | 동작 |
|------|------|
| ① RDS | `status=deleted` (soft-delete) |
| ② daemon | `scratch/evict` → scratch tree 제거 |
| ③ S3 | `OD_S3_PURGE_ON_DELETE` 에 따라 purge 또는 **유지** |

| `OD_S3_PURGE_ON_DELETE` | S3 tenant prefix | scratch |
|-------------------------|------------------|---------|
| default **on** (1/true) | **purge** (객체 DELETE) | evict |
| `0` / false | **유지** | evict |

> **금지 (2026-06-29 hotfix):** registry delete **전** `scratch/sync-up` 호출 금지.  
> `syncUp(runStart=0)` + empty scratch 는 remote orphan delete 로 tenant prefix 전체를 지울 수 있음 —  
> `OD_S3_PURGE_ON_DELETE=0` staging 정책과 충돌. 명시적 purge(`onProjectRemoved`)만 S3 delete.

**syncUp full-sync orphan delete 정책** (`materializing-project-storage.ts`):

- scratch **empty** → remote DELETE **never**
- `OD_S3_PURGE_ON_DELETE=0` → remote DELETE **never** (upload only)
- production purge=1 + scratch non-empty → scratch에 없는 remote만 DELETE (의도적 파일 삭제 반영)

로그 마커: `od_s3_remote_purged` (explicit purge only).

---

## 6. sync-down (읽기) 시점 — “저장”은 아니지만 짝

| 경로 | sync-down 시점 |
|------|----------------|
| **run 시작** | `beforeChatRun` (§5.1) |
| **파일 API GET** | lazy middleware `ensureMaterialized` |

**TTL:** `OD_PROJECT_LAZY_SYNC_TTL_MS` (staging example **60000** = 60초).  
같은 프로젝트 GET이 TTL 안이면 **sync-down skip** (scratch 캐시 사용).

---

## 6.5 Idle scratch evict — sync-up 보장 (S3 SSOT 가드)

**트리거:** `OD_SCRATCH_EVICT_IDLE=1` (또는 `OD_SCRATCH_EVICT_AFTER_RUN=1` 의 기본
on) 시 daemon 주기 sweep (`OD_SCRATCH_DISK_METRIC_INTERVAL_MS`, default 5 분).

**코드:** `apps/daemon/src/storage/scratch-idle-eviction.ts` +
`project-materialization-runtime.ts` — `syncUpForIdleEvict`.

**규칙 (loop 192 이후):**

1. 활성 run 진행 중인 프로젝트 (`isActiveProject`) → skip.
2. 직전 sync-up 이 실패 마킹된 프로젝트 (`isProjectSyncFailed`) → skip.
3. dir mtime 이 `idleAfterMs` 보다 신선 → skip.
4. **scratch 비어 있음 → 즉시 evict.**
5. scratch 에 파일이 있으면 **반드시 sync-up 을 먼저 시도**:
   - **sticky remote 캐시 (`projectStickyRemote`)** 에서 tenant remote 를 조회.
     캐시는 lazy materialization / `beforeChatRun` 에서 채워진다.
   - sticky remote 가 없으면 **evict 보류** + `od_scratch_evict_deferred_unsynced`
     (reason: `no_cached_remote`) 마커 emit.
   - `storage.syncUp(projectId, remote, 0)` 호출. `failed > 0` 이거나 예외 발생
     시 `markProjectSyncFailed` + `od_s3_sync_up_failed` (stage:
     `idle_evict` / `idle_evict_exception`) 마커 emit, **evict 보류**.
6. sync-up 성공 (또는 scratch 가 이미 sync 상태였음) → `storage.evictScratchProject`.

> 핵심: **scratch 에 미동기 파일이 있는 한 idle-evict 은 절대 scratch 를 지우지
> 않는다**. 5 분 단위 sweep 이 sync-up 을 재시도하므로, 일시적 S3/네트워크 장애
> 회복 후 자동으로 정리된다.

**관련 메트릭 (CloudWatch alarm 후보):**

| 마커 | 의미 |
|------|------|
| `od_scratch_idle_evicted` | 정상 evict (sync 보장 후) |
| `od_scratch_evict_deferred_unsynced` | sync-up 미완 → evict 연기. 반복 누적 시 sticky 캐시 미해결 (project 가 한 번도 GET 안 됨) 또는 S3 장애 의심 |
| `od_s3_sync_up_failed` (`stage: idle_evict`) | idle sweep 의 sync-up 실패 |

**Sticky remote 캐시 라이프사이클:**

- **채움:** lazy materialization `resolveRemote` (GET /files 등), `beforeChatRun`
- **유지:** `afterChatRun` 이후에도 보존 (project_id → s3_prefix 는 불변)
- **제거:** `onProjectRemoved` (project delete 시)

---

## 7. Litestream / SQLite — 프로젝트 파일과 **별 타이밍**

| 항목 | 설명 |
|------|------|
| **대상** | daemon volume `app.sqlite` (OD 내부 채팅·설정 등) |
| **경로** | `s3://<bucket>/litestream/app.sqlite` |
| **시점** | Litestream profile 가동 시 **약 1초 간격 연속 복제** (`litestream.yml` `sync-interval: 1s`) |
| **프로젝트 sync-up과 관계** | **무관** — HTML/assets upload와 별도 |

Litestream 미가동 시: `app.sqlite`는 EBS에만 있음. S3에는 `backup_sqlite_to_s3.sh` **수동 실행** 시에만 `sqlite-backups/` 하위에 snapshot.

---

## 8. 환경 변수 (저장 동작에 직접 영향)

| 변수 | 기본·staging | 영향 |
|------|--------------|------|
| `OD_PROJECT_STORAGE` | staging/prod: **`s3` 필수** | `local`이면 S3 전부 비활성 |
| `OD_S3_BUCKET` / `OD_S3_REGION` / `OD_S3_PREFIX` | terraform output | remote bucket·키 루트 |
| `OD_S3_ACCESS_KEY_ID` / `OD_S3_SECRET_ACCESS_KEY` | staging: static key 또는 instance role | **없으면 daemon S3 init 실패 → sync-up 불가** |
| `OD_PROJECT_LAZY_SYNC_TTL_MS` | 60000 | GET sync-down 캐시 TTL |
| `OD_SCRATCH_EVICT_AFTER_RUN` | staging example **1** | run 종료 후 scratch evict |
| `OD_S3_SYNC_UP_METRICS` | **1** 권장 | lazy sync-up 실패 시 `od_s3_sync_up_failed` (run-end는 항상 emit) |
| `OD_S3_PURGE_ON_DELETE` | **production: default on** · **staging 권장 `=0`** | delete 시 S3 tenant purge. staging debug/E2E 증적 유지 시 `0` ([09 §13.1](./09_Design_저장소_격리_출시게이트.md)) |
| `LITESTREAM_BUCKET` | project data bucket | Litestream 대상 |

---

## 9. 시나리오별 타임라인

### A. embed에서 슬라이드 채팅 (일반 UX)

```text
1. (최초) design-api create → scratch/sync-up → RDS commit
2. 사용자 메시지 → startChatRun
3. beforeChatRun: sync-down
4. agent가 HTML/assets 수정 (scratch)
5. run finish → afterChatRun: sync-up → S3에 객체 생성/갱신
6. OD_SCRATCH_EVICT_AFTER_RUN=1 이면 scratch 비움
```

**S3에 파일이 보이는 시점:** **5번 run 종료 후** (4번 중에는 scratch만).

### B. Drive에서 asset import

```text
design-api → daemon upload POST → 2xx → persistAfterMutation → sync-up
```

**S3 반영:** upload API **응답 직후** (run 불필요).

### C. Publish to Drive

```text
daemon export GET (sync-down으로 S3→scratch) → ZIP/HTML 생성
→ Main BE Drive presigned PUT (Design project-data 버킷 아님)
→ design_outputs RDS row
```

**Design S3:** export **읽기** 시 sync-down; Publish 산출물 **본문**은 Main BE Drive S3.

### D. 프로젝트 삭제

```text
design-api delete → daemon scratch/evict → S3 tenant purge (default)
```

**S3:** 객체 **삭제** (저장 아님).

---

## 10. “S3에 없다” / “안 올라간다” 진단

| 증상 | 흔한 원인 |
|------|-----------|
| daemon crash loop `requires credentials.accessKeyId` | S3 creds 미설정 — sync-up 전에 프로세스 종료 |
| run 중 버킷 비어 있음 | **정상** — run 종료 전 |
| run 후에도 tenant prefix 없음 | sync-up 실패 — daemon 로그 `[project-materialization] sync-up failed` / `od_s3_sync_up_failed` |
| RDS에 프로젝트 있는데 S3 없음 | **흔함** — registry만 등록(legacy upsert)·빈 create·run/upload 없음. `bash scripts/check_registry_s3_drift.sh --staging` 로 drift 목록 |
| 잘못된 prefix 조회 | tenant path `design/ws_*/user_*/proj_*/` 확인. 버킷 루트만 보면 “비어 있음”처럼 보일 수 있음 |

**확인 명령 (EC2, creds 설정 후):**

```bash
# RDS active vs S3 tenant 객체 drift (registry-only 목록)
bash scripts/check_registry_s3_drift.sh --staging

# daemon storage health
curl -sS -H "Authorization: Bearer $OD_API_TOKEN" http://127.0.0.1:7456/api/health/storage | jq .

# tenant prefix (design-api / RDS design_projects.s3_prefix 값)
aws s3 ls "s3://teamver-design-staging-data/design/ws_<ws>/user_<u>/proj_<od>/" --region ap-northeast-2

# sync-up 실패 로그
docker logs teamver-open-design-daemon 2>&1 | grep -E 'sync-up|od_s3_sync_up_failed'
```

**배포 게이트:** `bash scripts/check_storage_isolation.sh --staging` — 컨테이너 ENV·health endpoint까지 SSOT 검증.

---

## 11. 자주 헷갈리는 Q&A

### Q1. “저장” 버튼을 눌러야 S3에 가나?

아니다. **run 종료** 또는 **파일 mutating API 성공** 시 자동 sync-up. 별도 “Save to S3” UX 없음.

### Q2. 채팅 한 턴 도중 EC2가 죽으면?

run 종료 sync-up 전이면 **scratch 변경분은 유실**될 수 있다. S3 SSOT는 **마지막 성공 sync-up** 시점. (`OD_SCRATCH_EVICT_AFTER_RUN=1` 이면 scratch도 비워져 있을 수 있음.)

### Q3. RDS `design_projects` 와 S3 파일 관계?

RDS: **누구의 어떤 프로젝트인지** + `s3_prefix` 포인터.  
S3: **실제 파일 본문**. registry만 있고 파일 없음 = create sync-up 실패했거나 아직 run/upload 없음.

### Q4. Main BE Drive S3와 Design bucket?

**완전 별개.** Publish는 Main BE presigned URL로 **다른 bucket**에 PUT.

### Q5. production도 static AWS key?

Design deploy 정책: production은 **EC2 instance profile** 권장. static key는 validate **fail** (`ALLOW_STATIC_AWS_KEYS=1` 긴급 우회만).

### Q6. local / MinIO 개발은?

`OD_PROJECT_STORAGE=local` 또는 MinIO endpoint — §1 표와 다르게 **S3 SSOT 아님**. [09 §10.1](./09_Design_저장소_격리_출시게이트.md) 참고.

---

## 12. 관련 ops·테스트

| 항목 | 경로 |
|------|------|
| staging S3 env merge | `deploy/teamver/scripts/apply_staging_s3_env.sh` |
| storage isolation check | `deploy/teamver/scripts/check_storage_isolation.sh` |
| validate (s3 필수) | `deploy/teamver/scripts/validate_deploy_env.sh` |
| daemon storage tests | `apps/daemon/tests/storage.test.ts`, `lazy-project-materialization.test.ts` |
| registry create sync tests | `deploy/teamver/be/tests/test_projects_create_router.py` |

---

## 13. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-19 | 초版 — sync-up/down 트리거·SSOT 맵·tenant prefix·Litestream 분리·FAQ |
| 2026-06-29 | §5.5b BYOK terminal message PUT sync-up + §6.5 idle scratch evict sync-up 보장 (sticky remote 캐시) — embed `mode: "api"` 채팅 데이터 손실 hotfix |

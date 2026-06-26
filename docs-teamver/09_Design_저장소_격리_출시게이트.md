# Design — 저장소·격리 출시 게이트

**Prod 공개 출시 전 필수.** volume-only Track A는 **용량·백업·테넌트 격리** 측면에서 출시 blocker이다.  
**개발 SSOT:** 본 문서 · [04 구현 우선순위](./04_구현_우선순위.md) · **진행 갱신:** [00 구현 내역](./00_구현_내역_누적.md)

**관련:** [03 키·Drive·DB](./03_키_저장소_Drive_DB.md) · [07 VM 배포·인프라](./07_VM_배포_인프라.md) · [02 design-app ↔ daemon](./02_design-app_daemon_연동.md) · **[20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)** (로컬+S3·Litestream·용량) · **[16 S3 저장 시점 SSOT](./16_S3_데이터_저장_시점_SSOT.md)** · **[17 Production 출시 순서](./17_Production_출시_작업_순서.md)** · **[18 EC2 IAM·S3](./18_EC2_IAM_Instance_Profile_S3_설정.md)** · **[22 Drive·Usage 연동](./22_Drive_인증_Usage_연동_검토.md)**

**갱신:** 2026-06-25 (loop 392~402 코드·ops · staging EC2 storage/Litestream 실증 반영)

## 용어 (이 문서에서)

본 문서는 **Production 공개 오픈 전에 반드시 닫아야 하는 조건(출시 게이트)** 을 정의한다. 아래 용어는 전 문서에서 같은 뜻으로 쓴다. 저장소 동작·용량·sync 시점 상세는 [20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) · [16 S3 저장 시점](./16_S3_데이터_저장_시점_SSOT.md) 참고.

| 용어 | 설명 |
|------|------|
| **blocker** (출시 blocker) | **Prod 공개 오픈을 막는 미충족 조건.** 일반 이슈·버그와 달리, G1~G6([§2](#2-출시-acceptance-criteria)) 중 하나라도 EC2 실증까지 ✅가 아니면 **외부 사용자에게 서비스를 열지 않는다**는 뜻. 코드가 merge됐어도 staging `checks.od_storage=ok`·`--e2e-strict` 미통과면 blocker **유지**. |
| **출시 게이트** | blocker를 풀기 위한 **필수 체크리스트** (Phase 0~3 + §14 E2E). “게이트 통과” = G1~G6 ✅ + EC2 증적. |
| **volume-only** | 프로젝트 파일·메타를 EC2 EBS(`OD_DATA_DIR`)에만 두는 구조. **영구 blocker** — 내구성·테넌트 격리 모두 부족. |
| **Hybrid SSOT** | 영속=**S3·RDS**, 실행=**로컬 scratch·SQLite** 패턴. `OD_PROJECT_STORAGE=s3` 가 이 모드의 스위치. |
| **SSOT** (Single Source of Truth) | 복구·권한·용량 계획의 **진짜 원본** 위치. Hybrid에서 프로젝트 파일=S3, registry·usage·publish 메타=RDS(`design_projects` 등). |
| **로컬 CWD** (Current Working Directory) | agent CLI·shell이 파일을 읽고 쓰는 **현재 작업 디렉터리**. Open Design run은 `scratch/projects/<id>/` 를 CWD로 쓴다. S3를 FUSE로 마운트하거나 매 IO마다 HTTP PUT 하는 **pure S3** 는 agent·SQLite와 맞지 않아 Prod SSOT로 쓰지 않는다 ([§7](#7-저장소-패턴-선택-fuse-vs-sdk-vs-hybrid)). |
| **scratch** | S3 모드에서 run/API 동안만 쓰는 **임시 로컬 폴더** (`OD_SCRATCH_DIR/projects/`). SSOT 아님 — sync-up 후 evict 가능. |
| **materialization** | S3 ↔ scratch 파일 복사. **sync-down**(S3→scratch), **sync-up**(scratch→S3). `MaterializingProjectStorage` 가 담당. |
| **Litestream** | `app.sqlite`를 **S3에 실시간 복제**하는 sidecar 오픈소스. EC2 디스크·인스턴스 장애 시 채팅·OD 로컬 메타 복구용(G2). 프로젝트 HTML/asset SSOT와는 **별도 prefix** (`litestream/app.sqlite`). S3에 쌓이는 **replica 객체** = Litestream이 generation·WAL segment 단위로 올리는 파일들. |
| **registry** | design-api RDS `design_projects` — 프로젝트 id·제목·**소유 workspace/user**·`s3_prefix`. 파일 본문은 없고 **격리·목록의 SSOT**. |
| **design_outputs** | design-api RDS — Drive **발행 이력 메타** (`drive_asset_id`, folder/shared-drive id, mime·size). 파일 본문 SSOT는 **Main BE Drive**(별도 버킷). `project_id`는 `design_projects.id` 참조(논리 FK). |
| **usage ledger** | design-api RDS `ai_model_token_usages` — workspace·`run_id`·모델·토큰·billing 스냅샷 ([11](./11_Usage·Drive_Publish_보강.md)). |
| **테넌트 격리** | workspace A 사용자가 workspace B의 project id·S3 prefix에 접근하지 못하게 하는 것. registry + daemon `…/access` middleware. |
| **`od_storage`** | design-api `/api/healthz/deps` 의 `checks.od_storage` 값. `ok` = daemon이 S3 backend에 정상 도달. `degraded` = **출시 blocker 유지** (smoke 기본 hard-fail). |
| **EC2 ops 실증** | 코드·fixture만이 아니라 **staging EC2**에서 `run_post_deploy_track_a.sh --staging --rds --smoke --e2e-strict`(내부 `--require-core`) 등으로 blocker를 해제하는 단계. |

**blocker 두 층 (혼동 주의):**

| 층 | 의미 | 현재 (2026-06-25) |
|----|------|-------------------|
| **아키텍처 blocker** | volume-only로 Prod 오픈하는 것 자체 | 코드상 Hybrid로 **해소** — volume-only 금지 |
| **ops blocker** | Hybrid가 **실제 EC2에서** 동작한다는 증적 부족 | **미해소** — `od_storage=ok`, Litestream live replica, `--e2e-strict` 등 |

**자주 틀리는 점 (코드 SSOT):**

| 혼동 | 사실 |
|------|------|
| `OD_S3_PREFIX=design/` = tenant prefix | ❌ env **루트**만. tenant 키는 `design/ws_…/user_…/proj_…/` (`design_projects.s3_prefix`) |
| design-api RDS = 프로젝트 **파일** SSOT | ❌ 파일은 S3. RDS는 registry·usage·publish **메타** |
| `design_outputs` 파일이 Design bucket에 있음 | ❌ 본문은 **Main BE Drive**. RDS row는 이력·asset id |
| `--e2e-strict` 플래그가 `run_staging_track_a_e2e.sh`에 있음 | ❌ **`run_post_deploy_track_a.sh --e2e-strict`** 가 e2e에 **`--require-core`** 전달 |
| hosted에서 daemon `GET /api/projects` = list SSOT | ❌ embed list SSOT = **design-api**; registry 장애 시 **fail-closed** |
| Track B = Drive publish 전체 | ❌ publish v1은 **Track A Phase 4 (G7)**. Track B = full browser·import handoff 등 |

---

## 한 줄 결론

> **Prod 오픈 전에 S3(프로젝트 SSOT) + 메타 내구성(Litestream) + design-api registry(테넌트 격리)를 완료한다.**  
> EBS volume은 **실행 scratch/cache** 만 허용; 사용자 데이터 SSOT로 쓰지 않는다.

### 출시 게이트 현황 (2026-06-25)

| 구분 | 상태 | 비고 |
|------|------|------|
| **코드 (Phase 0~3)** | 🟡 **대부분 ✅** | materialize·registry·access middleware·smoke/isolation 스크립트 완료 |
| **EC2 ops 실증** | 🟡 **부분 통과** | `check_storage_isolation.sh` 21/21 · `od_storage=ok` · Litestream snapshot ✅ · **`--e2e-strict` ☐** |
| **Production 공개** | ❌ **금지** | G1~G6 EC2 증적 전까지 |

**남은 blocker (ops):** 위 [용어](#용어-이-문서에서) §ops blocker — [§TODO](#todo-후속-작업) · [04 O-2~O-3](./04_구현_우선순위.md#todo-후속-작업)

---

## 1. 왜 blocker인가

[용어 §blocker](#용어-이-문서에서) — **volume-only** 는 아키텍처 blocker이고, **Hybrid 미실증** 은 ops blocker다.

**volume-only (구 As-Is)** 는 nginx **로그인 게이트**까지 Teamver이고, OD daemon 내부가 **단일 `OD_DATA_DIR` + 단일 `app.sqlite` + 단일 `OD_API_TOKEN`** 인 구조다. **Hybrid 목표(09)는 코드상 구현됐으나**, EC2에서 S3 reachability·Litestream replica·E2E strict 실증이 끝나기 전까지는 **ops blocker** 가 남아 Prod 오픈 금지다.

| 리스크 | volume-only (❌) | Hybrid 코드 (✅) | Prod 허용? |
|--------|------------------|------------------|------------|
| 데이터 유실 | EBS snapshot runbook 없음 | S3 SSOT + Litestream | 🟡 EC2 증적 필요 |
| 용량 | od-data 무제한 누적 | scratch evict + metrics | 🟡 CW alarm apply ☐ |
| 복구 (RPO/RTO) | volume only | S3 PUT + Litestream ≤1min | 🟡 restore drill ☐ |
| HA / scale-out | EC2 1대, SQLite 단일 writer | 동일 (Track B) | △ (출시 후) |
| **테넌트 격리** | 단일 daemon namespace | registry + access middleware | ✅ 코드 · EC2 E2E ☐ |

OD daemon은 nginx **`OD_API_TOKEN`** 으로 edge 인증되나, **hosted**(`TEAMVER_DESIGN_API_URL` 설정)에서는 `/api/projects/:id/**` 마다 design-api **access** 로 workspace·owner를 추가 검증한다(P3-6). volume-only에서는 이 격리가 없다.  
SaaS 공개 출시에는 **저장소 내구성 + 격리** 둘 다 필수다.

### 저장 위치 — volume-only (금지) vs Hybrid (목표)

| 데이터 | volume-only (❌ Prod) | Hybrid S3 모드 (`OD_PROJECT_STORAGE=s3`, 코드 ✅) |
|--------|----------------------|--------------------------------------------------|
| 프로젝트 파일 | `<OD_DATA_DIR>/projects/<id>/` EBS SSOT | **S3** tenant prefix + scratch 임시 ([16](./16_S3_데이터_저장_시점_SSOT.md)) |
| 프로젝트 registry·권한 | 없음 (daemon namespace 공유) | **RDS** `design_projects` + access API |
| 채팅·OD 로컬 메타 | `<OD_DATA_DIR>/app.sqlite` only | EBS `app.sqlite` + **Litestream → S3** |
| 설정·플러그인·memory | `<OD_DATA_DIR>/` | v1 로컬 + backup (Track B S3화) |
| 토큰 usage ledger | RDS `ai_model_token_usages` | RDS ✅ |
| Drive 발행 이력 메타 | — | RDS `design_outputs` ✅ |
| Drive 발행 파일 본문 | — | **Main BE Drive** (별도 S3 버킷) ✅ |
| SSO·권한 | Main BE | Main BE ✅ |

---

## 2. 출시 Acceptance Criteria

아래 **G1~G6 전부 ✅ (EC2 실증 포함)** 전에는 **Production 공개 오픈 금지**.

| # | 기준 | Phase | 상태 (2026-06-25) |
|---|------|-------|-------------------|
| G1 | 프로젝트 파일 SSOT → **S3** (IAM instance profile, lifecycle) | 0, 1 | 🟡 코드·terraform ✅ · staging **`od_storage=ok` ✅** (2026-06-25 EC2) |
| G2 | `app.sqlite` **Litestream → S3** (또는 동등 PITR) | 2 | 🟡 live replica **✅** (snapshot/WAL 로그) · **restore drill ☐** |
| G3 | **design-api `design_projects`** registry + workspace/user 격리 API | 3 | ✅ |
| G4 | OD web — 프로젝트 list/create → **design-api 경유** | 3 | ✅ 코드 · EC2 `--e2e-strict` ☐ |
| G5 | daemon — project 접근 시 **design-api access 검증** | 3 | ✅ |
| G6 | volume = scratch only (용량 알람·백업 runbook) | 0, 7 | 🟡 scratch metrics·alarm script ✅ · EC2 apply ☐ |
| G7 | (권장) 완료 산출물 → **Teamver Drive** | 4 | 🟡 BE+embed v1 ✅ · full Drive browser ☐ |

**하지 않아도 되는 것 (출시 후):** OD `DaemonDb` Postgres 전체 이전, daemon multi-replica, job queue, circuit breaker.

---

## 3. 목표 아키텍처 (Hybrid SSOT)

**상세 (로컬 scratch·용량·Litestream·FAQ):** [20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)

Agent CLI는 **로컬 CWD**가 필요하므로 pure S3만으로는 불가. **영속=원격, 실행=로컬 scratch**.

```text
┌──────── Browser (OD web embed) ─────────────────────────────────────┐
│  session / bootstrap / runtime-config → design-api                  │
│  project list·create·delete           → design-api (registry)       │
│  publish · outputs history            → design-api                  │
│  usage (embed chat save)              → design-api BFF `/usage/events` │
│  Drive browse/import (embed BFF)      → design-api → Main BE Drive  │
│  chat · run · file edit · export      → daemon                      │
└────────────────────────────────────────────────────────────────────┘
         │                    │                         │
         ▼                    ▼                         ▼
   design-api (RDS)     Main BE Drive              open-design daemon
   · design_projects    (발행 파일 SSOT,            · scratch (ephemeral)
   · design_outputs      별도 S3 버킷)              · MaterializingProjectStorage
   · ai_model_token_usages      ▲                   · app.sqlite
         │                      │ publish            │      │
         │                      │ (SDK presigned)    │      └─ Litestream → S3
         │                      └─ PublishService ───┘ (daemon export read)
         ▼
   S3  teamver-design-{env}-data
       design/ws_<ws>/user_<uid>/proj_<od>/...   ← 프로젝트 파일 SSOT
       litestream/app.sqlite                     ← SQLite replica
```
(prefix·버킷 역할: [19](./19_S3_버킷_prefix_역할.md) · tenant `s3_prefix` 생성: `design_project_crud.build_project_s3_prefix` · Publish: [11 §6](./11_Usage·Drive_Publish_보강.md) · [14](./14_Design_Drive_연동_설계.md))

| 레이어 | SSOT | 비고 |
|--------|------|------|
| 편집 중 프로젝트 파일 | **S3** `design/…/proj_…/` | `OD_PROJECT_STORAGE=s3` |
| 채팅·OD 로컬 메타 (단기) | EBS `app.sqlite` + **Litestream → S3** | Postgres DaemonDb는 출시 후 |
| 프로젝트 registry·권한 | **RDS** `design_projects` | workspace·owner·`s3_prefix` |
| 토큰 usage | **RDS** `ai_model_token_usages` | `run_id` 멱등 upsert |
| Drive 발행 이력 | **RDS** `design_outputs` | asset/folder id·mime·size 메타 |
| Drive 발행 파일 본문 | **Main BE Drive** | design-api가 SDK로 PUT; Design data 버킷과 **무관** |

---

## 4. 작업 우선순위 · 진행 상황

**범례:** ✅ 완료 · 🟡 부분(코드 ✅ / EC2·E2E 미실증) · ☐ 미착수

### Phase 0 — 인프라 (약 1주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P0-1 | S3 bucket `teamver-design-{staging,prod}-data` | `ns-teamver-devops` | ✅ |
| P0-2 | EC2 IAM instance profile — bucket prefix R/W | `ns-teamver-devops` | ✅ terraform · [18](./18_EC2_IAM_Instance_Profile_S3_설정.md) |
| P0-3 | S3 lifecycle + **Versioning** (overwrite 복구) | `ns-teamver-devops` | ✅ `scripts/s3_lifecycle_policy.sh` |
| P0-4 | `.env.*` — `OD_PROJECT_STORAGE=s3`, `OD_S3_*` | `deploy/teamver` | 🟡 env·compose·validate hard-fail ✅ · daemon S3 init fail-fast ✅ · smoke storage hard-fail 기본 on ✅ · **EC2 `checks.od_storage=ok` ✅** |
| P0-5 | Litestream sidecar / config (compose) | `deploy/teamver` | 🟡 hosted 자동 기동·env/preflight·running hard gate ✅ · **live S3 replica ✅** · **restore EC2 drill ☐** |
| P0-6 | volume → scratch 전용 (용량·알람 runbook) | [07](./07_VM_배포_인프라.md) + `deploy/teamver/scripts` | 🟡 `OD_SCRATCH_DISK_METRICS` · `print_cloudwatch_alarm_commands.sh` ✅ · **EC2 alarm apply ☐** |
| P0-7 | RDS `teamver_design_*` database | Terraform + SQL | ✅ |

### Phase 1 — OD ProjectStorage 연결 (약 2~3주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P1-1 | `ProjectStorage` interface + `LocalProjectStorage` | `apps/daemon` | ✅ `storage/project-storage.ts` |
| P1-2 | `S3ProjectStorage` (SigV4) | `apps/daemon` | ✅ |
| P1-3 | `resolveProjectStorage()` + unit tests | `apps/daemon` | ✅ |
| P1-4 | `projects.ts` → `ProjectStorage` 경유 리팩터 | `apps/daemon` | 🟡 **의도적 defer** — lazy file+export/archive+media/finalize/deploy/plugins/design-system materialize ✅ · `projects.ts` 전면 ☐ ([04 defer](./04_구현_우선순위.md#todo-후속-작업)) |
| P1-5 | `server.ts` / routes — storage 주입 | `apps/daemon` | ✅ `PROJECT_STORAGE_LAYOUT` · `createMaterializingProjectStorage` · `createProjectStorageAccessHooks` |
| P1-6 | **`MaterializingProjectStorage`** — run 전 sync-down / 후 sync-up | `apps/daemon` | ✅ |
| P1-7 | `startChatRun` 전후 materialization hook | `apps/daemon` | ✅ |
| P1-8 | Teamver compose/env S3 연동 검증 (staging) | `deploy/teamver` | 🟡 validate·smoke·`print/apply_staging_s3_env.sh` · `run_staging_phase0_activate.sh` ✅ · `OD_S3_ALLOW_SCRATCH_FALLBACK` staging/prod 금지 ✅ · **EC2 smoke `od_storage=ok` ☐** |
| P1-9 | MinIO/localstack integration test | `apps/daemon` | ✅ harness + compose `--profile minio` · `test_run_s3_integration_test.sh` · **EC2 AWS S3 실연동 ☐** |
| P1-10 | sync-up 실패 알람·재시도 (run 종료 후) | `apps/daemon` + ops | 🟡 retry 3x + lazy + run-end `od_s3_sync_up_failed` JSON 마커 ✅ · **CloudWatch alarm EC2 apply ☐** |

**근거 코드:** `apps/daemon/src/storage/` · `lazy-project-materialization.ts` (file/export/archive/media/finalize/deploy/plugins 경로) · run hook (`OD_PROJECT_STORAGE=s3`).

### Phase 2 — SQLite 내구성 (약 1주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P2-1 | Litestream → S3 replica config | `deploy/teamver` | 🟡 `litestream.yml` · `verify_litestream_replica.sh` ✅ · **EC2 snapshot/WAL 로그 ✅** (2026-06-25) · restore drill ☐ |
| P2-2 | restore runbook (snapshot 시점 → compose up) | `deploy/teamver/docs` + `scripts/restore_app_sqlite_from_s3.sh` | ✅ Litestream + fallback snapshot · `--apply` daemon 직접 적용 · `test_restore_app_sqlite_from_s3.sh` |
| P2-3 | (대안) `app.sqlite` → S3 fallback — Litestream 불가 시 | `deploy/teamver` | ✅ `backup_sqlite_to_s3.sh` manual fallback (cron 미사용 = 의도) |

### Phase 3 — 테넌트 격리 + design-api registry (약 2주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P3-1 | `design_projects` DDL + migration | `deploy/teamver/be` | ✅ |
| P3-2 | `POST /api/v1/projects` — registry 생성 | `deploy/teamver/be` | ✅ S3 sync hard-fail (`OD_PROJECT_STORAGE=s3`) |
| P3-3 | `GET /api/v1/projects` — workspace + **owner** 필터 목록 | `deploy/teamver/be` | ✅ |
| P3-4 | `GET /api/v1/projects/{od_project_id}/access` — 204/403 | `deploy/teamver/be` | ✅ v1(owner) · `X-Teamver-S3-Prefix` |
| P3-5 | OD web — list/create → design-api | `apps/web` | ✅ create/import/delete sync · list filter · fail-closed · **EC2 `--e2e-strict` ☐** |
| P3-6 | daemon middleware — project API access 검증 | `apps/daemon` | ✅ `teamver-project-access.ts` env-gated |
| P3-7 | S3 prefix `design/ws_{ws}/user_{uid}/proj_{od}/` | P0 + P3 | ✅ design-api SSOT + daemon tenant scope ([19](./19_S3_버킷_prefix_역할.md)) |
| P3-8 | `DELETE /api/v1/projects/{od_project_id}` — registry soft-delete + scratch evict + **tenant S3 purge** | `deploy/teamver/be` + daemon | ✅ `status=deleted` · `POST …/scratch/evict` → `onProjectRemoved` · `OD_S3_PURGE_ON_DELETE` · `s3_lifecycle_policy.sh` |
| P3-9 | access 검증 방식 확정 (daemon middleware vs nginx subrequest) | 설계 → 구현 | ✅ daemon middleware |

**P3-6 구현 메모:** `TEAMVER_DESIGN_API_URL`이 설정된 배포에서 daemon은 `/api/projects/:id/**` 요청 전에 design-api access endpoint를 호출한다. 목록/생성(`/api/projects`)은 web registry sync/filter 경로가 담당하므로 middleware 대상에서 제외한다. design-api 거부(403/404)는 daemon에서 `PROJECT_NOT_FOUND`로 반환해 cross-workspace project id 노출을 줄인다. access 결과·`s3_prefix`는 60s in-process cache.

**2026-06-16~25 구현 요약:**

- `deploy/teamver/be/app/routers/projects.py` — create/list/access/delete API.
- `design_projects.s3_prefix` = `design/ws_{workspace_id}/user_{owner_user_id}/proj_{od_project_id}/` ([19](./19_S3_버킷_prefix_역할.md)).
- 접근 검증 v1: workspace + owner user + active status.
- nginx `/api/v1/projects` 보호 라우트 staging/prod 반영.
- OD web: daemon project create/import/share 성공 후 registry upsert **필수** (실패 시 daemon rollback + 사용자 에러).
- Teamver embed list: registry 조회 성공 시 `od_project_id` 기준 daemon list 필터. **fail-closed** (registry 장애 시 daemon list 비노출).
- legacy 전체 upsert: `VITE_TEAMVER_LEGACY_REGISTRY_SYNC=1` 에서만 한시 허용.
- managed S3: identity/registry `s3_prefix` 해석 실패 시 flat remote fallback **금지**.
- **loop 400**: `/api/projects/cover-hints` 배치에 `X-Workspace-Id` 헤더 정렬 (`teamverDaemonHeaders`).
- **smoke/isolation**: `smoke_design.sh --staging` 기본 `SMOKE_REQUIRE_OD_STORAGE=1` · `check_storage_isolation.sh` · `run_post_deploy_track_a.sh` Phase 8.
- **daemon S3 init**: bucket/region/IAM 실패 시 `od_s3_storage_init_failed` 후 기동 실패. `OD_S3_ALLOW_SCRATCH_FALLBACK=1` 은 local/debug 전용.
- **E2E 자동화**: `run_staging_track_a_e2e.sh` — S-8b list · U-6 usage 멱등 · D-5 publish · user B `/access` 403 · `TEAMVER_S3_BUCKET` tenant object probe. **EC2 cookie+env 채운 strict run ☐**.

**스키마 (RDS `teamver_design_*` — healthz 3테이블 probe):**

`deploy/teamver/be/app/db/schema_bootstrap.py` · `/api/healthz` 는 아래 3테이블 존재를 검사한다 (`health.py` `_SCHEMA_TABLES`).

**`design_projects`** (registry · Phase 3):

```sql
CREATE TABLE design_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  od_project_id TEXT NOT NULL UNIQUE,
  s3_prefix TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_design_projects_workspace ON design_projects (workspace_id, updated_at DESC);
```

**`design_outputs`** (Drive 발행 이력 · Phase 4 · `project_id` → `design_projects.id` 논리 FK):

```sql
-- 핵심 컬럼 (전체 DDL: schema_bootstrap.py)
CREATE TABLE design_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,          -- design_projects.id
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  od_project_id TEXT NOT NULL,
  drive_asset_id TEXT NOT NULL,
  drive_folder_id TEXT,
  drive_shared_drive_id TEXT,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  publish_status TEXT NOT NULL DEFAULT 'ready',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`ai_model_token_usages`** (usage ledger · [11](./11_Usage·Drive_Publish_보강.md)) — workspace·`run_id`·model·tokens·billing snapshot.

### Phase 4 — Publish → Teamver Drive (약 1~2주, G7)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P4-1 | export/finalize → Drive upload (`teamver-app-sdk`) | `deploy/teamver/be` | ✅ `PublishService` · Main BE presigned 3-step |
| P4-2 | `design_outputs` 테이블 + `GET /outputs` | `deploy/teamver/be` | ✅ `drive_folder_id` + `drive_shared_drive_id` |
| P4-3 | Main FE / Drive 연동 UX | `ns-teamver-fe-v2` + embed | 🟡 `?asset=` · Open in Drive · target picker · BFF browse ✅ (loop 394) · **full folder browser ☐** |
| P4-4 | registry create/reactivation → scratch sync-up (S3) | design-api + daemon | ✅ `POST …/scratch/sync-up`; sync 실패 시 DB rollback + 502 |

---

## 5. Phase별 env · 산출물

### S3 (daemon)

```bash
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-prod-data
OD_S3_REGION=ap-northeast-2
OD_S3_PREFIX=design/          # env 루트; tenant 키 = design/ws_<ws>/user_<uid>/proj_<od>/
OD_SCRATCH_DIR=/app/.od/scratch
OD_SCRATCH_EVICT_AFTER_RUN=1
OD_S3_SYNC_UP_METRICS=1
TEAMVER_DESIGN_API_URL=http://teamver-design-api:8000   # hosted — P3-6 access middleware
# Do not set in staging/production. Local/debug only:
# OD_S3_ALLOW_SCRATCH_FALLBACK=1
# IAM role preferred; static keys are staging-emergency / local only:
# OD_S3_ACCESS_KEY_ID=...
# OD_S3_SECRET_ACCESS_KEY=...
```

### Litestream (예시)

Sidecar는 **hosted deploy에서 항상** 기동 (`deploy.sh` — profile 아님). SQLite 파일은 od-data volume `/data/app.sqlite` ([07](./07_VM_배포_인프라.md)).

```yaml
# deploy/teamver/litestream.yml
dbs:
  - path: /data/app.sqlite
    replicas:
      - type: s3
        bucket: teamver-design-prod-data
        path: litestream/app.sqlite
        region: ap-northeast-2
        sync-interval: ${LITESTREAM_SYNC_INTERVAL:-3s}
```

**replica 객체 확인 (EC2 ops / P2-1)**

| 방법 | 절차 |
|------|------|
| **스크립트** | `bash scripts/verify_litestream_replica.sh --staging` — sidecar running + `aws s3 ls s3://…/litestream/app.sqlite/` |
| **storage audit** | `bash scripts/check_storage_isolation.sh --staging` — §7 에서 위 스크립트 자동 호출 |
| **AWS Console** | **S3** → 버킷 `teamver-design-staging-data` (또는 prod) → **Browse** → prefix `litestream/` → `app.sqlite/` 하위 generation·segment 파일의 **Last modified** 가 최근이면 복제 중 |
| **AWS CLI** | `aws s3 ls s3://teamver-design-staging-data/litestream/ --recursive \| head` |

첫 배포 직후에는 daemon 기동·채팅 1회 후 10~30초 뒤 객체가 나타날 수 있다. 비어 있으면 `docker logs teamver-design-litestream --tail 50` — `readonly database`면 compose `teamver_od_data:/data` **`:ro` 제거**; `AccessDenied`면 [18 IAM](./18_EC2_IAM_Instance_Profile_S3_설정.md) `litestream/*`.

### design-api RDS 테이블 (SSOT 맵)

| 테이블 | Phase | SSOT 역할 | healthz |
|--------|-------|-----------|---------|
| `design_projects` | 3 | registry·격리·`s3_prefix` | ✅ |
| `design_outputs` | 4 | Drive 발행 **이력 메타** (파일 본문은 Main BE Drive) | ✅ |
| `ai_model_token_usages` | Usage | 토큰·billing ledger (`run_id` 멱등) | ✅ |

### design-api env

| 변수 / DB | 용도 | 상태 |
|-----------|------|------|
| `POSTGRES_*` → `teamver_design_*` | usage + **design_projects** + **design_outputs** | ✅ schema·healthz |
| `TEAMVER_*` | Main BE bootstrap | ✅ |
| `OD_PROJECT_STORAGE` / `OD_S3_*` | daemon S3 SSOT | ✅ example·validate · **EC2 `od_storage=ok` ✅** |
| `LITESTREAM_*` | SQLite replica (`LITESTREAM_SYNC_INTERVAL` 기본 3s) | ✅ compose·preflight·`verify_litestream_replica.sh` · **EC2 live replica ✅** · restore drill ☐ |

---

## 6. 하지 말 것

| 접근 | 이유 |
|------|------|
| **rclone/s3fs로 `OD_DATA_DIR`·`projects/` FUSE mount** | SQLite WAL·agent lock·rename/small file에 부적합; cache≠SSOT |
| **`app.sqlite`를 S3 FUSE 위에 두기** | DB corruption; Litestream **replicate**만 허용 |
| EBS snapshot만 추가하고 prod 오픈 | 격리·용량 근본 미해결 |
| volume 통째 `aws s3 sync` cron | RPO 거침, tenant prefix·access 없음 |
| OD SQLite → Teamver RDS full mirror | 스키마 churn, PII 이중화 |
| 격리 없이 S3만 | prefix 노출 시 타 사용자 데이터 |
| 출시 게이트에 OD Postgres DaemonDb | 범위 과대 — Litestream으로 대체 |
| S3를 git working tree / node_modules / plugin staging처럼 사용 | OD agent·plugin 가정과 충돌 |

**운영 예외 (앱 경로 아님):** incident 조사 시 **`rclone mount --read-only`** 로 bucket 탐색만 허용.

---

## 7. 저장소 패턴 선택 (FUSE vs SDK vs Hybrid)

Object storage는 **key-value**이며 POSIX(append·rename·lock)와 다르다. Design daemon은 **agent CLI 로컬 CWD** + **SQLite**를 쓰므로 패턴별 적합성이 갈린다.

| 패턴 | 설명 | Design 적합 | 판단 |
|------|------|-------------|------|
| **A. FUSE mount** | rclone/s3fs → `/mnt/...` = `OD_DATA_DIR` | Agent는 동작해 보임 | ❌ Prod SSOT 금지 |
| **B. SDK only (pure S3)** | 모든 read/write가 HTTP; scratch 없음 | Agent run 불가 | ❌ |
| **C. Hybrid (채택)** | SSOT=S3 SDK, run=로컬 scratch, sync | Agent + 내구성 | ✅ **09 목표** |
| **D. volume + cron sync** | EBS SSOT, 주기적 backup | 단기 MVP | ❌ prod blocker |

**Teamver Drive/Main BE 패턴(앱 SDK 직접)** 과 동형인 것은 **C의 S3 레이어**이고, Design 추가분은 **MaterializingProjectStorage(scratch)** 이다.

**개발:** `OD_PROJECT_STORAGE=local`. **Staging/Prod:** `s3` + IAM role. **로컬 S3 경로만 검증:** MinIO (P1-9, 선택). **로컬→staging bucket 직접 연결은 비권장** — [§10.1](./09_Design_저장소_격리_출시게이트.md#101-로컬-개발--storage-모드-선택-ssot).  
**배경 참고:** [archive/10_S3_저장소_패턴_참고.md](./archive/10_S3_저장소_패턴_참고.md)

---

## 8. MaterializingProjectStorage (Phase 1 핵심)

`ProjectStorage` 구현체 3층:

```text
ProjectStorage (interface)
├── LocalProjectStorage           # dev, scratch root
├── S3ProjectStorage              # prod SSOT (SigV4)
└── MaterializingProjectStorage   # scratch ↔ remote
```

### 8.1 run 단위 동작

```text
1. run/chat/export 시작 → S3 prefix → scratch/{projectId}/  (sync-down)
2. agent cwd = scratch/{projectId}/
3. run 종료 → dirty 파일만 S3 PUT (sync-up)
4. 비-run API (preview 등) → lazy materialize middleware (`lazy-project-materialization.ts`) — files/export/archive/media/finalize/deploy/plugins/design-system 경로 ✅
```

**dirty 추적:** `RUN_ARTIFACT_RECONCILE_MTIME_GRACE_MS`, `projects.ts` run reconcile 재사용.

### 8.2 scratch 디스크 · EC2 EBS 2볼륨

Design EC2 는 Terraform 으로 **root + od-data** EBS 2개 ([07 §3.5](./07_VM_배포_인프라.md#35-ec2-ebs-볼륨-root--od-data)). Staging·Production 동일 구조, 용량만 다름.

| 볼륨 | 마운트 | SSOT? |
|------|--------|-------|
| Root | `/` | OS·Docker·배포 (프로젝트 SSOT 아님) |
| OD data | `/opt/teamver-design/od-data` = `OD_DATA_DIR` | scratch·SQLite·캐시 (프로젝트 파일 SSOT = **S3**) |

| 항목 | 권장 |
|------|------|
| scratch 경로 | `$OD_SCRATCH_DIR/projects/` (기본 `$OD_DATA_DIR/scratch/projects/`) |
| od-data 용량 (tfvars) | Staging **30 GiB**, Production **100 GiB** — project SSOT 아님, export·동시 run 여유 |
| 알람 | od-data·scratch 80% — [07](./07_VM_배포_인프라.md) |
| eviction | run 완료 후 project scratch 삭제 가능 (SSOT=S3) |
| scratch 용량 관측 | `OD_SCRATCH_DISK_METRICS=1` — [21 가이드](./21_OD_SCRATCH_DISK_METRICS_가이드.md) |

### 8.3 동시성 (v1)

| 시나리오 | v1 |
|----------|-----|
| 동일 project 동시 run | **금지** (409 또는 Track B queue) |
| workspace 내 다른 project | 허용 |
| sync-up | project 단위 in-process lock |

---

## 9. 테넌트 격리 — 요청 흐름 (Phase 3)

### 9.1 생성 · 목록 · Publish · Usage

```text
POST design-api /api/v1/projects                    → INSERT design_projects + s3_prefix (+ sync-up)
GET  design-api /api/v1/projects                  → workspace·owner 필터 (embed list SSOT)
POST design-api /api/v1/projects/{ref}/publish      → access → daemon export → Drive PUT → design_outputs
GET  design-api /api/v1/projects/{ref}/outputs      → design_outputs 목록
POST design-api /usage/events (embed BFF)           → ai_model_token_usages upsert
POST design-api /api/internal/usage/events (M2M)    → daemon/BE usage (U-6 E2E)
```

**embed list:** design-api registry가 SSOT. daemon `GET /api/projects` 는 standalone·registry 필터 후 보조 목록이며, **hosted embed는 registry 실패 시 fail-closed**(daemon raw list 미노출).

**project ref vs od_project_id:** publish·outputs·GET single project는 `{ref}`(registry `id` **또는** `od_project_id`). **access**·delete·scratch/sync-up·daemon middleware는 **`od_project_id` 전용** (`aget_project_by_od_id`).

### 9.2 project API access (P3-9 ✅)

**채택:** daemon middleware → `GET design-api …/projects/{od_project_id}/access` (204 + `X-Teamver-S3-Prefix` / 403). nginx subrequest는 URI에서 project id 추출이 어려워 **미채택**.

### 9.3 S3 prefix

```text
s3://teamver-design-{env}-data/design/ws_{ws}/user_{uid}/proj_{od_project_id}/...
```

- **env:** `OD_S3_PREFIX=design/` (trailing `/` 필수 — `validate_deploy_env.sh`)
- **registry SSOT:** `design_projects.s3_prefix` = 위 전체 tenant prefix (코드: `build_project_s3_prefix()`)
- **daemon object key:** `s3_prefix` + project-relative path (예: `index.html`)

### 9.4 design-api API (구현 ✅)

| Method | Path | 설명 | 상태 |
|--------|------|------|------|
| POST | `/api/v1/projects` | registry + s3_prefix + sync-up hard-fail | ✅ |
| GET | `/api/v1/projects` | workspace 목록 | ✅ |
| GET | `/api/v1/projects/{od_project_id}/access` | daemon 검증 (**od_project_id** 전용) | ✅ |
| DELETE | `/api/v1/projects/{od_project_id}` | soft-delete (`status=deleted`) + scratch evict + S3 purge | ✅ |
| POST | `/api/v1/projects/{od_project_id}/scratch/sync-up` | registry create/reactivation S3 sync | ✅ |
| POST | `/api/v1/projects/{ref}/publish` | daemon export → Drive PUT → `INSERT design_outputs` | ✅ |
| GET | `/api/v1/projects/{ref}/outputs` | Drive publish 이력 | ✅ |
| POST | `/api/v1/projects/batch/outputs/latest` | embed publish chip batch | ✅ |
| POST | `/api/v1/projects/{ref}/import-drive` | Drive asset → daemon project (G7·D-6) | ✅ |
| GET | `/api/v1/drive/{path}` | embed Drive BFF → Main BE | ✅ |
| POST | `/usage/events` | embed FE usage (BFF) | ✅ |
| POST | `/api/internal/usage/events` | M2M usage ingest (daemon/ops U-6) | ✅ |
| POST | `/api/internal/usage/billing-finalize` | billing finalize (M2M) | ✅ |

---

## 10. 데이터 경계 — S3 vs 로컬

| 데이터 | Prod SSOT | 로컬 (daemon) / 기타 |
|--------|-----------|----------------------|
| `projects/` 파일 | **S3** | scratch |
| `app.sqlite` | **Litestream → S3** | 로컬 disk (FUSE 금지) |
| `design_projects` | **RDS** | — |
| `design_outputs` | **RDS** (메타) · **Main BE Drive** (파일) | — |
| `ai_model_token_usages` | **RDS** | — |
| app-config, memory, plugins | v1 로컬 + backup | volume |
| skills/templates (공유) | 이미지/로컬 RO | OK |
| import `metadata.baseDir` | **hosted 비활성** 권장 | sandbox 예외만 |

### 10.1 로컬 개발 — storage 모드 선택 (SSOT)

**MinIO는 필수가 아니다.** 환경별로 `OD_PROJECT_STORAGE`와 S3 endpoint를 나눈다.

| 환경 | `OD_PROJECT_STORAGE` | S3 / endpoint | 용도 |
|------|------------------------|---------------|------|
| **로컬 일반 개발** | `local` (기본) | 없음 | embed UI·BFF·SSO·publish API·registry 대부분 |
| **로컬 S3 경로 검증** | `s3` | **MinIO** (`OD_S3_ENDPOINT=http://minio:9000`) | materialize·scratch sync-up/evict·daemon S3 통합 테스트 (P1-9) |
| **Staging EC2** | `s3` | **AWS S3** (`teamver-design-staging-data`, endpoint 없음) | 실제 격리·E2E·smoke |
| **Production EC2** | `s3` | **AWS S3** + IAM instance profile | 출시 |

```text
로컬 laptop (일반)     → local          (MinIO 불필요)
로컬 S3 코드만 검증    → s3 + MinIO     (run_minio_s3_dev.sh / --with-minio)
Staging/Prod 검증      → EC2 + AWS S3   (VPN·smoke·browser E2E)
```

#### 로컬에서 Staging AWS S3 bucket을 그대로 써도 되나?

**기술적으로는 가능**하다 (동일 `OD_S3_BUCKET`·region + 로컬 AWS 자격증명).  
**운영상 권장하지 않는다.**

| 리스크 | 설명 |
|--------|------|
| 데이터 오염 | 로컬 실험 프로젝트·scratch sync가 staging bucket·prefix에 섞임 |
| 실수 피해 | registry delete → `scratch/evict`, sync-up이 **공유 staging 객체** 변경 |
| 격리 검증 무의미 | tenant prefix E2E는 **전용 EC2 + staging bucket**에서 하는 것이 SSOT |
| 보안 | 개발자 PC에 staging write 권한·장기 키 배포 부담 |

**Staging과 동일 인프라 E2E**는 로컬 daemon이 아니라 `stg-design.teamver.com` + EC2 smoke / browser checklist ([10 §6](./10_세션·OD패치_보강.md) · [11 §8](./11_Usage·Drive_Publish_보강.md)).

#### MinIO가 필요한 경우 (선택)

- daemon `S3ProjectStorage` / `MaterializingProjectStorage` 동작 확인
- `run_s3_integration_test.sh` · `run_minio_s3_dev.sh --integration-test`
- `validate_deploy_env.sh`가 `OD_S3_ENDPOINT`에 minio/localhost를 보면 **dev 전용** 경고 (staging/prod EC2에는 넣지 않음)

#### 관련 ops 스크립트

| 스크립트 | 대상 |
|----------|------|
| `run_minio_s3_dev.sh` | 로컬 MinIO 기동 + env 안내 |
| `run_docker.sh --with-minio` | compose MinIO profile |
| `print_staging_s3_env.sh` | **EC2** `.env.staging` S3 블록 출력 |
| `apply_staging_s3_env.sh` | **EC2** `.env.staging`에 S3 키 병합 (P1-8) — `--dry-run` 지원, `test_apply_staging_s3_env.sh` fixture |
| `run_post_deploy_track_a.sh` | EC2 validate → compose → sidecar deps → smoke / `--e2e` / `--e2e-strict` |
| `run_production_phase0_activate.sh` | Production S3/RDS env merge + checklist |
| `check_storage_isolation.sh` | env + container ENV + healthz 종합 audit |
| `print_cloudwatch_alarm_commands.sh` | sync-up · usage 5xx · scratch alarm (`--apply`) |

상세 runbook: [`deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md`](../deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md) §로컬 vs Staging S3.

---

## 11. S3 · IAM · 버킷 (Phase 0)

| 항목 | Staging | Production |
|------|---------|------------|
| Bucket | `teamver-design-staging-data` | `teamver-design-prod-data` |
| Versioning | Enabled | Enabled |
| Encryption | SSE-S3 or KMS | 동일 |
| Public access | Block all | Block all |

EC2 IAM (Terraform `s3.tf` · [18 §3](./18_EC2_IAM_Instance_Profile_S3_설정.md)):

| Prefix | 용도 |
|--------|------|
| `design/` · `design/*` | tenant project files (G1) |
| `litestream/*` | Litestream SQLite replica (G2) |
| `sqlite-backups/*` | manual fallback `backup_sqlite_to_s3.sh` (P2-3) |

Production은 **instance profile only** — static `OD_S3_ACCESS_KEY_*` 는 validate **fail** (staging은 임시 허용).  
design-api hot path는 RDS; S3 listing은 admin/incident만. Drive 파일은 Main BE 버킷 — [03](./03_키_저장소_Drive_DB.md).

---

## 12. 장애 · 관측 · 복구

| 이벤트 | 대응 |
|--------|------|
| sync-up 실패 | retry 3회 + metric + 알람 (P1-10) |
| S3 timeout | SDK retry; 새 run circuit |
| scratch full | eviction + 80% 알람 |
| Litestream lag | RPO 모니터; P2 restore runbook |
| EC2 loss | S3 + Litestream restore; scratch 재생성 |

| 레이어 | RPO (초안) |
|--------|------------|
| 프로젝트 파일 (S3) | 0 (PUT 후) |
| app.sqlite (Litestream) | ≤ 1 min |
| `design_projects` · `design_outputs` · `ai_model_token_usages` | RDS PITR |

---

## 13. volume → S3 마이그레이션

1. maintenance — run 중단  
2. `s3 sync` projects/ (registry backfill)  
3. Litestream 초기 upload  
4. `OD_PROJECT_STORAGE=s3`  
5. E2E (§14)  
6. 구 volume snapshot 7d 보관  

### 13.1 RDS ↔ S3 후속 작업 (2026-06-25)

**배경:** staging에서 RDS `active` 23 vs S3 tenant 객체 3 — legacy registry 일괄 upsert·빈 create·Publish-only 경로로 **registry-only** row가 다수. 인프라(S3 mode·IAM)는 정상.

**당일 반영 (코드 ✅):**

| 항목 | 내용 |
|------|------|
| run-end evict 가드 | `apps/daemon/src/storage/scratch-evict-policy.ts` — scratch에 파일 있는데 S3 empty면 full sync-up retry 후에도 remote 0이면 evict **보류** (`od_scratch_evict_deferred`) |
| drift audit | `bash scripts/check_registry_s3_drift.sh --staging` — active row별 S3 객체 유무 |
| registry sync 관측 | design-api `_sync_daemon_scratch_after_registry` 실패 시 `od_registry_scratch_sync_failed` JSON log |

**EC2 즉시 (ops):**

```bash
# staging: delete해도 S3 tenant 유지 (디버깅) — .env.staging 에 추가 후 daemon 재기동
OD_S3_PURGE_ON_DELETE=0

bash scripts/check_registry_s3_drift.sh --staging          # drift 목록
export TEAMVER_OD_PROJECT_ID='<S3 객체 있는 od_project_id>'  # E2E S3 probe
bash scripts/run_staging_track_a_e2e.sh --staging --require-core
```

**삭제 ↔ S3 (기본 동작):** UI/registry `DELETE` → design-api `status=deleted` → daemon `scratch/evict` → **`onProjectRemoved`가 tenant prefix S3 객체 DELETE** (`od_s3_remote_purged` 로그). `OD_S3_PURGE_ON_DELETE=0` 이면 scratch만 evict, **S3는 남음**. (idle evict·run-end evict는 scratch만 — S3 삭제 아님.)

**3→1 원인 확인 (EC2):**

```bash
docker logs teamver-open-design-daemon 2>&1 | grep od_s3_remote_purged | tail -20
psql "$MAIN_BE_DATABASE_URL" -c "SELECT od_project_id, updated_at FROM design_projects WHERE status='deleted' ORDER BY updated_at DESC LIMIT 10;"
aws s3 ls s3://teamver-design-staging-data/design/ --recursive | awk '{print $4}' | sed 's|/[^/]*$||' | sort -u
```

**추후 (출시 blocker 아님 · Track A 후속):**

| | 작업 | 비고 |
|---|------|------|
| ☐ | staging **`OD_S3_PURGE_ON_DELETE=0`** — UI/registry delete 시 S3 tenant **유지** (디버깅·drift audit·E2E 재사용). production은 default **on** | `.env.staging` + daemon 재기동 |
| ☐ | §13 volume→S3 **backfill** — registry-only 프로젝트 scratch/sync-up 또는 `s3 sync` | maintenance 창 |
| ☐ | registry create **post-commit retry** (daemon scratch/sync-up N회, 지수 backoff) | `od_registry_scratch_sync_failed` 알람 연동 전 |
| ☐ | **idle scratch evict** tenant-aware guard (lazy materialize 후 S3 0 + scratch >0 evict 금지) | run-end 가드만으로 1차 커버 |
| ☐ | CloudWatch `od_registry_scratch_sync_failed` · `od_scratch_evict_deferred` metric filter `--apply` | `print_cloudwatch_alarm_commands.sh` |
| ☐ | staging FE `VITE_TEAMVER_LEGACY_REGISTRY_SYNC=1` **비활성** 확인 (legacy bulk upsert 금지) | 기본 off, 빌드 env 점검 |
| ☐ | (선택) pre-commit sync hard-fail 복원 | access gate ↔ commit 순환 의존 설계 필요 |

---

## 14. 검증 체크리스트 (Staging E2E)

**범례 — 자동화:** ✅ 스크립트·fixture 완료 · 🟡 runbook/수동 유지 · ☐ 미착수  
**범례 — EC2 실증:** ✅ staging EC2에서 pass · 🟡 부분(일부 probe skip) · ☐ 미실행

**Prod blocker 해제**에는 아래 **전 항목 EC2 ✅** + [§2 G1~G6](#2-출시-acceptance-criteria)가 필요하다. `--e2e-strict` 미통과 시 blocker **유지**.

### 14.0 Staging EC2 실증 스냅샷 (2026-06-25)

Design Staging EC2 (`ip-10-10-101-169`, `~/neural/ns-open-design/deploy/teamver`)에서 실행·통과한 항목.

```bash
bash scripts/validate_deploy_env.sh --staging --rds          # ✓ preflight OK
bash scripts/smoke_design.sh --staging                       # ✓ 24 passed (cookie 없음) · od_storage=ok
bash scripts/check_storage_isolation.sh --staging            # ✓ 20~21 passed
bash scripts/check_sidecar_deps.sh --staging                 # ✓ 12 passed · main_be=ok (probe /api/v2/healthz)
bash scripts/verify_litestream_replica.sh --staging          # ✓ 3 passed · host awscli 없어 S3 ls skip
# Litestream 로그: snapshot written · write wal segment
# design-api deps: checks.od_storage=ok · checks.db=ok · main_be=ok

# cookie + post-deploy (Phase 1~8)
export TEAMVER_COOKIE='teamver_access_token=…'
bash scripts/run_post_deploy_track_a.sh --staging --rds --deps-only --smoke
# → smoke 32 passed (runtime-config·projects·bootstrap cookie 200)
# → check_storage_isolation 21/21 · verify_litestream (isolation 내장)

# strict E2E (Phase 9) — 2026-06-25 1차: 2 passed / 4 failed (스크립트 경로·loopback·DPRJ/id 혼동)
# 수정: run_staging_track_a_e2e.sh (/api/v1/auth/session · INTERNAL loopback · D-5b SQL DPRJ+daemon id · /access od id)
bash scripts/run_staging_track_a_e2e.sh --staging --require-core   # 재실행 ☐
bash scripts/run_post_deploy_track_a.sh --staging --rds --deps-only --smoke --e2e-strict  # 재실행 ☐
```

| # | 체크 | 자동화 | EC2 실증 |
|---|------|--------|----------|
| 1 | S3 workspace/user/project prefix 객체 생성 | ✅ `smoke_design.sh` + `check_storage_isolation.sh` + E2E S3 probe | 🟡 `od_storage=ok` · isolation pass · **`--require-core` `aws s3 ls` tenant ☐** |
| 2 | EC2 volume 삭제 후 S3+Litestream 복구 | 🟡 `restore_app_sqlite_from_s3.sh` runbook | ☐ restore drill 미실행 (`--dry-run`만 smoke 통과) |
| 3 | 사용자 A/B access 403 | ✅ `run_staging_track_a_e2e.sh` (`TEAMVER_COOKIE_USER_B`) | ☐ `TEAMVER_COOKIE_USER_B` 미설정 · strict isolation ☐ |
| 4 | design-api `GET /projects` workspace 필터 | ✅ E2E S-8b | 🟡 smoke `projects (cookie)→200` · **S-8b `?workspace_id=` strict ☐** |
| 5 | agent run 후 S3 sync-up | ✅ `smoke_design.sh` + `/api/health/storage` | ✅ loopback `mode=s3` · `ok=true` · deps `od_storage=ok` |
| 6 | sync-up 실패 알람·retry | 🟡 daemon marker + `print_cloudwatch_alarm_commands.sh` | ☐ CW `--apply` |
| 7 | scratch 80% 알람 | 🟡 `OD_SCRATCH_DISK_METRICS` + CW script | ☐ 인위 트리거 · CW `--apply` |
| 8 | FUSE mount 미사용 | ✅ `check_storage_isolation.sh` (Hybrid s3·scratch 경로) | ✅ isolation 20~21/21 |
| 9 | hosted external baseDir import 거부 | ✅ `check_sidecar_deps.sh` | ✅ `FOLDER_IMPORT_UNAVAILABLE` · `LINKED_DIRS_UNAVAILABLE` (12/12) |

**일괄 실행 (EC2):**

```bash
cd /opt/teamver-design/deploy/teamver
bash scripts/run_staging_phase0_activate.sh --from-terraform   # S3/RDS env merge
bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke --e2e
# 출시 증적 (strict — env/skip hard fail; e2e에 --require-core 전달):
bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke --e2e-strict
# E2E만 단독 (동일 strict):
bash scripts/run_staging_track_a_e2e.sh --staging --require-core
```

### 14.1 자동화 매핑 (loop 150·151·392~402)

수동 체크 → 자동화 스크립트 매핑. staging 점검은 `run_post_deploy_track_a.sh --staging --rds --smoke --e2e`, production 출시 증적은 `run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict`로 실행한다. strict 모드는 핵심 env/tool 누락과 DB·Drive·S3 skip을 hard fail 한다.

| 체크 | 자동화 스크립트 | 코드 | EC2 (2026-06-25) |
|------|----------------|------|------------------|
| S3 tenant prefix 객체 | `smoke_design.sh` + `check_storage_isolation.sh` + `run_staging_track_a_e2e.sh` (`TEAMVER_S3_BUCKET`) | ✅ | 🟡 `od_storage=ok` · isolation ✅ · strict `aws s3 ls` ☐ |
| Litestream live replica | `verify_litestream_replica.sh` + deploy Litestream hard gate | ✅ | ✅ container 3/3 · snapshot/WAL 로그 · host `aws s3 ls` skip |
| Litestream restore drill | `restore_app_sqlite_from_s3.sh` | ✅ | ☐ live restore 미실행 |
| 사용자 A/B access 403 | `run_staging_track_a_e2e.sh` | ✅ | ☐ `TEAMVER_COOKIE_USER_B` + strict ☐ |
| `GET /projects` workspace 필터 | `run_staging_track_a_e2e.sh` (S-8b) | ✅ | 🟡 smoke list 200 · S-8b strict ☐ |
| agent run 후 S3 sync-up | `smoke_design.sh` + `/api/health/storage` | ✅ | ✅ |
| sync-up 실패 알람 | `print_cloudwatch_alarm_commands.sh` (`od_s3_sync_up_failed`) | ✅ | ☐ apply |
| scratch 80% 알람 | `validate_deploy_env.sh` + CW alarm | ✅ | ☐ apply · 인위 트리거 |
| FUSE 미사용 | `check_storage_isolation.sh` | ✅ | ✅ |
| baseDir import 거부 | `check_sidecar_deps.sh` | ✅ | ✅ 12/12 |
| usage `run_id` 멱등 | `run_staging_track_a_e2e.sh` U-6 | ✅ | ☐ U-6a 403(공개 URL) 1차 실패 · **loopback 수정 후 재실행 ☐** |
| publish → `design_outputs` | `run_staging_track_a_e2e.sh` D-5/D-7 | ✅ | 🟡 D-5a publish 200 1회 · D-5b row 0 (DPRJ/id SQL을 DPRJ ref + daemon od id 동시 확인으로 보강 후 재실행 ☐) |
| Main BE M2M wiring | `check_main_be_design_wiring.sh --live` | ✅ | 🟡 loopback M2M reserve 200 · Main BE `.env` 없어 A6 skip |
| Drive BFF browse (격리 무관·G7) | `run_staging_track_a_e2e.sh` D-B1/D-B2/D-B3 | ✅ | ☐ session workspace 파싱 실패 1차 · 스크립트 수정 후 재실행 ☐ |

미커버 (수동 유지): EC2 volume 의도적 손상 복구, scratch 80% 인위 트리거.  
**다음 ops:** `git pull` → `run_staging_track_a_e2e.sh --staging --require-core` (또는 `run_post_deploy … --e2e-strict`) 재실행 → §14 #1·#3·#4·14.1 usage/publish/S3/Drive 행 ✅.

---

## 15. 일정 감 · 병렬

| Phase | 기간 | 코드 | EC2 ops (Prod blocker) |
|-------|------|------|------------------------|
| 0 인프라 | ~1주 | ✅ | 🟡 `od_storage=ok` **✅** · CW alarm apply ☐ |
| 1 ProjectStorage + Materializing | ~2~3주 | ✅ (P1-4 defer) | 🟡 sync-up EC2 **✅** |
| 2 Litestream | ~1주 | ✅ | 🟡 live replica **✅** · restore drill ☐ |
| 3 registry + isolation | ~2주 | ✅ | 🟡 `--e2e-strict` ☐ |
| 4 Drive (G7) | ~1~2주 | 🟡 | 🟡 |

**Phase 1 ∥ Phase 3** 병렬. **0 → (1+3) → 2 → §14 EC2 strict → prod**.

---

## 16. Track A/B 재정의 (2026-06-15 결정)

| Track | 범위 |
|-------|------|
| **Track A (출시)** | SSO · nginx · **Phase 0~3** · usage M2M · Drive publish v1 (G7) |
| **Track B (출시 후)** | job queue · multi-replica · Postgres DaemonDb · full Drive browser/import handoff |

자세한 번호: [04](./04_구현_우선순위.md)

---

## 17. 미결정 · 출시 후

| 항목 | 시점 |
|------|------|
| tenant별 app-config / memory S3화 | Track B |
| 동일 project concurrent run queue | Track B |
| OD `DaemonDb` Postgres | upstream Phase 5 |
| workspace quota (S3 bytes / project count) | prod+1 |
| `@aws-sdk/client-s3` multipart | P1 이후 필요 시 |

---

## TODO (후속 작업)

**갱신:** 2026-06-25. **Prod blocker = EC2 ops 실증.** 중앙 SSOT — [04 §TODO](./04_구현_우선순위.md#todo-후속-작업).

### P0 — EC2 ops (출시 게이트)

| | 작업 | ID |
|---|------|-----|
| ☐ | staging EC2 IAM instance profile + `run_staging_phase0_activate.sh --from-terraform` | O-2 |
| ✅ | `checks.od_storage=ok` (2026-06-25 — `check_storage_isolation.sh` §deps) | O-2 |
| ✅ | `bash scripts/check_sidecar_deps.sh --staging` 12/12 (`main_be=ok`) | O-2 |
| ✅ | `bash scripts/check_storage_isolation.sh --staging` 21/21 pass | O-2 |
| 🟡 | `bash scripts/check_registry_s3_drift.sh --staging` — drift 가시화 ✅ · backfill ☐ | O-2 |
| 🟡 | `run_post_deploy_track_a.sh --deps-only --smoke` Phase 1~8 ✅ · **`--e2e-strict` Phase 9 ☐** (E2E 스크립트 수정 후 재실행) | O-3 |
| 🟡 | Litestream live replica ✅ (`verify_litestream_replica.sh` · snapshot 로그) · **`restore_app_sqlite_from_s3.sh` drill ☐** | P2-1 |
| ☐ | `print_cloudwatch_alarm_commands.sh --staging --apply` (sync-up · scratch · usage 5xx) | P0-6/P1-10 |
| ☐ | EC2 `awscli` 설치 → `verify_litestream_replica.sh` S3 ls probe까지 ✓ (선택) | P2-1 |

### P1↓ — 코드 defer (출시 blocker 아님)

| | 작업 | 비고 |
|---|------|------|
| ☐ | `projects.ts` → `ProjectStorage` 전면 wiring | upstream 충돌 최소화 — lazy materialize로 출시 경로 커버 중 |
| ☐ | §13.1 RDS↔S3 backfill · registry sync retry · idle evict tenant guard · CW markers | [§13.1](#131-rds--s3-후속-작업-2026-06-25) |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-25 | **§13.1 RDS↔S3 후속** — run-end evict 가드(`scratch-evict-policy`) · `check_registry_s3_drift.sh` · `od_registry_scratch_sync_failed` · 16 §5.4/§10 정합 · backfill/retry/CW는 §13.1 잔여 |
| 2026-06-25 | **§14 EC2 실증 2차** — sidecar 12/12 · smoke cookie 32/32 · #9 baseDir ✅ · #4 🟡 · E2E 1차 실패·스크립트 수정·재실행 ☐ |
| 2026-06-25 | **§14 EC2 실증 반영** — staging `check_storage_isolation` 21/21 · `od_storage=ok` · Litestream snapshot/WAL · §14.0 스냅샷 표 · G1/G2/P0-4/P2-1/TODO 부분 ✅ |
| 2026-06-25 | **정합성 2차** — IAM `litestream/*`·`sqlite-backups/*` · E2E strict=`run_post_deploy --e2e-strict`/`--require-core` · access `{od_project_id}` · embed list fail-closed · usage BFF/M2M · Track B Drive 범위 수정 · env `OD_S3_PREFIX` vs tenant prefix |
| 2026-06-25 | **코드·문서 정합** — §3 `design_outputs`·publish·Drive BFF·3 RDS 테이블; hosted access(P3-6) 문구 |
| 2026-06-25 | **문서 최신화** — G1~G7·Phase 0~4 진행 표 코드/EC2 분리; loop 392~402 반영; §14 체크리스트 자동화/EC2 열; TODO [04 O-2/O-3](./04_구현_우선순위.md) 정렬 |
| 2026-06-22 | [20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) — 로컬 scratch+S3, Litestream, 용량 SSOT |
| 2026-06-23 | hosted DB 내구성 hard gate — staging/production deploy가 Litestream을 항상 시작하고 running 실패 시 중단; replica bucket/region 누락·프로젝트 bucket 불일치 preflight 차단 |
| 2026-06-22 | §8.2 EC2 **root + od-data** 2볼륨 정리 — [07 §3.5](./07_VM_배포_인프라.md); 용량 표 Staging 30 / Prod 100 GiB (od-data) |
| 2026-06-22 | production strict E2E gate — `print_production_track_a_e2e_env.sh` + `--e2e-strict`; auth/usage DB/Drive publish/S3 object 검증의 skip-only 성공 차단 |
| 2026-06-19 | Production Phase 0 helper — `print/apply/run_production_phase0_activate.sh` 로 prod 전용 RDS+S3 env 병합·dry-run·preflight 제공, fixture 3종 Track A runner 연결 |
| 2026-06-19 | Track A E2E S3 tenant object probe — `TEAMVER_S3_BUCKET` 설정 시 `/access` S3 prefix header + `aws s3 ls` 로 tenant prefix 객체 존재 검증, fixture/env helper 갱신 |
| 2026-06-19 | S3 sync hard-fail review fix — soft-deleted reactivation / insert-race reactivation 경로도 sync 실패 시 명시 rollback 하도록 보강, 2개 회귀 테스트 추가 |
| 2026-06-19 | registry create S3 sync hard-fail — `OD_PROJECT_STORAGE=s3` 에서 daemon `scratch/sync-up` 실패 시 design-api create rollback + 502, Track A runner에 daemon S3 startup test 포함 |
| 2026-06-22 | hosted tenant fail-closed — registry list/access 장애 시 daemon project 노출 차단, legacy 전체 upsert 기본 off, managed S3 identity/prefix 누락 시 flat remote fallback 금지 |
| 2026-06-23 | hosted project create 원자성 — registry upsert 실패 시 create/import/share 성공 반환 금지 + daemon project rollback |
| 2026-06-19 | S3 init fail-fast — daemon S3 backend 초기화 실패 시 scratch-only fallback 기본 차단, `od_s3_storage_init_failed` 마커, `OD_S3_ALLOW_SCRATCH_FALLBACK=1` staging/prod 배포 가드 실패 처리 |
| 2026-06-19 | storage smoke/prod env 출시 게이트 hardening — staging/production smoke storage hard-fail 기본 on, post-deploy smoke 동일 적용, production env hard guard(LLM key·정적 AWS key·staging token) 추가. 남음: EC2 staging `checks.od_storage=ok` 실증 |
| 2026-06-18 | staging smoke 결과 반영 — RDS registry tables OK, S3 storage probe `checks.od_storage=degraded`; public daemon `/api/health/storage` 302는 nginx auth gate로 분류 |
| 2026-06-15 | §7~17 — FUSE vs Hybrid, MaterializingStorage, 격리 흐름, IAM, 장애·마이그레이션 |
| 2026-06-15 | 초안 — volume-only prod blocker, Phase 0~4, 진행 표 |

# DaemonDb (Track B5) — RDS 구조 · plugins 후속 · staging 검증

**상태:** B5.1–B5.9 구현 완료 (2026-07-09). plugins runtime 이중쓰기는 **후속 단계**로 보류.

---

## 1. RDS — 별도 인스턴스가 아니라 기존 RDS에 database 추가

**결론: staging·production 모두 “기존 Design RDS 1대 + database 1개 추가” 방식이다. DaemonDb 전용 RDS(`aws_db_instance` 추가)는 없다.**

| 환경 | RDS **인스턴스** (1대) | design-api database | DaemonDb database | 생성 방법 |
|------|------------------------|---------------------|-------------------|-----------|
| **Staging** | `teamver-staging-postgres` (Teamver staging platform BE와 **동일 인스턴스**) | `teamver_design_staging` | `teamver_design_daemon_staging` | 각각 `CREATE DATABASE` 1회 — `rds_create_database_sql` / `rds_create_daemon_database_sql` |
| **Production** | `teamver-design-prod-postgres` (Design 전용 1대) | `teamver_design_production` | `teamver_design_daemon_production` | design-api: Terraform `aws_db_instance.db_name`으로 시드 · DaemonDb: `rds_create_daemon_database_sql` 1회 |

Terraform 근거:

- `terraform/services/teamver-design/outputs.tf` — `rds_create_daemon_database_sql` = `CREATE DATABASE ${daemon_db_name} OWNER ${postgres_db_user};`
- `variables.tf` — `daemon_db_name` 설명: “Always a separate **database** on the **same RDS instance** as design-api”
- `staging.terraform.tfvars` / `prod.terraform.tfvars` — `daemon_db_name`만 정의, **추가 `aws_db_instance` 리소스 없음**

테이블 DDL은 Terraform이 아니라 **daemon 부팅** (`OD_DAEMON_DB=postgres` → `migratePostgresDaemonSchema`, schema v1–v7)이 담당한다.

앱 env (daemon):

```env
OD_DAEMON_DB=postgres
OD_PG_HOST=<terraform output postgres_host>
OD_PG_PORT=5432
OD_PG_DATABASE=<terraform output -raw daemon_db_name>
OD_PG_USER=<terraform output postgres_username>
OD_PG_PASSWORD=<RDS master password>
OD_PG_SSL_MODE=require
```

상세 Runbook: [39_4_배포_Terraform_운영_Runbook.md](./39_4_배포_Terraform_운영_Runbook.md), devops [DATABASE.md](../../ns-teamver-devops/terraform/services/teamver-design/docs/DATABASE.md).

---

## 2. plugins runtime 이중쓰기 — 후속 단계 (지금 하지 않음)

### 2.1 B5.6에서 이미 한 것

- Postgres schema **v6**: `installed_plugins`, `plugin_marketplaces`, `applied_plugin_snapshots`
- CLI `migrate-sqlite-to-postgres` — 위 3테이블 sqlite → pg **일회성** 이전

### 2.2 “runtime 이중쓰기”가 의미하는 것

daemon 런타임에서 플러그인 CRUD가 여전히 **SQLite만** 쓰는 경로에 Postgres **async 미러**(또는 read-aside 캐시)를 붙이는 작업.

| 테이블 | 주요 코드 | 데이터 성격 |
|--------|-----------|-------------|
| `installed_plugins` | `plugins/registry.ts`, `installer.ts`, `bundled.ts` | 설치 메타 + **`fs_path` (노드 로컬 디스크)** |
| `plugin_marketplaces` | `plugins/marketplaces.ts` | daemon 전역 마켓플레이스 설정 |
| `applied_plugin_snapshots` | `plugins/snapshots.ts`, `resolve-snapshot.ts`, `apply.ts` | 프로젝트/대화에 적용된 스냅샷 메타 |

### 2.3 지금 보류하는 이유

1. **파일과 메타 분리** — `installed_plugins.fs_path`는 `<OD_DATA_DIR>/plugins/` 등 **EC2 로컬**. Postgres에 메타만 옮겨도 다른 노드에 **플러그인 바이트**가 없으면 실행 불가.
2. **bundled 플러그인** — 배포 이미지에 포함, 부팅 시 양 노드 동일 (`bundled.ts`). 커뮤니티 deck·템플릿 preview 등 **1차 staging 핵심 경로**는 이미 커버.
3. **sticky routing** — apply/snapshot은 대부분 **projectId hash → 동일 노드**에서만 발생.
4. **ROI** — conversations/messages/tabs/deployments/agent_sessions/routine claim 등 **멀티노드 필수 메타**는 B5.1–B5.9에서 완료. plugins는 페일오버 edge case.

### 2.4 나중에 할 때의 권장 순서

| 단계 | 작업 | 전제 |
|------|------|------|
| **P1** | `applied_plugin_snapshots` runtime — create/link read/write + `projects.applied_plugin_snapshot_id` pg 동기화 | staging Postgres 검증 후, 페일오버 시 snapshot pin 불일치가 **실측**될 때 |
| **P2** | `plugin_marketplaces` runtime — daemon 전역 설정 중앙화 | ops가 노드마다 marketplace 추가를 원할 때 |
| **P3** | `installed_plugins` + **플러그인 파일 SSOT** (S3 또는 공유 볼륨) | user install을 **노드 간 공유**해야 할 때 — **DB만으로는 불충분** |
| **P4** | `run_devloop_iterations`, `genui_surfaces`, `skill_plugin_candidates` (schema v6+ 확장) | in-memory run / candidate cache 정합성 요구 시 |

구현 패턴(참고): B5.7 `media_tasks` — sqlite 유지 + `schedulePostgresWrite` 미러. 또는 B5.3 `preview_comments` — cache-aside + async pg.

### 2.5 plugins 후속 시 수정 대상 파일 (체크리스트)

- `plugins/registry.ts` — `upsertInstalledPlugin`, `listInstalledPlugins`
- `plugins/marketplaces.ts` — CRUD
- `plugins/snapshots.ts` — `createSnapshot`, `linkSnapshotToProject`, `linkSnapshotToConversation`
- `plugins/resolve-snapshot.ts`, `plugins/apply.ts`
- `daemon-db-postgres-core.ts` — pg CRUD (v6 테이블, 아직 runtime 함수 없음)
- `daemon-db-entity-cache.ts` — 필요 시 snapshot/plugin 캐시
- `migrate-sqlite-to-postgres.ts` — 이미 v6 3테이블 포함

---

## 3. staging 검증 체크리스트 (다음 우선 작업)

DaemonDb를 켜기 **전**:

1. `terraform output -raw rds_create_daemon_database_sql` 실행 (staging RDS, master 계정)
2. EC2 `.env.staging`에 `OD_DAEMON_DB=postgres`, `OD_PG_*` 설정 (`daemon_db_name` SSOT)
3. (선택) 기존 sqlite 데이터 이전: `pnpm --filter @open-design/daemon run migrate:sqlite-to-postgres -- --sqlite /path/to/app.sqlite`

켠 **후** (2대 sticky):

| # | 시나리오 | 기대 |
|---|----------|------|
| 1 | 프로젝트 A에서 대화·메시지 | node-1 warm 후 node-2에서 동일 project open 시 대화 목록·메시지 일치 |
| 2 | tabs 저장 | 양 노드 동일 tabs JSON |
| 3 | preview comment | conversation scope 목록 일치 |
| 4 | deployment upsert | 목록·getByScope 일치 |
| 5 | scheduled routine | 동일 slot 1회만 실행 (Postgres claim) |
| 6 | agent session resume | 노드 편향 후에도 session_id 유지 |
| 7 | daemon 재시작 | `migratePostgresDaemonSchema` idempotent, advisory lock 경합 없음 |

---

## 4. Postgres 모드 알려진 한계 (plugins 제외)

| 항목 | 상태 | 비고 |
|------|------|------|
| `listProjects` / standalone·daemon·embed 목록 | **B5.11–B5.12** daemon PG read + registry filter (embed) | registry = workspace access gate |
| routines read | **B5.12 PG read** + boot sqlite warm (scheduler) | `GET /api/routines*` cross-node |
| media_tasks read | **B5.12 PG read** + boot sqlite warm (hydrate) | `GET /api/projects/:id/media/tasks` cross-node |
| plugins 3테이블 | schema+CLI만 | §2 참고 |

---

## 5. B5.10 코드 리뷰 후 수정 (2026-07-09)

| 이슈 | 조치 |
|------|------|
| `insertConversation` 후 conversation 캐시 cold → `upsertMessage`가 title NULL 덮어씀 | `upsertCachedConversation`으로 즉시 캐시 merge |
| `upsertMessage` pgUpdateConversation | conversation 캐시 hit 일 때만 conversation row 갱신 |
| 스트리밍 `appendMessage*Event` Postgres 미반영 | 캐시 갱신 + async `pgUpsertMessage` |
| `tryClaimScheduledRoutineRunAsync` PG claim 성공 후 sqlite mirror 실패 → null | synthetic run row 반환 |
| `pgUpdateProject` / migrate `applied_plugin_snapshot_id` 누락 | UPDATE·CLI 이전에 컬럼 추가 |
| `reconcileMediaTasksOnBoot` Postgres 전역 interrupted | 부팅 시 pg reconcile **스킵** (노드 간 간섭 방지) |

---

## 6. B5.11 `listProjects` Postgres read (2026-07-09)

| 항목 | 내용 |
|------|------|
| API | `GET /api/projects`, `/api/projects/recent`, project-locations unregister |
| PG core | `pgListProjects`, `pgListProjectsPage` (커서 `(updated_at DESC, id DESC)`) |
| Facade | `listProjectsAsync`, `listProjectsPageAsync` — postgres 분기 |
| Cache merge | PG row + in-process cache 병합 (async write 직후 목록 누락 방지) |
| Delete tombstone | `deleteCachedProject` → pending PG delete 동안 목록에서 제외 |
| Embed | registry SSOT 유지 — embed FE 변경 없음 |

---

## 7. B5.12 embed list · routines · media PG read (2026-07-09)

| 항목 | 내용 |
|------|------|
| Embed list | `listProjects*` / `listRecentProjects` → daemon `GET /api/projects*` (PG) + `filterProjectsByTeamverRegistryIfNeeded` |
| Routines API | `listRoutinesAsync`, `getRoutineAsync`, `listRoutineRunsAsync`, … — postgres 분기 |
| Routines boot | `warmRoutinesSqliteFromPostgres` — scheduler `RoutineService.list()` sqlite mirror |
| Media API | `listMediaTasksByProjectAsync`, `getMediaTaskAsync` — postgres 분기 |
| Media boot | `warmRecentMediaTasksSqliteFromPostgres` — in-memory task hydrate |

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 — RDS database-add 확인, plugins 후속 보류 rationale, staging 검증 체크리스트 |
| 2026-07-09 | B5.10 리뷰 수정 항목 §5 추가 |
| 2026-07-09 | B5.11 `listProjects` postgres read + cache merge §6 |
| 2026-07-09 | B5.12 embed list · routines · media PG read §7 |

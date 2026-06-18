# Design — 저장소·격리 출시 게이트

**Prod 공개 출시 전 필수.** volume-only Track A는 **용량·백업·테넌트 격리** 측면에서 출시 blocker이다.  
**개발 SSOT:** 본 문서 · [04 구현 우선순위](./04_구현_우선순위.md) · **진행 갱신:** [00 구현 내역](./00_구현_내역_누적.md)

**관련:** [03 키·Drive·DB](./03_키_저장소_Drive_DB.md) · [07 VM 배포·인프라](./07_VM_배포_인프라.md) · [02 design-app ↔ daemon](./02_design-app_daemon_연동.md)

---

## 한 줄 결론

> **Prod 오픈 전에 S3(프로젝트 SSOT) + 메타 내구성(Litestream) + design-api registry(테넌트 격리)를 완료한다.**  
> EBS volume은 **실행 scratch/cache** 만 허용; 사용자 데이터 SSOT로 쓰지 않는다.

---

## 1. 왜 blocker인가

현재 Track A는 nginx **로그인 게이트**까지 Teamver이고, OD daemon 내부는 **단일 `OD_DATA_DIR` + 단일 `app.sqlite` + 단일 `OD_API_TOKEN`** 이다.

| 리스크 | volume-only 현재 | Prod 허용? |
|--------|------------------|------------|
| 데이터 유실 | EBS snapshot runbook 없음 | ❌ |
| 용량 | Staging 30GB / Prod 50GB, quota 없음 | ❌ |
| 복구 (RPO/RTO) | RDS는 usage만; OD 본문·메타는 volume | ❌ |
| HA / scale-out | EC2 1대, SQLite 단일 writer | △ (출시 후) |
| **테넌트 격리** | 사용자 A/B가 **같은 daemon·project namespace** | ❌ |

OD API는 `OD_API_TOKEN`(nginx 공유)만 검증하고 **프로젝트 소유자(user/workspace)를 검증하지 않는다.**  
SaaS 공개 출시에는 **저장소 내구성 + 격리** 둘 다 필수다.

### 현재 저장 위치 (As-Is)

| 데이터 | 저장 | 원격 내구? |
|--------|------|------------|
| 프로젝트 파일 | `<OD_DATA_DIR>/projects/<id>/` (EBS volume) | ❌ |
| 채팅·프로젝트 메타 | `<OD_DATA_DIR>/app.sqlite` | ❌ |
| 설정·플러그인·memory | `<OD_DATA_DIR>/` | ❌ |
| 토큰 usage | RDS `teamver_design_*` | ✅ |
| SSO·권한 | Main BE | ✅ |

---

## 2. 출시 Acceptance Criteria

아래 **Phase 0~3 전부 ✅** 전에는 **Production 공개 오픈 금지**.

| # | 기준 | Phase |
|---|------|-------|
| G1 | 프로젝트 파일 SSOT → **S3** (IAM instance profile, lifecycle) | 0, 1 |
| G2 | `app.sqlite` **Litestream → S3** (또는 동등 PITR) | 2 |
| G3 | **design-api `design_projects`** registry + workspace/user 격리 API | 3 |
| G4 | OD web — 프로젝트 list/create → **design-api 경유** | 3 |
| G5 | daemon — project 접근 시 **design-api access 검증** | 3 |
| G6 | volume = scratch only (용량 알람·백업 runbook) | 0, 7 |
| G7 | (권장) 완료 산출물 → **Teamver Drive** | 4 |

**하지 않아도 되는 것 (출시 후):** OD `DaemonDb` Postgres 전체 이전, daemon multi-replica, job queue, circuit breaker.

---

## 3. 목표 아키텍처 (Hybrid SSOT)

Agent CLI는 **로컬 CWD**가 필요하므로 pure S3만으로는 불가. **영속=원격, 실행=로컬 scratch**.

```text
┌──────── Browser (OD web) ─────────────────────────┐
│  session/bootstrap  → design-api                  │
│  project list/create → design-api  (신규)         │
│  chat/run/export    → daemon (기존)               │
└───────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   design-api (RDS)              open-design daemon
   · design_projects            · run scratch (ephemeral)
   · ai_model_token_usages      · MaterializingProjectStorage
         │                              │
         │                              ├─ read/write → S3 (SSOT)
         │                              └─ app.sqlite → Litestream → S3
         ▼
   S3  teamver-design-{env}-data
       {workspace_id}/{user_id}/{project_id}/...
```

| 레이어 | SSOT | 비고 |
|--------|------|------|
| 편집 중 프로젝트 파일 | **S3** | `OD_PROJECT_STORAGE=s3` |
| 채팅·메타 (단기) | `app.sqlite` + **Litestream** | Postgres DaemonDb는 출시 후 |
| 프로젝트 registry·권한 | **design-api RDS** | `design_projects` |
| 사용자-facing 최종 파일 | **Teamver Drive** (Phase 4) | Publish 모델 |

---

## 4. 작업 우선순위 · 진행 상황

**범례:** ✅ 완료 · 🟡 부분(기질만/미연결) · ☐ 미착수

### Phase 0 — 인프라 (약 1주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P0-1 | S3 bucket `teamver-design-{staging,prod}-data` | `ns-teamver-devops` | ✅ |
| P0-2 | EC2 IAM instance profile — bucket prefix R/W | `ns-teamver-devops` | ✅ |
| P0-3 | S3 lifecycle + **Versioning** (overwrite 복구) | `ns-teamver-devops` | ✅ |
| P0-4 | `.env.*` — `OD_PROJECT_STORAGE=s3`, `OD_S3_*` | `deploy/teamver` | 🟡 env·compose ✅ · staging smoke `checks.od_storage=degraded` |
| P0-5 | Litestream sidecar / config (compose) | `deploy/teamver` | 🟡 config·profile ✅ · prod 검증 ☐ |
| P0-6 | volume → scratch 전용 (용량·알람 runbook) | [07](./07_VM_배포_인프라.md) + `deploy/teamver/scripts` | 🟡 alarm command ✅ · EC2 apply ☐ |
| P0-7 | RDS `teamver_design_*` database | Terraform + SQL | ✅ |

### Phase 1 — OD ProjectStorage 연결 (약 2~3주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P1-1 | `ProjectStorage` interface + `LocalProjectStorage` | `apps/daemon` | ✅ |
| P1-2 | `S3ProjectStorage` (SigV4) | `apps/daemon` | ✅ |
| P1-3 | `resolveProjectStorage()` + unit tests | `apps/daemon` | ✅ |
| P1-4 | `projects.ts` → `ProjectStorage` 경유 리팩터 | `apps/daemon` | 🟡 lazy file+export/archive+**media/finalize/deploy/plugins/design-system** materialize ✅ · projects.ts 전면 ☐ |
| P1-5 | `server.ts` / routes — storage 주입 | `apps/daemon` | 🟡 PROJECTS_DIR scratch + materialization ✅ |
| P1-6 | **`MaterializingProjectStorage`** — run 전 sync-down / 후 sync-up | `apps/daemon` | ✅ |
| P1-7 | `startChatRun` 전후 materialization hook | `apps/daemon` | ✅ |
| P1-8 | Teamver compose/env S3 연동 검증 (staging) | `deploy/teamver` | 🟡 validate·smoke·`print_staging_s3_env.sh`·`apply_staging_s3_env.sh` ✅ · EC2 smoke `od_storage=degraded` 원인 확인 필요 |
| P1-9 | MinIO/localstack integration test | `apps/daemon` | 🟡 harness + compose `--profile minio` ✅ · ops fixture `test_run_s3_integration_test.sh` ✅ · EC2 ☐ |
| P1-10 | sync-up 실패 알람·재시도 (run 종료 후) | `apps/daemon` + ops | 🟡 retry 3x + lazy + **run-end** `od_s3_sync_up_failed` JSON 마커 ✅ · CloudWatch apply ☐ |

**근거 코드:** `apps/daemon/src/storage/` — run hook + lazy file-route materialize (`OD_PROJECT_STORAGE=s3`).

### Phase 2 — SQLite 내구성 (약 1주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P2-1 | Litestream → S3 replica config | `deploy/teamver` | 🟡 config·profile ✅ |
| P2-2 | restore runbook (snapshot 시점 → compose up) | `deploy/teamver/docs` + `scripts/restore_app_sqlite_from_s3.sh` | ✅ Litestream + fallback snapshot 모드, `--apply`로 daemon 컨테이너 직접 적용, fixture `test_restore_app_sqlite_from_s3.sh` |
| P2-3 | (대안) `app.sqlite` → S3 fallback — Litestream 불가 시 | `deploy/teamver` | 🟡 manual fallback script ✅ · cron 미사용 |

### Phase 3 — 테넌트 격리 + design-api registry (약 2주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P3-1 | `design_projects` DDL + migration | `deploy/teamver/be` | ✅ |
| P3-2 | `POST /api/v1/projects` — registry 생성 | `deploy/teamver/be` | ✅ |
| P3-3 | `GET /api/v1/projects` — workspace + **owner** 필터 목록 | `deploy/teamver/be` | ✅ |
| P3-4 | `GET /api/v1/projects/{id}/access` — 204/403 | `deploy/teamver/be` | ✅ v1(owner) |
| P3-5 | OD web — list/create → design-api | `apps/web` | 🟡 create/import/delete sync ✅ · list filter ✅ · E2E ☐ |
| P3-6 | daemon middleware — project API access 검증 | `apps/daemon` | ✅ env-gated · E2E ☐ |
| P3-7 | S3 prefix `{workspace_id}/{user_id}/{project_id}/` | P0 + P3 | ✅ design-api SSOT + daemon tenant scope |
| P3-8 | `DELETE /api/v1/projects/{id}` — registry soft-delete + scratch evict + **tenant S3 purge** | `deploy/teamver/be` + daemon | ✅ soft-delete + `POST …/scratch/evict` → `onProjectRemoved` remote purge (`OD_S3_PURGE_ON_DELETE`, `od_s3_remote_purged`) · S3 lifecycle `scripts/s3_lifecycle_policy.sh` (sqlite-backups expire + multipart cleanup + 옵션 scratch evict, `--apply`/`--diff`) |
| P3-9 | access 검증 방식 확정 (daemon middleware vs nginx subrequest) | 설계 → 구현 | ✅ daemon middleware |

**P3-6 구현 메모:** `TEAMVER_DESIGN_API_URL`이 설정된 배포에서 daemon은 `/api/projects/:id/**` 요청 전에 design-api access endpoint를 호출한다. 목록/생성(`/api/projects`)은 web registry sync/filter 경로가 담당하므로 middleware 대상에서 제외한다. design-api 거부(403/404)는 daemon에서 `PROJECT_NOT_FOUND`로 반환해 cross-workspace project id 노출을 줄인다.

**스키마 (목표):**

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

**2026-06-16 구현(v1):**

- `deploy/teamver/be/app/routers/projects.py` — create/list/access API.
- `design_projects.s3_prefix`는 `{workspace_id}/{owner_user_id}/{od_project_id}/`.
- 접근 검증은 v1에서 workspace + owner user + active status 기준.
- nginx `/api/v1/projects` 보호 라우트는 staging/prod design-api에 반영.
- OD web daemon project create, folder/ZIP import, plugin-share project, host import response 성공 후 design-api registry best-effort 등록 반영.
- Teamver embed list는 registry 조회 성공 시 `od_project_id` 기준으로 daemon list를 필터 (BE list는 owner 스코프). 조회 실패 시 전환기 fallback으로 daemon list 유지.
- **smoke**: `scripts/smoke_design.sh --staging` (+ `/access`, `/outputs`, healthz tables).
- 남음: staging E2E (S3 객체·403·publish).

### Phase 4 — Publish → Teamver Drive (약 1~2주, G7)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P4-1 | export/finalize → Drive upload (`teamver-app-sdk`) | `deploy/teamver/be` | ✅ `PublishService` · Main BE presigned 3-step |
| P4-2 | `design_outputs` 테이블 + `GET /outputs` | `deploy/teamver/be` | ✅ `drive_folder_id` + `drive_shared_drive_id` |
| P4-3 | Main FE / Drive 연동 UX | `ns-teamver-fe-v2` + embed | 🟡 `?asset=` · Open in Drive menu ✅ · personal/team target picker 1차 ✅ · 전체 폴더 브라우저 ☐ |
| P4-4 | registry create → scratch sync-up (S3) | design-api + daemon | ✅ `POST …/scratch/sync-up` |

---

## 5. Phase별 env · 산출물

### S3 (daemon)

```bash
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-prod-data
OD_S3_REGION=ap-northeast-2
OD_S3_PREFIX=design/
OD_SCRATCH_DIR=/app/.od/scratch   # optional; default under OD_DATA_DIR
# IAM role preferred; fallback:
# OD_S3_ACCESS_KEY_ID=...
# OD_S3_SECRET_ACCESS_KEY=...
```

### Litestream (예시)

```yaml
# deploy/teamver/litestream.yml
dbs:
  - path: /data/app.sqlite
    replicas:
      - type: s3
        bucket: teamver-design-prod-data
        path: litestream/app.sqlite
        region: ap-northeast-2
```

### design-api (기존 + 신규)

| 변수 / DB | 용도 | 상태 |
|-----------|------|------|
| `POSTGRES_*` → `teamver_design_*` | usage + **design_projects** + **design_outputs** | usage·registry·publish ✅ · staging E2E ☐ |
| `TEAMVER_*` | Main BE bootstrap | ✅ |

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
4. 비-run API (preview 등) → S3 직접 또는 짧은 TTL cache (P1-4와 함께 확정)
```

**dirty 추적:** `RUN_ARTIFACT_RECONCILE_MTIME_GRACE_MS`, `projects.ts` run reconcile 재사용.

### 8.2 scratch 디스크

| 항목 | 권장 |
|------|------|
| 경로 | `$OD_SCRATCH_DIR/projects/` (기본 `$OD_DATA_DIR/scratch/projects/`) |
| EC2 EBS | **10~20GB** (project SSOT 아님) |
| 알람 | scratch 80% — [07](./07_VM_배포_인프라.md) |
| eviction | run 완료 후 project scratch 삭제 가능 (SSOT=S3) |

### 8.3 동시성 (v1)

| 시나리오 | v1 |
|----------|-----|
| 동일 project 동시 run | **금지** (409 또는 Track B queue) |
| workspace 내 다른 project | 허용 |
| sync-up | project 단위 in-process lock |

---

## 9. 테넌트 격리 — 요청 흐름 (Phase 3)

### 9.1 생성 · 목록

```text
POST design-api /api/v1/projects  → INSERT design_projects + s3_prefix
GET  design-api /api/v1/projects  → workspace 필터 (daemon /api/projects 목록 금지)
```

### 9.2 project API access (P3-9)

**권장:** daemon middleware → `GET design-api .../access` (204/403). nginx subrequest는 URI에서 project id 추출이 어려워 **차선**.

### 9.3 S3 prefix

```text
s3://teamver-design-{env}-data/design/ws_{ws}/user_{uid}/proj_{od_project_id}/...
```

`design_projects.s3_prefix` = registry SSOT.

### 9.4 design-api API (목표)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/projects` | registry + s3_prefix |
| GET | `/api/v1/projects` | workspace 목록 |
| GET | `/api/v1/projects/{id}/access` | daemon 검증 |
| DELETE | `/api/v1/projects/{id}` | soft-delete (P3-8) |

---

## 10. 데이터 경계 — S3 vs 로컬

| 데이터 | Prod SSOT | 로컬 (daemon) |
|--------|-----------|---------------|
| `projects/` 파일 | **S3** | scratch |
| `app.sqlite` | **Litestream → S3** | 로컬 disk (FUSE 금지) |
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
| `run_post_deploy_track_a.sh` | EC2 validate → compose → sidecar deps → smoke / `--seed-verify`(A8) |
| `print_cloudwatch_alarm_commands.sh` | sync-up · **usage 5xx** · scratch alarm (`--apply` 직접 실행 가능) |

상세 runbook: [`deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md`](../deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md) §로컬 vs Staging S3.

---

## 11. S3 · IAM · 버킷 (Phase 0)

| 항목 | Staging | Production |
|------|---------|------------|
| Bucket | `teamver-design-staging-data` | `teamver-design-prod-data` |
| Versioning | Enabled | Enabled |
| Encryption | SSE-S3 or KMS | 동일 |
| Public access | Block all | Block all |

EC2 IAM: `ListBucket` on `design/*` prefix + `Get/Put/DeleteObject` on `.../design/*`.  
design-api hot path는 RDS; boto3 listing은 admin/집계만. Drive는 [03](./03_키_저장소_Drive_DB.md) Publish.

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
| 프로젝트 파일 | 0 (PUT 후) |
| app.sqlite | ≤ 1 min (Litestream) |
| design_projects | RDS PITR |

---

## 13. volume → S3 마이그레이션

1. maintenance — run 중단  
2. `s3 sync` projects/ (registry backfill)  
3. Litestream 초기 upload  
4. `OD_PROJECT_STORAGE=s3`  
5. E2E (§14)  
6. 구 volume snapshot 7d 보관  

---

## 14. 검증 체크리스트 (Staging E2E)

```text
[ ] S3 workspace/user/project prefix 객체 생성
[ ] EC2 volume 삭제 후 S3+Litestream 복구
[ ] 사용자 A/B access 403
[ ] design-api GET /projects workspace 필터
[ ] agent run 후 S3 sync-up
[ ] sync-up 실패 알람·retry
[ ] scratch 80% 알람
[ ] FUSE mount 미사용
[ ] hosted에서 external baseDir import 거부(또는 문서화된 예외)
```

---

## 15. 일정 감 · 병렬

| Phase | 기간 | Prod blocker |
|-------|------|--------------|
| 0 인프라 | ~1주 | ✅ |
| 1 ProjectStorage + Materializing | ~2~3주 | ✅ |
| 2 Litestream | ~1주 | ✅ |
| 3 registry + isolation | ~2주 | ✅ |
| 4 Drive | ~1~2주 | 권장 (G7) |

**Phase 1 ∥ Phase 3** 병렬. **0 → (1+3) → 2 → §14 → prod**.

---

## 16. Track A/B 재정의 (2026-06-15 결정)

| Track | 범위 |
|-------|------|
| **Track A (출시)** | SSO · nginx · **Phase 0~3** · usage M2M |
| **Track B (출시 후)** | job queue · multi-replica · Drive · Postgres DaemonDb |

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

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-18 | staging smoke 결과 반영 — RDS registry tables OK, S3 storage probe `checks.od_storage=degraded`; public daemon `/api/health/storage` 302는 nginx auth gate로 분류 |
| 2026-06-15 | §7~17 — FUSE vs Hybrid, MaterializingStorage, 격리 흐름, IAM, 장애·마이그레이션 |
| 2026-06-15 | 초안 — volume-only prod blocker, Phase 0~4, 진행 표 |

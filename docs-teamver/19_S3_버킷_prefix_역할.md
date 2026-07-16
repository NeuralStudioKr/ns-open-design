# Design — S3 버킷 prefix 역할 SSOT

**목적:** `teamver-design-{staging,prod}-data` 버킷 안 **prefix(콘솔 “폴더”)별 역할·저장 내용·생성 주체**를 한 문서로 고정한다.  
**언제 올라가는지(sync-up 시점):** [16 S3 데이터 저장 시점](./16_S3_데이터_저장_시점_SSOT.md)  
**IAM·접근 권한:** [18 EC2 Instance Profile · S3](./18_EC2_IAM_Instance_Profile_S3_설정.md)  
**Hybrid 로컬+S3·용량:** [20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)  
**Terraform 버킷 생성:** `ns-teamver-devops/terraform/services/teamver-design/s3.tf`

---

## 0. 한 줄 결론

> S3에는 **실제 폴더가 없다**. Terraform은 **빈 버킷만** 만든다.  
> `design/`, `litestream/` 등 prefix는 **첫 객체 PUT 시 자동 생성**된다. **수동 mkdir 불필요.**

---

## 1. 버킷 (환경별 1개)

| 환경 | 버킷 이름 | `.env` 키 | Terraform |
|------|-----------|-----------|-----------|
| Staging | `teamver-design-staging-data` | `OD_S3_BUCKET`, `LITESTREAM_BUCKET` | `aws_s3_bucket.project_data` |
| Production | `teamver-design-prod-data` | 동일 | 동일 (prod state) |

공통 설정 (Terraform apply 시):

- Versioning **Enabled**
- SSE-S3 (AES256)
- Public access **차단**
- Lifecycle (Terraform): `design/` 하위 noncurrent version 90일 만료, incomplete multipart 7일 중단

추가 lifecycle (`sqlite-backups/`, `design/_deleted/` 등)는 EC2에서 `scripts/s3_lifecycle_policy.sh --apply` 로 **별도 적용** ([§5](#5-lifecycle-규칙-요약)).

---

## 2. 전체 트리 (논리 구조)

콘솔에서 “폴더”처럼 보이는 것은 **객체 키의 `/` 구분 prefix**이다.

```text
s3://teamver-design-{staging|prod}-data/
│
├── design/                                    ← OD_S3_PREFIX (프로젝트 SSOT 루트)
│   ├── ws_<workspaceId>/
│   │   └── user_<ownerUserId>/
│   │       └── proj_<odProjectId>/            ← tenant prefix (RDS design_projects.s3_prefix)
│   │           ├── index.html
│   │           ├── assets/…
│   │           ├── .od/…                      ← OD 프로젝트 메타·산출물 (daemon)
│   │           └── … (export·upload 파일)
│   └── _deleted/                              ← lifecycle 만료 대상 (선택 규칙)
│
├── exports/                                   ← export offload presigned download cache
│   └── ws_<workspaceId>/
│       └── proj_<odProjectId>/
│           └── <export-cache-key>.<ext>
│
├── litestream/
│   └── app.sqlite                             ← Litestream replica (daemon SQLite)
│
└── sqlite-backups/
    ├── staging|production/
    │   ├── 20260622T120000Z/                  ← 수동 백업 번들
    │   │   ├── app.sqlite
    │   │   └── …
    │   └── LATEST.json                        ← 최신 백포인터
    └── …
```

**이 버킷에 없는 것 (다른 SSOT):**

| 데이터 | 실제 위치 |
|--------|-----------|
| 프로젝트 registry (제목, workspace, `s3_prefix`) | RDS `design_projects` |
| usage·output 메타 | RDS `ai_model_token_usages`, `design_outputs` |
| Publish 산출물 (사용자 Drive) | **Main BE Drive** (별도 S3 — Design project-data 버킷 아님) |
| Main BE 앱 데이터 | GCP Cloud SQL / Main BE 인프라 |

---

## 3. prefix별 상세

### 3.1 `design/` — 프로젝트 파일 SSOT 루트

| 항목 | 내용 |
|------|------|
| **역할** | Open Design **tenant 프로젝트 파일**의 원격 SSOT (`OD_PROJECT_STORAGE=s3`) |
| **env** | `OD_S3_PREFIX=design/` (terraform `project_data_s3_prefix`) |
| **쓰는 주체** | `open-design-daemon` — `MaterializingProjectStorage` sync-up |
| **읽는 주체** | 동일 daemon sync-down; design-api는 **경로 메타만** RDS에 보관 |
| **수동 생성** | ❌ — 첫 sync-up PUT 시 자동 |
| **버킷 비어 있음** | ✅ 정상 (아직 프로젝트 sync-up 없음) |

**하위 구조 (tenant prefix):**

```text
design/ws_<workspaceId>/user_<ownerUserId>/proj_<odProjectId>/
```

- **정의 SSOT:** `deploy/teamver/be/app/db/crud/design_project_crud.py` — `build_project_s3_prefix()`
- **RDS 컬럼:** `design_projects.s3_prefix` (프로젝트 생성 시 고정)
- **daemon 접근:** design-api `GET …/access` → `X-Teamver-S3-Prefix` 헤더 또는 registry identity

**대표 저장물 (예시, 전부 tenant prefix 아래):**

| 종류 | 예시 키 | 비고 |
|------|---------|------|
| 슬라이드·문서 HTML | `…/index.html` | agent/run·export |
| 업로드 첨부 | `…/assets/<ts>-file.png` | multer upload |
| OD 프로젝트 메타 | `…/.od/project.json` 등 | daemon 프로젝트 트리 |
| export 산출물 | `…/exports/…` | finalize/deploy 경로 (materialize) |
| 플러그인·디자인 시스템 산출 | run 중 scratch → sync-up | run 종료·lazy API 후 PUT |

**쓰기 흐름:** EC2 scratch (`OD_SCRATCH_DIR`) → **sync-up** → S3. 상세 시점은 [16 §5](./16_S3_데이터_저장_시점_SSOT.md#5-sync-up이-발생하는-정확한-시점-체크리스트).

**삭제:** registry soft-delete + `OD_S3_PURGE_ON_DELETE` 시 tenant prefix 객체 **DeleteObject** (purge).

---

### 3.2 `design/ws_…/user_…/proj_…/` — 테넌트 격리 단위

| 항목 | 내용 |
|------|------|
| **역할** | workspace + owner user + OD project ID 단위 **격리 네임스페이스** |
| **생성** | 프로젝트 create 후 **첫 sync-up**이 해당 prefix에 객체를 PUT할 때 |
| **IAM** | EC2 role — `design/*` List/Get/Put/Delete ([18 §3](./18_EC2_IAM_Instance_Profile_S3_설정.md)) |
| **검증** | E2E — `TEAMVER_S3_BUCKET` + `aws s3 ls` tenant prefix (`run_staging_track_a_e2e.sh`) |

세그먼트는 `sanitize_s3_path_segment()` 로 URL-safe 처리 (128자 제한, 특수문자 → `_`).

---

### 3.3 `exports/ws_…/proj_…/` — export offload presigned download

| 항목 | 내용 |
|------|------|
| **역할** | PDF/PPTX/HTML/ZIP 등 다운로드 결과물을 S3에 업로드하고 daemon ticket이 presigned GET으로 302 redirect하기 위한 export offload cache |
| **키** | `exports/ws_<workspaceId>/proj_<odProjectId>/<export-cache-key>.<ext>` |
| **설정** | `OD_EXPORT_OFFLOAD_ENABLED=1`, `OD_EXPORT_OFFLOAD_PREFIX=exports`; staging은 `OD_EXPORT_OFFLOAD_REQUIRED=1` |
| **생성** | `/api/projects/{id}/export/{format}` ticket 응답 생성 직전 S3 PUT |
| **만료** | Terraform lifecycle `expire-export-offload-cache` — current/noncurrent object 7일 만료 |
| **IAM** | EC2 role/static key — `exports/*` List/Get/Put/Delete ([18 §3](./18_EC2_IAM_Instance_Profile_S3_설정.md)) |
| **주의** | `OD_EXPORT_OFFLOAD_PREFIX=exports`와 key root `exports/`가 중복되어 `exports/exports/...`가 되면 안 된다. |

---

### 3.4 `design/_deleted/` — lifecycle 스크래치 잔여 (선택)

| 항목 | 내용 |
|------|------|
| **역할** | soft-delete·purge 과정에서 남은 **고아 scratch 객체** 만료 대상 |
| **생성** | 앱이 미리 폴더를 만들지 않음. 객체가 해당 prefix에 쓰이면 콘솔에 표시 |
| **lifecycle** | `s3_lifecycle_policy.sh` — `S3_LIFECYCLE_SCRATCH_PREFIX=_deleted` (기본), **14일** 만료 |
| **비활성** | `S3_LIFECYCLE_SCRATCH_PREFIX=""` → scratch expire rule 미생성 |

---

### 3.5 `litestream/` — daemon `app.sqlite` 복제

| 항목 | 내용 |
|------|------|
| **역할** | OD daemon **로컬 SQLite** (`app.sqlite`) 의 **연속 원격 복제** — 채팅·로컬 OD 메타 내구성 |
| **키** | `litestream/app.sqlite` (단일 replica 경로) |
| **설정** | `deploy/teamver/litestream.yml` — `path: litestream/app.sqlite` |
| **env** | `LITESTREAM_BUCKET` (= project-data 버킷), `LITESTREAM_REGION` |
| **기동** | `docker compose --profile litestream up -d` |
| **수동 생성** | ❌ — Litestream replicate 시작 시 자동 |
| **IAM** | role — `litestream/*` Get/Put/Delete/List (`ns-teamver-devops/.../teamver-design/s3.tf`) |
| **복구** | `scripts/restore_app_sqlite_from_s3.sh --litestream` |

**주의:** 프로젝트 HTML/asset SSOT가 **아님**. 프로젝트 파일은 `design/…/proj_…/` ([§3.1](#31-design--프로젝트-파일-ssot-루트)).

---

### 3.6 `sqlite-backups/` — 수동 SQLite 스냅샷 (fallback)

| 항목 | 내용 |
|------|------|
| **역할** | Litestream 장애·운영 DR 시 **수동** `app.sqlite` 번들 백업 |
| **키 패턴** | `sqlite-backups/<env>/<timestamp>/` + `LATEST.json` |
| **env** | `SQLITE_BACKUP_PREFIX=sqlite-backups` (기본) |
| **실행** | `scripts/backup_sqlite_to_s3.sh --staging|--production` (`--stop-daemon` 옵션) |
| **수동 생성** | 스크립트 실행 시에만 — **평상시 비어 있어도 정상** |
| **lifecycle** | `s3_lifecycle_policy.sh` — 기본 **30일** 만료 (`S3_LIFECYCLE_SQLITE_BACKUP_DAYS`) |
| **복구** | `restore_app_sqlite_from_s3.sh --from-snapshot` |

---

## 4. 수동으로 만들어야 하나?

| prefix / 경로 | 배포 전 수동 생성? | 첫 생성 주체 |
|---------------|-------------------|--------------|
| 버킷 자체 | ❌ (Terraform) | `teamver-design` apply |
| `design/` | ❌ | daemon sync-up |
| `design/ws_…/user_…/proj_…/` | ❌ | 프로젝트 create + sync-up |
| `exports/ws_…/proj_…/` | ❌ | export offload S3 PUT |
| `litestream/app.sqlite` | ❌ | Litestream sidecar |
| `sqlite-backups/…` | ❌ (선택) | `backup_sqlite_to_s3.sh` |
| `design/_deleted/` | ❌ | lifecycle 규칙만; 객체는 purge 잔여 시 |

**빈 버킷 smoke:** `checks.od_storage=degraded` 는 **객체 없음**일 때 실패할 수 있음 — tenant prefix에 객체가 생긴 뒤 재검증 ([09 §4 P0-4](./09_Design_저장소_격리_출시게이트.md)).

---

## 5. lifecycle 규칙 요약

| 규칙 ID | prefix | 적용 주체 | 기본 동작 |
|---------|--------|-----------|-----------|
| `expire-noncurrent-versions` | `design/` | **Terraform** | noncurrent version 90일 만료, multipart 7일 |
| `od-abort-incomplete-multipart` | `` (버킷 전체) | `s3_lifecycle_policy.sh` | incomplete multipart 7일 |
| `od-sqlite-backups-expire` | `sqlite-backups/` | 스크립트 | 30일 만료 |
| `od-scratch-evict-expire` | `design/_deleted/` | 스크립트 | 14일 만료 (prefix 비우면 비활성) |

적용:

```bash
cd deploy/teamver
bash scripts/s3_lifecycle_policy.sh --staging --diff    # 또는 --production
bash scripts/s3_lifecycle_policy.sh --production --apply
```

---

## 6. env · Terraform 매핑

| env 변수 | 버킷 내 prefix | 문서 |
|----------|------------------|------|
| `OD_S3_BUCKET` | 버킷 이름 | [07 §3](./07_VM_배포_인프라.md) |
| `OD_S3_PREFIX` | `design/` | 본 문서 §3.1 |
| `OD_S3_REGION` | 리전 | terraform `project_data_s3_region` |
| `LITESTREAM_BUCKET` | 동일 버킷 | §3.4 |
| `LITESTREAM_REGION` | 리전 | `litestream.yml` |
| `SQLITE_BACKUP_PREFIX` | `sqlite-backups` | §3.5 |

Terraform output:

```bash
cd ns-teamver-devops/terraform/services/teamver-design
terraform output project_data_bucket
terraform output -raw project_data_s3_prefix   # → design/
```

---

## 7. 현장 확인 명령

```bash
# 버킷·prefix 목록 (객체 없으면 출력 없음 — 정상)
aws s3 ls s3://teamver-design-staging-data/
aws s3 ls s3://teamver-design-staging-data/design/ --recursive | head

# Litestream replica 존재
aws s3 ls s3://teamver-design-prod-data/litestream/

# tenant prefix (design-api access 헤더 또는 RDS s3_prefix)
aws s3 ls s3://teamver-design-staging-data/design/ws_ws1/user_u1/proj_od1/ 
```

EC2에서 storage isolation:

```bash
bash deploy/teamver/scripts/check_storage_isolation.sh --staging
```

---

## 8. 관련 문서·코드

| 주제 | 위치 |
|------|------|
| sync-up **시점** | [16 S3 데이터 저장 시점](./16_S3_데이터_저장_시점_SSOT.md) |
| 출시 게이트 G1 (S3 SSOT) | [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) |
| IAM · IMDS | [18 Instance Profile](./18_EC2_IAM_Instance_Profile_S3_설정.md) |
| tenant prefix 빌드 | `deploy/teamver/be/app/db/crud/design_project_crud.py` |
| S3 PUT 구현 | `apps/daemon/src/storage/project-storage.ts` (`S3ProjectStorage`) |
| materialize | `apps/daemon/src/storage/materializing-project-storage.ts` |
| Litestream | `deploy/teamver/litestream.yml`, `docker-compose.yml` profile `litestream` |
| lifecycle 스크립트 | `deploy/teamver/scripts/s3_lifecycle_policy.sh` |
| 백업·복구 | `backup_sqlite_to_s3.sh`, `restore_app_sqlite_from_s3.sh` |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-22 | 초안 — 버킷·prefix 역할·자동 생성·lifecycle·env 매핑 SSOT |
| 2026-06-22 | [20 Hybrid 저장소](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) 교차 링크 |

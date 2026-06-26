# Teamver Apps 연동 — design-api BE

**코드 SSOT:** `deploy/teamver/`  
**문서 SSOT:** [`docs-teamver/README.md`](../../../docs-teamver/README.md) · **구현 누적:** [`00_구현_내역_누적.md`](../../../docs-teamver/00_구현_내역_누적.md)  
**Prod 출시 게이트:** [`09_Design_저장소_격리_출시게이트.md`](../../../docs-teamver/09_Design_저장소_격리_출시게이트.md)  
**연동 보강:** [`10_세션·OD패치_보강.md`](../../../docs-teamver/10_세션·OD패치_보강.md) · [`11_Usage·Drive_Publish_보강.md`](../../../docs-teamver/11_Usage·Drive_Publish_보강.md)  
**설계 참고:** [`docs-teamver/06_Docs슬라이드형_연동.md`](../../../docs-teamver/06_Docs슬라이드형_연동.md)

Main BE는 **별도 VM** (`api.teamver.com`). OD UI는 `design.teamver.com`, Teamver SSO·bootstrap·usage는 **`teamver-design-api`** 가 담당한다 (Docs/Slides 동형).

---

## 구조

```text
[Main FE] → design.teamver.com (OD UI)
              ↕ Cookie SSO
[design-api.teamver.com] → teamver-design-api (이 레포 deploy/teamver/be)
              ↓
[api.teamver.com] Main BE — bootstrap / billing / session-check
              ↓
[open-design-daemon :7456]
```

| 경로 | 내용 |
|------|------|
| `deploy/teamver/be/` | FastAPI — **teamver-app-sdk-python** (auth/bootstrap/usage/M2M) |
| `deploy/teamver/docker-compose.yml` | daemon + design-db + teamver-design-api |
| `deploy/teamver/devops/nginx/` | design / design-api 프록시 |
| `packages/teamver-integration/` | headless `OdDaemonClient` (Track B) |

---

## design-api API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/auth/session` | Cookie/Bearer SSO |
| GET | `/api/v1/bootstrap` | Main BE bootstrap relay |
| GET | `/api/v1/runtime-config` | Embed managed API mode (server env → authenticated FE) |
| GET | `/api/v1/projects` | Project registry list (owner-scoped) |
| GET | `/api/v1/projects/{id}` | Single registry row (od id or DPRJ id) |
| POST | `/api/v1/projects` | Project registry create + daemon scratch sync-up (best-effort) |
| GET | `/api/v1/projects/{od_project_id}/access` | Daemon access gate (204 + `X-Teamver-S3-Prefix`) |
| DELETE | `/api/v1/projects/{od_project_id}` | Registry soft-delete + daemon scratch evict (best-effort) |
| POST | `/api/v1/usage/events` | OD run usage (user JWT), `202 {requestId}` — [11 §3](../../../docs-teamver/11_Usage·Drive_Publish_보강.md) |
| POST | `/api/internal/usage/events` | Daemon M2M usage (internal key) — [11 §3.4](../../../docs-teamver/11_Usage·Drive_Publish_보강.md) |
| POST | `/api/v1/projects/{id}/publish` | Drive Publish HTML+ZIP — [11 §6](../../../docs-teamver/11_Usage·Drive_Publish_보강.md) |
| GET | `/api/v1/projects/{id}/outputs` | Published `design_outputs` list (Drive asset history) |
| GET | `/api/token-usage/by-model` | M2M 집계 |
| GET | `/api/healthz` | DB + `design_projects`·`design_outputs` schema |
| GET | `/api/healthz/deps` | Postgres·daemon·Main BE + `config` (m2m, `project_storage`, …) |

### daemon (S3 materialization, design-api 연동)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/projects/:id/scratch/sync-up` | registry create 후 scratch→S3 (access gate) |
| POST | `/api/projects/:id/scratch/evict` | registry delete 후 scratch 정리 (access gate) |

---

## Ops scripts (Track A)

| Script | 용도 |
|--------|------|
| `validate_deploy_env.sh` | `.env` 필수 키 preflight (S3·MinIO endpoint 경고) |
| `print_track_a_status.sh` | Track A env 요약 + `--probe` health |
| `run_docker.sh` | compose up (`--rds`, `--local-db`, `--with-minio`) |
| `check_sidecar_deps.sh` | EC2 loopback healthz + deps (`project_storage` 일치) + embed folder/linkedDirs gates |
| `smoke_design.sh` | staging/prod curl smoke |
| `run_track_a_unit_tests.sh` | design-api pytest + embed vitest (로컬 CI) |
| `run_staging_track_a_e2e.sh` | smoke + manual E2E checklist |
| `run_post_deploy_track_a.sh` | EC2: validate → compose → deps → optional smoke |
| `print_staging_s3_env.sh` | terraform → S3 env snippet |
| `apply_staging_s3_env.sh` | `.env.staging`에 S3 키 병합 (P1-8) |
| `run_staging_phase0_activate.sh` | Phase 0: S3 merge + validate + EC2 checklist (P0/P1-8) |
| `print_main_be_design_env.sh` | Main BE `TEAMVER_DESIGN_API_BASE_URL` snippet (A6) |
| `check_main_be_design_wiring.sh` | Main BE env read-only 검증 (A6) |
| `check_storage_isolation.sh` | staging/production tenant 격리 audit — `.env` + 컨테이너 ENV + `/api/healthz/deps` + `/api/health/storage` (P1-3) |
| `check_registry_s3_drift.sh` | RDS `design_projects` active vs S3 tenant prefix 객체 drift 목록 (E2E probe 대상·§13 backfill) |
| `backup_sqlite_to_s3.sh` | Litestream 장애 시 `app.sqlite` 수동 S3 fallback (P2-3) |
| `print_cloudwatch_alarm_commands.sh` | sync-up 실패·scratch disk alarm AWS CLI 출력 (P1-10/P0-6) |
| `run_minio_s3_dev.sh` | local MinIO + optional integration test |
| `seed_main_be_design_app.sql` | Main BE `ai_app` ai-design (bootstrap app_key=design) |
| `seed_main_be_design_app.sh` | 위 SQL `psql` 적용 wrapper (`--verify-only`로 행 확인) |
| `seed_od_runtime_config.sh` | OD onboarding seed |

---

## 로컬 기동

```bash
cd ns-open-design
bash scripts/sync-teamver-vendor.sh   # Teamver SDK vendor (최초·SDK 변경 시)
pnpm install

cd deploy/teamver
cp .env.staging.example .env.staging
# OD_API_TOKEN, TEAMVER_JWT_SECRET, TEAMVER_INTERNAL_API_KEY 등
bash deploy.sh --staging
# 또는: bash scripts/run_docker.sh --staging  (deploy.sh 위임)
```

| 서비스 | 포트 |
|--------|------|
| open-design-daemon | 7456 |
| teamver-design-api | 16000 |
| design-db | 54320 |

---

## SSO (Docs Plan B)

1. Main FE → Design (Cookie refresh)
2. nginx `auth_request` → `api.teamver.com/api/auth/session-check`
3. OD web → design-api BFF — **`@teamver/app-sdk`** (`apps/web/src/teamver/designBffClient.ts`)

---

## SDK · vendor

**상세:** [docs-teamver/08_Teamver_SDK_vendor와_배포.md](../../../docs-teamver/08_Teamver_SDK_vendor와_배포.md) · runbook [TEAMVER_SDK_VENDOR.md](./TEAMVER_SDK_VENDOR.md)

| 레이어 | 패키지 | vendor |
|--------|--------|--------|
| design-api BE | `teamver-app-sdk-python` | `vendor/teamver/python/teamver-app-sdk.whl` |
| OD web FE | `@teamver/app-sdk` | `vendor/teamver/app-sdk.tgz` |
| Track B headless | `@open-design/teamver-integration` | workspace (OD 내부) |

```bash
bash scripts/sync-teamver-vendor.sh   # ns-open-design root — SDK 변경·릴리스 시
pnpm install
```

EC2 배포(ECR 없음): **vendor git commit 권장** → `git pull` + `run_docker.sh`. EC2 런타임 sync 불필요.

---

## Embed runtime env (design-api, git 커밋 금지)

Managed BYOK — 브라우저 `VITE_*` 주입 없이 design-api가 세션 인증 후 FE에 전달:

```bash
TEAMVER_OD_API_KEY=sk-...
TEAMVER_OD_API_PROTOCOL=anthropic
TEAMVER_OD_API_BASE_URL=https://api.anthropic.com
TEAMVER_OD_API_MODEL=claude-sonnet-4-5
```

미설정 시 `GET /api/v1/runtime-config` → `{ "configured": false }` (embed lock은 유지, chat은 Settings/BYOK 필요).

---

## Project registry · S3 (daemon, staging/prod)

nginx `auth_request` 후 OD `/api/` 프록시에 `X-Teamver-User-Id`, `X-Teamver-Workspace-Id` 전달 → daemon access gate + tenant S3 prefix.

| 레이어 | 역할 |
|--------|------|
| **embed FE** | create/import/delete → design-api registry sync; list owner 필터; **workspace switcher** + user topbar; **`app_enabled` 비활성 WS 경고**; publish 전 `GET /permissions/{id}` |
| **design-api** | `design_projects` + `s3_prefix` (`design/ws_*/user_*/proj_*/`) |
| **daemon** | `TEAMVER_DESIGN_API_URL` 시 access subrequest; run/lazy materialize |

**daemon env (S3 활성화 시 — MaterializingProjectStorage wiring 완료 후 `OD_PROJECT_STORAGE=s3`):**

```bash
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-staging-data   # terraform output project_data_bucket
OD_S3_REGION=ap-northeast-2
OD_SCRATCH_DIR=/app/.od/scratch
TEAMVER_DESIGN_API_URL=http://teamver-design-api:8000
OD_PROJECT_LAZY_SYNC_TTL_MS=60000
```

EC2 IAM instance profile 사용 시 `OD_S3_ACCESS_KEY_ID` 불필요. Hosted 배포는
`deploy.sh`가 Litestream을 항상 시작하며, `LITESTREAM_BUCKET`(=`OD_S3_BUCKET`)과
`LITESTREAM_REGION` 누락 또는 sidecar running 실패 시 배포를 중단한다.

상세: [09 Phase 0~3](../../../docs-teamver/09_Design_저장소_격리_출시게이트.md)

---

## 로컬 vs Staging S3 vs MinIO

**요약:** 로컬 laptop은 대부분 `OD_PROJECT_STORAGE=local`로 충분하다. MinIO는 **S3 코드 경로를 로컬에서만 검증**할 때 쓰는 선택 도구이며, staging AWS bucket을 laptop에 붙이는 방식은 **비권장**이다. SSOT: [09 §10.1](../../../docs-teamver/09_Design_저장소_격리_출시게이트.md#101-로컬-개발--storage-모드-선택-ssot).

| 시나리오 | 설정 | 비고 |
|----------|------|------|
| 로컬 UI·BFF·registry·publish 개발 | `OD_PROJECT_STORAGE=local` | MinIO·staging bucket 불필요 |
| 로컬 daemon S3/materialize 테스트 | `s3` + MinIO (`run_minio_s3_dev.sh`) | `OD_S3_ENDPOINT=http://minio:9000` |
| Staging 실연동·격리 E2E | EC2 `.env.staging` + AWS S3 | `apply_staging_s3_env.sh` · IAM role |
| 로컬에서 staging bucket 직접 사용 | 가능하나 **금지 권장** | 데이터 오염·evict 실수·보안 |

```bash
# 로컬 — 일반 (권장)
OD_PROJECT_STORAGE=local
bash scripts/run_docker.sh --staging --local-db

# 로컬 — S3 경로만 (선택)
bash scripts/run_minio_s3_dev.sh
# 출력 env를 .env에 반영 후
bash scripts/run_docker.sh --staging --local-db --with-minio

# Staging EC2 — AWS S3 (P1-8)
bash scripts/apply_staging_s3_env.sh --from-terraform
bash scripts/validate_deploy_env.sh --staging --rds
bash scripts/run_docker.sh --staging --rds
```

`validate_deploy_env.sh`는 staging/prod `.env`에 MinIO endpoint가 있으면 경고한다 (dev 전용 설정이 EC2에 섞였는지 검출).

---

## Deploy preflight (EC2)

```bash
cp .env.staging.example .env.staging   # 값 채움 (S3: apply_staging_s3_env.sh)
bash scripts/validate_deploy_env.sh --staging --rds
bash scripts/run_docker.sh --staging --rds
# 또는 일괄:
bash scripts/run_post_deploy_track_a.sh --staging --rds --status-probe
```

`validate_deploy_env.sh`는 `OD_API_TOKEN`, `TEAMVER_JWT_SECRET`, `TEAMVER_INTERNAL_API_KEY`, RDS, S3 bucket 등 필수 키를 검사한다. `run_docker.sh`가 기본으로 호출한다 (`--skip-validate`로 생략 가능).

---

## Smoke (배포 후)

```bash
bash scripts/check_sidecar_deps.sh --staging   # EC2 loopback: healthz + deps + embed folder gates
bash scripts/smoke_design.sh --staging
# Main BE ai_app (A8) — RDS URL 필요:
# MAIN_BE_DATABASE_URL='postgresql://…' bash scripts/seed_main_be_design_app.sh --staging
# MAIN_BE_DATABASE_URL='postgresql://…' bash scripts/seed_main_be_design_app.sh --staging --verify-only
# 선택: TEAMVER_COOKIE='teamver_access_token=…' bash scripts/smoke_design.sh --staging
```

체크: OD `/api/health`, design-api `/api/healthz`, unauthenticated `runtime-config`/`bootstrap` → 401/403.

---

## Track A 체크리스트

| 항목 | 상태 |
|------|------|
| compose + nginx | ✓ |
| Main BE session-check + AppKey design | ✓ |
| FE AI Apps Design 메뉴 | ✓ |
| design-api BE (auth/bootstrap/usage) | ✓ (import·204 fix) |
| OD web session 배너 + embed | ✓ (usage hook ✅ · [10](../../../docs-teamver/10_세션·OD패치_보강.md) · [11 §3](../../../docs-teamver/11_Usage·Drive_Publish_보강.md)) |
| **세션·인증 (10 §3 Phase S)** | ✅ 코드 · smoke ✅ · staging browser E2E ☐ |
| **OD embed 브랜딩 (10 §4 Phase P)** | ✅ 코드 · Playwright P-7 ✅ · staging browser ☐ |
| **Usage Phase 1 (11 §3)** | ✅ FE hook·멱등·M2M·smoke · staging E2E ☐ |
| Staging/Prod 실배포 검증 | ☐ ops |
| **저장소·격리 (09 Phase 0~3)** | 🟡 materialize·registry·scratch sync/evict ✅ · staging S3 활성화 ☐ |
| **Drive Publish (11 §6 / G7)** | ✅ HTML+ZIP v1 · outputs list · Open in Drive · staging E2E ☐ |
| Admin registry `ai-design` | 🟡 `scripts/seed_main_be_design_app.sh` (전역 비활성화·FE 카드 메타 시) |
| Registry billing Phase 2 | ☐ |

---

## Usage · billing

- **Phase 1:** `POST /api/v1/usage/events` + M2M `by-model` — 상세 [11 §3~§5](../../../docs-teamver/11_Usage·Drive_Publish_보강.md)
- **Phase 2:** `be/app/services/teamver_billing.py` — Registry reserve/commit — [11 §4](../../../docs-teamver/11_Usage·Drive_Publish_보강.md)
- FE `saveMessage` 종료 hook → `usage/events` ([11 §3.1](../../../docs-teamver/11_Usage·Drive_Publish_보강.md))

## Drive Publish

- **Phase 4 (G7):** `POST /api/v1/projects/{id}/publish` → SDK Drive upload — [11 §6](../../../docs-teamver/11_Usage·Drive_Publish_보강.md) ✅

---

## 배포

| 환경 | VM | env | runbook |
|------|-----|-----|---------|
| **Staging** | Design Staging 전용 | `.env.staging` | [devops/nginx/README.md](../devops/nginx/README.md) |
| **Production** | Design Production 전용 | `.env.production` | [DEPLOY-AWS.md](./DEPLOY-AWS.md) |

**SDK vendor · ECR 없는 배포:** [08_Teamver_SDK_vendor와_배포.md](../../../docs-teamver/08_Teamver_SDK_vendor와_배포.md)

**인프라 결정·사양·체크리스트:** [docs-teamver/07_VM_배포_인프라.md](../../../docs-teamver/07_VM_배포_인프라.md)

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-16 | registry access·S3 materialize·daemon env 연동 문서 |
| 2026-06-15 | **10·11 연동 보강** — 세션·Usage·Drive checklist |
| 2026-06-15 | **09 저장소·격리 출시 게이트** — Track A checklist |
| 2026-06-15 | `deploy/teamver/be` — Docs/Slides형 wrapper BE (ns-open-design) |

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
| GET/POST | `/api/v1/projects` | Project registry (list owner-scoped · create + `s3_prefix`) |
| GET | `/api/v1/projects/{od_project_id}/access` | Daemon access gate (204 + `X-Teamver-S3-Prefix`) |
| DELETE | `/api/v1/projects/{od_project_id}` | Registry soft-delete (status=`deleted`) |
| POST | `/api/v1/usage/events` | OD run usage (user JWT) — [11 §3](../../../docs-teamver/11_Usage·Drive_Publish_보강.md) |
| POST | `/api/internal/usage/events` | Daemon M2M usage (internal key) — [11 §3.4](../../../docs-teamver/11_Usage·Drive_Publish_보강.md) |
| POST | `/api/v1/projects/{id}/publish` | Drive Publish HTML+ZIP — [11 §6](../../../docs-teamver/11_Usage·Drive_Publish_보강.md) |
| GET | `/api/token-usage/by-model` | M2M 집계 |

---

## 로컬 기동

```bash
cd ns-open-design
bash scripts/sync-teamver-vendor.sh   # Teamver SDK vendor (최초·SDK 변경 시)
pnpm install

cd deploy/teamver
cp .env.staging.example .env.staging
# OD_API_TOKEN, TEAMVER_JWT_SECRET, TEAMVER_INTERNAL_API_KEY 등
docker compose up -d
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
| **FE** | create/import/delete → design-api registry sync; list owner 필터 |
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

EC2 IAM instance profile 사용 시 `OD_S3_ACCESS_KEY_ID` 불필요. Litestream: `docker compose --profile litestream up -d`.

상세: [09 Phase 0~3](../../../docs-teamver/09_Design_저장소_격리_출시게이트.md)

---

## Deploy preflight (EC2)

```bash
cp .env.staging.example .env.staging   # 값 채움 (S3: print_staging_s3_env.sh)
bash scripts/validate_deploy_env.sh --staging --rds
bash scripts/run_docker.sh --staging --rds
```

`validate_deploy_env.sh`는 `OD_API_TOKEN`, `TEAMVER_JWT_SECRET`, `TEAMVER_INTERNAL_API_KEY`, RDS, S3 bucket 등 필수 키를 검사한다. `run_docker.sh`가 기본으로 호출한다 (`--skip-validate`로 생략 가능).

---

## Smoke (배포 후)

```bash
bash scripts/smoke_design.sh --staging
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
| OD web session 배너 + embed | ✓ (usage hook·브랜딩 남음 — [10](../../../docs-teamver/10_세션·OD패치_보강.md) · [11 §3](../../../docs-teamver/11_Usage·Drive_Publish_보강.md)) |
| **세션·인증 (10 §3 Phase S)** | ✅ 코드 · staging E2E ☐ |
| **OD embed 브랜딩 (10 §4 Phase P)** | ✅ 코드 · browser E2E ☐ |
| **Usage Phase 1 (11 §3)** | ☐ FE hook·멱등·Main BE design M2M |
| Staging/Prod 실배포 검증 | ☐ |
| **저장소·격리 (09 Phase 0~3)** | 🟡 registry·materialize·S3 TF ✅ · staging S3 활성화 ☐ |
| **Drive Publish (11 §6 / G7)** | ✅ HTML+ZIP v1 (`PublishService`) |
| Admin registry `design` | ☐ |
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

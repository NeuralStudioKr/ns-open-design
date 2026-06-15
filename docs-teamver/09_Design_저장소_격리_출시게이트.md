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
   · ai_model_token_usages      · CachingProjectStorage
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
| P0-1 | S3 bucket `teamver-design-{staging,prod}-data` | `ns-teamver-devops` | ☐ |
| P0-2 | EC2 IAM instance profile — bucket prefix R/W | `ns-teamver-devops` | ☐ |
| P0-3 | S3 lifecycle (noncurrent version, IA 선택) | `ns-teamver-devops` | ☐ |
| P0-4 | `.env.*` — `OD_PROJECT_STORAGE=s3`, `OD_S3_*` | `deploy/teamver` | ☐ |
| P0-5 | Litestream sidecar / config (compose) | `deploy/teamver` | ☐ |
| P0-6 | volume → scratch 전용 (용량·알람 runbook) | [07](./07_VM_배포_인프라.md) | 🟡 문서만 |
| P0-7 | RDS `teamver_design_*` database | Terraform + SQL | ✅ |

### Phase 1 — OD ProjectStorage 연결 (약 2~3주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P1-1 | `ProjectStorage` interface + `LocalProjectStorage` | `apps/daemon` | ✅ |
| P1-2 | `S3ProjectStorage` (SigV4) | `apps/daemon` | ✅ |
| P1-3 | `resolveProjectStorage()` + unit tests | `apps/daemon` | ✅ |
| P1-4 | `projects.ts` → `ProjectStorage` 경유 리팩터 | `apps/daemon` | ☐ |
| P1-5 | `server.ts` / routes — storage 주입 | `apps/daemon` | ☐ |
| P1-6 | **`CachingProjectStorage`** — run 전 sync-down / 후 sync-up | `apps/daemon` | ☐ |
| P1-7 | `startChatRun` 전후 materialization hook | `apps/daemon` | ☐ |
| P1-8 | Teamver compose/env S3 연동 검증 (staging) | `deploy/teamver` | ☐ |
| P1-9 | MinIO/localstack integration test | `apps/daemon` | ☐ |

**근거 코드 (기질 완료):** `apps/daemon/src/storage/project-storage.ts` — **라우트 미연결** (`OD_PROJECT_STORAGE=s3` env만으로는 동작 안 함).

### Phase 2 — SQLite 내구성 (약 1주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P2-1 | Litestream → S3 replica config | `deploy/teamver` | ☐ |
| P2-2 | restore runbook (snapshot 시점 → compose up) | `deploy/teamver/docs` | ☐ |
| P2-3 | (대안) cron `app.sqlite` → S3 — Litestream 불가 시 | `deploy/teamver` | ☐ |

### Phase 3 — 테넌트 격리 + design-api registry (약 2주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P3-1 | `design_projects` DDL + migration | `deploy/teamver/be` | ☐ |
| P3-2 | `POST /api/v1/projects` — registry 생성 | `deploy/teamver/be` | ☐ |
| P3-3 | `GET /api/v1/projects` — workspace 필터 목록 | `deploy/teamver/be` | ☐ |
| P3-4 | `GET /api/v1/projects/{id}/access` — 204/403 | `deploy/teamver/be` | ☐ |
| P3-5 | OD web — list/create → design-api | `apps/web` | ☐ |
| P3-6 | daemon middleware — project API access 검증 | `apps/daemon` 또는 nginx | ☐ |
| P3-7 | S3 prefix `{workspace_id}/{user_id}/{project_id}/` | P0 + P3 | ☐ |

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

### Phase 4 — Publish → Teamver Drive (약 1~2주, G7)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| P4-1 | export/finalize → Drive upload (`teamver-app-sdk`) | `deploy/teamver/be` | ☐ |
| P4-2 | `design_outputs` 테이블 | `deploy/teamver/be` | ☐ |
| P4-3 | Main FE / Drive 연동 UX | `ns-teamver-fe-v2` | ☐ |

---

## 5. Phase별 env · 산출물

### S3 (daemon)

```bash
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-prod-data
OD_S3_REGION=ap-northeast-2
OD_S3_PREFIX=design/
# IAM role preferred; fallback:
# OD_S3_ACCESS_KEY_ID=...
# OD_S3_SECRET_ACCESS_KEY=...
```

### Litestream (예시)

```yaml
# deploy/teamver/litestream.yml (TODO)
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
| `POSTGRES_*` → `teamver_design_*` | usage + **design_projects** | usage ✅ · registry ☐ |
| `TEAMVER_*` | Main BE bootstrap | ✅ |

---

## 6. 하지 말 것

| 접근 | 이유 |
|------|------|
| EBS snapshot만 추가하고 prod 오픈 | 격리·용량 근본 미해결 |
| volume 통째 `aws s3 sync` cron | RPO 거침, tenant prefix 없음 |
| OD SQLite → Teamver RDS full mirror | 스키마 churn, PII 이중화 |
| 격리 없이 S3만 | prefix 노출 시 타 사용자 데이터 |
| 출시 게이트에 OD Postgres DaemonDb | 범위 과대 — Litestream으로 대체 |

---

## 7. 일정 감 · 병렬

| Phase | 기간 | Prod blocker |
|-------|------|--------------|
| 0 인프라 | ~1주 | ✅ |
| 1 ProjectStorage | ~2~3주 | ✅ |
| 2 Litestream | ~1주 | ✅ |
| 3 registry + isolation | ~2주 | ✅ |
| 4 Drive | ~1~2주 | 권장 (G7) |

**Phase 1 ∥ Phase 3** 병렬 가능. **0 → (1+3) → 2 → staging E2E → prod**.

---

## 8. 검증 체크리스트 (Staging E2E)

```text
[ ] S3에 workspace/user/project prefix로 파일 생성 확인
[ ] EC2 volume 삭제 시뮬레이션 후 S3+Litestream에서 복구
[ ] 사용자 A 프로젝트 — 사용자 B access → 403
[ ] design-api GET /projects — workspace 필터만 반환
[ ] agent run 후 S3에 산출물 반영 (sync-up)
[ ] 디스크 scratch 80% 알람 동작
```

---

## 9. Track A/B 재정의 (2026-06-15 결정)

| Track | 범위 |
|-------|------|
| **Track A (출시)** | SSO · nginx · **Phase 0~3 (본 문서)** · usage M2M |
| **Track B (출시 후)** | job queue · multi-replica · Drive 자동화 · Postgres DaemonDb |

자세한 번호 매기기: [04 구현 우선순위](./04_구현_우선순위.md)

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-15 | 초안 — volume-only prod blocker, Phase 0~4, 진행 표 |

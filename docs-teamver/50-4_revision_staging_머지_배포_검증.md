# 50-4 — Revision Postgres SSOT: staging 머지·배포·검증 Runbook

**문서 번호:** 50-4  
**상태:** 운영 Runbook (2026-07-31)  
**대상 변경:** undo/redo revision 스냅샷을 **Postgres DaemonDb(RDS) SSOT**로 올리고 멀티노드 hydrate·advisory lock을 활성화하는 배포.

**관련 문서**

| 문서 | 역할 |
|------|------|
| [50_undo_redo_설계](./50_undo_redo_설계.md) | 기능 설계 SSOT |
| [50-1 구현현황](./50-1-구현현황-undo_redo.md) | 구현 체크리스트 |
| [50-3 스냅샷·RDS·용량](./50-3_revision_스냅샷_저장소_RDS_용량관리.md) | 저장층·env·자동 테스트 |
| [39_4 배포 Runbook](./39_4_배포_Terraform_운영_Runbook.md) | rolling deploy·nginx·EC2 |
| [39_5 검증 체크리스트](./39_5_검증_체크리스트_FAQ.md) | Phase 4 affinity·2노드 공통 |
| [39_9 DaemonDb RDS](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md) | CREATE DATABASE·B5 |

**코드 PR (예시):** `cursor/revision-sqlite-snapshot-0817` → `staging` (NeuralStudioKr/ns-open-design #43)

---

## 1. 한 줄 요약

| 단계 | 무엇을 하는가 |
|------|----------------|
| **머지 전** | CI green, `.env.staging`에 `OD_DAEMON_DB=postgres` + `OD_PG_*` 준비, DaemonDb database 1회 생성 |
| **머지** | `staging`에 PR merge (squash 또는 merge commit — 팀 규칙 따름) |
| **배포** | 각 EC2에서 **동일 git SHA**로 `deploy.sh --staging --rds` (2노드면 `rolling_deploy.sh`) |
| **배포 직후** | daemon 부팅 로그에서 schema **v8** migrate, RDS 테이블 존재, `/api/health` 200 |
| **필수 수동 검증** | **서로 다른 pod**에서 revision push → list → restore 교차 확인 (production HTTP API만 사용) |
| **prod 게이트** | staging 2-pod 시나리오 전부 Pass 후에만 production 동일 env·rolling |

이 Runbook의 **필수 게이트**는 §6 **2-pod 교차 검증**이다. 단일 pod smoke만으로 prod 승격하지 않는다.

---

## 2. 범위·비범위

### 2.1 이 배포가 바꾸는 것

- revision 메타·스냅샷 바이트의 **노드 간 SSOT** → RDS `teamver_design_daemon_*`
- `OD_DAEMON_DB=postgres` 시 스냅샷 기본 저장소 `postgres` (BYTEA)
- push/restore 시 **Postgres advisory lock** (`OD_FILE_REVISION_LOCK_TIMEOUT_MS`)
- warm·hydrate·GC·retention이 Postgres 경로를 우선

### 2.2 이 배포가 바꾸지 않는 것

- design-api RDS (`teamver_design_staging`) — registry만, revision 없음
- S3上的 `deck.html` SSOT·scratch eviction 정책
- Litestream (`app.sqlite` WAL) — chat/메타 캐시용, revision BLOB과 별개
- UI undo/redo UX (기존 FileViewer·History 패널 동작 유지)

### 2.3 알려진 후속 (이 Runbook 범위 밖)

- `OD_DAEMON_DB=postgres` + `OD_FILE_REVISION_SNAPSHOT_STORAGE=files` 조합의 메타 dual-write
- Postgres `pruneOldestFileRevisionsDurableLimited` chain-aware **integration** test (unit만 존재)
- 초대형 deck 전용 S3 blob 백엔드

**메트릭·stuck excess:** [50-3 §6](./50-3_revision_스냅샷_저장소_RDS_용량관리.md#6-모니터링) — Prometheus 7 gauge + 알람 권장값.

---

## 3. 머지 전 체크리스트

### 3.1 코드·CI

- [ ] PR이 `staging`을 base로 열려 있고 리뷰 승인 완료
- [ ] CI **Validate workspace** / daemon·web typecheck green
- [ ] 로컬 또는 CI에서 revision 테스트 suite green:

```bash
pnpm --filter @open-design/daemon exec vitest run \
  tests/file-revisions-multinode.integration.test.ts \
  tests/file-revisions-durable-store.test.ts \
  tests/file-revisions-postgres-lock.test.ts \
  tests/file-revisions-maintenance.test.ts \
  tests/file-revisions.test.ts
```

- [ ] [50-1](./50-1-구현현황-undo_redo.md) 마무리 체크리스트 항목이 이 PR과 일치

### 3.2 인프라 선행 (staging EC2·RDS)

- [ ] staging **2노드** ALB + nginx userId hash upstream 동작 중 ([39_5 §3.1](./39_5_검증_체크리스트_FAQ.md))
- [ ] `OD_DOCKER_PUBLISH_HOST=0.0.0.0` — peer private IP `:7456` curl 200 ([39_5 §3.1.2](./39_5_검증_체크리스트_FAQ.md))
- [ ] RDS에 DaemonDb database **이미 생성** (없으면 §4.1 수행)

```sql
-- teamver-staging-postgres, dbname=postgres, master 유저로 1회
CREATE DATABASE teamver_design_daemon_staging OWNER teamver_be_admin;
```

Terraform SSOT: `terraform output -raw rds_create_daemon_database_sql`

### 3.3 `.env.staging` 필수 키 (revision·DaemonDb)

**node1·node2 동일 내용**이어야 한다 ([39_4 §2.3](./39_4_배포_Terraform_운영_Runbook.md)).

```env
# --- OD DaemonDb (이번 배포 핵심) ---
OD_DAEMON_DB=postgres
OD_PG_HOST=teamver-staging-postgres.<...>.ap-northeast-2.rds.amazonaws.com
OD_PG_PORT=5432
OD_PG_DATABASE=teamver_design_daemon_staging
OD_PG_USER=teamver_be_admin
OD_PG_PASSWORD=<POSTGRES_PASSWD 와 동일>
OD_PG_SSL_MODE=require

# --- revision 용량·동시성 (권장 staging 값) ---
OD_FILE_REVISION_RETENTION_LIMIT=20
OD_FILE_REVISION_PUSH_PRUNE_MAX=8
OD_FILE_REVISION_GC_INTERVAL_MS=21600000
OD_FILE_REVISION_LOCK_TIMEOUT_MS=15000
# OD_FILE_REVISION_FULL_SNAPSHOT_INTERVAL=5
# OD_FILE_REVISION_SNAPSHOT_STORAGE=postgres  # 미설정 시 OD_DAEMON_DB=postgres 이면 자동 postgres
```

검증 스크립트:

```bash
cd /opt/teamver-design/deploy/teamver   # 또는 ~/neural/ns-open-design/deploy/teamver
bash scripts/validate_deploy_env.sh --staging --rds
```

### 3.4 머지 전 리스크 확인

| 리스크 | 완화 |
|--------|------|
| 첫 부팅 시 v8 DDL lock | staging 저트래픽 시간대 배포, rolling으로 한 노드씩 |
| 기존 노드 로컬 `.od/revisions/` 잔여 | postgres 모드에서는 SSOT가 RDS; orphan disk는 GC가 정리 ([50-3 §6](./50-3_revision_스냅샷_저장소_RDS_용량관리.md)) |
| postgres env 누락 | daemon 기동 실패 또는 sqlite fallback — **배포 전 validate 필수** |

---

## 4. staging merge 절차

### 4.1 Merge

1. GitHub PR에서 **base: `staging`** 확인
2. 최종 CI green 재확인
3. Merge (팀 정책: squash merge 권장 시 squash)
4. merge commit SHA 기록: `git fetch origin staging && git rev-parse origin/staging`

### 4.2 배포 대상 SHA 동기화 (2노드)

**rolling 전에** node1·node2 repo를 **동일 SHA**로 맞춘다. `rolling_deploy.sh`는 `git pull`을 하지 않는다 ([39_4 §3.1](./39_4_배포_Terraform_운영_Runbook.md)).

```bash
# 각 EC2에서 (예)
cd ~/neural/ns-open-design
git fetch origin
git checkout staging
git pull origin staging
git rev-parse HEAD   # 두 노드 출력이 동일해야 함
```

---

## 5. 배포 실행

### 5.1 단일 노드 (또는 maintenance window)

```bash
cd deploy/teamver
bash scripts/validate_deploy_env.sh --staging --rds
bash deploy.sh --staging --rds
```

### 5.2 2노드 rolling (권장)

**실행 위치:** Mac / CI / bastion — EC2 위가 아님.

```bash
cd deploy/teamver

# dry-run 먼저
bash scripts/rolling_deploy.sh \
  --env staging \
  --tg-arn "<terraform output alb_target_group_arn>" \
  --hosts "ubuntu@<node1-public-ip> ubuntu@<node2-public-ip>" \
  --ssh-key ~/.ssh/teamver-staging.pem \
  --deploy-extra "--rds" \
  --dry-run

# 실행
bash scripts/rolling_deploy.sh \
  --env staging \
  --tg-arn "<ARN>" \
  --hosts "ubuntu@<node1> ubuntu@<node2>" \
  --ssh-key ~/.ssh/teamver-staging.pem \
  --deploy-extra "--rds"
```

호스트당 흐름: ALB drain → SSH `deploy.sh --staging --rds` → `/_nginx/health` → ALB register → healthy 대기.

상세: [39_4 §3](./39_4_배포_Terraform_운영_Runbook.md)

### 5.3 배포 후 즉시 확인 (각 노드)

```bash
cd deploy/teamver
docker compose --env-file .env.staging ps
docker compose --env-file .env.staging logs open-design-daemon --tail 80

bash scripts/verify_od_core.sh --staging --expect-teamver-gate
curl -fsS http://127.0.0.1:7456/api/health | jq .
curl -fsS -H "Authorization: Bearer $OD_API_TOKEN" \
  http://127.0.0.1:7456/api/health/storage | jq .
```

**기대**

- `open-design-daemon` 컨테이너 `Up`
- 로그에 Postgres 연결·migrate 오류 없음
- `/api/health` → HTTP 200, `nodeId` 필드 존재

---

## 6. 배포 직후 인프라 검증

### 6.1 DaemonDb schema v8 (RDS)

psql 또는 GUI로 `teamver_design_daemon_staging` 접속:

```sql
-- 마이그레이션 버전 (daemon이 daemon_schema_migrations 테이블 유지)
SELECT version FROM daemon_schema_migrations ORDER BY version DESC LIMIT 5;

-- v8 테이블
\d file_revisions
\d file_revision_snapshots

-- (배포 직후) 행이 없어도 OK — 테이블만 존재하면 migrate 성공
SELECT COUNT(*) FROM file_revisions;
SELECT COUNT(*) FROM file_revision_snapshots;
```

**Pass 기준:** `daemon_schema_migrations.version >= 8`, 두 테이블 존재.

daemon 부팅이 migrate를 수행하므로 **수동 DDL 실행 불필요** ([create_daemon_db.sql](../deploy/teamver/scripts/create_daemon_db.sql) 주석과 동일).

### 6.2 환경 변수 컨테이너 반영

```bash
docker compose --env-file .env.staging exec open-design-daemon \
  printenv OD_DAEMON_DB OD_PG_DATABASE OD_FILE_REVISION_RETENTION_LIMIT \
  OD_FILE_REVISION_LOCK_TIMEOUT_MS OD_FILE_REVISION_SNAPSHOT_STORAGE
```

**Pass 기준**

| 변수 | 기대값 |
|------|--------|
| `OD_DAEMON_DB` | `postgres` |
| `OD_PG_DATABASE` | `teamver_design_daemon_staging` |
| `OD_FILE_REVISION_RETENTION_LIMIT` | `20` (권장; 하한 15 · 기본 30) |
| `OD_FILE_REVISION_SNAPSHOT_STORAGE` | 비어 있거나 `postgres` |

### 6.3 2노드 네트워크 sanity

```bash
# node1에서 node2 private IP
curl -fsS "http://<node2-private-ip>:7456/api/health"
# node2에서 node1 private IP
curl -fsS "http://<node1-private-ip>:7456/api/health"
```

Public URL:

```bash
curl -fsSI https://stg-design.teamver.com/api/health | grep -i x-od-node-id
```

---

## 7. 단일 pod smoke (revision 비특화)

기존 Design smoke로 회귀 없음을 확인한다.

```bash
cd deploy/teamver
bash scripts/smoke_design.sh --staging    # 팀 표준 smoke
bash scripts/verify_od_core.sh --staging --expect-teamver-gate
```

**Pass:** health·storage·embed gate·project create/list (스크립트가 커버하는 범위) 실패 0.

---

## 8. 2-pod 교차 검증 (필수 게이트)

> **원칙:** 데이터 시드는 **production HTTP API**(브라우저 UI 또는 `curl`/`od`가 치는 동일 `/api/*`)만 사용한다. 테스트 backdoor·소스 직접 주입 금지 ([AGENTS.md Bug follow-up workflow](../AGENTS.md)).

### 8.1 사전 준비

| 항목 | 값 |
|------|-----|
| URL | `https://stg-design.teamver.com` |
| 로그인 | Teamver staging 계정 (BFF 세션) |
| 테스트 프로젝트 | 새로 만들거나 QA 전용 deck 프로젝트 1개 |
| 대상 파일 | `deck.html` (또는 undo 대상 HTML artifact) |
| 인증 | 브라우저 세션 **또는** `OD_API_TOKEN` + Teamver proxy 경로 |

**노드 식별:** 응답 헤더 `X-OD-Node-Id` 또는 `/api/health` JSON `nodeId`.

```bash
export BASE="https://stg-design.teamver.com"
export TOKEN="<OD_API_TOKEN from .env.staging>"
export PROJECT_ID="<project-uuid>"
export FILE="deck.html"
ENCODED_FILE=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILE', safe=''))")

curl -sS -H "Authorization: Bearer $TOKEN" -D - -o /dev/null \
  "$BASE/api/health" | grep -i x-od-node-id
```

동일 사용자는 userId hash로 **한 노드에 고정**된다. **교차 검증**을 위해:

- **방법 A:** 서로 다른 staging 사용자 2명 (user A → node1, user B → node2에 붙는지 `X-OD-Node-Id`로 확인)
- **방법 B:** 한 사용자로 작업하되, **pod B 검증**은 다른 노드의 **loopback**에서 동일 projectId로 API 호출 (운영자 SSH → `curl 127.0.0.1:7456` + token) — list/restore는 PG SSOT이므로 노드 무관하게 일치해야 함
- **방법 C (권장):** UI는 user A, CLI 검증은 node2 SSH에서 `od project revisions list` (동일 token·project)

### 8.2 시나리오 R1 — Push on A, List on B

| Step | 어디서 | 동작 | Pass 기준 |
|------|--------|------|-----------|
| R1.1 | Pod A (UI) | 프로젝트 열기 → Manual Edit → 텍스트 변경 → 저장 | 저장 성공, 에러 토스트 없음 |
| R1.2 | Pod A | History 패널 또는 `GET .../revisions` | revision 1건 이상, 최신 `sequence` 증가 |
| R1.3 | Pod B | `GET .../revisions` (다른 노드·다른 세션/SSH) | **head revision id·sequence·개수**가 R1.2와 동일 |
| R1.4 | RDS | `SELECT id, sequence FROM file_revisions WHERE project_id=$1 AND file_name='deck.html' ORDER BY sequence DESC LIMIT 3` | R1.3과 일치 |
| R1.5 | Pod B | `GET .../revisions/<headId>` | snapshot content 존재, `byteSize` > 0 |

**curl 예시 (Pod B — SSH loopback):**

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:7456/api/projects/$PROJECT_ID/files/$ENCODED_FILE/revisions" | jq .
```

### 8.3 시나리오 R2 — Undo(restore) on B, List on A

| Step | 어디서 | 동작 | Pass 기준 |
|------|--------|------|-----------|
| R2.1 | 전제 | R1 완료 후 revision ≥ 2 (저장 2회) 또는 1회 저장 후 undo 가능 상태 |
| R2.2 | Pod B | `POST .../revisions/<parentId>/restore` **또는** UI Undo | 200, disk·viewer 내용 이전으로 |
| R2.3 | Pod A | `GET .../revisions` | head가 parent 쪽으로 이동했거나 cursor/head 정책에 맞게 일관 |
| R2.4 | Pod A | UI에서 deck 내용 | B에서 restore한 내용과 동일 |
| R2.5 | Pod A | Redo 1회 | 다시 최신 revision 내용 |

### 8.4 시나리오 R3 — Stale sqlite hydrate (truncate 시뮬레이션)

운영에서 한 노드의 sqlite 캐시가 어긋날 수 있는지 검증한다.

| Step | 동작 | Pass 기준 |
|------|------|-----------|
| R3.1 | Pod A에서 저장 1회 (revision 생성) | RDS에 row 존재 |
| R3.2 | **Pod B만** daemon 컨테이너 내부 sqlite에서 해당 file의 revision row 삭제 (운영 절차: `docker exec` → `sqlite3 $OD_DATA_DIR/app.sqlite` — **staging QA 전용**) | — |
| R3.3 | Pod B에서 `GET .../revisions` | PG에서 **hydrate**되어 R3.1과 동일 head·count |
| R3.4 | Pod B에서 undo 1회 | 정상 restore, 409/500 없음 |

> R3.2는 staging QA에서만 수행. production에서는 sqlite 직접 조작 금지.

### 8.5 시나리오 R4 — 동시 저장 (lock)

| Step | 동작 | Pass 기준 |
|------|------|-----------|
| R4.1 | Pod A·B에서 **동일 project·동일 file**에 거의 동시에 저장 (자동화 스크립트 또는 두 브라우저) | 둘 다 성공 **또는** 한쪽 `409` + `FILE_REVISION_LOCK_TIMEOUT` / sequence `CONFLICT` |
| R4.2 | 직후 `GET .../revisions` (어느 노드든) | sequence 단조, 중복 sequence 없음 |
| R4.3 | RDS | `UNIQUE(project_id, file_name, sequence)` 위반 없음 |

**409 응답 예:**

```json
{
  "error": {
    "code": "FILE_REVISION_LOCK_TIMEOUT",
    "message": "..."
  }
}
```

### 8.6 CLI 검증 (`od project revisions`)

node2 SSH (daemon과 동일 token):

```bash
export OD_API_TOKEN=<from .env.staging>
export OD_PORT=7456

od project revisions list "$PROJECT_ID" deck.html --json | jq .
od project revisions restore "$PROJECT_ID" deck.html "<revision-id>" --json | jq .
```

**Pass:** list JSON이 UI/curl과 동일; restore 후 파일 내용 일치.

### 8.7 UI 회귀 체크리스트 (한 세션)

- [ ] 툴바 Undo / Redo 버튼 활성·비활성 tooltip
- [ ] ⌘Z / Ctrl+Z, ⇧⌘Z / Ctrl+Y
- [ ] History 패널 — retention hint (`서버 보관 N개` 등)
- [ ] burst push(30+) 후 History `retentionPending` → sweep 완료 시 목록 자동 갱신
- [ ] Agent 편집 후 toast “실행 취소”
- [ ] disk ≠ head 충돌 시에만 conflict toast (재진입 오탐 없음)

---

## 9. 관측·로그

### 9.1 CloudWatch (staging)

```bash
# deploy/teamver/.env.staging 주석 참고
LOG_GROUP=/teamver/design/staging/open-design-daemon
```

검색 키워드:

- `file-revisions`, `hydrate`, `pgCommitRevisionWithSnapshot`
- `FILE_REVISION_LOCK_TIMEOUT`, `advisory`
- `migratePostgresDaemonSchema`, `version 8`

### 9.2 RDS 용량 spot check

```sql
SELECT
  pg_size_pretty(pg_total_relation_size('file_revision_snapshots')) AS snapshots_size,
  pg_size_pretty(pg_total_relation_size('file_revisions')) AS meta_size,
  (SELECT COUNT(*) FROM file_revision_snapshots) AS snapshot_rows;
```

staging QA 직후 급증이 없어야 한다 (테스트 프로젝트 몇 개 기준).

### 9.3 노드 로컬 디스크

postgres 모드에서 **신규** revision은 `.od/revisions/`에 쌓이지 않아야 한다.

```bash
# scratch materialized 프로젝트 경로 예시
find /opt/teamver-design/od-data/scratch/projects/<PROJECT_ID>/.od/revisions -type f 2>/dev/null | wc -l
# 기대: 0 (신규 push만 한 경우) 또는 legacy 잔여만
```

### 9.4 Prometheus — file revision gauges

배포 직후·burst push QA 후 daemon pod에서:

```bash
curl -sS "http://127.0.0.1:7456/api/metrics" | grep od_file_revision
```

| Gauge | Pass 기준 (QA 직후) |
|-------|---------------------|
| `od_file_revision_gc_last_success_unix` | `time() - gauge < 900` (부팅 sweep 직후) 또는 interval 내 갱신 |
| `od_file_revision_deferred_sweep_queue_depth` | `0` (sweep idle) |
| `od_file_revision_retention_deferred_excess` | burst push 후 **수 분 내** `0`으로 수렴 (checkpoint stuck은 §50-3 §5.1.2) |
| `od_file_revision_orphan_snapshot_rows` | `0` |

상세·알람 권장값: [50-3 §6](./50-3_revision_스냅샷_저장소_RDS_용량관리.md#6-모니터링).

**스크립트 (metrics + optional burst):**

```bash
bash deploy/teamver/scripts/verify_file_revision_retention.sh
VERIFY_REVISION_BURST=1 VERIFY_REVISION_PROJECT_ID=<id> bash deploy/teamver/scripts/verify_file_revision_retention.sh
```

---

## 10. 롤백 기준·절차

### 10.1 즉시 롤백 (Go → No-Go)

다음 중 **하나라도** staging에서 재현되면 배포 중단·롤백 검토:

| 신호 | 심각도 |
|------|--------|
| daemon 기동 실패 (Postgres 연결·migrate) | Critical |
| 2-pod list head 불일치가 **재시도 후에도** 지속 | Critical |
| restore 후 disk/UI 불일치 | Critical |
| undo/redo 전면 500 | Critical |
| `FILE_REVISION_LOCK_TIMEOUT`이 정상 편집에서 빈번 (>5%) | High |
| RDS disk 급증 (QA 외 대량) | High |

### 10.2 롤백 절차

1. **이전 git SHA** 확인 (`git log origin/staging -5`)
2. node1·node2를 이전 SHA로 checkout
3. `rolling_deploy.sh` 또는 `deploy.sh --staging --rds`로 재배포
4. (선택) `.env.staging`에서 `OD_DAEMON_DB=sqlite`로 되돌리면 revision은 다시 노드 로컬 SSOT — **2노드에서는 권장하지 않음**; 코드 롤백이 우선
5. RDS v8 테이블은 **그대로 두어도 됨** (구 daemon이 ignore). down migration 없음.

### 10.3 부분 완화 (롤백 없이)

- lock timeout 빈번 → `OD_FILE_REVISION_LOCK_TIMEOUT_MS` 일시 상향 (예: 30000)
- retention 부담 → `OD_FILE_REVISION_RETENTION_LIMIT` 하향 (staging만)

---

## 11. Production 승격 Go/No-Go

staging에서 아래 **전부** 체크 후 prod:

| # | 항목 | staging Pass |
|---|------|:------------:|
| G1 | §6 인프라 (v8 테이블·env) | ☐ |
| G2 | §7 단일 pod smoke | ☐ |
| G3 | §8 R1 Push/List 교차 | ☐ |
| G4 | §8 R2 Restore 교차 | ☐ |
| G5 | §8 R3 hydrate (QA) | ☐ |
| G6 | §8 R4 동시 저장 | ☐ |
| G7 | §8.7 UI 회귀 | ☐ |
| G8 | 24h 이상 staging 오류 로그 없음 | ☐ |

Production env: [.env.production.example](../deploy/teamver/.env.production.example)의 `OD_DAEMON_DB=postgres` 블록 + 동일 revision env. 배포는 [39_4 §3 rolling](./39_4_배포_Terraform_운영_Runbook.md) + [17 Production 출시](./17_Production_출시_작업_순서.md).

---

## 12. 트러블슈팅 FAQ

### Q. `GET .../revisions`가 노드마다 다르다

1. `OD_DAEMON_DB`가 양쪽 모두 `postgres`인지 확인  
2. `OD_PG_DATABASE`가 동일한지 확인  
3. 한쪽만 구 이미지면 rolling으로 SHA 맞추기  
4. RDS에 실제 row가 있는지 SQL 확인 — row는 있는데 한쪽만 다르면 hydrate 버그 → 이슈 파일링

### Q. daemon이 postgres에 연결 못 함

- `OD_PG_PASSWORD` = `POSTGRES_PASSWD`  
- SG: EC2 → RDS 5432  
- `OD_PG_SSL_MODE=require`  
- database 존재 여부 (`teamver_design_daemon_staging`)

### Q. restore 시 409

- 동시 편집 — 재시도  
- 지속되면 lock holder 쿼리: `SELECT * FROM pg_locks WHERE locktype = 'advisory';`

### Q. design-api DB에 revision 테이블이 없다

정상이다. revision은 **DaemonDb**에만 있다 ([50-3 §2.2](./50-3_revision_스냅샷_저장소_RDS_용량관리.md)).

---

## 13. 검증 결과 기록 템플릿

배포 담당자가 PR 또는 내부 티켓에 붙여 넣을 양식:

```markdown
## Revision Postgres SSOT — staging 검증

- Merge SHA: `____________`
- Deploy 일시 (UTC): `____________`
- Node1 id: `____________`  Node2 id: `____________`

| 시나리오 | Result | 비고 |
|----------|--------|------|
| R1 Push/List 교차 | PASS / FAIL | |
| R2 Restore 교차 | PASS / FAIL | |
| R3 Hydrate | PASS / FAIL / SKIP | |
| R4 동시 저장 | PASS / FAIL | |
| UI 회귀 | PASS / FAIL | |

- RDS v8: PASS / FAIL
- 롤백 필요: YES / NO
```

---

## 14. 문서 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-31 | 초안 — merge·rolling deploy·2-pod revision 교차 검증·롤백·prod 게이트 |

# 50-3 — Revision 스냅샷 저장소 · RDS 관계 · 용량 관리

**상태:** 구현 완료 · 운영 문서 갱신 (2026-08-04)  
**SSOT:** undo/redo 히스토리 **바이트**가 어디에 쌓이는지, Teamver **RDS**와 어떻게 다른지, 용량을 어떻게 제한·정리하는지.

**관련:** [50_undo_redo_설계](./50_undo_redo_설계.md) · [50-1 구현현황](./50-1-구현현황-undo_redo.md) · [50-2 Canvas 비교](./50-2_Teamver_Canvas_vs_Design_Undo_비교.md) · [50-4 staging 머지·배포·검증 Runbook](./50-4_revision_staging_머지_배포_검증.md) · [39_7 scratch·DaemonDb FAQ](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md) · [39_9 DaemonDb RDS](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md)

---

## 1. 한 줄 요약

| 질문 | 답 |
|------|-----|
| revision 스냅샷은 어디에? | **DaemonDb** — 로컬 dev는 `OD_DATA_DIR/app.sqlite`, Teamver prod는 **RDS의 DaemonDb database** (`teamver_design_daemon_*`) |
| design-api RDS (`teamver_design_staging` 등)와 관계? | **무관** — registry(제목·권한·`s3_prefix`)만 있고 undo 히스토리는 없음 |
| 프로젝트 HTML 본문은? | **S3 SSOT** + 작업 중 **scratch** (`OD_PROJECT_STORAGE=s3` 시) |
| 디스크 0? | 아님 — 바이트가 **프로젝트 `.od/revisions/`** 대신 **DaemonDb**로 모임 |
| 용량 상한? | 파일당 retention + 주기 GC (Postgres orphan 정리) |

---

## 2. 저장층 5분면 (RDS 포함)

Teamver Design은 “DB가 하나”가 아니라 **역할별 저장소**가 나뉜다. revision undo는 **② RDS DaemonDb**에 속한다.

```text
[브라우저 / design-api BFF]
        │
        ├─ ① RDS — design-api database
        │     teamver_design_staging | teamver_design_production
        │     design_projects — 제목, workspace, owner, s3_prefix (registry)
        │     ※ 슬라이드 HTML · undo 스냅샷 없음
        │
        ├─ ② RDS — DaemonDb database (같은 RDS 인스턴스, DB 이름만 분리)
        │     teamver_design_daemon_staging | teamver_design_daemon_production
        │     projects, conversations, messages,
        │     file_revisions, file_revision_snapshots (BYTEA)
        │     OD_DAEMON_DB=postgres 시 SSOT — 스키마 v8 마이그레이션
        │
        └─ open-design-daemon (EC2 pod)
              │
              ├─ ③ OD_DATA_DIR (노드 로컬)
              │     app.sqlite — 메타 캐시 (postgres 모드: PG head와 맞출 때까지 hydrate)
              │     ※ revision 스냅샷 BLOB은 postgres 모드에서 RDS에만 저장
              │     scratch/projects/<id>/ — agent CWD (S3 모드)
              │
              ├─ ④ S3 (tenant prefix) — deck.html, assets SSOT
              │
              └─ ⑤ (구) .od/revisions/*.snap.gz — files 모드 또는 마이그레이션 잔여
```

### 2.1 “왜 OD_DATA_DIR/app.sqlite 얘기가 나오나?”

daemon 프로세스는 항상 `openDatabase(..., { dataDir: OD_DATA_DIR })` 로 **노드 로컬 `app.sqlite`** 를 연다. 이것이 **전체 SSOT**인 경우와 **캐시**인 경우를 구분해야 한다.

| 환경 | `app.sqlite` 역할 | revision 스냅샷 바이트 |
|------|-------------------|------------------------|
| 로컬 dev (`OD_DAEMON_DB` 미설정) | DaemonDb 전체 SSOT | `sqlite` 또는 `files` 모드 선택 |
| Teamver (`OD_DAEMON_DB=postgres`) | 메타 **캐시** (PG head와 불일치 시 hydrate) | **`postgres` 모드 → RDS `file_revisions` + `file_revision_snapshots` SSOT** |

Teamver에서 undo 히스토리를 노드 로컬 디스크에 두면 안 되는 이유: multi-node·scratch eviction 시 **노드가 바뀌면 히스토리 유실**. Postgres DaemonDb(RDS)가 노드 간 공유 SSOT이다 ([39_9](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md)).

### 2.2 RDS 두 database — 헷갈리지 않기

| RDS database | 앱 | revision undo |
|--------------|-----|----------------|
| `teamver_design_*` | design-api (FastAPI) | **없음** |
| `teamver_design_daemon_*` | open-design-daemon | **있음** (`file_revisions` + 스냅샷) |

같은 RDS **인스턴스**, **database 이름만 다름** — 별도 RDS 머신을 추가하는 구조가 아니다 ([39_9 §1](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md)).

---

## 3. 스냅샷 저장 모드

환경 변수: **`OD_FILE_REVISION_SNAPSHOT_STORAGE`**

| 값 | 스냅샷 바이트 위치 | 사용처 |
|----|-------------------|--------|
| `postgres` (**Teamver 기본**) | RDS `teamver_design_daemon_*`.`file_revision_snapshots.compressed` BYTEA | `OD_DAEMON_DB=postgres` 일 때 env 미설정 시 자동 |
| `files` | `<project>/.od/revisions/...` | 로컬 dev·마이그레이션 |
| `sqlite` | 노드 로컬 `app.sqlite` BLOB | 단일 노드 dev 전용 (Teamver prod 비권장) |

**Teamver 규칙:** `OD_DAEMON_DB=postgres` 이면 스냅샷은 **반드시 RDS**에 저장된다. `OD_FILE_REVISION_SNAPSHOT_STORAGE=sqlite` 로 로컬 BLOB을 쓰지 않는다 (`files`만 명시적 opt-out).

공통 (Teamver `postgres` 모드):

- **메타+스냅샷 SSOT:** RDS `file_revisions` + `file_revision_snapshots`. push 시 `pgCommitRevisionWithSnapshot`으로 **단일 트랜잭션** 커밋 후 sqlite 미러.
- **읽기:** `ensureFileRevisionsHydrated` — PG head revision id·row count가 sqlite와 다르면 PG → sqlite 전체 hydrate. `warmProjectFromPostgres`에 file_revisions warm 포함.
- **삭제/retention/GC:** Postgres 경로가 먼저 snapshot+meta 삭제, sqlite 미러 동기화 (`durable-store.ts`).
- **동시성:** push/restore는 `withFileRevisionMutationLock`으로 `(project_id, file_name)` 단위 Postgres advisory lock.
- **canonical 파일** (`deck.html`)은 scratch/S3 — undo와 별개.
- legacy `.od/revisions` 파일은 read fallback + GC orphan 정리.
- S3 materialization: `.od/revisions/**` sync 제외.

Postgres 스키마: `DAEMON_DB_POSTGRES_MIGRATION_V8` — `daemon-db-postgres-schema.ts` v8.

코드: `durable-store.ts` · `postgres-lock.ts` · `postgres-persistence.ts` · `snapshot-storage.ts` · `store.ts` · `service.ts`

---

## 4. 용량이 커지는 경로

undo/redo **탐색만**으로는 스냅샷이 늘지 않는다. **save(push)** 할 때만 한 줄 추가된다.

```
1 save → 1 snapshot (gzip, 대부분 parent diff)
파일당 최대 N개 (OD_FILE_REVISION_RETENTION_LIMIT, 기본 30)
```

**대략적 상한 (파일 1개):**

```
≤ N × avg(compressed_snapshot_bytes)
```

예: deck 200KB, diff 30KB, N=30 → 수 MB/파일. 프로젝트에 HTML 파일이 여러 개면 선형 증가.

---

## 5. 용량 관리 설계 (4층)

```text
pushRevision
├─ [동기] INSERT + writeProjectFile (+ truncate 시 동기 prune)
├─ [즉시 반환]
└─ [비동기] scheduleRevisionDeferredSweep
       ├─ count retention (chain-aware, PUSH_PRUNE_MAX/패스)
       └─ byte compaction (chain-aware quota)

[6h GC] runFileRevisionGc
├─ orphan BLOB / multi-pass global retention (uncapped) / byte compaction
├─ disk orphan sweep (files 모드)
└─ metrics + gc_last_success
```

### 5.1 Push 직후 — deferred sweep (비동기)

push는 **동기 count retention을 제거**했다. 성공 push 직후 `scheduleRevisionDeferredSweep`가 단일 큐에서 retention + compaction을 처리한다 (`deferred-sweep.ts`).

| 패스 | 동작 | 삭제 상한 |
|------|------|-----------|
| Count retention | `(project_id, file_name)` 초과분 prune | `OD_FILE_REVISION_PUSH_PRUNE_MAX` (기본 8, 최대 100) |
| Byte compaction | 글로벌/soft-cap snapshot byte budget | 동일 cap (GC는 uncapped) |

환경 변수:

| 변수 | 기본 | 설명 |
|------|------|------|
| `OD_FILE_REVISION_RETENTION_LIMIT` | `30` (2~200) | 파일당 유지 revision **메타 row** 상한 |
| `OD_FILE_REVISION_PUSH_PRUNE_MAX` | `8` | deferred sweep **1패스** 최대 삭제 row 수 |
| `OD_FILE_REVISION_MAX_SNAPSHOT_BYTES` | contracts default | 단일 스냅샷 soft cap |
| `OD_FILE_REVISION_MAX_TOTAL_BYTES` | contracts default (`0`=무제한) | 글로벌 snapshot byte budget |

truncate push(undo 후 새 save)는 redo branch 제거가 UX에 직결되므로 **동기** `pruneOldestFileRevisionsLimited`를 유지한다.

### 5.1.1 Chain-aware pruning

`prune-chain.ts` — `selectChainAwarePruneIds`:

- survivor N개(최신 `keep` rows)를 decode할 때 필요한 **checkpoint + diff chain**을 `collectRequiredRevisionIdsForSurvivors`로 계산
- chain에 필요한 row는 삭제 대상에서 제외
- quota/compaction 경로도 `isRevisionChainSafeToDelete`로 동일 규칙 적용

**의도:** retention limit 아래로 메타 row를 줄이되, undo restore가 깨지지 않게 한다.

### 5.1.2 Stuck excess · `retentionPending` (운영·UX)

짧은 chain + checkpoint interval(`OD_FILE_REVISION_FULL_SNAPSHOT_INTERVAL`, 기본 5) 조합에서는 **count retention이 0건**일 수 있다. 예: 파일당 4 revision, limit=2 — survivor 2개를 decode하려면 중간 checkpoint가 필요하면 **삭제 가능 row가 없음**.

| 신호 | 의미 |
|------|------|
| `remainingExcess` / `deferredExcessByTarget` | chain-safe 필터 후에도 limit 초과 row 수 |
| `retentionPending` (list API) | `revisionCount > retentionLimit` **또는** deferred excess > 0 |
| History 패널 i18n | `fileRevision.history.retentionPending` — “오래된 편집 기록 정리 중” |

**완화 경로:**

1. **deferred sweep 재큐** — `pruned > 0`일 때만 해당 target 재스케줄 (pruned=0 + excess>0 무한 루프 방지)
2. **GC multi-pass** — `enforceGlobalFileRevisionRetention`이 target별 `while` 루프로 **uncapped** chain-safe prune 반복
3. **다음 full checkpoint push** — 새 full snapshot이 chain을 짧게 만들면 이후 패스에서 삭제 가능 row 증가

**정상 vs 조사 필요:**

| 상태 | 해석 |
|------|------|
| `retention_deferred_excess` > 0, queue=0, GC age < 7h | checkpoint 때문에 **일시적 stuck** — 다음 push/GC 후 감소 기대 |
| excess > 0 **24h+**, `gc_last_success` stale | GC worker 중단·실패 의심 — 로그·`/api/metrics` 확인 |
| excess 급증 + snapshot_bytes 급증 | retention/compaction lag 또는 byte budget 미적용 — env·sweep 로그 확인 |

Web: History 패널 열림 + `retentionPending` 시 **4초 간격** `listProjectFileRevisions` 폴링으로 목록 자동 갱신.

### 5.2 주기적 — GC worker

부팅 시 1회 + interval sweep (`startFileRevisionGc`, `gc.ts`).

| 단계 | 동작 |
|------|------|
| Orphan BLOB | `file_revision_snapshots` 중 `file_revisions`에 없는 row 삭제 |
| Global retention | 모든 `(project_id, file_name)` — **multi-pass uncapped** chain-aware prune |
| Byte compaction | `runDeferredRevisionSnapshotCompaction` (uncapped) |
| Orphan files | 디스크 `.od/revisions/**` 중 메타에 없는 파일 (`files` 모드·마이그레이션 잔여) |
| Metrics | `collectFileRevisionStorageStats` → gauge 갱신, `markFileRevisionGcSuccess()` |
| VACUUM (선택) | sqlite 스냅샷 모드에서 삭제 후 `app.sqlite` 축소 |

환경 변수:

| 변수 | 기본 | 설명 |
|------|------|------|
| `OD_FILE_REVISION_GC_INTERVAL_MS` | `21600000` (6h) | `0` 이면 GC 비활성 |
| `OD_FILE_REVISION_LOCK_TIMEOUT_MS` | `15000` | postgres push/restore advisory lock (`0` = 무한 대기) |
| `OD_FILE_REVISION_GC_VACUUM` | sqlite dev on | Postgres는 RDS autovacuum |
| `OD_FILE_REVISION_FULL_SNAPSHOT_INTERVAL` | `5` | full checkpoint 주기 — stuck excess와 직결 |

프로젝트 삭제 시: Postgres snapshot 선삭제 + `deleteProjectRevisionSnapshotTree` (files 모드 disk tree).

**Postgres 용량:** daemon은 row DELETE만 수행. 디스크 회수는 RDS `autovacuum` 운영 파라미터로 관리.

### 5.3 운영자 — 로컬 dev VACUUM (sqlite 모드만)

```bash
od daemon db vacuum --json
```

Teamver Postgres 모드에서는 위 명령이 노드 로컬 `app.sqlite`만 축소하며, revision 스냅샷 바이트와 무관하다.

---

## 6. 모니터링

### 6.1 Prometheus (`GET /api/metrics`)

daemon `prom-client` registry에 file-revision gauge가 등록된다. Teamver는 ALB/nginx 뒤 daemon pod에서 scrape하거나, ops sidecar가 `/api/metrics`를 폴링한다.

| Gauge | 설명 | 갱신 시점 |
|-------|------|-----------|
| `od_file_revision_snapshot_bytes` | 저장 snapshot 총 바이트 (BLOB + `files` 모드 disk) | GC tick · storage stats 수집 |
| `od_file_revision_snapshot_rows` | `file_revision_snapshots` row 수 | 동일 |
| `od_file_revision_orphan_snapshot_rows` | 메타 없는 orphan snapshot row | 동일 |
| `od_file_revision_metadata_rows` | `file_revisions` row 수 | 동일 |
| `od_file_revision_retention_deferred_excess` | deferred sweep 후에도 limit 초과인 **합계** excess row | deferred sweep 완료 시 |
| `od_file_revision_deferred_sweep_queue_depth` | 대기 중 retention target + compaction flag | sweep 시작/완료 시 |
| `od_file_revision_gc_last_success_unix` | 마지막 성공 GC sweep Unix timestamp (초) | GC 성공 시 |

**로컬 확인:**

```bash
curl -sS "http://127.0.0.1:7456/api/metrics" | grep od_file_revision
```

**예시 (정상 idle):**

```text
od_file_revision_snapshot_bytes 2457600
od_file_revision_snapshot_rows 42
od_file_revision_metadata_rows 42
od_file_revision_retention_deferred_excess 0
od_file_revision_deferred_sweep_queue_depth 0
od_file_revision_gc_last_success_unix 1754294400
```

코드: `apps/daemon/src/file-revisions/metrics.ts` · `gc.ts` · `deferred-sweep.ts`

### 6.2 GC sweep 로그 (stdout JSON)

```json
{
  "orphanSnapshotsRemoved": 2,
  "orphanSnapshotBytesReclaimed": 4096,
  "retentionRevisionsPruned": 12,
  "globalBudgetRevisionsPruned": 0,
  "globalBudgetBytesReclaimed": 0,
  "orphanFilesRemoved": 1,
  "vacuum": null
}
```

`od daemon db status` / `inspectSqliteDatabase` — `file_revisions`, `file_revision_snapshots` row count 확인.

### 6.3 권장 알람 · 대시보드

| 우선순위 | 조건 | 조치 |
|----------|------|------|
| **P1** | `time() - od_file_revision_gc_last_success_unix > 86400` (24h) | GC interval 6h — worker 중단·`OD_FILE_REVISION_GC_INTERVAL_MS=0`·crash loop 조사 |
| **P2** | `od_file_revision_retention_deferred_excess > 0` **24h 연속** | §5.1.2 stuck excess — GC 로그·checkpoint interval·push burst 확인 |
| **P2** | `od_file_revision_deferred_sweep_queue_depth > 0` **1h+** | sweep in-flight hang — daemon 로그 `[file-revisions] deferred sweep failed` |
| **P3** | `od_file_revision_orphan_snapshot_rows > 0` **6h+** | orphan prune 실패 — maintenance/GC 오류 |
| **P3** | `od_file_revision_snapshot_bytes` 급증 (일일 +50% 등) | retention limit·byte budget env, 프로젝트 burst 편집 |

CloudWatch 예시 (Prometheus → AMP / custom metric 가정):

```text
# GC stale
time() - od_file_revision_gc_last_success_unix > 86400

# Deferred work stuck
od_file_revision_retention_deferred_excess > 0
```

대시보드 권장 패널:

1. snapshot bytes + metadata rows (용량 추이)
2. deferred excess + queue depth (sweep backlog)
3. gc_last_success age (GC health)
4. orphan snapshot rows (정리 실패)

### 6.4 UI 신호 (`retentionPending`)

list API `retentionPending: true`일 때 History 패널이 “정리 중” 힌트를 표시한다. daemon 측 SSOT는 §5.1.2. support triage 시 같은 파일에 대해 metrics excess와 함께 보면 sweep lag vs checkpoint stuck을 구분할 수 있다.

---

## 7. Teamver 배포 (필수 env)

**env example SSOT:** [`.env.staging.example`](../deploy/teamver/.env.staging.example) · [`.env.production.example`](../deploy/teamver/.env.production.example) · 로컬 [`.env.example`](../deploy/.env.example)

### 7.1 스택 깊이 (`OD_FILE_REVISION_RETENTION_LIMIT`) 권장값

| 환경 | 권장 | 비고 |
|------|------|------|
| **local dev** | **30** (미설정 = 코드 기본) | undo 여유, `deploy/.env.example` |
| **Teamver staging** | **20** | 용량·QA 균형 |
| **Teamver production** | **20** (시작) | `od_file_revision_snapshot_bytes` 모니터 후 **15~30** 조정 |
| runbook 하한 | **15** | 그 이하 → checkpoint **stuck excess**·`retentionPending` 빈번 |

- **범위:** 2~200 (`resolveFileRevisionRetentionLimit`)
- **의미:** 파일당 서버에 남기는 revision row 수 = History 패널 “서버 보관 N개”
- **용량 감:** deck ~80KB × N ≈ N×80KB/파일 (diff 압축 시 더 작음)
- **byte 상한과 병행:** count만으로 부족하면 `OD_FILE_REVISION_MAX_TOTAL_BYTES` 설정

### 7.2 env 블록 (staging / production)

```env
OD_DAEMON_DB=postgres
OD_PG_DATABASE=teamver_design_daemon_staging   # 환경별
OD_PG_HOST=...
OD_PG_PASSWORD=...

# 스냅샷 — OD_DAEMON_DB=postgres 이면 기본 postgres (별도 설정 불필요)
# OD_FILE_REVISION_SNAPSHOT_STORAGE=postgres

# undo/redo 스택 깊이 (파일당) — §7.1 권장 20
OD_FILE_REVISION_RETENTION_LIMIT=20
OD_FILE_REVISION_PUSH_PRUNE_MAX=8
OD_FILE_REVISION_GC_INTERVAL_MS=21600000
OD_FILE_REVISION_LOCK_TIMEOUT_MS=15000
# OD_FILE_REVISION_FULL_SNAPSHOT_INTERVAL=5
# OD_FILE_REVISION_MAX_TOTAL_BYTES=0
# OD_FILE_REVISION_MAX_SNAPSHOT_BYTES=8388608
```

daemon 부팅 시 `migratePostgresDaemonSchema` 가 v8 `file_revisions` / `file_revision_snapshots` 테이블을 생성한다.

**검증:** `bash deploy/teamver/scripts/verify_file_revision_retention.sh` (metrics · optional burst)

---

## 8. 로드맵 (잔여)

| 단계 | 내용 | 상태 |
|------|------|------|
| hydrate | 프로젝트 접근 시 Postgres → sqlite 메타 warm | [x] `durable-store.ts` · `warmProjectFromPostgres` |
| advisory lock | 동시 push/restore 시 sequence race 방지 | [x] `postgres-lock.ts` · `OD_FILE_REVISION_LOCK_TIMEOUT_MS` |
| chain-aware prune | checkpoint 보존 retention/compaction | [x] `prune-chain.ts` · Phase 2026-08 |
| deferred sweep | push 비동기 retention + compaction 단일 큐 | [x] `deferred-sweep.ts` |
| Prometheus metrics | 7개 gauge (bytes/rows/deferred/GC) | [x] §6 · `metrics.ts` |
| S3 blob | 초대형 deck 전용 외부 blob 백엔드 (현재는 Postgres BYTEA로 충분) | [-] |
| Postgres prune integration test | `pruneOldestFileRevisionsDurableLimited` e2e | [x] `file-revisions-prune-chain-durable.integration.test.ts` |

---

## 9. 코드 맵

| 파일 | 역할 |
|------|------|
| `file-revisions/durable-store.ts` | PG SSOT, sqlite hydrate, durable delete/prune |
| `file-revisions/postgres-lock.ts` | per-file advisory lock (push/restore) |
| `file-revisions/snapshot-storage.ts` | BLOB CRUD, storage mode resolve |
| `file-revisions/store.ts` | read/write, files↔sqlite 라우팅 |
| `file-revisions/maintenance.ts` | orphan/retention sweep, disk 정리, multi-pass GC retention |
| `file-revisions/deferred-sweep.ts` | push 비동기 retention + compaction 큐 |
| `file-revisions/prune-chain.ts` | chain-aware prune selection |
| `file-revisions/compaction.ts` | byte budget compaction (deferred-sweep 위임) |
| `file-revisions/metrics.ts` | Prometheus gauge 7종 |
| `file-revisions/gc.ts` | periodic timer |
| `storage/project-scratch-sync-exclude.ts` | S3 sync 제외 |
| `db.ts` `deleteProject` | 프로젝트 삭제 시 BLOB 선삭제 |

---

## 11. 검증

### 11.1 자동 (CI / 로컬)

```bash
pnpm --filter @open-design/daemon exec vitest run \
  tests/file-revisions-multinode.integration.test.ts \
  tests/file-revisions-durable-store.test.ts \
  tests/file-revisions-postgres-lock.test.ts \
  tests/file-revisions-prune-chain-durable.integration.test.ts \
  tests/file-revisions-prune-chain.test.ts \
  tests/file-revisions-retention-sweep.test.ts \
  tests/file-revisions-metrics.test.ts \
  tests/file-revisions-compaction-integration.test.ts \
  tests/file-revisions-maintenance.test.ts \
  tests/file-revisions.test.ts
```

| 테스트 | 검증 시나리오 |
|--------|---------------|
| `file-revisions-multinode.integration.test.ts` | 노드 A push → 노드 B list/hydrate, truncate 후 stale row 제거, cross-node restore |
| `file-revisions-durable-store.test.ts` | PG→sqlite hydrate, transactional commit, head+count stale 감지 |
| `file-revisions-postgres-lock.test.ts` | advisory lock acquire/release, timeout, sequence conflict 감지 |
| `file-revisions-prune-chain-durable.integration.test.ts` | Postgres mock 경로 chain-aware durable prune |
| `file-revisions-prune-chain.test.ts` | unit — checkpoint 보존, excess 계산 |
| `file-revisions-retention-sweep.test.ts` | deferred retention sweep, re-queue 규칙 |
| `file-revisions-metrics.test.ts` | deferred/GC gauge 갱신 |
| `file-revisions-compaction-integration.test.ts` | push 후 deferred compaction 패스 |
| `file-revisions-maintenance.test.ts` | orphan BLOB, multi-pass GC retention |
| `file-revisions.test.ts` | HTTP API push/list/restore/truncate (sqlite files 모드) |

**메트릭 spot check:** §6.1 `curl .../api/metrics | grep od_file_revision`

**VM 스크립트 (burst QA optional):**

```bash
bash deploy/teamver/scripts/verify_file_revision_retention.sh
VERIFY_REVISION_BURST=1 VERIFY_REVISION_PROJECT_ID=<id> VERIFY_REVISION_FILE=deck.html \
  bash deploy/teamver/scripts/verify_file_revision_retention.sh
```

**Web retention UX:**

```bash
pnpm --filter @open-design/web exec vitest run \
  tests/components/FileRevisionHistoryPanel.test.tsx \
  tests/components/FileViewer.revision-history.test.tsx
```

### 11.2 staging 수동 (2-pod)

**상세 절차 SSOT:** [50-4 revision staging 머지·배포·검증 Runbook](./50-4_revision_staging_머지_배포_검증.md) §8.

요약 — 배포 후 **서로 다른 pod**에서 교차 실행:

1. Pod A: `deck.html` save (revision push)
2. Pod B: `GET .../revisions` — A와 동일 head·개수
3. Pod B: undo(restore parent) → Pod A에서 list 재확인
4. (선택) Pod A·B 동시 save — 한쪽 `409 FILE_REVISION_LOCK_TIMEOUT` 또는 순차 성공

데이터는 production HTTP API로만 시드한다 (테스트 backdoor 금지).

---

## 10. FAQ

### Q. RDS 쓰는데 왜 app.sqlite 얘기가 나오나?

DaemonDb가 postgres로 올라가도, daemon 프로세스는 historically `OD_DATA_DIR/app.sqlite`를 연다. **design-api RDS**와 **DaemonDb RDS**는 database가 다르고, revision은 후자(또는 전자가 postgres 전 노드의 sqlite)에 해당한다. 혼동 금지: **registry RDS ≠ undo RDS**.

### Q. sqlite 모드면 S3 용량은 줄어드나?

revision 바이트는 원래 S3 SSOT 대상이 아니어야 한다 (이제 sync 제외). **deck.html 본문**은 여전히 S3/scratch다.

### Q. retention 30이면 undo 30번?

**저장된 revision 30개** — undo 스택 깊이와 같다. 클라이언트 hot cache는 별도 LRU 8개.

### Q. GC 없이도 안전한가?

push마다 retention이 돌아가 **정상 경로는 안전**하다. GC는 프로젝트 삭제·장애·files 잔여물 **안전망**이다.

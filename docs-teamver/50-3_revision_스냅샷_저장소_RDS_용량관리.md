# 50-3 — Revision 스냅샷 저장소 · RDS 관계 · 용량 관리

**상태:** 구현 완료 (2026-07-31)  
**SSOT:** undo/redo 히스토리 **바이트**가 어디에 쌓이는지, Teamver **RDS**와 어떻게 다른지, 용량을 어떻게 제한·정리하는지.

**관련:** [50_undo_redo_설계](./50_undo_redo_설계.md) · [50-1 구현현황](./50-1-구현현황-undo_redo.md) · [50-2 Canvas 비교](./50-2_Teamver_Canvas_vs_Design_Undo_비교.md) · [39_7 scratch·DaemonDb FAQ](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md) · [39_9 DaemonDb RDS](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md)

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

## 5. 용량 관리 설계 (3층)

### 5.1 실시간 — push 시 retention

`createFileRevisionService.pushRevision` → `enforceRetention`:

1. `pruneOldestFileRevisions` — DB 메타에서 초과분 삭제  
2. `deleteRevisionSnapshots` — BLOB + (있다면) `.od/revisions` 파일 삭제  

환경 변수: `OD_FILE_REVISION_RETENTION_LIMIT` (2~200, 기본 30)

### 5.2 주기적 — GC worker

부팅 시 1회 + interval sweep (`startFileRevisionGc`, `apps/daemon/src/file-revisions/gc.ts`).

| 단계 | 동작 |
|------|------|
| Orphan BLOB | `file_revision_snapshots` 중 `file_revisions`에 없는 row 삭제 (프로젝트 삭제·부분 실패 복구) |
| Global retention | 모든 `(project_id, file_name)` 에 대해 retention 재적용 (push 누락 안전망) |
| Orphan files | 디스크 `.od/revisions/**` 중 메타에 없는 `.snap.gz` / legacy `.html` 삭제 |
| VACUUM (선택) | sqlite 스냅샷 모드에서 삭제 후 `app.sqlite` 축소 |

환경 변수:

| 변수 | 기본 | 설명 |
|------|------|------|
| `OD_FILE_REVISION_GC_INTERVAL_MS` | `21600000` (6h) | `0` 이면 GC 비활성 |
| `OD_FILE_REVISION_LOCK_TIMEOUT_MS` | `15000` | postgres 모드 push/restore advisory lock 대기 (`0` = 무한 대기) |
| `OD_FILE_REVISION_GC_VACUUM` | sqlite dev 모드만 on | Postgres는 RDS autovacuum |
| `OD_FILE_REVISION_FULL_SNAPSHOT_INTERVAL` | `5` | full checkpoint 주기 |

프로젝트 삭제 시: Postgres `file_revision_snapshots` 선삭제 + `file_revisions` CASCADE.

**Postgres 용량:** daemon은 row DELETE만 수행. 디스크 회수는 RDS `autovacuum` 운영 파라미터로 관리.

### 5.3 운영자 — 로컬 dev VACUUM (sqlite 모드만)

```bash
od daemon db vacuum --json
```

Teamver Postgres 모드에서는 위 명령이 노드 로컬 `app.sqlite`만 축소하며, revision 스냅샷 바이트와 무관하다.

---

## 6. 모니터링

GC sweep 로그 (stdout JSON):

```json
{
  "orphanSnapshotsRemoved": 2,
  "orphanSnapshotBytesReclaimed": 4096,
  "retentionRevisionsPruned": 0,
  "orphanFilesRemoved": 1,
  "vacuum": null
}
```

`od daemon db status` / `inspectSqliteDatabase` — `file_revisions`, `file_revision_snapshots` row count 확인.

권장 알람 (운영):

- `file_revision_snapshots` row count 급증  
- `app.sqlite` + WAL 합산 크기 임계치  
- GC tick 연속 실패

---

## 7. Teamver 배포 (필수 env)

```env
OD_DAEMON_DB=postgres
OD_PG_DATABASE=teamver_design_daemon_staging   # 환경별
OD_PG_HOST=...
OD_PG_PASSWORD=...

# 스냅샷 — OD_DAEMON_DB=postgres 이면 기본 postgres (별도 설정 불필요)
# OD_FILE_REVISION_SNAPSHOT_STORAGE=postgres

OD_FILE_REVISION_RETENTION_LIMIT=15
OD_FILE_REVISION_GC_INTERVAL_MS=21600000
OD_FILE_REVISION_LOCK_TIMEOUT_MS=15000
```

daemon 부팅 시 `migratePostgresDaemonSchema` 가 v8 `file_revisions` / `file_revision_snapshots` 테이블을 생성한다.

---

## 8. 로드맵 (잔여)

| 단계 | 내용 | 상태 |
|------|------|------|
| hydrate | 프로젝트 접근 시 Postgres → sqlite 메타 warm | [x] `durable-store.ts` · `warmProjectFromPostgres` |
| advisory lock | 동시 push/restore 시 sequence race 방지 | [x] `postgres-lock.ts` · `OD_FILE_REVISION_LOCK_TIMEOUT_MS` |
| S3 blob | 초대형 deck 전용 외부 blob 백엔드 (현재는 Postgres BYTEA로 충분) | [-] |
| 메트릭 | Prometheus `od_file_revision_snapshot_bytes` gauge | [-] |

---

## 9. 코드 맵

| 파일 | 역할 |
|------|------|
| `file-revisions/durable-store.ts` | PG SSOT, sqlite hydrate, durable delete/prune |
| `file-revisions/postgres-lock.ts` | per-file advisory lock (push/restore) |
| `file-revisions/snapshot-storage.ts` | BLOB CRUD, storage mode resolve |
| `file-revisions/store.ts` | read/write, files↔sqlite 라우팅 |
| `file-revisions/maintenance.ts` | orphan/retention sweep, disk 정리 |
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
  tests/file-revisions-maintenance.test.ts \
  tests/file-revisions.test.ts
```

| 테스트 | 검증 시나리오 |
|--------|---------------|
| `file-revisions-multinode.integration.test.ts` | 노드 A push → 노드 B list/hydrate, truncate 후 stale row 제거, cross-node restore |
| `file-revisions-durable-store.test.ts` | PG→sqlite hydrate, transactional commit, head+count stale 감지 |
| `file-revisions-postgres-lock.test.ts` | advisory lock acquire/release, timeout, sequence conflict 감지 |
| `file-revisions-maintenance.test.ts` | orphan BLOB, retention GC |
| `file-revisions.test.ts` | HTTP API push/list/restore/truncate (sqlite files 모드) |

### 11.2 staging 수동 (2-pod)

배포 후 아래를 **서로 다른 pod**에서 교차 실행:

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

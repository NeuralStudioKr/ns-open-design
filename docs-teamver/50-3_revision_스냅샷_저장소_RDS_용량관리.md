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
| 용량 상한? | 파일당 retention + 주기 GC + (sqlite 모드) 선택적 VACUUM |

---

## 2. 저장층 5분면 (RDS 포함)

Teamver Design은 “DB가 하나”가 아니라 **역할별 저장소**가 나뉜다. revision undo는 **④ DaemonDb**에 속한다.

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
        │     projects, conversations, messages, file_revisions, …
        │     OD_DAEMON_DB=postgres 시 여기가 SSOT
        │     ※ file_revision_snapshots BLOB (sqlite 모드, Postgres BYTEA는 후속)
        │
        └─ open-design-daemon (EC2 pod)
              │
              ├─ ③ OD_DATA_DIR (노드 로컬)
              │     app.sqlite — OD_DAEMON_DB=sqlite 일 때 DaemonDb 파일
              │     OD_DAEMON_DB=postgres 일 때도 캐시·이중쓰기용 sqlite 잔존 가능
              │     scratch/projects/<id>/ — agent CWD (S3 모드)
              │
              ├─ ④ S3 (tenant prefix) — deck.html, assets SSOT
              │
              └─ ⑤ (구) .od/revisions/*.snap.gz — files 모드 또는 마이그레이션 잔여
```

### 2.1 “왜 OD_DATA_DIR의 app.sqlite인가?”

Open Design daemon은 부팅 시 `RUNTIME_DATA_DIR = resolve(OD_DATA_DIR)` 를 정하고, `openDatabase(..., { dataDir: RUNTIME_DATA_DIR })` 로 **`$OD_DATA_DIR/app.sqlite`** 를 연다 (`apps/daemon/src/db.ts`).

- **로컬 / 단일 노드 / `OD_DAEMON_DB` 미설정:** DaemonDb **전체**가 이 파일이다. `file_revisions` 메타와 `file_revision_snapshots` BLOB 모두 여기.
- **Teamver `OD_DAEMON_DB=postgres`:** 채팅·프로젝트 메타의 **durable SSOT는 RDS DaemonDb database**이다. 노드의 `app.sqlite`는 캐시·이중쓰기·마이그레이션 경로로 남을 수 있다 ([39_9](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md)).  
  **현재(2026-07-31):** `file_revision_snapshots` 마이그레이션은 **SQLite 경로에만** 존재. Postgres DaemonDb에 동일 테이블을 옮기는 것은 **Track B 후속**이다.

### 2.2 RDS 두 database — 헷갈리지 않기

| RDS database | 앱 | revision undo |
|--------------|-----|----------------|
| `teamver_design_*` | design-api (FastAPI) | **없음** |
| `teamver_design_daemon_*` | open-design-daemon | **있음** (`file_revisions` + 스냅샷) |

같은 RDS **인스턴스**, **database 이름만 다름** — 별도 RDS 머신을 추가하는 구조가 아니다 ([39_9 §1](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md)).

---

## 3. 스냅샷 저장 모드

환경 변수: **`OD_FILE_REVISION_SNAPSHOT_STORAGE`**

| 값 | 스냅샷 바이트 위치 | 비고 |
|----|-------------------|------|
| `files` (기본) | `<project>/.od/revisions/<file>/<id>.snap.gz` | 기존 동작, 호환 |
| `sqlite` | DaemonDb `file_revision_snapshots.compressed` BLOB | Teamver 권장 |

공통:

- **메타**는 항상 `file_revisions` 테이블 (DaemonDb).
- **canonical 파일** (`deck.html`)은 프로젝트 scratch/S3 — undo와 별개.
- 읽기: 활성 모드 우선, 반대쪽 **fallback** (마이그레이션·모드 전환 허용).
- S3 materialization: `.od/revisions/**` 는 sync-up/down **제외** (`isProjectScratchSyncExcludedRelpath`).

코드: `apps/daemon/src/file-revisions/store.ts` · `snapshot-storage.ts`

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
| `OD_FILE_REVISION_GC_VACUUM` | sqlite 모드면 `on` | 삭제 후 SQLite `VACUUM` |
| `OD_FILE_REVISION_FULL_SNAPSHOT_INTERVAL` | `5` | full checkpoint 주기 (diff 체인 길이) |

프로젝트 삭제 시: `deleteProject` 가 메타 CASCADE 전에 `deleteFileRevisionSnapshotsForProject` 로 BLOB 선삭제.

### 5.3 운영자 — 수동 VACUUM

대량 삭제 후 즉시 파일 축소:

```bash
od daemon db vacuum --json
# 또는 loopback POST /api/daemon/db/vacuum
```

GC의 자동 VACUUM은 **최소 10MB reclaim 후보 + 24h 간격** (과도한 lock 방지).

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

## 7. Teamver 배포 권장값

```env
# daemon container / EC2 env
OD_FILE_REVISION_SNAPSHOT_STORAGE=sqlite
OD_FILE_REVISION_RETENTION_LIMIT=15
OD_FILE_REVISION_GC_INTERVAL_MS=21600000
OD_FILE_REVISION_GC_VACUUM=1
OD_DAEMON_DB=postgres
OD_PG_DATABASE=teamver_design_daemon_staging   # 환경별
```

**주의:** Postgres DaemonDb에 `file_revision_snapshots` DDL이 아직 없으면, prod에서 `sqlite` 모드 BLOB는 **노드 로컬 app.sqlite**에만 쌓일 수 있다. 멀티노드에서 undo 히스토리 내구성을 맞추려면 **Postgres BYTEA 마이그레이션** 또는 **S3 blob 백엔드**가 다음 마일스톤이다.

---

## 8. 로드맵 (미구현)

| 단계 | 내용 |
|------|------|
| B5+ | Postgres `file_revision_snapshots BYTEA` + `OD_DAEMON_DB=postgres` 정합 |
| S3 blob | `RevisionSnapshotStore` 인터페이스, tenant prefix 아래 `revisions/` |
| 메트릭 | Prometheus `od_file_revision_snapshot_bytes` gauge |

---

## 9. 코드 맵

| 파일 | 역할 |
|------|------|
| `file-revisions/snapshot-storage.ts` | BLOB CRUD, storage mode resolve |
| `file-revisions/store.ts` | read/write, files↔sqlite 라우팅 |
| `file-revisions/maintenance.ts` | orphan/retention sweep, disk 정리 |
| `file-revisions/gc.ts` | periodic timer |
| `storage/project-scratch-sync-exclude.ts` | S3 sync 제외 |
| `db.ts` `deleteProject` | 프로젝트 삭제 시 BLOB 선삭제 |

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

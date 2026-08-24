# 50-1 구현현황 — Undo/Redo

**문서 번호:** 50-1  
**설계 SSOT:** [50 Undo/Redo 설계](./50_undo_redo_설계.md)  
**비교 문서:** [50-2 Teamver Canvas vs Design Undo 비교](./50-2_Teamver_Canvas_vs_Design_Undo_비교.md)  
**배포·검증 Runbook:** [50-4 staging 머지·배포·검증](./50-4_revision_staging_머지_배포_검증.md)  
**브랜치:** `staging`  
**최종 갱신:** 2026-08-04

---

## Phase 0 — 툴바 UI + Manual history 위임

| 항목 | 상태 | 비고 |
|------|------|------|
| 설계 문서 `50_undo_redo_설계.md` | [x] | |
| 구현현황 `50-1-구현현황-undo_redo.md` | [x] | |
| `FileViewerUndoRedoToolbar` 컴포넌트 | [x] | Undo/Redo 아이콘 버튼 |
| `FileViewer` 툴바 통합 (편집 버튼 왼쪽) | [x] | `data-testid` file-viewer-undo/redo |
| `undoManualEdit` / `redoManualEdit` 위임 | [x] | Phase 0는 기존 in-memory history |
| 단위 테스트 | [x] | disabled/enabled, click handler |
| i18n | [x] | `manualEdit.undo` / `manualEdit.redo` 재사용 |

---

## Phase 1 — Daemon revision + 서버 undo

| 항목 | 상태 | 비고 |
|------|------|------|
| `packages/contracts/src/api/revisions.ts` | [x] | |
| SQLite `file_revisions` 테이블 | [x] | `migrateFileRevisions` |
| Snapshot 디렉터리 `.od/revisions/` | [x] | `file-revisions/store.ts` (기본 `files`) |
| SQLite `file_revision_snapshots` BLOB | [x] | `OD_FILE_REVISION_SNAPSHOT_STORAGE=sqlite` 시 daemon DB에만 저장 |
| `GET/POST .../revisions` API | [x] | `project-routes.ts` |
| `POST .../revisions/:id/restore` | [x] | |
| `RevisionController` (web) | [x] | `revision-stack.ts` + FileViewer 연동 |
| Manual undo → 서버 restore 전환 | [x] | in-memory stack 제거 |
| 키보드 ⌘Z / Ctrl+Z undo·redo | [x] | draw overlay 비활성 시에만 |
| `od project revisions` CLI | [x] | list + restore |
| Daemon tests | [x] | `file-revisions.test.ts` + postgres multinode integration |

---

## Phase 2 — Agent 편집 undo

| 항목 | 상태 | 비고 |
|------|------|------|
| `persistArtifact` 성공 시 push | [x] | `pushProjectFileRevision` |
| AI 성공 toast “실행 취소” CTA | [x] | Toast action → restore parent revision |
| scoped comment label (`deriveLabel`) | [x] | `deriveAgentRevisionLabel` |
| active revision sequence bridge | [x] | `revision-active-sequence.ts` |

---

## Phase 3 — Inspect + History panel

| 항목 | 상태 | 비고 |
|------|------|------|
| Inspect save push | [x] | `pushProjectFileRevision`, `source: inspect` |
| History 사이드 패널 UI | [x] | `FileRevisionHistoryPanel` + toolbar toggle |
| analytics `revision_*` events | [x] | push/undo/redo/restore |

---

## 충돌 감지 (설계 §8.3·§9)

| 항목 | 상태 | 비고 |
|------|------|------|
| disk ≠ cursor snapshot 감지 | [x] | `reconcileRevisionWithDisk` |
| 스택 reset + toast | [x] | cursor → head, `revisionConflictToast` |
| head ≠ disk 시 undo 비활성화 | [x] | `revisionStackInvalidated` |
| revision API fetch content | [x] | `fetchProjectFileRevisionContent` |

---

## Phase 4 — 최적화 (요구 시)

| 항목 | 상태 | 비고 |
|------|------|------|
| gzip diff storage | [x] | `.snap.gz` + prefix/suffix diff, legacy `.html` 읽기 |
| cross-file transaction | [-] | 설계 §1 Non-goal (프로젝트 전체 multi-file undo). 요구 발생 시 별도 설계 |

---

## Phase A — client-cache fast undo (체감 속도)

| 항목 | 상태 | 비고 |
|------|------|------|
| `revision-restore.ts` | [x] | `canApplyRevisionFromClientCache`, `cacheParentRevisionOnPush` |
| 캐시 hit 시 UI 즉시 갱신 | [x] | `applyRestoredSourceToViewer` |
| disk restore 백그라운드 sync | [x] | `revisionDiskSyncPromiseRef` — save/undo 전 `awaitRevisionDiskSync` |
| push 시 parent revision 캐시 | [x] | 첫 undo도 fast path 가능 |
| 백그라운드 restore 실패 시 스택 invalidate | [x] | `setRevisionStackInvalidated(true)` |
| 단위 테스트 | [x] | `revision-restore.test.ts` |
| 통합 테스트 | [x] | `FileViewer.revision-client-restore.test.tsx` (jsdom 환경 이슈 시 unit으로 대체) |

### Phase B — optimistic undo 확장 + style batch commit

| 항목 | 상태 | 비고 |
|------|------|------|
| snapshot API fetch hit → UI 즉시 + background restore | [x] | cache miss여도 `resolveRevisionSnapshotContent` 성공 시 Phase A와 동일 경로 |
| snapshot 없을 때만 blocking restore | [x] | fetch text fallback |
| 연속 style flush no-op revision skip | [x] | `manual-edit-style-batch.ts` — source diff 후 push 생략 |
| autosave debounce 유지 | [x] | `MANUAL_EDIT_STYLE_AUTOSAVE_MS` + batch diff on flush |

---

## Phase C — Layer A micro-undo (51 드래그 리사이즈)

| 항목 | 상태 | 비고 |
|------|------|------|
| 8방향 resize overlay | [x] | `ManualEditResizeOverlay` |
| 드래그 중 preview-only (Layer A) | [x] | `od-edit-preview-style` |
| pointerup 1회 commit (Layer B) | [x] | `flushManualEditStyleSave({ force: true })` |
| autosave pause during drag | [x] | revision push 없이 미리보기만 |
| Esc 취소 | [x] | disk/revision 불변 |
| undo 1스텝 = resize 전체 | [x] | 기존 revision stack (50) |

---

## Phase D — daemon snapshot chain 최적화

| 항목 | 상태 | 비고 |
|------|------|------|
| push 시 parentContent = disk read | [x] | snapshot chain walk 제거 |
| checkpoint-forward snapshot decode | [x] | `sliceRevisionChainFromCheckpoint` + `readRevisionSnapshotFromChain` |
| `OD_FILE_REVISION_FULL_SNAPSHOT_INTERVAL` | [x] | 기본 5, `resolveFullSnapshotInterval()` |
| `getRevisionAncestry` (DB metadata) | [x] | read path metadata lookup |
| 단위 테스트 | [x] | `file-revisions-store.test.ts` |

---

## Phase E — chain-aware retention · deferred sweep · ops metrics (2026-08)

| 항목 | 상태 | 비고 |
|------|------|------|
| `prune-chain.ts` chain-aware selection | [x] | checkpoint 보존 prune |
| push 비동기 deferred sweep | [x] | `deferred-sweep.ts` — retention + compaction 단일 큐 |
| `OD_FILE_REVISION_PUSH_PRUNE_MAX` | [x] | deferred 1패스 삭제 cap (기본 8) |
| GC multi-pass uncapped retention | [x] | `enforceGlobalFileRevisionRetention` while 루프 |
| infinite re-queue 방지 | [x] | `pruned > 0`일 때만 retention target 재스케줄 |
| list API `retentionPending` | [x] | excess > 0 또는 count > limit |
| History 패널 힌트 + i18n (19 locale) | [x] | `fileRevision.history.retentionPending` |
| History 패널 poll (4s) | [x] | `FileViewer` — panel open + pending |
| Prometheus gauge 7종 | [x] | §50-3 §6 — bytes/rows/deferred/GC |
| stuck excess 운영 문서 | [x] | [50-3 §5.1.2](./50-3_revision_스냅샷_저장소_RDS_용량관리.md) |
| Postgres durable prune integration test | [x] | `file-revisions-prune-chain-durable.integration.test.ts` |
| Human verification (30+ push / 2-node) | [~] | `verify_file_revision_retention.sh --burst` · [50-4 §8](./50-4_revision_staging_머지_배포_검증.md) |

**문서 SSOT:** [50-3](./50-3_revision_스냅샷_저장소_RDS_용량관리.md) §5~§6

---

## 마무리 체크리스트

| 항목 | 상태 |
|------|------|
| `staging` 최신 머지 | [x] |
| `feat/undo-redo` → `staging` 머지 | [x] |
| undo/redo + manual-edit regression tests | [x] |
| daemon file-revisions tests | [x] |
| nested markup (inline salvage + flattenNestedMarkup) | [x] |
| revision content cache + reconcile skip + prefetch | [x] | `revision-content-cache.ts` — LRU 8 entries, 16MB/파일, 4MB/항목, prefetch `byteSize` skip |
| `OD_FILE_REVISION_RETENTION_LIMIT` env | [x] | daemon `resolveFileRevisionRetentionLimit()` — **권장** dev 30 · Teamver 20 ([50-3 §7.1](./50-3_revision_스냅샷_저장소_RDS_용량관리.md#71-스택-깊이-od_file_revision_retention_limit-권장값)) |
| `OD_FILE_REVISION_SNAPSHOT_STORAGE` env | [x] | `postgres` (Teamver 기본) \| `sqlite` \| `files` — [50-3](./50-3_revision_스냅샷_저장소_RDS_용량관리.md) |
| Postgres `file_revision_snapshots` BYTEA (schema v8) | [x] | `DAEMON_DB_POSTGRES_MIGRATION_V8` |
| Postgres durable revision SSOT (멀티노드) | [x] | `durable-store.ts` — transactional commit, head+count hydrate, warm/GC |
| Postgres advisory lock (push/restore) | [x] | `postgres-lock.ts` — `OD_FILE_REVISION_LOCK_TIMEOUT_MS` |
| 주기 GC + orphan 정리 | [x] | `file-revisions/gc.ts` · `OD_FILE_REVISION_GC_INTERVAL_MS` |
| 프로젝트 삭제 시 BLOB 선삭제 | [x] | `deleteFileRevisionSnapshotsForProject` |
| History panel retention hint | [x] | i18n `fileRevision.history.retentionHint` |
| History `retentionPending` hint + poll | [x] | i18n + 4s poll when panel open |
| List API `retentionLimit` → History 패널 | [x] | daemon list 응답, 하드코드 제거 |
| 충돌 토스트는 head ≠ disk일 때만 | [x] | cursor만 어긋나면 조용히 reset |
| undo/redo 비활성 tooltip | [x] | `fileRevision.undo.unavailableTooltip` |
| Agent push revision content cache | [x] | `ProjectView` → `setRevisionContentCache` |
| Phase A client-cache fast undo | [x] | `revision-restore.ts`, background disk sync |

---

## 검증 명령 (누적)

**staging 배포 후 수동 검증:** [50-4 §8](./50-4_revision_staging_머지_배포_검증.md#8-2-pod-교차-검증-필수-게이트) (2-pod 교차 시나리오 SSOT).

```bash
# Phase 0
pnpm --filter @open-design/web exec vitest run tests/components/FileViewer.undo-redo-toolbar.test.tsx

# Phase 1+
pnpm --filter @open-design/daemon exec vitest run \
  tests/file-revisions-multinode.integration.test.ts \
  tests/file-revisions-durable-store.test.ts \
  tests/file-revisions-postgres-lock.test.ts \
  tests/file-revisions-prune-chain-durable.integration.test.ts \
  tests/file-revisions-prune-chain.test.ts \
  tests/file-revisions-retention-sweep.test.ts \
  tests/file-revisions-metrics.test.ts \
  tests/file-revisions-maintenance.test.ts \
  tests/file-revisions.test.ts
pnpm --filter @open-design/web test
```

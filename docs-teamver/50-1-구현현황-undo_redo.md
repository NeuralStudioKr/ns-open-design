# 50-1 구현현황 — Undo/Redo

**문서 번호:** 50-1  
**설계 SSOT:** [50 Undo/Redo 설계](./50_undo_redo_설계.md)  
**브랜치:** `staging` (머지 완료, `2047f7c3b`)  
**최종 갱신:** 2026-07-30

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
| Snapshot 디렉터리 `.od/revisions/` | [x] | `file-revisions/store.ts` |
| `GET/POST .../revisions` API | [x] | `project-routes.ts` |
| `POST .../revisions/:id/restore` | [x] | |
| `RevisionController` (web) | [x] | `revision-stack.ts` + FileViewer 연동 |
| Manual undo → 서버 restore 전환 | [x] | in-memory stack 제거 |
| 키보드 ⌘Z / Ctrl+Z undo·redo | [x] | draw overlay 비활성 시에만 |
| `od project revisions` CLI | [x] | list + restore |
| Daemon tests | [x] | `file-revisions.test.ts` |

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

## 마무리 체크리스트

| 항목 | 상태 |
|------|------|
| `staging` 최신 머지 | [x] |
| `feat/undo-redo` → `staging` 머지 | [x] |
| undo/redo + manual-edit regression tests | [x] |
| daemon file-revisions tests | [x] |
| nested markup (inline salvage + flattenNestedMarkup) | [x] |

---

## 검증 명령 (누적)

```bash
# Phase 0
pnpm --filter @open-design/web exec vitest run tests/components/FileViewer.undo-redo-toolbar.test.tsx

# Phase 1+
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```

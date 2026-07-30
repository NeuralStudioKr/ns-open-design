# 50-1 구현현황 — Undo/Redo

**문서 번호:** 50-1  
**설계 SSOT:** [50 Undo/Redo 설계](./50_undo_redo_설계.md)  
**브랜치:** `feat/undo-redo`  
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
| `packages/contracts/src/api/revisions.ts` | [ ] | |
| SQLite `file_revisions` 테이블 | [ ] | |
| Snapshot 디렉터리 `.od/revisions/` | [ ] | |
| `GET/POST .../revisions` API | [ ] | |
| `POST .../revisions/:id/restore` | [ ] | |
| `RevisionController` (web) | [ ] | |
| Manual undo → 서버 restore 전환 | [ ] | in-memory stack 제거 |
| `od project revisions` CLI | [ ] | list + restore |
| Daemon tests | [ ] | |

---

## Phase 2 — Agent 편집 undo

| 항목 | 상태 | 비고 |
|------|------|------|
| `persistArtifact` 성공 시 push | [ ] | before/after capture |
| AI 성공 toast “실행 취소” CTA | [ ] | |
| scoped comment label (`deriveLabel`) | [ ] | |

---

## Phase 3 — Inspect + History panel

| 항목 | 상태 | 비고 |
|------|------|------|
| Inspect save push | [ ] | |
| History 사이드 패널 UI | [ ] | revision 목록 + restore |
| analytics `revision_*` events | [ ] | |

---

## Phase 4 — 최적화 (요구 시)

| 항목 | 상태 | 비고 |
|------|------|------|
| gzip diff storage | [ ] | |
| cross-file transaction | [ ] | |

---

## 검증 명령 (누적)

```bash
# Phase 0
pnpm --filter @open-design/web exec vitest run tests/components/FileViewer.undo-redo-toolbar.test.tsx

# Phase 1+
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```

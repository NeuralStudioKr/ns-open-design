# 0914-N18-3 구현현황 — deck-patch `slide-N` index 추론 (loop530)

## 변경

| 파일 | 내용 |
|---|---|
| `artifacts/deck-patch.ts` | `resolveSlideIndexFromNumberedSlideClass` — `slide-2` → index 1 |
| `ProjectView.tsx` | unscoped `deck_patch_parse_failed` → `rejected` (scope 배너 오진 방지) |
| 테스트 | deck-patch / scoped-deck-patch |

## 검증

- 사용자 에러와 동일 open tag 재현: 이전 fail → 이제 ok
- 관련 테스트 82 passed

## 배포

`ns-open-design` 은 ns_cicd 미등록. staging 반영은 Design deploy 파이프라인 필요.

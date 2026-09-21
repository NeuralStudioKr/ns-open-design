# 0916-N07-1 상위설계 · Round 5 retry / seed / fallback UX 회귀 검사

## 대상

- LOOK seed fallback (`clone_look_seed_fallback`)
- Outline deck fallback (`outline_deck_fallback`)
- Emergency deck fallback (`emergency_deck_fallback`)
- Stalled partial deck (`stalled_partial_deck`)
- Unscoped `deck_patch_parse_failed` — `scope-rejected` 오분류 방지

## 실행 결과

### Group A — 관련 테스트 5 파일

`pnpm --filter @open-design/web test --run
clone-look-seed-recovery element-patch-empty-fallback
scoped-comment-deck-patch-empty-body runtime/slide-deliverable-recovery
teamver/stalledRunDeckSalvage`

→ **5 files pass · 64 tests pass**

### Group B — deck-patch parse (unscoped 회귀 방지)

`pnpm --filter @open-design/web test --run
infer-slide-index-from-deck-html edit-mode/scoped-deck-patch
merge-scoped-comment-style-fallback`

→ **3 files pass · 72 tests pass**

## 결론

**검토 완료 · 변경 없음.** 지난 라운드에서 도입된 LOOK seed / outline /
emergency fallback + `data-slide-index` 추론 로직 모두 회귀 없음.

## 참고 (pre-existing 실패)

`components/ProjectView.run-cleanup.test.tsx`의 16 실패는 이 세션 이전부터
존재하는 회귀 (`git stash` 후에도 동일 실패). Round 5와 무관. 별도 백로그로
잡아둘 것.

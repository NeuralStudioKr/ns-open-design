# 0914-N18-1 상위설계 — deck-patch `slide-N` 클래스 index 추론 (loop530)

## 증상

```
error_code: deck_patch_parse_failed
사유: deck-patch section missing data-slide-index attribute
open tag: <section class="slide slide-2" style="width:1920px;height:1080px;box-sizing:bord…">
terminalPersistResultKind: scope-rejected
```

## 원인

1. MiniMax 가 `data-slide-index` 를 빼고 템플릿 클래스 `slide-2` 만 유지.
2. 루프529 복구(`resolveSlideIndexBySectionClass`)는 **현재 덱에도 같은 클래스**가 있을 때만 성공.
3. 현재 덱에서 `slide-N` 클래스가 빠졌거나 `fallbackSlideIndexes` 가 비어 있거나 복수면 파싱 실패.
4. 실패가 `scope-rejected` 로 포장되면 "댓글 대상 밖" 배너로 오진 (특히 unscoped 또는 auto-continue 미적용 경로).

## 해결

1. **`slide-N` / `slide_N` 토큰에서 index 직접 추론** (관례: 1-based → `data-slide-index = N-1`). 현재 덱에 `slide-0` 이 있으면 0-based.
2. `fallbackSlideIndexes` 가 있으면 추론값이 허용 집합에 있을 때만 수용.
3. unscoped `deck_patch_parse_failed` 는 `scope-rejected` 가 아니라 `rejected` 로 반환해 배너 오진 방지.

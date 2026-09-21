# 0914-N20-3 구현현황 — Block-frame chart-svg 보존 (loop534)

## 변경

- `fillBlockFrameNeoSlots`: SVG 삭제 → neutralize only
- empty `nb-label` refill after demo-copy strip
- `Performance Data` / `Core Features` chrome label map
- Block-frame `example.html` CSS `:not(:has(.chart-svg))` fallback
- 테스트 `루프534`

## 검증

vitest 루프534/434 통과. Design staging 재배포 + **새 생성** 필요 (기존 deck.html 은 재생성/Retry).

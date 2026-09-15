# 0914-N20-1 상위설계 — Block-frame chart-svg 보존 (loop534)

## 증상

deterministic fill 후 slide-4(`.chart-frame`) 가 초록 배경에 흰 카드만 남고, 「전환/활성/품질」 텍스트가 좌측에서 겹침. 파란 빈 `nb-label` 칩이 슬라이드 밖에 떠 있음.

## 원인

1. `fillBlockFrameNeoSlots` 가 non-metric fill 에서 **`.chart-svg` 전체 삭제** → `.data-box { flex:1; min-height:0 }` 붕괴
2. `stripBlockFrameNeoCatalogDemoCopy` 가 `Performance Data` 만 지워 **빈 nb-label** 남김

## 해결

- SVG 셸 유지 + 내부 demo 숫자만 neutralize
- `Performance Data` / `Core Features` 를 chrome label 로 교체 + strip 후 empty refill
- 템플릿 CSS `:not(:has(.chart-svg))` fallback

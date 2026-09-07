# 0907-N03-1 상위설계 — Block Frame nb-card 그리드 orphan 배치

**날짜:** 2026-09-07 · **루프:** 464  
**관련:** [0907-N02 LOOK+AI](./0907-N02-1-상위설계-[Clone_LOOK와_AI_본문_동시사용].md) · [0907-N01 Block Frame](./0907-N01-1-상위설계-[Block_frame-neo-slot-gate].md)

## 문제

`prompt` 모드로 MiniMax가 Block Frame 스타일 덱을 만든 뒤, PRODUCT(02) 슬라이드에서:

- `.nb-card` 제목만 카드 안에 있고
- 설명 문구가 **그리드 형제**로 빠져 노란 배경 위에 떠 다님
- 3열 그리드에 카드+텍스트가 교차 → 열 정렬 붕괴

PROBLEM(03)에서는 `1fr auto 1fr` 다이어그램 그리드 **네 번째 자식**으로 `<ul>`이 들어가 체크리스트가 구석에 찌그러짐.

## 원인

1. MiniMax HTML이 카드 본문을 `.nb-card` 밖에 둠 (구조 계약 미준수).
2. heal `absorbSpilledChromeCardSiblings`는 **인라인** chrome style(`padding`+`border`) host만 보았고, class `.nb-card`는 host로 취급하지 않음.
3. unequal track (`1fr auto 1fr`)은 equal-column 파서가 null → absorb/eject 게이트 밖.

## 목표

- 기존 heal이 `.nb-card` orphan 본문을 카드 안으로 흡수.
- 다이어그램 그리드 trailing `<ul>`/`<ol>`을 그리드 밖으로 이동.
- prompt-fill 계약에 neo 카드/다이어그램 구조 가드 추가.

## Non-goals

- MiniMax가 완벽한 HTML만 내도록 모델 교체.
- official Block Frame `example.html` 슬롯 구조로 강제 rewrite (LOOK seed 참조는 유지).

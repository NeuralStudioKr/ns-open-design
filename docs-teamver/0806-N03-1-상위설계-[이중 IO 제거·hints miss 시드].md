# 0806-N03-1 상위설계 — 이중 IO 제거 · hints miss 시드

**선행:** [0806-N02](./0806-N02-1-상위설계-[lazy%20cover%20deps·disk%20soft-retry].md)

## 잔여

1. DesignsTab: `useLazyProjectCover` IO + `ProjectCardHtmlCover` IO 이중 → 불필요 지연
2. cover-hints miss를 cache에 안 남겨 배치/resolve 경계가 불명확

## 목표

- DesignsTab HTML 커버: 부모 visible 이후 `deferUntilVisible={false}`
- hints 배치 결과(null 포함)를 `hintsOnlyMiss`로 시드 · 재배치 필터 정합

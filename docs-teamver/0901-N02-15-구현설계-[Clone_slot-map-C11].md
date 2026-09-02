# 0901-N02-15 구현설계 — scatterbrain cards 분류 · LOOK seed fill→heal (C11)

상위: [0901-N02-14](./0901-N02-14-구현설계-[Clone_slot-map-C10].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

1. scatterbrain sticky 슬라이드가 `body`/`list`로 오분류되지 않고 **cards** shell로 잡히게 한다.
2. 전체 LOOK seed → slot-fill → heal 경로를 Daisy와 같이 픽스처로 고정.
3. MiniMax live는 키 없으면 skip 재확인 · filmstrip C3 키보드 회귀 · 루프366 vitest bake.

## 범위

1. `classifyTemplateCloneShellRole`: feature/col/compare-postit · two/three-col-layout · compare-layout → `cards`
2. `cardsShellFillScore`: `*-postit` peers score 2
3. 테스트: scatterbrain example.html LOOK seed fill→heal
4. 검증: MiniMax skip · DeckFilmstrip 19/19 · transform-driven 루프366

## 비범위

- MiniMax 실키 호출(키/`.env` 없음)
- FileViewer 풀 앱 tools-dev GUI(Teamver BFF 필요)
- leftover `기둥 Z` bundling

## 테스트

| 케이스 | 기대 |
|--------|------|
| scatterbrain cover + cards×2 | 킥오프·전략/디자인·이전/이후 · Strategy/Launch/Before demo 제거 · post-it motif 유지 |
| MiniMax live | 키 없으면 skip |
| DeckFilmstrip | C2/C3/C4 19/19 |
| transform-driven 루프366 | section `#stage` hoist · host next |

## 완료 기준

- N02-3 **C11** ☑ · MiniMax ☐(키 없음) · filmstrip ☑ · 루프366 vitest ☑

## 다음 추천 작업

1. MiniMax 키 환경 Clone fill live smoke
2. FileViewer ←/→ tools-dev + Chrome GUI bake(선택)
3. feature-postit 3열을 cards 우선 순위로 강제(선택)
4. 다른 sticky 템플릿(LOOK seed) 확장(선택)

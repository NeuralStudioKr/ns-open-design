# 0901-N02-14 구현설계 — oc/kb fill→heal · compare/col-postit (C10)

상위: [0901-N02-13](./0901-N02-13-구현설계-[Clone_slot-map-C9].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

1. oc/kb LOOK motif fragment에서 `*-card`/`*-grid` fill→heal 경로를 픽스처로 고정.
2. scatterbrain `compare-postit` / `col-postit` trim · orphan `compare-vs` 제거.
3. MiniMax live는 키 없으면 skip 가드만 재확인(가짜 live 금지).
4. 루프366 `#stage` section hoist가 web이 소비하는 contracts **dist**에 반영됐는지 확인.

## 범위

1. 테스트: oc-grid-2 + oc-card · kb-grid-2 + kb-card(+kb-grid-bg 보존) · hermes 기존 유지
2. peer: compare-postit(`*-postit`) · col-postit(allowlist) trim
3. chrome: `compare-vs`를 arrow와 같이 next-peer-kept일 때만 유지
4. deny 회귀: statement/main-title/`*-title-postit`
5. contracts rebuild → web transform-driven 루프366 전량 green

## 비범위

- MiniMax 실키 live 호출(키 없음)
- FileViewer 풀 앱 Chrome GUI bake(tools-dev + Teamver BFF 필요)
- leftover `기둥 Z` / persist-split bundling

## 테스트

| 케이스 | 기대 |
|--------|------|
| oc-grid-2 ×3 · 2줄 → heal | oc-card 2 · 제목 채움 |
| kb-grid-2 ×3 + kb-grid-bg · 2줄 → heal | kb-card 2 · bg 유지 |
| compare-postit ×3 + compare-vs | postit 2 · vs 1 |
| col-postit ×3 | 2 |
| MiniMax live | 키 없으면 skip |
| transform-driven 루프366 | section `#stage` hoist · 19/19 |

## 완료 기준

- N02-3 **C10** ☑ · MiniMax ☐(키 없음) · 루프366 vitest ☑(dist rebuild)

## 다음 추천 작업

→ 후속 [0901-N02-15](./0901-N02-15-구현설계-[Clone_slot-map-C11].md) (C11)에서 scatterbrain cards 분류·LOOK seed 처리.

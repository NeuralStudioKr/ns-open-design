# 0901-N02-18 구현설계 — catalog peer-fit · sticky chrome deny (C13)

상위: [0901-N02-16](./0901-N02-16-구현설계-[Clone_slot-map-C12].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

1. peer-fit을 scatterbrain postit 너머 Capsule/product-launch 등 catalog card peers로 확장한다.
2. sticky/corkboard chrome deny가 slot-map allowlist보다 먼저 적용되게 고정한다.
3. MiniMax 키 없으면 live smoke skip만 재확인한다 (가짜 live 금지).

## 범위

1. `cardsShellPeerFitBonus` — `pillar-card` / `price-card` / `team-card` / `hc-card` / `kpi-card` 등 catalog peers
2. `isDeniedStickyChromePeer` — `mini-note` · `side-note` · `closing-accent*` · `timeline-*` chrome · bare `post-it`
3. `isDeniedPostitPeerToken` — `*-accent-postit` 추가
4. `tokenLooksLikeCardPeer` — deny **before** `peers.has(t)`
5. 테스트: Capsule 3줄 peer-fit · product-launch exact-fit · allowlist bypass deny
6. MiniMax skip 재확인

## 비범위

- MiniMax 실키 호출(키/`.env` 없음)
- FileViewer 풀 앱 tools-dev + Teamver BFF GUI
- leftover `기둥 Z` · persist-split · flex slide force

## 테스트

| 케이스 | 기대 |
|--------|------|
| Capsule cover + 3-line cards | pillar-card×3 또는 feature-card×3 · team-card×6 미선택 |
| product-launch 3-line cards pick | feature/price exact-fit×3 |
| mini-note/side-note/closing-accent + feature-postit (slotMap allowlist) | feature만 trim/fill · sticky chrome 유지 |
| `*-accent-postit` / bare `post-it` allowlist | fill 거부 |
| MiniMax live | 키 없으면 skip |

## 완료 기준

- N02-3 **C13** ☑ · MiniMax ☐(키 없음 skip) · GUI bake ☐(Teamver BFF 없음)

## 다음 추천 작업

1. MiniMax 키 환경 Clone fill live smoke
2. FileViewer ←/→ tools-dev + Teamver BFF GUI bake(선택)
3. Block-frame/stat-card peer-fit 실 LOOK seed 스모크(선택)
4. leftover letter-race / persist-split 분리 트랙

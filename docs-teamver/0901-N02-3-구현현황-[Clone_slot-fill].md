# 0901-N02-3 구현현황 — Clone slot-fill

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 설계: [0901-N02-2](./0901-N02-2-구현설계-[Clone_slot-fill].md) · slot map: [0901-N02-4](./0901-N02-4-구현설계-[Clone_slot-map].md) · D: [0901-N02-5](./0901-N02-5-구현설계-[Clone_slot-fill-D].md) · C2: [0901-N02-6](./0901-N02-6-구현설계-[Clone_slot-map-C2].md) · C3: [0901-N02-7](./0901-N02-7-구현설계-[Clone_slot-map-C3].md) · C4: [0901-N02-8](./0901-N02-8-구현설계-[Clone_slot-map-C4].md)

## 진행

| 항목 | 상태 |
|------|------|
| 상위설계 (A) | ☑ |
| 구현설계 (B0 문서) | ☑ |
| **B1** contracts outline 타입·파서 | ☑ |
| **B2** roleHint → shell pick/fill | ☑ |
| **B3** prompt/hard rules JSON-only | ☑ |
| **B4** ProjectView persist JSON→build | ☑ |
| **B5** JSON repair 1회 + HTML fallback | ☑ (D에서 hybrid 제거로 갱신) |
| **C** 공통 cards overflow (P1) | ☑ |
| **C2** 템플릿 id별 slot map (Daisy) | ☑ |
| **C3** 추가 템플릿 맵 + peer-driven host | ☑ 공통 peer/host 확장 · 9맵 · peer-driven/top-level |
| **C4** prefixed `*-card` / `*-grid` heuristic | ☑ `xp/hc/column-card` · `team-member` · card-title/member-name |
| **D** hybrid fallback 제거 | ☑ |
| MiniMax 실키 E2E | ☐ 키 없음 (`template-clone-minimax-live.e2e` skip 가드) |

## 검증

- [x] outline parse/reject · roleHint · JSON-only prompts
- [x] applyTemplateCloneSlotFill · seed-fallback (D)
- [x] cards overflow info-card (C) · Daisy day/timeline (C2)
- [x] C3: product-launch price-card · team-grid · top-level pillar · capsule pillar-card · 맵 resolve
- [x] C4: xp-card · hc-card · column-card/card-title · team-member (맵 없이)
- [x] MiniMax live: 키 없으면 skip (가짜 live 금지)

## 메모

- LOOK seed 유지 · `buildTemplateClonedDeckHtml` 재사용.
- leftover `기둥 Z` 확장과 bundling하지 않음.
- C3 peer-driven host: class host가 없어도 직접 자식 peer ≥ 2면 trim.
- C4: `*-card`만 peer · `card-icon`/`card-title` 제외 · host는 `*-grid`/`grid-N`.
- MiniMax 키(`MINIMAX_API_KEY` / `OD_MINIMAX_API_KEY`) 있으면 live smoke 슬롯 활성화.

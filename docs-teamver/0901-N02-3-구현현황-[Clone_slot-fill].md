# 0901-N02-3 구현현황 — Clone slot-fill

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 설계: [0901-N02-2](./0901-N02-2-구현설계-[Clone_slot-fill].md) · slot map: [0901-N02-4](./0901-N02-4-구현설계-[Clone_slot-map].md) · D: [0901-N02-5](./0901-N02-5-구현설계-[Clone_slot-fill-D].md) · C2: [0901-N02-6](./0901-N02-6-구현설계-[Clone_slot-map-C2].md)

## 진행

| 항목 | 상태 |
|------|------|
| 상위설계 (A) | ☑ |
| 구현설계 (B0 문서) | ☑ |
| **B1** contracts outline 타입·파서 | ☑ |
| **B2** roleHint → shell pick/fill | ☑ infer 우선 · pick 경로 연결 · `buildTemplateClonedDeckHtml`이 roleHint 유지 |
| **B3** prompt/hard rules JSON-only | ☑ |
| **B4** ProjectView persist JSON→build | ☑ slot-fill LOOK seed; HTML fallback |
| **B5** JSON repair 1회 + HTML fallback | ☑ (D에서 hybrid 제거로 갱신) |
| **C** 공통 cards overflow (P1) | ☑ `fillAndTrimCardPeers` · Daisy info-card 픽스처 · cards 셸은 info-card 우선 |
| **C2** 템플릿 id별 slot map | ☑ Daisy Days 레지스트리 · day-card/timeline · `templateId` 배선 |
| **C3** 추가 템플릿 맵 | ☐ 후속 |
| **D** hybrid fallback 제거 | ☑ `seed-fallback` / `abort` — 모델 HTML persist 금지 |
| MiniMax 실키 E2E | ☐ (키 있을 때만) |

## 검증

- [x] `template-clone-outline` parse/reject (+ applyTemplateCloneSlotFill)
- [x] roleHint → `inferTemplateCloneContentRole` 우선
- [x] fill prompt에 HTML regenerate 문구 없음 (JSON-only Final authority)
- [x] fill persist가 JSON→shell swap (`applyTemplateCloneSlotFill`)
- [x] fallback 1회 repair 턴 (`decideTemplateCloneSlotFillTerminal` + repair marker)
- [x] cards overflow: body 줄 수만큼 info-card 유지, 초과 peer 제거 (unit + Daisy)
- [x] D: repair 재실패 → LOOK `seed-fallback` (모델 HTML 아님); seed 없으면 `abort`
- [x] C2: Daisy slot map resolve · day-card / timeline-card trim · templateId 전달

## 메모

- LOOK seed (`seedTemplateClonedDeckOnServer`)는 유지.
- `buildTemplateClonedDeckHtml` 재사용이 P0 핵심 — DOM swap 재발명 없음.
- leftover `기둥 Z` 확장과 bundling하지 않음.
- B5→D: invalid outline → queue-repair → 재실패 시 **seed-fallback** (`templateCloneSlotFillFallback: true`).
- C2: `template-clone-slot-maps.ts` — id 우선, fingerprint 보조. Daisy `timeline-row`를 peer로 취급.

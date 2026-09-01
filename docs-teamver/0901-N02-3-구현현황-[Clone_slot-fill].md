# 0901-N02-3 구현현황 — Clone slot-fill

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 설계: [0901-N02-2](./0901-N02-2-구현설계-[Clone_slot-fill].md)

## 진행

| 항목 | 상태 |
|------|------|
| 상위설계 (A) | ☑ |
| 구현설계 (B0 문서) | ☑ |
| **B1** contracts outline 타입·파서 | ☑ |
| **B2** roleHint → shell pick/fill | ☑ infer 우선 · pick 경로 연결 |
| **B3** prompt/hard rules JSON-only | ☑ |
| **B4** ProjectView persist JSON→build | ☑ slot-fill LOOK seed; HTML fallback |
| **B5** JSON repair 1회 + HTML fallback | ☑ |
| **C** 템플릿 id별 slot map (P1) | ☐ |
| **D** hybrid fallback 제거 | ☐ |
| MiniMax 실키 E2E | ☐ (키 있을 때만) |

## 검증

- [x] `template-clone-outline` parse/reject (+ applyTemplateCloneSlotFill)
- [x] roleHint → `inferTemplateCloneContentRole` 우선
- [x] fill prompt에 HTML regenerate 문구 없음 (JSON-only Final authority)
- [x] fill persist가 JSON→shell swap (`applyTemplateCloneSlotFill`)
- [x] fallback 1회 repair 턴 (`decideTemplateCloneSlotFillTerminal` + repair marker); HTML hybrid + `templateCloneSlotFillFallback`

## 메모

- LOOK seed (`seedTemplateClonedDeckOnServer`)는 유지.
- `buildTemplateClonedDeckHtml` 재사용이 P0 핵심 — DOM swap 재발명 없음.
- leftover `기둥 Z` 확장과 bundling하지 않음.
- B5: invalid outline → queue-repair (persist HTML 금지, emergency salvage 억제) → 재실패 시 html-fallback.

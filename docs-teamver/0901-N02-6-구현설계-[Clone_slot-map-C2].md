# 0901-N02-6 구현설계 — 템플릿 id별 slot map (C2)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · C: [0901-N02-4](./0901-N02-4-구현설계-[Clone_slot-map].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

공통 `info-card` heuristic(C)으로 커버되지 않는 **템플릿 고유 peer**  
(Daisy `day-card` / `timeline-card` 등)도 **카드 수 = 내용 수**로 trim한다.

## 범위

1. `packages/contracts/src/template-clone-slot-maps.ts` 레지스트리
2. 첫 엔트리: Daisy Days (`example-html-ppt-zhangzara-daisy-days`)
   - hosts: `cards-grid`, `weekly-grid`, `timeline-wrap` (+ 공통)
   - peers: `info-card`, `day-card`, `timeline-card` (+ 공통)
3. `resolveTemplateCloneSlotMap({ templateId, html })` — id 우선, 없으면 fingerprint
4. `buildTemplateClonedDeckHtml` / `applyTemplateCloneSlotFill` / `decide…` 에 `templateId` 옵션
5. `fillOneCardPeer`: `.day-header` 제목 슬롯 + day-body list wipe
6. FE: `selectedDeckTemplateId` 전달 · daemon LOOK seed도 `templateId` 전달

## 비범위

- 전 템플릿 맵 작성 (후속 C3+)
- leftover `기둥 Z`
- MiniMax 실키 E2E

## 테스트

| 케이스 | 기대 |
|--------|------|
| resolve Daisy id / fingerprint | map non-null |
| weekly-grid 5 day-card · 2줄 | day-card 2 · Monday demo 소거 |
| timeline-wrap 5 · 2줄 | timeline-card 2 |
| apply + templateId Daisy | motif 유지 · overflow trim |

## 완료 기준

- N02-3 **C2** ☑
- contracts unit 초록

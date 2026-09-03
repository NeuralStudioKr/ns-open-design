# 0901-N02-3 구현현황 — Clone slot-fill

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 설계: [0901-N02-2](./0901-N02-2-구현설계-[Clone_slot-fill].md) · slot map: [0901-N02-4](./0901-N02-4-구현설계-[Clone_slot-map].md) · D: [0901-N02-5](./0901-N02-5-구현설계-[Clone_slot-fill-D].md) · C2: [0901-N02-6](./0901-N02-6-구현설계-[Clone_slot-map-C2].md) · C3: [0901-N02-7](./0901-N02-7-구현설계-[Clone_slot-map-C3].md) · C4: [0901-N02-8](./0901-N02-8-구현설계-[Clone_slot-map-C4].md) · C5: [0901-N02-9](./0901-N02-9-구현설계-[Clone_slot-map-C5].md) · C6: [0901-N02-10](./0901-N02-10-구현설계-[Clone_slot-map-C6].md) · C7: [0901-N02-11](./0901-N02-11-구현설계-[Clone_slot-map-C7].md) · C8: [0901-N02-12](./0901-N02-12-구현설계-[Clone_slot-map-C8].md) · C9: [0901-N02-13](./0901-N02-13-구현설계-[Clone_slot-map-C9].md) · C10: [0901-N02-14](./0901-N02-14-구현설계-[Clone_slot-map-C10].md) · C11: [0901-N02-15](./0901-N02-15-구현설계-[Clone_slot-map-C11].md) · C12: [0901-N02-16](./0901-N02-16-구현설계-[Clone_slot-map-C12].md)

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
| **C5** prefixed `*-step` / bare `step` heuristic | ☑ kb/timeline/xw-step · `.t`/`.d` · `five-step` 섹션 제외 |
| **C6** multi-host card/step trim | ☑ cards-grid+timeline 동시 · oversize 우선 · idempotent |
| **C7** `*-stat` / `kpi` peer heuristic | ☑ grove/mini/bare stat·kpi · slide/card/gc deny |
| **C8** process/timeline host + orphan arrows · heal↔clone | ☑ process-flow/timeline-track/kb-pipeline · Daisy fill→heal |
| **C9** `.lbl` fill · `*-postit` · flow arrows | ☑ hc-card lbl · feature-postit · flow orphan arrow |
| **C10** oc/kb fill→heal · compare/col-postit · 루프366 dist | ☑ compare-vs orphan · contracts rebuild |
| **C11** scatterbrain cards 분류 · LOOK seed fill→heal | ☑ postit shell→cards · filmstrip/366 bake |
| **C12** feature-postit peer-fit · sticky timeline · 366 chrome | ☑ 3줄→feature×3 · timeline-row · chrome bake |
| **D** hybrid fallback 제거 | ☑ |
| **루프359** HTML dump → seed-fallback 즉시 · repair AC abort시 seed 유지 | ☑ |
| **루프360** repair 판단 messagesRef 레이스 · sendNow synchronous reject 회복 | ☑ |
| **루프362** low-substance persist skip → LOOK seed 복구 (succeeded + warning) | ☑ |
| **루프364** soft-invalid JSON도 queue-repair 없이 seed-fallback · pending+seed 복구 | ☑ |
| **루프365** seed-fallback persist 생략 · skipped-incomplete 전 reason LOOK seed 복구 · repair dead path 제거 · policy echo UI | ☑ |
| **루프367** hard reload incomplete_output → LOOK seed 복구 | ☑ |
| **루프368** JSON 파싱 강화 + FE 1회 auto-repair (LOOK seed 경고 전) | ☑ |
| **루프369** JSON 본문 section 오탐 · repair send 실패 fallback · brief 전달 | ☑ |
| **루프370** repair pending UX — ChatPane Retry 이중 클릭 방지 | ☑ (371에서 repair loop 제거) |
| **루프371** JSON repair auto-send loop 차단 — seed-fallback 즉시 LOOK seed | ☑ |
| **루프372** stuck repair notice reload → LOOK seed 안내 | ☑ |
| **루프373** brief 패러디 제목·cards instruction body 가드 | ☑ |
| **루프375** block-frame hero/split flow 레이아웃 복구 | ☑ |
| **루프376** 빈 leaf ul/p shell 제거 | ☑ |
| **루프377** 깨진 heading/빈 카드 salvage · orphan split column | ☑ |
| **루프379** pin bg flatten 제거 · persist salvage · orphan repeat grid | ☑ |
| **루프383** prompt-fill compact snap-back · short-deck top-up | ☑ |
| **루프385** mixed grid loose pill+h3+p wrap | ☑ |
| **루프386** Key Numbers loose stats wrap · neo-brutal CSS var fallback · KPI seed 가드 | ☑ |
| **루프387** neo-brutal 위 IB magazine 커버 → hero-frame · URL 제목 polish | ☑ |
| **루프388** Cobalt raw URL 커버 제목 heal · sparse subkicker | ☑ |
| **루프389** preview/salvage URL 표지 heal 연결 · Cobalt DOM 감지 · brief rescue | ☑ |
| **루프390** 8-Bit Orbit 위 IB magazine → pixel-hero · neo cream fallback skip | ☑ |
| **루프392** starfield flatten 복구 · nested 비교표 salvage · dark surface > cream | ☑ |
| **루프393** 학습 노트 leftover drop · empty pricing li · comparison orphan 흡수 | ☑ |
| **루프394** 빈 1페이지 drop · neo deco absolute · 깨진 flex step 복구 | ☑ |
| **루프395** nested bold 숫자 typo · punct stutter · prompt-fill 장수 가드 | ☑ |
| **루프396** Capsule IB 표지 · heading/pill salvage · runContext 8–10 top-up | ☑ |
| **루프398** Capsule soft wash · chrome-pill · 표지 stub · durable count | ☑ |
| **루프399** bare hint/Spec · merge cap · Capsule h1/deco/rotated | ☑ |
| **루프400** Spec/Hint 통일 · Motif 보존 · SVG/flex/heading salvage | ☑ |
| **루프403** 중첩 카드 flatten · 표지 pill · badge 오핀 · stutter | ☑ |
| **루프404** 장수 게이트 → save+top-up · prompt-fill LOOK seed | ☑ |
| **루프366** section `#stage` hoist · contracts dist rebuild | ☑ web transform-driven 19/19 |
| MiniMax 실키 E2E | ☑ 가드 있음 · 키 없으면 skip (`template-clone-minimax-live.e2e`) |

## 검증

- [x] outline parse/reject · roleHint · JSON-only prompts
- [x] applyTemplateCloneSlotFill · seed-fallback (D)
- [x] cards overflow info-card (C) · Daisy day/timeline (C2)
- [x] C3: product-launch price-card · team-grid · top-level pillar · capsule pillar-card · 맵 resolve
- [x] C4: xp-card · hc-card · column-card/card-title · team-member (맵 없이)
- [x] C5: kb-step · timeline-step · xw-step · bare step · five-step 비대상
- [x] C6: cards-grid+timeline multi-host · idempotent
- [x] C7: grove-stat · kpi · bare stat · slide/s/card-stat 비대상
- [x] C8: process-flow/timeline-track/kb-pipeline · orphan arrow drop · Daisy fill→heal
- [x] C9: hc-card `.lbl` · feature-postit · statement-postit deny · flow arrows
- [x] C10: oc/kb fill→heal · compare-postit/col-postit · compare-vs orphan
- [x] C11: scatterbrain LOOK seed fill→heal · postit→cards 분류
- [x] C12: peer-fit 3줄→feature-postit · timeline-layout/row · 루프366 chrome/srcdoc bake
- [x] 루프364: soft-invalid → seed-fallback · `isCloneContentFillLookSeedRecoverablePersistReason`
- [x] 루프366: srcdoc-deck-bridge-transform-driven · contracts dist section/main hoist
- [x] filmstrip: DeckFilmstrip C2/C3/C4 19/19
- [x] MiniMax live: 키 없으면 skip · `deploy/teamver/.env`에서 키 로드(있을 때)
- [x] MiniMax live clone-fill: slot-fill 또는 seed-fallback
- [x] 루프368/369: policy echo JSON 추출 · repair 1회 auto-send · section.slide 본문 오탐 제거
- [x] 루프370: cloneSlotFillRepairPending · ChatPane resume-failed · redacted_thinking parse

## 메모

- LOOK seed 유지 · `buildTemplateClonedDeckHtml` 재사용.
- leftover `기둥 Z` 확장과 bundling하지 않음.
- C3 peer-driven host: class host가 없어도 직접 자식 peer ≥ 2면 trim.
- C4: `*-card`만 peer · `card-icon`/`card-title` 제외 · host는 `*-grid`/`grid-N`.
- C5: letter-led `*-step` + bare `step` · `4-step`/`five-step` 섹션 제외 · host `*-steps`.
- C6: multi-pass · oversize host 우선 · 동일 줄을 각 host에 적용.
- C7: `stat`/`kpi` + letter-led `*-stat` · deny slide/s/card/gc/split/big-stat · host `stats-row`.
- C8: named process/timeline hosts · arrow keep iff next peer kept · heal↔clone Daisy fixture.
- C9: `.lbl` when no h3–h5 · `*-postit` (deny statement/main-title) · flow arrows.
- C10: oc/kb fragment fill→heal · compare-postit/col-postit · compare-vs orphan · 루프366 dist rebuild.
- C11: scatterbrain postit/layout → cards 분류 · LOOK seed fill→heal · filmstrip/366 vitest bake.
- C12: cards peer-fit(lineCount) · timeline-layout/timeline-row · Chrome host-next bake 증거.
- MiniMax 키(`MINIMAX_API_KEY` / `OD_MINIMAX_API_KEY`) 있으면 live smoke 슬롯 활성화.
- 루프362: `isCloneContentFillLowSubstancePersistReason(reason)` (`low-substance deck artifact` / `unfilled-catalog-example` / `incomplete-html-document-shell`). Clone 첫 채우기 턴에서만 발동, LOOK seed 있으면 `skipped-duplicate`로 재작성 + `CLONE_LOOK_SEED_FALLBACK_STATUS_CODE` 경고. 비-Clone 실행은 그대로 low-substance gate 유지.
- 루프364: LOOK seed가 있으면 soft-invalid JSON도 queue-repair/AC 없이 즉시 seed-fallback. `pendingSlotFillRepair` arm 상태에서도 seed가 있으면 incomplete_output을 강제하지 않고 LOOK seed로 succeeded. `reason=template-clone-slot-fill-json-repair`도 recoverable set에 포함.

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-09-03 | 루프403 — 중첩 카드 flatten · 표지 pill · badge 오핀 · stutter |
| 2026-09-03 | 루프400 — Spec/Hint 통일 · Motif 보존 · SVG/flex/heading salvage |
| 2026-09-03 | 루프399 — bare 8–10 hint · merge cap · Capsule h1/deco/rotated |
| 2026-09-03 | 루프398 — Capsule soft wash · chrome-pill · 표지 stub · durable count |
| 2026-09-02 | C12 — peer-fit feature-postit×3 · timeline-row · 루프366 chrome/srcdoc bake |
| 2026-09-02 | 루프370 — repair pending UX · redacted_thinking JSON parse |
| 2026-09-02 | C11 — scatterbrain postit→cards · LOOK seed fill→heal · filmstrip/366 bake |
| 2026-09-02 | C10 — oc/kb fill→heal · compare/col-postit · compare-vs · 루프366 dist rebuild |
| 2026-09-02 | 루프368/369 — JSON 파싱 + FE repair 1회 auto-send · live E2E 복원 |
| 2026-09-01 19:22 | 루프364 — soft-invalid → seed-fallback · pending+seed incomplete_output 복구 |

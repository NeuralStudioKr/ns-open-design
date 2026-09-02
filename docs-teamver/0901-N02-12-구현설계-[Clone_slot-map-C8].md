# 0901-N02-12 구현설계 — process/timeline host allowlist + orphan arrows (C8)

상위: [0901-N02-11](./0901-N02-11-구현설계-[Clone_slot-map-C7].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

1. `process-flow` · `timeline-track` · `kb-pipeline` · `timeline` · `flow`를 **named host**로 인식해 class path에서 바로 trim.
2. `process-arrow` / `flow-arrow` / `cycle-arrow`가 잘린 step 뒤에 **고아로 남지 않게** 제거.
3. LOOK seed → slot-fill → heal 통합 픽스처로 motif 유지·demo peer 소거를 고정.

## 범위

1. host allowlist 추가 (위 5종)
2. `rebuildHostWithPeers` — arrow는 **다음 peer가 keep일 때만** 유지
3. contracts 통합 테스트: Daisy Days fill + `healAiGeneratedDeckMarkup` + `pinDeckSlidesToFixedCanvas`

## 비범위

- MiniMax 실키 live E2E (키 없으면 ☐)
- 루프366 FileViewer 브라우저 bake (이 VM GUI 없음)
- leftover 칸 번호

## 테스트

| 케이스 | 기대 |
|--------|------|
| process-flow · step×3 · arrow · 2줄 | process-step 2 · process-arrow 1 |
| timeline-track / kb-pipeline | peer 2 |
| Daisy seed→fill→heal | KPI/process demo 소거 · deco/motif 유지 |

## 완료 기준

- N02-3 **C8** ☑ · heal↔clone 통합 ☑ · MiniMax ☐

## 다음 추천 작업

1. MiniMax 키 환경 Clone fill live smoke
2. 루프366 FileViewer ←/→ staging bake (브라우저)
3. Clone fill 후 filmstrip/키보드 nav(0901-N01-C3)와 함께 수동 bake
4. cycle-grid / flow-grid 등 추가 host fingerprint(선택)

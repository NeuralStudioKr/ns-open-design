# 0907-N05-3 구현현황 — thin-prior top-up 본문 품질 복구

## 상태

☑ 상위·구현설계  
☑ `incomingImprovesThinTopUpPrior` + top-up persist 교체  
☑ LookSeed recoverable에 `thin-prior-top-up-no-append`  
☑ top-up 턴 Clone lineage LOOK 복구 게이트  
☑ thin LOOK → full rewrite 큐 (루프502: 1장 title-only 포함 · append 대신)  
☑ 회귀 테스트 (contracts outline · deck-html-content · slideCountTopUp)  
☑ 루프502 — 1장 title-only thin prior도 rewrite (`hostCount >= 1`, 명시 1장 honor 제외)  
☑ 루프503 — 명시 요청 1장 shortfall top-up · slide_count_top_up 실패 가시화  
☑ 루프504 — thin-rewrite 센티널 커버 heal/strip/gate · rewrite prompt exact N/킷
☐ Design staging 재배포 후 QA

## 검증

- `packages/contracts` `template-clone-fill` (Biennale sentinel heal 포함)
- `apps/web` `deck-html-content` + `validate` + `slideCountTopUp`
- 루프502 unit: 1장 thin rewrite / requested=1 no-rewrite  
- 루프503: produced=1 requested=8 → top-up · top-up 실패는 soft 아님
- 루프504: sentinel → failed/low-substance · heal 후 표지 유지 · prompt `emit exactly N`

## 다음

- staging 재배포 후 8~10장 요청 → 커버에 `[od:…]` 없음 · 장수 top-up(503) bake
- (별도 P2) 사이트 분석 → outline 주입

## 변경 이력

| 2026-09-07 | N05 구현현황 |
| 2026-09-11 | 루프502 — 1장 thin rewrite 게이트 완화 |
| 2026-09-11 | 루프503 — 명시 요청 shortfall 설계 |
| 2026-09-11 | 루프503 — 명시 요청 shortfall 구현·검증 |
| 2026-09-11 | 루프504 — thin-rewrite 센티널 누수 차단 |

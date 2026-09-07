# 0901-N02-22 구현설계 — Long Table leftover refill (루프469)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
직전: [0901-N02-21](./0901-N02-21-구현설계-[Clone_sakura-leftover-refill].md) 루프467 — Sakura Tape Garden leftover. Broadside / Orbit / Scatterbrain 게이트는 별도 커밋으로 편입됨.

## 목표

남은 공식 Zhangzara 중 leftover가 실제로 남는 unique-role 키트:

1. **Long Table** 8셸 (`s-cover` · `s-manifesto` · `s-index` · `s-featured` · `s-menu` · `s-quote` · `s-cal` · `s-closing`) — supper-club 카탈로그 카피
2. **Editorial Tri-Tone** 8셸 (`s-cover` · `s-manifesto` · `s-grid` · `s-stat` · `s-timeline` · `s-chart` · `s-quote` · `s-closer`) — Lorem / Editorial Desk

10장 요청이 셸을 복제하지 않게 unique-role cap을 확장하고, Long Table은 전용 fill + persist heal.

## leftover denylist

Long Table: `We started Long Table`, `long-table.co`, `Hana Brennan`, `Roasted chestnut soup`, `Not a meal, an evening`, `Bairro Alto`  
Editorial: `Placeholder lede`, `The Editorial Desk`, `Lorem ipsum`

영문 `example.html`은 brief 없이 no-op.

## 테스트

- contracts `loop469 — Long Table 10-slide request…`
- contracts `loop469 — Editorial Tri-Tone unique-role cap…`
- contracts persist leftover refill
- contracts / daemon 4축 게이트 Long Table(8) · Editorial Tri-Tone(8)
- daemon에 Broadside / 8-bit Orbit / Scatterbrain 서버 스모크 보강

## 비범위

- 나머지 10셸 Zhangzara 일괄 게이트 (leftover detect는 이미 통과)
- screenshot smoke fixture
- MiniMax live · FileViewer 클릭

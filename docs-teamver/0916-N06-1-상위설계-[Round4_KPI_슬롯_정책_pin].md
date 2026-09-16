# 0916-N06-1 상위설계 · Round 4 KPI 슬롯 정책 pin (루프542)

## 배경

킷별 KPI 슬롯 정책이 미묘하게 달라서 공통 helper로 뽑으면 회귀 위험이 큼.
대신 각 킷 콜사이트의 정책이 아래 4가지 공통 원칙을 지키는지 회귀 테스트로 pin.

## KPI 슬롯 인벤토리

| 킷 | 슬롯 | 정책 |
|----|------|------|
| Broadside | `.stat-value` (slide--stats > stat-card) | metric-like → 대체 · demo pattern이면 ordinal · real seed는 유지 |
| Broadside | `.pie-item-val` (slide--pie) | metric-like → 대체 · 없으면 ordinal (루프536) |
| Broadside | `.fadelist-item` (slide--fadelist) | fadelist-title로 replace, `broadside-num`은 wipe |
| 8-Bit Orbit | `.stat-number` + `data-target`/`data-suffix` | data-* wipe (headless 0 렌더 방지) · metric-like → 대체 · 없으면 ordinal · English label → Korean topic |
| 8-Bit Orbit | `.tier-price` (tier-card) | 주제와 무관한 pricing → tier-card 통째로 strip |
| Grove | `.grove-stat-val` | metric-like → 대체 · 없으면 ordinal |

## 공통 정책 4원칙

1. **metric 있으면 대체** — `titleLooksLikeMetric(line.title || line.body)`이 true면 그 값을 사용
2. **metric 없으면 ordinal 또는 wipe** — 카탈로그 데모 pricing/target은 남기지 않음
3. **가짜 $/%가 한국어 덱에 leak 되지 않음** — 8-Bit `$29/mo`, Broadside `$3.5B` 등
4. **data-target/data-suffix 속성은 headless 렌더 시 카운터 0을 만들므로 제거** — 8-Bit만 해당

## 공통 helper 미추출 근거

각 킷의 policy가 세부적으로 다름 (Broadside stat-value는 특정 demo regex만
neutralize, 8-Bit stat-number는 무조건, pie-item-val은 별도 wipe 등). 공통
helper `resolveKpiValueForSlot(line, index, opts)`로 뽑는다면 opts가 너무
많아지고 각 킷의 회귀 리스크가 커짐 → 지금은 각 fill 함수에 인라인 유지.

## 회귀 pin 테스트

- 루프542 8-Bit stat-block: metric은 대체 · 없으면 ordinal · data-target 속성 wipe · English label 대체
- 루프542 8-Bit tier-card: pricing 전체 strip · $ leak 금지
- 루프536 Broadside stat-value / pie-item-val / fadelist-item: 이미 pin됨

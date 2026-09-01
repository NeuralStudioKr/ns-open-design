# 0901-N02-7 구현설계 — 추가 템플릿 slot map / peer 발견 (C3)

상위: [0901-N02-6](./0901-N02-6-구현설계-[Clone_slot-map-C2].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

Daisy 외 html-ppt 템플릿에서도 **카드 수 = 내용 수**가 성립하게 한다.  
호스트 class가 `cards-grid`가 아닌 경우(`grid g3`, `stats-grid`, `team-grid`, top-level `pillar`…)도 trim.

## 범위

1. **공통 peer 확장:** `team-card` · `price-card` · `pricing-card` · `pillar-card` · `kpi-card` · `step-card` · `process-card` · `member-card` · `pillar`
2. **공통 host 확장:** `stats-grid` · `team-grid` · `feature-grid` · `metrics-row` · `cards-row` · `pricing-grid`
3. **peer-driven host 발견:** class host가 없어도 직접 자식 peer ≥ 2면 그 컨테이너를 host로 취급
4. **top-level peers:** wrapper 없이 slide body에 peer가 나란히 있으면 그 묶음을 trim
5. **명시 맵 추가 (문서·fingerprint):** block-frame · product-launch · blue-professional · capsule · pitch-deck · playful · 8-bit-orbit · bold-poster · mat
6. MiniMax 실키 E2E: 키 없으면 ☐ 유지 + 스킵 가드 테스트

## 비범위

- leftover `기둥 Z` 토큰 확장
- 모든 deck-* 비 ppt 템플릿 (html-ppt 우선)
- 키 없는 환경에서 live MiniMax 위장

## 테스트

| 케이스 | 기대 |
|--------|------|
| `grid g3` + price-card ×3 · 2줄 | price-card 2 |
| team-grid + team-card | trim |
| top-level pillar ×3 · 2줄 | pillar 2 |
| resolve 신규 맵 id | non-null |
| MiniMax E2E | 키 없으면 skip |

## 완료 기준

- N02-3 **C3** ☑ · MiniMax E2E는 키 유무에 따라 ☑/☐

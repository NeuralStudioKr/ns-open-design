# 0901-N02-10 구현설계 — multi-host card/step trim (C6)

상위: [0901-N02-9](./0901-N02-9-구현설계-[Clone_slot-map-C5].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

한 슬라이드 body에 **카드 그리드 + 타임라인**처럼 host가 둘 이상일 때,  
첫 host만 trim하고 두 번째 demo peer가 남는 회귀를 없앤다.  
계약 유지: 각 host에서 **peer 수 = 내용 줄 수**.

## 범위

1. `fillAndTrimCardPeers` multi-pass (최대 8)
2. 매 pass: oversize host(`peers > lines`) 우선, 그다음 나머지 host title fill
3. 변경 없으면 종료 (idempotent)
4. 기존 C–C5 peer/host heuristic 재사용

## 비범위

- MiniMax 실키 live E2E
- leftover 칸 번호
- bare `stat` / `kpi` peer 확장 (과한 삭제 위험 — 후속 후보)
- outline 줄을 host별로 분할 (동일 줄을 각 host에 적용)

## 테스트

| 케이스 | 기대 |
|--------|------|
| cards-grid×3 + timeline×3 · 2줄 | info-card 2 · timeline-step 2 |
| 이미 2+2로 채워진 body 재적용 | 문자열 동일 |

## 완료 기준

- N02-3 **C6** ☑ · MiniMax ☐(키 없으면)

## 다음 추천 작업 (이 슬라이스 이후)

1. MiniMax 키 환경 Clone fill live smoke (`template-clone-minimax-live.e2e`)
2. 좁은 `*-stat` / exact `kpi` peer (섹션 오탐 가드 포함)
3. 루프366 FileViewer ←/→ staging bake (브라우저)
4. heal↔clone 통합 픽스처 (LOOK seed → fill → heal)

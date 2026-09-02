# 0901-N02-11 구현설계 — `*-stat` / `kpi` peer heuristic (C7)

상위: [0901-N02-10](./0901-N02-10-구현설계-[Clone_slot-map-C6].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

stats/KPI 행에서 **peer 수 = 내용 줄 수**.  
`grove-stat` · `mini-stat` · bare `stat`/`kpi` demo 잔여를 맵 없이 제거한다.

## 범위

1. **공통 peer:** exact `stat` · `kpi`
2. **Peer suffix:** `/^[a-z][a-z0-9_-]*-stat$/` (문자 시작)
3. **Deny:** `slide-stat` · `s-stat` · `card-stat` · `gc-stat` · `split-stat` · `*-big-stat`
4. **Host:** `stats-row` · `mini-stat-row` · `/^[a-z][\w-]*-stat-row$/`
5. **fill:** `*-stat-label` / `mini-label` / `.lab` · kpi `.label` (값 슬롯 비움)

## 비범위

- MiniMax 실키 live E2E
- leftover 칸 번호
- `gc-stat` 카드 내부 메타 trim
- heal↔clone 통합 픽스처

## 테스트

| 케이스 | 기대 |
|--------|------|
| stats-row + grove-stat ×3 · 2줄 | 2 · label 채움 · val 비움 |
| kpi ×3 · 2줄 | 2 · label 채움 |
| bare stat + `.lab` | 2 |
| slide-stat / s-stat ×3 | trim 없음 |
| column-card + card-stat | column-card trim · card-stat은 peer 아님 |

## 완료 기준

- N02-3 **C7** ☑ · MiniMax ☐(키 없으면)

## 다음 추천 작업

1. MiniMax 키 환경 Clone fill live smoke
2. 루프366 FileViewer ←/→ staging bake (브라우저)
3. heal↔clone 통합 픽스처 (LOOK seed → fill → heal)
4. `process-flow` / `timeline-track` / `kb-pipeline` host allowlist 보강(선택)

# 0901-N02-4 구현설계 — Clone slot map / cards overflow (P1-C)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

`fillSlideShell`이 **cards** 셸에서 내용 줄 수보다 많은 템플릿 카드 peer를 남기지 않는다.  
계약: **카드 수 = 내용 수**. 빈 칸·칸 번호(`기둥 Z` 등)로 열을 맞추지 않는다.

## 범위 (이번 슬라이스)

공통 heuristic 우선 (템플릿 id별 override는 후속):

1. `.cards-grid` / `.weekly-grid` / `.cards` 호스트의 직접 자식 card peer
2. peer 판별: `info-card` · `stat-card` · `feature-card` · `metric-card` · class 토큰 `card`
3. body 줄 N개 → 앞 N개 peer만 채우고 나머지 **제거**
4. 줄 > peer 수면 초과 줄 버림 (cover와 동일)
5. 픽스처: Daisy Days `slide-cards` + 최소 HTML unit

## 비범위

- leftover `기둥 Z` 토큰 확장
- hybrid fallback 제거(D)
- persist-split / flex slide 강제
- 템플릿 id별 JSON slot map 파일 (후속 C2)

## 알고리즘 (`fillAndTrimCardPeers`)

1. 슬라이드 body에서 card host open 탐색 (위 클래스).
2. host 직접 자식 중 card peer만 수집. deco/svg/비카드는 유지.
3. `keep = min(lines.length, peers.length)`.
4. 각 keep peer: 첫 `h3|h4|h5` 텍스트를 해당 줄로 교체. 없으면 첫 `p`.  
   제목을 heading에 넣었으면 카드 안 demo `<p>`는 비운다 (주제 카피 발명 금지).
5. host 내부를 `비카드 자식 + keep peers`로 재조립. 초과 peer 삭제.
6. `fillSlideShell`에서 cards-grid가 보이거나 shell role이 `cards`이면 list/`p` 경로보다 **이 경로 우선**.

## 테스트

| 케이스 | 기대 |
|--------|------|
| 3 info-card · body 2줄 | info-card 2개, 줄 텍스트 존재, 3번째 demo 제목 없음 |
| Daisy Days cards · KPI 2줄 | Creative Expression 등 영문 demo 카드 소거 |
| list 전용 shell | 기존 `replaceListItems` 회귀 |

## 완료 기준

- N02-3 **C** ☑ (공통 overflow; id map은 C2로 남기면 현황에 명시)
- contracts unit 초록

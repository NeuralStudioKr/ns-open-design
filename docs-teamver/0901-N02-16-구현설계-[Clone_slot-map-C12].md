# 0901-N02-16 구현설계 — feature-postit 3열 우선 · sticky timeline (C12)

상위: [0901-N02-15](./0901-N02-15-구현설계-[Clone_slot-map-C11].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

1. outline 줄 수에 맞는 cards shell을 고른다 (3줄 → feature-postit×3이 col-postit×2를 이김).
2. scatterbrain sticky timeline(`timeline-layout` / `timeline-row`) LOOK seed fill→heal.
3. MiniMax 키 없으면 skip · 루프366 Chrome/srcdoc bake 증거.

## 범위

1. `cardsShellPeerFitBonus` — exact peer fit +2 · oversize +1 · undersize −1
2. `pickTemplateShellsForContent`가 body lineCount를 cards pick에 전달
3. host `timeline-layout` · peer `timeline-row`
4. 테스트: 3-line feature-postit · timeline trim · chrome/srcdoc bake
5. MiniMax skip 재확인

## 비범위

- MiniMax 실키 호출(키/`.env` 없음)
- FileViewer 풀 앱 tools-dev + Teamver BFF GUI
- leftover `기둥 Z`

## 테스트

| 케이스 | 기대 |
|--------|------|
| cover + 3-line cards + timeline 2줄 | feature-postit 3 · 전략/디자인/런칭 · timeline-row 2 · Phase Three 제거 |
| MiniMax live | 키 없으면 skip |
| srcdoc-loop366-chrome-bake | section `#stage` hoist · compact true |
| Chrome headless auto.html | `data-active=1` · Page two visible |

## 완료 기준

- N02-3 **C12** ☑ · MiniMax ☐(키 없음) · 루프366 bake ☑

## 다음 추천 작업

1. MiniMax 키 환경 Clone fill live smoke
2. FileViewer ←/→ tools-dev + Teamver BFF GUI bake(선택)
3. peer-fit을 info-card/stat-card 외 템플릿으로 확장(선택)
4. statement 외 sticky chrome deny 목록 점검(선택)

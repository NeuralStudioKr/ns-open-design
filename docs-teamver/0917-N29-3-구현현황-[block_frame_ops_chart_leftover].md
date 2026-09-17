# 0917-N29-3 구현현황 · Block Frame 운영차트·역할 leftover·한글 tracking

## 상태

구현 완료. staging push 대상. ns-open-design 은 ns_cicd 미등록 — CICD 감시 없음.

## 555가 이 화면에 실패한 이유

HEAD `27b6ae75be` 에 leftover heal·`운영과보안` 사전·`:lang(ko)` tracking 은 있다. **이 스크린샷 DOM을 heal해도 남았다.** 배포 여부와 별개.

1. **차트:** `neutralizeBlockFrameChartSvgDemoMetrics` 는 clone `fillBlockFrameNeoSlots` 에서만 돌았다. persist leftover heal은 호출하지 않음. `fill="var(--pink)"` 막대는 547 hex equalize 를 스킵.
2. **역할/지표 leftover:** h1–h4 만 역할 제목을 바꿈. intro-card `<p>` 와 `.data-label` 본문은 leftover RE 대상이 아님. `전환율`/`활성`/`품질` 라벨 RE 없음.
3. **한글 tracking:** `:lang(ko)` + 일부 클래스. MiniMax `html lang="en"` 이면 음절이 갈라져 보임. `.nb-mono` / `.legend-item` / 한글 음절 요소 미적용.

## 구현

| 항목 | 반영 |
|---|---|
| leftover heal에서 chart wipe/균등화 | ☑ `var(--pink\|green\|blue)` fill 포함. Q1–Q5 wipe. chart-svg shell 유지 |
| `전환율`/`활성`/`품질` topic-aware | ☑ 짧은 leftover 라벨만. catalog leftover 문장 strip. ≥20자 구체 문장 유지 |
| `실무자`/`리더`/`운영자` 전역 leftover | ☑ h3/h4 + `.nb-card` / `.card` / heading 클래스. 「반복 작업을 줄이고…」 strip |
| 한글 tracking lang=en | ☑ `data-od-hangul="1"` + 킷 tracking 클래스. `:lang(ko)` 만 의존하지 않음 |
| `운영과보안` → `운영과 보안` | ☑ 사전 유지. leftover heal heading 복구 |
| 게이트 | ☑ 공식 지문 또는 chart-frame/intro-card/data-box 구조 마커 |
| persist/pad/continue · Halo · Raw-Grid · 554 | ☑ 미변경 |

## 검증

- fixture `loop556-block-frame-ops-chart.html` (lang=en)
  - `운영과보안` 없음 / `운영과 보안` 있음
  - 카드 h3/h4 에 `실무자`/`리더`/`운영자` 없음
  - 「반복 작업을 줄이고 결과물 완성도를」 없음
  - Q1–Q5 없음, `chart-svg` 유지
  - `[data-od-hangul="1"]` CSS 가 lang=en 문서에 주입
- 555 fixture 회귀 유지

## 재현

1. fixture 를 `healBlockFrameLeftoverCatalogCopy(..., 'Teamver 소개')` 또는 `salvageMalformedMiniMaxSlideMarkup` 에 넣는다.
2. 555 HEAD만 돌리면 Q1–Q5·역할 본문·`전환율` data-box·lang=en tracking 이 남는다.
3. N29 후에는 위 pin 이 통과한다.

## 변경 이력

| 2026-09-17 18:10 | N29 구현. leftover heal에 chart/역할/지표/hangul 선택자 확장. |

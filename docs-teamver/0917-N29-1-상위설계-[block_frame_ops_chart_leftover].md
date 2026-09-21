# 0917-N29-1 상위설계 · Block Frame 운영차트·역할 leftover·한글 tracking

## 사용자 리포트 (루프555 `27b6ae75be` 이후)

Block Frame 품질이 여전히 떨어진다. 첨부 스크린샷 2장.

### 1) 초록 배경 + 흰 chart-frame (`slide-4`)

- 제목 `운영과보안` 붙여쓰기
- 왼쪽: 분홍/초록/파랑 데모 막대 (Q1–Q5 잔재)
- 오른쪽 data-box: `전환율` / `활성` / `품질` + 본문이 음절이 떨어진 것처럼 보임

### 2) 하늘색 + 흰 카드 3장

- 제목 `근거와 사례` (띄어쓰기는 있을 수 있음)
- **`실무자` / `리더` / `운영자` 가 그대로** + 「반복 작업을 줄이고 결과물 완성도를 높이는 방식」 등 공통 service-intro leftover

## 555가 이 화면에 실패하는 이유 (배포 여부와 무관)

HEAD `27b6ae75be` 에 leftover heal·글자 붙임 사전·`:lang(ko)` tracking 가드는 있다. **이 DOM을 그대로 heal해도 스크린샷이 남는다.**

| 증상 | 555가 못 맞춘 지점 |
|---|---|
| Q1–Q5 / 3색 데모 막대 | `neutralizeBlockFrameChartSvgDemoMetrics` 는 `fillBlockFrameNeoSlots` 에서만 돈다. persist leftover heal(`healBlockFrameLeftoverCatalogCopy`)은 호출하지 않음. SVG가 `class="chart-svg"` 가 아니거나 `fill="var(--pink)"` 이면 547 equalize 도 스킵. |
| `전환율` / `활성` / `품질` | service-intro 지표 leftover. leftover 제목 RE에 없음. data-box 본문 선택자는 `.step-desc` / `.nb-body` 만. |
| `실무자` / leftover 본문 | h1–h4 만 역할 제목을 바꿈. `.nb-card` / `.card` / `.nb-heading-*` / `.card-title` 을 놓치면 남음. intro-card `<p>` leftover 는 strip 대상이 아님 (555 fixture도 본문 pin 없음). |
| 한글이 음절처럼 보임 | CSS 가드가 `:lang(ko)` / `html[lang=ko]` + 일부 클래스. MiniMax는 `html lang="en"` 을 자주 냄. `.nb-mono` / `.legend-item` / 한글 음절이 있는 임의 요소는 미적용. |
| `운영과보안` | 사전에는 있음. leftover heal이 지문(`officialLookIsNeoBrutalBlockFrame`)에 막히거나 heading 선택자를 못 보면 복구 안 됨. |

「staging 미배포」만으로 끝내지 않는다. fixture `loop556-block-frame-ops-chart.html` 이 555 heal을 통과하지 않으면 규칙을 확장한다.

## 수정

1. leftover heal에서 chart-svg wipe/균등화 호출. `chart-frame` 안 SVG 도 대상. `var(--pink\|green\|blue)` fill 막대도 equalize. Q1–Q5 라벨 wipe. chart shell 유지.
2. `전환율` / `활성` / `품질` 은 짧은 leftover 라벨 → topic-aware. 한국어 ≥20자 구체 문장은 루프554 유지. catalog leftover 문장(방문에서 문의·가입까지… 등)은 strip.
3. `실무자` / `리더` / `운영자` + 「반복 작업을 줄이고…」 를 Block Frame 전역 leftover. `.intro-card` / `.feature-card` / `.nb-card` / `.card` 의 h3/h4 및 heading 클래스. strip 후 seed 역할 제목(또는 빈 제목+본문 유지).
4. 한글 tracking: `:lang(ko)` 에만 의존 금지. 한글 음절이 있는 요소에 `data-od-hangul="1"`. 킷 tracking 클래스 전부 (`.nb-label` `.nb-heading-*` `.nb-mono` `.data-label` `.legend-item` `.intro-card h3` `.stat-label` 등). `html[lang=en]` 에서도 적용.
5. 붙여쓰기 사전 유지·확인: `운영과보안` → `운영과 보안`.
6. leftover heal 게이트: 공식 지문 **또는** `chart-frame` / `intro-card` / `data-box` / `nb-heading` 구조 마커.

persist/pad/continue 손대지 않음. Product Launch 554 · Halo / Raw-Grid 유지.

## fixture pin

`loop556-block-frame-ops-chart.html` (lang=en, chart-svg + data-box + 실무자 카드):

- heal 후 `운영과보안` 없음, `운영과 보안` 있음
- `실무자` / `리더` / `운영자` 가 카드 h3/h4에 없음
- 「반복 작업을 줄이고 결과물 완성도를」 leftover 없음
- chart 데모 Q1–Q5 라벨 없음(또는 균등 막대)
- 한글 tracking 가드가 lang=en 문서에서도 적용되는 CSS pin

## 보존

persist pad/continue. Halo / Raw-Grid healer. Product Launch 루프554. secrets 금지. ns-open-design ns_cicd 미등록 — CICD 금지.

## 변경 이력

| 2026-09-17 17:55 | N29 상위설계. 555가 이 스크린샷 DOM을 못 맞추는 지점과 fixture pin. |

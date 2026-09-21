# 0916-N15-1 상위설계 — Block Frame chart-svg Q1..Q5 잔재

**날짜:** 2026-09-16 · **루프:** 547

## 체감

`html-ppt-zhangzara-block-frame` 킷의 `.slide-4` (Performance Data) 차트가
한국어 non-metric 프로즈 슬라이드에 그대로 남는다.

- X 축 `Q1`, `Q2`, `Q3`, `Q4`, `Q5` 라벨이 축 아래 크게 노출 (18px, weight 700).
- 3-계열(분홍/파랑/초록) 15개 `<rect>` 막대의 높이가 완만한 우상향으로
  하드코딩되어, 실제 데이터가 없는데도 "성장" 시멘틱이 시각적으로 남는다.
- 기존 `neutralizeBlockFrameChartSvgDemoMetrics`는 숫자/월 라벨(0, 33, 66,
  100, Jan..Dec, +142%, 2.4M)만 wipe하고 `Q\d+`나 막대는 손대지 않는다.
- 사용자 리포트: `www.teamver.com 사이트 분석해서 서비스 소개 슬라이드` 브리프
  (제목 "운영과 보안" 슬라이드) 에서 X 축 Q1..Q5 + 5단 상승 막대 그대로.

## 정책

`chart-svg` shell은 반드시 유지한다 — `.data-column` 형제가 flex 1로
채워질 때 shell이 사라지면 `.data-box` 3개가 겹쳐 겹침 붕괴 (루프534 회귀).

healer 확장:

1. **Q\d+ 축 라벨 wipe** — `>Q1<`, `>Q1 2026<` 같은 SVG `<text>` 컨텐츠를
   빈 문자열로 치환. (Y 축 숫자/월 라벨은 기존 로직으로 이미 wipe.)
2. **컬러 막대 균등화** — `chart-svg` 내부의 `<rect fill="#XXXXXX">` 중
   `y + height`가 공통 baseline (예: 280) 을 만족하는 막대만 대상. 평균
   높이를 계산해 모든 대상 막대의 `y` / `height`를 그 값으로 정규화.
   - 축·격자(`<line>`)는 건드리지 않음.
   - 공통 baseline이 검출되지 않으면 (다른 킷/레이아웃) 조기 반환.
3. **`export`** — 회귀 픽스처 단위 테스트에서 직접 호출할 수 있도록
   `neutralizeBlockFrameChartSvgDemoMetrics`를 export.

## 위치

- `packages/contracts/src/template-clone-fill.ts` `neutralizeBlockFrameChartSvgDemoMetrics`
  (+ 신규 헬퍼 `equalizeBlockFrameChartBars`).
- 픽스처: `packages/contracts/tests/fixtures/loop547-block-frame-q1-q5.html`
  (예시의 `.slide-4` 캡처).
- 테스트: `packages/contracts/tests/template-clone-fill.test.ts` — 힐러 단위
  + `buildTemplateClonedDeckHtml` 파이프라인 두 케이스.

## 회귀 방지

- chart-svg shell 유지 (루프534 회귀).
- Q1..Q5 (또는 `Q1 2026` FY 형식) 축 라벨 완전 wipe.
- 15개 컬러 막대의 `y`·`height` 각각 1개 값으로 축소.
- 축 라인 (`<line ... y1="280" y2="280">`) 미변경.

## 범위 외 (다른 슬라이스가 담당)

- 짧은-응답 자동 pad·저장 경로 (`findClientSlideCountRegression`
  등)·프롬프트의 `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` /
  `SLIDE_DECK_UNIQUE_SLOT_COPY_INSTRUCTION` /
  `SLIDE_DECK_TOPIC_LOCK_INSTRUCTION`.
- Retro-Windows `Q[1-4] 20\d{2}` 로드맵 테이블, Raw-Grid `$27.6M` KPI —
  후속 슬라이스 (N16 이후) 후보.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 14:41 | 최초 작성 (루프547) |

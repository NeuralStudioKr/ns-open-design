# 0916-N01-1 상위설계 · Broadside 카탈로그 데모 카피 힐러

## 배경
- 사용자 리포트 (2026-09-15 저녁): Home create에서 `www.teamver.com` 브리프로 생성된 결과물이
  Broadside(SPACE10 protest poster) 킷을 골랐을 때 다음 데모 카피들이 그대로 남았다.
  - `.stat-value`: `$3.5B` · `3×` · `#1`
  - `.pie-legend`: `Leader / Challenger / Followers / Other` + `40% / 28% / 20% / 12%` + `TOTAL MARKET: $[X]B`
  - `.fadelist-item`: `Before / During / After`, `.fadelist-title`: `the / session`
  - `.broadside-num`: `[Studio X] Guidelines`, `06 / 10`
  - `.slide-foot .label`: `Broadside` (모든 dark 슬라이드에서 반복)
- 또한 `.slide--diagram` 등의 body 슬라이드에서 컨텐츠가 좌상단에 붙고 하단이 텅 비는 레이아웃 붕괴가 관찰되었다.
  - 실행 방안 슬라이드 스크린샷: 3열 flow 카드가 상단 1/3에만 놓이고 나머지 orange 배경만 남음.

## 근본 원인
1. **Broadside 전용 heal 함수 부재**
   - `healStudioLeftoverCatalogCopy`, `healCreativeLeftoverCatalogCopy` 등은 존재하지만
     `officialLookIsBroadside(dest)`이 참일 때 실행되는 경로가 없어 슬롯 채우기·데모 스크럽이 모두 스킵된다.
   - `fillStudioKitSlide`는 `slide--cover|chapter|split|list|compare|statement|stats|quote`만 다루고
     Broadside 고유의 `slide--diagram`(flow), `slide--pie`(donut+legend), `slide--fadelist`(SPACE10 timeline chrome)는
     비어 있어 template chrome이 그대로 노출된다.

2. **컴팩트 렌더링에서 `.slide-body`가 안 자람**
   - Broadside 킷은 `.slide { display: grid; grid-template-rows: auto 1fr auto }`로 body 영역을 1fr에 배치.
   - 컴팩트 모드는 슬라이드 콘텐츠를 `[data-od-slide-flow]`(absolute inset:0, `display:flex; flex-direction:column`)
     로 감싸므로 슬라이드 자체의 grid는 무의미해지고 `.slide-body`는 intrinsic height로 축소된다.
   - 결과: `.slide-foot { margin-top:auto }`는 여전히 하단으로 밀리지만, body는 상단에 붙고 가운데가 텅 빈다.

## 목표
- Broadside 킷 Home create 결과물에서 다음이 모두 만족되어야 한다.
  1. 데모 KPI/legend/fadelist chrome이 살아 남지 않는다.
  2. `slide--diagram`, `slide--pie`, `slide--fadelist`에 실제 outline 카드 카피가 채워진다.
  3. `.slide-body`가 flow wrapper 안에서 세로 중앙 정렬을 유지한다.
  4. Studio/Creative Mode 등 다른 킷 회귀는 없어야 한다.

## 접근 개요
1. `healBroadsideLeftoverCatalogCopy(html, brief)` 신규 함수.
   - `officialLookIsBroadside` guard.
   - 슬라이드 호스트 열거 → `BROADSIDE_LEFTOVER_BODY_RE` 또는 `looksLikeLeftoverTemplateDemoDeck` 매칭 시 `fillStudioKitSlide` 적용.
   - 최종 `stripStudioCreativeCatalogDemoCopy` + `stripLeftoverCatalogDemoPhrases`.
   - `applyFillHealers` 파이프라인에 `healStudioLeftoverCatalogCopy` 다음 위치로 연결.
2. `fillStudioKitSlide` 확장.
   - `slide--diagram` → `.flow-step` 슬롯 (`flow-num` / `flow-title` / `flow-desc`) 채우기.
   - `slide--pie` → `.pie-item-label` / `.pie-item-val` 채우기, `.pie-total`에 `[X]|TOTAL MARKET|placeholder` 남으면 wipe.
   - `slide--fadelist` → `.fadelist-item` span 시퀀스 채우기, `.fadelist-title` 교체, `.broadside-num`의 chrome 토큰 wipe.
   - `slide--stats` `.stat-value` 신규 정책:
     - fill line에 metric-like 문자열이 있으면 대체
     - 아니면 seed의 `.stat-value` 텍스트가 `BROADSIDE_STAT_VALUE_DEMO_RE`(`$3.5B`, `3×`, `#1`, `[X]B` 등)와 일치할 때만 카드 ordinal(`01`, `02`, `03`)로 대체
     - 실제 seed 숫자(`12` 등)는 유지 → 기존 Studio 테스트 회귀 없음.
   - `.slide-foot .label` wipe에 `Broadside`, `[Studio X]` 케이스 추가.

3. `deck-fixed-canvas.ts` 컴팩트 CSS 확장.
   - `.slide > [data-od-slide-flow] > .slide-body { flex:1 1 auto; min-height:0 }` 규칙 추가.
   - 주석에 loop536 근거·사용자 리포트 시점 남김.

4. 정규식 자산 확장.
   - `BROADSIDE_LEFTOVER_BODY_RE`: Broadside만 매칭되는 chrome/legend 토큰 (Studio 매칭은 원본 유지).
   - `BROADSIDE_STAT_VALUE_DEMO_RE`: literal demo string 매칭만 (진짜 숫자 seed 오검출 방지).
   - `LEFTOVER_CATALOG_PHRASE_RE`에 `[Studio X] Guidelines`, `TOTAL MARKET: $[X]B` 추가.

## 위험 · 회귀 가드
- Studio/Creative Mode 기존 heal 경로에는 관여하지 않는다 (`officialLookIsBroadside` 판정으로 격리).
- `fillStudioKitSlide`의 신규 브랜치는 모두 class 존재 검사로 gate 되어 있어 Studio HTML에서는 no-op.
- `.stat-value` 정책 변경은 metric detection + literal demo pattern 이중 gate로 진짜 숫자 seed 회귀 방지.
- 컴팩트 CSS 규칙은 `[data-od-slide-flow] > .slide-body` 셀렉터로 스코프하여 원본 presentation 문서에는 영향 없음.

## 검증 계획
- 유닛 테스트: `templates-clone-fill.test.ts`에 `루프536 — Broadside orange kit demo chrome ...` 추가.
- Fixture: `packages/contracts/tests/fixtures/loop536-broadside-teamver-empty-bottom.html` (사용자 리포트 HTML 축약본).
- 기존 Studio/Creative 힐러 테스트(`루프476: persist leftover refill replaces Studio catalog body` 등) 그대로 통과.
- `pnpm --filter @open-design/contracts test` 전체 통과.

## 후속 (다른 라운드로 이관)
- Round a: 다른 공식 킷의 example.html에도 동일한 catalog leftover 검사·힐러 확장.
- Round b: Studio/Signal/Grove/Coral/Playful 등에서도 `.slide-body` flow-wrapper 안 layout 붕괴 여부 재검사.
- Round d: `.stat-value` demo 검출·중립화 로직을 공통 helper로 추출해 다른 KPI 슬롯(`.stat-number`, `.big`, `.hero-stat` 등)에도 재사용.

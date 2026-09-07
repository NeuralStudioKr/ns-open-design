# 0907-N01-2 구현설계 — Block Frame neo 슬롯 fill 게이트 회귀 (루프461)

상위: [0907-N01-1](./0907-N01-1-상위설계-[Block_frame-neo-slot-gate].md)

## 파일

### `packages/contracts/src/template-clone-fill.ts`

1. **`fillSlideShell`** — `if (officialLookIsNeoBrutalBlockFrame(body))` 제거.
   `fillBlockFrameNeoSlots`를 항상 호출. 함수 내부 구조 마커 게이트가 no-op을
   담당한다.

2. **`fillBlockFrameNeoSlots`**
   - 게이트에 `chart-frame` / `nb-label` / `intro-card` / `feature-card` /
     `stat-card` / `timeline-step` 추가 (slide-2 Overview 등 CSS 없는 셸도 진입).
   - `nb-label` 영문 크롬(`Overview` / `Methodology` / `By The Numbers` /
     `The Team` / `Roadmap` / …) → `kicker || title`로 교체.

3. **`firstExactClassRange` / `replaceFirstExactClassText`** — 태그 집합에
   `a` / `button` 추가 → `.nb-btn` / `.close-btn` 텍스트 fill.

4. **`BLOCK_FRAME_NEO_DEMO_COPY_RE`** — `Visual System` / `By The Numbers` /
   `The Team` / `Methodology` / `Roadmap` / team bio 데모 문구 추가.

### `packages/contracts/tests/helpers/deterministic-template-quality-gate.ts`

Block Frame `demoMustNotInclude`에 `Visual System` / `Image Placeholder` /
`Get Started` / `By The Numbers` / `Overview` 추가.

## 검증

- `pnpm vitest run tests/template-clone-fill.test.ts` — 160 passed
- 수동 fixture: body에 `Visual System` / `chart-legend` / `Overview` /
  `Get Started` 없음 · `nb-btn`=`자세히 보기` · `deco-yellow-bar`=`Teamver`

---

## 루프462 — preview heal이 Block Frame host를 orphan

### 증상

deterministic fill 직후 HTML은 `col-right` / `data-column` 안에 peer가
정상. FileViewer · `buildSrcdoc`가 `healAiGeneratedDeckMarkup`을 돌리면
`closeUnclosedSiblingCardsInSlides`가 host를 조기 `</div>`로 닫아
`<div class="col-right"></div><div class="intro-card">…` 형태가 됨.
이어서 `wrapLooseStatMetricPairsIntoCards`가 두 번째 `stats-grid`를 주입.

### 원인

`attrsLookCardish`가 쓰던 `CARDISH_CLASS_RE =
/\b(?:card|…|col(?:umn)?s?|…)\b/i` 가 클래스 문자열 **부분** 매칭:
`col-right`→`col`, `data-column`→`column`, `stat-number`→`stat`.

### 수정 (`heal-ai-generated-deck.ts`)

`classValueLooksCardish(classValue)`:

- exact token: `card|pillar|tile|panel|cell|box|metric|stat|kpi|col|column|…`
- compound: `*-card|*-box|*-tile|*-panel|*-pillar` (`intro-card`, `data-box`)
- layout host 제외: `col-left|col-right|data-column|stats-grid|…`

`childLooksLikePeerCard` / `attrsLookCardish` / `childLooksLikeSizedPeerCard`
가 동일 헬퍼를 사용.

### 부가 (`template-clone-fill.ts`)

outline이 `kicker: 'OVERVIEW'`를 주는 경우 neo chrome에 영문을 재기록하지
않도록 `blockFrameNeoChromeLabel`(Overview→개요 등).

### 회귀 테스트

`루프462: Block Frame fill → preview heal keeps col-right / data-column hosts`

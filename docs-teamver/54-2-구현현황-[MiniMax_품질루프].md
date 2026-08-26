# 54-2 구현현황 — MiniMax 품질 루프

**기획:** [54](./54_MiniMax_전환_기획_설계.md)  
**설계:** [54-1](./54-1_MiniMax_전환_개발설계.md)

MiniMax compact fill 이후 반복되는 품질·오류 항목. 체크는 코드에 가드가 있고 빨간 스펙이 초록으로 돌아간 경우만 표시합니다.

## 진행

| 항목 | 상태 |
|------|------|
| chat leftover: WD/SLIDE 짧은 트랙 크롬 | ☑ round27–28 |
| chat leftover: PAGE/SEC/LECTURE · bullet/hyphen · middle-dot 배지 | ☑ round29 |
| chat leftover: CHAPTER 트랙 · 한 자리 `5 / CHECKLIST` | ☑ round30 |
| chat leftover: PART 트랙 · figure hsl | ☑ round31 |
| chat leftover: UNIT/STEP/MODULE/SECTION · ACT/SCENE/PHASE · EPISODE/BLOCK/FRAME/SESSION | ☑ round32 |
| chat leftover: APPENDIX/TABLE/TOPIC/TRACK/PANEL/CARD/BEAT/LESSON/CLIP/ROUND/PASS/NOTE | ☑ round33 |
| chat leftover: QUOTE/ASIDE/CALL/HINT/FAQ/LAB/DEMO/DRILL/INDEX/TOC/MAP/BRIEF | ☑ round34 |
| chat leftover: HOOK/OUTRO/AGENDA/COVER/TAKEAWAY/QNA/TIP/EXAMPLE … | ☑ round35 |
| chat leftover: SCREEN/TASK/WORKSHOP/DECK/MOTIF | ☑ round35 |
| chat leftover: OVERVIEW/PROBLEM/KPI/CTA/ROADMAP/COMPARE … | ☑ round36 |
| chat leftover: LAYOUT/HERO/NAV/BADGE/ICON/FIGURE … | ☑ round37 |
| chat leftover: GALLERY/MODAL/TAB/FORM/BUTTON/WIDGET … | ☑ round38 |
| chat leftover: AVATAR/CHIP/DROPDOWN/DASHBOARD/CANVAS … | ☑ round39 |
| chat leftover: TOOLTIP/CALLOUT/COMMENT/LOGO/SKELETON/PAGINATION … | ☑ round40 |
| chat leftover: SPLIT/SURFACE/GRADIENT/GLASS/SHADOW … | ☑ round41 |
| chat leftover: RIBBON/WATERMARK/SCRIM/DIVIDER/CONTAINER … | ☑ round42 |
| chat leftover: BLEED/PARALLAX/DRAFT/TODO … | ☑ round43 |
| chat leftover: LETTERBOX/ZINDEX/SVG/GLITCH … | ☑ round44 |
| chat leftover: SPARKLINE/DROPCAP/FUNNEL/GLOSSARY … | ☑ round45 |
| chat leftover: AXIS/KPISTRIP/SPLITVIEW/MAGNIFIER … | ☑ round46 |
| chat leftover: TOCENTRY/HASHTAG/DOWNLOADBTN … | ☑ round47 |
| chat leftover: ICONBTN/SEGMENT/COMMANDPALETTE … | ☑ round48 |
| chat leftover: ACTIONBAR/EMPTYSTATE/DATAGRID … | ☑ round49 |
| chat leftover: DRAGDROP/HITAREA/IFRAME … | ☑ round50 |
| chat leftover: *BTN/*CTRL/*STATE 접미사 캐치올 | ☑ round51 |
| chat leftover: VIEW/HOST/PANEL/CARD … 접미사 확장 | ☑ round52 |
| chat leftover: MODAL/CHART/IMAGE/VIDEO … 접미사 확장 | ☑ round53 |
| chat leftover: HERO/KPI/COVER/SECTION … 접미사 확장 | ☑ round54 |
| chat leftover: BRIEF/SOLUTION/LAB/BEAT … 접미사 확장 | ☑ round55 |
| chat leftover: WEEK/CHAPTER/SLIDE/FINALE … 접미사 · @font-palette-values | ☑ round56 |
| chat leftover: GALLERY/STEPPER/COMMENT · @scroll-timeline | ☑ round57 |
| chat leftover: LABEL/AVATAR/CAPTION/TABLEAU … | ☑ round58 |
| chat leftover: DASHBOARD/STORYBOARD · truncated prop: | ☑ round59 |
| chat leftover: PORTFOLIO/PITCH/TEASER · @annotation | ☑ round60 |
| chat leftover: REEL/STORY/PODCAST/FAQS … | ☑ round61 |
| chat leftover: KEYVISUAL/TOKENS/THEME … | ☑ round62 |
| chat leftover: WIRE/SPRINT/USABILITY … | ☑ round63 |
| chat leftover: generic ALLCAPS `FOOXYZ 1 · XYZ` | ☑ round64 |
| chat leftover: 2글자 ALLCAPS `UX 2 · RESEARCH` | ☑ round68 |
| chat leftover: @custom-media/@stylistic | ☑ round65 |
| chat leftover: @custom-selector/@view-transition | ☑ round66 |
| leftover APPEND가 producedFiles 있어도 말풍선에 남음 | ☑ 루프18 |
| dump fallback이 `초안.`/`진행.`/한글 완료 문장을 지움 | ☑ 루프19 |
| split-* 마감/체크리스트가 inner clip을 건너뛰어 16:9 overflow | ☑ 루프20 |
| two-column `flex-direction:row` · col-left/right가 persist 후 세로 적재 | ☑ 루프21 |
| soft-CSS: oklab / color() continuation debris | ☑ round32 |
| soft-CSS: light-dark / device-cmyk continuation debris | ☑ round34 |
| soft-CSS: standalone `prop: value;` after Hangul status | ☑ round36 |
| persist: `li` + `hsl()` invented frame | ☑ |
| persist: `figure` comma/space hsl 프레임 | ☑ |
| persist: overlay `05 / CHECKLIST` span | ☑ |
| persist: 카드 안 중첩 배지 · h2/header · `position:fixed` · `05 · LABEL` | ☑ |
| persist: navy/indigo/cyan 1–2px fake outline | ☑ |
| persist: 색 방언 무관 1–2px 프레임 + `box-shadow` ring · kit `var(--border)` 유지 | ☑ |
| persist: oklch/oklab/lab/lch/color/color-mix · emerald/amber named frames | ☑ round32 |
| persist: `hwb()` invented frames · outline oklch | ☑ round33 |
| persist: device-cmyk · light-dark invented frames | ☑ round34 |
| persist: coral/tomato/rebeccapurple/gold … named frames | ☑ round35 |
| persist: main/blockquote/nav/ul/ol/dl kit bind hosts | ☑ round35 |
| persist: firebrick/orangered/khaki/slategray … named frames | ☑ round36 |
| persist: card-like p/span/h2–h4 (≥12px padding) kit bind · thin accent keep | ☑ round37 |
| persist: card-like rem/em padding (≥0.75rem) kit bind | ☑ round38 |
| persist: card-like % (≥4%) · ch (≥2ch) padding kit bind | ☑ round39 |
| persist: card-like vh/vw/vmin/vmax/dvh (≥2) padding kit bind | ☑ round40 |
| persist: card-like cqw/cqh/cqi/cqb (≥2) · details/summary/label/output kit bind | ☑ round41 |
| persist: card-like lh/cap/ex/ic/vb (≥2) · fieldset/legend/dialog/menu kit bind | ☑ round42 |
| persist: card-like pt/mm/cm (≥8pt/4mm) · h1/h5/mark/time kit bind | ☑ round43 |
| persist: cite/q/kbd/samp/small selective kit bind (a/button keep) | ☑ round44 |
| persist: aliceblue/chartreuse/darkgray … CSS named invent frames | ☑ round47 |
| persist: table/td/th selective kit bind (svg keep) | ☑ round48 |
| persist: column-count/place-items/flex-grow/writing-mode flow 복사 | ☑ round49 |
| persist: container-type/name/container flow 복사 | ☑ round51 |
| persist: scroll-snap/isolation/contain/user-select flow 복사 | ☑ round52 |
| persist: perspective/will-change/scroll-margin/print-color-adjust flow 복사 | ☑ round53 |
| persist: position/aspect-ratio/background/view-transition flow 복사 | ☑ round54 |
| persist: overflow/offset-path/view-timeline/margin flow 복사 | ☑ round55 |
| persist: font/text-align/color flow 복사 | ☑ round56 |
| persist: padding-block/list-style/table-layout flow 복사 | ☑ round57 |
| persist: float/break/orphans/shape-outside flow 복사 | ☑ round58 |
| persist: text-emphasis/field-sizing/reading-flow flow 복사 | ☑ round59 |
| persist: position-area/mask/text-box/initial-letter flow 복사 | ☑ round60 |
| persist: masonry/baseline/paint-order flow 복사 | ☑ round61 |
| persist: animation-range/column-rule flow 복사 | ☑ round62 |
| persist: scroll-marker/interactivity/contrast-color flow 복사 | ☑ round63 |
| persist: address/hgroup/search · data/meter kit bind | ☑ round65 |
| persist: corner-shape/text-box/anchor-center flow 복사 | ☑ round66 |
| persist: form kit · font-palette/wrap flow 복사 | ☑ round67 |
| persist: caret-animation/text-spacing flow 복사 | ☑ round68 |
| persist: math kit · scroll-padding/margin longhand flow | ☑ round69 |
| persist: scroll-padding-top · overflow-block flow 복사 | ☑ round70 |
| persist: margin/inset longhand · outline/border-block flow | ☑ round71 |
| persist: background/transform/transition/animation flow | ☑ round72 |
| persist: border-radius · grid-column/row flow | ☑ round73 |
| persist: cursor/scrollbar/text-edge flow | ☑ round74 |
| persist: font-variant/text-orientation flow | ☑ round75 |
| persist: padding-block/inline ic kit · font-synthesis-* | ☑ 루프74–75 / round91–92 |
| persist: text-size-adjust · text-wrap-mode/style | ☑ 루프76 / round93 |
| persist: initial-letter-* · math-shift · hyphenate-lines | ☑ 루프77 / round94 |
| persist: rt/rp/rtc kit · ascent/size-adjust · forced-colors | ☑ 루프78 / round95 |
| persist: scroll/view-timeline shorthand · line-clamp · palette | ☑ 루프79–82 / round96–99 |
| persist: page/marks/shape-inside/calc-size | ☑ 루프83 / round100 |
| persist: SVG fill/stroke · speak/user-modify · thin pad keep | ☑ 루프84–87 / round101–104 |
| persist: set5 combo 회귀 | ☑ 루프88 / round105 |
| persist: font-smooth · bdi/del/sub kit · SVG path · app-region | ☑ 루프89–93 / round106–110 |
| persist: webkit text-stroke/clip/box-orient · fullwidth · | ☑ 루프94–98 / round111–115 |
| persist: thin bdi keep · fill+path · starting-style · closure | ☑ 루프99–103 / round116–120 |
| clone: IB pitch-book 데모 카피가 한국어 brief에 남음 | ☑ 루프57 |
| preview: #stage 1920px 스트립이 100vw로만 살짝 이동 | ☑ 루프57 |
| persist: 카탈로그 예제 leftover를 filled로 저장 | ☑ |
| leftover가 persist skip 후에도 미리보기로 열림 · top-up append | ☑ |
| clone: demo-banner/TOC/stat-quote 잔여 · #total 불일치 | ☑ 루프58 |
| preview: #slideCounter 고정 · hoist가 chrome 삭제 | ☑ 루프58 |
| daemon: leftover 데모 시드가 재클론을 막음 | ☑ 루프58 |
| 16:9 inner clip · kit card bind | ☑ |
| top-up 재진입 재호출 + 내부 프롬프트 노출 | ☑ 센티널+autoOpen; 루프9 reattach 차단 · leftover 숨김 |
| first-fill 3장 강제 → 요청 1–6장 한 턴 | ☑ 루프9 |
| auto-continue / streaming rule / short-draft 캡 3장 잔여 | ☑ 루프14 |
| 스트리밍 official look — 첫 닫힌 슬라이드에서 heal | ☑ 루프14 |
| PreviewModal/connector message 가드 | ☑ |
| cover 제목 `Presentation` → `슬라이드` | ☑ |
| MiniMax head-only incomplete-html-document-shell | ☑ 1차 |
| MiniMax `<body>`+미종료 `<style>` kit → incomplete-html-document-shell | ☑ 2차 |
| persist: Neutral 호스트/inner overlay 페인트 · 3장 1타이틀 · catalog heal skip | ☑ 루프5 |
| persist: grid flow clip · in-flow badge · CSS motif 전 장 | ☑ 루프5 |
| auto-continue: 슬라이드 카피 있는 truncated HTML 보존 · SLOT cover 거부 | ☑ 루프5 |
| persist: heading type-lock · inline Quicksand strip · low-substance verify | ☑ 루프8 |
| think 태그 / 내부 마크업 필터 | ☑ 기존 |
| 실제 MiniMax 생성 라운드트립(브라우저) | ☐ 이 환경에서 managed MiniMax 키 없음 |

## 이번 루프 (루프89–103 / round106–120)

1. persist — `font-smooth` / `-webkit-font-smoothing` / `-moz-osx-font-smoothing`
2. kit — selective `bdi`/`bdo`/`del`/`ins` · `sub`/`sup`/`var`/`code` (`strong` keep)
3. persist — SVG `x`/`y`/`d`/`points`/`pathLength` · `app-region` / tap / appearance / user-select
4. persist — `-webkit-text-fill/stroke*` · `-webkit-background-clip` · `-webkit-box-orient/direction`
5. chat — fullwidth `・`/`･` middle-dot chrome · `@starting-style` opacity dump
6. kit/flow — thin bdi/code keep · fill+path · set7/8 combo·closure 회귀

**검증:** chat-leak-probe-round106–120

## 직전 루프 (루프79–88 / round96–105)

1. persist — `scroll-timeline`/`view-timeline` shorthand
2. persist — `-webkit-line-clamp` · `color-adjust`
3. persist — `hyphenate-limit-before/after` · `base-palette`/`override-colors`
4. persist — `page`/`marks` · `shape-inside` · `calc-size`
5. persist — SVG `fill`/`stroke`(+opacity/geometry) · `speak*`/`user-modify`
6. chat — `@scroll-state` framework cutter harden
7. kit — thin `padding-block:0.5ic` accent keep · set5 combo 회귀

**검증:** chat-leak-probe-round96–105

## 직전 루프 (루프74–78 / round91–95)

1. persist — `padding-block`/`padding-inline`(+start/end) ≥1ic/ric kit bind
2. persist — `font-synthesis-weight/style/small-caps/position` flow
3. persist — `text-size-adjust` · `-webkit-text-size-adjust` · `text-wrap-mode/style`
4. persist — `initial-letter-align/wrap` · `math-shift` · `hyphenate-limit-lines`
5. persist — selective `rt`/`rp`/`rtc` kit · `ascent/descent/line-gap/size-adjust` · `forced-colors-adjust` · `font-display`

**검증:** chat-leak-probe-round91–95

## 직전 루프 (leftover open/top-up)

1. verify / usable / seed recover — leftover catalog example은 미리보기·LOOK seed 복구로 쓰지 않음
2. top-up — leftover prior에 append하지 않음. incoming leftover는 skip
3. preview — transform step은 slide/track/authored 폭

**검증:** verify leftover · srcdoc report chrome · project-view leftover top-up

## 직전 루프 (루프73 / round90)

1. persist — border-image+counter combo 회귀

**검증:** chat-leak-probe-round90

## 직전 루프 (루프72 / round89)

1. chat — `@scroll-state` dump cutter 회귀

**검증:** chat-leak-probe-round89

## 직전 루프 (루프71 / round88)

1. persist — padding ≥1ric kit bind

**검증:** chat-leak-probe-round88

## 직전 루프 (루프70 / round87)

1. chat — MASK/STROKE generic chrome 회귀

**검증:** chat-leak-probe-round87

## 직전 루프 (루프69 / round86)

1. persist — text-anchor/kerning flow

**검증:** chat-leak-probe-round86

## 직전 루프 (루프68 / round85)

1. persist — bookmark/footnote flow

**검증:** chat-leak-probe-round85

## 직전 루프 (루프67 / round84)

1. persist — nav/spatial-navigation flow

**검증:** chat-leak-probe-round84

## 직전 루프 (루프66 / round83)

1. persist — flood/stop/lighting flow

**검증:** chat-leak-probe-round83

## 직전 루프 (루프65 / round82)

1. persist — stroke/fill presentation flow

**검증:** chat-leak-probe-round82

## 직전 루프 (루프64 / round81)

1. persist — mask/mask-border flow

**검증:** chat-leak-probe-round81

## 직전 루프 (루프63 / round80)

1. persist — padding ≥1ic kit bind

**검증:** chat-leak-probe-round80

## 직전 루프 (루프62 / round79)

1. persist — brown/snow named invent frames

**검증:** chat-leak-probe-round79

## 직전 루프 (루프61 / round78)

1. chat — `@scroll-state` 스크럽

**검증:** chat-leak-probe-round78

## 직전 루프 (루프60 / round77)

1. persist — counter/contain-intrinsic/content/quotes flow

**검증:** chat-leak-probe-round77

## 직전 루프 (루프59 / round76)

1. persist — border-image flow

**검증:** chat-leak-probe-round76

## 직전 루프 (루프58)


1. clone — demo-banner/TOC/simple-deck 잔여 삭제. `#total` 동기화. persist heal도 demo chrome 제거
2. preview — `#slideCounter`/`#counter` 동기화. authored 1920px translate. hoist prune이 chrome 유지
3. daemon — leftover 데모 시드는 깨끗한 재클론으로 교체

**검증:** template-clone-fill · srcdoc-deck-bridge-transform-driven · compact-api-stacked-deck · template-clone-deck

## 직전 루프 (persist leftover catalog example)

1. persist — 사용자 브리프와 다른 Hartfield/DCF 예제를 `unfilled-catalog-example`로 거절
2. fill — 예제 고유명·표 REPLACE. leftover DCF 제목에 주제를 이어 붙이지 말 것

**검증:** deckLooksLikeUnfilledCatalogExample · project-view persist source

## 직전 루프 (루프57)

1. clone — placeholder brief가 IB pitch-book DCF/Hartfield/WACC 데모 카피를 남기지 않음. `maxSlides` 패딩도 placeholder 본문에서는 끔
2. preview — `#stage` 1920px 스트립은 sibling hide를 건너뛰고 slide width(px)로 이동. `#now`/`#total` 동기화

**검증:** template-clone-fill · srcdoc-deck-bridge-transform-driven · compact-api-stacked-deck

## 직전 루프 (루프56 / round75)

1. persist — font-variant · text-orientation flow 복사

**검증:** chat-leak-probe-round75 · round74 · deck-fixed-canvas

## 직전 루프 (루프55 / round74)

1. persist — cursor · scrollbar · text-edge/margin-trim flow 복사

**검증:** chat-leak-probe-round74 · round73 · deck-fixed-canvas

## 직전 루프 (루프54 / round73)

1. persist — border-radius · grid-column/row flow 복사

**검증:** chat-leak-probe-round73 · round72 · deck-fixed-canvas

## 직전 루프 (루프53 / round72)

1. persist — background/transform/transition/animation/offset flow 복사

**검증:** chat-leak-probe-round72 · round71 · deck-fixed-canvas

## 직전 루프 (루프52 / round71)

1. persist — margin/inset longhand · outline/border-block · scroll-*-start flow

**검증:** chat-leak-probe-round71 · round70 · deck-fixed-canvas

## 직전 루프 (루프51 / round70)

1. persist — scroll-padding-top · overflow-block flow 복사

**검증:** chat-leak-probe-round70 · round69 · deck-fixed-canvas

## 직전 루프 (루프50 / round69)

1. persist — math/mrow kit bind · scroll-padding/margin longhand flow

**검증:** chat-leak-probe-round69 · round68 · deck-fixed-canvas

## 직전 루프 (루프49 / round68)

1. chat — 2글자 ALLCAPS track (`UX 2 · RESEARCH`) 캐치올
2. persist — caret-animation/text-spacing flow 복사

**검증:** chat-leak-probe-round68 · round64 · deck-fixed-canvas

## 직전 루프 (루프48 / round67)

1. persist — form kit bind · font-palette/wrap flow 복사

**검증:** chat-leak-probe-round67 · round66 · deck-fixed-canvas

## 직전 루프 (루프47 / round66)

1. chat — `@custom-selector`/`@view-transition` 스크럽
2. persist — corner-shape/text-box/anchor-center flow 복사

**검증:** chat-leak-probe-round66 · round65 · deck-fixed-canvas

## 직전 루프 (루프46 / round65)

1. chat — `@custom-media`/`@stylistic` 스크럽
2. persist — address/hgroup/search · data/meter/progress/ruby kit bind

**검증:** chat-leak-probe-round65 · round64 · deck-fixed-canvas

## 직전 루프 (루프45 / round64)

1. chat — generic ALLCAPS track (`FOOXYZ 1 · XYZ`) 캐치올

**검증:** chat-leak-probe-round64 · round63

## 직전 루프 (루프44 / round63)

1. chat — WIRE/SPRINT/USABILITY 접미사 캐치올
2. persist — scroll-marker/interactivity/contrast-color flow 복사

**검증:** chat-leak-probe-round63 · round62 · deck-fixed-canvas

## 직전 루프 (루프43 / round62)

1. chat — KEYVISUAL/TOKENS/THEME 접미사 캐치올
2. persist — animation-range/column-rule flow 복사

**검증:** chat-leak-probe-round62 · round61 · deck-fixed-canvas

## 직전 루프 (루프42 / round61)

1. chat — REEL/STORY/PODCAST/FAQS 접미사 캐치올
2. persist — masonry/baseline/paint-order flow 복사

**검증:** chat-leak-probe-round61 · round60 · deck-fixed-canvas

## 직전 루프 (루프41 / round60)

1. chat — PORTFOLIO/PITCH/TEASER 접미사 · `@annotation`/`@namespace` 스크럽
2. persist — position-area/mask/text-box/initial-letter flow 복사

**검증:** chat-leak-probe-round60 · round59 · deck-fixed-canvas

## 직전 루프 (루프40 / round59)

1. chat — DASHBOARD/STORYBOARD 접미사 · 잘린 `prop:` CSS 스크럽
2. persist — text-emphasis/field-sizing/reading-flow flow 복사

**검증:** chat-leak-probe-round59 · round58 · deck-fixed-canvas

## 직전 루프 (루프39 / round58)

1. chat — LABEL/AVATAR/CAPTION/TABLEAU 접미사 캐치올
2. persist — float/break/orphans/shape-outside flow 복사

**검증:** chat-leak-probe-round58 · round57 · deck-fixed-canvas

## 직전 루프 (루프38 / round57)

1. chat — GALLERY/STEPPER/COMMENT 접미사 · `@scroll-timeline`/`@position-try` 스크럽
2. persist — padding-block/list-style/table-layout flow 복사

**검증:** chat-leak-probe-round57 · round56 · deck-fixed-canvas

## 직전 루프 (루프37 / round56)

1. chat — WEEK/CHAPTER/SLIDE 접미사 · `@font-palette-values`/`@property` 스크럽
2. persist — font/text-align/color flow 복사

**검증:** chat-leak-probe-round56 · round55 · deck-fixed-canvas

## 직전 루프 (루프36 / round55)

1. chat — BRIEF/SOLUTION/LAB/BEAT 등 피치 역할 접미사 캐치올
2. persist — overflow/offset-path/view-timeline/margin flow 복사 · props 중복 제거

**검증:** chat-leak-probe-round55 · round54 · deck-fixed-canvas

## 직전 루프 (루프35 / round54)

1. chat — HERO/KPI/COVER/SECTION 등 덱 역할 접미사 캐치올
2. persist — position/inset/aspect-ratio/background/view-transition flow 복사

**검증:** chat-leak-probe-round54 · round53 · deck-fixed-canvas

## 직전 루프 (루프34 / round53)

1. chat — MODAL/CHART/IMAGE/VIDEO 등 위젯·미디어 접미사 캐치올
2. persist — perspective/will-change/scroll-margin/print-color-adjust flow 복사

**검증:** chat-leak-probe-round53 · round52 · deck-fixed-canvas

## 직전 루프 (루프33 / round52)

1. chat — VIEW/HOST/PANEL/CARD 등 접미사 캐치올 확장 (`{0,28}`)
2. persist — scroll-snap/isolation/contain/user-select 등 flow 복사

**검증:** chat-leak-probe-round52 · round51 · round50 · deck-fixed-canvas

## 직전 루프 (루프32 / round51)

1. chat — `*BTN`/`*CTRL`/`*STATE` 접미사 leftover 캐치올 (토큰 나열 없이)
2. persist — container-type/name/container flow 복사

**검증:** chat-leak-probe-round51 · round50 · round48

## 직전 루프 (루프31 / round50)

1. chat — DRAGDROP/HITAREA/IFRAME 등 제스처·박스·호스트 트랙 숨김
2. persist — `grid:` 단축 · `justify-self` flow 복사 스펙 고정

**검증:** chat-leak-probe-round50 · round49 · deck-fixed-canvas

## 직전 루프 (루프30 / round49)

1. persist — flow wrap이 column-count/columns/place-items/flex-grow/writing-mode 복사
2. chat — ACTIONBAR/EMPTYSTATE/DATAGRID 등 바·상태·그리드 트랙 숨김

**검증:** chat-leak-probe-round49 · round48 · deck-fixed-canvas

## 직전 루프 (루프29 / round48)

1. chat — ICONBTN/SEGMENT/COMMANDPALETTE 등 버튼·컨트롤·필드 트랙 숨김
2. persist — table/td/th/thead는 card-like padding일 때만 kit bind (svg 미바인드)

**검증:** chat-leak-probe-round48 · round47

## 직전 루프 (루프28 / round47)

1. chat — TOCENTRY/HASHTAG/DOWNLOADBTN 등 TOC·소셜·툴바 트랙 숨김
2. persist — aliceblue/chartreuse/darkgray 등 잔여 CSS named invent 프레임을 kit bind

**검증:** chat-leak-probe-round47 · round46 · round35

## 직전 루프 (루프27 / round46)

1. chat — AXIS/KPISTRIP/SPLITVIEW/MAGNIFIER 등 축·KPI·비교 트랙 숨김
2. 본문형 `AXIS 범위…`는 유지

**검증:** chat-leak-probe-round46 · round45

## 직전 루프 (루프26 / round45)

1. chat — SPARKLINE/DROPCAP/FUNNEL/GLOSSARY 등 타이포·차트·인쇄·콜아웃 트랙 숨김
2. 본문형 `FUNNEL 지표…`는 유지

**검증:** chat-leak-probe-round45 · round44 · round40

## 직전 루프 (루프25 / round44)

1. chat — LETTERBOX/ZINDEX/SVG/GLITCH 등 필름·CSS·그래픽 트랙 숨김
2. persist — cite/q/kbd/samp/small/abbr/dfn은 card-like padding일 때만 kit bind
3. a/button/strong은 CTA·본문이라 미바인드

**검증:** chat-leak-probe-round44 · round43 · round42

## 직전 루프 (루프24 / round43)

1. chat — BLEED/PARALLAX/DRAFT/TODO 등 인쇄·모션·WIP 트랙 숨김
2. persist — card-like padding에 ≥8pt / ≥4mm / ≥0.4cm (thin `2pt`/`1mm` 유지)
3. persist — h1–h6/mark/time는 card-like padding일 때만 kit bind

**검증:** chat-leak-probe-round43 · round42 · round41

## 직전 루프 (루프23 / round42)

1. chat — RIBBON/WATERMARK/SCRIM/DIVIDER/CONTAINER 등 장식·래퍼 트랙 숨김
2. persist — card-like padding에 ≥2lh/cap/ex/ic/vb/vi (thin `1lh` 유지)
3. persist — fieldset/legend/dialog/menu는 card-like padding일 때만 kit bind

**검증:** chat-leak-probe-round42 · round41 · round40

## 직전 루프 (루프22 / round41)

1. chat — SPLIT/SURFACE/GRADIENT/GLASS/SHADOW 등 분할·서피스 트랙 숨김
2. persist — card-like padding에 ≥2cqw/cqh/cqi/cqb (thin `1cqw` 유지)
3. persist — details/summary/label/output는 card-like padding일 때만 kit bind

**검증:** chat-leak-probe-round41 · round40 · round39 · round38

## 직전 루프 (루프21)

1. 호스트 `flex-direction` / `flex-wrap` / `flex-flow`를 flow wrap에 복사
2. `col-left`+`col-right`는 row clip (split과 동일). persist-split 없음

**검증:** deck-fixed-canvas · deck-template-look-css · deck-pdf-export

## 직전 루프 (루프20)

1. split-* 슬라이드도 `[data-od-slide-flow]` clip — Motif sibling, `.slide` overflow 없음
2. split-left/right는 row, split-top/bottom은 column. 호스트 padding/gap/grid 복사
3. persist-split 없음

**검증:** deck-fixed-canvas · deck-template-look-css · deck-pdf-export

## 직전 루프 (루프19)

1. dump fallback은 첫 줄 한글 상태를 마침표 포함 유지 (`초안.`/`진행.` 포함)
2. 같은 줄 glue-cut은 가장 긴 상태 접두어 (`완료됨.` > `완료`)
3. opener dump만 마침표 제거

**검증:** chat-leak-probe-round40 · round26 · round24 · round10 · agent-prose-sanitize

## 직전 루프 (round40 / 루프18)

1. leftover slide-count APPEND는 본문에서 지우고, `producedFiles`가 있으면 행만 유지
2. fail-closed sanitizer는 짧은 한글 완료 문장 유지
3. chat — TOOLTIP/CALLOUT/COMMENT/LOGO/SKELETON/PAGINATION 등 오버레이·브랜드 트랙 숨김
4. persist — card-like padding에 ≥2vh/vw/vmin/vmax/dvh 추가 (thin `1vh`/`1.5vw` 유지)

**검증:** chat-leak-probe-round40 · chat-message-render · chat-events-display · sanitize-persisted-assistant-fail-closed · deck-fixed-canvas

## 직전 루프 (incomplete-shell 2차)

1. persist — MiniMax가 `<body>` 다음 미종료 `<style>` 키트를 800자 덤프하면 CSS가 본문으로 잡혀 커버 초안이 스킵되고, prepare가 스타일을 지운 뒤 truncation salvage도 null → `incomplete-html-document-shell`
2. persist — 불완전 셸 skip 직전에 최후 1920 커버를 강제 저장

**검증:** salvage-truncated body+unclosed style · tiny doctype · CSS-comment fake slide · project-view persist last-resort

## 직전 루프 (round39 / 루프17)

1. chat — AVATAR/CHIP/DROPDOWN/DASHBOARD/CANVAS 등 컨트롤·대시보드 트랙 숨김
2. persist — card-like padding에 ≥4% · ≥2ch 추가 (thin `2%`/`1.5ch` 유지)

**검증:** contracts chat-leak-probe-round39 · round38 · round37 · deck-fixed-canvas

## 직전 루프 (round38 / 루프16)

1. chat — GALLERY/MODAL/TAB/FORM/BUTTON/WIDGET 등 UI 위젯 트랙 숨김
2. persist — card-like padding에 ≥0.75rem/em 포함 (thin `0.25rem` 유지)

**검증:** contracts chat-leak-probe-round38 · round37 · deck-fixed-canvas

## 직전 루프 (round37 / 루프15)

1. chat — LAYOUT/HERO/NAV/BADGE/ICON/FIGURE 등 UI 역할 트랙 숨김
2. persist — `p`/`span`/`h2–h4`/`figcaption`은 padding ≥12px일 때만 kit 카드 바인딩
3. persist — 얇은 padding 본문 액센트 프레임은 유지

**검증:** contracts chat-leak-probe-round37 · round36 · round35 · deck-fixed-canvas

## 직전 루프 (루프14)

1. auto-continue · 시스템 streaming rule · persist short-draft/regression을 first-fill 6장에 맞춤
2. chat — SCREEN/TASK/WORKSHOP/DECK/MOTIF를 round35 역할 트랙에 합침
3. 스트리밍 preview — 제목 있는 슬라이드가 닫히면 official look heal (`</html>` 대기 없음)

**검증:** resume · deck-html-content · persist-result · chat-leak-probe-round35 · chat-events-display · deck-preview-official-look-heal · system-prompt-api-mode

## 직전 루프 (round36 / 루프13)

1. chat — OVERVIEW/PROBLEM/KPI/CTA/ROADMAP/COMPARE 등 피치 덱 역할 트랙 숨김
2. debris — Hangul 없는 단독 `prop: value;` CSS 선언 줄 스크럽
3. persist — firebrick/orangered/khaki/slategray 등 named 1–2px 프레임을 kit 카드로 바인딩

**검증:** contracts chat-leak-probe-round36 · round35 · round34 · round29 · round28 · deck-fixed-canvas

## 직전 루프 (round35 / 루프12)

1. chat — HOOK/OUTRO/AGENDA/COVER/TAKEAWAY/QNA/TIP/EXAMPLE 등 역할 트랙 숨김
2. persist — coral/tomato/rebeccapurple/gold 등 named 1–2px 프레임을 kit 카드로 바인딩
3. persist — main/header/footer/blockquote/nav/ul/ol/dl/dt/dd 호스트 확장 (p/span 제외)

**검증:** contracts chat-leak-probe-round35 · round34 · round33 · deck-fixed-canvas

## 직전 루프 (round34 / 루프11)

1. chat — QUOTE/ASIDE/CALL/HINT/FAQ/LAB/DEMO/DRILL/INDEX/TOC/MAP/BRIEF 트랙 숨김
2. soft-CSS — light-dark/device-cmyk debris 줄 스크럽
3. persist — device-cmyk · light-dark 1–2px 프레임을 kit 카드로 바인딩

**검증:** contracts chat-leak-probe-round34 · round33 · round32 · deck-fixed-canvas

## 직전 루프 (round33 / 루프10)

1. chat — APPENDIX/TABLE/TOPIC/TRACK/PANEL/CARD/BEAT/LESSON/CLIP/ROUND/PASS/NOTE 트랙 숨김
2. persist — `hwb()` 1–2px 프레임을 kit 카드로 바인딩 (outline oklch 회귀)

**검증:** contracts chat-leak-probe-round33 · round32 · round31 · round30 · round28 · deck-fixed-canvas

## 직전 루프 (round32 / 루프9)

1. chat — UNIT/STEP/MODULE/SECTION/ACT/SCENE/PHASE/EPISODE/BLOCK/FRAME/SESSION 트랙 숨김
2. soft-CSS — oklab/lab/color() debris 줄 스크럽
3. persist — oklch/oklab/lab/lch/color/color-mix + emerald/amber 1–2px 프레임을 kit 카드로 바인딩

**검증:** contracts chat-leak-probe-round32 · round31 · round30 · deck-fixed-canvas

## 직전 루프 (루프8)

1. type-lock — `.slide { font-family }`가 있어도 display heading lock 유지
2. persist — official look 있을 때 slide 호스트 inline `font-family` 제거
3. verify — Motif-SVG hang / low-substance disk HTML 거부

**검증:** deck-template-look-css · deck-fixed-canvas · slide-deliverable-recovery

## 이번 루프 (루프9)

1. first-fill THIS TURN을 3장 고정에서 요청 1–6장(미지정 6)으로 변경
2. reattach/reload는 hidden APPEND를 다시 큐하지 않음
3. sanitized leftover(`The / Keep / APPEND`)를 user·assistant 행에서 숨김

**검증:** templateCloneContentFill · slideCountTopUp · chat-message-render · deck-framework-compact

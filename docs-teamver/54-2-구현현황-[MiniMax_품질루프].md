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
| persist: webkit-mask/filter/transform · print-color · pre kit | ☑ 루프104–113 / round121–130 |
| chat/persist: colon/pipe chrome · thin pre · combo/closure | ☑ 루프114–118 / round131–135 |
| persist: webkit-animation · hyphens/columns · text-security/drag | ☑ 루프120–124 / round136–140 |
| chat/persist: slash chrome · @function · reflect/locale · combo | ☑ 루프125–134 / round141–150 |
| persist: webkit-box-* · font-feature · logical sizes | ☑ 루프150–154 / round151–155 |
| persist: border-image · text-zoom · marquee · @nest · closure | ☑ 루프155–164 / round156–165 |
| persist: touch-callout · decoration-break · background vendor | ☑ 루프165–169 / round166–170 |
| persist: column-break · hyphenate · margin/padding/border logical | ☑ 루프170–179 / round171–180 |
| persist: transform-origin · writing-mode · opacity · flex longhands | ☑ 루프180–189 / round181–190 |
| chat/persist: @document · FOO keep · set22–24 combo/closure | ☑ 루프190–194 / round191–195 |
| persist: transition delay/timing · text-emphasis · box-sizing · border-spacing | ☑ 루프195–199 / round196–201 |
| chat/persist: @namespace · @font-feature-values · invent-frame · closure | ☑ 루프200–209 / round202–210 |
| persist: border-radius longhands · epub · clip-path · mask-box-image | ☑ 루프210–214 / round211–215 |
| persist: word-break · hyphenate · moz/ms select/transform · @charset | ☑ 루프215–224 / round216–225 |
| persist: ms-flex/grid · moz-background/columns · margin-collapse | ☑ 루프225–229 / round226–230 |
| persist: moz-user · ms-scroll/wrap · @view-transition · closure | ☑ 루프230–239 / round231–240 |
| persist: moz-border/box · transition/animation · invent-frame | ☑ 루프240–244 / round241–245 |
| persist: moz-outline/text · ms-flow · @scope · closure | ☑ 루프245–254 / round246–255 |
| persist: mask xy · moz-border-colors · ms-scrollbar · column-rule | ☑ 루프255–259 / round256–260 |
| persist: border-image · ms-word · line-grid · epub · at-rule harden | ☑ 루프260–284 / round261–285 |
| persist: blend · aspect-ratio · view-transition-class · shape/wrap | ☑ 루프285–294 / round286–295 |
| kit/chat: blockquote kit · region/flow · @page/@scroll-* · closure | ☑ 루프295–314 / round296–315 |
| persist: obscure moz/webkit vendor · moz-text-emphasis | ☑ 루프315–319 / round316–320 |
| kit/chat: list/landmark selective · @font-face/@keyframes · closure | ☑ 루프320–344 / round321–345 |
| kit: calc/min/max/clamp · lvh/lvw card padding | ☑ 루프345–349 / round346–350 |
| kit: section selective · nested slide close · invent-frame off flow | ☑ 루프350–354 / round351–355 |
| chat: FOO `=＝→⇒` separators · Step `:` keep | ☑ 루프355–359 / round356–360 |
| kit/chat: set58–60 combo/closure · flow style order harden | ☑ 루프360–374 / round361–375 |
| kit: lvmin/svmin/dv* · Q padding | ☑ 루프375–379 / round376–380 |
| kit: form selective · invent-frame off flow | ☑ 루프380–384 / round381–385 |
| chat: FOO `：»›≫` · @when/@else harden | ☑ 루프385–389 / round386–390 |
| kit/chat: set64–66 combo/closure | ☑ 루프390–404 / round391–405 |
| kit: leading-dot rem/em · env/var px · .4cm/.15in | ☑ 루프405–409 / round406–410 |
| chat: FOO `⇢⇝↦➤⟹` · form/section selective keep | ☑ 루프410–419 / round411–420 |
| kit/chat: set70–72 combo/closure | ☑ 루프420–434 / round421–435 |
| kit: calc additive same-unit sum (px/rem/Q…) | ☑ 루프435–439 / round436–440 |
| chat: FOO `⟶➜➡➔➢` · form/section calc | ☑ 루프440–449 / round441–450 |
| kit/chat: set76–78 combo/closure | ☑ 루프450–464 / round451–465 |
| kit: calc % sum · rem/em+px@16 mixed | ☑ 루프465–469 / round466–470 |
| chat: FOO `↠↝➞➠◆♦▶▷▸▹` | ☑ 루프470–479 / round471–480 |
| kit/chat: set82–83 combo/closure | ☑ 루프480–489 / round481–490 |
| kit: calc rem+em 1:1 mixed | ☑ 루프490–494 / round491–495 |
| chat: FOO `➙➛➝➟➣►◁◀◂◃◇○` | ☑ 루프495–504 / round496–505 |
| kit/chat: set87–88 combo/closure | ☑ 루프505–514 / round506–515 |
| clone: IB pitch-book 데모 카피가 한국어 brief에 남음 | ☑ 루프57 |
| preview: #stage 1920px 스트립이 100vw로만 살짝 이동 | ☑ 루프57 |
| persist: 카탈로그 예제 leftover를 filled로 저장 | ☑ |
| leftover가 persist skip 후에도 미리보기로 열림 · top-up append | ☑ |
| leftover IB가 artifact_regression으로 토픽 fill을 막음 | ☑ |
| preview: #stage next가 첫 장만 밀림 (핀 전용·stacked 선점) | ☑ |
| persist: 스크럽된 IB 껍데기가 다시 regression | ☑ |
| preview: liveHtml/raw example이 Hartfield를 그대로 그림 | ☑ 루프119 |
| preview: 1920px #stage next가 native 100vw로 첫 장만 밀림 | ☑ 루프119 |
| persist: leftover catalog를 skip만 하고 저장하지 않음 | ☑ 루프119 |
| preview: `[od:slide_count_top_up]`이 슬라이드 본문으로 보임 | ☑ |
| persist: Motif bind가 Hartfield stamp를 다시 넣음 | ☑ |
| persist: 커버 제목 `슬라이드`가 brief를 무시 | ☑ |
| preview: brief 없는 FileViewer가 raw IB leftover를 그대로 그림 | ☑ 루프135 |
| preview: 인슬라이드 #next가 native 100vw로 첫 장만 밀림 | ☑ 루프135 |
| persist/preview: IB 표지가 빈 빨간 리본+잘린 h1로 남음 | ☑ 루프136 |
| persist: empty `.ribbon`/`.stamp` Motif가 밀집도를 깨뜨림 | ☑ 루프136 |
| preview: `[data-od-slide-flow]`가 neutralize relative로 이중 패딩 | ☑ 루프136 |
| heal: Daisy/weekly/Studio를 IB 매거진으로 오탐 | ☑ 루프137 |
| heal: 커버에 회화/쉐도잉 토픽 카피를 발명 | ☑ 루프137 |
| export: standalone가 성긴 IB 표지를 그대로 내보냄 | ☑ 루프137 |
| persist/preview: IB `.slide-inner` 1320×820 카드가 16:9를 안 채움 | ☑ 루프139 |
| persist/preview: IB 본문이 매거진 프레임 없이 상단 정렬 | ☑ 루프139 |
| persist/preview: flow가 magazine padding/`justify-content:center`를 이중 적용 | ☑ 루프140 |
| persist/preview: 16:9 채움 후 표지 제목이 하단, 본문은 위만 사용 | ☑ 루프141 |
| persist/preview: 성긴 본문 오른쪽 공백 · 카드 위 공백 · 44px h2 | ☑ 루프142 |
| persist/preview: 성긴 칩 세로 중앙 · 카드/리스트 내부 공백 · 14px ol | ☑ 루프143 |
| persist/preview: 제목+lede만 있는 본문이 16:9 하단을 비움 | ☑ 루프145 |
| kit: calc vh/%/vw + px 혼합 | ☑ 루프515–519 / round516–520 |
| chat: FOO `▲▼△▽★☆✦✧●◉` | ☑ 루프520–529 / round521–530 |
| kit/chat: set89–93 combo/closure | ☑ 루프530–544 / round531–545 |
| kit: calc lh|cap|ex · vb|vi 혼합 | ☑ 루프546–555 / round547–556 |
| chat: FOO `❖✪✫◎▣▢■□` (+★☆✦✧●◉) | ☑ 루프556–565 / round557–566 |
| kit/chat: set94–98 combo/closure | ☑ 루프566–570 / round567–571 |
| kit: calc cq · ic|ric · print 혼합 | ☑ 루프571–580 / round572–581 |
| chat: FOO `✶✸✹✺❋※†‡‣∙` | ☑ 루프581–590 / round582–591 |
| kit/chat: set99–103 combo/closure | ☑ 루프591–595 / round592–596 |
| kit: calc 교차 ch+cq · lh+ic · cq+vh · rem+ch · %+cq | ☑ 루프596–605 / round597–606 |
| chat: FOO `⬡⬢⬤⬥⬦◊◈⊕⊖⊗⊘⊙` | ☑ 루프606–615 / round607–616 |
| kit/chat: set104–108 combo/closure | ☑ 루프616–620 / round617–621 |
| persist/preview: leftover `·` 칩·발명 TOC가 brief 카피처럼 보임 | ☑ 루프144 |
| preview: 레터박스 `#17181d`만 보이고 1/N만 동작 | ☑ 루프146 |
| persist/preview: 표지 오른쪽 TOC 칸 공백 · 성긴 slide-inner 상단 고정 | ☑ 루프147 |
| persist/preview: 제목-only 본문 하단 공백 · lede가 목록 fill-track에 흡수 | ☑ 루프148 |
| persist/preview: framed leftover · FileViewer no-brief · 한글 `·` 오삭 | ☑ 루프149 |
| persist/preview: Biennale `에 대한` 표지 · 빈 장 · 헤딩 삼킴 · 4열 1카드 | ☑ 루프150 |
| persist/preview: Biennale에 IB Study Notes 표지가 남음 · relative radial | ☑ 루프151 |
| persist/FileViewer: AI 덱 heal이 저장 경로에 없음 · `에 대한` 제목 | ☑ 루프153 |
| persist/preview: Biennale 크림 위 크림 · Study Notes · Shado · overlay flatten | ☑ 루프154 |
| persist/preview: look CSS가 1–2장 사이에 끼어 표지 밀집도가 깨짐 | ☑ follow-up |
| persist/preview: MiniMax `<p="">` · 유출 `· Label` | ☑ follow-up |
| preview: Motif `span.ribbon`이 relative stretch로 빨간 줄 | ☑ follow-up |
| persist/preview: MiniMax 카드 `</div>` 조기 마감 · 64px step `</ol>` | ☑ 루프138 |
| persist/preview: 클래스만 있는 빈 `.ribbon` 빨간 칩 | ☑ 루프138 |
| FileViewer/export: magazine/salvage 미적용 | ☑ 루프138 |
| API-mode "save this as deck.html" 유출로 덱이 안 생김 | ☑ |
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

## 이번 루프 (루프596–620 / round597–621)

1. padding — 교차 가족 ch+cq · line|ch+ic(×2) · cq+viewport · rem|em+ch · %+cq
2. chat — FOO `⬡⬢⬤⬥⬦◊◈⊕⊖⊗⊘⊙`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round597–621 (25/25)

## 직전 루프 (루프154)


1. heal — Biennale `--sun` 장에서 크림 글자(`#E9E5DB`/`#DCD6C4`)를 `--ink`로. footer `에 대한` polish
2. heal — 한글 덱의 `Study Notes`/`Working notes`만 삭제(`학습 노트` 발명 금지). 같은 문서의 긴 단어로 `Shado` 복구
3. heal+pin — overlay sun/orb(`translate(-50%)` · 50% radial · ≥400 정사각)는 absolute 유지

**검증:** biennale cream-on-cream · no Study Notes · Shado→Shadowing · pin overlay absolute

## 직전 루프 (루프571–595 / round572–596)

1. padding — cq 가족 합≥2 · ic|ric 합≥1 · print 혼합 px≥13
2. chat — FOO `✶✸✹✺❋※†‡‣∙`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round572–596 (25/25)

## 직전 루프 (루프546–570 / round547–571)


1. padding — calc line-box·fontVp 혼합 합≥2 card-like (`1lh+1ex`, `1vb+1vi`; thin 0.5+0.5 유지)
2. chat — FOO `❖✪✫◎▣▢■□`
3. invent-frame≠flow 물리 border/shadow/background 미카피

**검증:** chat-leak-probe-round547–571 (25/25)

## 직전 루프 (루프153)


1. persist — magazine 뒤 `healAiGeneratedDeckMarkup` (저장·same-turn·recovered)
2. FileViewer accept · preview look-heal도 동일
3. Q6 — `에 대한`/`예시에` 제목 polish. 발명 금지

**검증:** heal-ai Q6 · project-view 파이프 · FileViewer accept

## 직전 루프 (루프151)

1. salvage — persist가 찍은 IB `mast/ribbon/Study Notes`를 Biennale `s-cover`+`titlewrap`으로 되돌림
2. persist — poster `s-chapter`/`s-cover`·비IB look에는 IB stub rebuild 금지
3. deco radial absolute. Hartfield/Daisy/IB stub 유지

**검증:** clone-fill Biennale restyle · no Study Notes · IB stub 유지

## 직전 루프 (루프150)

1. heal — 잘린 `에 대한` 제목·Brief echo cover-meta·빈 장·혼자 남은 repeat 그리드
2. salvage — `</h>` · 헤딩이 삼킨 lede/grid 분리 · 제목 이중 `<br>`
3. Biennale 인라인 `#0a0a0a` → `--paper`. IB 매거진/토픽 발명 금지

**검증:** biennale compact fill · lede outside h1 · no Brief · lonely 1fr · 4 slides

## 직전 루프 (루프149)

1. heal — framed leftover 매 회 스크럽. 균형 태그 · 한/영 칩만 삭제. 한글 `·` 유지. 투팬 aside ≥2. 투팬 미달 요청 카피 유지
2. 표지 — no-brief는 기존 제목 polish만. 빈 제목은 `슬라이드`를 발명하지 않음
3. FileViewer accept/look-heal에 `userBrief`. srcdoc leftover 가드

**검증:** framed leftover · hyphen/li · no-brief stub · Hangul · keep · FileViewer brief wire

## 직전 루프 (루프148)

1. 본문 — leftover 이후 `h2`만 남으면 `od-magazine-title-fill`로 16:9 well을 채움
2. 본문 — 첫 문단/`div` 산문은 lede, 남은 리스트·카드만 fill-track. lede-fill은 제목+lede만
3. Hartfield 본문 · Daisy/Studio · 발명 카피 금지 유지

**검증:** heal title-fill · lede 위 fill-track · dense IB skip · look-css `od-magazine-title-fill`

## 직전 루프 (루프147)

1. 표지 — `cover-meta`가 없으면 1열(`od-magazine-cover-solo`). 후속 장 제목 없을 때만 후속 lede를 subhead
2. 본문 — 성긴 MiniMax `slide-inner`를 fill-track/lede-fill로 재프레임. 2줄 리스트도 채움
3. Hartfield 본문 · Daisy/Studio · on-brief 표지 유지

**검증:** heal cover-solo · sparse inner · 2-item list · dense IB skip · look-css `od-magazine-cover-solo`

## 직전 루프 (루프146)

1. stacked stage — 기본 `translate(-50%, -50%)`로 호스트 viewport 전 빈 레터박스 방지
2. 첫 장 — CSS로 브릿지/`display:none` 전에 페인트. 이후 인라인 hide 유지
3. inner fill — `min-height:100%`(이전 `min-height:0` 접힘 해제). Daisy/Hartfield 비개입

**검증:** compact-api-stacked-deck letterbox center · heal-official-magazine-layout min-fill · look-css `od-slide-inner-min-fill`

## 직전 루프 (루프145 · 루프515–544 / round516–545)

1. heal — 제목+lede만 있는 본문은 `od-magazine-lede-fill`로 남은 16:9 well을 채움 (칩 투팬·fill-track·leftover 칩 삭제는 유지)
2. neutralize — lede 36px, `od-magazine-lede-fill` 없으면 재주입
3. padding — calc `vh|vw|% + px`를 1920×1080 환산(≥12px). thin `0.4vh+2px` / `0.2%+2px` 유지
4. chat — FOO `▲▼△▽★☆✦✧●◉` · invent-frame/`box-shadow` 보류

**검증:** heal lede-fill · look-css · chat-leak-probe-round516–545

## 직전 루프 (루프144)

1. heal — MiniMax `·` leftover 칩을 본문/cover-meta에서 삭제. 요청된 aside만 투팬
2. 표지 — 후속 장 제목만 TOC. `개요/핵심 포인트`·발명 subhead 금지. on-brief 제목+본문 표지는 rebuild하지 않음
3. Daisy/Studio/weekly · 카탈로그 IB paper 유지

**검증:** heal leftover drop · requested aside two-pane · on-brief cover keep

## 직전 루프 (루프143)

1. heal — 성긴 본문은 제목 전폭 상단 + lede|칩 `od-magazine-sparse-spread` (`align-items:start`)
2. neutralize — fill-track 리스트 28px·li stretch, 카드 내부 center, `od-magazine-body-fill` 없으면 재주입
3. 카탈로그 IB paper · Daisy/Studio/weekly · 토픽 카피 발명 금지 유지

**검증:** heal sparse-spread · look-css 28px list · Chrome persist 재측정

## 직전 루프 (루프490–514 / round491–515)

1. padding — calc rem+em 1:1 합산(≥0.75)
2. chat — FOO `➙➛➝➟➣►◁◀◂◃◇○` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round491–515

## 직전 루프 (루프142)

1. heal — 성긴 본문은 `1.3fr 1fr` 투팬(lede + 기존 칩 cover-meta). 카드/리스트는 fill-track으로 1fr 행을 채움
2. neutralize — `h2.section` 56px, fill-track stretch, `od-magazine-body-spread` 없으면 재주입
3. 카탈로그 IB paper · Daisy/Studio/weekly 유지. 토픽 카피 발명 금지

**검증:** heal two-pane / fill-track / 2×2 · look-css 56px · Chrome persist 재측정

## 직전 루프 (루프465–489 / round466–490)

1. padding — calc `%` 토큰 경계 · rem/em+px@16px root 합산
2. chat — FOO `↠↝➞➠◆♦▶▷▸▹` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round466–490

## 직전 루프 (루프435–464 / round436–465)

1. padding — additive `calc()` 동일 단위 합산 (`8px+4px`, `.5rem+.25rem`, `4Q+4Q`)
2. chat — FOO `⟶➜➡➔➢` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round436–465

## 직전 루프 (루프141)

1. neutralize — 16:9에서 `.cover .body`는 `align-items:center` (카탈로그는 `end` 유지)
2. heal — 성긴 본문 `.body`는 flex center, 밀집 본문은 flex-start + height 100%
3. look current — `od-magazine-optical-place` 없으면 neutralize 재주입

**검증:** heal-official-magazine-layout sparse/dense body · look-css optical-place

## 직전 루프 (루프140)

1. flow wrap — magazine `.slide-inner`가 있으면 padding/`justify-content`를 복사하지 않고, 이미 있는 flow에서도 걷어냄
2. neutralize — flow `:has(.slide-inner)` padding 0. paper `box-shadow` 제거
3. pin CSS — paper stretch는 compact/stacked에만. 카탈로그 IB는 Hartfield paper 유지

**검증:** deck-fixed-canvas magazine inner/flow slim · look-css neutralize · heal pin+neutralize · raw IB `min(1320px)`

## 직전 루프 (루프139)

1. neutralize — stacked 16:9에서 `.slide-inner`를 1920×1080 페이지에 맞춤 (IB 1320×820 / 92vw 카드 해제)
2. heal — 커버·본문 매거진 프레임이 페이지를 채움. 본문은 기존 제목/본문만 `h2.section`으로 배치
3. 카탈로그 프레젠터·Hartfield 본문 `slide-inner`·Daisy/Studio는 유지

**검증:** heal-official-magazine-layout fill/section · look-css neutralize `od-slide-inner-canvas-fill`

## 직전 루프 (루프405–434 / round406–435)

1. padding — leading-dot `.75rem`/`.8em` · `.4cm`/`.15in` · env/var 폴백 스펙
2. chat — FOO `⇢⇝↦➤⟹` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round406–435

## 직전 루프 (루프375–404 / round376–405)

1. padding — `lvmin/lvmax/svmin/svmax/dvmin/dvmax` · CSS `Q`(≥8Q)
2. kit — `form` 선택적 · `div` 비선택 유지
3. chat — FOO `：»›≫` · `@when`/`@else` harden (`box-shadow` 보류)

**검증:** chat-leak-probe-round376–405

## 직전 루프 (루프345–374 / round346–375)

1. padding — `calc/min/max/clamp` 내부 · `lvh/lvw` 카드 인식
2. kit — `section` 선택적 · nested same-tag close · `div` 비선택 유지
3. chat — generic FOO 구분자 `=＝→⇒` · `Step 1: Setup` 유지
4. tests — flow style `box-sizing` 순서 관대 매칭 (`box-shadow` 보류)

**검증:** chat-leak-probe-round346–375 · deck-fixed-canvas

## 직전 루프 (루프315–344 / round316–345)

1. persist — `-moz-stack-sizing`/`-moz-binding` · `-webkit-box-flex-group` · `-webkit-mask-composite-source` · `-ms-content-zoom-snap-points-*` · `-moz-text-emphasis*`
2. kit — `ul/ol/li/dl/dt/dd/figure/article/aside/header/footer/nav/main/s/u/wbr/colgroup/col` 선택적(얇은 테두리 미바인딩)
3. chat — `@font-face` · `@keyframes` · `@media` · `@font-palette-values` · `@annotation` · `@custom-media` · `@stylistic` · `@color-profile` · `@nest` · `@function` · `@position-try` · invent-frame · set49–54 closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round316–345

## 직전 루프 (루프285–314 / round286–315)

1. persist — background-blend · `-ms-color-scheme` · `-moz-text-orientation` · `-webkit-ruby-align` · `-webkit-aspect-ratio` · ime-mode · view-transition-class/group
2. persist — dashboard/border-fit · `-webkit-shape-*` · `-webkit-wrap-*` · `-webkit-flow-*` · `-webkit-region-*` · mask-attachment
3. kit — `blockquote`/`address`/`hgroup`/`search`/`s`/`u` 선택적
4. chat — `@starting-style` · `@scroll-state` · `@counter-style` · `@page` · `@scroll-timeline` · invent-frame · set43–48 closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round286–315

## 직전 루프 (루프255–284 / round256–285)

1. persist — `-webkit-mask-*-x/y` · `-moz-border-*-colors` · `-moz-text-blink` · `-ms-scrollbar-*` · column-rule longhands · font-feature/kerning
2. persist — `-moz-border-image*` · `-ms-word-*`/`-ms-writing-mode` · `text-zoom` · `-webkit-line-grid/align/snap` · border-before/after longhands
3. persist — `-ms-content-zoom*`/`-ms-scroll-limit*` · `-epub-text-emphasis*` · `-moz-inert`/`-webkit-marquee-dir`
4. chat — `@supports` · `@container` · `@layer` · `@property` harden · invent-frame · set37–42 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round256–285

## 직전 루프 (루프138)

1. persist/preview — MiniMax `auto auto 1fr` 카드 · 64px step `</ol>` · 유출 `· Label` 복구 (IB TOC 유지)
2. persist/preview — 클래스만 있는 빈 `.ribbon`/`.stamp` 제거. srcdoc은 brief 없이도 salvage
3. FileViewer accept · standalone export — salvage 후 magazine
4. persist — salvage를 magazine 힐 앞에 두어 표지 메타가 뒤 장 제목을 읽게 함

**검증:** template-clone-fill card/ol/IB leftover · srcdoc brief-less salvage · deck-pdf-export · FileViewer source

## 직전 루프 (루프137)

1. heal — IB 매거진은 official `h1.display`(조각 시트 포함) 또는 `.cover .ribbon`+`.cover-meta`+`.mast`. Daisy `.slide-inner`는 오탐 아님
2. heal — 커버 카피는 brief/후속 장 제목. 회화·쉐도잉·In context 발명 금지
3. export/preview — standalone heal과 preview look merge 뒤에도 동일 복구
4. first-fill — 중복 bilingual `·` · 빈 demo-banner/pill · 커버 인라인 flex 제거

**검증:** heal-official-magazine-layout Daisy/Studio/expo/fragment · srcdoc sparse cover · standalone export

## 직전 루프 (표지 밀도 follow-up: look CSS hoist · MiniMax 태그)

1. persist/preview — 슬라이드 사이 official look CSS를 문서 끝으로 이동
2. persist/preview — `<p="">` · 유출 `· Label` 복구 (카탈로그 목록은 유지)
3. neutralize — Motif `span.ribbon`은 relative stretch 제외
4. preview — srcdoc에서 heading-heal을 돌리지 않아 leftover IB 카탈로그 `#now`를 유지

**검증:** template-clone-fill stub cover/salvage · look-css hoist · srcdoc stub cover

## 직전 루프 (루프136)

1. persist/preview — 빈 IB `.ribbon`/`.stamp` Motif 껍데기를 주입하지 않고 제거
2. persist/preview — 제목만 있는 IB 표지를 `h1.display` + ribbon + cover-meta 매거진 커버로 복구
3. neutralize — `[data-od-slide-flow]`는 absolute clip을 유지해 이중 패딩을 막음
4. first-fill — `</p="">` · 유출 `· Small talk</div>` 마크업 복구

**검증:** heal-official-magazine-layout · deck-template-look-css · template-clone-fill

## 직전 루프 (루프240–254 / round241–255)

1. persist — `-moz-border-radius*` · `-moz-box-*` · `-moz-float-edge`/`-moz-orient`/`-moz-image-region`
2. persist — `-moz-transition*` · `-moz-animation*` · `-moz-perspective*`/`-moz-transform-style`/`-moz-opacity`
3. persist — `-moz-outline*` · `-moz-hyphens`/`-moz-text-*` · `-ms-high-contrast-adjust`/`-ms-ime-align`/`-ms-flow-*`
4. chat — `@scope` harden · invent-frame negative · set34–36 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round241–255

## 직전 루프 (루프225–239 / round226–240)

1. persist — `-ms-flex*`/`-ms-order` · `-ms-grid*` · `-moz-background-*` · `-moz-column*`
2. persist — `-webkit-margin-*-collapse`/`-webkit-rtl-ordering` · `-moz-user-*`/`-moz-print-color-adjust`
3. persist — `-ms-touch-action`/`-ms-text-overflow`/`-ms-scroll*`/`-ms-wrap*`/`-ms-block-progression`
4. chat — `@view-transition` harden · invent-frame negative · set31–33 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round226–240

## 직전 루프 (루프210–224 / round211–225)

1. persist — `-webkit-border-*-radius` · `-webkit-text-orientation`/`-epub-*` · `-webkit-clip-path` · `-webkit-image-rendering` · `-webkit-mask-box-image*`
2. persist — `-webkit-word-break`/`text-decorations-in-effect`/`line-box-contain` · hyphenate-limit last/zone
3. persist — `-moz`/`-ms` appearance · user-select · text-size-adjust · transform/origin · backface · overflow-style · word-wrap/`-o-text-overflow`/`-moz-tab-size`
4. chat — `@charset` opacity dump · invent-frame negative · set28–30 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round211–225

## 직전 루프 (루프195–209 / round196–210)

1. persist — `-webkit-transition-delay` · `-webkit-transition-timing-function`
2. persist — `-webkit-text-emphasis*` · `-webkit-box-sizing` · `-webkit-border-*-spacing`
3. chat — `@namespace` · `@font-feature-values` opacity dump · FOO separator keep
4. invent-frame negative · set25–27 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round196–210

## 직전 루프 (루프180–194 / round181–195)

1. persist — `-webkit-perspective-origin` · `-webkit-transform-origin/style`
2. persist — `-webkit-font-size-adjust` · `-webkit-writing-mode` · `-webkit-text-combine*`
3. persist — `-webkit-opacity` · `-webkit-flex-wrap/flow/grow/shrink/basis` · order/align/justify · column-axis/progression
4. chat — `@document` opacity dump · FOO separator keep
5. flow/chat — set22–24 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round181–195

## 직전 루프 (루프165–179 / round166–180)

1. persist — `-webkit-touch-callout` · `-webkit-nbsp-mode` · `-webkit-line-break`
2. persist — `-webkit-box-decoration-break` · `-webkit-mask-source-type`
3. persist — `-webkit-background-origin/size/composite` · `-webkit-user-modify`
4. persist — `-webkit-column-break-*` · `-webkit-hyphenate-*` · margin/padding/border before/after/start/end
5. chat — `@color-profile` opacity dump · FOO separator keep · set19–21 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round166–180

## 직전 루프 (루프150–164 / round151–165)

1. persist — `-webkit-box-pack/align/flex/ordinal-group/lines`
2. persist — `-webkit-font-feature-settings` · `-webkit-font-variant-ligatures`
3. persist — `-webkit-logical-*` · `-webkit-border-image*`
4. persist — `-webkit-text-zoom` · `-webkit-marquee*`
5. chat — `@nest` opacity dump · FOO separator keep · set16–18 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round151–165

## 직전 루프 (top-up 센티널 · motif Hartfield · 커버 슬라이드)

1. persist/preview — `[od:slide_count_top_up]`·빈 `<artifact>`를 덱 HTML에서 제거. liveHtml도 동일
2. persist/preview — Motif `.who` leftover Hartfield 비움. 갤러리 example은 유지
3. heal — 커버 `<h1>슬라이드</h1>`를 brief 주제로 교체

**검증:** template-clone-fill sentinel/Hartfield/슬라이드 heal · srcdoc sentinel strip

## 직전 루프 (IB #stage 첫 장 밀림 · 스크럽 leftover)

1. preview — `#stage` 수평 스트립은 stacked hoist/`forceReveal`보다 px `transformGo`를 먼저
2. preview — `data-od-deck-fixed-canvas-pin`만 있어도 스텝은 1920px. native `100vw` next는 클릭하지 않음
3. persist — Hartfield를 지운 IB 껍데기+placeholder는 compact 토픽 fill로 교체 허용

**검증:** srcdoc pin-only IB 1920 next · persist scrubbed IB shell · catalog swipe shell

## 직전 루프 (루프135)

1. preview — 프로젝트 FileViewer/memory-only는 leftover catalog를 brief 없이도 스크럽. 갤러리는 원본 유지
2. clone — 템플릿 칩 `pitch book`만으로는 Hartfield를 유지하지 않음
3. preview — `#stage` 스트립은 iframe 폭과 같아도 1920px step. 인슬라이드 `#next`/`#prev`는 native 100vw를 가로챔
4. persist — leftover scrub에 `allowEmptyBrief`

**검증:** template-clone-fill empty-brief/chip · srcdoc project scrub · IB #next 1920px · memory-only leftover

## 직전 루프 (루프120–134 / round136–150)

1. persist — `-webkit-animation*` (shorthand + longhands)
2. persist — `-webkit-hyphens` · `-webkit-column-rule/span/width/fill`
3. persist — `-webkit-text-security` · `-webkit-user-drag`/`user-drag` · box-reflect · locale · ruby-position
4. chat — ALLCAPS generic `/`·`／` separators · `@function` opacity dump
5. flow/chat — set13–15 combo·closure 회귀 (`box-shadow` 계속 보류)

**검증:** chat-leak-probe-round136–150

## 직전 루프 (leftover IB artifact_regression)

1. persist — leftover catalog / demo prior는 compact 토픽 fill로 교체 허용
2. persist — byte·장수 regression + daemon stub-guard를 leftover prior에서 건너뜀
3. 진짜 8장 사용자 덱 → 3장 축소는 그대로 차단

**검증:** project-view-persist-result leftover IB · findClientSlideCountRegression leftover

## 직전 루프 (루프119)

1. clone — leftover Hartfield/DCF는 한국어 brief(띄어쓴 한글 포함)에서 재클론
2. preview — `buildSrcdoc`이 leftover catalog를 스크럽. FileViewer/memory-only가 last user brief를 넘김. 갤러리(brief 없음)는 원본 유지
3. preview — 1920px `#stage`는 native `100vw`보다 px `transformGo`를 먼저
4. persist — leftover catalog는 skip 대신 스크럽 후 저장

**검증:** template-clone-fill IB scrub · srcdoc leftover+1920px next · memory-only leftover · FileViewer/FileWorkspace brief 핀

## 직전 루프 (API-mode save-as-deck 유출)

1. 프롬프트 — filesystem write / save-this-as-deck 문장 제거. 호스트 persist만 지시
2. chat — 유출 문장 sanitize. fenced HTML은 말풍선에서 제거
3. persist — standalone recover identifier=`deck`. HTML 없는 유출 문장은 미완료

**검증:** system-prompt-api-mode · agent-prose-sanitize · recover/strip · deck-deliverable-prose

## 직전 루프 (루프104–118 / round121–135)

1. persist — `-webkit-mask*` · `-webkit-filter`/`backdrop-filter` · `-webkit-transform`/`transition*`
2. persist — `-webkit-print-color-adjust` · `text-decoration-skip`
3. kit — selective `pre` (`em`/`strong`/`picture` keep)
4. persist — `-webkit-flex*` · `-webkit-columns*` · perspective/backface/overflow-scrolling/border-radius
5. chat — ALLCAPS generic `:`/`|` separators · `@position-try` opacity dump
6. kit/flow — thin pre keep · set10–11 combo · closure 회귀

**검증:** chat-leak-probe-round121–135

## 직전 루프 (루프89–103 / round106–120)

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

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
| leftover APPEND가 producedFiles 있어도 말풍선에 남음 | ☑ 루프18 |
| dump fallback이 `초안.`/`진행.`/한글 완료 문장을 지움 | ☑ 루프19 |
| split-* 마감/체크리스트가 inner clip을 건너뛰어 16:9 overflow | ☑ 루프20 |
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

## 이번 루프 (루프20)

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

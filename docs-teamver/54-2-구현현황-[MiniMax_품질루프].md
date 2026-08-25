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
| soft-CSS: oklab / color() continuation debris | ☑ round32 |
| soft-CSS: light-dark / device-cmyk continuation debris | ☑ round34 |
| persist: `li` + `hsl()` invented frame | ☑ |
| persist: `figure` comma/space hsl 프레임 | ☑ |
| persist: overlay `05 / CHECKLIST` span | ☑ |
| persist: 카드 안 중첩 배지 · h2/header · `position:fixed` · `05 · LABEL` | ☑ |
| persist: navy/indigo/cyan 1–2px fake outline | ☑ |
| persist: 색 방언 무관 1–2px 프레임 + `box-shadow` ring · kit `var(--border)` 유지 | ☑ |
| persist: oklch/oklab/lab/lch/color/color-mix · emerald/amber named frames | ☑ round32 |
| persist: `hwb()` invented frames · outline oklch | ☑ round33 |
| persist: device-cmyk · light-dark invented frames | ☑ round34 |
| 16:9 inner clip · kit card bind | ☑ |
| top-up 재진입 재호출 + 내부 프롬프트 노출 | ☑ 센티널+autoOpen; 루프9 reattach 차단 · leftover 숨김 |
| first-fill 3장 강제 → 요청 1–6장 한 턴 | ☑ 루프9 |
| PreviewModal/connector message 가드 | ☑ |
| cover 제목 `Presentation` → `슬라이드` | ☑ |
| MiniMax head-only incomplete-html-document-shell | ☑ 1차 |
| persist: Neutral 호스트/inner overlay 페인트 · 3장 1타이틀 · catalog heal skip | ☑ 루프5 |
| persist: grid flow clip · in-flow badge · CSS motif 전 장 | ☑ 루프5 |
| auto-continue: 슬라이드 카피 있는 truncated HTML 보존 · SLOT cover 거부 | ☑ 루프5 |
| persist: heading type-lock · inline Quicksand strip · low-substance verify | ☑ 루프8 |
| think 태그 / 내부 마크업 필터 | ☑ 기존 |
| 실제 MiniMax 생성 라운드트립(브라우저) | ☐ 이 환경에서 managed MiniMax 키 없음 |

## 이번 루프 (round34 / 루프11)

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

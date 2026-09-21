# 0916-N04-1 상위설계 · Round 2 컴팩트 레이아웃 stretch 확장

## 배경

`data-od-slide-flow` compact wrapper 하에서 각 킷의 primary content wrapper가
intrinsic height로만 잡히면서 상단에만 붙고 하단이 비는 회귀. 루프536에서
`.slide-body`는 stretch를 넣었지만 `.slide-content` / `.hero-frame`는 남아
있음.

## Round 2 검토 결과

| 킷 | primary content wrapper | 원본 sizing | compact wrapper 하에서 상단쏠림? |
|----|------|------|------|
| Studio / Signal / Grove / Broadside | `.slide-body` | grid-template-rows 1fr | ✔ 이미 루프536에서 해결 |
| 8-Bit Orbit | `.slide-content` | 부모 `.slide` flex-column · child의 flex 없음 | ❌ 발견 |
| Block Frame | `.hero-frame` (slide-1 cover) | 부모 `.slide` flex-column · child의 flex 없음 | ❌ 발견 |
| Coral / Playful | `.slide` 자체 flex-column, child는 개별 카드 (`.card-row` 등) | 자체 stretch OK | ✔ 검토 완료·변경 없음 |

## 조치

`FIXED_CANVAS_CSS`에 `.slide-content` + `.hero-frame` stretch 규칙 추가.

```css
.slide > [data-od-slide-flow] > .slide-content,
.slide > [data-od-slide-flow] > .slide-chrome + .slide-content,
.slide > [data-od-slide-flow] > .hero-frame,
.slide > [data-od-slide-flow] > .slide-chrome + .hero-frame {
  flex: 1 1 auto !important;
  min-height: 0 !important;
}
```

## 검증

`deck-fixed-canvas.test.ts`에 루프536/541 회귀 테스트 추가 — pin 결과에 stretch
규칙 존재 확인. 기존 87 pass + 신규 1 = **88 pass**.

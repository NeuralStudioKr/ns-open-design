# 0907-N04-1 상위설계 — Block Frame Clone letterbox 표지 사이즈

## 체감

Clone Block Frame LOOK seed / thin prior 미리보기에서 표지 `.hero-frame`이 캔버스에 비해 **작고 우하단**에 붙음 (cream 배경은 가득, 흰 박스는 구석).

## 원인

1. `buildTemplateClonedDeckHtml`이 `100vw/100vh`를 **1920×1080 px**로 정규화하고 `data-teamver-template-clone-size`를 주입한다.
2. Block Frame 카탈로그는 `.slide{display:none}` + `.active{display:flex}` presenter라 `looksLikeOfficialFullscreenPresenterDeck` = true.
3. 기존 `looksLikeFilledOfficialPresentationDeck`는 `.presentation` / opacity-stack만 letterbox로 승격 → Block Frame Clone은 **native fill** 경로.
4. device-width iframe(~800×600)이 1920×1080 캔버스의 **좌상단만** 보여 중앙 hero(~960,540)가 뷰포트 **우하단**에 잘려 보인다.

## 정책

- 영문 카탈로그 `example.html`(vw/vh 유지) → 기존처럼 iframe-relative fill.
- Teamver Clone LOOK seed(`data-teamver-template-clone-size` 또는 fixed 1920 + display-toggle presenter) → **compact letterbox** (`#od-stacked-deck-stage` fit). Capsule과 같이 `shouldInflateStackedDesignViewport` = false(device-width + host layout box).

## 비범위

- `thin-prior-top-up-no-append` incomplete_output UX(별도 슬라이스).
- hero `max-width:900px` 키트 의도 변경(센터만 복구).

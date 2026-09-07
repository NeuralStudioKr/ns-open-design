# 0907-N04-2 구현설계 — Block Frame Clone letterbox 표지 사이즈

## 변경 파일

| 파일 | 역할 |
|------|------|
| `apps/web/src/runtime/compact-api-stacked-deck.ts` | `looksLikeFilledOfficialPresentationDeck` 확장 |
| `apps/web/tests/runtime/compact-api-stacked-deck.test.ts` | Clone Block Frame → compact + srcdoc stacked CSS |
| `docs-teamver/0907-N04-*` | 상위·설계·현황 |
| `docs-teamver/00_구현_내역_누적.md` | 루프465 |

## 로직

`looksLikeFilledOfficialPresentationDeck`가 true이면:

1. `looksLikeCompactApiStackedDeck` → true
2. `buildSrcdoc` → `healCompactLetterbox` + `injectDeckBridge(..., compact=true)`
3. `#od-stacked-deck-stage` + `display:flex !important` on `.active` → kit `.slide-1` center 유지
4. `shouldInflateStackedDesignViewport` → false (device-width; host layout box로 fit)

## 감지 조건 (OR)

- 기존: `.presentation` / opacity-stack + (fixed 1920 | Hangul)
- **신규:** display-toggle presenter (`.slide{display:none}` + `.active{display:flex}`) 또는 `data-teamver-template-clone-size`
- 그리고 `looksLikeFixedCanvasSlideDeck` **또는** clone-size marker **또는** (Hangul visible — 기존과 동일)

## 검증

- unit: `letterboxes Block Frame Clone LOOK seeds (루프465 hero crop)`
- suite: `compact-api-stacked-deck.test.ts` 전체
- 수동: Design staging 재배포 후 Block Frame Clone → 표지 hero 중앙·적정 크기

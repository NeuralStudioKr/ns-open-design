# 0916-N03-2 구현설계 — Block Frame 발명 hero 셸

| 파일 | 역할 |
|------|------|
| `template-clone-fill.ts` | unwrap / strip / CTA rewrite + `healBlockFrameInventedHeroShells` |
| `deck-fixed-canvas.ts` | highlight `box-decoration-break` · 빈 platform 카드 hide |
| `tests/fixtures/loop538-…html` | 회귀 fixture |
| `template-clone-fill.test.ts` | 루프539 |

persist 경로: `salvageMalformedMiniMaxSlideMarkup`에서 heal 호출. slot-fill은 `fillBlockFrameNeoSlots`에서도 동일 함수 호출.

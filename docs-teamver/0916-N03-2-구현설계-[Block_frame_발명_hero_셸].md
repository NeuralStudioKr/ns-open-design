# 0916-N03-2 구현설계 — Block Frame 발명 hero 셸

| 파일 | 역할 |
|------|------|
| `template-clone-fill.ts` | unwrap / strip / CTA rewrite + `healBlockFrameInventedHeroShells` |
| `deck-fixed-canvas.ts` | highlight `box-decoration-break` · 빈 platform 카드 hide |
| `tests/fixtures/loop538-…html` | 회귀 fixture |
| `template-clone-fill.test.ts` | 루프539 |

persist 경로: `salvageMalformedMiniMaxSlideMarkup`에서 heal 호출. slot-fill은 `fillBlockFrameNeoSlots`에서도 동일 함수 호출.

카드 strip은 non-greedy `</div>`가 아니라 `stripClassBlocks`(중첩 depth)로 `.download-cards` / `.platform-cards` / 개별 `.download-card` / `.platform-card`를 통째로 제거한다. 킷 템플릿에 해당 클래스가 없으므로 salvage가 전 킷에서 돌아도 시드 카드는 건드리지 않는다.

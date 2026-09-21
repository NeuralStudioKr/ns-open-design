# 0921-N07-3 구현현황 · Block Frame leftover 잔재 persist heal

상위: [0921-N07-1](./0921-N07-1-상위설계-[block_frame_leftover_잔재_persist_heal].md)

## 진행

| 항목 | 상태 |
|------|------|
| 잔재/ leftover 제목 leaf 비우기 | ☑ |
| 빈 `.list-num` `<li>` 제거 (sibling 카피 span 유지) | ☑ |
| persist `healAiGeneratedDeckMarkup` 연결 | ☑ |
| Block Frame leftover heal 말미 연결 | ☑ |
| 공식 영문 example no-op | ☑ |
| 루프572 red-spec | ☑ |

## 파일

- `packages/contracts/src/template-clone-fill.ts` — `healBrokenServiceIntroLeftoverRemnants`
- `packages/contracts/src/html/heal-ai-generated-deck.ts` — persist 호출
- `packages/contracts/tests/loop572-block-frame-remnant-heal.test.ts`
- `packages/contracts/tests/fixtures/loop572-block-frame-remnant.html`

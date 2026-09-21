# 0921-N07-1 상위설계 · Block Frame leftover 잔재 persist heal (루프572)

상위: [0921-N06 leftover wipe](./0921-N06-1-상위설계-[crosskit_leftover_wipe_sentence_assembly].md)  
현황: [0921-N06-3](./0921-N06-3-구현현황-[crosskit_leftover_wipe_sentence_assembly].md) · [54-2](./54-2-구현현황-[MiniMax_품질루프].md)

## 체감

사용자 첨부 Block Frame 결과 HTML(2026-09-21). N06 이후에도 저장된 덱에 잘린 문장이 남는다.

- 표지: `Teamver가 `
- 타임라인: ` 방식을 한 문장으로 이해` · `로 연결되는…` · `으로 확장되는…` · `빠르게을 시작`
- 제목: `대상 고객별 메시지 다음` · `측정해야 할 지표 쓰는 길` · `: 을 시작 판단`
- 빈 번호: `<li><span class="list-num">02</span></li>`

N06은 **새로 합성하는** substring wipe / `${noun} 다음` 을 막는다. persist/FileViewer heal은 `wipeServiceIntroLeftoverLeaves` 를 호출하지 않아 **이미 저장된 잔재**를 비우지 못한다.

## 정책

1. `healBrokenServiceIntroLeftoverRemnants` — 잔재 leaf 를 비운다. 대체 문장을 만들지 않는다.
2. leftover 제목과 leftover 제목+조사 문장(`다음는` / `쓰는 길에서`)도 비운다.
3. `.list-num` 만 있는 `<li>` 를 제거한다. 옆 카피 `<span>` 이 있는 공식 content-list 항목은 유지한다.
4. persist `healAiGeneratedDeckMarkup` 에서만 호출한다. fill `healBlockFrameLeftoverCatalogCopy` 말미에 두면 leftover 카드 제목·본문을 다시 비운다.
5. 공식 영문 `example.html` 은 Hangul 잔재가 없으면 no-op.

## 비범위

- MiniMax live / FileViewer 클릭
- leftover 잔재를 새 제품 카피로 채우기
- fillMode 변경

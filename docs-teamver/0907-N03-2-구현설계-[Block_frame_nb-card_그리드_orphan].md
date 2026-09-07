# 0907-N03-2 구현설계 — Block Frame nb-card 그리드 orphan (루프464)

상위: [0907-N03-1](./0907-N03-1-상위설계-[Block_frame_nb-card_그리드_orphan].md)

## `heal-ai-generated-deck.ts`

1. `childLooksLikeAbsorbHostCard` — class cardish(`nb-card` 등) **또는** inline chrome.
2. `looksLikeSpilledCardBody` — class cardish를 spilled body로 보지 않음.
3. `rowAllowsSpilledChromeAbsorb` — unequal track도 `countCssGridTrackList`로 child > tracks면 allow.
4. `absorbSpilledChromeCardSiblings` — class host는 label max ×2.
5. **신규** `ejectTrailingListFromOverfilledGrid` — track 초과 시 마지막 ul/ol을 그리드 닫힌 뒤로 이동.
6. `healAiGeneratedDeckMarkup` — absorb 직후 eject 호출.

## `templateCloneContentFill.ts`

`buildTemplateClonePromptFillSeed`에:

- `.nb-card` 제목+본문 동일 요소 안에
- diagram grid에 checklist를 네 번째 자식으로 넣지 말 것

## 검증

- `tests/heal-spilled-chrome-card-siblings.test.ts` 루프464 2케이스
- 기존 spilled chrome 회귀 유지

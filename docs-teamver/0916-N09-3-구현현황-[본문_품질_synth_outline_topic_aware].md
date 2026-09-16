# 0916-N09-3 구현현황 · 본문 자체 품질 (synth outline topic-aware) — 루프543

## 진행 요약

- ☑ `packages/contracts/src/template-clone-fill.ts` — free-form generic preset의
  6개 outline templates 모두 `${topic}`을 body/lead/itemTitles에 삽입.
- ☑ `synthesizeTemplateCloneSlideBody` — rotation salt 도입. templates.length
  (6)를 초과하는 index (pad 반복)에서 slide label을 body/items/lead에 스며들게
  해 완전 복붙 억제.
- ☑ 신규 helper `decorateSynthLineWithSlideLabel` / `decorateSynthItemTitleWithSlideLabel`.
- ☑ `packages/contracts/tests/template-clone-fill.test.ts` — 루프543 신규 3
  회귀 테스트:
  1. free-form 주제 body/lead에 topic 명사 삽입 (과반 이상)
  2. pad 반복 슬라이드에 완전 동일 body가 body-slide 과반을 넘지 않음
  3. synth outline이 없는 KPI 수치 ($, %, ×, 억/조/M/B/K, /mo, /yr) 삽입 금지
- ☑ 기존 루프479/516 free-form skeleton pin 회귀 없음.
- ☑ `pnpm --filter @open-design/contracts test` **996 files · 3197 tests pass.**

## 검증 커버리지

- 주제 파생: `resolveTemplateCloneSlidesForDeterministicFill({ deckTitle: '글을 매력적으로 쓰는 팁', slideCount: 6 })`가 body-slide 5개 중 3개 이상에 "글을 매력적으로 쓰는 팁" 포함.
- 반복 억제: `slideCount: 10`으로 templates 순환 시 동일 body가 body-slide 9개 중 4개를 넘지 않음.
- 정확도: 없는 `$3.5B`, `40%`, `12.4×`, `29억` 등 절대 삽입 없음.

## 스코프 외 (한계)

- **prompt-fill 모델 턴에서 얕은 문장 방지는 별도**. 현재 수정은 deterministic
  fill + seed-fallback 경로에만 적용. prompt system prompt 강화는 후속 라운드로.
- 모델이 이미 채운 구체 body는 여전히 존중 (`slideNeedsDeterministicBody` 게이트 유지).
- 공식 example.html 힐러 no-op은 회귀 없음 (기존 카탈로그 스크럽 케이스와 별개).

## 남은 일 (R2)

- 8-bit tier/timeline · Broadside list/stats · Block-frame cards가 여전히 얕은
  문장을 유지하는지 fixture 재검사. 재현되면 kit-specific fill 함수 (`fillEightBitOrbitKitSlide` /
  `fillStudioKitSlide` / `fillBlockFrameNeoSlots`)에도 같은 topic-aware 원칙 적용.

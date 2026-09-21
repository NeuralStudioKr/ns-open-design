# 0921-N06-3 구현현황 · Cross-kit leftover wipe / 문장 짜맞추기

상위: [0921-N06-1 상위설계](./0921-N06-1-상위설계-[crosskit_leftover_wipe_sentence_assembly].md)  
기획 원본: [0921-N05-1 AI fill 강제 · 서버 문장 짜맞추기 제거](./0921-N05-1-상위설계-[ai_fill_강제·짜맞추기_제거].md) 별도 슬라이스

## 요약

Block Frame Teamver 덱에서 Coral chrome 이 row flex 를 깨고, leftover substring wipe 가 조사를 남기며, leftover 제목에 `다음`/`쓰는 길` 접미가 붙는 회귀를 막는다. AI fill 파이프라인과 persist/pad/continue/head-banner, 0921-N05 salt 5경로는 그대로다.

## 파일

- `packages/contracts/src/template-clone-fill.ts`
  - `coralSlideHasKitChrome` — 타 킷 native chrome 이면 false
  - `wipeServiceIntroLeftoverLeaves` — exact leaf / 잔재만 비움. 중간 substring 삭제 없음
  - `wipeEightBitCapsuleLeftoverPhrases` / `wipeGroveStudioLeftoverPhrases` — 위 helper 사용, `/파일럿/g` 제거
  - `looksLikeServiceIntroLeftoverTitle` / `isGenericSynthTopicNoun` — leftover heading 을 topic 으로 쓰지 않음
  - `serviceIntroSynthTitleFallback` — `${noun} 범위/판단/쓰는 길/다음` 조합 제거
  - `fillSlideShell` leftover title rewrite — leftover rawTitle 을 topic 후보에서 제외
  - `dedupeIdenticalOutlineTitles` / pad `${cover} · N` — 원제 유지 (N05 salt 경로와 정합)
- `packages/contracts/tests/template-clone-fill.test.ts` — 루프571 red-spec

## 구현 항목

- [x] Coral filler 를 Block Frame / Capsule / EightBit / Daisy chrome 에서 no-op
- [x] leftover body wipe 를 leaf-exact 로 제한, `/파일럿/g` 제거
- [x] leftover heading 을 generic topic 으로 취급
- [x] `serviceIntroSynthTitleFallback` 접미 조합 제거
- [x] pad/dedupe `${cover} · N` salt 제거 (N05 와 중복 경로 정합)
- [x] 루프571 red-spec (Teamver + Block Frame)
- [x] `template-clone-fill` + loop558–562 leftover 389 pass
- [x] staging N05 와 번호 충돌 해소 — 본 슬라이스를 0921-N06 으로 재넘버링

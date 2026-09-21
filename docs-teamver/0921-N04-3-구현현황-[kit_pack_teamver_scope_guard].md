# 0921-N04-3 구현현황 · Kit copy pack Teamver-scope guard

상위: [0921-N04-1 상위설계](./0921-N04-1-상위설계-[kit_pack_teamver_scope_guard].md)

## 요약

Non-Teamver 브리프에 Teamver 제품 특유 명명 (`같은 보드` · `권한 경계` · `결과 이력` · `한 팀 보드` · `리뷰 습관` · `팀 보드 복제` …) 이 kit copy pack 을 통해 카드 title / body 로 새어 나오는 회귀를 막는다. `briefIsAboutTeamverProduct` 게이트와 최종 후처리 `neutralizeTeamverPackCopyInDeckHtml` 로 처리한다.

## 파일

- `packages/contracts/src/template-clone-fill.ts`
  - `TEAMVER_BRANDED_KIT_KEYS` (const) — 12개 kit key: `cobalt-grid`, `block-frame-neo`, `grove`, `studio`, `eightbit-orbit`, `capsule`, `daisy-days`, `broadside`, `playful`, `coral`, `mat`, `biennale-yellow`.
  - `briefIsAboutTeamverProduct(cover, brief, label)` — export. `teamver` / `팀버` word-boundary 검사.
  - `TEAMVER_HARDCODED_PACK_TITLE_MAP` — 21개 하드코드 title → 토픽-중립 명사구 매핑.
  - `TEAMVER_HARDCODED_PACK_BODY_MAP` — 32개 body 서술구 정규식 → 토픽-중립 서술구 매핑.
  - `neutralizeTeamverPackCopyInDeckHtml(html, brief, deckTitle)` — 최종 후처리 함수.
  - `synthesizeTemplateCloneSlideBody` — 함수 진입부에 kit-key drop guard 추가.
  - `buildTemplateClonedDeckHtml` — 마지막 `renumberBiennalePagenums` 뒤에 `neutralizeTeamverPackCopyInDeckHtml` 호출 추가.
- `packages/contracts/tests/template-clone-fill.test.ts`
  - `루프480 bare domain company Block Frame fill keeps dense service content` — 8번 슬라이드 기대값을 `같은 보드|권한 경계|결과 이력` → `통합 화면|역할 정의|변경 이력` 로 갱신.
  - `루프570: non-Teamver company brief에 kit copy pack Teamver 하드코드 문구가 새어 나오지 않는다` — 신규 red-spec. 6개 kit template (block-frame · capsule · 8-bit-orbit · daisy-days · broadside · playful) 에 대해 `neuralstudio.kr 회사 소개` 브리프로 렌더 후 Teamver 하드코드 title 이 새지 않음을 검증.

## 구현 항목

- [x] `TEAMVER_BRANDED_KIT_KEYS` 상수 정의 (12 kit)
- [x] `briefIsAboutTeamverProduct` 헬퍼 (export)
- [x] `synthesizeTemplateCloneSlideBody` — kit-key drop guard (non-Teamver → `templatesForSynthTemplateTopic` fall-through)
- [x] `TEAMVER_HARDCODED_PACK_TITLE_MAP` — 21개 title 매핑
- [x] `TEAMVER_HARDCODED_PACK_BODY_MAP` — 32개 body 문구 매핑
- [x] `neutralizeTeamverPackCopyInDeckHtml` — 후처리 함수
- [x] `buildTemplateClonedDeckHtml` — 후처리 호출 wiring
- [x] `루프480` 테스트 기대값 갱신
- [x] `루프570` red-spec 신규 (6 template, non-Teamver 브리프)
- [x] `pnpm --filter @open-design/contracts` 테스트 3317 pass · 3 fail (사전 존재 · 무관)
- [x] `pnpm --filter @open-design/contracts` typecheck src ok (tests 사전 pre-existing errors)

## 검증

`pnpm --filter @open-design/contracts test`:

- 이전 (staging): 3316 pass · 3 fail · 1 skipped
- 이번 브랜치: **3317 pass · 3 fail · 1 skipped** (+1 신규 red-spec, 사전 fail 3건은 동일)

`pnpm --filter @open-design/contracts exec vitest run tests/template-clone-fill.test.ts -t "루프570|루프480"`: 2 pass · 0 fail.

`pnpm --filter @open-design/contracts exec vitest run tests/loop559-offline-repro.test.ts tests/loop558-offline-repro.test.ts tests/loop560-offline-repro.test.ts tests/loop561-offline-repro.test.ts`: 17 pass · 0 fail. (Teamver 브리프 kit fixture 는 no-op 로 유지.)

## 정책 무시 항목 (변경 없음)

- Persist salvage / pad / continue / head-banner 정책 유지.
- AI 컨텐트 생성 파이프라인 (`shouldUseDeterministicTemplateCloneFill`, `TEMPLATE_CLONE_FILL_DEFAULT_MODE`, `seedTemplateClonedDeck`, `template-clone-content-fill`) 유지.
- Deterministic outline (`resolveTemplateCloneSlidesForDeterministicFill`) · slot map · slot fill · slot heal 유지.
- Product-launch-halo · raw-grid-pitch (topic-parameterized) 는 스코프 밖.

## 사용자 리포트 대응

- 리포트: "결과물 퀄리티가 좋지 않다. 내용 생성을 또 ai 안 거치게 바뀌어버린 것 같다. 템플릿 관련은 채우는 형식이되, 내용은 ai로 만들어야한다."
- 이 spec 은 "**템플릿 관련은 채우는 형식이되, 내용은 ai로 만들어야한다**" 원칙을 **강화**한다: pack 하드코드 마케팅이 non-Teamver 브리프에 새어 나가지 않도록 후처리로 정리한다. AI 컨텐트 생성 자체는 원래 파이프라인 그대로 (기본 mode `json`, `pure-prompt` 옵션 존재).
- "AI 안 거치게 바뀌어버린 것 같다" 부분은 별개 이슈일 수 있으나, 이번 fix 는 pack 이 AI 결과를 덮어 쓰는 leak 을 정리해 실제 AI content 가 상대적으로 더 잘 살아 남는다.

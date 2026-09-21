# 0921-N04-1 상위설계 · Kit copy pack Teamver-scope guard

상위: [0921-N03 Capsule 한글 덱 chrome / overflow / sparse-role](./0921-N03-1-상위설계-[capsule_한글덱_chrome_overflow].md)  
SSOT: [60](./60_Canvas_Slide_시스템_프롬프트_템플릿적용_개선.md) §1.45  
정책: persist / pad / continue / head-banner **불변**. 0918-N05 healer/fill · 0921-N03 sparse-role **삭제·되돌리지 않음**.

## 사용자 리포트 (2026-09-21, 루프570)

- 브리프: `neuralstudio.kr 회사 사이트야. 분석해서 회사 소개 ppt 만들어줘.`
- 완료: 11초 · 1841 출력 토큰 · 슬라이드 10장
- 8번 슬라이드 스탯 카드: **`같은 보드`** / **`권한 경계`** / **`결과 이력`**
- 사용자 표현:
  > "결과물 퀄리티가 좋지 않다. 내용 생성을 또 ai 안 거치게 바뀌어버린 것 같다. 템플릿 관련은 채우는 형식이되, 내용은 ai로 만들어야한다."

즉 non-Teamver 브리프에 Teamver 제품 기능 이름이 카드 title 로 그대로 새어 나온다.

## 근본 원인

Kit copy pack (block-frame / capsule / eightbit-orbit / daisy / broadside / playful / coral / mat / biennale / grove / studio / cobalt-grid) 은 카드 title 을 Teamver 제품 특유 명명으로 **하드코딩** 한다.

```ts
// packages/contracts/src/template-clone-fill.ts · capsuleSlideCopyPack (예시)
stats: eightBitRoleCopy(`${brand} 운영`, `${brand}가 한 화면에서 남기는 네 가지.`, [
  { title: '같은 보드', body: `${brand}에서 초안과 피드백이 파일 밖으로 흩어지지 않는다.` },
  { title: '권한 경계', body: `${brand}에서 보기와 고치기를 슬라이드마다 정한다.` },
  { title: '결과 이력', body: `${brand}에서 누가 언제 바꿨는지 남기고 되돌린다.` },
  // ...
]),
```

- `${brand}` interpolation 은 **body 문장에만** 걸린다 (`${brand}에서 초안과 피드백이 …`).
- 카드 title (`'같은 보드'`, `'권한 경계'`, `'결과 이력'`) 은 하드코드된 리터럴이라 topic-parameterization 이 안 된다.
- Deterministic outline (`서비스 가치` / `대상 고객` / `도입 로드맵` / `지표`) 이 KPI-스러운 짧은 카드 title (`'전환율'`, `'활성'`, `'품질'`) 을 만들면 `BLOCK_FRAME_METRIC_LABEL_RE` / `looksLikeServiceIntroLeftoverTitle` 가 leftover 로 오판, pack.chart.items[i].title 로 통째로 대체된다 → Teamver 마케팅 문구가 non-Teamver 덱에 박힌다.

## 누출 경로

1. **`enrichSparseSlideForShell` → `synthesizeTemplateCloneSlideBody`** — sparse outline slot 을 채우려고 kit-key-scoped synth 를 호출. kit key 가 `capsule` 이면 `capsuleSlideCopyPack` 을 그대로 씀.
2. **`fillSlideShell` → `refillEmptyBlockFrameSlotsFromPack`** — kit chrome (`.data-box`, `.intro-card`, `.step-title`, …) 의 빈/leftover slot 을 pack.items[i].title/body 로 채움.
3. **`fillSlideShell` → `fillCapsuleKitSlide`** — Capsule kit chrome 이 leftover 로 판단되면 `capsuleSlideCopyPack(brand).items` 로 카드 title 을 통째로 대체.

모든 경로가 **brief 스코프를 무시**한다. Teamver 브리프에서는 원래 의도된 동작이지만, non-Teamver 브리프에는 마케팅 leak.

## 개선 원칙

1. **AI 내용 생성은 계속 필요하다.** 템플릿은 채우기(fill format), 내용은 AI-generated. Pack 은 outline 이 정말로 sparse / leftover 일 때만 fallback 이어야 한다.
2. **Non-Teamver 브리프에서 kit pack 하드코드 title 이 새면 안 된다.** 브리프가 Teamver 제품 소개일 때만 Teamver-specific 마케팅 문구가 유효.
3. **Teamver 브리프에서 동작은 불변.** 지금까지의 Teamver 서비스 인트로 healer / fill 체계는 그대로 유지.
4. **Slot mapping · slot fill · slot heal 자체는 그대로.** 이 spec 은 pack 의 스코프 게이팅만 다룬다.

## 개선

### (a) `synthesizeTemplateCloneSlideBody` — kit key drop guard

```ts
export function synthesizeTemplateCloneSlideBody(cover, label, index, brief?, kitKey?) {
  if (
    kitKey
    && TEAMVER_BRANDED_KIT_KEYS.has(kitKey)
    && !briefIsAboutTeamverProduct(cover, brief, label)
  ) {
    kitKey = null; // fall through to `templatesForSynthTemplateTopic` (topic-parameterized)
  }
  // ... (기존 로직)
}
```

- `TEAMVER_BRANDED_KIT_KEYS` = { cobalt-grid, block-frame-neo, grove, studio, eightbit-orbit, capsule, daisy-days, broadside, playful, coral, mat, biennale-yellow }.
- Product-launch-halo / raw-grid-pitch 는 이미 topic-parameterized 이므로 제외.
- `briefIsAboutTeamverProduct(cover, brief, label)`: hay `${cover}\n${brief}\n${label}` 에 `teamver` / `팀버` 가 word-boundary 로 잡히면 true.

### (b) `buildTemplateClonedDeckHtml` 최종 후처리 — `neutralizeTeamverPackCopyInDeckHtml`

`fillSlideShell` / `refillEmpty*SlotsFromPack` / `fillCapsuleKitSlide` 등 여러 경로가 pack 을 심으므로 각 filler 에 brief 를 threading 하는 대신 **단일 후처리 pass** 로 정리한다:

- `briefIsAboutTeamverProduct` 이면 no-op (원본 유지).
- 그 외에는 pack 하드코드 title / body 문구를 topic-neutral 명사구로 치환.

치환 원칙:
- Title 은 두 pass 로 잡는다. (i) `>...<` 로 감싸진 정확한 slot text 우선. (ii) 문장 중간에 붙어 나온 잔여는 raw substring 으로.
- Body 서술구 (`${brand}에서 …` 형태) 는 unrestricted 정규식.
- 매핑은 서비스 소개 덱에서 일반적으로 통하는 명사구로 (예: `같은 보드` → `통합 화면`, `권한 경계` → `역할 정의`, `결과 이력` → `변경 이력`, `한 팀 보드` → `첫 도입`).

## 하지 말 것

- Kit pack 자체를 삭제 · 리팩터링하지 않는다 (Teamver 경로에서는 여전히 유효).
- Product-launch-halo / raw-grid-pitch 를 `TEAMVER_BRANDED_KIT_KEYS` 에 넣지 않는다 (이미 topic-parameterized).
- Persist salvage / pad / continue / head-banner 정책은 그대로.
- Deterministic outline 이나 slot map 은 그대로.
- AI 컨텐트 생성 파이프라인 (`shouldUseDeterministicTemplateCloneFill` / TEMPLATE_CLONE_FILL_DEFAULT_MODE) 은 그대로. 이 spec 은 fill 결과의 마케팅 leak 만 정리.

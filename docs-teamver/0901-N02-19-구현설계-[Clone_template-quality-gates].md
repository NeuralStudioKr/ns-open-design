# 0901-N02-19 구현설계 — Zhangzara 4템플릿 fixture 품질 게이트 (루프450)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
직전 후속: 루프429 「다음」(00 누적) — Studio / Creative / Daisy / Capsule을 같은 방식의 fixture 게이트로 확대.

## 목표

deterministic clone 산출 HTML에 대해 **4축**을 4개 대표 템플릿에서 회귀 방지한다.

1. **대표 motif 존재** — 템플릿별 CSS 토큰·클래스가 최종 HTML에 남아 있어야 한다
2. **demo leftover 없음** — 카탈로그 데모 문구·숫자가 최종 HTML에 남지 않는다 (`looksLikeLeftoverTemplateDemoDeck === false` + 템플릿별 denylist)
3. **1920×1080 캔버스 고정** — `width:1920px` + `height|min-height:1080px`가 최종 HTML에 있다
4. **요청 장수 준수** — 같은 brief로 예측 가능한 슬라이드 수 (unique-shell cap 반영)

## 대상 · motif 핀

| 템플릿 | pluginId | example.html shell 수 | motifMustInclude | expectedSlideCount |
|--------|----------|----------------------|------------------|--------------------|
| Capsule | `html-ppt-zhangzara-capsule` | 23 `div.slide` | `--coral`, `--lime`, `pillar-card` | 10 |
| Daisy Days | `html-ppt-zhangzara-daisy-days` | 10 `section.slide` | `deco-daisy`, `--cream`, `day-card` | 10 |
| Creative Mode | `html-ppt-zhangzara-creative-mode` | 8 `div.slide` | `--cream`, `Archivo` | 8 |
| Studio | `html-ppt-zhangzara-studio` | 12 `section.slide` (+15 `div.slide`) | `--c-accent`, `slide-chrome`, `stat-card` | 10 |
| Blue Professional (루프456) | `html-ppt-zhangzara-blue-professional` | ~10 `div.slide` | `--primary`, `metric-card`, `cover-decoration` | 10 |
| Block Frame (루프456) | `html-ppt-zhangzara-block-frame` | 10 `section.slide` | `feature-card`, `deco-dots`, `--pink` | 10 |
| Product Launch (루프458) | `html-ppt-product-launch` | 8 shells (10장 요청 시 shell 재사용) | `tpl-product-launch`, `price-card`, `feature-card` | 10 |
| Pitch Deck (루프458) | `html-ppt-pitch-deck` | 10 shells | `tpl-pitch-deck`, `team-card` | 10 |

공통 brief (Capsule 게이트와 동일):

```
www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘. 8~10장
```

`resolveTemplateCloneSlidesForDeterministicFill({ slideCount: 10 })` +  
`buildTemplateClonedDeckHtml(html, slides, { title, templateId, maxSlides: 10, brief })`.

### 장수 정책

- Capsule / Daisy / Studio: 자연 셸 ≥10 → 요청 10장 그대로
- Creative Mode: 자연 셸 8 → 루프430 unique-role cap에 따라 8장 (Biennale와 동일)
- 4개 모두 `listTemplateCloneSlideShells(cloned).length === expectedSlideCount` 를 assert

## 공유 헬퍼 설계

파일: `packages/contracts/tests/helpers/deterministic-template-quality-gate.ts`

```ts
export type TemplateQualityGateSpec = {
  name: string;
  templateId: string;
  exampleRelativePath: string; // 테스트 파일 기준 상대 경로
  motifMustInclude: string[];
  demoMustNotInclude: string[];
  expectedSlideCount: number;
  brief?: string;
};

export const TEAMVER_SERVICE_INTRO_BRIEF =
  'www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘. 8~10장';

export async function runDeterministicTemplateQualityGate(
  spec: TemplateQualityGateSpec,
  testFileUrl: string,
): Promise<string>;

export function assertDeterministicTemplateQualityGate(
  cloned: string,
  spec: TemplateQualityGateSpec,
): void;
```

### `assert` 4축

1. **Motif** — `motifMustInclude` 전부 `expect(cloned).toContain(marker)`
2. **Leftover** — `expect(looksLikeLeftoverTemplateDemoDeck(cloned)).toBe(false)` + 공통 문구·숫자 denylist + 템플릿별 `demoMustNotInclude`
   - 공통 denylist: `Hartfield`, `Daisy Days`, `Clarity of Purpose`, `A Framework for Bold Ideas`, `The Journey Continues`, `340%`, `12.4M`, `cheerful presentation template`, `Aurora`, `Public attendance`, `Open programme`, `Filebase`, `Apex Group`, `hermes-agent`
3. **Canvas** — `expect(cloned).toMatch(/width:\s*1920px/i)` + `expect(cloned).toMatch(/(?:min-)?height:\s*1080px/i)`
4. **장수·주제** — `expect(listTemplateCloneSlideShells(cloned).length).toBe(spec.expectedSlideCount)` + `expect(cloned).toMatch(/팀버|Teamver/i)`

### 실행 헬퍼

```ts
const html = await readFile(new URL(spec.exampleRelativePath, testFileUrl), 'utf8');
const slides = resolveTemplateCloneSlidesForDeterministicFill({
  userInstruction: spec.brief ?? TEAMVER_SERVICE_INTRO_BRIEF,
  slideCount: 10,
});
const cloned = buildTemplateClonedDeckHtml(html, slides, {
  title: slides[0]?.title || '팀버',
  templateId: spec.templateId,
  maxSlides: 10,
  brief: spec.brief ?? TEAMVER_SERVICE_INTRO_BRIEF,
})!;
assertDeterministicTemplateQualityGate(cloned, spec);
return cloned;
```

## 테스트 스위트

### contracts

`packages/contracts/tests/template-clone-fill.test.ts`:

- 신규 describe `루프450 Zhangzara template quality gates` — 4 `it` (Capsule/Daisy/Creative/Studio)
- 기존 `루프419 Capsule deterministic quality gate` 안의 첫 `it`는 helper로 위임 (중복 expect 축소; 다른 loop430/421/425 회귀 it는 유지)

### daemon

`apps/daemon/tests/template-clone-deck.test.ts`:

- 신규 describe `루프450 Zhangzara 4템플릿 서버 fill 스모크` — table-driven 1개 `it.each`
- 각 pluginId에 대해 `/api/projects/:id/template-clone-content-fill` 성공 후 saved deck 파일을 읽어 motif/leftover/장수만 검사 (Canvas assert는 contracts에 위임)

## 빨간 스펙 → 최소 수정

먼저 게이트를 켠 뒤 실패분만 손댄다. 예상 수정 위치:

- `packages/contracts/src/template-clone-fill.ts` — Studio·Creative·Daisy가 canvas normalize 또는 whole-document leftover scrub에서 빠지면 확장
- 필요 시 `stripCapsuleCatalogDemoCopy` 옆에 공통 `stripLeftoverCatalogDemoPhrases`를 모든 템플릿 경로에서 실행

프로덕션 동작 변경은 게이트 실패를 고치는 범위로 한정.

## 검증

```bash
pnpm --filter @open-design/contracts exec vitest run tests/template-clone-fill.test.ts -t "루프450|루프419 Capsule"
pnpm --filter @open-design/daemon exec vitest run tests/template-clone-deck.test.ts -t "루프450|루프419"
```

## 비범위

- 전 Zhangzara 카탈로그 일괄 게이트 (루프456·458에서 Blue-pro·Block-frame·Product·Pitch 추가)
- MiniMax live E2E · staging 재배포
- UI 변경

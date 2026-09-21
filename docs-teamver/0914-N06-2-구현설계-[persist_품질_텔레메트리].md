# 0914-N06-2 구현설계 — persist 품질 텔레메트리

상위: [0914-N06-1](./0914-N06-1-상위설계-[persist_품질_텔레메트리].md)

## 1) `packages/contracts/src/template-clone-fill.ts`

순수 함수만 추가. `applyTemplateClonePromptFillLookMerge` / `buildTemplateClonedDeckHtml` 반환값은 그대로.

```ts
summarizeTemplateClonePersistQuality(html)
// { slideCount, distinctShellRoles, distinctShellCount,
//   cardItemCount, titleOnlyCardCount, titleOnlyCardRate } | null

buildTemplateClonePersistQualityObserve({ phase, html, beforeHtml, applied, templateId })
```

- shell: `listTemplateCloneSlideShells` + `classifyTemplateCloneShellRole`
- card: `extractSlideItemsFromHtmlBody` (item ≥ 2인 슬라이드만)
- title-only: 기존 `templateCloneItemBodyLooksDense` (12자)
- 빈 HTML / slide 없음 → `null` snapshot. observe payload는 `before`/`after` null 허용

## 2) `apps/web/src/teamver/templateClonePersistQuality.ts`

`observeTemplateClonePersistQuality` — try/catch로 persist를 깨지 않는다. `devLog.info('[teamver] persist-quality', payload)`.

## 3) `ProjectView.tsx`

- prompt-fill merge 직후: `beforeHtml=model`, `html=merged ?? model`, `applied=Boolean(merged)`
- JSON slot-fill / seed-fallback: `html=decision.html`, `applied=kind==='slot-fill'`

로그 실패는 persist를 막지 않는다.

## 테스트

- title-only model → rate 높음, merge 후 rate 낮음, merge HTML 불변
- Daisy / Block Frame / Capsule `example.html` 카탈로그 베이스라인 (slide·shell 관측 가능)
- ProjectView 소스에 `observeTemplateClonePersistQuality(` 존재

## 커밋

1. 상위·구현설계
2. 함수·배선·테스트·구현현황

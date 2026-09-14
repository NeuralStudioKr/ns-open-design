# 0914-N01-2 구현설계 — `/projects` 썸네일 preview batch

상위: [0914-N01-1](./0914-N01-1-상위설계-[projects_썸네일_preview_batch].md)

## 배선

### 1. `prefetchDesignsTabViewport.ts`

기존: cover-hints + publish summaries.

추가 (embed · design surface on):

1. `resolveProjectCoverFiles(batch, { allowFilesFallback: false })` — DesignsTab warm은 **hints-only** (0805/0806 정책 유지; `/files` fan-out은 보이는 카드 lazy만)
2. `buildProjectCardCover`로 html 항목 수집 (`entryFile` 메타·hints로 경로 확보)
3. `warmTeamverProjectPreviewPrefixes` → `warmTeamverHtmlCoverCache` (홈 N06/N07과 동일, drain coalesce)

soft-fail: 예외 시 카드별 fallback 유지.

### 2. `DesignsTab.tsx` + `DesignsTabProjectThumb.tsx`

홈 `homeCoversReady`(0806-N08)와 동일:

- viewport prefetch key 변경 시 `viewportHtmlCoversReady=false`
- `await prefetchDesignsTabViewport(batch)` 후 `true`
- HTML 썸네일은 ready일 때만 `ProjectCardHtmlCover` 마운트 (그 전 loading placeholder)

## 테스트

`teamver-prefetch-cover-coalesce.test.ts` 확장:

- DesignsTab viewport만 호출해도 `preview-url-batch` · `cover-html-batch` 각 1회 (hints/entryFile 있는 deck)
- home+DesignsTab 병렬 시 batch drain 합류(×1) 유지
- DesignsTab은 여전히 hints-only → 빈 hints에서 `/files` 0 (home만 bounded /files)

## 비범위

- BE/daemon 신규
- 위험 라벨↔헤더 등 다른 에픽

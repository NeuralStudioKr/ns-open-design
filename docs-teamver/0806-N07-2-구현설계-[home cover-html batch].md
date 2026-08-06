# 0806-N07-2 구현설계 — home cover-html batch

## API

```http
POST /api/projects/cover-html-batch
{ "items": [ { "projectId", "file"? } ] }  // max 12
→ { "results": [ { projectId, ok: true, html, file } | { projectId, ok: false } ] }
```

- read file → `isolateFirstDeckSlideHtml` (daemon port) → strip scripts
- size gate: skip oversized files (soft `ok: false`)
- collection slug: `cover-html-batch`

## FE

- `seedHtmlCoverCache` / `htmlCoverCacheKey` export (`ProjectCardHtmlCover`)
- `warmTeamverHtmlCoverCache(items)` → batch → `buildHtmlCoverSrcDoc` + peeked preview base → seed
- `prefetchHomeProjectCovers`: preview warm 후 HTML warm

## 성공 지표 (N=6)

- `/raw` GET ×6 → 0 (batch hit)
- `cover-html-batch` ×1 · `preview-url-batch` ×1

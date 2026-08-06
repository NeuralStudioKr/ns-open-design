# 0806-N06-2 구현설계 — home preview-url batch

## API

```http
POST /api/projects/preview-url-batch
{ "items": [ { "projectId": "...", "file"?: "deck.html" } ] }  // max 12
→ { "results": [ { "projectId", "ok": true, "url", "file" } | { "projectId", "ok": false } ] }
```

- scope mint는 기존 `projectPreviewScopes.mint(projectId)` (프로젝트 단위)
- file은 존재 검증 + 응답 URL tail (단건 GET과 동일)
- slug `preview-url-batch`를 collection deny list에 추가

## FE

- `warmTeamverProjectPreviewPrefixes(items)` → batch POST → `prefixByProject` 시드
- `resolveTeamverProjectPreviewPrefix` inflight key = `projectId` only
- `prefetchHomeProjectCovers`: cover resolve 후 HTML 항목 warm (return 전)

## 성공 지표 (N=6 baseline)

- `preview-url` GET ×6 → batch POST ×1 (또는 warm hit 후 카드 GET 0)
- `/raw` ×6 · `/files` hints-miss 유지

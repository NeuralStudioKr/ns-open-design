# 0806-N01-2 구현설계 — 커버·플러그인·preview-url 재요청 억제

## `projectCardCover.ts`

- override: `version = override.version` only
- metadata entryFile: `projectCoverMediaUrl(id, entry)` — no `?v=updatedAt`

## `HtmlSurface.tsx`

- `loadPluginPreviewHtml(url)` — strip query, shared inflight, no AbortSignal
- unmount → setState skip only

## `FileViewer.tsx` preview-url effect

- `embedAuthRecoveryNonce > 0` → invalidate once
- else `peek` hit → set prefix + return (no retry loop)
- retry delays: sleep only, **no** per-attempt invalidate

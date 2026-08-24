# 0805-N07-2 구현설계 — `/raw/deck.html` 반복 호출

## FileViewer

- disk `/raw` effect deps에서 `liveHtmlPaintsPreview` 제거
- skip 판정은 `liveHtmlPaintsPreviewRef.current`만 사용
- `streaming` / `hasLiveHtml` / mtime / refresh 변경 시에만 재스케줄

## ProjectCardHtmlCover

- load effect deps: `cacheKey` + `visible` (+ mode) — `src` 쿼리 제외
- `loadHtmlCover`: path-only GET, shared inflight, AbortSignal 없음 (daemon dedupe)
- unmount → setState skip only

## projectCoverLoader

- `/files` fallback 동시성 3 슬롯

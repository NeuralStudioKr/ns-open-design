# 0806-N01-1 상위설계 — 커버·플러그인·preview-url 재요청 억제

**선행:** [0805-N07](./0805-N07-1-상위설계-[raw%20deck.html%20반복%20호출].md)

## 잔여 위험

1. 이미지/로고 커버 `version=project.updatedAt` → 목록 갱신 시 presign 재mint
2. `HtmlSurface` AbortSignal → GET dedupe 스킵 + unmount abort
3. FileViewer preview-url: 캐시 hit에도 재시도 루프 · retry마다 invalidate

## 목표

- 커버 version은 coverVersion/mtime만 (updatedAt 금지)
- HtmlSurface: path-only + 공유 inflight (N07 커버와 동일)
- preview-url: 유효 캐시면 mint 스킵 · auth recovery 시에만 invalidate

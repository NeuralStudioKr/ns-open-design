# 0806-N02-1 상위설계 — lazy cover deps · disk soft-retry

**선행:** [0806-N01](./0806-N01-1-상위설계-[커버·플러그인·preview-url%20재요청%20억제].md)

## 잔여

1. `useLazyProjectCover` effect deps에 전체 `project` → 목록 폴링마다 cancel·재fetch
2. FileViewer disk soft-retry: 30s 동안 ~1.2s 고정 간격 → `/raw?cacheBust=` 다발

## 목표

- cover resolve deps를 `project.id`(+ entryFile)로 축소
- soft-retry: 지수 백오프 + 최대 횟수 상한

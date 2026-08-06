# 0806-N02-2 구현설계 — lazy cover deps · disk soft-retry

## `useLazyProjectCover.ts`

- `projectRef`로 최신 Project 유지
- fetch effect deps: `project.id`, `metadata.entryFile`, `visible`, `fetched`, `allowFilesFallback`
- `project.id` 변경 시 override/fetched 리셋

## `FileViewer.tsx`

```ts
FIRST = 400ms
MAX_DELAY = 5000ms  // 지수 ×2, 상한
MAX_ATTEMPTS = 6    // wall(30s)과 AND
```

`scheduleSoftRetry`: count++ 후 delay 적용, 초과 시 wall만 arm.

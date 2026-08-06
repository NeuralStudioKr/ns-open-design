# 0806-N03-2 구현설계 — 이중 IO 제거 · hints miss 시드

## DesignsTabProjectThumb

```tsx
<ProjectCardHtmlCover deferUntilVisible={false} ... />
```

부모 `useLazyProjectCover`가 이미 viewport 후에야 cover를 resolve·마운트하므로 내부 IO 불필요.  
RecentProjectsStrip는 가로 스크롤 오프스크린 가능 → 기본 defer 유지.

## projectCoverLoader

- `seedCoverHintResults`: positive + null(`hintsOnlyMiss`) 모두 시드
- prefetch/drain 필터: fresh `hintsOnlyMiss`는 재배치 제외

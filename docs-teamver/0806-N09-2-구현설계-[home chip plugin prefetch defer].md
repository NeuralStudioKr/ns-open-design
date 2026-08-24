# 0806-N09-2 구현설계 — home chip plugin prefetch defer

`HomeView.tsx`: `chipBoundPluginIds` / `missingChipBoundPluginIds` memo + boot `useEffect` 삭제.  
`pickChip` 등 기존 lazy GET 유지. unused import `pluginIdsBoundToHomeHeroChips` 정리.

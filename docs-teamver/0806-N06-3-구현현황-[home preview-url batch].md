# 0806-N06-3 구현현황 — home preview-url batch

**상태:** 구현·단위검증 완료

## 완료

- [x] contracts `ProjectPreviewUrlBatch*`
- [x] daemon `POST /api/projects/preview-url-batch`
- [x] collection slug deny (`preview-url-batch`)
- [x] `warmTeamverProjectPreviewPrefixes` + inflight `projectId` 통일
- [x] `prefetchHomeProjectCovers` HTML prefix warm
- [x] 단위 테스트

## 검증

- [x] web preview-scope · collection-slug tests (14)
- [x] daemon preview-url-batch wiring test (2)
- [ ] staging: home `preview-url` GET ×N → batch ×1, `/raw` 유지

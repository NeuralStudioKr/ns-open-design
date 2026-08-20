# 0806-N07-3 구현현황 — home cover-html batch

**상태:** 구현·단위검증 완료

## 완료

- [x] contracts `ProjectCoverHtmlBatch*`
- [x] daemon `cover-html-isolate` + `POST /api/projects/cover-html-batch`
- [x] collection slug `cover-html-batch`
- [x] `htmlCoverCacheStore` + `warmTeamverHtmlCoverCache`
- [x] `prefetchHomeProjectCovers` preview warm → HTML warm
- [x] 단위 테스트

## 검증

- [x] web warm + collection-slug
- [x] daemon isolate + route wiring
- [ ] staging: home `/raw` ×N → 0, `cover-html-batch` ×1

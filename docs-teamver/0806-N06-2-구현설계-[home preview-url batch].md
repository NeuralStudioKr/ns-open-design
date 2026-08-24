# 0806-N06-2 구현설계 — home preview-url batch

**상태:** ship됨 · 상세는 코드 SSOT.

| 층 | 위치 |
|----|------|
| API | `POST /api/projects/preview-url-batch` · contracts `ProjectPreviewUrlBatch*` |
| daemon | `project-routes.ts` (+ N08 ACL) |
| FE | `warmTeamverProjectPreviewPrefixes` · `prefetchHomeProjectCovers` |

상위: [N06-1](./0806-N06-1-상위설계-[home%20preview-url%20batch].md) · baseline [N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md)

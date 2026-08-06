# 0806-N07-2 구현설계 — home cover-html batch

**상태:** ship됨 · harden [N08](./0806-N08-1-상위설계-[cover%20batch%20harden].md).

| 층 | 위치 |
|----|------|
| API | `POST /api/projects/cover-html-batch` · contracts `ProjectCoverHtmlBatch*` |
| daemon | `cover-html-isolate.ts` · `project-routes.ts` |
| FE | `warmTeamverHtmlCoverCache` · `htmlCoverCacheStore` · RecentProjectsStrip ready gate (N08) |

상위: [N07-1](./0806-N07-1-상위설계-[home%20cover-html%20batch].md)

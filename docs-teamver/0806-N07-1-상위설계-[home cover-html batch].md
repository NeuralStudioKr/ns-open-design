# 0806-N07-1 상위설계 — home cover-html batch

> **이력:** [N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md) 에픽 하위. 이후 **N05-2/3만** 갱신.

**선행:** [0806-N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md) · [0806-N06](./0806-N06-1-상위설계-[home%20preview-url%20batch].md)

## 문제

Home Recent HTML 커버 cold path ≈ `N × GET /raw/deck.html`.  
preview-url는 N06 batch로 줄였으나 본문 fan-out은 남음.  
cover-hints는 `entryFile` 있으면 스킵되어 HTML 본문을 실을 수 없음.

## 목표

1. `POST /api/projects/cover-html-batch` — 다 project first-slide HTML 1회
2. home prefetch가 preview warm 후 HTML을 `htmlCoverCache`에 시드
3. 카드는 cache hit → `/raw` GET 0 (miss만 fallback)

preview-url batch · hints-miss `/files`는 유지.

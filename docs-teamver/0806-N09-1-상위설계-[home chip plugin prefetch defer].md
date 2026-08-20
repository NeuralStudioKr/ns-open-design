# 0806-N09-1 상위설계 — home chip plugin prefetch defer

> **이력:** [N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md) 에픽 하위. 이후 **N05-2/3만** 갱신.

**선행:** [N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md)

## 문제

home boot가 `GET /api/plugins/example-simple-deck`을 항상 호출.  
원인: Community list `limit=24`에 chip-bound 플러그인이 없어 eager prefetch.

## 목표

boot prefetch 제거. 칩 클릭/handoff의 기존 lazy `getInstalledPlugin`만 유지 → 카탈로그 −1.

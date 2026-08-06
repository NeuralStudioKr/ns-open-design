# 0806-N06-1 상위설계 — home preview-url batch

> **이력:** [N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md) 에픽 하위 슬라이스. 이후 동일 주제는 **N05-2/3만** 갱신.

**선행:** [0806-N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md)

## 문제

Home Recent HTML 커버 N장 cold path ≈ `N × preview-url` (+ `N × /raw`).  
캐시는 remount만 막고 프로젝트 간 fan-out은 그대로.

## 목표

1. `POST /api/projects/preview-url-batch` — 다 project 1회 mint
2. home prefetch가 HTML 커버 prefix를 선워밍 → 카드별 GET 0
3. client inflight 키를 `projectId`로 통일 (file별 이중 mint 제거)

`/raw × N` · hints-miss `/files`는 본 슬라이스 범위 외.

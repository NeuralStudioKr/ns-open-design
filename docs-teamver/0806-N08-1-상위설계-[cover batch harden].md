# 0806-N08-1 상위설계 — cover batch harden

> **이력:** [N05](./0806-N05-1-상위설계-[루트%20진입%20API%20호출%20베이스라인].md) 에픽 하위. 이후 **N05-2/3만** 갱신.

**선행:** [N06](./0806-N06-1-상위설계-[home%20preview-url%20batch].md) · [N07](./0806-N07-1-상위설계-[home%20cover-html%20batch].md)

## 리뷰 결함

1. **레이스:** entryFile HTML 카드가 prefetch/warm 전에 `/raw` 시작  
2. **ACL:** `preview-url-batch` / `cover-html-batch`에 per-project access 없음  
3. **size gate:** full-read 후 검사 → 메모리 방어 무력  
4. **mode:** daemon isolate 후 page-mode가 deck CSS를 놓침  

## 목표

위 4건 수정. 카탈로그 defer·example-simple-deck는 다음 슬라이스.

# 0805-N07-1 상위설계 — `/raw/deck.html` 반복 호출

## 증상

`/api/projects/:id/raw/deck.html?cacheBust=…` (및 목록 커버 `/raw/…?v=`)가 연속 호출됨.

## 원인

1. **FileViewer disk fetch** — effect deps에 `liveHtmlPaintsPreview` 포함 → 스트림 중 paints 토글마다 abort+재요청 (`cacheBust=mtime-0-0-0` 형태).
2. **ProjectCardHtmlCover** — effect가 `src`(쿼리 `?v=` 포함)에 의존 + 카드별 `AbortSignal`로 GET dedupe 스킵 → remount/`updatedAt` churn 시 `/raw` 폭주. N06 fallback으로 가시 카드가 늘며 체감 악화.

## 목표

- disk fetch는 mtime/refresh/stream 경계에서만 재실행 (paints flicker 무시)
- 커버는 path 단위 캐시·공유 inflight, unmount abort로 네트워크를 끊지 않음

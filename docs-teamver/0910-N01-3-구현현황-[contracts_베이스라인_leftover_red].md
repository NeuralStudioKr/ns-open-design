# 0910-N01-3 구현현황 — contracts 베이스라인 leftover red (루프489)

상위: [0910-N01-1](./0910-N01-1-상위설계-[contracts_베이스라인_leftover_red].md) · 설계: [0910-N01-2](./0910-N01-2-구현설계-[contracts_베이스라인_leftover_red].md)

## 진행

| 항목 | 상태 |
|------|------|
| leftover denylist: Hermes `pnpm vitest auth` · Pitch `Maya Chen` · Playful `Team Structure & Leadership` · kami `MMXXVI` | ☑ |
| `looksLikeLeftoverTemplateDemoDeck` 지문 동기화 | ☑ |
| neubrutal: `restyleForeignIbMagazineCover`가 `data-screen-label`/`data-slide` 보존 | ☑ |
| cardish: `.card-body` 위 peer `.card` 열릴 때 조상 card까지 close (루프194 회귀) | ☑ |
| Daisy compose: stale `Expo for Senior Engineers` 기대를 topic-neutral worked example로 정렬 | ☑ |
| contracts 해당 5파일 92/92 | ☑ |

## 결정

- Expo 예시는 `deck-quality.ts`에서 의도적으로 제거됨(모델이 예시 문구를 슬라이드에 복사) — 테스트가 구문을 따라감.
- cardish peer close는 stack top이 non-cardish(`.card-body`)여도 cardish 조상이 있으면 래퍼를 먼저 닫는다.

## 남은 일

- ~~contracts 전체 스위트 스모크~~ → 루프489 3122/3122
- ~~empty API raw_error~~ → [0910-N02](./0910-N02-3-구현현황-[empty_응답_raw_error_진단].md) 루프490 ☑
- N02 staging 스톨 스모크 (라이브)

## 변경 이력

| 2026-09-10 15:40 | 루프489 — red 7건 완료 |
| 2026-09-10 16:05 | 루프490 empty API raw_error는 N02로 이관 |

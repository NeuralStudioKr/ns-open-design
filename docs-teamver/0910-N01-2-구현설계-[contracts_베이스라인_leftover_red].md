# 0910-N01-2 구현설계 — contracts 베이스라인 leftover red (루프489)

상위: [0910-N01-1](./0910-N01-1-상위설계-[contracts_베이스라인_leftover_red].md)

## 1. leftover sweep 3건 (우선)

`buildTemplateClonedDeckHtml` → `stripLeftoverCatalogDemoPhrases`(`LEFTOVER_CATALOG_PHRASE_RE`).

| 잔여 | 원인 | 수정 |
|------|------|------|
| `pnpm vitest auth` | denylist 미등재 (Hermes codebox demo) | 구문 추가 |
| `Maya Chen` | denylist 미등재 (Pitch footer/team card) | 구문 추가 |
| `Team Structure` | denylist가 `… Resource Allocation`만 매칭, Playful는 `Team Structure & Leadership` | `Team Structure(?:\s*(?:&|&amp;)?\s*(?:Resource Allocation|Leadership))?` |

`looksLikeLeftoverTemplateDemoDeck` 지문 정규식도 동일하게 맞춘다.

## 2. 후속 슬라이스 (같은 에픽에서 함께 처리)

| 잔여 | 원인 | 수정 |
|------|------|------|
| kami `MMXXVI` | denylist 미등재 | 구문 추가 |
| neubrutal `01 Cover` 유실 | `restyleForeignIbMagazineCover`가 open을 재작성하며 identity attr 폐기 | `data-screen-label`/`data-slide` 보존 |
| cardish 피어 close 미달 | stack top이 `.card-body`(non-cardish)라 peer `.card`에서 조상 close 스킵 | cardish 조상 있으면 래퍼부터 close |
| Daisy compose Expo | `deck-quality`가 topic-neutral example로 교체됐는데 테스트가 구 Expo 문구 기대 | 테스트 정렬 |

## 3. 검증

- leftover sweep Hermes/Pitch/Playful · kami heal · cardish · neubrutal · Daisy compose green
- 영문 Broadside 등 catalog no-op 유지

## 변경 이력

| 2026-09-10 15:35 | 루프489 구현설계 |
| 2026-09-10 15:40 | 구조 heal·compose 슬라이스 포함해 갱신 |

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

## 2. 후속 슬라이스 (같은 에픽)

- kami `MMXXVI` — heal-only recover scrub
- cardish imbalance / neubrutal screen-label / Daisy compose fixture — 개별 원인 후 수정

## 3. 검증

- leftover sweep Hermes/Pitch/Playful green
- `template-clone-fill` 회귀 + leftover sweep 전체
- 영문 Broadside 등 catalog no-op 유지

## 변경 이력

| 2026-09-10 15:35 | 루프489 구현설계 |

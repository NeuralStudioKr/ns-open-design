# 0910-N01-1 상위설계 — contracts 베이스라인 leftover red

**날짜:** 2026-09-10 · **루프:** 489  
**관련:** [0908-N03](./0908-N03-3-구현현황-[킷_대비순응_이중패딩_찌꺼기].md) 남은 일 · `template-clone-official-leftover-sweep` · 0826-N01 F5

## 1. 체감

contracts 전체 **3112 pass / 7 fail**. poster heal(루프482–488)과 무관한 베이스라인 red로, empty Clone·heal 경로에 카탈로그 데모 명사/픽스처 잔여가 남는다.

## 2. 실패 목록

| # | 테스트 | 잔여 신호 |
|---|--------|-----------|
| 1 | leftover sweep · Hermes | `pnpm vitest auth` |
| 2 | leftover sweep · Pitch | `Maya Chen` |
| 3 | leftover sweep · Playful | `Team Structure` |
| 4 | kami-deck heal leftover | `MMXXVI` |
| 5 | cardish sibling imbalance (루프194) | 피타고라스 카드 재배치 미달 |
| 6 | neubrutal empty-lead fixture | `data-screen-label="01 Cover"` 유실 |
| 7 | selected-template-compose Daisy | prompt에 `Expo for Senior Engineers` 부재 |

## 3. 정책

1. Hangul/empty-topic Clone 후 공식 example 데모 고유명사는 visible body에 남지 않는다.
2. denylist는 **부분 일치가 너무 넓은 일반 어휘**를 피하고, 카탈로그에 실제로 찍히는 구문을 지목한다.
3. Playful의 `Team Structure`는 현재 denylist가 `Team Structure … Resource Allocation` 전체 구문만 잡아 **짧은 제목만** 남는 사각을 메운다.
4. heal-only recover 경로도 Clone과 같은 leftover scrub을 탄다(kami `MMXXVI` 등).
5. 한 루프에서 **leftover denylist/scrub 축**을 우선하고, 구조 heal(cardish)·compose fixture는 같은 에픽 슬라이스로 이어서 처리한다.

## 4. 성공 조건

- leftover sweep 3킷 + 가능하면 kami heal green
- contracts 전체 red ≤ 4(구조/compose 잔여) 또는 7→0
- 영문 공식 catalog example 자체는 no-op 유지(무브리프)

## 변경 이력

| 2026-09-10 15:30 | 루프489 상위설계 |

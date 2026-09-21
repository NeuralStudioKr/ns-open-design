# 0916-N04-3 구현현황 · Round 2 컴팩트 레이아웃 stretch 확장 (루프541)

## 진행 요약

- ☑ `packages/contracts/src/html/deck-fixed-canvas.ts`에 `.slide-content` /
  `.hero-frame` stretch 규칙 추가.
- ☑ `deck-fixed-canvas.test.ts`에 루프536/541 회귀 테스트 1건 추가 — pin 결과
  CSS 검증.
- ☑ deck-fixed-canvas 스위트 88 pass.
- ☑ 전체 contracts test 3192 pass.

## 킷별 검토 결과

- Studio / Signal / Grove / Broadside → 루프536에서 처리 완료 (변경 없음).
- 8-Bit Orbit `.slide-content` → 루프541 신규 처리.
- Block Frame `.hero-frame` → 루프541 신규 처리.
- Coral / Playful → `.slide` 자체가 flex-column이므로 개별 wrapper stretch 필요 없음. 검토 완료·변경 없음.

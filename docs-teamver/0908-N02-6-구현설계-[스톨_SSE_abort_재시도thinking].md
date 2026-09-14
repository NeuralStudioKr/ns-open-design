# 0908-N02-6 구현설계 — SSE 스톨 abort · 재시도 thinking 미도색 (루프519)

상위: [0908-N02-1](./0908-N02-1-상위설계-[스톨_부분덱_salvage_이어쓰기].md) · 선행: [0908-N02-5](./0908-N02-5-구현설계-[스톨_재시도_abort_1회_thinking].md) · 현황: [0908-N02-3](./0908-N02-3-구현현황-[스톨_부분덱_salvage_이어쓰기].md)

## 목표

루프512 재검토. 덱 HTML·fill·heal·프롬프트는 **변경하지 않는다.** 스톨 경로의 남은 정합만 닫는다.

1. idle `catch`만 abort하고, 데몬 watchdog SSE `error` (`AGENT_EXECUTION_STALLED`)는 첫 스트림을 안 끊는다. 재시도 시 MiniMax가 겹칠 수 있다.
2. 재시도 회차의 `thinking_delta`가 1회차 thinking 뒤에 붙어 카드만 지저분해진다. 본문 토큰·저장 HTML과는 무관하지만 실패처럼 보인다.
3. 재시도 budget이 루프 상한보다 커지면 `for`가 `onError` 없이 끝난다 (현재 2 < 3이라 미발화, 가드).

## 파일

| 경로 | 역할 |
|------|------|
| `apps/web/src/providers/api-proxy.ts` | SSE 스톨 abort · 재시도 thinking no-op · 루프 종료 onError |
| `apps/web/tests/providers/api-proxy.test.ts` | SSE 스톨 abort+재시도 · 재시도 thinking 미도색 |

## 정책

- 스톨 abort는 idle·SSE 동일. page-exit drain이 아니다.
- 2회차부터 `onThinkingDelta`를 호출하지 않는다. `onDelta`/`onDone`은 그대로라 덱 본문은 변하지 않는다.
- fill / LOOK seed / salvage 자격 / idle 6분은 비범위.

## 테스트

- 데몬형 SSE `error.code=AGENT_EXECUTION_STALLED` (본문 없음) → abort 1 + stream 2 + onDone
- 위 + 1회차 thinking → 2회차 thinking 콜백 없음, 본문 onDone
- 본문 delta 후 SSE 스톨 → abort 1, stream 1, 비재시도

## 변경 이력

| 2026-09-14 | 루프519 구현설계 |

# 0908-N02-4 구현설계 — 부분 덱 없는 스톨 soft-retry (루프478)

상위: [0908-N02-1](./0908-N02-1-상위설계-[스톨_부분덱_salvage_이어쓰기].md) · 선행: [0908-N02-2](./0908-N02-2-구현설계-[스톨_부분덱_salvage_이어쓰기].md) · 현황: [0908-N02-3](./0908-N02-3-구현현황-[스톨_부분덱_salvage_이어쓰기].md)

## 목표

루프477은 부분 덱이 있는 스톨을 salvage·이어쓰기로 살렸다. 남은 구멍은 **토큰·thinking이 하나도 없는 침묵 스톨**이다. 정책은 이미 「실패 카드 + soft-retry」인데, 기존 스펙은 `shouldSoftRetryProxyFailure`에 만든 에러 객체만 보고 `streamProxyEndpoint`가 실제로 두 번째 fetch를 여는지는 잠그지 않았다.

이번 슬라이스는 그 경로를 **스트림 루프에서 1회 이상 재시도**로 고정한다. 유휴 창 값·모델 분할은 계속 비범위다.

## 파일

| 경로 | 역할 |
|------|------|
| `apps/web/src/providers/api-proxy.ts` | `PROXY_SOFT_RETRY_DELAY_MS` export · 정책 주석 (게이트 유지) |
| `apps/web/tests/providers/api-proxy.test.ts` | 무토큰 스톨 → 재시도 성공 / 3회 소진 후 onError |

## 정책 (루프477 유지)

| 스톨 상태 | `retryable` | `resumable` | UX |
|---|---|---|---|
| 토큰·thinking 없음 (부분 덱 없음) | `true` | `true` | `streamProxyEndpoint` soft-retry (최대 3시도). 소진 시 실패 카드 |
| 토큰 또는 thinking이 그려진 뒤 | `false` | `true` | 재시도 금지(UI 중복). 부분 덱이면 salvage, 아니면 실패+이어쓰기 |

`AGENT_EXECUTION_STALLED`는 auth/config 블록리스트가 아니다. `retryable: true`면 `shouldSoftRetryProxyFailure`가 허용한다.

## 구현

1. `createProxyStreamIdleError()`는 계속 `retryable: true`로 시작한다. `streamProxyEndpointOnce` catch의 기존 게이트가 토큰/thinking 이후에만 `false`로 내린다.
2. `PROXY_SOFT_RETRY_DELAY_MS`(600)를 `@internal vitest`로 export해 재시도 간격이 테스트와 어긋나지 않게 한다.
3. 빨간 스펙을 스트림 레벨로 승격한다.
   - 1회차 무토큰 hang → idle → 2회차 delta+end 성공. `fetch` 2회, `onDone` 1회, `onError` 없음.
   - 3회 모두 무토큰 hang. `fetch` 3회 후 `onError` 1회, `retryable === true`, `resumable === true`.

## 비범위

- `PROXY_STREAM_IDLE_TIMEOUT_MS` / `_DECK_MS` / 데몬 inactivity 값 변경
- MiniMax 업스트림 침묵 회피(모델·프롬프트 분할)
- staging 실기 스톨 bake (배포 대기)
- thinking-only 후 스톨 — 이미 비재시도 (thinking UI 중복)

## 변경 이력

| 2026-09-08 | 루프478 구현설계 |

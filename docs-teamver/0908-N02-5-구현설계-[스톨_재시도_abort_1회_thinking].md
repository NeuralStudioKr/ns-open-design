# 0908-N02-5 구현설계 — 스톨 재시도 abort · 1회 · thinking-only (루프512)

상위: [0908-N02-1](./0908-N02-1-상위설계-[스톨_부분덱_salvage_이어쓰기].md) · 선행: [0908-N02-4](./0908-N02-4-구현설계-[스톨_무부분덱_soft-retry].md) · 현황: [0908-N02-3](./0908-N02-3-구현현황-[스톨_부분덱_salvage_이어쓰기].md)

## 목표

루프478 검토에서 남은 구멍 세 개를 닫는다.

1. 스톨 재시도가 첫 BYOK 스트림을 끊지 않아 MiniMax가 겹친다.
2. 네트워크 502용 3시도가 스톨 idle(6분)에도 적용되어 최악 ~18분 Working이 된다.
3. thinking만 오고 본문이 없는 스톨은 재시도·salvage가 둘 다 없다.

유휴 창 값(6분)과 모델 분할은 계속 비범위다.

## 파일

| 경로 | 역할 |
|------|------|
| `apps/web/src/providers/api-proxy.ts` | stall abort · 시도 상한 · thinking-only retryable |
| `apps/web/tests/providers/api-proxy.test.ts` | 회귀 3구멍 |

## 정책

| 상태 | 동작 |
|---|---|
| 본문 토큰 없이 스톨 (thinking만 있어도) | 첫 스트림 `POST /api/proxy/abort` + reader cancel → soft-retry **1회**(총 2시도) |
| 본문 토큰이 그려진 뒤 스톨 | abort는 동일. `retryable: false` · `resumable: true`. 부분 덱이면 salvage |
| 네트워크 502 / UPSTREAM_UNAVAILABLE | 기존 최대 3시도 유지 |
| thinking-only EOF / fetch throw (스톨 아님) | 기존처럼 비재시도 (thinking UI 중복) |

스톨 abort는 page-exit가 아니다. FE가 스트림을 죽었다고 판단한 명시적 취소라서 업스트림을 끊는다. 부모 `AbortSignal`은 건드리지 않는다(재시도가 같이 죽지 않게).

thinking 패널은 1회차 문구를 유지하고, 2회차 thinking은 이어 붙을 수 있다. 빈 실패 카드보다 낫다.

## 구현

1. `PROXY_STREAM_STALL_MAX_ATTEMPTS = 2`. `maxProxySoftRetryAttempts(err)`가 `AGENT_EXECUTION_STALLED`만 2, 그 외 3.
2. `streamProxyEndpoint` 루프는 `attempt < maxProxySoftRetryAttempts(error) - 1`.
3. `applyStreamedOutputRetryableGate` — 본문 토큰이면 항상 `retryable: false`. thinking-only는 스톨이 아닐 때만 `false`.
4. `AGENT_EXECUTION_STALLED` catch에서 `requestProxyAbort(streamId)` + `reader.cancel()`. 재시도 여부와 무관.

## 테스트

- 무토큰 hang → abort POST 1회 → 2회차 성공
- thinking 후 hang → abort → 2회차 성공 (`retryable` 유지)
- 스톨 2회 소진 후 `onError` (`fetch` 스트림 2회, 3회 아님)
- 본문 delta 후 스톨은 abort는 하되 재시도 없음
- thinking-only EOF / reader throw는 기존 비재시도

## 비범위

- `PROXY_STREAM_IDLE_TIMEOUT_*` 값 변경
- MiniMax 프롬프트 분할
- staging 실기 bake

## 변경 이력

| 2026-09-14 | 루프512 구현설계 |

# 0908-N01-1 상위설계 — 스톨 런의 부분 덱 salvage · 이어쓰기

**날짜:** 2026-09-08 · **루프:** 477
**관련:** 루프423(keepalive content-idle) · [54-2](./54-2-구현현황-[MiniMax_품질루프].md) · `apps/web/src/providers/api-proxy.ts` · `apps/web/src/components/ProjectView.tsx`

## 1. 체감

`AGENT_EXECUTION_STALLED` 진단 리포트(project `3b5e8fda…`, agent `minimax-api`). 10분 대기 후 「생성이 응답하지 않아 중단했습니다」만 남고 **결과물이 하나도 없다**. 미리보기 패널에는 스트리밍 중이던 부분 덱이 그려져 있었는데 저장되지 않는다.

스톨 자체는 업스트림(MiniMax)이 턴 중간에 토큰을 멈춘 것이고, 루프423 게이트가 의도대로 잡아낸 정상 동작이다. 문제는 **스톨 이후 처리**다.

## 2. 원인

| 구멍 | 위치 |
|---|---|
| 스톨 에러에 `resumable`이 없다 → 이어쓰기/Continue dock 미표시 | `api-proxy.ts` `createProxyStreamIdleError()`; BYOK는 `resumable`을 에러 객체에서만 읽음(`ProjectView` onError) |
| 부분 덱이 버려진다 → salvage·auto-continue 파이프라인 미도달 | onError는 `scheduleStreamRunHtmlAutoOpen(fullText)`를 호출하지 않음(성공 경로만 호출) |

`incomplete_output` 경로는 이미 emergency salvage → auto-continue → outline fallback → `failed`+`resumable`을 갖추고 있다. 스톨만 그 혜택을 못 받는다.

## 3. 정책

1. 슬라이드(embed) 런이 **부분 덱을 이미 스트리밍한 상태**에서 스톨하면, 성공 종료와 동일한 terminal finalize 파이프라인에 태운다.
2. 그 결과 산출물이 나오면 **저장·오픈 + 경고 notice**(하드 실패 카드 아님), 부족하면 기존 auto-continue(이어쓰기)가 이어받는다.
3. 부분 덱이 없는 스톨(토큰 이전 침묵)은 **기존 동작 유지** — 실패 카드 + soft-retry.
4. 스톨 에러는 `resumable: true` — 부분 출력이 있어 soft-retry(`retryable`)는 계속 금지하되, 수동 이어쓰기는 열어둔다.
5. 유휴 창(deck 10분 / 일반 5분)과 데몬 `OD_BYOK_PROXY_INACTIVITY_TIMEOUT_MS`는 **이번 범위 밖** — 값 변경 없음.

## 4. 성공 조건

- 스톨 + 부분 덱 → deck 파일이 프로젝트에 남고 미리보기가 열린다.
- 스톨 카드에 이어쓰기(또는 auto-continue notice)가 보인다.
- 부분 덱 없는 스톨은 기존 실패 UX 그대로.

## 변경 이력

| 2026-09-08 13:30 | 루프477 상위설계 초안 |

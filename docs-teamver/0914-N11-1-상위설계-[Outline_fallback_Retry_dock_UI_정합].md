# 0914-N11-1 상위설계 — Outline fallback Retry dock UI 정합 (loop528)

상위 배경: `0914-N08` (LOOK seed Retry dock 정합). N08 미해결 후속.

## 문제

`outlineFallbackRecovered` 라이브 마감은 LOOK seed 와 동일한 결함:

1. `runStatus: 'succeeded' + resumable: true + warning only`
2. `formatOutlineDeckFallbackNotice` 는 **"우측의 '다시 시도' 버튼"** 을 안내
3. `retryableAssistantMessage` 는 `failed` 만 인식 → Retry dock 미렌더

`slide-deliverable-recovery.ts` 주석도 이미 예견한다:
> still resumable via the existing failed-run retry affordance if we lift it back to `runStatus: 'failed'` at the caller site

## Emergency 와의 차이 (스코프 밖)

| 경로 | 성격 | 마감 | 이번 loop |
|---|---|---|---|
| LOOK seed | fill 미완성, seed 유지 | failed (N08) | 완료 |
| Outline fallback | 목차 임시 덱 — 완성본 아님 | **failed 로 승격** | **본 loop** |
| Emergency salvage | 스트림 절단 HTML 복구 — 확인 유도 | succeeded 유지 | 유지 (Retry 유도 없음) |

Emergency copy 는 "내용을 확인해 주세요" 이며 Retry 를 안내하지 않는다. salvage 성공으로 두는 것이 맞다.

## 해결

LOOK seed (loop525) 미러:

- warning + **error** event (`OUTLINE_DECK_FALLBACK_STATUS_CODE`)
- `runStatus: 'failed'`, `resumable: false`
- `updateConversationLatestRun('failed', …)`
- copy 는 Retry 버튼 안내 유지 (이제 버튼이 실제로 뜸)

`hasPersistedRunErrorEvent` 는 이미 `OUTLINE_DECK_FALLBACK_STATUS_CODE` 를 제외한다 → reload 안전.

## 부수: LOOK seed copy 재정렬

loop524 는 Retry dock 부재로 copy 를 "채팅에 재요청" 으로 바꿨다. loop525 이후 Retry dock 이 동작하므로 LOOK seed copy 도 **"다시 시도" 버튼** 안내로 되돌린다 (채팅 재입력도 여전히 가능).

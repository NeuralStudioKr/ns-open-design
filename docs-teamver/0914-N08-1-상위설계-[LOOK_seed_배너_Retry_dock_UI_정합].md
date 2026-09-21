# 0914-N08-1 상위설계 — LOOK seed 배너 Retry dock UI 정합 (loop525)

> 재넘버링: 병렬 세션이 0914-N07 을 outline generator 텔레메트리에 사용해 loop525 는 N08 로 이동. 내용 변경 없음.

상위 배경: `0914-N06-1`.

## 문제 (loop524 후속)

loop524 는 slide-count 오진 자체를 A1/A2 로 방어했다. 그러나 **LOOK seed 배너가 "우측 '다시 시도' 버튼" 을 안내함에도 실제 Retry 버튼이 뜨지 않는** UX 정합 결함이 남았다:

1. `buildCloneLookSeedRecoveredAssistant` 는 assistant 를 `runStatus: 'succeeded' + resumable: true + warning event(CLONE_LOOK_SEED_FALLBACK_STATUS_CODE)` 로 마감한다.
2. `ChatPane.retryableAssistantMessage` (ChatPane.tsx:3632) 는 `last.runStatus === 'failed'` 만 반환.
3. `runFailureUi = retryAssistant ? resolveRunFailureUi(...) : null` → retryAssistant === null → `runFailureUi === null` → Retry dock 렌더링 게이트 (`retryAssistant && onRetry && runFailureUi`) 실패.
4. 결과: 유저는 안내대로 "다시 시도" 를 찾다가 컴포저에 브리프를 재타이핑 → 그 경로는 loop524 의 A1/A2 로만 방어됨 (얇은 얕은 껍질).

동일 결함이 `formatOutlineDeckFallbackNotice` / 일부 `outlineFallbackRecovered` 경로에도 존재 (같은 `succeeded + resumable: true` 패턴). 이번 loop 는 **LOOK seed 만** 정합화하고, outline/emergency 는 후속 loop 로 분리.

## 감사 결과

### A. Retry dock 렌더 조건
`ChatPane` 은 다음 3개 조건 AND 로 Retry dock 을 렌더한다:
- `retryAssistant` — `runStatus === 'failed'` 인 마지막 assistant.
- `onRetry` prop — 항상 연결됨.
- `runFailureUi` — `retryAssistant` 있을 때 계산됨.

`retryAssistant?.resumable` 는 **Continue 버튼용** (daemon session resume) 이지 Retry dock 게이트가 아니다. `succeeded + resumable: true` 조합은 두 버튼 모두 뜨지 않는다.

### B. `failed` 로 마감 시 하류 영향

| 하류 | 현재 (succeeded) | `failed + resumable: false + error event` | 영향 |
|---|---|---|---|
| `retryableAssistantMessage` | null | truthy | Retry dock 뜸 ✓ |
| `handleRetry → resolveRetryTarget` | null (fail) | truthy | Retry 재시도 성립 ✓ |
| `canResumeFailedRun` | false | false (resumable=false) | Continue 버튼 미표시 ✓ (MiniMax BYOK 에는 daemon session 없음) |
| `reconcileChatMessageOnLoad` | succeeded 유지 | failed 유지 (line 210 early return) | 안정 ✓ |
| `hasPersistedRunErrorEvent` | LOOK seed code 제외 | LOOK seed code 제외 (safety) | 무해 |
| `updateConversationLatestRun` | 'succeeded' | 'failed' | 대화 목록에 실패로 표시 (실제로 실패이므로 정합) |
| `findCloneSlotFillStuckRepairNoticeAssistant` | 무관 (다른 notice) | 무관 | 영향 없음 |
| `attemptCloneSlotFillStuckRepairNoticeRecovery` (loop372) | 결과가 succeeded 였음 | 결과가 failed | 상류 succeeded 감지 후 → LOOK seed 로 변환 → 이후엔 다른 상태. 안전 |
| Warning event 렌더 (배너) | 정상 | 정상 (label 무관, code 로 렌더) | 유지 ✓ |

### C. `resumable: true` 는 왜 걸려 있었나
`buildCloneLookSeedRecoveredAssistant` 의 주석: "Retry stays available via `resumable`" — 오해. Retry dock 은 `resumable` 이 아니라 `failed` 만 요구. MiniMax BYOK 에는 daemon session 자체가 없어 `resumable: true` 는 의미 없음. `resumable: false` 로 두는 것이 정합.

### D. Retry 후 재시도가 성공하는가
`handleRetry` → `handleSend('', [], [], { retryOfAssistantId })` → `resolveRetryTarget` 반환 → `retryTarget.userMsg` 는 원본 유저 브리프. 원본 브리프에는 `runContext.templateCloneFill: 'json'|'prompt'` 또는 `[Template clone content fill]` 마커가 살아있어:
- `templateCloneFillModeFromUserMessage(retryTarget.userMsg)` 이 'json'/'prompt' 반환
- `runTemplateCloneContentFillRef.current === true` 또는 `runTemplateClonePromptFillRef.current === true`
- `allowReplaceSeedOrLeftover === true` (loop524 A1 첫 항)
- byte / slide-count / stub-guard 3개 가드 통과
- `cleanupByokRetryArtifacts` 로 stale LOOK seed 는 재시도 전 정리됨

즉 UI 정합만 맞추면 Retry 버튼 클릭 = 정상 재실행.

## 해결 방침

`buildCloneLookSeedRecoveredAssistant` (그리고 ProjectView 의 라이브 마감 브랜치) 를 다음으로 통일:

```ts
{
  ...appendErrorStatusEvent(
    appendWarningStatusEvent(
      clearDurableDeliverableErrorsAfterRecovery(prev),
      lookSeedNotice,
      CLONE_LOOK_SEED_FALLBACK_STATUS_CODE,
    ),
    lookSeedNotice,
    CLONE_LOOK_SEED_FALLBACK_STATUS_CODE,
  ),
  producedFiles: produced,
  runStatus: 'failed',
  resumable: false,
  endedAt: ...,
}
```

- **Warning event 는 그대로 유지** → 기존 배너 렌더 로직/테스트 회귀 없음.
- **Error event 추가** → `ChatPane.failedRunErrorEvent` 감지 → `resolveRunFailureUi(CLONE_LOOK_SEED_FALLBACK_STATUS_CODE, 'minimax-api')` → `primaryAction: 'retry'`.
- **`runStatus: 'failed'`** → `retryableAssistantMessage` 매칭 → Retry dock 렌더.
- **`resumable: false`** → Continue 버튼 없음 (MiniMax 정합).
- **`updateConversationLatestRun('failed', endedAt)`** → 대화 목록 표기 정합.
- **배너 copy** (loop524) 는 유지 (`"채팅에 원하는 내용을 다시 요청해 완성본을 생성해 주세요"`) — Retry 버튼이 이제 뜨므로 유저는 버튼 또는 재타이핑 어느 쪽이든 사용 가능. Copy 는 broader 표현이 안전.

## 스코프 밖

- Outline / emergency fallback 도 같은 결함이 있으나 별도 loop 로 분리 (품질 리스크가 다르고, 회귀 테스트 셋이 방대).
- 초기 fill 얕음의 근본 원인 (system prompt / temperature) 은 N08 별도 loop.

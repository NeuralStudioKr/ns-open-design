# 0914-N11-2 구현설계 — Outline fallback Retry dock UI 정합 (loop528)

상위: `0914-N11-1`.

## 1) ProjectView.tsx — outlineFallbackRecovered

LOOK seed 분기와 동일 패턴:

```ts
} else if (outlineFallbackRecovered) {
  const outlineNotice = formatOutlineDeckFallbackNotice();
  updateAssistant((prev) => {
    const withWarning = appendWarningStatusEvent(
      clearDurableDeliverableErrorsAfterRecovery(prev),
      outlineNotice,
      OUTLINE_DECK_FALLBACK_STATUS_CODE,
    );
    const withError = appendErrorStatusEvent(
      withWarning,
      outlineNotice,
      OUTLINE_DECK_FALLBACK_STATUS_CODE,
    );
    return {
      ...withError,
      producedFiles: outlineFallbackProduced,
      runStatus: 'failed',
      resumable: false,
      endedAt: prev.endedAt ?? endedAt,
    };
  });
  updateConversationLatestRun('failed', endedAt);
}
```

Emergency 분기는 변경하지 않는다.

## 2) projectErrorMessages.ts — copy

- **Outline**: Retry 버튼 안내 유지 (문구 소폭 정리 가능).
- **LOOK seed**: "채팅에 재요청" → "우측의 '다시 시도' 버튼으로 완성본을 다시 생성해 주세요." 로 복원 (loop525 이후 dock 동작).

## 3) 테스트

- `amr-guidance.test.ts`: `outline_deck_fallback` → `primaryAction: 'retry'`
- `teamver-project-error-messages.test.ts`: LOOK seed / Outline copy assert 갱신
- `ProjectView` 소스 pin 또는 단위: outline 분기에 `runStatus: 'failed'` + `appendErrorStatusEvent` 존재

## Emergency 명시적 비변경

`emergencyRecovered`: `succeeded + resumable: false` 유지.

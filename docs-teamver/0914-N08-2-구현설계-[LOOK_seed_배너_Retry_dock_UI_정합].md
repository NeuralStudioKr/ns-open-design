# 0914-N08-2 구현설계 — LOOK seed 배너 Retry dock UI 정합 (loop525)

상위: `0914-N08-1` (원래 N07 이었으나 병렬 N07 에픽과 충돌해 재넘버링).

## 파일별 변경

### 1) `apps/web/src/runtime/slide-deliverable-recovery.ts`

`buildCloneLookSeedRecoveredAssistant`:

```ts
function buildCloneLookSeedRecoveredAssistant(
  assistant: ChatMessage,
  producedFiles: readonly ProjectFile[],
): ChatMessage {
  const lookSeedNotice = formatCloneLookSeedFallbackNotice();
  let produced = [...producedFiles];
  if (!produced.some((file) => file.name === 'deck.html')) {
    produced = [
      ...produced,
      {
        name: 'deck.html', size: 0, mtime: Date.now(),
        kind: 'html', mime: 'text/html',
      },
    ];
  }
  const withoutRepairNotice: ChatMessage = {
    ...assistant,
    events: (assistant.events ?? []).filter(
      (event) => !(event.kind === 'status'
        && event.label === 'warning'
        && isCloneSlotFillRepairInProgressNotice(event.detail)),
    ),
  };
  const withWarning = appendWarningStatusEvent(
    clearDurableDeliverableErrorsAfterRecovery(withoutRepairNotice),
    lookSeedNotice,
    CLONE_LOOK_SEED_FALLBACK_STATUS_CODE,
  );
  // 루프525 — Emit a matching `status:error` event so ChatPane's
  // `failedRunErrorEvent` picks it up and renders the Retry dock via
  // `resolveRunFailureUi(CLONE_LOOK_SEED_FALLBACK_STATUS_CODE, ...)`.
  // `hasPersistedRunErrorEvent` already excludes this code, so reload
  // reconciliation stays consistent (no accidental succeeded→failed flip
  // on legacy rows; new rows are already failed).
  const withError = appendErrorStatusEvent(
    withWarning,
    lookSeedNotice,
    CLONE_LOOK_SEED_FALLBACK_STATUS_CODE,
  );
  return {
    ...withError,
    producedFiles: produced,
    // 루프525 — LOOK seed is a persisted failure (fill did not complete),
    // not a salvage completion. Mark failed so the ChatPane Retry dock
    // matches the banner copy. `resumable: false` because MiniMax BYOK has
    // no daemon session to resume — Retry re-plays the original brief.
    runStatus: 'failed',
    resumable: false,
    endedAt: assistant.endedAt ?? Date.now(),
  };
}
```

- Import: `appendErrorStatusEvent` 추가.

### 2) `apps/web/src/components/ProjectView.tsx` (라이브 마감 브랜치)

`cloneLookSeedFallbackRecovered` 분기 (현행 line 11940-11962):

```ts
} else if (cloneLookSeedFallbackRecovered) {
  const lookSeedNotice = formatCloneLookSeedFallbackNotice();
  updateAssistant((prev) => {
    const withWarning = appendWarningStatusEvent(
      clearDurableDeliverableErrorsAfterRecovery(prev),
      lookSeedNotice,
      CLONE_LOOK_SEED_FALLBACK_STATUS_CODE,
    );
    const withError = appendErrorStatusEvent(
      withWarning,
      lookSeedNotice,
      CLONE_LOOK_SEED_FALLBACK_STATUS_CODE,
    );
    return {
      ...withError,
      producedFiles: produced,
      // 루프525 — See buildCloneLookSeedRecoveredAssistant for rationale.
      runStatus: 'failed',
      resumable: false,
      endedAt: prev.endedAt ?? endedAt,
    };
  });
  updateConversationLatestRun('failed', endedAt);
  if (runIsVisible()) {
    requestOpenFile('deck.html');
  }
}
```

- Import: `appendErrorStatusEvent` 는 이미 `../runtime/chat-events` 에서 임포트되어 있는지 확인, 없으면 추가.

### 3) `apps/web/tests/clone-look-seed-recovery.test.ts`

- 기존 succeeded 기대 assertion 을 failed 로 갱신.
- 새 케이스: `retryableAssistantMessage(buildCloneLookSeedRecoveredAssistant(...))` 이 non-null 반환.
- 새 케이스: 이벤트가 warning + error (둘 다 CLONE_LOOK_SEED_FALLBACK_STATUS_CODE) 포함.

### 4) 다른 기존 테스트 회귀 확인 스위트

- `apps/web/tests/project-view-message-load.test.ts`
- `apps/web/tests/runtime/compact-api-stacked-deck.test.ts`
- `apps/web/tests/components/ProjectView.run-cleanup.test.tsx`
- `apps/web/tests/staging-ibpb-deck-detection.test.ts`

이들이 `succeeded/resumable` 조합을 assert 하는지 검토. 필요 시 update.

## 검증

- 관련 테스트 전 파일 통과.
- 이 loop 는 UI 정합이므로 프론트-백엔드 계약 변경 없음. 데몬 스펙 무영향.

## 롤아웃

1. 상위설계 (완료 `1305661437`).
2. 이 구현설계 (본 커밋).
3. 코드 + 테스트 + 구현현황 (다음 커밋).

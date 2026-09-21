# 0914-N08-3 구현현황 — LOOK seed 배너 Retry dock UI 정합 (loop525)

상위: `0914-N08-1`, 설계: `0914-N08-2`. loop524 (`0914-N06`) 의 후속 (`0914-N06-3` 미해결 · 후속 항목 B 심층 개선 처리).

## 커밋

| SHA | 유형 | 내용 |
|---|---|---|
| `ad0fbe8bf9` | docs | 원래 N07 상위설계 (재넘버링 전) |
| `e730995a5b` | docs | 원래 N07 구현설계 (재넘버링 전) |
| `09c88c2976` | docs | N07 → N08 재넘버링 (병렬 세션 N07 outline generator 충돌 회피) |
| `5aa6ae9c01` | fix | loop525 코드 + 테스트 |
| (이 커밋) | docs | 구현현황 |

## 변경 요약

### 코드

**`apps/web/src/runtime/slide-deliverable-recovery.ts` — `buildCloneLookSeedRecoveredAssistant`**

```ts
const withWarning = appendWarningStatusEvent(
  clearDurableDeliverableErrorsAfterRecovery(withoutRepairNotice),
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
  runStatus: 'failed',
  resumable: false,
  endedAt: assistant.endedAt ?? Date.now(),
};
```

**`apps/web/src/components/ProjectView.tsx` — 라이브 마감 브랜치 (기존 line 11940)**

동일 패턴 적용. `updateConversationLatestRun('failed', endedAt)`.

### 테스트

- `apps/web/tests/clone-look-seed-recovery.test.ts`
  - `runStatus === 'failed'`, `resumable === false` pin.
  - warning event + error event 둘 다 `clone_look_seed_fallback` 코드로 존재.
  - `retryableAssistantMessage(messages, recoveredId, false)` non-null 반환 → Retry dock 이 실제로 뜨는지 pin.
  - `attemptCloneSlotFillStuckRepairNoticeRecovery` (loop372) 결과도 동일한 failed + 두 이벤트로 정합.
  - `buildCloneLookSeedReloadRecoveredAssistant(...).runStatus === 'failed'` pin.
- `apps/web/tests/runtime/amr-guidance.test.ts`
  - `resolveRunFailureUi('clone_look_seed_fallback', 'minimax-api' | 'claude' | null)` → `primaryAction: 'retry'` + `showSwitchCard: false` 로 낙착.

## 하류 감사 (설계 감사표 재확인)

| 하류 | Before | After | 결과 |
|---|---|---|---|
| `retryableAssistantMessage` | null | 매칭 | Retry dock 렌더 ✓ |
| `resolveRetryTarget` | null | 매칭 | Retry 재실행 성립 ✓ |
| `canResumeFailedRun` | false | false | Continue 미표시 (MiniMax 정합) ✓ |
| `reconcileChatMessageOnLoad` | succeeded 유지 | failed 유지 (line 210 early return) | 안정 ✓ |
| `hasPersistedRunErrorEvent` | LOOK seed 제외 | LOOK seed 제외 (safety) | 무해 ✓ |
| `updateConversationLatestRun` | 'succeeded' | 'failed' | 대화 목록 정합 ✓ |
| `findCloneSlotFillStuckRepairNoticeAssistant` | 무관 | 무관 | 영향 없음 ✓ |
| `attemptCloneSlotFillStuckRepairNoticeRecovery` | LOOK seed로 변환 | LOOK seed(failed)로 변환 | 정합 ✓ |
| Warning event 렌더 (배너) | 정상 | 정상 | 유지 ✓ |

## 유저 시나리오 재검증

### 1차 시도
- 데몬 LOOK seed 저장, MiniMax slot-fill 얕음.
- `recoverCloneLookSeedFallback` → `runStatus: 'failed', resumable: false`, warning + error 이벤트 부착.
- 배너: LOOK seed 문구 (기존 loop524 copy 그대로).
- **Retry dock 이 뜬다** (ChatPane 하단 회색 실패 카드 + '다시 시도' 버튼).

### 2차 시도 (Retry 버튼)
- `handleRetry(recoveredAssistant)` → `handleSend('', ..., { retryOfAssistantId })`.
- `resolveRetryTarget` → `retryTarget.userMsg === 원본 브리프`.
- `templateCloneFillModeFromUserMessage(retryTarget.userMsg) === 'json' | 'prompt'` → `runTemplateCloneContentFillRef.current === true`.
- `allowReplaceSeedOrLeftover === true` → byte / slide-count / stub-guard 모두 통과.
- 정상 재생성 성공. LOOK seed 는 새 데크로 대체.

### 2차 시도 (컴포저 재입력, 대안)
- Retry 대신 유저가 컴포저에 재입력해도 loop524 A1 (`priorProjectFile` seed metadata bypass) 로 여전히 안전.

## 미해결 · 후속

- **Outline / Emergency fallback 도 같은 결함**: `outlineFallbackRecovered` / `emergencyRecovered` 라이브 마감 브랜치도 `succeeded + resumable: true + warning` 로 저장한다. 같은 패턴으로 Retry dock 이 뜨지 않는다. 별도 loop (N10+) 로 분리 — 해당 폴백은 salvage 성격이므로 UX 요구가 다를 수 있어 별도 감사가 필요.
- **초기 fill 얕음 근본**: MiniMax 가 첫 fill 에서 얕은 outline 을 반환하는 원인 (system prompt / temperature / brief-topic 부재) 은 N09 별도 loop 로.

## 상태

- ☑ 상위설계 (`ad0fbe8bf9`)
- ☑ 구현설계 (`e730995a5b`)
- ☑ N07→N08 재넘버링 (`09c88c2976`)
- ☑ 코드 + 테스트 (`5aa6ae9c01`)
- ☑ 구현현황 (이 커밋)
- ⧗ push (다음 단계)

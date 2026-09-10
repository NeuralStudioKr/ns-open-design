# 0910-N02-2 구현설계 — empty 응답 raw_error 진단 (루프490)

상위: [0910-N02-1](./0910-N02-1-상위설계-[empty_응답_raw_error_진단].md)

## 변경

`ProjectView.tsx` `emptyApiResponse` non-soft 분기:

```ts
const userMessage = t('assistant.emptyResponseMessage');
const detail = encodePersistedRunErrorDetail(userMessage, {
  kind: 'empty_response',
  reason: config.model || 'empty_api_response',
  code: 'EMPTY_RESPONSE',
});
finalizedAssistant = {
  ...attachPersistedChatError(prev, detail, 'EMPTY_RESPONSE'),
  endedAt,
  runStatus: 'failed',
  // keep empty_response label for AssistantMessage empty-state UI if needed
  events: [
    ...attachPersistedChatError(...).events,
    // or merge: attach already adds status:error; also keep empty_response meta
  ],
};
```

Prefer: `attachPersistedChatError` first, then append `{kind:'status', label:'empty_response', detail: model}` if AssistantMessage still keys off that label — check before dropping.

## 루프491

### A. Stall code

- `apps/daemon/src/server.ts` watchdog `createSseErrorPayload('AGENT_EXECUTION_STALLED', …)`
- `stalledRunPartialDeckText`: `AGENT_EXECUTION_STALLED` **또는** (`AGENT_EXECUTION_FAILED` ∧ `/Agent stalled without emitting/i`)

### B. `surfaceChatVisibleError`

이미 marker가 있으면 그대로; 없으면 `encodePersistedRunErrorDetail(detail, { kind: 'surface-chat-error', reason: detail slice, code })`.

### C. Terminal deliverableError

각 formatter 결과에 `encodePersistedRunErrorDetail` + `terminalPersistResult`의 status/code/message/reason.

## 검증

- stalledRunDeckSalvage: STALLED + FAILED+stall phrase eligible; plain FAILED null
- project-error-messages: encode tails
- ChatPane: reason=unavailable fallback (있으면)

## 변경 이력

| 2026-09-10 16:00 | 루프490 구현설계 |
| 2026-09-10 16:10 | 루프491 A/B/C |

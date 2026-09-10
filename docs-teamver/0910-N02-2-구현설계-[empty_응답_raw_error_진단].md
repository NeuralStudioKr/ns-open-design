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

## 검증

- 단위: encode 결과에서 `extractPersistedRunErrorDiagnostic` + `buildRunErrorDiagnosticText`에 empty_response 포함
- soft improvement empty 경로는 canceled + warning만 (회귀)

## 변경 이력

| 2026-09-10 16:00 | 루프490 구현설계 |

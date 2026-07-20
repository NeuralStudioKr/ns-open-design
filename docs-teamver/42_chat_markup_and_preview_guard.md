# Chat Markup Sanitizer / Preview Guard

**판단 시점:** 2026-07-20 현재.

채팅창에는 내부 tool/thinking markup, deck navigation script tail, prompt-injection `<system-reminder>`가 서로 다른 경로로 섞여 들어올 수 있다. 표시 정책은 다음처럼 분리한다.

- 내부 tool/thinking/pseudo-tool/deck navigation tail은 사용자 prose에서 제거한다.
- 닫힌 `<system-reminder>`는 제거하지 않고 `AssistantMessage`의 prompt-injection chip 렌더러로 넘긴다.
- 열린 `<system-reminder>` 또는 streaming chunk 경계의 부분 태그는 raw prose로 노출하지 않는다.
- HTML preview는 streaming 중 마지막 stable frame을 유지하되, 최종 snapshot이 구조적으로 불완전하면 새 stable preview로 채택하지 않는다.
- 채팅 prose의 CDN/viewport 잔해(`googleapis.com" />` 등)도 프리뷰와 동일한 패턴으로 scrub한다. 스트리밍 중 닫힌 `<artifact>` 본문은 보존한다.
- 미완성 CDN host(`googleapis.com` / `fonts.googleapis.com` / `fonts.goo`…)는 chunk 경계에서 hold 후, 종결자(`"/>`)가 오면 scrub한다.
- bare host 전용 줄(void terminator 없음)도 history scrub에서 제거한다.
- sanitize가 content를 줄이면 live artifact parser는 `onContentRewrite`로 reset+replay한다.
- daemon turn-end에 assistant message를 non-streaming sanitize로 rewrite해 append-only 잔여를 DB에서 회수한다.

## 2026-07-20 적용 / 보강 요약

- system-reminder 보존, hyphenated tag delimiter, FileViewer structural gate
- Antigravity plaintext guard, MiniMax think-cap drop
- head skeleton hold, orphan CDN scrub, incomplete markup history strip
- merge prefer cleaned local (prefix + mid-string scrub)
- `fonts.googleapis.com` / short stem hold, bare host line scrub
- `createBufferedTextUpdates` `onContentRewrite` + parser reset/replay
- daemon `rewritePersistedAssistantProseAtTurnEnd`

## 검증

- `pnpm --filter @open-design/contracts exec vitest run`
- `pnpm --filter @open-design/daemon exec vitest run tests/think-tag-splitter tests/strip-leaked-pseudo-tool-xml tests/claude-stream tests/chat-routes tests/role-marker`
- `pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/components/buffered-text-pending.test.tsx tests/project-view-message-merge.test.ts tests/internal-agent-markup.test.ts tests/providers/sse.test.ts tests/file-viewer-streaming-preview.test.ts tests/components/prompt-injection-chip.test.tsx tests/components/ChatPane.streaming.test.tsx`

## 다음 추천 작업

1. BYOK chat-routes persist 경로에도 turn-end rewrite를 동일하게 적용하는지 확인한다.
2. same-line prose + CDN (`Done. googleapis.com`) 정책(hold vs 허용)을 제품 관점에서 확정한다.

# Chat Markup Sanitizer / Preview Guard

**판단 시점:** 2026-07-20 현재.

채팅창에는 내부 tool/thinking markup, deck navigation script tail, prompt-injection `<system-reminder>`가 서로 다른 경로로 섞여 들어올 수 있다. 표시 정책은 다음처럼 분리한다.

- 내부 tool/thinking/pseudo-tool/deck navigation tail은 사용자 prose에서 제거한다.
- 닫힌 `<system-reminder>`는 제거하지 않고 `AssistantMessage`의 prompt-injection chip 렌더러로 넘긴다.
- 열린 `<system-reminder>` 또는 streaming chunk 경계의 부분 태그는 raw prose로 노출하지 않는다.
- HTML preview는 streaming 중 마지막 stable frame을 유지하되, 최종 snapshot이 구조적으로 불완전하면 새 stable preview로 채택하지 않는다.
- 채팅 prose의 CDN/viewport 잔해(`googleapis.com" />` 등)도 프리뷰와 동일한 패턴으로 scrub한다. 스트리밍 중 닫힌 `<artifact>` 본문은 보존한다.
- 미완성 CDN host(`googleapis.com` / `fonts.googleapis.com` / `fonts.goo`…)는 chunk 경계에서 hold 후, 종결자(`"/>`)가 오면 scrub한다.
- same-line trailing host(`Done. fonts.googleapis.com`)도 hold/scrub한다. mid-sentence 언급(`See fonts.googleapis.com for docs`)은 유지한다.
- bare host 전용 줄(void terminator 없음)도 history scrub에서 제거한다.
- sanitize가 content를 줄이면 live artifact parser는 `onContentRewrite`로 reset+replay한다.
- daemon `design.runs.finish` wrapper에서 turn-end rewrite를 수행해 resume/critique 등 모든 finish 경로를 커버한다.
- preview는 body의 bare CDN host / 절단 `<link|meta|script`도 unstable로 본다.

## 2026-07-20 적용 / 보강 요약

- system-reminder 보존, hyphenated tag delimiter, FileViewer structural gate
- Antigravity plaintext guard, MiniMax think-cap drop
- head skeleton hold, orphan CDN scrub, incomplete markup history strip
- merge prefer cleaned local (prefix + mid-string scrub)
- `fonts.googleapis.com` / short stem hold, bare host line scrub
- same-line trailing CDN hold/scrub + preview bare-host gate
- `createBufferedTextUpdates` `onContentRewrite` + Strict Mode double-append 방지
- daemon finish wrapper `rewritePersistedAssistantProseAtTurnEnd`

## 검증

- `pnpm --filter @open-design/contracts exec vitest run`
- `pnpm --filter @open-design/daemon exec vitest run tests/think-tag-splitter tests/strip-leaked-pseudo-tool-xml tests/claude-stream tests/chat-routes tests/role-marker`
- `pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/components/buffered-text-pending.test.tsx tests/project-view-message-merge.test.ts tests/internal-agent-markup.test.ts tests/providers/sse.test.ts tests/file-viewer-streaming-preview.test.ts tests/components/prompt-injection-chip.test.tsx tests/components/ChatPane.streaming.test.tsx`

## 다음 추천 작업

1. BYOK chat-routes persist 경로에도 daemon과 동등한 turn-end rewrite를 명시적으로 확인한다.
2. URL-only host 줄 / 짧은 stem(`googlea`) false-positive 허용 범위를 제품 관점에서 재검토한다.

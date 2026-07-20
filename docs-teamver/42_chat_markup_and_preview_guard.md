# Chat Markup Sanitizer / Preview Guard

**판단 시점:** 2026-07-20 현재.

채팅창에는 내부 tool/thinking markup, deck navigation script tail, prompt-injection `<system-reminder>`가 서로 다른 경로로 섞여 들어올 수 있다. 표시 정책은 다음처럼 분리한다.

- 내부 tool/thinking/pseudo-tool/deck navigation tail은 사용자 prose에서 제거한다.
- 닫힌 `<system-reminder>`는 제거하지 않고 `AssistantMessage`의 prompt-injection chip 렌더러로 넘긴다.
- 열린 `<system-reminder>` 또는 streaming chunk 경계의 부분 태그는 raw prose로 노출하지 않는다.
- HTML preview는 streaming 중 마지막 stable frame을 유지하되, 최종 snapshot이 구조적으로 불완전하면 새 stable preview로 채택하지 않는다.

## 2026-07-20 적용

- `system-reminder` 보존 정책에 맞춰 web/contracts 테스트 정합을 보강.
- `<system>`/`<system-reminder>`처럼 hyphenated prefix tag가 서로의 close-search를 훔치지 않는 회귀 테스트 추가.
- `FileViewer` 최종 HTML preview가 `</body>`와 `</html>`을 모두 갖춘 경우에만 stable snapshot으로 승격되도록 확인 테스트 추가.

## 검증

- `pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/file-viewer-streaming-preview.test.ts tests/internal-agent-markup.test.ts`
- `pnpm --filter @open-design/contracts exec vitest run tests/agent-prose-sanitize.test.ts`

## 다음 추천 작업

1. 완료된 과거 프로젝트 재진입 시 deck navigation tail이 채팅 prose로 남지 않는지 실제 히스토리로 확인한다.
2. streaming 완료 직후 불완전 HTML이 잠깐 preview에 칠해지는 케이스가 남아 있으면 FileViewer의 stable-frame 조건을 DOM parse 기반으로 강화한다.

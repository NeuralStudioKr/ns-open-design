# Chat Markup Sanitizer / Preview Guard

**판단 시점:** 2026-07-20 현재.

## 왜 검토할 때마다 구멍이 보였는가

에이전트 truncation은 **적대적 분포**다. “이번에 본 조각”만 regex로 막으면 다음 조각이 새로 드러난다.

더 치명적이었던 구조 문제는 **CDN host 목록이 6~8곳에 복제**되어 드리프트한 것이었다. 호스트를 한곳에만 추가하면 다른 레이어가 열려 “또 구멍”처럼 보였다.

## 재발 방지 원칙 (강제)

1. **진입 함수 SSOT**: `sanitizeAssistantProseForDisplay` / `createStreamingAssistantProseGuard` (chat·daemon·FE 공유).
2. **호스트 SSOT**: `packages/contracts/src/html/artifactCdnHosts.ts`의 `ARTIFACT_CDN_HOSTS` — **새 CDN은 여기만 추가**. alternation/stem/heuristic는 배열에서 **생성**된다.
3. **불변식 테스트**: `tests/artifact-cdn-host-invariants.test.ts`
   - stem ⊆ host
   - chat scrub ↔ preview bare-host 동등
   - derived alternation이 모든 host를 포함 (하드코딩 병렬 목록 금지)
   - full-tag-before-orphan (`<link` 잔해 없음)
4. **적대 corpus**: 새 누수 스크린샷이 오면 **먼저 테스트 추가** 후 SSOT 수정.
5. **레이어 방어**: streaming hold → scrub → turn-end rewrite → FE persist → preview stable gate.

## 표시 정책

- 내부 tool/thinking/pseudo-tool/deck navigation tail은 사용자 prose에서 제거한다.
- 닫힌 `<system-reminder>`는 prompt-injection chip으로 넘긴다.
- CDN/viewport 잔해는 chat과 preview가 **동일 호스트 SSOT**로 scrub/reject한다.
- same-line trailing host는 hold/scrub, mid-sentence 언급은 유지한다.
- streaming 중 열린/닫힌 `<artifact>` 본문 stylesheet는 live panel용으로 보존하고, artifact 밖 prose의 CDN `<link|script>` / `@import` / open `<style|script>`는 제거·hold한다.
- daemon `design.runs.finish` wrapper에서 turn-end rewrite로 append-only 잔여를 회수한다.
- BYOK는 streaming guard + FE persist sanitize에 의존 (SSOT 회귀 = BYOK 회귀).

## 검증

- `pnpm --filter @open-design/contracts exec vitest run`
- 특히 `tests/artifact-cdn-host-invariants.test.ts` + `tests/agent-prose-sanitize.test.ts` + preview leak/stable tests
- `pnpm --filter @open-design/daemon exec vitest run tests/think-tag-splitter tests/strip-leaked-pseudo-tool-xml tests/claude-stream tests/role-marker`

## 호스트 추가 체크리스트

1. `ARTIFACT_CDN_HOSTS` (+ 필요 시 `ARTIFACT_CDN_HOST_STEMS`)에만 추가
2. `artifact-cdn-host-invariants` 그린 확인
3. 새 truncation 형태가 있으면 corpus 테스트에 사례 1개 추가
4. call site에 FQDN을 다시 적지 말 것

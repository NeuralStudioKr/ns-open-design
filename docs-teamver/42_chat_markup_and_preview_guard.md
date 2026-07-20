# Chat Markup Sanitizer / Preview Guard

**판단 시점:** 2026-07-20 현재.

## 왜 검토할 때마다 구멍이 보였는가

이 문제는 **단일 버그**가 아니라 **적대적 truncation 분포**다. 에이전트는 `<link href="https://fonts.` 같은 태그를 임의 바이트 경계에서 끊고, 남은 조각이 채팅·preview·DB에 서로 다른 경로로 들어간다.

이전 패치가 “이번에 본 조각”만 막으면, 다음 조각(`family=…wght@…`, 온전한 `<link>`를 orphan `rel=`가 먼저 깨는 순서, host+path void 없음)이 새로 드러난다. 그래서 **패턴 목록 확장만으로는 끝없이 구멍이 난다.**

막는 원칙:

1. **SSOT 한곳** (`packages/contracts` prose sanitize + preview leak patterns)에서 chat/preview/daemon/FE가 같은 규칙을 쓴다.
2. **적대적 corpus 테스트**에 truncation 형태를 누적한다. 새 사례가 보이면 코드보다 먼저 corpus에 넣고 빨갛게 만든 뒤 고친다.
3. **레이어 방어**: streaming hold → scrub → turn-end rewrite → FE persist sanitize → preview stable gate. 한 레이어가 놓쳐도 다음이 막는다.
4. **순서 불변식**: full `<link|script|meta>` 제거가 orphan attr/void scrub **보다 먼저**. orphan `rel=`는 BOL/newline/`>` 뒤에서만 매칭.

## 표시 정책

- 내부 tool/thinking/pseudo-tool/deck navigation tail은 사용자 prose에서 제거한다.
- 닫힌 `<system-reminder>`는 제거하지 않고 prompt-injection chip으로 넘긴다.
- HTML preview는 마지막 stable frame을 유지하고, 구조적으로 불완전하면 채택하지 않는다.
- CDN/viewport 잔해는 chat과 preview가 동일 패턴으로 scrub한다.
- same-line trailing host는 hold/scrub, mid-sentence 언급은 유지한다.
- streaming 중 **닫힌·열린** `<artifact>` 본문의 stylesheet는 live panel을 위해 보존하고, artifact **밖** prose의 CDN `<link|script>`는 제거한다.
- daemon `design.runs.finish` wrapper에서 turn-end rewrite로 append-only 잔여를 회수한다.

## 2026-07-20 적용 요약

- system-reminder, hyphenated delimiter, FileViewer structural gate
- Antigravity / MiniMax / Claude stream guards
- CDN host/stem hold, bare host, same-line trailing scrub
- orphan `rel=`가 intact `<link>`를 깨지 않도록 가드 + full-tag-first 순서
- `family=` / `css2?family=` (+ optional display=swap) / `href=` CDN orphan scrub
- preview bare-host 목록을 chat과 정렬 (bunny/fontshare/typekit/fontawesome/esm)
- streaming open `<style|script>` hold + `@import`/`url()` font scrub
- Strict Mode double-append 방지, finish-path rewrite

## 적대적 corpus (최소 세트 — 테스트에 고정)

| 입력 형태 | 기대 |
|---|---|
| `googleapis.com" />` | chat scrub + preview unstable |
| `fonts.googleapis.com` (줄 단독 / same-line trailing) | hold/scrub; mid-sentence 유지 |
| `family=Inter" />` / `family=Inter:wght@400" />` (display=swap 없음) | scrub |
| `family=…&display=swap" />` / `css2?family=…@…` | scrub |
| `href="https://fonts…css2" />` (rel 없음) | scrub |
| `fonts.googleapis.com/css2?family=Inter` (void 없음) | chat scrub + preview unstable |
| `fonts.bunny.net` / `esm.sh/foo` / fontshare/typekit bare | preview unstable (= chat) |
| `Before <link rel="stylesheet" href="https://fonts…"> After` | `<link` 잔해 없이 제거 |
| streaming prose `<script src="https://cdn.jsdelivr…">` | artifact 밖에서 제거 |
| open `<style>` / `<script>` body mid-stream | hold until close |
| `@import url('https://fonts…')` / bare `url('https://fonts…')` | chat scrub |
| closed `<style>` / `<title>` / `<html><body>` in prose | 제거 |
| open/closed `<artifact>` 내부 stylesheet | streaming 보존 |

## 검증

- `pnpm --filter @open-design/contracts exec vitest run`
- `pnpm --filter @open-design/daemon exec vitest run tests/think-tag-splitter tests/strip-leaked-pseudo-tool-xml tests/claude-stream tests/chat-routes tests/role-marker`
- `pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/components/buffered-text-pending.test.tsx tests/project-view-message-merge.test.ts tests/internal-agent-markup.test.ts tests/providers/sse.test.ts tests/file-viewer-streaming-preview.test.ts tests/components/prompt-injection-chip.test.tsx tests/components/ChatPane.streaming.test.tsx`

## 다음

1. 새 누수 스크린샷/로그가 오면 **먼저 corpus 테스트 추가** 후 SSOT 수정.
2. BYOK는 FE persist sanitize에 의존 — SSOT 회귀가 곧 BYOK 회귀다.

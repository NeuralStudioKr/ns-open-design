# Chat Markup Sanitizer / Preview Guard

**판단 시점:** 2026-07-20 현재.

## 2026-08-21 추가: deck CSS/HTML debris line heuristic

- 사용자 재진입/완료 후 채팅 bubble에 `.tag.inv{…}`, `.chip.on{…}`, `#2D2D2D">Internal Team</span>`, `#1E1E1E;display:flex;…` 같은 템플릿 CSS/HTML 조각이 남는 경로를 보강했다.
- contracts SSOT에 `stripLeakedDeckCodeDebrisBlocksRespectingArtifacts`를 추가해 artifact 내부는 보존하고, artifact 밖 CSS/HTML debris line만 제거한다.
- named regex로 특정 템플릿 조각을 하나씩 막지 않고, line-level heuristic으로 compound utility class, custom prop, hex continuation, orphan close tag, deck-ish HTML chrome을 처리한다.
- 단, `# 다음 단계`, `- 차트 추가`, CSS 조각 앞뒤의 한국어 일반 prose는 유지한다. 기존 “숨김 우선” 때문에 자연어까지 사라지는 회귀를 막기 위한 정책이다.
- web bundle은 `@open-design/contracts` dist가 stale일 수 있어 `internalAgentMarkup.ts`에 동일 목적의 display-only fallback을 둔다.
- web fallback도 multi-line CSS continuation 상태를 유지한다. 예: `.tag.inv{color:` 다음 줄의 `#1c1c1c}`이 contracts dist stale 상황에서도 남지 않아야 한다.
- 회귀 테스트:
  - `packages/contracts/tests/deck-code-debris-heuristic.test.ts`
  - `packages/contracts/tests/chat-leak-probe*.test.ts`
  - `packages/contracts/tests/agent-prose-sanitize.test.ts`
  - `apps/web/tests/internal-agent-markup.test.ts`

## 2026-07-28 추가: Run Error 카드 위치 정책

- persisted assistant `events[].label === "error"`에서 만든 run error diagnostic 카드는 **채팅 맨 아래 전역 슬롯이 아니라, 해당 실패 assistant 메시지 바로 아래**에 표시한다.
- 목적: 댓글 수정 실패, incomplete output, merge guard 실패처럼 과거 턴에서 발생한 오류가 후속 대화나 재진입 뒤에 “현재 최신 오류”처럼 보이지 않게 한다.
- live/global `error` 상태는 여전히 ChatPane 하단 전역 카드로 표시할 수 있지만, 저장된 run 실패 이벤트는 메시지 ID에 귀속한다.
- `AssistantMessage`의 기존 per-message error pill은 같은 assistant 메시지에 diagnostic 카드가 붙을 때만 suppress하여 중복 표시를 막는다.
- 회귀 테스트: `apps/web/tests/components/ChatPane.streaming.test.tsx`의 persisted failed-run error 위치 테스트.

## 2026-07-30 추가: 재진입 시 에러 카드 소실 방지

- 채팅에 보이는 에러는 ephemeral `setError`만으로 끝내지 말고 `attachPersistedChatError` / `surfaceChatVisibleError`로 assistant `events` + `runStatus: failed`에 저장한다.
- daemon message upsert는 keepalive 등이 `events`를 생략해도 기존 `events_json`을 지우지 않는다 (`mergeOptionalMessageArrayField` + `COALESCE`).
- `mergeServerMessageWithLocal`은 서버 row에 status:error가 없을 때 로컬 에러 이벤트를 유지한다.

## 2026-07-31 추가: 에러 패널 문구 일관성

- ChatPane tail 카드는 persisted `events[].detail`을 ephemeral `error`보다 우선한다 (재진입 후 문구 변경 방지).
- `errorCardOwnerId`인 assistant의 StatusPill(error)은 embed에서도 suppress — diagnostic 카드가 SSOT.
- durable `appendErrorStatusEvent`는 이전 status:error를 교체해 한 턴에 하나의 사용자 문구만 남긴다.

## 2026-07-30 추가: stale streaming PUT이 status:error를 덮어쓰지 않게

- **원인:** `surfaceChatVisibleError`가 React `messages`에 error를 붙인 뒤, 스트림 스케줄러의 `latestAssistantMsg` 버퍼(에러 미포함)가 곧이어 non-empty `events` PUT을 보내면 daemon이 배열을 통째로 교체해 에러 카드가 삭제됨. soft refresh는 로컬 merge로 버티지만 **hard re-entry**는 서버 row만 보므로 카드가 사라짐.
- **daemon:** `mergeMessageEvents`가 기존 durable `status:error`를 incoming에 없으면 뒤에 보존하고, 그 경우 `runStatus`를 `failed`로 유지.
- **web:** `liveAssistantMutatorRef`로 스트리밍 버퍼에도 동일 `attachPersistedChatError`를 적용.
- 회귀: `apps/daemon/tests/db-message-events.test.ts` (`keeps status:error when a later non-empty events upsert omits it`).

## 2026-07-30 추가: Postgres HA에서 cache-miss upsert가 에러를 지우지 않게

- **원인 (PR #39 이후 잔존):** SQLite upsert는 DB row를 읽어 `mergeMessageUpsertPayload`를 적용하지만, Postgres 경로는 **in-process cache**만 보고 merge한 뒤 `events_json`을 그대로 덮어씀. cache cold/stale·멀티 인스턴스에서 이후 PUT이 durable `status:error` 없는 버퍼를 쓰면 PG row의 에러 카드가 삭제되고, 새로고침 시 인라인 오류·하단 「다시 시도」패널이 모두 사라짐.
- **수정:** `message-upsert-merge.ts`로 merge SSOT 추출. Postgres `schedulePostgresWrite`에서 `pgGetMessage`로 durable row를 읽은 뒤 **incoming 클라이언트 payload**와 merge하여 기록하고, 결과를 cache에 재동기화.
- 회귀: `apps/daemon/tests/message-upsert-merge.test.ts`.

## 왜 검토할 때마다 구멍이 보였는가

에이전트 truncation은 **적대적 분포**다. “이번에 본 조각”만 regex로 막으면 다음 조각이 새로 드러난다.

더 치명적이었던 구조 문제는 **CDN host 목록이 6~8곳에 복제**되어 드리프트한 것이었다. 호스트를 한곳에만 추가하면 다른 레이어가 열려 “또 구멍”처럼 보였다.

## 재발 방지 원칙 (강제)

1. **진입 함수 SSOT**: `sanitizeAssistantProseForDisplay` / `createStreamingAssistantProseGuard` (chat·daemon·FE 공유).
2. **호스트 SSOT**: `packages/contracts/src/html/artifactCdnHosts.ts`의 `ARTIFACT_CDN_HOSTS` — **새 CDN은 여기만 추가**. alternation/stem/heuristic는 배열에서 **생성**된다.
3. **script-src 부분집합**: `ARTIFACT_CDN_SCRIPT_SRC_HOSTS` ⊆ `ARTIFACT_CDN_HOSTS` (불변식 테스트로 고정). orphan `<script src=…>` tail 탐지가 이 목록을 쓴다.
4. **불변식 테스트**: `tests/artifact-cdn-host-invariants.test.ts`
   - stem ⊆ host
   - chat scrub ↔ preview bare-host 동등
   - derived alternation이 모든 host를 포함 (하드코딩 병렬 목록 금지)
   - `SCRIPT_SRC` ⊆ `ARTIFACT_CDN_HOSTS`
   - full-tag-before-orphan (`<link` 잔해 없음)
5. **적대 corpus**: 새 누수 스크린샷이 오면 **먼저 테스트 추가** 후 SSOT 수정.
6. **레이어 방어**: streaming hold → scrub → turn-end rewrite → FE persist → preview stable gate → FileViewer accept/sticky last-stable.

## 표시 정책

- 내부 tool/thinking/pseudo-tool/deck navigation tail은 사용자 prose에서 제거한다.
- 닫힌 `<system-reminder>`는 prompt-injection chip으로 넘긴다.
- CDN/viewport 잔해는 chat과 preview가 **동일 호스트 SSOT**로 scrub/reject한다.
- same-line trailing host는 **streaming hold**만 적용한다. history에서는 bare FQDN 조언(`Docs at fonts.googleapis.com`)을 유지하고, path/query가 붙은 truncate 잔해만 scrub한다.
- bare stem(`jsdelivr`, `unpkg`)은 ordinary word로 취급 — same-line cut 대상이 **아니다**.
- bare host 전용 줄·void orphan·full head tag는 history에서도 scrub한다.
- path-less void (`cdn.jsdelivr.net" />`)도 orphan alternation에서 잡는다 (`(?:\/…)?`).
- void 종료는 `ARTIFACT_CDN_ORPHAN_VOID_ENDING` — `/>` 또는 quoted `">`/`"/>`만. bare `host>` 자문 문구는 scrub하지 않는다.
- full head tag scrub는 orphan attr 패턴 **앞**에서 실행한다 (`<link` 잔해 방지).
- streaming 중 열린/닫힌 `<artifact>` 본문 stylesheet는 live panel용으로 보존하고, artifact 밖 prose의 CDN `<link|script>` / `@import` / open `<style|script>`는 제거·hold한다.
- **Stop/취소·history**: open `<artifact>` tail의 `.slide {…}` / deck CSS는 chat prose로 승격하지 않는다 (`isLikelyInternalMarkupLine` + `stripTrailingDeckFrameworkCssLeak`). artifact 없이 prose 뒤에 붙은 deck CSS는 streaming에서도 chat에서 제거한다(열린 artifact 본문은 유지).
- daemon `design.runs.finish` wrapper에서 turn-end rewrite로 append-only 잔여를 회수한다.
- BYOK는 streaming guard + FE persist sanitize에 의존 (SSOT 회귀 = BYOK 회귀). daemon turn-end rewrite는 BYOK에 없다(의도).

## Preview (HtmlViewer / FileWorkspace) 정책

- `acceptPreviewHtmlCandidate`: `repair` → `isArtifactHtmlStableForPreview`만 채택. unstable이면 last-stable만 반환 (느슨한 `</body></html>`+leak-only fallback **금지**).
- Tag-balance는 HTML/CSS 주석을 strip한 뒤 계산한다. skeleton CSS 주석의 문자 그대로 `<style>` 가 open-count에 잡히면 complete deck이 영구 loading에 고정된다.
- Compact modern deck-nav IIFE (`const/let slides=document.querySelectorAll('.slide')` + ArrowRight/touch/wheel)도 chat scrub SSOT에 포함한다 — classic `var`+`deck-stage`만 보면 완료 후 채팅에 JS가 남는다.
- `end_turn` mid-`<script>` 잘림: chat scrub은 bare `document.addEventListener('keydown', e=>` / `ArrowDown` / `touchstart|touchend|wheel` / same-line glue / arrow IIFE / `window.onkeydown` / orphan `function go` 조각도 잘라낸다. preview는 `repairArtifactDocumentHead` → `stripTrailingUnclosedRawBlocks`가 (1) raw block이 `<body>`/slide 앞에서 잘리면 closer를 삽입하고 (2) trailing 미닫힘 `<script|style>`를 루프로 제거하며 salvage `</body></html>`는 보존한다.
- salvage(`salvageTruncatedHtmlDocument` / body-first normalize)도 closer 붙이기 전에 동일 strip을 적용해 disk에 unstable HTML이 쓰지 않게 한다.
- `acceptPreviewHtmlCandidate`는 repair 결과가 slide-less shell이면 last-stable을 유지한다(슬라이드 파괴 빈 프레임 pin 금지).
- compact nav가 `<script>` 없이 body text로 새면 `hasArtifactPreviewBodyTextLeaks`가 reject하고 repair strip이 제거한다.
- **liveHtml apply와 disk fetch는 effect를 분리**한다. live 토큰 매 청크가 disk debounce를 cancel하면 sticky `"loading…"`가 난다.
- disk debounce `HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS` (200) ≤ ProjectView file-changed coalesce `maxWait` (250).
- hung GET 방지: `HTML_PREVIEW_SOURCE_WALL_MS` (30s). wall은 empty 소스에서 arm; soft-retry/late incomplete 후 **재arm** 가능.
- incomplete disk / transient null fetch는 **즉시 unavailable로 올리지 않는다** (veil/loading 유지; wall만 승격). null·incomplete 모두 abort 무시 + soft-retry 1회 후 wall에 맡긴다. fetch 시도 시작 시 sticky `sourceLoadFailed`를 해제한다.
- stream 중 `liveHtmlPaintsPreview`면 disk skip 가능. **stream 종료 후에는 paints여도 disk fetch 허용** (turn-end scrub 최종본 반영).
- stream-end에 `liveHtml`을 끊지 않는다 — `artifactHtml`이 있는 한 유지 (`streaming && artifactHtml` 절단은 turn-end scrub race로 오판).
- empty unavailable 문구는 **`sourceLoadFailed`만** (embed prefix null을 unavailable로 강제하지 않음 — prefix 실패 시 srcDoc fallback, [44](./44_preview_scope_fallback_안정화.md)).
- FileWorkspace pending tab: streaming이 끝나지 않아도 12s grace 후 ghost resolve/retarget. **pending UI는 loading만** (previewUnavailable 플래시 금지). **탭/stream 변경 시 grace를 반드시 false로 재arm**한다.
- artifact identity 전환 시 live effect가 `source` / paints / wall을 즉시 비운다 (이전 탭 HTML 잔상 방지).

## href token 참고

`artifactCdnHrefTokenAlternation()`은 host별 특수 토큰 + 미지 host fallback(라벨 2개)이다. “완전 기계 파생”이 아니라 **새 host는 fallback으로 커버**된다. 불변식은 알려진 token 목록을 잠근다.

## 검증

```bash
pnpm --filter @open-design/contracts exec vitest run \
  tests/artifact-cdn-host-invariants.test.ts \
  tests/agent-prose-sanitize.test.ts \
  tests/is-artifact-html-stable-for-preview.test.ts \
  tests/artifact-preview-text-leaks.test.ts

pnpm --dir apps/web exec vitest run -c vitest.config.ts \
  tests/file-viewer-streaming-preview.test.ts \
  tests/file-workspace-preview-bootstrap.test.ts \
  tests/teamver/teamverProjectPreviewScope.test.ts
```

## 호스트 추가 체크리스트

1. `ARTIFACT_CDN_HOSTS`에만 FQDN 추가 (stem은 파생 — 수동 `ARTIFACT_CDN_HOST_STEMS` 편집 금지)
2. `<script src>` CDN이면 `ARTIFACT_CDN_SCRIPT_SRC_HOSTS`에도 추가 (⊆ 불변식)
3. `artifact-cdn-host-invariants` 그린 확인
4. 새 truncation 형태가 있으면 corpus 테스트에 사례 1개 추가
5. call site에 FQDN을 다시 적지 말 것

## 커밋 위생 (필수)

- **이 스레드에 넣을 것**: contracts sanitizer/preview SSOT·테스트, `FileViewer`/`FileWorkspace`/`ProjectView` sticky·debounce·wall, `teamverProjectPreviewScope` signal/timeout, 본 문서(`42_…`), 필요 시 `00_구현_내역_누적.md`.
- **넣지 말 것**: PluginsHome / i18n, HA 세션쿠키(`39_10_…`), embed auth/BFF sticky WIP(`teamverDaemonHeaders` 등), `.env`·credentials, probe junk.
- probe/실험으로 생긴 빈·깨진 untracked 파일은 **즉시 삭제**.
- `sanitizeLeakedAgentProse` 단독은 CDN scrub를 하지 않는다.
- SSOT 밖 CDN은 의도적으로 미차단이다.

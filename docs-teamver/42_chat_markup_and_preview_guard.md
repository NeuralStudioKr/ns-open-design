# Chat Markup Sanitizer / Preview Guard

**판단 시점:** 2026-07-20 현재.

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
- full head tag scrub는 orphan attr 패턴 **앞**에서 실행한다 (`<link` 잔해 방지).
- streaming 중 열린/닫힌 `<artifact>` 본문 stylesheet는 live panel용으로 보존하고, artifact 밖 prose의 CDN `<link|script>` / `@import` / open `<style|script>`는 제거·hold한다.
- daemon `design.runs.finish` wrapper에서 turn-end rewrite로 append-only 잔여를 회수한다.
- BYOK는 streaming guard + FE persist sanitize에 의존 (SSOT 회귀 = BYOK 회귀). daemon turn-end rewrite는 BYOK에 없다(의도).

## Preview (HtmlViewer / FileWorkspace) 정책

- `acceptPreviewHtmlCandidate`: `repair` → `isArtifactHtmlStableForPreview`만 채택. unstable이면 last-stable만 반환 (느슨한 `</body></html>`+leak-only fallback **금지**).
- **liveHtml apply와 disk fetch는 effect를 분리**한다. live 토큰 매 청크가 disk debounce를 cancel하면 sticky `"loading…"`가 난다.
- disk debounce `HTML_PREVIEW_DISK_FETCH_DEBOUNCE_MS` (200) ≤ ProjectView file-changed coalesce `maxWait` (250).
- hung GET 방지: `HTML_PREVIEW_SOURCE_WALL_MS` (12s). wall은 **artifact identity당 1회** arm — `filesRefreshKey`/mtime churn에 리셋하지 않는다.
- incomplete disk HTML + no stable frame → unavailable (streaming이어도 loading에 고정하지 않음).
- embed `resolveTeamverProjectPreviewPrefix(..., { signal })` — 8s fetch timeout + caller abort는 shared inflight를 취소하지 않고 null race.
- empty unavailable 문구는 url-load embed prefix 실패에만 추가 게이트 (`useUrlLoadPreview && embedPreviewPrefixResolved && embed && prefix == null`).
- FileWorkspace pending tab: streaming이 끝나지 않아도 12s grace 후 unavailable/retarget (무한 loading 방지).

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

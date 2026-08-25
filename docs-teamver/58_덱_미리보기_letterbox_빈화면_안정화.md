# 덱 미리보기 letterbox / 빈 화면 안정화

**상태:** 2026-08-10 재발 근본 수정  
**관련:** [00](./00_구현_내역_누적.md) · [44 preview scope](./44_preview_scope_fallback_안정화.md) · [47 body-first compact](./47_body-first_compact_deck_아키텍처_검토_및_0716이후_변경판단.md) · [41 authenticated srcDoc](./41_authenticated_html_preview_srcdoc.md)

---

## 0. TL;DR

| 항목 | 내용 |
|------|------|
| **증상** | Preview가 검정/`로딩`이고 슬라이드 카운터만 동작하거나 비어 있음. **툴바 새로고침 후 복구** |
| **재현** | (1) 프로젝트 재진입 (2) prefix 캐시 miss + deck srcDoc (3) auth recovery 후 |
| **근본** | Teamver deck은 항상 **srcDoc** 경로. prefix settle 동안 `srcDoc=''`로 마운트된 iframe에 나중에 HTML을 **in-place attribute 갱신**하면 compact/framework deck의 `od:deck-host-viewport` handshake가 끊김 |
| **금지** | hold→paint를 같은 iframe 노드에서 srcDoc 속성만 바꾸기 · `settled=true` + `prefix=null` fail-open(영구 빈 화면) · refresh가 remint 없이 reloadKey만 bump |

---

## 1. 증상 판별

- 카운터/툴바는 살아 있고 **캔버스만 검정** → letterbox / host-viewport fit 실패 (이 문서 범위)
- source는 있는데 prefix hold 중 → `artifact-preview-prefix-settle-veil` 로딩 (정상 대기)
- 카운터도 없고 “미리보기 불가” → source fetch / auth / S3 (별 경로)
- 썸네일·카드 cover만 깨짐 → [32](./32_프로젝트_썸네일_커버_로딩_개선.md) / cover isolate 경로

---

## 2. 원인 맵

### 2.1 진입 (prefix settle) — 재발 핵심

1. Teamver embed의 `embedPreviewPrefix`는 `/preview-url` 비동기
2. Deck은 `shouldUrlLoadHtmlPreview`에서 **항상 srcDoc** (`isDeck → false`)
3. prefix 전 `srcDoc=''`로 iframe 마운트 → prefix 도착 후 **같은 DOM 노드**에 srcDoc 문자열만 갱신
4. 예전 코드는 “첫 settle remount skip” + mount key가 `srcDocTransportResetKey`만이라 **hold→paint remount가 없음**
5. compact deck fit이 빈 문서(또는 불완전 boot) 기준으로 멈추고 **툴바 새로고침(강제 remount) 전까지 검정**

### 2.2 fail-open 데드락

- `settled=true` + `prefix=null` 로 “fail-open”해도 srcDoc 가드는 여전히 `!prefix → ''`
- → **영구 빈 화면**. 백그라운드 remint / refresh remint 없이는 회복 불가

### 2.3 사용 중 (filesRefresh / source churn)

1. `filesRefreshKey`마다 last-stable clear + iframe 즉시 remount → fit 중단 (이미 금지)
2. `previewSource` 순간 null → sticky fit 유지 필요
3. auth recovery nonce → invalidate + remint (의도)

---

## 3. 수정 SSOT (코드)

| 영역 | 파일 | 요지 |
|------|------|------|
| **mount key** | `file-viewer-render-mode.ts` `resolveSrcDocPreviewMountKey` | embed에서 settled prefix를 key에 포함 → hold→paint = **새 iframe 마운트** |
| iframe | `FileViewer.tsx` | `key={srcDocPreviewMountKey}` |
| prefix mint | `FileViewer.tsx` | 빠른 retry 후 **unsettled 유지** + `scheduleBackgroundRemint` (영구 null settle 금지) |
| refresh | `FileViewer.tsx` `reloadHtmlPreview` | invalidate prefix + `embedAuthRecoveryNonce` remint |
| UX | `FileViewer.tsx` | source 있는데 prefix hold 중 → loading veil (`artifact-preview-prefix-settle-veil`) |
| fit recovery | `FileViewer.tsx` / `deckPreviewFit.ts` | untilSized · ResizeObserver · visibility/pageshow (기존 유지) |
| base href | `file-viewer-render-mode.ts` | `about:blank`를 srcDoc base로 쓰지 않음 |
| **early warm (2026-08-25)** | `teamverProjectPreviewScope.ts` · `App.tsx` · `warmEmbedProjectListCaches.ts` | create/deep-link/list에서 `/preview-url`을 FileViewer mount **전** fire-and-forget — hold 창 축소. **hold/fail-open 제거 금지 유지** |
| cold disk debounce | `FileViewer.tsx` | first paint(`source==null && !hasLiveHtml`) debounce **0**; refresh churn만 200ms |

### 2026-08-10 재발 차단 + 다회 검토 보강

1. **hold→paint remount를 React key로 강제** — in-place srcDoc 갱신 경로 제거 (`resolveSrcDocPreviewMountKey`)
2. **settled+null fail-open 제거** — soft background remint
3. **툴바 새로고침 = remint** — reloadKey만으로는 죽은 prefix 회복 불가였던 구멍 차단
4. **auth remint edge-trigger** — sticky `nonce > 0`가 탭 전환마다 invalidate하던 회귀 차단; passive bump coalesce; session `authenticated`(+forceEvent 재확인) remint so explicit 「다시 시도」도 복구
5. **invalidate + mint epoch** — in-flight mint/warm이 stale scope를 재-seed하지 못함
6. Present iframe mount key · streaming→idle remount · memory-only auth remint 정렬
7. 단위 테스트: mount key · awaiting helper · auth edge · inflight invalidate · source guards

---

## 4. 검증

```bash
cd apps/web && npx vitest run \
  tests/runtime/deck-preview-fit.test.ts \
  tests/components/FileViewer.embed-preview-prefix-retry.test.ts \
  tests/file-viewer-streaming-preview.test.ts \
  tests/components/file-viewer-render-mode.test.ts \
  tests/teamver/teamverProjectPreviewScope.test.ts
```

**Staging smoke**

1. prefix 캐시 cold인 deck 프로젝트 재진입 → 로딩 veil 후 **자동** 슬라이드 표시 (새로고침 불필요)
2. 채팅으로 소수정 후 `filesRefresh` → 검정 고착 없음
3. 사이드바 리사이즈 / 배율 100% ↔ 75% → letterbox 유지
4. preview-url 지연·401 후 세션 회복 → 백그라운드 remint로 자동 복구
5. 의도적 툴바 새로고침 → remint + remount 후 정상

---

## 5. 롤백 힌트

- mount key에서 prefix를 빼면 **즉시** hold→paint 재발
- `settled=true`+null fail-open을 되살리면 영구 빈 화면 재발
- untilSized “첫 성공 후 stop” 복원은 remount 레이스에 취약

---

## 6. 다음 추천

1. staging §4 smoke
2. [44](./44_preview_scope_fallback_안정화.md) preview-url 실패율 모니터링
3. memory-only preview(`FileWorkspace`)도 동일 mount-key 패턴 적용 여부 점검
4. ~~create/deep-link early preview-url warm + cold disk debounce 0~~ — **2026-08-25 반영** ([00](./00_구현_내역_누적.md))
5. ~~Daemon lazy S3 materialize(cold scratch) entry point-get fast path~~ — **2026-08-25 반영** ([16](./16_S3_데이터_저장_시점_SSOT.md) §6.1)

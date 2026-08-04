# 덱 미리보기 letterbox / 빈 화면 안정화

**상태:** 2026-08-04 staging 반영 준비  
**관련:** [00](./00_구현_내역_누적.md) · [44 preview scope](./44_preview_scope_fallback_안정화.md) · [47 body-first compact](./47_body-first_compact_deck_아키텍처_검토_및_0716이후_변경판단.md) · [41 authenticated srcDoc](./41_authenticated_html_preview_srcdoc.md)

---

## 0. TL;DR

| 항목 | 내용 |
|------|------|
| **증상** | Preview가 검정(`#0b0c10`)이고 슬라이드 카운터 `1/N`만 동작. 툴바 새로고침 후 복구 |
| **재현** | (1) 프로젝트 재진입 (2) 편집 중 `filesRefresh`/에이전트 쓰기 후 간헐 |
| **근본** | Compact stacked deck은 host `od:deck-host-viewport` 없이 fit하면 1920 letterbox 좌상단만 보임 |
| **금지** | prefix 도착 전 no-base paint → remount로 fit handshake 끊기 · refresh마다 last-stable clear+즉시 remount |

---

## 1. 증상 판별

- 카운터/툴바는 살아 있고 **캔버스만 검정** → letterbox / host-viewport fit 실패 (이 문서 범위)
- 카운터도 없고 “미리보기 불가” → source fetch / auth / S3 (별 경로)
- 썸네일·카드 cover만 깨짐 → [32](./32_프로젝트_썸네일_커버_로딩_개선.md) / cover isolate 경로

---

## 2. 원인 맵

### 2.1 진입 (prefix settle)

1. Teamver embed의 `embedPreviewPrefix`는 `/preview-url` 비동기
2. prefix 전 srcDoc에 `about:blank` base 또는 no-base로 paint하면 relative CSS/asset 깨짐
3. prefix 도착 후 **문자열만 갱신**하면 iframe이 빈 첫 paint에 남을 수 있음 → `97fc53ea4` remount
4. remount만으로는 부족: remount가 compact deck의 host-viewport handshake를 끊고, `untilSized`가 **첫 성공 post 후 중단**하면 교체 iframe이 letterbox로 고착

### 2.2 사용 중 (filesRefresh / source churn)

1. `filesRefreshKey`마다 last-stable clear + iframe 즉시 remount → fit 중단
2. `previewSource` 순간 null → `needsDeckHostViewportFit` false → listener 해제 → chase 요청 drop
3. sticky 없이 fit options가 non-layoutBox로 바뀌면 이미 마운트된 compact deck이 다시 깨질 수 있음

---

## 3. 수정 SSOT (코드)

| 영역 | 파일 | 요지 |
|------|------|------|
| prefix hold | `FileViewer.tsx` | `embedPreviewPrefixSettled` 전까지 srcDoc `''`; **1.5s fail-open paint**; fail-open/회전 시에만 remount |
| base href | `file-viewer-render-mode.ts` | `resolveHtmlPreviewSrcDocBaseHref` — `about:blank`를 srcDoc base로 쓰지 않음 |
| filesRefresh | `FileViewer.tsx` | cache invalidate + `reloadKey`만; **last-stable clear / 즉시 remount 금지** |
| sticky fit | `FileViewer.tsx` | `deckHostViewportFitActive` — source null에도 listener·**layoutBox options** 유지 |
| untilSized | `deckPreviewFit.ts` | delay 창 동안 매 tick post (remount 후 contentWindow 교체 대응) |
| recovery | `FileViewer.tsx` | host ResizeObserver + `od:stacked-deck-ready` 대기 slow loop (srcDoc 토큰마다 reset하지 않음) |

---

## 4. 검증

```bash
cd apps/web && npx vitest run \
  tests/runtime/deck-preview-fit.test.ts \
  tests/components/FileViewer.embed-preview-prefix-retry.test.ts \
  tests/file-viewer-streaming-preview.test.ts \
  tests/components/file-viewer-render-mode.test.ts
```

**Staging smoke**

1. 기존 deck 프로젝트 재진입 → Preview 즉시(또는 ≤1.5s) 슬라이드 표시, 새로고침 불필요
2. 채팅으로 소수정 후 `filesRefresh` → 검정으로 고착되지 않음
3. 사이드바 리사이즈 / 배율 100% ↔ 75% → letterbox 유지
4. preview-url 지연·실패 시에도 영구 빈 화면이 되지 않음 (fail-open)

---

## 5. 롤백 힌트

- prefix hold가 진입 지연을 키우면 `1_500` fail-open만 조정 (hold 자체 제거는 회귀 위험)
- filesRefresh remount를 되살리면 last-stable clear와 함께 **다시 넣지 말 것**
- untilSized “첫 성공 후 stop” 복원은 remount 레이스에 취약

---

## 6. 다음 추천

1. staging에서 §4 smoke 체크리스트 수행
2. [44](./44_preview_scope_fallback_안정화.md) preview-url 실패율 모니터링과 연계
3. Manual Edit / Comment 토글 직후 letterbox 잔존 시 recovery deps에 모드 플래그 추가 검토

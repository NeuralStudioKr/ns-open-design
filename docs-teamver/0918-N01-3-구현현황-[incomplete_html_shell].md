# 0918-N01-3 구현현황 · incomplete-html-document-shell persist pad/continue

상위설계: `docs-teamver/0918-N01-1-상위설계-[incomplete_html_shell].md`  
사용자 리포트: project `03aa413c-f41f-4d52-aa04-79a39360d6f2` · conversation `91c40a1c-2521-4d14-87a8-720d770f9c23` · `reason=skipped_incomplete_retry:incomplete-html-document-shell`.

## 상태

구현 완료. staging push 대상. ns-open-design 은 ns_cicd 미등록 — CICD 감시 없음.

## 판정 조건 (`classifyIncompleteHtmlDocumentShell`)

`<!doctype>` / `<!doctype html>` / `<html` 로 시작하는 본문만 본다.

| reason | 조건 |
|---|---|
| `too-short-document` | 문서 시작 + `<64`자 (빈 셸 26–39자) |
| `missing-html-close` | `≥128`자 + `</html>` 없음 |
| `head-only-no-body` | `<head>`/`<style>`만, `<body>` 없음 |
| `unclosed-style` | 미종료 `<style>` + salvageable slide 없음 |
| `empty-or-slot-body` | 닫힌 문서인데 SLOT/빈 섹션/가시 텍스트 0 |
| `null` | prose · 정상 10장 · persistable short draft |

## 복구 순서

persist `isIncompleteHtmlDocumentShell` 직후 **즉시 skip 금지**. `resolveIncompleteHtmlShellPersist`:

1. scoped → skip (재시도 없음)
2. 완전 collapse (`too-short-document`) → 쓰레기 미저장 · seed 있으면 keep-seed
3. create/full fill + seed + head-preamble continue 가능 → `needs-short-response-retry` / `retryKind: 'head-preamble'` · body-only · 배너 0
4. 그 다음 `persistPadShortDeckToSeed` / `recoverShortDeckByPaddingToSeed({ forcePad: true })` — **0장 head-only도 brief 기반 deterministic outline으로 seed를 채워 완전한 문서로 저장**
5. pad 실패일 때만 `skipped-incomplete` → `skipped_incomplete_retry` → `clone_look_seed_fallback`

## 이전 vs 지금

| 시나리오 | 이전 | 지금 |
|---|---|---|
| head-only × seed × continue 가능 | skip → seed fallback | **continue 1회** (배너 0) |
| continue 후 셸 불완전 / 장수 부족 | 상동 skip | **brief 기반 forcePad · section 수 = seed** |
| 빈/32자 collapse × seed | seed fallback | **상동**. 쓰레기 미저장 |
| 정상 10장 | 저장 | 저장 |
| scoped | skip | **재시도 없음** |
| pad 실패 | seed fallback | **그때만** seed fallback |

## 구현 체크

- [x] 판정 reason 문서화 · `classifyIncompleteHtmlDocumentShell`
- [x] persist가 pad/continue보다 먼저 skip하지 않음
- [x] head-preamble continue 1회 · body-only · 배너 0
- [x] 0장 head-only `forcePad` → seed 완전 문서 persist
- [x] 32자/빈 셸 `deck.html` 미기록
- [x] scoped 재시도 제외
- [x] 루프544–556 pad/healer/hangul/head 배너 0/Product Launch 미되돌림
- [x] secrets 없음

## 검증

- web `incompleteHtmlShellPersist` · `validate` reason pin · `headPreambleContinue` 0장 pad · `project-view-message-load` persist 순서 pin
- contracts `recoverShortDeckByPaddingToSeed` head-only forcePad / 32자 null

## 사용자 재현

project `03aa413c-f41f-4d52-aa04-79a39360d6f2` 에서 같은 LOOK fill을 다시 보낸다. persist가 `incomplete-html-document-shell` 로 바로 skip되면 회귀. continue 또는 pad 후 `deck.html` 은 완전한 문서여야 하고 section 수는 seed와 같다.

## 변경 이력

| 2026-09-18 11:10 | incomplete-html-document-shell persist를 continue/pad 후 skip으로 바꿈. |

# 0918-N01-1 상위설계 · incomplete-html-document-shell persist pad/continue

## 사용자 리포트

```
error_code: clone_look_seed_fallback
project_id: 03aa413c-f41f-4d52-aa04-79a39360d6f2
conversation_id: 91c40a1c-2521-4d14-87a8-720d770f9c23
reason=skipped_incomplete_retry:incomplete-html-document-shell
fillMode=prompt genericBrief=0 source=persist
```

"여전히 문제 발생한다."

루프549/554는 **장수 부족**(`produced only N slides`)에 pad를 붙였다. 이번 reason은 장수가 아니라 persist가 **불완전 HTML 셸**을 `skipped-incomplete`로 버리고 LOOK seed만 남긴 경로다.

## 판정 조건 (`isIncompleteHtmlDocumentShell`)

위치: `apps/web/src/artifacts/validate.ts`. `<!doctype html>` / `<html` 로 시작하는 본문만 본다. prose·32자 self-talk는 이 게이트가 아니라 `validateHtmlArtifact` MIN 64다.

| reason | 무엇을 불완전으로 보는가 |
|---|---|
| `too-short-document` | 문서 시작은 맞지만 `<64`자. 빈 `<html>…</html>` 셸(26–39자) 포함 |
| `missing-html-close` | `≥128`자인데 `</html>` 없음. mid-stream truncation |
| `head-only-no-body` | `<head>`/`<style>`만 있고 `<body>` 없음 |
| `unclosed-style` | `<body>` 안 미종료 `<style>` 키트. 스타일을 지우면 본문이 비어 보임 |
| `empty-or-slot-body` | 닫힌 문서인데 슬라이드가 SLOT/빈 섹션이거나 가시 텍스트 0 |

닫힌 1–3장 titled cover(`isPersistableShortDeckDraft`)는 셸이 아니다. 정상 10장 HTML도 아니다.

## 버그

persist는 셸 판정 직후 `kind: 'skipped-incomplete', reason: 'incomplete-html-document-shell'` 을 **pad/continue보다 먼저** return한다 (`ProjectView` persist ~6193).

그 다음 터미널이 `recoverCloneLookSeedFallback({ reason: skipped_incomplete_retry:incomplete-html-document-shell })` 로 seed만 남긴다. 루프554 `recoverShortDeckByPaddingToSeed({ forcePad: true })` 와 N25 head-preamble continue에 도달하지 못한다.

`recoverShortDeckByPaddingToSeed` 는 `producedCount <= 0` 이면 null이라, head-only(0장)는 pad 훅을 열어도 실패한다.

## 복구 순서 (32자 / slide-count와 맞춤)

create/full fill persist에서 셸이 불완전하면:

1. **scoped** image/comment — 재시도·pad 없음. 기존 skip.
2. **완전 collapse** (빈 / `<64` / 32자 쓰레기) — `deck.html`에 쓰지 않음. 기존 32자 경로: seed 있으면 유지 + `clone_look_seed_fallback`.
3. LOOK seed가 있고 **head-preamble continue가 아직 가능**하면 그걸 **1회**. 배너 없음 (루프555 `shouldEmitHeadPreambleBanner` 0회). 페이로드는 body-only (`buildHeadPreambleContinuePrompt`).
4. continue 후에도 셸이 불완전하거나 슬라이드가 seed보다 부족하면 `recoverShortDeckByPaddingToSeed({ forcePad: true })`. 0장이어도 seed 슬라이드를 붙여 **완전한 HTML 문서**만 저장.
5. pad도 실패하면 그때만 `clone_look_seed_fallback` + Retry.

`skipped_incomplete_retry` 가 pad보다 먼저 return하면 버그. persist 직전 pad/merge를 이 reason에도 강제한다.

## 시나리오 매트릭스

| 시나리오 | 이전 | 지금 |
|---|---|---|
| head-only (`<!doctype><html><head>…</head>`, body 없음) × LOOK seed × continue 가능 | skip → seed + `clone_look_seed_fallback` | **continue 1회** (배너 0). 그 다음 persist가 완전하면 저장 |
| 위 + continue 후에도 셸 불완전 / 장수 부족 | 상동 skip | **forcePad → section 수 = seed**. skip 아님 |
| 완전 collapse (빈/32자) × seed | seed 유지 fallback | **상동**. 쓰레기 미저장 |
| 정상 10장 HTML | 저장 | 저장 |
| scoped edit 불완전 셸 | skip / AC | **재시도 없음**. 기존 scoped |
| pad 실패 | seed fallback | **그때만** seed fallback |

## 테스트

- fixture: `<!doctype><html><head>…</head>` body 없음 → continue 또는 pad 후 section 수 = seed, `incomplete-html-document-shell` 로 skip되지 않음
- fixture: 완전 collapse (빈/32자) + seed → seed 유지 fallback (기존)
- fixture: 정상 10장 HTML → skip 없음
- 기존 10장 pad / 32자 / head continue 0배너 pin 유지

## 보존

루프544–556: pad, healer, hangul tracking, head 배너 0회, Product Launch 554. 되돌리지 않음. secrets 금지. ns-open-design 은 ns_cicd 미등록.

## 변경 이력

| 2026-09-18 10:54 | incomplete-html-document-shell 판정 문서화 + continue/pad를 skip보다 앞에 두는 상위설계. |

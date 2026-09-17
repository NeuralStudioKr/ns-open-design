# 0917-N25-1 상위설계 · HTML head preamble continue 1회 + persist 강제 pad

## 사용자 리포트

1. 배너가 **계속** 뜬다:

   > 생성이 HTML 머리글에서 멈춰, 슬라이드 본문부터 이어서 작성합니다.

   첫 턴이 `<head>`/`<style>`만 내고 body 슬라이드 없이 끊긴 뒤 continue가 반복되는 UX.

2. 후속 리포트 (같은 슬라이스에 포함):

```
error_code: artifact_short_response_persisted
project_id: cdbfcd14-71d5-4255-b42f-b7e16935f060
conversation_id: 02cfc9b3-8b70-46d0-bf07-40a330885a62
10 → 2 slides
terminalPersistResultKind=surface-chat-error
code=artifact_short_response_persisted
```

head에서 끊긴 뒤 continue가 돌아도 본문이 2장만 나오고, persist가 또 `10 → 2장 저장` 배너를 띄움. 루프552/554의 "10장 seed면 2장 단독 저장 금지 + 강제 pad"가 **이 경로에서는 사용자에게 안 먹힌 것처럼** 보인다.

## 정확한 코드 경로

배너 문구 SSOT: `apps/web/src/teamver/stalledRunDeckSalvage.ts` `formatStalledHeadPreambleNotice()`.

발화:

1. MiniMax 첫 턴이 `<artifact>` + `<!doctype>` + `<head>`/`<style>`에서 침묵.
2. `looksLikeHeadOpenedDeckPreamble` → api-proxy idle 60초 (`PROXY_STREAM_HEAD_PREAMBLE_IDLE_MS`).
3. stall `onError` → `stalledRunHeadPreambleText` → `stripAbandonedHeadPreambleFromStreamedText` → `formatStalledHeadPreambleNotice` + `scheduleStreamRunHtmlAutoOpen`.
4. persist가 incomplete-shell → `shouldAutoContinueForIncompleteOutput` (대화당 최대 5회) → `resolveAutoContinuePrompt` / `buildAutoContinueIncompleteOutputPrompt`.
5. continue 페이로드가 head CSS excerpt를 다시 넣거나, 모델이 style만 에코하면 같은 stall → **배너 재발화**.
6. continue가 2장만 내면 persist의 `shouldAutoRetryShortSlideResponse`가 먼저 재시도를 태우거나, pad 성공 후에도 `formatProjectArtifactShortResponsePersistedNotice(file, 10, 2)`가 **저장 장수를 2로 읽히게** 한다.

## 왜 반복됐는지

- 루프540은 head stub을 60초 후 자동 이어쓰기로 넘긴다. 상한은 `AUTO_CONTINUE_MAX_PER_CONVERSATION = 5`.
- `excerptPartialHtmlForAutoContinue`는 `<body>`가 없으면 **head 전체를 excerpt**로 되돌린다. 두 번째 요청이 CSS를 다시 받고 head에서 또 끊긴다.
- stall `onError`는 continue 횟수와 무관하게 같은 머리글 배너를 붙인다.

## 왜 552 pad가 이 리포트에 안 먹었는지

루프554 persist는 `recoverShortDeckByPaddingToSeed`를 이미 넣었지만:

1. **continue 직후 persist**는 `shouldAutoRetryShortSlideResponse`(alreadyRetried=false)가 pad보다 먼저 발동할 수 있다. continue는 short-response retry 카운터가 아니므로 10→2면 또 한 번 모델 재호출을 태우고, 그 사이 사용자는 2장 초안만 본다.
2. pad가 실제로 10장을 만들어도 배너가 `priorCount=10, newCount=producedCount=2`라 **"2장 저장"**으로 읽힌다 (`artifact_short_response_persisted`).
3. last-resort pad 호출부에 `forcePad: true`가 명시되지 않아, continue 경로 회귀 테스트가 "반드시 호출"을 pin하지 못한다.

## 수정

### 1. 첫 턴 head-only 줄이기

seed/compact 상단에 짧은 한 줄만:

`Emit slides immediately; do not stop after </head>.`

장문 penalty framing 금지. 루프544–552 KEEP_SLIDE_COUNT / unique-slot / LOOK seed / compact CSS는 유지하되 중복 CSS를 다시 키우지 않는다.

### 2. head-preamble continue는 한 run에 1회

같은 사용자 요청에서 head-preamble continue는 **1회**. 두 번째도 body가 없으면 continue 금지 → LOOK seed 유지 또는 기존 pad/retry 경로.

사용자 배너(`formatStalledHeadPreambleNotice`)도 **1회만**. 반복 시 같은 문장을 다시 붙이지 않는다.

### 3. continue 페이로드

두 번째 요청에 head CSS를 풀로 넣지 않는다.

`</head> already emitted; output ONLY <body> slides starting with <section class="slide".`

`excerptPartialHtmlForAutoContinue`는 titled slide가 없으면 빈 문자열.

### 4. continue 이후 10→2면 persist 직전 강제 pad

head-preamble continue 턴(또는 그 직후 persist)에서 seed 대비 크게 부족하면(`10→2`) `shouldAutoRetryShortSlideResponse`를 **건너뛰고** persist 직전:

`recoverShortDeckByPaddingToSeed({ forcePad: true })`

pad 실패 시에만 LOOK seed 유지.

### 5. 배너

pad 성공 시 `10 → 2장 저장` 금지. pad 후 장수를 반영:

`AI가 이번 응답에서 10장 중 2장만 작성했습니다. 부족한 장은 초안으로 채워 10장으로 저장했습니다.`

## 테스트

- fixture: head+style만 (슬라이드 0) → continue 1회 트리거 pin
- fixture: continue 후에도 슬라이드 0 → 두 번째 continue 없음, seed/pad fallback pin
- fixture: head+2 slides → continue 아님 (이미 body 있음)
- 배너 문구가 한 run에 두 번 emit되지 않음 pin
- fixture: head-only → continue → 2 slides → persist 결과 section 수 = seed(10), pad marker 있음
- 기존 short-response / 32자 / 10장 pad 테스트 green

## 보존

루프544–552: pad 강제 10장, 32자 retry, Halo/Raw-Grid/BlockFrame healer, canvas CSS, jobId, KEEP_SLIDE_COUNT, unique-slot, LOOK seed. **되돌리지 않음.**

## 변경 이력

| 2026-09-17 11:00 | head-preamble continue 1회 + body-only 페이로드 + continue 후 10→2 강제 pad/배너 상위설계. |

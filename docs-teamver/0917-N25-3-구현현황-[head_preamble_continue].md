# 0917-N25-3 구현현황 · HTML head preamble continue 1회 + persist 강제 pad

## 상태

구현 완료. staging push 대상.

## 사용자 증상

- 배너 `생성이 HTML 머리글에서 멈춰, 슬라이드 본문부터 이어서 작성합니다.` 가 한 생성에서 반복.
- 후속: project `cdbfcd14-71d5-4255-b42f-b7e16935f060` · `artifact_short_response_persisted` · 10→2장 저장처럼 보임.

## 경로

1. `looksLikeHeadOpenedDeckPreamble` → stall 60s → `stalledRunHeadPreambleText`
2. `ProjectView` `onError` → `formatStalledHeadPreambleNotice` (`stalled_head_preamble`)
3. incomplete persist → auto-continue (기존 상한 5회) + head CSS excerpt 재주입
4. continue가 2장만 내면 persist가 short-response retry를 먼저 태우거나, pad 후에도 배너가 `10 → 2장`으로 읽힘

## 왜 552 pad가 이 리포트에 안 먹었는지

- continue 턴은 `autoRetryForShortResponse`가 아니라서 `shouldAutoRetryShortSlideResponse`가 pad보다 먼저 발동할 수 있음.
- pad가 10장을 만들어도 `formatProjectArtifactShortResponsePersistedNotice(file, 10, 2)`가 저장 장수를 2로 읽히게 함.
- last-resort `recoverShortDeckByPaddingToSeed` 호출에 `forcePad: true`가 없어 continue 경로 pin이 없었음.

## 구현

| 항목 | 반영 |
|---|---|
| 첫 턴 `Emit slides immediately; do not stop after </head>.` | ☑ compact/API/seed 상단 한 줄. 장문 penalty 없음 |
| head-preamble continue 1회 | ☑ `decideHeadPreambleRecovery` · 두 번째는 fallback |
| 배너 1회 | ☑ `shouldEmitHeadPreambleBanner` |
| continue 페이로드 body-only | ☑ `buildHeadPreambleContinuePrompt` · excerpt는 슬라이드 없으면 빈 문자열 |
| continue 후 10→2 강제 pad | ☑ retry skip + `recoverShortDeckByPaddingToSeed({ forcePad: true })` |
| pad 배너가 pad 후 장수 반영 | ☑ `부족한 장은 초안으로 채워 N장으로 저장` |
| 루프544–552 유지 | ☑ pad 10장 · 32자 retry · healer · canvas CSS · jobId |

## 검증

- web `headPreambleContinue` · `resume` · `project-view-message-load` · `stalledRunDeckSalvage` · `deck-html-content` · `short-response-auto-retry` green
- contracts `forcePad` / 10장 pad pin green
- 기존 32자 / short-response / 10장 pad 경로 유지

## 사용자 재현

같은 대화에서 head만 내고 끊기면 머리글 배너는 **한 번**. 이어서도 본문이 없으면 seed/pad. continue 후 2장만 오면 persist가 10장으로 pad하고 "초안으로 채움" 배너.

project `cdbfcd14-71d5-4255-b42f-b7e16935f060` 를 다시 돌리면 `10 → 2장 저장` 대신 pad 후 장수 배너.

## 변경 이력

| 2026-09-17 11:05 | head-preamble continue 1회, body-only 페이로드, continue 후 forcePad, pad 배너 장수 반영. |

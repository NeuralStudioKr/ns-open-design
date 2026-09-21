# 0917-N28-1 상위설계 · head 배너 재발 차단 + Block Frame 한글 손상

## 사용자 리포트 (같은 생성, 두 이슈)

### A — 배너가 또 뜸

> 생성이 HTML 머리글에서 멈춰, 슬라이드 본문부터 이어서 작성합니다.

루프 N25 (`e34f98b4de`) 가 continue를 1회로 제한하고 `shouldEmitHeadPreambleBanner` / `decideHeadPreambleRecovery` 를 넣었다. **staging HEAD에 함수는 있다.** 그런데도 사용자가 본다.

### B — 미리보기보다 품질이 훨씬 나쁨 (첨부 스크린샷)

킷: Block Frame / Neo-Brutalism.

- 「고객경험」: 제목 붙여쓰기. 01 `파일떴` · 02 `희대다` · 03 `정척적` — 한글이 깨지거나 잘림. 본문도 음절이 떨어진 것처럼 보임.
- 「근거와사례」: 제목 붙여쓰기. 카드 `실무자` / `리더` / `운영자` + 「반복 작업을 줄이고…」 — Product Launch leftover 역할이 Block Frame에 새어 들어감.

## A 왜 배너가 또 떴는지

1. **첫 continue 1회에도 배너를 켠다.** `shouldEmitHeadPreambleBanner(0) === true`. 사용자는 한 번만 봐도 "계속 발생"으로 느낀다.
2. **stall `onError`가 head를 strip한 뒤** `decideHeadPreambleRecovery(streamedText)` 는 `'none'`이 된다. 그다음 일반 `resolveAutoContinuePrompt` (상한 5회, sentinel 다름)가 돈다. `countHeadPreambleContinueAttempts` 는 `<!--od:head_preamble_continue-->` 만 세므로 **1회 가드가 idle / stalledRun / generic auto-continue에서 우회**된다.
3. 첫 턴이 또 head에서 멈추는 직접 원인: MiniMax stall 60s + 모델이 kit CSS를 `<head>`에 다시 씀. 프롬프트에 "Keep kit CSS variables by including the template look" 가 남아 풀 CSS 재주입을 유도한다.

## A 수정

- 같은 생성에서 이 한글 배너는 **0회**. `shouldEmitHeadPreambleBanner` 는 항상 false. 본문이 나온 뒤에도 재발 금지 (이미 titled slide면 head-preamble 아님).
- head-preamble **continue는 여전히 최대 1회**. generic `<!--od:auto_continue_incomplete_output-->` 도 같은 대화에서 head stall이 있었으면 1회로 친다. 두 번째는 fallback (seed/pad). persist `forcePad` 성공 저장은 유지.
- 첫 턴: `Emit slides immediately; do not stop after </head>.` 유지. **풀 kit CSS를 `<head>`에 다시 쓰지 말 것** — LOOK seed 토큰만. 장문 penalty framing 금지.
- pad/continue 강제 10장 성공 저장 동작은 손대지 않는다.

## B 한글 손상의 원인

| 증상 | 원인 |
|---|---|
| `고객경험` / `근거와사례` 붙여쓰기 | 공통 섹션 라벨 `고객 경험` / `근거와 사례` 에서 공백이 빠짐. healer가 복구하지 않음. |
| `실무자` / `리더` / `운영자` + 그 본문 | `templatesForSynthTemplateTopic('service-intro')` 공통 템플릿. Product Launch 역할이 Block Frame fill/pad/enrich에 그대로 들어감. |
| `파일떴` / `희대다` / `정척적` + 음절 사이 공백처럼 보임 | 실제 문자열은 synth `파일럿` / `확대` / `정착`. Block Frame CSS `letter-spacing: 0.08em` + `text-transform: uppercase` 가 한글을 시각적으로 깨뜨림 (Inter + overflow). 손상 토큰이 문자열로 남으면 맵으로 복구. |

루프554 정책(catalog leftover만 strip, 한국어 ≥20자면 템플릿 재작성 금지, seed 구조 유지)을 **Block Frame에도** 적용. Product Launch 역할 템플릿은 Block Frame에 금지.

## B 수정

- CSS 가드: `:lang(ko)` / `html[lang="ko"]` 에서 heading/label/step-title 의 letter-spacing·uppercase off. persist inject + example.html.
- `synthesizeTemplateCloneSlideBody(kitKey=block-frame)` 는 service-intro 역할 템플릿(실무자/리더/운영자, 파일럿/확대/정착) 미생성.
- `healBlockFrameLeftoverCatalogCopy`: leftover만 지움. `고객경험`→`고객 경험`. 역할 제목은 seed/topic. 한국어 ≥20 유지. 음절 단위 강제 공백 삽입 없음.
- Halo / Raw-Grid / Product Launch 루프554 healer 호출 순서 유지.

## 테스트

- 배너: `shouldEmitHeadPreambleBanner(*) === false`. generic auto-continue 가 head stall 다음이면 두 번째 continue 없음.
- fixture `loop555-block-frame-broken-ko.html` heal 후:
  - `고객경험` → `고객 경험` (또는 정상 띄어쓰기 제목)
  - `실무자`/`리더`/`운영자` 가 카드 제목으로 남지 않음
  - `파일떴`/`희대다`/`정척적` 없음
  - 한글 본문에 음절 단위 강제 공백 없음

## 보존

persist pad/continue 강제 10장 성공 저장. Halo/Raw-Grid healer. Product Launch 루프554. secrets 금지.

## 변경 이력

| 2026-09-17 17:25 | head 배너 0회 + Block Frame 한글/역할 템플릿 상위설계. |

# 0917-N28-3 구현현황 · head 배너 재발 차단 + Block Frame 한글 손상

## 상태

구현 완료. staging push 대상. ns-open-design 은 ns_cicd 미등록 — CICD 감시 없음.

## A — 왜 배너가 또 떴는지

`e34f98b4de` / N25 함수(`formatStalledHeadPreambleNotice` · `shouldEmitHeadPreambleBanner` · `decideHeadPreambleRecovery`) 는 staging HEAD에 있다. 그래도 사용자가 본 이유:

1. **첫 continue에도 배너가 켜짐.** `shouldEmitHeadPreambleBanner(0) === true`. 한 번만 봐도 "계속 발생"으로 읽힘.
2. **stall `onError`가 head를 strip** 하면 `looksLikeHeadOpenedDeckPreamble` 이 false → 일반 auto-continue (상한 5, sentinel 다름). `countHeadPreambleContinueAttempts` 는 head sentinel만 세서 **가드 우회**.
3. 첫 턴이 또 head에서 멈춤: 프롬프트 `Keep kit CSS variables by including the template look` 가 풀 CSS 재주입을 유도 + MiniMax 60s stall.

## A 구현

| 항목 | 반영 |
|---|---|
| 배너 0회 | ☑ `shouldEmitHeadPreambleBanner` 항상 false |
| strip/idle/generic continue 도 1회로 계산 | ☑ `looksLikeAbandonedHeadPreambleStub` · auto-continue sentinel |
| persist forcePad 10장 | ☑ 성공 저장 동작 유지. `runHeadPreambleContinueRef` 가 generic continue 도 인식 |
| 첫 턴 CSS | ☑ LOOK seed 토큰만. 풀 kit CSS `<head>` 재주입 문구 삭제 |

## B — 한글 손상의 원인

- **문자열:** `고객경험` / `근거와사례` 는 섹션 라벨 공백 누락. `실무자`/`리더`/`운영자` + 「반복 작업을 줄이고…」 는 공통 `service-intro` synth가 Block Frame에 새어 들어간 Product Launch leftover.
- **CSS:** `letter-spacing: 0.08em` + `text-transform: uppercase` 가 한글을 시각적으로 깨뜨림 (`파일떴`/`희대다`/`정척적` 은 synth `파일럿`/`확대`/`정착` + tracking). healer가 음절 사이 공백을 넣지는 않음.

## B 구현

| 항목 | 반영 |
|---|---|
| 한글 letter-spacing/uppercase off | ☑ persist inject + example.html `:lang(ko)` |
| Block Frame synth 역할 템플릿 금지 | ☑ `kitKey=block-frame-neo` 는 items 미생성 |
| leftover만 strip, 한국어 ≥20 유지 | ☑ `healBlockFrameLeftoverCatalogCopy` |
| 붙여쓰기 복구 | ☑ `고객경험`→`고객 경험`, `근거와사례`→`근거와 사례` |
| Halo / Raw-Grid / 루프554 | ☑ 호출 순서 유지 |

## 검증

- web `headPreambleContinue` — 배너 0회 · generic continue 1회 pin
- contracts fixture `loop555-block-frame-broken-ko.html` heal pin
- persist pad forcePad 경로 불변

## 재현

1. Block Frame × 한국어 브리프로 생성. 머리글에서 끊겨도 한글 배너는 안 뜸. continue는 한 번만 조용히.
2. 「고객 경험」 타임라인 / 「근거와 사례」 카드에 `실무자`/`파일떴` 이 없고 제목 띄어쓰기가 살아 있는지 확인.

## 변경 이력

| 2026-09-17 17:40 | N28 구현. 배너 0회, Block Frame leftover/한글 CSS, fixture pin. |

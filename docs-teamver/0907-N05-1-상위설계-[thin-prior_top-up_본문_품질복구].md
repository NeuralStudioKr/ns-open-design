# 0907-N05-1 상위설계 — thin-prior top-up 본문 품질 복구

**날짜:** 2026-09-07 · **루프:** 468  
**관련:** [0907-N02 LOOK+AI](./0907-N02-1-상위설계-[Clone_LOOK와_AI_본문_동시사용].md) · [0907-N04 letterbox](./0907-N04-1-상위설계-[Block_frame_Clone_letterbox_표지_사이즈].md) · [54-2](./54-2-구현현황-[MiniMax_품질루프].md)

## 1. 체감

Clone Block Frame 후 MiniMax가 돌았는데도:

1. `incomplete_output` + `thin-prior-top-up-no-append`
2. 표지는 제목만 / 셸만 남은 LOOK seed가 열림
3. 「예전보다 내용 구성이 약하다」

레이아웃(표지 크롭)은 루프465. **본 슬라이스는 본문 파이프라인 실패 UX·복구.**

## 2. 원인

| # | 원인 | 의도? |
|---|------|------|
| A | 장수 top-up은 **APPEND only**. MiniMax가 통짜 rewrite(동일 표지 제목·장수≤prior)하면 `appendIncomingSlidesOntoExistingDeck` → null | 반의도 |
| B | prior가 **thin LOOK seed**(제목+빈 셸 다수)면 null append → `skipped-incomplete` + hard fail 배너 | 버그성 |
| C | top-up 턴은 `runTemplateClonePromptFillRef=false`라 LOOK seed 복구 게이트가 안 탐 | 버그 |
| D | `thin-prior-top-up-no-append`가 LookSeed recoverable 목록에 없음 | 버그 |
| E | 빈 셸 다수를 `produced`로 세면 top-up 스케줄이 어긋나거나, 반대로 얇은 1장 뒤에 append를 강제함 | 구조 |

## 3. 정책 (루프468)

1. **thin prior + top-up miss + incoming이 prior보다 낫다** → append 실패해도 **교체 persist** (incomplete 금지).
2. **thin prior + incoming도 무용** → incomplete hard fail 대신 **LOOK seed 복구**(경고+Retry) 또는 **full rewrite AC** 1회.
3. **thin LOOK seed(빈 셸≥3)** 에 대해 append top-up을 돌리지 말고 **full rewrite(prompt-fill)** 를 1회 큐.
4. 영문 카탈로그 example / substance-rich prior의 calm `skipped-noop`은 유지.

## 4. 비범위

- web-fetch → outline 주입 (P2)
- deterministic→AI 하이브리드 UX (P3)
- hero max-width 키트 변경

## 5. 성공 기준

- thin LOOK + top-up rewrite incoming(실본문) → 저장·미리보기, incomplete 배너 없음
- thin LOOK + 무용 incoming → LOOK seed 복구 또는 rewrite AC, cut-off "이어서" 카피 없음
- 기존 substance-rich + append miss → 여전히 calm noop

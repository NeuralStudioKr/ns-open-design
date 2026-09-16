# 0916-N18-1 상위설계 · slide-count 순응 강화 (루프550)

## 배경

- 루프549에서 `skipped_incomplete_retry` 경로에 short-response pad를 통합해 사용자에게 저장은 나오도록 회복.
- 그러나 pad slide는 topic-aware synth 문장이라 real content 밀도가 낮음. **근본 원인 — MiniMax가 explicit 5-slide 요청에 1 slide만 반환** — 을 상류에서 줄여야 한다.
- 현재 `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` (루프546)이 emit되지만 정량 표현이 약하고 seed shell 개수가 explicit하지 않다:
  ```
  Deliver the same number of `<section class="slide">` slides as the seed. If two slots would repeat, rewrite one with a different angle — do not merge or drop slides.
  ```
- 모델은 "same number as the seed"만 보고 seed count를 스스로 세야 하고, "hard failure"라는 표현이 없어 순응이 흔들린다.

## 목표

MiniMax가 seed shell 개수와 정확히 일치하는 slide-count로 응답할 확률을 높여, pad 훅에 의존하지 않는 완성도 높은 결과물이 나오게 한다.

## 근본 해결 방향

### (A) 정량·강제 표현으로 프롬프트 재작성

새 렌더러 `renderSlideCountRequirementInstruction(seedShellCount: number | null)`을 `packages/contracts/src/prompts/deck-quality.ts`에 추가:

```
Return EXACTLY 5 <section class="slide"> elements — no more, no fewer.
The seed already contains 5 slide shells. If your outline runs short, copy
the missing shells verbatim from the seed HTML rather than dropping them.
Returning fewer than 5 is a hard failure, not an acceptable summary.
```

- `seedShellCount`가 null이면 (모드/컨텍스트에서 미확정) 기존 상수 `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` 사용 — 하위 호환.
- 정량 문구는 **seed 상단(첫 사용자 메시지)과 hard rules 양쪽**에 emit해서 모델이 세션 초입에도, tail 규칙에서도 반복 확인.

기존 `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION`은 그대로 유지 (backward-compat + 서브 시나리오 fallback).

### (B) seed shell 개수 전달

- `buildTemplateClonePromptFillSeed(options)`에 optional `seedShellCount?: number | null` 추가.
- 호출부(`ProjectView.tsx`) — 시드 HTML을 이미 얻고 있으므로 `listTemplateCloneSlideShells(seedHtml).length`로 계산해 전달.
- `templateCloneContentFillHardRules()`에도 optional 파라미터를 받아 hard rules에 render.

### (C) 자동 재시도 — 이번 슬라이스 스코프 외

- persist 시점에 `findTemplateCloneFillSlideCountIncomplete` 감지 후 클라이언트 chat run을 재발화하는 것은 스코프가 크고 위험. `runTemplateCloneSlotFillFallbackRef` 등 여러 상태 재세팅, chat message re-append, MiniMax API rate limit·비용 관리, 사용자 UX 등이 얽힘.
- 현재 recover 경로는 `recoverCloneLookSeedFallback` (in-run 복구 함수)이 있고, 루프549 pad recovery도 저장 회복 관점에서 auto-retry의 practical 대체다.
- 따라서 이번 슬라이스에선 **프롬프트 순응 강화만** 확정하고, 자동 재시도는 별도 슬라이스로 미룬다 (backlog에 명시).

### (D) pad 슬라이드 밀도 개선 — 이번 슬라이스 스코프 외

- pad slide에 kit-specific fill (`fillStudioKitSlide`)를 재적용하려면 pad 훅 전후 호출 순서 · idempotency · 각 kit별 side-effect를 검증해야 함. 위험 대비 이득이 불명확.
- 별도 슬라이스로 미룸.

## 시나리오 매트릭스

| 상황 | 이전 (루프549까지) | 새 동작 (루프550) |
|---|---|---|
| seed 5 shell · 요청 explicit 5 · MiniMax 5 slide 응답 | 저장 성공 · pad 미발동 | 상동 (프롬프트 강화로 확률↑) |
| seed 5 · 요청 5 · MiniMax 1 slide 응답 | pad로 5장 저장 + notice | 프롬프트 강화로 5장 순응률↑ · 여전히 짧으면 pad 경로 유지 |
| seed 5 · 요청 unspecified · MiniMax 3 slide | 저장 성공 (min≤4 → skip 안 발동) | 상동 |
| seed 5 · 요청 explicit 5 · MiniMax 0 slide | `skipped-incomplete` · LOOK seed 유지 | 상동 |
| Home create · seed 없음 (첫 create) | seed 개수 확정 못하면 기존 상수 fallback | 상동 |

## 프롬프트 emit 위치 매트릭스

| 위치 | 이전 | 새 |
|---|---|---|
| `buildTemplateClonePromptFillSeed` (prompt-fill user message body) | `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` 1회 | `renderSlideCountRequirementInstruction(seedShellCount)` 정량 문구 |
| `templateCloneContentFillHardRules` (JSON slot-fill hard rules) | `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` 1회 | 정량 문구 (seedShellCount 파라미터) |
| seed 상단(첫 사용자 메시지) | (미emit) | `Seed contains N slide shells. Your output must contain N slides.` 신규 라인 |

## 회귀 방지 테스트

1. `renderSlideCountRequirementInstruction(5)`가 `EXACTLY 5`, `seed has 5 slide shells`, `hard failure` 세 표현을 포함한다.
2. `renderSlideCountRequirementInstruction(null)`은 기존 상수 fallback을 반환한다.
3. `buildTemplateClonePromptFillSeed({..., seedShellCount: 5})`의 결과 문자열에 정량 문구가 포함된다.
4. `buildTemplateClonePromptFillSeed({..., seedShellCount: null})`은 기존 상수 fallback + 이전 pin 유지.
5. `templateCloneContentFillHardRules({ seedShellCount: 5 })` (신규 인터페이스)에 정량 문구가 포함된다.

## 비용·지연 영향

- 프롬프트에 라인 1~2개 추가 (~250 tokens) — MiniMax 비용/지연 영향 극소.
- 자동 재시도는 이 슬라이스에 없음 → API rate limit / 추가 비용 없음.

## 보존된 이전 개선

루프544~549의 kit-specific fill/heal, TOPIC_LOCK / KEEP_SLIDE_COUNT / UNIQUE_SLOT(soft), salt healer, jobId 타입 fix, `deck-fixed-canvas` CSS, `deck-patch` data-slide-index 추론, low-substance bypass, severity(warn/reject) 분리, pad 훅, block-frame Q\d+ scrub, retro-windows 로드맵 데모 잔재, LOOK seed cover 발명 방지, first-turn head preamble continue, 페이지 수 변화 후 미리보기 이동 매칭, incomplete-retry pad 통합 — 모두 유지.

## 남은 리스크 · 후속 슬라이스 backlog

- **자동 재시도 1회**: `runTemplateCloneShortResponseAutoRetryRef` 카운터로 in-run auto-retry. persist skip 감지 시 MiniMax 재호출 (스코프드 편집·byok 케이스 제외).
- **pad 밀도 개선**: pad slide에 kit-specific fill 재적용.
- **모델 실측 관측**: staging 로그로 실제 emit된 프롬프트 payload 확인해 순응률 측정.
- 프롬프트 강화가 모델에 잘 전달돼도 MiniMax가 여전히 무시할 수 있음 (LLM 순응은 확률적) — pad recovery(루프549)가 안전망.

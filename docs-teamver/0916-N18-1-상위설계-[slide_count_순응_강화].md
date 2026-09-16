# 0916-N18-1 상위설계 · slide-count 순응 강화 (루프550)

## 배경

- 루프549에서 `skipped_incomplete_retry` 경로에 short-response pad를 통합해 사용자에게 저장은 나오도록 회복.
- 그러나 사용자는 **10장이 2장(+얕은 pad)으로 줄어드는 것 자체**를 실패로 본다. pad는 마지막 안전망이지 완성 경로가 아니다.
- 사용자 리포트: `error_code: artifact_short_response_persisted` · project `031f42a2-50f8-4bdd-aa5f-67cc76548d7c` · conversation `6b5721e2-2fd3-4af6-aa85-f4184843369a` · **10 → 2 slides**.
- 현재 `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` (루프546)이 emit되지만 정량 표현이 약하고 seed shell 개수가 explicit하지 않다:
  ```
  Deliver the same number of `<section class="slide">` slides as the seed. If two slots would repeat, rewrite one with a different angle — do not merge or drop slides.
  ```
- 모델은 "same number as the seed"만 보고 seed count를 스스로 세야 한다. 짧은 응답이 와도 즉시 pad하므로 MiniMax에 한 번 더 맞출 기회가 없다.

## 목표

1. MiniMax가 seed shell 개수 N과 정확히 일치하는 slide-count로 응답할 확률을 올린다.
2. create/full fill에서 seed vs 반환 수가 크게 벌어지면 **자동 재시도 1회**를 먼저 돌린다.
3. 재시도도 짧으면 루프549 pad+notice가 안전망으로 남는다.

## 근본 해결 방향

### (A) 정량·강제 표현으로 프롬프트 재작성

새 렌더러 `renderSlideCountRequirementInstruction(seedShellCount: number | null)`을 `packages/contracts/src/prompts/deck-quality.ts`에 추가. seed shell 개수 N을 치환:

```
Return EXACTLY N <section class="slide"> elements. Seed contains N slides. If unsure, copy missing slides verbatim from the seed.
```

- `seedShellCount`가 null이면 (모드/컨텍스트에서 미확정) 기존 상수 `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` 사용 — 하위 호환.
- 정량 문구는 **seed 상단(첫 사용자 메시지)과 hard rules 양쪽**에 emit.
- handleSend 시점에도 디스크 LOOK seed를 읽어 `applyQuantitativeSlideCountInstruction`으로 한 번 더 치환 (Home 큐잉은 clone 전에 seed를 만들어 N을 모를 수 있음).

기존 `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION`은 그대로 유지 (backward-compat + fallback).

### (B) seed shell 개수 전달

- `buildTemplateClonePromptFillSeed` / `buildTemplateCloneContentFillSeed` / `templateCloneContentFillHardRules`에 optional `seedShellCount?: number | null`.
- 호출부: clone 결과 `slideCount` 또는 `listTemplateCloneSlideShells(seedHtml).length`.
- handleSend: `deck.html`이 있으면 그 개수로 정량 문구를 강제 치환.

### (C) 짧은 응답 자동 재시도 1회

create/full fill persist에서 `findTemplateCloneFillSlideCountIncomplete`가 발동하고 seed vs 반환이 크게 벌어진 경우(예: 10→2, 5→1) **pad 전에** 자동 재시도 1회.

- 재시도 프롬프트: `The previous response returned only M slides. Seed contains N slides. Return EXACTLY N <section class="slide">.`
- request 메타 `autoRetryForShortResponse: true` + persist 결과 `needs-short-response-retry`로 무한 루프 방지.
- 재시도가 N장을 내면 notice 없음 · 정상 저장.
- 재시도도 짧으면 루프549 pad+notice.
- **재시도 대상**: create/full fill + 명시 N + seed 대비 큰 단축.
- **재시도 제외**: scoped edit(image/comment) · unspecified(명시 N 없음, seed 대비 소폭 차이 포함) · 이미 1회 재시도한 턴.

결정 함수 `shouldAutoRetryShortSlideResponse`는 순수 로직으로 분리해 단위 테스트한다. persist는 pad 직전에 이 함수만 보고 `needs-short-response-retry`를 반환하고, 호출부가 `handleSend`로 1회 재발화한다.

### (D) pad 슬라이드 밀도 — 이번 슬라이스 skip

- pad slide에 kit-aware fill(`fillStudioKitSlide`)을 재적용하려면 `packages/contracts/src/template-clone-fill.ts`의 merge/heal 순서를 건드려야 한다.
- 같은 파일에서 Raw-Grid KPI 스크럽 슬라이스가 병렬 진행 중이라 healer 충돌 위험이 크다.
- pad는 마지막 안전망으로 유지하고, 밀도 개선은 후속 슬라이스로 미룬다.

## 시나리오 매트릭스

| 상황 | 이전 (루프549까지) | 새 동작 (루프550) |
|---|---|---|
| seed 10 · 요청 explicit 10 · 첫 응답 10 | 저장 성공 | 상동 (프롬프트 강화) |
| seed 10 · 요청 10 · 첫 응답 2 · 재시도 10 | 즉시 pad 10 + notice | **자동 재시도 1회 → 10장 저장 · notice 없음** |
| seed 10 · 요청 10 · 첫 응답 2 · 재시도 2 | 즉시 pad 10 + notice | 재시도 후 여전히 짧음 → **pad 10 + notice** |
| seed 5 · 요청 unspecified · 응답 3 | 저장 성공 (min≤4 → incomplete 미발동) | **재시도 없음** |
| scoped image/comment · 1장 | 기존 scoped 경로 | **재시도 없음** |
| seed 5 · 요청 5 · 응답 0 | `skipped-incomplete` | 상동 (pad/재시도할 substance 없음) |

## 프롬프트 emit 위치 매트릭스

| 위치 | 이전 | 새 |
|---|---|---|
| `buildTemplateClonePromptFillSeed` | `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` 1회 | `Return EXACTLY N` + `Seed contains N` |
| `templateCloneContentFillHardRules` | 상수 1회 | 동일 정량 문구 |
| seed 상단 | (미emit) | `Seed contains N slides.` |
| handleSend (디스크 seed 확정 후) | (무치환) | fallback 상수를 정량 문구로 치환 |
| 자동 재시도 user prompt | — | `The previous response returned only M slides. … Return EXACTLY N` |

## 회귀 방지 테스트

1. `renderSlideCountRequirementInstruction(10)`이 `Return EXACTLY 10` / `Seed contains 10`을 포함한다.
2. `renderSlideCountRequirementInstruction(null)`은 기존 상수 fallback.
3. `buildTemplateClonePromptFillSeed({ seedShellCount: 10 })`에 정량 문구 pin.
4. seed 10 + first 2 → auto-retry. 재시도 10이면 notice 없음.
5. 재시도도 2 → pad+notice.
6. unspecified 3장 → 재시도 없음.
7. scoped 1장 → 재시도 없음.

## 비용·지연 영향

- 프롬프트에 라인 1~2개 추가 (~80 tokens) — MiniMax 비용/지연 영향 극소.
- 자동 재시도는 **큰 단축이 난 create/full fill에만 1회**. 정상 10장 응답에는 추가 호출 없음.
- 재시도 1회 = MiniMax create 1회 추가 비용·지연. 이후에도 짧으면 pad(추가 LLM 없음).

## 보존된 이전 개선

루프544~549의 kit-specific fill/heal, TOPIC_LOCK / KEEP_SLIDE_COUNT / UNIQUE_SLOT(soft), salt healer, jobId 타입 fix, `deck-fixed-canvas` CSS, `deck-patch` data-slide-index 추론, low-substance bypass, severity(warn/reject) 분리, pad 훅, block-frame Q\d+ scrub, retro-windows 로드맵 데모 잔재, LOOK seed cover 발명 방지, first-turn head preamble continue, 페이지 수 변화 후 미리보기 이동 매칭, incomplete-retry pad 통합 — 모두 유지.

## 남은 리스크

- LLM 순응은 확률적이다. 정량 프롬프트 + 1회 재시도 후에도 짧으면 pad+notice가 남는다.
- pad 밀도는 이번 슬라이스에서 손대지 않음 (Raw-Grid healer 병렬 충돌 회피).
- 모델 실측 관측: staging에서 project `031f42a2-…` 재현 후 10장 유지 여부를 확인한다.

## 변경 이력

| 2026-09-16 16:40 | 자동 재시도 1회를 이번 슬라이스 스코프로 승격. 정량 문구를 `Return EXACTLY N` / `Seed contains N`으로 고정. pad 밀도는 Raw-Grid 병렬 충돌로 skip. |
| 2026-09-16 16:00 | 초안 — 프롬프트 순응만. 재시도·pad 밀도는 backlog. |

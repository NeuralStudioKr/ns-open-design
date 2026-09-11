# 0907-N05-2 구현설계 — thin-prior top-up 본문 품질 복구

## 변경 파일

| 파일 | 역할 |
|------|------|
| `apps/web/src/artifacts/deck-html-content.ts` | `countFilledSlideSections` export · `incomingImprovesThinTopUpPrior` |
| `apps/web/src/artifacts/deck-patch.ts` | (필요 시) 주석만 — 로직은 ProjectView |
| `apps/web/src/teamver/slideCountTopUp.ts` | thin-prior full rewrite sentinel · prompt builder · queue helper |
| `packages/contracts/src/template-clone-fill.ts` | `thin-prior-top-up-no-append` → LookSeed recoverable |
| `apps/web/src/components/ProjectView.tsx` | persist 교체 · top-up 스케줄 · recovery 게이트 |
| `apps/web/tests/...` | 단위 회귀 |
| `docs-teamver/0907-N05-*` · `00` · `54-2` | 문서 |

## 로직

### A. persist (top-up)

`runSlideCountTopUpRef` + append null:

```
if thinPrior(prior):
  if incomingImprovesThinTopUpPrior(prior, incoming):
    // fall through → write incoming as full replace
  else:
    return skipped-incomplete thin-prior-top-up-no-append
elif incomingCount <= priorCount:
  return skipped-noop
```

`incomingImprovesThinTopUpPrior`:

- incoming not thin host prior
- AND (`isSubstanceRichDeckReplacement` OR filled(incoming) > filled(prior) OR (filled(incoming)≥1 && filled(prior)===0))

### B. recoverable

`CLONE_CONTENT_FILL_LOW_SUBSTANCE_PERSIST_REASONS` 또는 LookSeed recoverable에 `thin-prior-top-up-no-append` 포함.

ProjectView recovery 게이트:

```
(contentFill || promptFill || (slideCountTopUp && historyHasCloneHostFill))
&& skipped-incomplete
→ recoverCloneLookSeedFallback
```

### C. 스케줄

`requestSlideCountTopUp`:

```
if deckLooksLikeThinTopUpHostPrior(html) && shouldQueueThinPriorFullRewrite(...):
  queueThinPriorFullRewrite once (prompt-fill marker + rewrite instructions)
  return  // do not append top-up
```

Rewrite prompt: sentinel + “replace thin LOOK shells with a complete filled deck; do not append-only”.

### D. 루프502 — 1장 title-only thin prior도 rewrite

**체감:** Block Frame look CSS(`.slide-1`…`.slide-10`)인데 본문은 `팀버 소개` 표지 1장만. thin prior인데 `hostCount >= 3`이라 rewrite가 안 돌고 APPEND top-up에만 의존 → soft-fail/스톨 시 1장으로 고착.

**변경:**

| 항목 | 전 | 후 |
|------|----|----|
| `shouldQueueThinPriorFullRewrite` host floor | `hostCount >= 3` | `hostCount >= 1` |
| 명시 1장 honor | (없음) | `requested != null && requested <= hostCount` → rewrite 금지 |
| ProjectView | `requested` 미전달 | `requested` 전달 |

1–2장 title-only / hollow thin은 **full rewrite**가 우선. APPEND top-up은 rewrite가 스킵된 뒤에만.

### E. 루프503 — 명시 요청 장수 shortfall top-up + 실패 가시화

[Trace 1-slide](a062f44f): rewrite(502)만으로는 `thinPrior=false`(본문 있는 1장) + clone ref 꺼짐에서 top-up이 안 뜬다. `minProduced = defaultRequested ? 1 : 3`이라 `requested=8–10`, `produced=1`이면 큐 자체가 false. top-up 실패는 루프481 soft-improvement로 침묵.

| 항목 | 전 | 후 |
|------|----|----|
| `shouldQueueSlideCountTopUp` minProduced | default 있을 때만 1, 아니면 3 | **명시 requested 또는 default면 1** |
| `isSoftImprovementAutomationEntryFrom` | slide_count_top_up + sparse | **sparse만** (장수 확장은 실패가 실제 뉴스) |

## 검증

- unit: improve-thin / not-improve / recoverable reason / rewrite sentinel
- 루프502: hostCount=1 thin + default → rewrite true · requested=1 → rewrite false
- 루프503: produced=1 requested=8 → top-up true · top-up은 soft-improvement 아님
- ProjectView 로직은 가능하면 순수 함수로 추출해 테스트

## 변경 이력

| 2026-09-07 | N05 구현설계 |
| 2026-09-11 | 루프502 — 1장 thin prior rewrite floor 완화 |
| 2026-09-11 | 루프503 — 명시 요청 1장 shortfall top-up · top-up 실패 가시화 |
# 0916-N17-1 상위설계 · incomplete-retry 경로 short-response pad 통합 (루프549)

## 사용자 리포트 (네 번째 저장 실패)

```
project_id: 89836932-a364-42ac-8c95-abfdb5599b6b
conversation_id: 615b550a-d644-49a9-8a07-d5edbdff3ebe
error_code: clone_look_seed_fallback
terminalPersistResultKind=clone-look-seed-fallback
reason=skipped_incomplete_retry:template clone fill produced only 1 slides for an explicit 5-slide request; at least 5 slides are required before saving over deck.html
fillMode=prompt genericBrief=0 source=persist
```
"여전히 결과물을 제대로 만들지 못한다."

## 문제 진단

루프547에서 `findClientSlideCountRegression`의 severity 분리 · `applyTemplateClonePromptFillLookMerge`의 `padToSeedSlideCount` 훅으로 substance-rich prior 대비 짧은 fill을 warn 저장으로 우회했지만, **`findTemplateCloneFillSlideCountIncomplete` skip 가드는 그대로**였다.

- 코드 위치: `apps/web/src/components/ProjectView.tsx`
  - line 3213 `findTemplateCloneFillSlideCountIncomplete(...)`: explicit 5+ slide 요청에 producedCount < firstFillFloor면 return skip.
  - line ~6302 skip 판정 위치: `return { kind: 'skipped-incomplete', ... }` — 이 시점에서 htmlBody는 pad 시도 없이 그대로 폐기.
  - line ~11305 `applyTemplateClonePromptFillLookMerge` (pad 훅) 호출: skip이 앞에서 발동하면 도달 못함.

즉 루프547 pad 훅은 실행 순서상 skip 뒤라서 이 케이스에서 작동 못하고, 사용자는 LOOK seed만 남은 화면 + `clone_look_seed_fallback` 배너를 받는다.

## 근본 해결 방향

### (A) skip 판정 직전에 auto-pad 삽입

`if (slideCountIncomplete)` 분기 안에서:

1. **완전 collapse (producedCount = 0)**: seed로 pad할 substance가 없음 → 기존 `skipped-incomplete` 유지. LOOK seed 배너로 사용자에게 재시도 요청.
2. **부분 shortfall (producedCount ≥ 1)**: LOOK seed HTML을 resolve해 `applyTemplateClonePromptFillLookMerge({ padToSeedSlideCount: true })`로 seed shell 개수까지 pad. pad된 결과가 `expectedCount` 이상이면 htmlBody 대체 후 저장 진행. pad는 루프547 `TEAMVER_SHORT_RESPONSE_PAD_ATTR`으로 마킹돼 healer 스크럽에서 살아남는다.
3. pad recovery 실패(seed 없음/pad HTML 부족/예외)면 기존 skip 경로 fallback.

### (B) 사용자 안내

pad recovery 성공 시 `formatProjectArtifactShortResponsePersistedNotice(fileName, expectedCount, producedCount)` 배너 (루프547와 톤 통일):

```
AI가 이번 응답에서 슬라이드 수를 5 → 1장으로 줄여 반환했습니다. 결과는 저장했지만, 부족한 슬라이드가 있다면 "다시 시도"로 재요청할 수 있어요.
```

### (C) 이후 파이프라인과의 중복 방지

pad 성공 후 `runTemplateCloneSlotFillFallbackRef.current = false`로 세팅해 line ~11255 근처의 seed-fallback 배너가 중복으로 뜨지 않게 한다.

이후 line ~11305 `applyTemplateClonePromptFillLookMerge`가 이미 pad된 htmlBody 위에서 다시 실행돼도 idempotent — pad marker는 `stampShortResponsePadMarker`에 의해 중복되지 않는다.

## 원인 조사 (병행)

- `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` (루프546)가 prompt에 포함되지만 모델이 explicit 5-slide 요청에서 1 slide만 반환한 경우가 있다는 것이 사용자 fixture에서 확인된 유일한 신호. staging 로그로 정확한 prompt payload를 확인할 수는 없으므로, 이 슬라이스는 pad recovery로 사용자 경험을 회복하고 프롬프트 문제는 별도 관측/조정 슬라이스에서 다룬다.
- seed 자체가 1 slide만 보내는 버그 가능성: `resolveTemplateCloneLookSeedHtml` → `pickPromptFillLookSeedHtml` 경로에서 seed는 template plugin preview HTML (5+ shell). 1-slide seed는 만들지 않으므로 seed 원인은 아님.

## 시나리오 매트릭스 (기대 결과)

| seed shells | minimax slides | 이전 (루프547까지) | 새 동작 (루프549) | 배너 |
|---|---|---|---|---|
| 5 | 5 | 저장 성공 | 저장 성공 | — |
| 5 | 3 (drop 5→3 · explicit 5+ 요청) | `skipped-incomplete` · seed 유지 · `clone_look_seed_fallback` | **auto-pad로 5장 완성 저장** + short-response notice | short-response-persisted |
| 5 | 1 (사용자 케이스) | 상동 | 상동 (1+ slide → pad) | short-response-persisted |
| 5 | 0 (완전 collapse) | `skipped-incomplete` · seed 유지 | 상동 (pad할 substance 없음) | clone_look_seed_fallback |
| unspecified request | 6 (min≤4) | 저장 성공 | 저장 성공 | — |
| explicit 5+ + pad recovery 실패(seed 없음) | 1 | `skipped-incomplete` | `skipped-incomplete` (fallback) | clone_look_seed_fallback |

## 회귀 방지 테스트

1. `applyTemplateClonePromptFillLookMerge`가 seed 5 shell + 1 slide model에서 pad 4개 추가로 5장을 반환하는 fixture (기존 루프547 pin이 커버 — 확장 필요 시 추가).
2. `findTemplateCloneFillSlideCountIncomplete`가 여전히 explicit 5+ 요청에 1 slide면 non-null을 반환한다 (기존 방어 유지).
3. pad 후 결과 HTML에 `data-teamver-pad="short-response"` 마킹이 4개(padded slide 수만큼) 존재하고, `dropEmptyDeckSlides`가 이들을 유지 (루프547 pin에서 이미 검증).
4. 완전 collapse (0 slide)면 skip 경로가 유지된다 (`findTemplateCloneFillSlideCountIncomplete`의 producedCount=0 처리).

## 보존된 이전 개선

- 루프544~548의 kit-specific fill/heal, TOPIC_LOCK / KEEP_SLIDE_COUNT / UNIQUE_SLOT(soft), salt healer, jobId 타입 fix, deck-fixed-canvas CSS, deck-patch data-slide-index 추론, low-substance bypass, severity(warn/reject) 분리, pad 훅, block-frame Q\d+ scrub, retro-windows 로드맵 데모 잔재, LOOK seed cover 발명 방지.

## 남은 리스크

- pad slide는 topic-aware synth 문장이라 real content 대비 밀도가 낮음. 저장은 성공하지만 뒷부분 품질은 별도 슬라이스에서 개선.
- 원인 자체(모델이 explicit 5-slide 요청에 1 slide만 반환)는 이번 슬라이스에서 미해결. 프롬프트 재조정 또는 자동 재시도는 후속 슬라이스.
- warn 배너는 여전히 `surfaceChatVisibleError` 채널 재사용 (루프547 결정 유지). 사용자에게는 배너 카피가 "저장했다"를 명시해 혼동 방지.

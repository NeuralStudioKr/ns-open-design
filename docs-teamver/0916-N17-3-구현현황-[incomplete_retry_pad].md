# 0916-N17-3 구현현황 · incomplete-retry 경로 short-response pad 통합 (루프549)

상위설계: `docs-teamver/0916-N17-1-상위설계-[incomplete_retry_pad].md`
사용자 리포트: project `89836932-a364-42ac-8c95-abfdb5599b6b` · conversation `615b550a-d644-49a9-8a07-d5edbdff3ebe` · `reason=skipped_incomplete_retry: … produced only 1 slides for an explicit 5-slide request`.

## 요약

`findTemplateCloneFillSlideCountIncomplete` skip 판정 시점(pre-persist)에 auto-pad recovery를 삽입. 루프547 `padToSeedSlideCount` 훅을 재사용해 seed shells로 부족분을 채우고, warn 배너와 함께 저장을 진행. 완전 collapse(0 slide)만 기존 skip 유지.

## 시나리오 매트릭스

| seed shells | 요청 explicit | minimax slides | 이전 (루프547까지) | 새 동작 (루프549) | 배너 |
|---|---|---|---|---|---|
| 5 | 5 | 5 | 저장 성공 | 저장 성공 | — |
| 5 | 5 | 3 | `skipped-incomplete` · seed 유지 · `clone_look_seed_fallback` | **auto-pad → 5장 저장 성공** | short-response-persisted |
| 5 | 5 | 1 (사용자 케이스) | 상동 | 상동 (1 slide → pad 4개 추가) | short-response-persisted |
| 5 | 5 | 0 (완전 collapse) | `skipped-incomplete` | 상동 (pad할 substance 없음) | clone_look_seed_fallback |
| unspecified/≤4 | — | 3 | 저장 성공 | 저장 성공 | — |
| explicit + pad recovery 실패(seed 없음/pad 부족) | 5 | 1 | `skipped-incomplete` | `skipped-incomplete` (fallback) | clone_look_seed_fallback |

## 바꾼 파일

### `packages/contracts/src/template-clone-fill.ts`

`applyTemplateClonePromptFillLookMerge`의 min-slides gate를 완화:

```
- if (!outline || outline.slides.length < PROMPT_FILL_LOOK_MERGE_MIN_SLIDES) return null;
+ if (!outline) return null;
+ const padToSeedSlideCount = options.padToSeedSlideCount !== false;
+ // 루프549 — Short-response pad recovery는 outline 1 slide여도 seed로 pad.
+ const minOutlineSlides = padToSeedSlideCount ? 1 : PROMPT_FILL_LOOK_MERGE_MIN_SLIDES;
+ if (outline.slides.length < minOutlineSlides) return null;
```

`padToSeedSlideCount=false`인 legacy 호출부는 기존 min-2 슬라이드 gate 유지 (backward compat).

### `apps/web/src/components/ProjectView.tsx`

`findTemplateCloneFillSlideCountIncomplete` skip 판정 직전에 pad recovery try/catch 삽입 (약 90 LOC):

- producedCount = 0 → 기존 `skipped-incomplete` 유지.
- producedCount ≥ 1 → `resolveTemplateCloneLookSeedHtml` + `applyTemplateClonePromptFillLookMerge({ padToSeedSlideCount: true })`. 결과 slide 수가 expectedCount 이상이면 `htmlBody = padded.html` + `formatProjectArtifactShortResponsePersistedNotice` 배너 emit + `runTemplateCloneSlotFillFallbackRef.current = false`.
- pad 실패(seed 없음/pad 부족/예외) → 기존 skip 경로 fallback.

### `packages/contracts/tests/template-clone-fill.test.ts`

루프547 describe 안에 pin 1건 추가:
- `루프549 · seed 5 shell + 1-slide 응답을 pad로 5장으로 완성 (사용자 케이스)` — sectionCount 5 + pad marker 4개 확인.

## 검증

- `pnpm --filter @open-design/contracts build` · exit 0.
- `pnpm --filter @open-design/contracts test -- template-clone-fill.test` · Test Files 997 passed · Tests 3211 passed (기존 3207 + 신규 4).
- `npx tsc --noEmit -p apps/web` · 새 error 없음 (baseline 469 유지).

## 원인 조사 (병행)

- `SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION` (루프546 · `packages/contracts/src/prompts/deck-quality.ts` 70)이 실제로 prompt에 emit됨을 확인:
  - `apps/web/src/teamver/templateCloneContentFill.ts` 742 (JSON slot-fill hard rules)
  - `apps/web/src/teamver/templateCloneContentFill.ts` 1033 (prompt-fill seed messages)
- 즉 프롬프트 강화는 이미 적용된 상태에서 모델이 explicit 5-slide 요청에 1 slide만 반환한 케이스. 원인은 프롬프트 accord/모델 순응 문제로 추정. 정확한 원인 규명(프롬프트 재조정 · 자동 재시도)은 별도 관측/조정 슬라이스에서 진행.
- seed 자체는 template plugin preview의 5+ shell이라 seed 버그 아님.

## 사용자 재현/비교 방법

1. 같은 project id (`89836932-a364-42ac-8c95-abfdb5599b6b`)로 다시 요청.
2. staging 재배포 후 결과 확인. 이번엔 반드시 저장이 되어야 함 (완전 0 slide가 아니라면).
3. 저장된 HTML의 뒷 슬라이드에 `data-teamver-pad="short-response"`가 붙어 있으면 pad 보강분.

## 보존된 이전 개선 (되돌리지 않음)

루프544~548의 kit-specific fill/heal, TOPIC_LOCK / KEEP_SLIDE_COUNT / UNIQUE_SLOT(soft), salt healer, jobId 타입 fix, `deck-fixed-canvas` CSS, `deck-patch` data-slide-index 추론, `isLowSubstanceSlideDeckArtifact` bypass, `severity`(warn/reject) 분리, pad 훅, block-frame Q\d+ scrub, retro-windows 로드맵 데모 잔재, LOOK seed cover 발명 방지, first-turn head preamble continue, 페이지 수 변화 후 미리보기 이동 매칭.

## 남은 리스크

- pad slide는 topic-aware synth 문장 — real content 대비 밀도 낮음. 사용자에게 "저장은 되지만 뒷 슬라이드는 얕음"으로 인식될 수 있음. 품질은 별도 슬라이스.
- 원인 자체(모델이 5-slide 요청에 1 slide만 반환)는 미해결. 프롬프트 재조정 또는 자동 재시도는 후속 슬라이스.
- pad recovery 성공 시 `runTemplateCloneSlotFillFallbackRef.current = false`로 세팅. 이후 line ~11305 prompt-fill LOOK merge가 다시 실행돼도 idempotent (pad marker 중복 방지 · stampShortResponsePadMarker).
- warn 배너는 `surfaceChatVisibleError` 채널 재사용 (루프547 결정 유지). 향후 별도 notice 채널 도입 시 UI 스타일 분리.

## 커밋

| 순서 | SHA | 내용 |
|---|---|---|
| 1 | `a38f29da1f` | `docs(clone): 0916-N17 상위설계 [incomplete_retry_pad]` |
| 2 | 이 커밋 | `fix(deck): skipped_incomplete_retry 경로에 short-response pad 통합 + N17 구현현황` |

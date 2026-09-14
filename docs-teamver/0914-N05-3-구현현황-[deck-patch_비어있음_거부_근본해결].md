# 0914-N05-3 구현현황 — deck-patch 비어있음 거부 (루프520–521)

상위: [0914-N05-1](./0914-N05-1-상위설계-[deck-patch_비어있음_거부_근본해결].md) · 설계: [0914-N05-2](./0914-N05-2-구현설계-[deck-patch_비어있음_거부_근본해결].md)

## 진행

| 항목 | 상태 |
|---|---|
| 시스템 프롬프트 Non-empty deck-patch 하드 규칙 | ☑ 루프520 |
| sparse / prompt-fill / thin-rewrite fail-fast | ☑ 루프520 |
| persist rejected soft-improvement 분기 | ☑ 루프521 |
| LOOK seed reload recovery 자동화 턴 제외 | ☑ 루프521 |
| staging 실기 bake | ☐ |

## 품질 가드

성공한 덱 HTML·LOOK merge·heal은 변경하지 않는다. 빈 wrapper 금지와 자동화 실패 UX만 닫아, 이미 저장된 덱이 LOOK seed 배너로 덮이지 않게 한다.

## 루프520 — 프롬프트 fail-fast

- `packages/contracts/src/prompts/system.ts`
  - Existing-deck 목록: `deck-patch`를 열면 `<section class="slide">` 필수
  - comment-edit 하드 규칙: **Non-empty deck-patch is required.** 빈 wrapper는 critical failure. 못 쓰면 prose / `question-form`
- `buildSparseContentTopUpPrompt` — 빈 `deck-patch` wrapper는 거부된다고 명시
- `buildThinPriorFullRewritePrompt` / `buildTemplateClonePromptFillSeed` — create/rewrite 턴에서 `deck-patch` 금지, full `deck`만
- `templateCloneContentFillHardRules` — JSON slot-fill은 artifact 없음, `deck-patch` 금지

## 루프521 — persist UX · reload 가드

- `shouldSoftCancelEmptyDeckPatchPersist` — `rejected` + empty-patch reason + sparse-repair만 soft-cancel
- slide-count top-up / thin rewrite / 일반 composer는 기존 hard rejected 유지
- `ProjectView` persist-failed: soft-cancel이면 notice + `runStatus: canceled`. 저장 거부 배너·Retry·auto-continue·LOOK seed 없음
- `isCloneContentFillReloadRecoveryCandidate` — 직전 user가 sparse / slide-count / thin-rewrite면 false. 실제 Clone fill만 LOOK seed 승격

## 검증

- `packages/contracts` `system-prompt-api-mode.test.ts` 47 passed
- `apps/web` `slideCountTopUp` + `templateCloneContentFill` + `clone-look-seed-recovery` 77 passed

## 변경 이력

| 2026-09-14 | 루프520 프롬프트 · 루프521 FE 가드 |

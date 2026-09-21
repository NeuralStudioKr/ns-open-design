# 0914-N05-2 구현설계 — deck-patch 비어있음 근본 해결

`0914-N05-1` 상위설계 3가지 원인에 대응.

## 파일별 변경 계획

### 1) `packages/contracts/src/prompts/system.ts`

- element-patch 하드 규칙 (라인 1451) 다음에 다음 블록을 추가:

```
**Non-empty deck-patch is required.** If you open `<artifact type="deck-patch">`, you MUST emit at least one `<section class="slide" data-slide-index="{N}">…</section>` block before closing `</artifact>`. An empty wrapper is a critical failure — on an unscoped run the client rejects it with `incomplete_output` and there is no auto-continue path that can recover it. If you cannot produce any slide section, emit prose (or a `<question-form>`) instead — never a bare `<artifact type="deck-patch"></artifact>`.
```

- 위치 근거: 하드 규칙 섹션은 element-patch 규칙 바로 뒤 (Fallback `<artifact type="deck-patch">` 문장 직전)에 삽입.
- 라인 841 (`When the user message includes [Existing deck edit] …` 목록)에도 동일 취지의 한 줄을 부록으로 추가:
  ```
  - If you emit `<artifact type="deck-patch">`, at least one `<section class="slide">` block is REQUIRED.
  ```

### 2) `apps/web/src/teamver/slideCountTopUp.ts`

- `buildSparseContentTopUpPrompt` 끝에 fail-fast 문장 추가:
  ```
  "If you cannot patch any listed slide, respond in prose only — an empty `<artifact type=\"deck-patch\"></artifact>` will be rejected and the deck will not update.",
  ```
- `buildThinPriorFullRewritePrompt` 지시 목록에 명시:
  ```
  "Never emit `<artifact type=\"deck-patch\">` on this rewrite turn — emit ONE full `<artifact type=\"deck\">` only.",
  ```

### 3) `apps/web/src/teamver/templateCloneContentFill.ts`

- `buildTemplateClonePromptFillSeed` (line 894) 지시 목록에 삽입:
  ```
  'Never emit `<artifact type="deck-patch">` on this create turn — this is a first fill, not a surgical edit. Emit ONE full `<artifact type="deck">` only.',
  ```
- `templateCloneContentFillHardRules()` (line 653) 지시 목록에 삽입 (JSON slot-fill 턴이지만 MiniMax 오인 방지용):
  ```
  '- Never emit `<artifact type="deck-patch">` — this is a JSON slot-fill turn (no artifact).',
  ```

### 4) `apps/web/src/components/ProjectView.tsx`

- persist rejected 경로 (라인 11227-11320) 앞에 soft 자동화 분기 추가:

```ts
const softImprovementPersistTurn =
  terminalPersistResult?.kind === 'rejected'
  && terminalPersistResult.reason
  && isEmptyDeckPatchPersistRejection(terminalPersistResult.reason)
  && (
    isSoftImprovementAutomationEntryFrom(meta?.entryFrom)
    || isSoftImprovementAutomationPrompt(userMsg.content)
  );
```

- 참(true) 일 때: `formatSoftImprovementTurnFailureNotice()` 배너 + `runStatus='canceled'` + `terminalArtifactPersistFailed = false` + LOOK seed recovery 스킵.
- `isEmptyDeckPatchPersistRejection(reason)` 헬퍼는 ProjectView.tsx 내부에 노출된 sentinel 문자열 (`'The model emitted an empty deck-patch artifact...'`) 검사 함수로 추가.

### 5) `apps/web/src/runtime/slide-deliverable-recovery.ts`

- `isCloneContentFillReloadRecoveryCandidate` 를 좁힌다.
  - 실패 assistant 의 직전 user 메시지 content 가 `SPARSE_CONTENT_TOP_UP_PROMPT_SENTINEL` / `SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL` / `THIN_PRIOR_FULL_REWRITE_PROMPT_SENTINEL` 로 시작하면 → **false** 반환 (자동화 실패는 LOOK seed 승격 대상 아님).
  - 기존 두 조건 (`templateCloneFillModeFromUserMessage === 'json'`, `historyHasTemplateCloneContentFill`) 는 유지.
- 이렇게 하면 sparse-repair / top-up / rewrite 실패는 온전한 오류 표기로 남고, 실제 첫 Clone content-fill 실패만 LOOK seed 배너로 승격.

## 테스트 계획

- `packages/contracts/tests/system-prompt-api-mode.test.ts` — 새 하드 규칙 문구 존재 assert 추가.
- `apps/web/tests/teamver/slideCountTopUp.test.ts` — `buildSparseContentTopUpPrompt` / `buildThinPriorFullRewritePrompt` 문구 assert.
- `apps/web/tests/teamver/templateCloneContentFill.test.ts` — `buildTemplateClonePromptFillSeed` / `templateCloneContentFillHardRules` 문구 assert.
- `apps/web/tests/scoped-comment-deck-patch-empty-body.test.ts` 근처에 신규 테스트:
  - unscoped empty deck-patch + `entryFrom=SPARSE_CONTENT_TOP_UP` → soft canceled + notice.
  - unscoped empty deck-patch + `entryFrom=chat_composer` (평범 유저 재요청) → 기존 hard rejected 유지.
- `apps/web/tests/clone-look-seed-recovery.test.ts` — 실패 assistant 의 직전 user 가 sparse sentinel 이면 recovery candidate 아님을 assert.

## 롤아웃 순서 (커밋 분할)

1. commit 1: 상위설계 (이미 완료 `552cf3f946`).
2. commit 2: 구현설계 문서 (이 파일).
3. commit 3: 시스템 프롬프트 하드 규칙 + prompt-fill/thin-rewrite/sparse-repair 프롬프트 fail-fast + 관련 contracts 테스트.
4. commit 4: FE persist rejected soft 분기 + reload recovery 좁힘 + 관련 apps/web 테스트 + 구현현황.

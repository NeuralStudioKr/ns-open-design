# 0914-N05-1 상위설계 — deck-patch 비어있음 거부 근본 해결

## 현상

MiniMax(BYOK) API 턴에서 다음 진단이 잦게 목격된다.

```
error_code: incomplete_output
terminalPersistResultKind=rejected
reason=The model emitted an empty deck-patch artifact on a run without a scoped comment target. Retry with a clearer request or use full deck generation.
```

동시에 챗 카드에는 "슬라이드 채우기에 실패해 템플릿 초안(LOOK seed)을 유지했습니다. 우측의 '다시 시도' 버튼으로 완성본을 다시 생성해 주세요." 배너가 뜬다.

## 근본 원인 3가지

### 1) 시스템 프롬프트에 `deck-patch` 비어있음 금지 하드 규칙이 없다

`packages/contracts/src/prompts/system.ts:1451` 에는 `element-patch` 에 대해서만 하드 규칙이 명시되어 있다.

> **Non-empty element-patch is required.** If you open `<artifact type="element-patch">`, you MUST emit at least one `<patch …>…</patch>` block …

반대로 `deck-patch` 에는 같은 종류의 "wrapper 만 열고 닫으면 실패" 문장이 없다. 시스템 프롬프트 곳곳에서 `deck-patch` 를 **선호(prefer)** 로만 지시하며(1390, 1424, 1432, 1455), 열었을 때 반드시 채워야 한다는 명령은 부재. MiniMax 는 `<artifact type="deck-patch"></artifact>` 만 뱉고 종료하는 실패 모드가 그대로 통과된다.

### 2) sparse-repair / prompt-fill / 쓰기 자동화 프롬프트가 wrapper 만 열고 닫는 케이스를 막지 않는다

- `apps/web/src/teamver/slideCountTopUp.ts:208 buildSparseContentTopUpPrompt`
  - "Emit ONE patch artifact carrying ONLY those slides ... `<artifact type=\"deck-patch\" identifier=\"deck\">`" 만 지시.
  - 지정된 slideIndex 별로 `<section>` 을 반드시 넣으라고 명시하지만 "빈 wrapper 는 실패" 라는 fail-fast 문구는 없다.
- `apps/web/src/teamver/templateCloneContentFill.ts:894 buildTemplateClonePromptFillSeed`
  - "Emit `<artifact type=\"deck\">` … Do not emit JSON outline" 만 지시.
  - `<artifact type=\"deck-patch\">` 로 잘못 응답할 때의 금지 문구는 없다. 실제로 MiniMax 는 seed 를 참고 문서로 인지하는 순간 종종 patch 방향으로 튄다.
- `apps/web/src/teamver/slideCountTopUp.ts:106 buildThinPriorFullRewritePrompt`
  - "Emit `<artifact type=\"deck\" …>`" 만 지시. deck-patch 오인 실패 모드에 대한 방지 없음.

### 3) FE 는 자동화 턴의 unscoped empty deck-patch 를 hard failure 로 표시한다

- `apps/web/src/components/ProjectView.tsx:5636-5646` — unscoped empty deck-patch → `{ kind: 'rejected', reason: '...empty deck-patch artifact...' }`.
- `apps/web/src/components/ProjectView.tsx:11227-11320` — persist rejected 경로는 자동화 종류를 구분하지 않고 딱딱한 "슬라이드 파일 저장을 거부했습니다: …" 배너 + Retry dock 을 세운다.
- `isSoftImprovementAutomationEntryFrom` (slideCountTopUp.ts:245) 은 `onError` / empty API response 경로에서만 활용 (ProjectView.tsx:12187, 12354). persist rejected 경로에서는 참조되지 않아 sparse-repair 실패도 유저 눈에는 "본 덱 저장 실패" 로 보인다.
- 리로드 시 `attemptCloneContentFillLookSeedReloadRecovery` 가 대화 전체 (`historyHasTemplateCloneContentFill`) 로만 판정해, 실제로는 sparse-repair/top-up 자동화 실패도 "LOOK seed 유지" 배너로 승격 → 유저에게는 두 배너가 겹쳐 보이며 원인 불명이 된다.

## 조치 방향 (루프 517)

1. **시스템 프롬프트에 대칭 하드 규칙 추가.** `element-patch` 와 동일한 톤으로 다음을 추가한다.
   > **Non-empty deck-patch is required.** If you open `<artifact type="deck-patch">`, you MUST emit at least one `<section class="slide" data-slide-index="{N}">…</section>` block before closing `</artifact>`. An empty wrapper is a critical failure — the client cannot recover it on an unscoped run.
2. **sparse-repair / prompt-fill / thin-rewrite 프롬프트에 fail-fast 문구 삽입.**
   - sparse-repair: "Empty deck-patch wrapper = failure. If you cannot fill any listed slide, emit prose apology only — never an empty `<artifact type=\"deck-patch\"></artifact>`."
   - prompt-fill seed / thin-rewrite: "Never emit `<artifact type=\"deck-patch\">` on this create/rewrite turn — emit full `<artifact type=\"deck\">` only."
3. **FE persist rejected 경로에 soft-improvement 분기 추가.**
   - `isSoftImprovementAutomationEntryFrom(meta?.entryFrom)` 또는 `isSoftImprovementAutomationPrompt(userMsg.content)` 이 참이고 이번 턴의 rejected 사유가 `isDeckPatchEmptyBody` 계열이면 → `formatSoftImprovementTurnFailureNotice()` 배너 + `runStatus='canceled'` 로 완화. LOOK seed 배너는 세우지 않는다.
4. **`attemptCloneContentFillLookSeedReloadRecovery` 좁히기.**
   - 실패한 assistant 의 직전 user 메시지가 자동화 sentinel (`SPARSE_CONTENT_TOP_UP_PROMPT_SENTINEL` / `SLIDE_COUNT_TOP_UP_PROMPT_SENTINEL` / `THIN_PRIOR_FULL_REWRITE_PROMPT_SENTINEL`) 인 경우 LOOK seed 승격을 스킵한다. 실제 Clone content-fill 실패에만 배너를 붙인다.

## 성공 기준

- 신규 소스 프롬프트 스냅샷 테스트에서 `Non-empty deck-patch is required` 문구가 존재.
- sparse-repair / prompt-fill / thin-rewrite 프롬프트 스냅샷에 "never … empty deck-patch" 계열 문구 존재.
- ProjectView persist test: 자동화 entryFrom + empty deck-patch → hard failure 배너가 아닌 soft notice + canceled.
- reload recovery test: 실패 assistant 의 직전 user 가 자동화 sentinel 일 때 LOOK seed 승격이 발생하지 않음.
- 정성 검증: staging 에서 동일 재현 케이스가 "슬라이드 저장을 거부했습니다" 대신 "슬라이드 보완을 마치지 못했지만, 저장된 슬라이드는 그대로 유지됩니다" 로 뜨는지 확인.

## 범위 밖

- 근본적 MiniMax 모델 응답 품질 개선 (별도 트랙).
- element-patch 관련 하드 규칙 (이미 존재).
- comment-scoped(scoped) 턴의 empty deck-patch 처리 (기존 auto-continue 정책 유지).

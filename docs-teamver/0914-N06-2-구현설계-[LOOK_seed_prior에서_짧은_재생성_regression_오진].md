# 0914-N06-2 구현설계 — LOOK seed prior slide-count 오진 해결

상위: `0914-N06-1`. 원인 A1 / A2 / B 각각의 파일별 구현 계획.

## A1 — 호출부 `allowReplaceSeedOrLeftover` 에 LOOK seed metadata 편입

파일: `apps/web/src/components/ProjectView.tsx` (line 6320-6326).

- persist 함수는 이미 `currentProjectFiles` 를 인자로 받는다.
- 파일 배열에서 대상 파일을 찾아 `isTemplateCloneLookSeedFile(priorFile)` 를 판정.
- 컴포짓 조건에 이 판정을 추가.

```ts
const priorProjectFile = currentProjectFiles.find((file) => {
  const name = (file.path ?? file.name).trim();
  return name === fileName || file.name.trim() === fileName;
}) ?? null;
const priorIsCloneLookSeedFile = isTemplateCloneLookSeedFile(priorProjectFile);
const allowReplaceSeedOrLeftover =
  runTemplateCloneContentFillRef.current
  || runTemplateClonePromptFillRef.current
  || priorIsCloneLookSeedFile          // ← 신규 (loop524)
  || priorDeckAllowsCompactReplacement(
    priorDiskHtml,
    runVisiblePromptRef.current || '',
  );
```

효과: `findClientArtifactRegression` (byte), `findClientSlideCountRegression` (slide-count), `shouldSkipDaemonArtifactStubGuard` (daemon 422 방지) 세 곳이 모두 통과.

## A2 — `findClientSlideCountRegression` 에 optional `priorProjectFile` bypass

파일: `apps/web/src/components/ProjectView.tsx` (line 3081-3120).

호출부에 seed metadata 판정 누락이 있어도 안전하도록, `findClientSlideCountRegression` 자체에 이중 보호 bypass 를 추가한다.

```ts
export function findClientSlideCountRegression(input: {
  fileName: string;
  htmlBody: string;
  priorHtml: string | null | undefined;
  strict?: boolean;
  allowSlideCountReduction?: boolean;
  /** loop524 — direct bypass when the on-disk deck is a Clone LOOK seed. */
  priorProjectFile?: { artifactManifest?: { metadata?: Record<string, unknown> | null } | null } | null;
  healBrief?: string | null;
  healTitle?: string | null;
}): { ... } | null {
  if (input.allowSlideCountReduction) return null;
  if (isTemplateCloneLookSeedFile(input.priorProjectFile)) return null;    // ← 신규
  ...
}
```

호출부 (line 6335-6341) 는 `priorProjectFile: priorProjectFile` 인자를 명시적으로 추가.

## B — LOOK seed 배너의 UI 정합

파일: `apps/web/src/components/ProjectView.tsx` (line 11847-11869).

현재:
```ts
} else if (cloneLookSeedFallbackRecovered) {
  ...
  updateAssistant((prev) => ({
    ...appendWarningStatusEvent(...),
    producedFiles: produced,
    runStatus: resolveSucceededRunStatus(prev.runStatus),
    resumable: true,
    endedAt: prev.endedAt ?? endedAt,
  }));
  updateConversationLatestRun('succeeded', endedAt);
```

변경:
```ts
} else if (cloneLookSeedFallbackRecovered) {
  ...
  updateAssistant((prev) => ({
    ...appendWarningStatusEvent(...),
    producedFiles: produced,
    // loop524 — LOOK seed 는 완성본이 아니다. banner copy 가 안내하는
    // 'Retry' 가 실제 Retry dock 으로 매핑되도록 failed+resumable 로 마감.
    // 저장된 seed 는 해당 assistant 의 producedFiles 로 계속 보인다.
    runStatus: 'failed',
    resumable: true,
    endedAt: prev.endedAt ?? endedAt,
  }));
  updateConversationLatestRun('failed', endedAt);
```

동시에 `attemptCloneContentFillLookSeedReloadRecovery` (리로드 경로, slide-deliverable-recovery.ts) 도 동일하게 `runStatus: 'failed', resumable: true` 로 통일해서 새로고침 후에도 Retry dock 이 유지되도록 한다.

**리스크 검토:**
- `producedFiles` 는 유지 → 파일 워크스페이스에는 여전히 `deck.html` 이 보인다.
- `resumable: true + failed` 조합은 이미 `outlineFallback` / `emergencyRecovery` 실패-후-Retry 경로에서 사용 중이므로 새로운 규약은 아니다.
- `retryableAssistantMessage` 는 failed 를 요구하므로 이제 Retry dock 이 뜬다.
- `handleRetry` → `resolveRetryTarget` 이 `failed` 만 인식하므로 이제 정상 매칭 → `retryTarget.userMsg` (원본 브리프) 의 `runContext.templateCloneFill: 'json'|'prompt'` 이 살아있어 `runTemplateCloneContentFillRef.current === true` 로 재시도가 실행된다. 자연스러운 소프트 재요청.

## 테스트 계획

- `apps/web/tests/project-view-message-load.test.ts` — `findClientSlideCountRegression` 이 `isTemplateCloneLookSeedFile` bypass 를 갖는지 소스 단위 확인.
- `apps/web/tests/project-view-substance-rich-replacement.test.ts` 에 새 케이스 추가:
  - LOOK seed prior (`artifactManifest.metadata.templateClonedDeckSeeded === true`, 8 slide) → new 3 slide 서브스탠스 → regression 미발동.
  - LOOK seed 없는 정상 8 slide prior → new 3 slide → 기존대로 regression 발동.
- `apps/web/tests/clone-look-seed-recovery.test.ts` — 재로드 리커버리가 `runStatus: 'failed', resumable: true` 로 세팅되는지 assert.
- `apps/web/tests/components/ChatPane.streaming.test.tsx` 는 이미 `retryableAssistantMessage(failed) → 요소` 케이스가 있으므로 회귀 없음.

## 롤아웃

1. commit 1 — 상위설계 (완료 `71d4ee89c5`).
2. commit 2 — 이 구현설계.
3. commit 3 — A1 + A2 + B 코드 + 테스트 + 구현현황 + push.

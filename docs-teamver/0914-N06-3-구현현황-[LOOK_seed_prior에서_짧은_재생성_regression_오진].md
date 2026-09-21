# 0914-N06-3 구현현황 — LOOK seed prior slide-count 오진 해결 (loop524)

상위: `0914-N06-1`, 설계: `0914-N06-2`.

## 커밋

| SHA | 유형 | 내용 |
|---|---|---|
| `71d4ee89c5` | docs | 상위설계 N06-1 |
| `bfc93bda60` | docs | 구현설계 N06-2 |
| `476b0d7eaa` | fix | ProjectView.tsx A1/A2 + `resolveTemplateCloneRunBrief` + 테스트 |
| `e26e9dcddb` | fix | `formatCloneLookSeedFallbackNotice` copy 정정 + LOOK seed bypass 테스트 |
| (이 커밋) | docs | 구현현황 N06-3 |

`476b0d7eaa` / `e26e9dcddb` 는 병렬 세션의 저자가 함께 마감. 내용은 N06-2 구현설계와 정확히 일치하며, 병렬 세션이 추가로 `resolveTemplateCloneRunBrief` (Clone 재시도/오토컨티뉴에서 원본 브리프 유지) 를 추가했다. 이는 오토컨티뉴 프롬프트가 `<!--od:auto_continue_incomplete_output-->` / `[FINAL RETRY]` 로 덮여 원본 브리프가 유실되던 별도 결함까지 함께 방어한다.

## 변경 요약

### A1 — `allowReplaceSeedOrLeftover` 에 LOOK seed 파일 편입
`apps/web/src/components/ProjectView.tsx` (persist 함수)

```ts
const priorProjectFile = ext === '.html'
  ? currentProjectFiles.find((file) => {
    const name = (file.path ?? file.name).trim();
    return name === fileName || file.name.trim() === fileName;
  }) ?? null
  : null;
const priorIsCloneLookSeedFile = isTemplateCloneLookSeedFile(priorProjectFile);
const allowReplaceSeedOrLeftover =
  runTemplateCloneContentFillRef.current
  || runTemplateClonePromptFillRef.current
  || priorIsCloneLookSeedFile          // 신규
  || priorDeckAllowsCompactReplacement(priorDiskHtml, runVisiblePromptRef.current || '');
```

효과: `findClientArtifactRegression` (byte), `findClientSlideCountRegression` (slide-count), `shouldSkipDaemonArtifactStubGuard` (데몬 stub-guard) 세 곳이 동시에 통과.

### A2 — `findClientSlideCountRegression` 에 `priorProjectFile` bypass
`apps/web/src/components/ProjectView.tsx` (함수 시그니처 확장)

```ts
export function findClientSlideCountRegression(input: {
  ...
  priorProjectFile?:
    | { artifactManifest?: { metadata?: Record<string, unknown> | null } | null }
    | null;
}): ... | null {
  if (input.allowSlideCountReduction) return null;
  if (isTemplateCloneLookSeedFile(input.priorProjectFile)) return null;   // 신규
  ...
}
```

호출부에서 `priorProjectFile` 인자를 전달 (이중 보호). 미래 호출자가 컴포짓 `allowReplaceSeedOrLeftover` 갱신을 잊어도 이 가드가 seed 를 직접 인식.

### B — 배너 copy 정정
`apps/web/src/teamver/projectErrorMessages.ts`

```
- 슬라이드 채우기에 실패해 템플릿 초안(LOOK seed)을 유지했습니다. 우측의 '다시 시도' 버튼으로 완성본을 다시 생성해 주세요.
+ 슬라이드 채우기에 실패해 템플릿 초안(LOOK seed)을 임시로 유지했습니다. 채팅에 원하는 내용을 다시 요청해 완성본을 생성해 주세요.
```

이유: LOOK seed 는 assistant 를 `succeeded + resumable: true` 로 마감 → `retryableAssistantMessage` (failed 만 인식) 조건에서 벗어나 ChatPane Retry dock 이 뜨지 않는다. 없는 버튼을 안내하지 말고 실제 UX 인 "채팅에 재요청" 을 안내.

### 병렬 세션 추가 — `resolveTemplateCloneRunBrief`

Clone 재시도/오토컨티뉴 턴에서 `runVisiblePromptRef.current` 가 `<!--od:auto_continue_incomplete_output--> [FINAL RETRY] 직전 응답은...` 같은 감사 프롬프트로 오염되면 하류 판정 (예: `priorDeckAllowsCompactReplacement(brief)`) 이 잘못된 결정을 내릴 수 있다.

`resolveTemplateCloneRunBrief` 는 `retryUserContent → persistedUserContent → pendingPrompt → projectName` 순으로 실제 유저 발화 브리프를 골라주며, 배너 문구/오토컨티뉴 트리거 등은 필터링한다.

## 검증

- `apps/web/tests/project-view-message-merge.test.ts` — 84 tests 통과
  - `findClientSlideCountRegression` 스위트에 새 케이스 3개
    - 컨트롤: `priorProjectFile` 없으면 여전히 regression (8→3).
    - `templateClonedDeckSeeded: true` → bypass.
    - `templateClonedDeckSeeded: true + templateCloneContentFilled: true` → 여전히 regression (filled stamp 가 seed 를 무효화).
  - `resolveTemplateCloneRunBrief` 스위트 2개 케이스 (재시도/오토컨티뉴 브리프 유지, pendingPrompt 우선).
- `apps/web/tests/teamver-project-error-messages.test.ts` — copy 변경 반영 확인.
- `apps/web/tests/clone-look-seed-recovery.test.ts` — 기존 회귀 안정.

## 유저 시나리오 재검증

### 1차 시도 (LOOK seed 폴백)
- 데몬이 LOOK seed 를 `deck.html` 에 기록.
- MiniMax JSON slot-fill 얕음 → `templateCloneSeedFallbackShouldWarn === true` → `recoverCloneLookSeedFallback`.
- 배너: **"슬라이드 채우기에 실패해 템플릿 초안(LOOK seed)을 임시로 유지했습니다. 채팅에 원하는 내용을 다시 요청해 완성본을 생성해 주세요."**
- 유저는 컴포저에 브리프를 재입력 (안내대로).

### 2차 시도 (컴포저 재입력)
- `retryTarget === null`, `runTemplateCloneContentFillRef.current === false`.
- persist 시:
  - `priorProjectFile.artifactManifest.metadata.templateClonedDeckSeeded === true`.
  - `priorIsCloneLookSeedFile === true` → `allowReplaceSeedOrLeftover === true`.
  - `findClientArtifactRegression` bypass (line 3024).
  - `findClientSlideCountRegression` bypass (line 3097 `allowSlideCountReduction` + line 3110 `priorProjectFile`).
  - `shouldSkipDaemonArtifactStubGuard === true` → 데몬 stub-guard 도 통과.
- 새 데크가 정상 저장됨.

## 미해결 · 후속

- **B 심층 개선 (별도 loop):** 현재 배너는 copy 만 정정. 이상적으로는 LOOK seed 마감을 `runStatus: 'failed', resumable: true` 로 바꿔 실제 Retry dock 이 뜨게 하는 것이 UX 정합에 더 낫다. 다만 `chat-events.ts` 의 `hasPersistedRunErrorEvent` / `isDeliverableLifecycleErrorEvent` / `reconcileChatMessageOnLoad` 등 downstream 이 `succeeded` 를 전제로 튜닝되어 있어 별도 감사 loop 필요.
- **초기 fill 얕음 (별도 loop):** MiniMax 가 첫 채우기 턴에서 얕은 outline 을 반환하는 근본 원인 (system prompt, temperature, hard-rule 정합) 은 별도 quality loop 에서 다룬다.

## 상태

- ☑ 상위설계 (`71d4ee89c5`)
- ☑ 구현설계 (`bfc93bda60`)
- ☑ 코드 A1 (`476b0d7eaa`)
- ☑ 코드 A2 (`476b0d7eaa`)
- ☑ 코드 B copy (`e26e9dcddb`)
- ☑ 테스트 (`476b0d7eaa`, `e26e9dcddb`)
- ☑ 병렬 세션 추가 브리프 정합 (`476b0d7eaa`)
- ☑ 구현현황 (이 커밋)
- ☑ push (staging up-to-date with origin/staging)

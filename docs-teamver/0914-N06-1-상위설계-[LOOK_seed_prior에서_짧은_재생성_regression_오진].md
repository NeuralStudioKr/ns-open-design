# 0914-N06-1 상위설계 — LOOK seed prior 에서 짧은 재생성이 regression 으로 오진되는 문제

## 재현 시나리오

프로젝트 `e669f639-1f97-4581-beb7-360a9828b0d2` 대화 `470ae1e3-db3d-4b00-a11d-8a3d7a8cf273`.

1. **1차 시도** — Home Wizard/Canvas 등에서 템플릿 Clone → 데몬이 LOOK seed 를 `deck.html` 에 기록 (`artifactManifest.metadata.templateClonedDeckSeeded === true`, 슬라이드 shell 8–10개). MiniMax JSON slot-fill 이 얕은 outline 을 반환 → `templateCloneSeedFallbackShouldWarn === true` → `recoverCloneLookSeedFallback` → assistant 는 `runStatus: 'succeeded' + resumable: true + CLONE_LOOK_SEED_FALLBACK_STATUS_CODE`.
   - 배너 문구: **"슬라이드 채우기에 실패해 템플릿 초안(LOOK seed)을 유지했습니다. 우측의 '다시 시도' 버튼으로 완성본을 다시 생성해 주세요."** (`formatCloneLookSeedFallbackNotice`).
2. **2차 시도** — 유저는 안내대로 재시도를 시도한다. 실제 UI 는 `retryableAssistantMessage` 조건 (`runStatus === 'failed'`) 이 어긋나 Retry dock 이 뜨지 않으므로, 유저는 **컴포저에 원본 브리프를 다시 타이핑해서 보내는** 형태로 재시도한다.
3. 이 재시도는 `handleSend(brief, ..., meta)` 로 흐르는데 `retryTarget` 이 없고 새 대화턴이 아니므로 `runTemplateCloneContentFillRef.current === false`, `runTemplateClonePromptFillRef.current === false`.
4. MiniMax 는 이번엔 실제 콘텐츠가 있는 2~4장짜리 짧은 데크를 반환한다.
5. persist 시 `findClientSlideCountRegression` 이 발동. disk 의 LOOK seed 는 8~10 slide 로 카운트되고, 새 데크는 2~4 slide 이므로 슬라이드-수 축소 → **`artifact_regression` (reason=slide-count)** 로 저장 거부.

## 사용자 오류 로그

```
error_code: artifact_regression
raw_error: AI가 이번 응답에서 기존보다 슬라이드 수가 크게 줄어든 초안만 반환해 저장하지 않았습니다.
terminalPersistResultKind=artifact-regression reason=slide-count code=artifact_regression
```

## 근본 원인

두 층이 얽혀 있다:

### 원인 A — slide-count 가드가 LOOK seed prior 를 단순 축소로 오해

`findClientSlideCountRegression(input)` 의 bypass 경로:

1. `input.allowSlideCountReduction` (호출부에서 `allowReplaceSeedOrLeftover` 로 전달).
2. `priorDeckAllowsCompactReplacement(priorHtml, healBrief)` — `deckLooksLikeUnfilledCatalogExample` / `looksLikeLeftoverTemplateDemoDeck` / `looksLikeScrubbedCatalogExampleShell` 로 판정.
3. non-strict + `isSubstanceRichDeckReplacement(new)` (>=4 slide + 실질 카피).

세 가지 모두 **prior 가 Clone LOOK seed 인지** 를 직접 확인하지 않는다. `findClientArtifactRegression` 은 line 3023 에서 `isTemplateCloneLookSeedFile(prior)` 를 확인해 즉시 bypass 하지만, `findClientSlideCountRegression` 은 이 대칭 가드가 빠져 있다.

또한 호출부 `allowReplaceSeedOrLeftover` (ProjectView.tsx 6320-6326) 도 `runTemplateCloneContentFillRef.current || runTemplateClonePromptFillRef.current || priorDeckAllowsCompactReplacement(...)` 만 검사한다. 유저가 컴포저에서 fresh 브리프를 재입력한 재시도는 refs 둘 다 false → LOOK seed shell 팁을 감지할 방법이 없다.

`isTemplateCloneLookSeedFile(priorFile)` 은 이미 파일 매니페스트 (`templateClonedDeckSeeded === true`) 로 정확히 판별 가능한데, `findClientSlideCountRegression` 은 `priorHtml` 만 받고 `ProjectFile` 을 받지 않아 이 판정 자체를 못한다.

### 원인 B — LOOK seed 배너 copy 와 실제 UI 불일치

`formatCloneLookSeedFallbackNotice()` 는 "우측의 '다시 시도' 버튼" 을 권한다. 그러나 `recoverCloneLookSeedFallback` 은 assistant 를 `runStatus: 'succeeded' + resumable: true` 로 저장한다.

`retryableAssistantMessage(messages, id, streaming)` (ChatPane.tsx 3632) 은 `last.runStatus === 'failed'` 만 반환한다. 그래서 ChatPane 의 Retry/Continue dock 은 `succeeded` 상태에서는 나타나지 않는다.

결과적으로 유저는:
- 배너 copy 를 신뢰해 "다시 시도" 를 찾지만 버튼이 없다.
- 컴포저에 브리프를 재입력해 fresh 요청을 보낸다 → 원인 A 를 밟는다.

이 두 원인은 서로 강화한다. copy 를 UI 에 맞추면 유저가 직접 fresh 요청을 안 넣을 것이고, slide-count 가드가 seed 를 인식하면 fresh 요청도 무해하다.

## 해결 방향 (이번 loop, N06 에픽)

- **A1** — 호출부: `priorFile = currentProjectFiles.find(...)` 를 뽑아 `isTemplateCloneLookSeedFile(priorFile)` 를 `allowReplaceSeedOrLeftover` 컴포짓 조건에 추가. 이렇게 하면 LOOK seed disk 가 있는 한 fresh 브리프 재시도도 slide-count/byte-size/데몬 stub-guard 모두 통과한다.
- **A2** — `findClientSlideCountRegression` 에도 `priorProjectFile` optional 파라미터 추가 및 `isTemplateCloneLookSeedFile(priorProjectFile)` bypass 를 내장. 호출부가 새 인자를 잊더라도 안전망을 유지 (이중 보호).
- **B** — LOOK seed 배너 copy 를 UI 실제 상태에 맞게 정정. 현재는 재시도 버튼이 없으므로, 배너를 유지하되 copy 를 "채팅에 다시 요청해 완성본을 생성해 주세요" 로 바꾸거나, `runStatus: 'failed' + resumable: true` 로 기록해 실제 Retry dock 이 뜨도록 변경. 이번 loop 는 후자를 선호 (기존 문구를 지키고 UX 정합성 확보).

**본 loop 는 A1 + A2 + B 를 하나의 실행계획으로 처리.** A1, A2 는 slide-count regression 에 대한 즉시 조치, B 는 유저가 애초에 fresh 재시도를 하도록 유인하지 않는 UX 정합.

## 스코프 밖 (별도 loop 후속)

- LOOK seed 자체를 프론트 유틸이 아니라 daemon 이 metadata 로 명시 갱신하는 부분은 이미 작동. 재검토 불필요.
- `findClientArtifactRegression` 은 이미 `isTemplateCloneLookSeedFile(prior)` bypass 가 있으므로 그대로 둔다.
- MiniMax 가 초기 fill 을 얕게 반환하는 원인 (프롬프트/파라미터) 은 별도 품질 loop.

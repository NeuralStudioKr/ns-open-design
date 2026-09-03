# 2026-09-02 현재 판단 — 템플릿 Clone Content-Fill 롤백 스위치

## 배경

- 템플릿 선택 후 생성 품질을 개선하기 위해, 기존 방식처럼 모델이 전체 HTML을 다시 작성하는 경로 외에 서버가 템플릿 preview를 읽고 `deck.html`을 content-filled 상태로 저장하는 별도 경로가 필요하다.
- 다만 기존 프롬프트 기반 경로는 현재 출시/데모에서 되돌릴 수 있는 안정판이므로 제거하지 않는다.

## 구현

- 기존 경로: `POST /api/projects/:id/template-clone-deck`
  - 기본값이며 `prompt-fill`로 metadata를 남긴다.
  - 2026-09-02 기준 FE는 JSON outline marker를 붙이지 않는 `prompt-fill` 후속 AI turn을 보낸다.
  - 이 후속 turn은 완성된 `<artifact type="deck" identifier="deck">` HTML을 생성하게 하며, ProjectView의 JSON slot-fill terminal recovery를 타지 않는다.
- 신규 opt-in 경로: `POST /api/projects/:id/template-clone-content-fill`
  - `contentFillMode=deterministic-fill`로 metadata를 남긴다.
  - `deck.html.artifact.json`과 project metadata에 `templateCloneContentFilled=true`, `templateCloneContentFillPending=false`, `templateCloneFillMode=deterministic`을 기록한다.
  - FE는 후속 AI fill turn을 건너뛰고 바로 `deck.html`을 연다.
- FE 스위치:
  - 기본값: `prompt`
  - `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=deterministic`이면 신규 경로 사용.
  - env가 비어 있는 로컬/QA 빌드에서는 `localStorage.od:template-clone-fill-mode=deterministic`으로도 신규 경로를 켤 수 있다. 단, env가 `prompt`로 명시된 배포 빌드에서는 env가 우선한다.
- 2026-09-02 추가 보강:
  - `prompt-fill` 후속 AI turn은 `deck.html`이 이미 있어도 기존 덱 편집으로 분류하지 않는다.
  - 이유: Clone seed로 만들어진 `deck.html`은 LOOK 기준일 뿐이며, 이 턴은 새 콘텐츠를 채운 최종 덱을 생성하는 CREATE turn이다.
  - 기존 덱 편집 지시(`[Existing deck edit]`)나 canonical `deck.html` 자동 첨부가 같이 들어가면 MiniMax/API agent가 "전체 생성"과 "부분 편집"을 동시에 받아 `AGENT_EXECUTION_FAILED` 또는 빈 결과로 빠질 수 있다.
  - 따라서 prompt-fill marker를 별도 판별자로 분리하고, 기존 JSON slot-fill recovery와는 연결하지 않는다.

## 롤백

- 환경변수를 제거하거나 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`로 설정하면 기존 프롬프트 기반 경로로 즉시 복귀한다.
- 신규 API는 별도 endpoint라 기존 `/template-clone-deck` 호출을 변경하지 않는다.

## Env 적용 현황

- 2026-09-02 현재 시점 기준으로 staging 실제 env와 staging example은 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`로 되돌린다.
- 이유: deterministic server content-fill은 JSON outline 재요청/복구 경로와 결합될 때 “JSON outline 형식을 다시 요청하는 중” 상태가 노출되거나, template seed fallback 뒤 품질이 불안정해질 수 있어 출시 기본값으로 두지 않는다.
- production 실제 env와 production example도 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`를 유지해, production은 기존 프롬프트 기반 경로를 유지한다.
- deterministic 경로는 제한된 staging env override 또는 env가 비어 있는 로컬/QA 빌드의 `localStorage.od:template-clone-fill-mode=deterministic`으로만 QA한다.
- 공통 `.env.example`에는 `prompt`와 `deterministic` 값을 모두 문서화한다. 값 변경은 Docker image bake-time 설정이라 open-design-daemon 재빌드가 필요하다.

## 검증 항목

- 기본값에서 기존 prompt-fill 경로가 JSON outline marker 없이 완성 deck artifact를 요청하는지 확인.
- prompt-fill 경로에서 cloned `deck.html`이 있어도 `[Existing deck edit]` 지시가 붙지 않고 canonical deck attachment가 제거되는지 확인.
- deterministic opt-in에서 후속 AI fill turn이 자동 전송되지 않는지 확인.
- metadata stamp가 `templateCloneContentFilled=true`로 남아 재진입/새로고침 시 다시 fill을 시작하지 않는지 확인.
- 템플릿 preview clone 실패 시 기존 복구 로직과 단건 retry가 유지되는지 확인.

## 다음 추천 작업

1. env가 비어 있는 로컬/QA 빌드에서 `localStorage.setItem('od:template-clone-fill-mode', 'deterministic')`로 제한 테스트 후 템플릿별 품질을 비교한다.
2. deterministic 결과가 충분하지 않은 템플릿은 해당 템플릿 fixture를 추가해 원인 분석한다.
3. 품질과 복구 UX가 확인된 뒤에만 staging env를 `deterministic`으로 다시 올린다.

## 2026-09-03 — `pure-prompt` 기본 승격(루프409)

**결정:** env-empty 시 기본 fill 모드를 `'prompt'`(Clone LOOK seed + prompt-fill 마커)에서 `'pure-prompt'`(Clone 스킵, 순수 프롬프트)로 승격.

**배경:** 루프379~406 동안 clone-fill 파이프라인의 salvage/heal을 촘촘히 다듬었지만 (empty leading slot, `<b>` orphan, duplicate label, 회전 pill 폭 문제, 장식 shape letterbox escape 등 매 loop마다 새로운 결함 발견), 사용자는 반복적으로 "결과가 부자연스럽다, Clone 이전의 프롬프트 방식이 더 나았다"고 응답. 매 loop마다 새로운 결함 클래스가 발견되는 것은 clone-fill이 모델에게 이중 지시(LOOK seed 참고 + 새 콘텐츠 생성)를 주어 모델 출력 형태가 예측 불가능해지기 때문이라는 가설이 강화됨. 사용자 발언 요약: "그냥 clone 쓰지 말아야하나? 하지만 궁극적으로는 clone을 써야할 것 같은데" — 즉시 안정성과 장기 방향 사이의 실용적 절충으로 기본값 승격을 선택.

**수정:**

1. `TEMPLATE_CLONE_FILL_DEFAULT_MODE = 'pure-prompt'` 상수 신설(`apps/web/src/teamver/templateCloneContentFill.ts`). `getTemplateCloneFillMode()`가 env-empty 시 이 상수를 반환.
2. `normalizeTemplateCloneFillMode(unknown)`이 unknown/empty를 `TEMPLATE_CLONE_FILL_DEFAULT_MODE`로 폴백. 명시적 `'prompt'` / `'clone'` / `'clone-fill'` / `'prompt-fill'`는 여전히 clone-fill 경로로 매핑되어 명시적 opt-in이 가능.
3. Production 배포는 이미 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`를 명시했으므로 이번 승격의 영향을 받지 않음(env가 명시되어 있으면 항상 env가 우선). 오직 env-empty 배포(로컬/QA/미설정 staging)만 자동으로 pure-prompt로 전환.
4. `apps/web/tests/teamver/templateCloneContentFill.test.ts` 업데이트: 30 assertions pass — (a) empty/unknown → pure-prompt, (b) explicit `prompt` 및 aliases → prompt, (c) 6개 pure-prompt aliases 모두 정규화, (d) explicit `=prompt` env는 legacy 유지, (e) deterministic 여전히 explicit opt-in.

**언제 clone-fill로 되돌리나:**

- Production처럼 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`를 명시하면 즉시 legacy clone-fill.
- 로컬 A/B 테스트: `localStorage.od:template-clone-fill-mode=prompt`로도 opt-in 가능(env가 empty일 때만).
- 세 번째 값 `deterministic`은 여전히 `=deterministic`으로만 opt-in.

**롤백:**

- 이 승격 자체를 되돌리려면 `TEMPLATE_CLONE_FILL_DEFAULT_MODE`를 `'prompt'`로 복원.
- Clone infra(daemon `/template-clone-deck` endpoint, prompt-fill contract, LOOK seed builder, salvage/heal 파이프라인)는 하나도 삭제되지 않음. 언제든 opt-in 하나로 활성화.

**다음 후속 작업:**

1. Staging QA에서 pure-prompt 승격의 실제 사용자 만족도 재확인 후 Production env를 `=prompt`에서 empty(=pure-prompt)로 승격할지 결정.
2. clone-fill 자체 품질 개선은 별도 track — salvage/heal의 defect surface가 여전히 크므로, 근본적 개선은 시스템 프롬프트 재설계(clone contract 단순화)와 slot-fill 스키마 강화에서 나올 가능성.
3. 사용자용 in-app 토글(설정에서 clone/pure-prompt/deterministic 선택)이 필요한지 검토.

## 2026-09-03 — `pure-prompt` 세 번째 모드(루프401)

**배경:** `prompt` (Clone LOOK seed + prompt-fill 마커) 및 `deterministic` (server content-fill / JSON slot-fill) 두 모드 모두 결과 품질이 "Clone 도입 이전의 순수 프롬프트 방식"보다 완성도가 부족하다는 사용자 리포트(2026-09-03). Clone LOOK seed의 존재 자체가 문제라기보다는, prompt-fill 마커와 clone contract(`TEAMVER_TEMPLATE_CLONE_PROMPT_FILL_CONTRACT`)가 모델에게 이중 지시("LOOK seed를 참고해라" + "새 콘텐츠를 만들어라")를 걸어 자연스러운 출력이 저해된다는 가설.

**신규 세 번째 모드 `pure-prompt`(루프401):**

- FE는 `seedTemplateClonedDeck` 호출과 `queueTemplateClonePromptFill` / `buildTemplateClonePromptFillSeed` 호출을 모두 건너뛴다. Daemon LOOK seed도 생성되지 않는다.
- 대신 표준 create 경로(`canvasCreateSlidesRunPrompt` / 홈 auto-send `derivedPendingPrompt`)로 폴백하되, `selectedDeckTemplateId` + `selectedDeckTemplateTitle`(및 skillIds)는 그대로 outgoing meta에 유지한다.
- 결과: `composeTeamverSlideApiPrompt`는 여전히 `## Selected deck template — X — MUST MATCH THIS VISUAL SPEC` + `## Template visual kit (from example.html)` 블록을 시스템 프롬프트에 포함한다(kit 색·폰트·모티프 유지). 그러나 clone 마커 / clone contract는 없어서 모델이 kit 스펙을 참고한 뒤 자유롭게 완성 deck HTML을 생성한다 — Clone 도입 이전의 프롬프트 방식과 동일한 흐름.
- 후속 salvage / heal 파이프라인은 모드에 무관하게 동일하게 동작한다(`salvageMalformedMiniMaxSlideMarkup`, `healAiGeneratedDeckMarkup`, kit-specific restyle 등).

**FE 스위치:**

- `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=pure-prompt` 또는 aliases `no-seed` / `skip-seed` / `no-clone` / `pre-clone` / `legacy-prompt` 중 어느 것이든 opt-in 가능.
- env가 비어 있는 로컬/QA 빌드에서는 `localStorage.od:template-clone-fill-mode=pure-prompt`도 동일하게 동작(env가 있으면 env가 우선).
- 새 helper `shouldSkipTemplateCloneSeed()`가 `apps/web/src/App.tsx`(홈 Canvas import 및 홈 wizard/gallery/community 두 분기)와 `apps/web/src/components/ChatComposer.tsx`(Canvas confirm 및 Drive confirm 두 분기) 총 네 개 clone-seeding 진입점에서 가드 조건으로 사용된다. `true`이면 clone 관련 코드 블록 전체가 스킵되어 표준 create 경로로 자연스럽게 폴백한다.

**롤백:**

- env를 지우거나 `prompt`로 재설정하면 즉시 기존 Clone + prompt-fill 경로로 돌아온다. `pure-prompt` 모드는 절대 기본값이 아니며, 명시적 opt-in 시에만 동작한다.
- daemon측 endpoint(`/template-clone-deck`)는 그대로 유지되며, `pure-prompt` 모드에서는 단순히 호출되지 않는다.

**검증:**

- `apps/web/tests/teamver/templateCloneContentFill.test.ts` — `pure-prompt`, `no-seed`, `no-clone`, `pre-clone`, `legacy-prompt` 등 alias가 모두 정규화되고, env 반영 시 `shouldSkipTemplateCloneSeed()`가 true를 반환하며, 그 상태에서도 `shouldUseDeterministicTemplateCloneFill()`은 false를 유지하는지 확인.
- 관련 web / contracts 테스트에서 회귀 없음(pre-existing 실패만 유지).

**다음 후속:**

1. `pure-prompt` opt-in 후 실제 사용자 워크로드에서 완성도 비교(A/B) — 만족스러우면 문서화된 QA/staging 설정으로 승격.
2. 개별 사용자·프로젝트 단위 opt-in UI(설정 토글)이 필요하면 추가 wiring 검토 — 현재는 env / localStorage로만 opt-in.
3. `pure-prompt` 모드에서도 kit spec가 시스템 프롬프트에 실제로 실리는지 최소한의 통합 테스트로 pinning(FE→backend). 현 시점에서는 `composeTeamverSlideApiPrompt` 단위 테스트만 존재.

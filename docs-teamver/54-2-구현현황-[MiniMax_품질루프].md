# 54-2 구현현황 — MiniMax 품질 루프

**기획:** [54](./54_MiniMax_전환_기획_설계.md)  
**설계:** [54-1](./54-1_MiniMax_전환_개발설계.md)

MiniMax compact fill 이후 반복되는 품질·오류 항목. 체크는 코드에 가드가 있고 빨간 스펙이 초록으로 돌아간 경우만 표시합니다.

## 2026-09-01 현재 판단 · Template Clone content-fill

### 루프320 — Clone seed를 visual baseline으로 명시

현재 템플릿 적용은 순수 deterministic DOM slot-fill이 아니라, daemon `template-clone-deck`이 선택 템플릿 `example.html` 기반 LOOK seed를 만든 뒤 AI content-fill로 실제 내용을 채우는 하이브리드다. 따라서 prompt가 “Motif/CSS는 저장 후 merge”라고 표현하면 모델이 대표 장식·아이콘·색상 cue를 생략하거나 generic shape로 대체할 수 있다.

수정: FE content-fill seed / ProjectView clone-fill instruction / runtime auto-continue / daemon selected-template prompt / contracts compact template prompt를 모두 “Clone seed가 DOM/style baseline”으로 통일했다. full example dump와 대형 SVG 선두 출력은 계속 금지하지만, 결과 deck 안에 visible kit motif/deco anchor를 직접 넣도록 요구한다. 빈 `.deco` shell은 motif로 보지 않는다.

검증: contracts system-prompt-api-mode · template-visual-kit · teamver-selected-template-compose · deck-framework-compact · template-clone-fill, web templateCloneContentFill · runtime/resume.

**후속 (진행 중):** [0901-N02-2](./0901-N02-2-구현설계-[Clone_slot-fill].md) · [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md) — B1–B5 · C–C12 · D · 루프368–374. MiniMax live 가드 ☑(키 있으면 slot-fill smoke). 루프366 vitest+chrome bake ☑ · filmstrip C3 ☑.

다음 추천 작업:
1. MiniMax 키 환경 Clone fill live smoke (`deploy/teamver/.env` 또는 `MINIMAX_API_KEY`)
2. FileViewer ←/→ tools-dev + Teamver BFF GUI bake(선택)
3. peer-fit을 다른 템플릿 카드 셸로 확장(선택)
4. sticky chrome deny 목록 점검(선택)

2. FileViewer ←/→ tools-dev + Teamver BFF GUI bake(선택)
3. peer-fit을 다른 템플릿 카드 셸로 확장(선택)
4. sticky chrome deny 목록 점검(선택)


### 빈 칸 번호 카드 (코드명 leftover)

3열을 맞추려고 모델이 넣은, **칸 번호만 있는 카드**. 슬라이드에 쓸 제목·본문이 아닙니다.

| 말 | 뜻 |
|---|---|
| 제거 | 카드 전체가 칸 번호뿐이면 그 칸을 지움. 예: `열네째`, `기둥 카`, `PILLAR 3`, `스무 번째` |
| 유지 | 번호 뒤에 본문이 있으면 둠. 예: `열네째 실카피`, `스무 번째 실카피`. KPI `10%`, 단원 `UNIT 3`도 둠 |
| 문자·서수 트랙 | A–Z / 가…하 / 첫째…스무 번째까지 닫힘(루프355). 다음 칸 번호를 새로 만들지 않음 |

`기둥` / `PILLAR` / `Phase`는 모델이 붙이는 접두일 뿐, 발표 용어가 아닙니다. extra-copy·stub는 주제 단어 목록이 아닙니다(루프259·265).

## 2026-09-02 현재 판단 · 최신 루프

### 루프414 — deterministic Home MiniMax JSON fill 제거

체감: 생성 직후 MiniMax `AGENT_EXECUTION_FAILED`. Home이 서버 slot-fill 뒤에도 JSON-only fill을 자동 전송.

수정: Home은 서버 content-fill만. `=prompt`는 HTML rewrite 유지. `json`은 명시 opt-in.

### 루프413 — Clone을 LOOK seed + dense JSON slot-fill로 복구

체감: 명시 템플릿 motif가 사라지고 카드 본문이 비며 HTML rewrite는 배치가 무너짐. `pure-prompt`는 우회.

수정: 기본 모드 `deterministic` · 스키마 `kicker`/`lead`/`items[]{title,body}`로 카드·스탯 본문 충전 · `=prompt`는 JSON slot-fill로 재매핑 · HTML rewrite는 `prompt-fill`만. 설계: [0901-N02-17](./0901-N02-17-구현설계-[Clone_dense-json-slot-fill].md).

검증: web mode 정규화 · contracts dense items/outline/fill.

### 루프412 — MiniMax `AGENT_EXECUTION_STALLED` (SSE idle 5분 과단)

체감: BYOK MiniMax 생성 중 `error_code: AGENT_EXECUTION_STALLED` / 「생성이 응답하지 않아 중단했습니다」. run_id n/a는 API 경로 정상. pure-prompt 풀 덱은 장 사이·thinking에 SSE가 수 분 멈출 수 있는데 FE/daemon idle이 5분이라 조기 절단.

수정: deck `minOutputTokens` 런은 FE idle **10분** · daemon `OD_BYOK_PROXY_INACTIVITY` default 10분 · staging env 명시 600000 · stale API force-fail 11분(idle보다 위).

검증: web api-proxy idle · backgroundChatRecovery stale API constants.

### 루프411 — 8–10→15 잔여 경로

체감: 루프405 이후에도 LOOK 시드/`close this turn` 미파싱 · prompt-fill 시드 복사 · persist 후단 재증가로 15장이 남을 수 있음. honor shrink가 Source 제목 5장을 캡 3으로 자름.

수정: 시드 힌트 honor max · 11+ 시드 패딩 금지 · honor≥5만 shrink · prompt-fill hard cap · persist 최종 trim · 미지정 first-fill 6.

검증: contracts template-clone-fill / system-prompt · web ceiling / fill seed · daemon clone-deck.

### 루프410 — staging을 `pure-prompt`로 승격 + kit 스펙 pin

체감: 루프409가 env-empty default만 바꿔도 staging은 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`라 사용자 QA 경로가 여전히 Clone LOOK seed. pure-prompt 품질 가설을 staging에서 검증할 수 없음.

수정: `.env.staging.example`(및 로컬 `.env.staging`) → `pure-prompt` · production은 `=prompt` 유지 · `composeTeamverSlideApiPrompt`가 clone-fill 마커 없이도 Selected deck template + Template visual kit를 실는지 contracts pin · App skip-seed 가드 주석/캔버스 launch pin.

검증: contracts `system-prompt-api-mode` loop410 · web canvas-slide-launch pin.

### 루프409 — env-empty 기본 fill 모드를 `pure-prompt`로 승격 (Clone은 명시 opt-in)

체감: 루프379~406에서 clone-fill salvage/heal을 매 loop 다듬어도 사용자는 반복적으로 "결과가 부자연스럽다", 이번엔 "그냥 clone 쓰지 말아야하나?"라고 명시적으로 clone 사용 재검토 요청. 매 loop마다 새로운 결함 클래스 발견 = clone-fill의 이중 지시(LOOK seed 참고 + 새 콘텐츠 생성)가 근본 원인이라는 가설 강화.

수정: 신규 `TEMPLATE_CLONE_FILL_DEFAULT_MODE = 'pure-prompt'` · `getTemplateCloneFillMode`가 env/localStorage/unknown 모두 이 default로 폴백 · `normalizeTemplateCloneFillMode`가 명시적 `'prompt'`/`'clone'`/`'clone-fill'`/`'prompt-fill'`을 여전히 legacy clone-fill로 매핑하여 opt-in 유지 · unknown/empty만 default로 폴백. Production env(`=prompt`)는 명시되어 있으므로 무영향, env-empty 배포(로컬/QA)만 자동 전환.

검증: `templateCloneContentFill.test.ts` 30/30 pass — empty/unknown → pure-prompt, explicit prompt/clone aliases → prompt, 6개 pure-prompt aliases 정규화, explicit `=prompt` legacy 유지, deterministic 여전히 explicit. rollback-switch 문서에 결정 배경 · 수정 상세 · 롤백 방법 · 다음 후속 작업 문서화.

의미: 사용자 로컬/QA(env 없음)에서 즉시 pure-prompt 활성. Production 무영향. Clone infra 완전 보전(daemon endpoint · prompt-fill contract · LOOK seed · 루프379~406 salvage/heal 모두 유지, pure-prompt 결과에도 그대로 적용).

한계: default 정책만 바꿈. clone-fill 자체 품질 개선은 별개 track.

### 루프408 — 숨은 top-up이 busy 시 유저 대기열에 주차되던 배수

체감: 루프407로 스트립은 숨겼지만, live abort busy면 `handleSend`가 top-up을 일반 대기열에 넣고 `false`를 반환해 count rollback + 숨은 큐 잔류가 남음. 실패 직후 「대기 중」에 sentinel이 보이던 경로의 근본.

수정: busy 시 model-only는 **큐에 넣지 않음** · top-up은 phantom streaming 정리 + abort 중 busy retry(최대 3) · localStorage restore 시 automation 행 purge.

검증: web `project-view-message-load` · `slideCountTopUp` · `chat-message-render`.

### 루프407 — 숨은 top-up이 채팅 대기열에 노출

체감: 생성 실패 직후 사용자가 조작하지 않았는데 「1 대기 중」에 `[od:slide_count_top_up] The curre...` + 스킬 칩이 보임. 채팅 말풍선은 숨기지만 busy 시 `handleSend`가 동일 프롬프트를 일반 대기열에 넣어 노출.

수정: `isHiddenAutomationQueuedSend` — prompt/entryFrom으로 top-up·auto-continue·slot-fill repair 판별 · ProjectView 대기열 매핑 + ChatPane strip에서 제외(배수 큐는 유지) · summarize 안전망.

검증: web `chat-message-render` · `project-view-message-load`.

### 루프406 — letterbox로 새어 나가는 장식 shape 재부모화

체감: 슬라이드 밖 어두운 letterbox에 pink/blue 회전 사각형(위) + yellow 사각형·purple 원(아래)이 그려짐. `.slide { overflow: visible }`(Motif chrome용)에 의해 non-Motif ad-hoc `position:absolute` shape가 slide sibling으로 escape.

수정: 신규 `reparentEscapedDecoIntoSlideFlow` — non-Motif · background paint 있음 · 리프 텍스트 40자 이하 · 중첩 block 없음 조건의 shape div를 `[data-od-slide-flow]` 앞부분에 재부모화. Flow의 `overflow:hidden` + `inset:0`이 shape를 1920×1080에서 클리핑하되 원래 좌표는 유지되어 시각 위치 보존. Motif chrome(`data-od-official-motif-html`/`.deco-*`/`.pill`/`.stamp`/`.ribbon`/`.corner-bracket`/`.starfield`/등)은 절대 손대지 않음. `salvage`의 `normalizeRotatedInlinePills`와 `healOrphanRadialCircles` 사이에 wire.

검증: 신규 9/9 pass · 사용자 리포트 fixture 재현 · Motif control 보전 · idempotent · flow 없으면 no-op · background/텍스트/motif class 각각 skip · end-to-end salvage 검증. contracts 2989 pass / 1 skip / 2 pre-existing fail(무관). 시각 pre/post 비교로 letterbox의 escape shape 완전 clipping 확인.

**참고:** 앞서 loop405가 병렬 에이전트에 의해 “8–10 요청 15장 오버슈트”에 사용되어 이 heal은 loop406으로 재번호. 코드·doc·rollback switch 문서 모두 loop406으로 통일.

### 루프405 — 8–10 요청 15장 오버슈트

체감: 8–10을 요청했는데 15장까지 생성. 루프402가 “6장 정지 금지”만 강조하고 10장 상한이 없음. JSON max 20 · expansion 아크 · 템플릿 15장 데모가 합쳐짐.

수정: honor hard cap 10 · outline/slot-fill shrink · persist trim(1–10만) · 15장은 failed overshoot.

검증: contracts compact/system-prompt/outline/heal · web ceiling.

### 루프404 — 장수 게이트 incomplete_output 회귀

체감: `produced 1, min 8` → persist `skipped-incomplete` → durable `incomplete_output`. 루프402 장수 게이트가 디스크 쓰기를 막아 top-up이 예약되지 않았고 prompt-fill LOOK seed 복구도 없음.

수정: 장수 shortfall은 저장 허용(top-up salvage) · 구조 게이트 유지 · LOOK seed recovery를 prompt-fill에도 적용.

검증: web `project-view-message-merge` · `slideCountTopUp`.

### 루프402 — 명시 8–10 first-fill 한 턴

체감: Standard 8–10을 골라도 첫 턴이 6장 + 숨김 top-up. 계보/`slideCountHint`는 루프395–400이 고쳤지만 스트리밍 READ LAST가 `at least 6` / `close 6 THIS TURN`을 그대로 가르침(백틱 있는 문구만 바꿔서 교체가 빗나감).

수정: honor hint로 스트리밍·compact 장수 문구를 8–10으로 교체 · honor READ LAST · `firstFillSlideCountHint`에 durable/plugin slideCount · auto-continue 7–10 OVERRIDE. 8장 마감은 top-up 없음. 6장 미스는 salvage.

검증: contracts compact/system-prompt · web topUp/resume/recovery/project-view pin.

### 루프401 — `pure-prompt` opt-in 세 번째 fill 모드

체감: 루프390~397 salvage/heal 개선과 루프398~400 Capsule/Spec-Hint 정합 이후에도 사용자가 "결과가 부자연스럽다, Clone 이전의 프롬프트 방식이 완성도 측면에서 더 나았다"고 명시적으로 언급. `prompt` 모드도 daemon LOOK seed + `TEAMVER_TEMPLATE_CLONE_PROMPT_FILL_CONTRACT` 이중 지시(LOOK seed 참고 + 새 콘텐츠 생성)로 모델의 자연스러운 출력을 저해한다는 가설.

수정: `TemplateCloneFillMode`에 세 번째 값 `'pure-prompt'` 추가(6개 alias 정규화) · 신규 `shouldSkipTemplateCloneSeed()` · App.tsx 2곳 + ChatComposer.tsx 2곳 총 4개 clone-seeding 진입점에 `!shouldSkipTemplateCloneSeed()` 가드 추가. `true`이면 clone 전체 블록 skip, 표준 create 경로(`canvasCreateSlidesRunPrompt` / 홈 auto-send `derivedPendingPrompt`)로 폴백. `selectedDeckTemplateId` + `skillIds`는 outgoing meta에 유지 → 시스템 프롬프트에 kit spec은 그대로 로드. rollback-switch 문서에 3번째 모드 상세 명시.

opt-in: `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=pure-prompt` (alias: `no-seed` / `skip-seed` / `no-clone` / `pre-clone` / `legacy-prompt`) 또는 `localStorage.od:template-clone-fill-mode=pure-prompt`. 기본값은 여전히 `'prompt'` (기존 UX 무영향).

검증: `templateCloneContentFill.test.ts` 29/29 pass (기본 mode 검증 · 6개 alias · env 반영 · deterministic 상호배제 · 안전 폴백) · canvas-slide-launch web 테스트 회귀 없음.

한계: opt-in mechanism일 뿐 기본값 변경/clone 경로 제거는 아님. salvage/heal 자체 개선은 별개 loop.

### 루프402 — template-fill 최소 장수·구조 품질 게이트 복구

체감: 사용자가 `8~10장`을 요청했는데 6장으로 완료되고, 일부 장은 `h2`/pill 내부에 grid/card가 들어가 본문 배치가 무너졌다. 화면에는 완료로 보이지만 실제로는 “장수 부족 + 구조 붕괴” 결과였다.

수정: template clone content-fill/prompt-fill 저장 전 게이트를 다시 활성화하되, 1~3장 소형 요청/초안은 기존처럼 허용한다. 명시 최소 4장 이상 요청에서 produced count가 최소치보다 작으면 `skipped-incomplete`로 보내고, salvage 이후에도 heading 안에 block/grid가 남으면 저장하지 않는다. JSON/outline fallback이 `slideCount`를 최대 6장으로 자르던 cap도 제거해 요청 장수를 `TEMPLATE_CLONE_OUTLINE_MAX_SLIDES`까지 보존한다.

검증: web `project-view-message-merge` · `templateCloneContentFill` · `slideCountTopUp`, contracts `template-clone-outline` · `template-clone-fill` · `system-prompt-api-mode`.

### 루프403 — Capsule 중첩 카드·표지 pill·badge 오핀·stutter salvage

체감(사용자 HTML): Capsule 결과에서 카드가 `</div>` 누락으로 중첩되어 1열 붕괴 · title-pill `표지` · A/1 콘텐츠 badge가 Motif deco로 absolute 핀 · stray `AI`/`LLM` · 미닫힌 h2·중첩 h4 · closing stutter · `neuralstudio.kr 회사` 표지.

수정: flattenNestedBorderPadCards · scrubGenericTitlePills · deco pin min-width/flex badge 제외 · stripStrayInlineAcronyms · dedupeHeadingPhraseStutter · h4 typo repair · repeat(1)→N · host crumb 제목 polish.

검증: contracts 루프403 fixture.

### 루프400 — Spec/Hint 통일 · Capsule Motif 보존 · SVG stub · flex/heading salvage

체감: auto-continue Hint와 top-up Spec 우선순위 불일치 · Capsule IB restyle이 Motif/floating-pills 폐기 · Motif SVG만 있는 장이 drop 안 됨 · flex 카드가 chrome-pill에 잔존 · `<span style=flex>` 앞 orphan h2 · sibling `<b>1</b><b>99+` · Capsule fingerprint/neo cream 재주입.

수정: Hint→Spec 공유 · Motif chrome 재부착 · SVG 비텍스트 empty · flex chrome extract · orphan heading flex host · sibling bold · Capsule soft fingerprint · ensureNeoBrutal soft skip · visible seed-line strip.

검증: contracts 루프400 · web recovery/topUp.

### 루프399 — bare slideCount hint · merge cap · Capsule h1/deco/rotated

체감: brief-only `runContext.slideCountHint="8-10"`이 auto-continue phrase 경로에서 단위 없어 null · server stability-cap이 local durable 8–10을 덮음 · Capsule `h1` without `.display` IB leftover 미restyle · relative deco-pill flex 공간 강탈 · `<span>OVERVIEW</span>` 회전 pill 미정규화 · coral+neo cream without `--bg` 노란 letterbox.

수정: `parseSlideCountPhrase` bare range/number · mergeServerMessageWithLocal durable-over-cap · kit cover h1 restyle · Capsule deco pin · rotated inline-child · surface skip neo cream when coral.

검증: contracts 루프398/399 · web recovery/surface/topUp.

### 루프398 — Capsule soft wash · chrome-pill · 표지 stub · plain nested bold

체감: Capsule letterbox가 neo `--cream:#FFDC8B` · title-pill에 Features grid 중첩 · `표지`만 있는 IB stub 1페이지 · `<b>1 <b>1200+개` (쉼표 없는) typo · brief-only 후 slideCountHint 유실.

수정: cream vs `--bg` surface · chrome-pill extract 임계/title-pill · Hangul `표지` stub empty · plain nested bold · durable uncapped hint persist + field-merge runContext.

검증: contracts 루프398 · web surface/topUp.

### 루프395 — 중첩 `<b>N <b>N,NNN` 숫자 typo 접두 · 문장 종결 부호 스터터

체감: 루프394 이후 구조는 안정. 그러나 슬라이드 3에서 `자체 큐레이션한 1 1,200+개 문화 콘텐츠를…`(브라우저 렌더는 `11,200+개`로 붙어보임)와 슬라이드 4 Step 01의 `30분 . .` 스터터가 남음. 모두 모델 오타/스터터.

수정: 신규 `stripNestedBoldNumberTypoPrefix`(outer `<b>N ` 접두가 즉시 nested `<b>N,NNN…</b>` 앞이면 outer 접두만 drop, 강조 체인 `<b>1위 <b>SaaS</b></b>`는 inner가 숫자 패턴이 아니므로 보전) · 신규 `dedupeAdjacentSentencePunctuation`(`.`/`!`/`?` + optional 닫힘태그 + 공백 + 같은 부호 stutter collapse, negative look-behind/-ahead로 `...`/`!!!`/`????` 보전) · salvage 파이프라인에 `unwrapStrayBoldShells` 후 typo prefix, `collapseAdjacentDuplicateLabelDivs` 후 punct dedupe wire.

검증: 신규 11 pass · contracts 2964 pass · 시각 pre/post — `11,200+개`→`1,200+개`, `30분..`→`30분.`, 4단계 카드 안에 설명이 완전 재봉합됨(루프394 flex 재조립과 결합).

### 루프397 — 회전 pill의 inline-block 정규화

체감: 슬라이드 2 `OVERVIEW` 라벨이 `display:inline-block`/`width` 없이 `transform:rotate(4deg)`만 걸린 block-level `<div>`라 부모 전체 폭을 차지하고 회전하여 슬라이드를 가로지르는 거대한 분홍 대각선 바로 렌더, 콘텐츠 압도. 같은 모델이 커버의 `SERVICE INTRODUCTION`은 `display:inline-block;width:fit-content;`로 올바르게 emit — 케이스마다 일관성 없음.

수정: 신규 `normalizeRotatedInlinePills` — `transform:rotate` + `padding` + `background` + `border|box-shadow` + leaf 텍스트 2–120자 + `display:inline*|flex|grid` 없음 + `width:` 없음 조건 모두 충족 시 `display:inline-block;width:fit-content;`를 style 뒤에 추가. `salvage` 파이프라인에 deco pin 직후 wire. 회전 없는 CTA bar, 이미 inline-block, width 지정, 긴 문단은 노-op.

검증: 신규 10/10 pass · contracts 2975 pass · 시각 pre/post — 분홍 대각선 바 → 좌상단 소형 회전 pill, 하단 콘텐츠 정상.

### 루프396 — Capsule IB 표지 · heading/pill salvage · runContext 8–10 top-up

체감: Capsule인데 IB 매거진 표지 · header-pill/미닫힌 h2에 카드 중첩 · 8–10이 6장으로 끝(brief-only persist).

수정: Capsule restyle · closeOrphanHeadings · extractBlocksFromChromePills · absorbTrailingContentIntoSlideFlow · runContext.slideCountHint · Capsule --bg surface.

### 루프394-후속 — 8-bit orbit `.starfield` idempotency + 사용자 리포트 fixture

체감: 루프394 병렬 커밋이 사용자 리포트 3개 결함(empty leading slot · `<b>` orphan · duplicate label)을 잡았으나 별도 재현 케이스 발견: 루프390 `restyleForeignIbMagazineCover` 8-bit orbit 분기가 만드는 `.starfield`에 style 속성이 없어 `restoreAtmosphericOverlayPositioning`(loop392)가 2회차 salvage에서 재-styling → salvage idempotency 깨짐.

수정: `restyleForeignIbMagazineCover`의 새 `.starfield`에 `position:absolute;inset:0;pointer-events:none;` 인라인 style 미리 부착. 신규 사용자 리포트 fixture(`teamver-neubrutal-empty-lead-and-b-orphan.html`) + 통합 테스트 9/9 pass(dropEmptyDeckSlides leading drop · all-empty fallback · unwrapStrayBoldShells 드레인 · 컨텐츠 있는 `<b>` 보전 · collapseAdjacentDuplicateLabelDivs twin 접기 · end-to-end salvage · idempotency · `.starfield` 회귀 가드).

검증: 신규 9 pass · 기존 8-bit orbit 통합 테스트도 idempotency 회복 · contracts 2953 pass / 1 skip / 1 pre-existing fail(무관).

### 루프394 — 빈 1페이지 · neo deco flatten · 깨진 flex step

체감: filmstrip 1/N 빈 cream·sentinel · deco relative로 상단 몰림 · `<b>`/조기 close로 How-it-works 붕괴 · Impact 라벨 중복.

수정: dropEmpty 첫 슬라이드 포함 · salvage에서 sentinel strip 선행 · pinNeoBrutalEmptyDecoBlocks · unwrapStrayBold · rejoinPrematureFlex · absorbOrphanFlexStep · collapseAdjacentDuplicateLabelDivs.

### 루프393 — 학습 노트 drop · empty pricing li · 비교표 orphan

체감: non-IB에 `학습 노트` leftover · pricing 빈 li · comparison orphan 셀.

수정: dropStudyNotesChromeOnNonIbKits · mixed empty li strip · absorbOrphanComparisonTrackCells · invent `표지`로 완화.

### 루프392 — 8-bit atmospheric flatten · 비교표 · dark surface

체감: starfield relative flatten · nested comparison grid 붕괴 · cream letterbox on navy.

수정: pin/neutralize starfield 제외 · restoreAtmospheric · flattenNestedComparisonGridRows · dark-void > cream surface pick.

### 루프391 — Clone 호스트 계약은 시스템 프롬프트 · user turn은 brief만

채팅 숨김(382)만으로는 재발한다. persist는 brief만 남기고, HTML-fill 계약은 `templateClonePromptFill` 시스템 프롬프트가 맡는다. 계보는 `runContext.templateCloneFill`. Expo worked example은 주제 중립. strip은 안전망.

### 루프390-후속 — non-IB 시그널 확장 · 사용자 리포트 fixture 통합 테스트

체감: 루프390이 사용자 리포트 표지 leak를 잡았으나 신호 감지가 8-bit / neubrutal 위주. `.pixel-corners`/`.pixel-face`/`.pixel-avatar-zone`/`--soft-lavender`/`.hc-scanlines`/`.gd-orb`/`.post-it` 같은 확장 kit이 스캔 밖. 또 사용자 리포트 fixture가 없어 다음 회귀 감지가 어려움.

수정: `destHasNonIbKitSignals`에 (1) pixel chrome 확장(`.pixel-corners`/`.pixel-btn`/`.pixel-face`/`.pixel-avatar-zone`) (2) 추가 kit 토큰(`--soft-lavender`/`--neon-yellow` 정의/사용) (3) 확장 motif deco(`.starfield`/`.hc-scanlines`/`.hc-grid`/`.xp-blob`/`.gd-orb`/`.post-it`/`.floating-pills`/`.petals`) (4) `data-od-neobrutal-var-fallback` 자체 존재 신호. 사용자 리포트 fixture `teamver-8bit-orbit-ib-cover-leak.html` + 통합 테스트 8/8(officialLookIs8BitOrbit 지문 · heal skip · restyle 결과 shape · 후속 pixel-orbit 슬라이드 보존 · idempotent · neo fallback strip · salvage end-to-end + idempotent).

검증: 신규 8 pass · contracts 전체 2939 pass / 1 skip / 0 fail (baseline 대비 URL-brief 회귀도 회복).

### 루프390 — 8-Bit Orbit 위 IB 매거진 표지

체감: 본문은 8-bit dark pixel인데 표지만 cream `학습 노트` 매거진 + neo cream var fallback.

수정: non-IB 신호에 pixel kit · restyle → pixel-hero 표지 · neo fallback strip/skip · generic `슬라이드`가 URL brief 브랜드를 덮지 않음.

### 루프389 — preview/salvage에 URL 표지 heal 연결

체감: Cobalt 표지 URL 크럼이 persist heal 코드가 있어도 preview에 남음. srcdoc가 cover-title heal을 스킵.

수정: rewriteRawUrlSiteCoverTitles · salvage/srcdoc/preview remmerge 연결 · Cobalt DOM 감지 · URL brief → 팀버 rescue.

### 루프388 — Cobalt raw URL 커버 제목

체감: Cobalt Grid 표지가 `www.teamver.com 사이` + sparse cream. instruction-copy 게이트가 URL 크럼을 놓침.

수정: URL/사이 제목을 failed-generate로 분류 · Cobalt subkicker enrich · prompt 가드.

### 루프387 — Block Frame 위 IB 매거진 커버

체감: look은 Zhangzara Block Frame인데 MiniMax가 IB magazine 표지(학습 노트 · truncated `사이`) 1장만 냄.

수정: neo-brutal foreign IB → hero-frame restyle · sparse magazine cover 금지 · URL 제목 polish · `--paper` alias · prompt IB chrome 가드. **다장 top-up은 별도** — 이번 슬라이스는 표지 셸/카피.

### 루프386 — Key Numbers loose stats + CSS var fallback

체감: Core Pillars~Close body-first HTML에서 Key Numbers grid 붕괴(숫자·라벨 흩어짐 + 빈 card), look CSS 누락으로 neo-brutal 색 미적용, 허구 지표/빈 pricing li/깨진 Edge 비교표.

수정: `wrapLooseStatMetricPairsIntoCards` · `ensureNeoBrutalCssVariableFallback` · prompt-fill KPI/완성 카드 가드. 비교표 salvage·pricing empty-li는 후속.

검증: contracts 루프386 3 · web seed KPI assert.

### 루프383 — prompt-fill 다장→1장 체감

compact bootstrap 400ms 재시도가 next 후 slide 0으로 스냅백. prompt-fill이 short-deck top-up을 못 타던 갭 수정.

### 루프382 — Clone prompt-fill 호스트 계약 채팅 노출 + Expo 예시 누수

`[Template clone prompt fill]`이 채팅 숨김 목록에 없어 사용자 brief 뒤로 전체 계약이 보임. user-turn seed에 시스템용 Expo worked example이 붙어 teamver.com 요청에도 Expo가 본문으로 샐 수 있음. 숨김 확대 · seed에서 예시 제거 · HTML host-contract heal.

### 루프379 — pin 배경 flatten · persist salvage · orphan repeat grid

pin이 kit `.slide-N` wash를 흰색으로 덮고, salvage가 persist에 없어 깨진 HTML이 disk에 남음. size-only pin + persist salvage + `repeat(N)` 고아 카드 재부모.

### 루프378 — leftover host-nav 불변식 (첫 장 nudge 재발 봉쇄)

지문 단위 가드(361·363·366·374) 뒤에도 deco residue · clone-size-only · `gotoIndex`가 translate/scroll로 떨어지면 ~800px iframe에서 첫 장만 밀린다. leftover는 `leftoverHostNavMustPaintByDisplay`가 display toggle을 먼저 강제한다. 공식 IB pin-only ROW는 마커/1920 leftover가 없어 F3 `translateX(-1920px)` 유지.

### 루프377 — MiniMax 깨진 heading / 빈 카드 / orphan split

편집 턴이 `</p>/h3>` · 중첩 heading · 빈 border 카드를 남기고, `split-content`만 있으면 flow가 row로 좌반만 씀. salvage + column-center CSS.

### 루프375 — block-frame hero/split 레이아웃

`data-od-slide-flow`가 `.slide-1`의 center와 `.slide-6`의 row를 무시해 hero가 좌상단, split이 제목만 남음. flow CSS + 빈 li 제거 + list 합성.

### 루프372 — stuck repair notice reload

loop370에서 persist된 「JSON outline 형식을 다시 요청…」 warning이 succeeded 행에 남으면 preview가 열리지 않음. conversation load에서 LOOK seed fallback 안내로 승격.

### 루프371 — Clone JSON repair loop 차단

invalid JSON outline 시 contracts는 이미 seed-fallback인데 FE가 repair auto-send를 한 번 더 띄워 「JSON outline 형식을 다시 요청…」 대기 UI와 preview 불일치가 발생. seed-fallback/skipped-incomplete는 즉시 LOOK seed 복구, FE repair loop 제거.

### 루프370 — Clone JSON repair pending UX

repair auto-send 600ms 창에 사용자가 Retry/Continue를 눌러 repair send와 경쟁하던 문제. `cloneSlotFillRepairPending`으로 ChatPane manual recovery를 auto-continue와 동일하게 억제.

검증: web ChatPane.resume-failed 루프370 · contracts redacted_thinking parse.

### 루프387 — URL-brief cover leak + non-IB kit IB-magazine rebuild 오탐

reproduce (2026-09-02 사용자 리포트): 사용자 brief `www.teamver.com 사이(트)…`가 잘려 표지 h1·footer에 그대로 노출됨. neubrutalism 템플릿 사용인데 표지가 IB magazine kit shape (`h1.display`, `.mast`, `.ribbon`, `--paper`/`--ink`)으로 렌더링되어 완전히 unstyled. neubrutalism kit CSS는 `--paper`/`--ink`를 정의하지 않아 fallback 됨.

두 층의 원인:
1. `looksLikeInstructionCopy`가 URL-only/URL+짧은 fragment brief를 걸러내지 못해서 `deriveTitleFromBrief` → `sanitizeTemplateCloneDeckTitle` → `synthesizeTemplateCloneOutlineFromBrief`가 URL을 cover 제목으로 그대로 승격.
2. `healSparseDeckCoverLayout` guard가 `officialLookIsIbMagazine(dest)`를 look CSS 기준으로 검사하는데, 이 heal은 `mergeOfficialLookCssForTemplate` **이전**에 실행됨 → look CSS 아직 없음 → guard 통과 → IB magazine shell을 rebuild → 나중에 neubrutalism kit CSS가 주입되면서 shape/vars 불일치.

수정:
1. **`looksLikeInstructionCopy` + `titleIsUrlOnlyOrUrlFragment`** — 새로운 helper 추가. `www.example.com [short korean fragment]` 형태를 instruction으로 분류. cover 후보에서 제외. 이후 `sanitizeTemplateCloneDeckTitle`은 null 반환, `synthesizeTemplateCloneOutlineFromBrief`는 null 반환 (SYNTH_GENERIC_TITLE_RE 필터), `decideTemplateCloneSlotFillTerminal`은 seed-fallback 유지.
2. **`destHasNonIbKitSignals`** — 새로운 guard signal detector. `healSparseDeckCoverLayout`에서 다음 signal 중 하나라도 있으면 IB rebuild skip:
   - Numbered slide role class (`.slide-1`, ..., `.slide-10`)
   - Named layout wrapper (`.hero-frame`, `.split-visual`, `.split-content`, `.close-frame`, `.quote-frame`)
   - Neubrutal utility prefix (`.nb-heading-*`, `.nb-card`, `.nb-label`, `.nb-btn`, `.nb-body`, `.nb-mono`)
   - Kit token vars (`--cream`, `--pink`, `--yellow`, `--offwhite`, `--hc-bg`, `--gd-bg`, ...)
   - Motif deco CSS block with kit-specific rules (`.deco-pink-rect`, `.deco-green-circle`, `.deco-yellow-bar`, `.deco-dots`)

카피 발명 없음. IB magazine rebuild는 여전히 IB stub (kit signal 없는 순수 h1-only cover)에서 동작.

**결과 (사용자 fixture):**
- Before: IB shell rebuild (h1.display, mast, ribbon, --paper/--ink 미정의) → 완전 unstyled
- After: heal skip → neubrutalism seed cover 그대로 유지 (해결 완료는 아니지만 unstyled로 붕괴 방지)

**검증:** contracts sanitize 4개 신규 · URL-brief fixture 6개 신규 · 전체 스위트 2926/2926 · web focused 118/118.

### 루프385 — grid 안 loose pill+h3+p 삼중항을 sibling chrome shell 스타일로 wrap

reproduce: 사용자 fixture slide 4에서 loop381+382가 3개 chrome shell을 grid 안으로 넣어도, 첫 번째 카드(Channels & DM)만 wrapper 없이 `pill, h3, p`가 grid의 3개 개별 셀에 흩어져 있음. 2-col grid는 pill을 왼쪽에, h3를 오른쪽에 배치해 카드가 안 보임.

수정: `wrapLoosePillHeadingTriplesInsideMixedGrid` — grid 안에 chrome shell peer(pill+heading 포함)와 loose `pill + heading + optional paragraph` 삼중항이 섞여 있으면 그 chrome shell의 스타일을 그대로 복사해 loose 삼중항을 wrap.

- style은 sibling에서 복사, 새로 발명 안 함
- 모든 자식이 이미 chrome shell이면 no-op
- chrome shell peer가 없으면 no-op (wrap 스타일을 결정할 근거 없음)
- Heading-aware child scanner (`listDirectHeadingAwareChildOpens`) 신규 — 기존 `listDirectBlockChildOpens`는 h1-h6를 스킵해서 삼중항 감지 불가

`pullOrphanChromeCardsIntoPrecedingGrid` 직후에 배치 → pull이 모든 shell을 grid로 넣은 뒤 이 wrap이 이어서 loose 삼중항까지 정리.

결과 (fixture slide 4): grid 안 4개 chrome shell 모두 uniform (Channels & DM + Shared Drive + AI Chat + AI Apps).

검증: contracts heal-ai-generated-deck 5개 신규 (basic wrap / no chrome peer no-op / all-shells no-op / no paragraph triple / healAiGeneratedDeckMarkup 통합) · integration fixture 2 신규 (grid에 shell 4개 · loop385 chrome mirror) · 전체 스위트 2917/2917.

### 루프382 — pull-orphan 슬롯 확장 (빈 grid는 최대 8개 카드까지 pull)

reproduce: loop381로 3개 chrome shell이 콘텐츠와 함께 복구됐지만 `pullOrphanChromeCardsIntoPrecedingGrid`의 기존 슬롯 캡(`decl.count - chromeInside` = 2)이 걸려 세 번째 shell(결과물+AI Apps)이 grid 밖으로 남았다.

수정: grid 안에 chrome card가 0개면(broken modify-turn 패턴) 캡을 `PULL_ORPHAN_EMPTY_GRID_CARD_CAP=8`로 올림. 그리드는 `grid-auto-rows`로 자동 확장. 기존 chrome cards가 있는 authored grid는 원래 캡 유지(intentional 여분 slot 보호).

검증: fixture slide 4가 이제 3장 모두 grid 안 · contracts 2902/2902.

### 루프383 — heading-only layout wrapper unwrap (hero centering)

reproduce: 사용자 fixture slide 2 = `<div class="split-content"><h2>Teamver — Smarter & Faster</h2></div>` — split-content padding + border-left가 heading을 half-width empty box처럼 보이게 함.

수정: `unwrapHeadingOnlyLayoutWrappers` — `.split-content`, `.hero-frame`, `.quote-frame`, `.close-frame`, `.split-visual`, `.split-pane`, `.slide-inner`, `.slide-body`, `.feature-card`, `.info-card`, `.intro-card`, `.stat-card`, `.team-card`, `.timeline-step`, `.card` 15개 layout wrapper 클래스 안에 오직 heading (h1-h6, 실제 텍스트 있음) 하나만 있으면 wrapper 제거. Body content (list/p/grid 등)가 함께 있으면 유지.

Pipeline 배치: `stripLeafEmptyListAndParagraphShells` 이후에 실행 → 빈 `<ul>` / `<p>` shell을 걷어낸 뒤 남은 heading-only wrapper도 잡음.

Nested wrappers는 pass당 outermost non-overlapping만, `unwrapTrivialSingleChildLayoutWrappers`의 2회차가 이어서 정리.

검증: contracts heal-ai-generated-deck 7개 신규 (basic unwrap / hero-frame / with-body 유지 / empty-heading 유지 / non-recognized-class 유지 / nested unwrap / healAiGeneratedDeckMarkup 통합) · integration fixture 신규 assertion `.split-content` 제거 · 전체 스위트 2910/2910.

### 루프381 — chrome shell 콘텐츠 흡수 · inline-block pill cardish 오탐 봉쇄 · orphan pull offset 버그

**reproduce:** neubrutalism 사용자 fixture 슬라이드 4 여전히 무너짐 — 4개 제품 카드 중 첫 번째만 반쯤 grid 안에 있고, 나머지 3개는 chrome shell **빈 껍데기**(padding+border)와 loose `pill+h3+p` 삼중항으로 슬라이드 flow에 흩어져 있음. `stripEmptyBorderPadCardShells`가 빈 shell을 드랍한 뒤 pill/h3/p가 아무 wrapper 없이 남아 layout이 완전 붕괴.

**세 층의 원인 + 세 층의 수정:**

**(1) 빈 shell 흡수 (source):** `absorbFollowingPillHeadingIntoEmptyChromeShell`
- 빈 chrome shell (`border: … solid` + `padding: …`, deco 정사각 제외) 뒤에 pill (inline-block+padding, ≤40자) → heading (h1-h6) → 옵션 paragraph 순서로 오는 loose sibling 삼중항을 shell 안으로 reparent.
- `stripEmptyBorderPadCardShells` 실행 이전에 배치. 흡수된 shell은 이제 콘텐츠가 있으므로 드랍 안 됨.
- Guards: 빈 shell만, heading 없으면 흡수 안 함, 이미 콘텐츠 있는 shell은 건드리지 않음, deco 정사각은 유지.

**(2) inline-block pill cardish 오탐 (pipeline poisoning):** `looksLikeChromeCardStyle`
- 기존 규칙: `padding + (background|border)` → cardish. Pill (`background:...;border:...;display:inline-block;padding:4px 14px`)이 셋 다 있어 cardish로 오탐.
- 오탐 결과: `closeUnclosedSiblingCardsInSlides`가 chrome shell 안에서 pill 열기를 만나면 pill을 "새 sibling card"로 취급, shell을 먼저 닫아버려서 pill/h3/p는 shell 밖으로 orphan. (내 흡수 heal의 결과가 파괴됨.)
- 수정: `looksLikeChromeCardStyle`에 `display:inline*` 리젝트 추가. 실제 카드는 절대 inline flow가 아님. 안전.

**(3) `pullOrphanChromeCardsIntoPrecedingGrid` 여러 orphan 배치 시 offset 시프트 버그 (pre-existing):**
- 여러 orphan chrome card를 grid로 옮길 때 각 삽입이 gridCloseStart에서 발생 → 이후 patch의 orphan positions가 삽입된 길이만큼 시프트되지만 loop는 원본 offset을 계속 사용.
- 두 번째 orphan의 slice가 잘못된 위치에서 시작, 앞선 h2 태그 안에 chrome shell 파편을 삽입해 `합니다<<div ...>` 같은 corrupted markup 생성.
- 수정: 그리드별 cumulative insertion shift `perGridInsertions`를 추적, 각 patch의 orphanStart/End에 shift 더해 새 문자열 위치로 매핑. 이 heal은 loop376의 shell 흡수 이전에는 shell이 항상 비어 있어서 pull이 그것을 orphan으로 안 봤기 때문에 버그가 겉으로 드러나지 않았음.

**결과 (사용자 fixture slide 4):**
- Before: `grid<pill,h3,p>` + h2 + 3개 빈 shell + 3개 loose `pill+h3+p`
- After: `grid<pill,h3,p, shell1<파일+Shared Drive+p>, shell2<AI+AI Chat+p>>` + h2 + `shell3<결과물+AI Apps+p>`

pull 슬롯이 2뿐이라 shell3는 grid 밖. 그래도 이제 3개 shell 모두 실제 콘텐츠를 담고 있고, h2는 온전히 닫힘. 카피 발명 없음.

**검증:** contracts template-clone-fill 신규 8개 (absorb-pill-heading-triple / bare-heading / no-heading-no-absorb / already-filled / non-chrome-style / chain-of-shells / idempotent / deco-square 유지) · heal-ai-generated-deck 회귀 · integration fixture 11 (신규 2: chrome shell 콘텐츠 유지 · h2 corruption 방지) · 전체 스위트 2901/2901 · web focused 78/78.

### 루프380 — modify-turn `<ul>`/`<p>` 빈 shell heal + fixture 회귀 봉쇄

**reproduce:** neubrutalism 첨부 HTML (2026-09-02 사용자 리포트) fixture 저장. 최초 fill 이후 "수정 반영" 턴이 만든 HTML을 `salvageMalformedMiniMaxSlideMarkup + healAiGeneratedDeckMarkup` 전체에 통과시켜 결과가 사용자 눈에 얼마나 정리되는지 정밀 검증.

**수정:**
1. `healAiGeneratedDeckMarkup` — `unwrapTrivialSingleChildLayoutWrappers`를 `closeUnclosedSiblingCardsInSlides` 직후로 옮겨 orphan-pull이 실제 grid 구조를 볼 수 있게 함. 첫 pass에서 idempotency 확보.
2. `stripLeafEmptyListAndParagraphShells`를 `heal-ai-generated-deck.ts`로 import + pipeline 후반부에 배치. modify-turn (slot-fill이 아닌 경로)의 `<ul class="content-list"><li></li>...</ul>`와 `<p class="hero-subtitle"></p>` shell을 정리.
3. Peer trim이 grid를 단일 카드로 줄이면 새로 trivial wrapper가 생기므로 leaf-empty strip 뒤에 unwrap 2회차.
4. `packages/contracts/tests/teamver-neubrutalism-modify-turn.integration.test.ts` — 사용자 HTML fixture 9개 회귀 (empty ul/p drop / flex wrapper unwrap / broken h3 typo repair / real body copy / kit color 유지 / lecture copy invention 방지 / brief leak 방지 / idempotency).

Motif / 데모 카드 트림 / brief 가드는 기존 heal이 계속 담당. 사용자 본문 (팀의 일이 너무 많이 흩어져 있습니다 · Channels & DM · Shared Drive 등) 그대로 유지.

**검증:** contracts heal-ai-generated-deck + neubrutalism fixture 9개 신규 · 전체 스위트 2890/2890 · web templateCloneContentFill / clone-look-seed-recovery / deck-patch-structure / comment-remap 71/71.

### 루프379 — 단일 자식 flex/grid wrapper unwrap (Clone slot-fill 후처리)

reproduce: MiniMax edit-turn이 실제 grid를 그 자체로는 아무 layout도 안 하는 flex `<div>` 안에 감쌈. 예:

```html
<div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
  <div style="display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:24px">
    ...4 cards...
  </div>
</div>
```

외곽 wrapper는 자식이 하나뿐이라 flex가 아무 것도 안 하고, `margin-bottom:24px`만 카드 위로 24px 밀어 올려 heading과 카드 사이가 어색하게 벌어진다.

원인: 모델이 이전 turn의 icon row + grid 구조를 카피하다가 icon row를 지우면서도 flex wrapper는 그대로 두어 grid만 남긴 케이스.

수정:
1. `unwrapTrivialSingleChildLayoutWrappers` — inline style에 `display:flex|grid|inline-flex|inline-grid`만 있고, 다음이 하나도 없으며, 직접 자식이 정확히 1개인 `<div>`만 통째로 unwrap.
   - reject props: width/height/padding/border/background/box-shadow/outline/filter/backdrop-filter/transform/clip-path/mask/position/inset/top/right/bottom/left/z-index/grid-template*/grid-auto*/grid-column/grid-row/grid-area/flex*
   - reject: `class=`가 있으면 저자 CSS가 layout을 담당할 수 있으므로 유지
   - reject: wrapper open과 자식 open 사이, 자식 close와 wrapper close 사이에 텍스트가 있으면 유지
2. `healAiGeneratedDeckMarkup` pipeline에 `unnestHeadingBlockChildren` 다음 · leftover peer 정리 이전에 배치.
3. 스타일 파싱은 정규식 substring이 아닌 `parseStyleDeclarations`로 property 단위 매칭 (예전 `\bbottom\b`가 `margin-bottom`도 매칭한 버그 방지).
4. Nested wrapper는 outermost non-overlapping만 한 pass 안에서 처리, 최대 4회 재실행.

Motif / 데모 카드 트림 / 각 슬라이드 배경은 기존 heal이 계속 담당. `class`가 있는 wrapper와 padding/border 있는 wrapper는 절대 unwrap하지 않음.

검증: contracts heal-ai-generated-deck 신규 7개 케이스 (unwrap flex-with-grid / padding+background 유지 / multi-child 유지 / inline text 유지 / grid-template 유지 / class 유지 / idempotent 3-nested / healAiGeneratedDeckMarkup 통합) · 전체 스위트 2880/2880.

### 루프376 — 빈 leaf `<ul>` / `<p>` shells 제거 (Clone slot-fill 후처리)

**reproduce:** neubrutalism 템플릿으로 "www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘" 실행 후 결과의 2번 슬라이드에서 `Teamver — Smarter & Faster` 제목 아래 큰 빈 공간. HTML 검사 결과 `<ul class="content-list"><li></li><li></li><li></li><li></li></ul>` — 4개의 빈 `<li>`가 numbered pill로 렌더. 1번 슬라이드에도 `<p class="hero-subtitle"></p>` 빈 subtitle이 title과 deco 사이 공간을 벌려 놓았다.

원인: `fillSlideShell`의 placeholder / title-only 경로는 “템플릿 English 데모 카피 (Learn to code / Master frameworks / ...) 유출 방지”를 위해 `<li>` 내용을 빈 문자열로 wipe한다. body가 없으면 결국 `<li></li>` shell만 남는데 CSS의 `list-num` counter가 여전히 pill을 그려서 사용자에게는 “빈 번호 카드” 처럼 보인다.

수정:
1. `stripLeafEmptyListAndParagraphShells` — leaf `<ul>` / `<ol>` (모든 `<li>`가 whitespace/&nbsp;/br만) · 빈 `<p>` shell을 통째로 제거. 방문 요소 안에 `<img>` / `<svg>` / `<video>` / `<canvas>` / `<iframe>` / `<figure>` / `<table>`이 있으면 유지. idempotent (최대 5회 재실행).
2. `fillSlideShell` 마지막 단계에서 호출 → placeholder 경로가 만든 빈 shell을 제거하고 heading-only 레이아웃으로 fallback.

Motif / 데모 카드 트림은 기존 pipeline이 계속 담당. content가 실제로 있는 리스트/`<p>`는 절대 건드리지 않음. buildTemplateClonedDeckHtml → applyTemplateCloneSlotFill 회귀 없음.

검증: contracts template-clone-fill 신규 7개 케이스 (empty ul drop / whitespace li / kept-with-content / media-in-li / empty subtitle / idempotent / end-to-end slot-fill) · 전체 스위트 2868/2868.

### 루프373 — Clone slot-fill 실패 시 seed에 사용자 topic 채우기

reproduce: "expo 설명 자료를 만들어줘"로 첫 채우기 실행 → 모델이 JSON parse 실패 → "슬라이드 채우기에 실패해 템플릿 초안(LOOK seed)을 유지했습니다" 경고 + Retry 안내. 문제는 사용자가 열어본 LOOK seed가 **Hartfield / Daisy Days / Project Atlas** 같은 템플릿 데모 카피를 그대로 보여줬다는 점 — 사용자의 실제 주제와 무관한 발표 초안이 노출됐다.

원인:
1. `stripTemplateCloneOutlineNoise`가 `<think>[\s\S]*?</redacted_thinking>` (mismatched open/close) + `[\s\S]*?</think>` (앞에 있던 JSON까지 통째로 삭제)로 되어 있어 실제 `<redacted_thinking>` 블록을 못 걷어내고, 잘못 위치한 `</think>`가 JSON을 지웠다
2. JSON 추출이 첫 balanced `{...}` 하나만 시도해서 `{ "note": "..." }` 프로즈가 앞서면 outline 후보를 놓쳤다
3. seed-fallback이 raw LOOK seed를 그대로 persist → 사용자는 데모 카피만 봤다

수정:
1. `stripTemplateCloneOutlineNoise` — `<redacted_thinking>...</redacted_thinking>` · balanced `<think>...</think>` / `<thinking>...</thinking>` · 끊긴 스트림의 open-only tag · `<artifact>` wrapper 모두 처리
2. outline 파서 — 모든 balanced `{...}` 후보를 걸어가며 `slides` 배열이 있는 첫 후보 선택 · trailing comma / `// line comment` / `/* block */` 관용
3. `recoverPartialTemplateCloneOutline` — 깨진 JSON에서 살아남은 `"title": "..."` 리터럴만 뽑아 partial outline 구성
4. `synthesizeTemplateCloneOutlineFromBrief` — 그것마저 없으면 user brief에서 `deriveDeckCoverTitleFromBrief`로 topic을 뽑아 `[cover, 개요, 핵심 포인트, 근거와 사례, 실행 방안, 요약]` 5장짜리 생성
5. `decideTemplateCloneSlotFillTerminal` — `userBrief`/`deckTitle` 파라미터 추가. seed가 있을 때 slot-fill 실패 → partial → synth 순서로 시도해 seed에 topic을 실제로 stamp
6. ProjectView finalize — decision.html이 raw seed와 다르면(=topic이 stamp됨) LOOK seed 대신 그것을 persist

카피 발명 없음. 완전한 새 문장을 넣지 않고 사용자 brief에서 뽑은 cover 제목 + 일반 섹션 라벨만 사용. Motif/데모 카드 카피는 buildTemplateClonedDeckHtml이 이미 스트립한다. 280 vs 900 sidebar / leftover heal / 공식 English 카탈로그 규칙 모두 유지.

검증: contracts template-clone-outline (redacted_thinking / stray `</think>` / multi-candidate / trailing comma / `<artifact>` wrapper / partial recovery / brief synth / decide-terminal 통합) · template-clone-fill 회귀 · 전체 스위트 2855/2855.

### 루프369 — JSON 본문 section.slide 오탐 · repair send 실패 · brief 전달

JSON outline 문자열 안의 `<section class="slide">` 멘션이 HTML dump로 오탐되던 문제 수정. repair auto-send 실패/stream busy 시 LOOK seed 경고로 fallback. repair prompt에 원 brief 포함.

검증: contracts template-clone-outline 루프369 · web templateCloneContentFill · live E2E slot-fill.

### 루프368 — JSON outline 파싱 + FE 1회 auto-repair

MiniMax policy echo / mid-text fenced JSON 혼합 응답에서 JSON 추출 강화. contracts `decide`는 seed-fallback 유지; **FE ProjectView**가 첫 JSON 실패 시 repair prompt 1회 auto-send (600ms) 후에만 LOOK seed 경고.

검증: contracts template-clone-outline 루프368 · web ProjectView finalize.

### 루프367 — hard reload Clone fill incomplete_output → LOOK seed

루프365는 턴 종료 시 LOOK seed 복구를 닫았지만 DB에 `failed`/`incomplete_output`로 persist된 assistant는 reload 후에도 실패 카드가 남았다. conversation load에서 Clone fill lineage + deck.html on disk면 succeeded + `clone_look_seed_fallback` warning으로 승격하고 deck를 연다 (emergency/AC 전). 카피 발명 없음.

검증: web clone-look-seed-recovery 루프367.

### 루프374 — leftover `#stage`+swipe script forceReveal 무력화

hoist가 deco/`div.slide`에서 실패하면 `#stage`+swipe script leftover는 `setSlideDisplayed`가 숨김을 거부하고 `translateX`만 건다. authored 1920 leftover는 script가 있어도 display toggle. column leftover도 collapse. 공식 IB ROW/F3 유지. 카피 발명 없음.

검증: web srcdoc-deck-bridge-transform-driven 루프374 · compact-api-stacked-deck · contracts hoist.

### 루프366 — 1920 leftover `#stage` + 잔여 swipe 지문 첫 장 nudge

author `<script>`가 있으면 preview hoist가 `#stage`를 건너뛰고, `<section id="stage">`는 unwrap 대상이 아니었다. `scroll-snap-x`/body overflow-x leftover도 1920 캔버스면 swipe가 아니다. hoist + 분류 + vw nudge 거부. Zhangzara `#deck` 100vw는 compact 유지. 공식 IB swipe `#stage`는 유지. 카피 발명 없음.

검증: web compact-api-stacked-deck · srcdoc-deck-bridge-transform-driven 루프366 · contracts template-clone-fill hoist.

### 루프363 — 1920 leftover + leaked 100vw 첫 장 nudge

템플릿 `min-width:100vw`가 1920 캔버스에 남아 authored-swipe로 오인되면 letterbox가 꺼지고, `forceReveal`이 숨김을 안 걸며 `scrollGo(800)`이 첫 장만 민다. 1920 leftover는 swipe가 아님. dead leftover는 display toggle. 1920 overflow는 scroll-strip 아님. pan reset은 인덱스 변경 후. simple-deck/F3 유지. 카피 발명 없음.

검증: web compact-api-stacked-deck · srcdoc-deck-bridge-transform-driven 루프363.

### 루프361 — host ←/→ 첫 장 translate nudge

neutralize된 column `#stage` leftover(+ swipe script)를 IB 가로 스트립으로 오인해 `translateX`만 걸면 첫 장 뷰만 움직인다. 세로 배치는 가로 트랙이 아님. letterbox `forceReveal`로 장을 바꾸고, 1920 핀에서 100vw fallback 거부. 가로 IB 스트립(F3/281)은 유지. 카피 발명 없음.

검증: web srcdoc-deck-bridge-transform-driven 루프361 · nested-slides · compact-api-stacked-deck.

### 루프358 — leftover-token chrome body after label

라벨 아래 `TBD` / `n/a`만 있는 본문. 첫 슬롯은 라벨, **이후 본문 슬롯이 모두** 미채움일 때만 제거(중간 stub+실본문 유지). 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프358.

### 루프357 — dash / ellipsis-only chrome body slots

라벨은 두고 본문만 `—` / `...` / `&mdash;`인 카드. `visibleText` dash 엔티티 정규화 + punct-only 미채움. 문장 중간 em dash 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프357.

### 루프356 — numeric nbsp / ZWSP / spaced empty tag / empty heading

`&#160;` / ZWSP / `<font color=red></font>` / 빈 `<h3>` 본문 슬롯. empty 태그를 공백 붕괴 전에 제거. chrome에서만 heading 슬롯. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프356.

### 루프355 — 칸 번호 `스무 번째` 빈 카드

루프351까지는 A–Z / 가…하 / 스무째까지만 빈 칸 번호로 본다. 띄어쓴 `스무 번째`만 있는 3열 카드가 빈 띠로 남았다. 그 제목만 제거. 번호+본문(`스무 번째 실카피`)은 유지. 문자·서수 leftover 트랙은 여기서 닫음. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프355 · deck-framework-compact.

### 루프354 — 제목만 있는 카드 형제 제거

본문 있는 3열 이상 행에서 heading-only `.card`(`<h3>DATA / MLOps</h3>`, heading+빈 `<p>`)가 빈 띠를 만든다. 본문 있는 형제를 앵커로 두고 제목만 있는 카드만 제거. 제목-only 칩 행·2열 제목+본문·크롬 라벨 칩·column·영문 카탈로그는 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프354.

### 루프353 — 빈 스페이서 혼합 행 제거

루프352는 채워진 앵커가 없으면 빈 크롬+빈 `<div></div>` 행을 유지했다. MiniMax는 그 조합으로 빈 띠를 남긴다. 빈 스페이서도 같이 제거하고, 전부가 빈 크롬/스페이서면 행 전체를 제거. column·영문 카탈로그 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프353.

### 루프352 — 혼합 크롬+비크롬 행의 빈 크롬만 제거

루프342–344는 행의 자식이 전부 인라인 크롬일 때만 빈 본문 카드를 지운다. MiniMax Tech Stack/Pricing은 `.card` / `<ul>` 옆에 `<p></p>`·빈 div 크롬을 남겨 빈 띠가 유지됐다. 채워진 `.card`·리스트·크롬을 앵커로 두고 빈 크롬만 제거. 빈 스페이서만 있는 행·column·영문 empty-brief 카탈로그는 유지. 전체 행 drop(334)은 크롬-only. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프352.

### 루프351 — 칸 번호 Z 빈 카드

루프339까지는 A–U / W / Y / 가…하 / 스무째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 Z`만으로 채워 빈 띠가 남는다. 그 제목만 제거. 띄어쓴 `스무 번째`와 번호+본문(`기둥 Z 실카피`)은 유지. 한글 열 라벨은 `하`가 끝. 로마 `V`/`X`는 이미 번호. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프351 · deck-framework-compact · heal-loop345-350-residuals.

### 루프350 — title-only cover lone h1 가운데 정렬

`slide-title` 에 h1 하나만 있는 cover(≤ 80자, 리스트·미디어 없음)는 flow 안에서 좌측에 붙어 보인다. `text-align:center` 를 `[data-od-slide-flow]` wrapper 에 적용(h1 마크업은 유지해 dedup heal 과 충돌 없음). flow wrapper 가 없을 때만 h1 inline style. 카피 발명 없음.

검증: contracts heal-loop345-350-residuals 루프350 · heal-duplicate-title-only-slide.

### 루프349 — inline 크롬 카드 sibling close (loop194 cardish 확장)

MiniMax retro win-body 카드는 `class="card"` 없이 padding+background/border inline 크롬만 쓴다. `attrsLookCardish` 가 class 토큰만 보면 loop194/203 이 다음 카드를 열 때 이전 카드를 닫지 않아 본문·`<ul>` 이 그리드 형제로 새어 나간다(Process/Pricing). `looksLikeChromeCardStyle` inline 크롬도 cardish 로 취급해 sibling close 를 선행 삽입. 카피 발명 없음.

검증: contracts heal-loop345-350-residuals 루프349.

### 루프348 — 그리드 뒤 orphan 크롬 카드 pull-back

3열 로드맵 등에서 그리드가 N-1장만 닫고 마지막 카드(2027)가 그리드 다음 형제로 남는다. 선언 `grid-template-columns` 열 수보다 그리드 안 크롬 카드가 적을 때, 바로 뒤 크롬 카드 형제(`margin-top` 푸터 제외)를 그리드 안으로 되돌린다. 카피 발명 없음.

검증: contracts heal-loop345-350-residuals 루프348.

### 루프347 — cross-grid `<ul>/<ol>` spill + 2열 로드맵 + multi-pass

루프332는 그리드 다음 형제가 `<div>` 본문일 때만 흡수했고 크롬 카드가 3장 이상일 때만 동작했다. Roadmap 2026 `<ul>` spill · 2열 그리드(2025/2026)도 동일하게 마지막 크롬 카드 안으로 되돌린다. 최대 3패스 multi-pass. 카피 발명 없음.

검증: contracts heal-loop345-350-residuals 루프347.

### 루프346 — pricing `<ul>/<ol>` spill absorb + sibling 상한 4

PLAN A/B 뒤 `<ul>`·title·price 가 그리드 형제로 새어나가는 케이스. `absorbSpilledChromeCardSiblings` 가 `<ul>/<ol>` spill 을 인정하고 sibling 상한을 2→4 로 올린다. 카피 발명 없음.

검증: contracts heal-loop345-350-residuals 루프346.

### 루프345 — flex column host 뒤 orphan main grid 흡수

Process 슬라이드에서 win-body flex column 이 heading/lede 뒤 조기 종료되어 main grid 가 형제로 밀린다. column flex host 바로 다음 `flex:1`/declared grid 를 host 안으로 merge. `margin-top` 푸터는 밖에 둔다. 카피 발명 없음.

검증: contracts heal-loop345-350-residuals 루프345.

### 루프344 — 빈 `<p>` / `<span>` 래퍼 본문 슬롯

루프343은 빈 소스 / `&nbsp;` / `<br>`만 빈 본문으로 본다. MiniMax는 본문 슬롯을 `<p></p>` / `<p><br></p>` / `<span></span>` / `<p><span>&nbsp;</span></p>` 래퍼로 남겨 빈 띠가 유지됐다. 빈 래퍼 태그를 반복 접어 미채움으로 본다. 미디어·실본문·라벨만 있는 칩·column·영문 카탈로그는 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프344.

### 루프343 — 빈 div / `&nbsp;` 본문 슬롯

루프342는 카드 안에 `<br>`가 있어야 빈 본문으로 본다. MiniMax는 본문 슬롯을 `<div></div>` / `&nbsp;`만으로 남기기도 해서 빈 띠가 유지됐다. 빈 소스도 빈 슬롯으로 보고, `<br>` 없이도 라벨+빈 본문이면 미채움. 라벨만 있는 칩·실본문·column·영문 카탈로그는 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프343.

### 루프342 — 혼합 행의 빈 본문 크롬 카드만 제거

루프334–341은 행의 크롬 카드가 **전부** `<br>` 본문일 때만 그리드/플렉스를 지운다. 한 장만 채워지고 나머지가 라벨+`<br>`이면 빈 띠가 남는다. 채워진 카드는 두고 빈 본문 형제만 제거. column 스택·혼합 비크롬·영문 empty-brief 카탈로그는 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프342.

### 루프341 — class-bound flex/grid empty `<br>`-body 크롬 카드 drop

루프340은 inline `display:flex|grid`만 본다. MiniMax Tech Stack 실패가 `.cards{display:flex}` / `.grid{…}` class-bound 행으로 나오면 라벨+`<br>` 껍데기가 유지된다. `collectClassFlexRowNames` / `collectClassEqualTrackDecls`로 class-bound 행도 동일 조건 제거. 영문 empty-brief 카탈로그는 AI gate로 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프341.

### 루프340 — flex 행 empty `<br>`-body 크롬 카드 drop

루프334는 `display:grid`만 본다. MiniMax Tech Stack 실패가 `display:flex;gap` 행에도 남아 라벨+`<br>` 껍데기가 유지된다. inline flex 행도 동일 조건으로 제거. `flex-direction:column` · 본문 있는 카드 1장 이상 · 혼합 비크롬은 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프340.

### 루프339 — 칸 번호 Y 빈 카드

루프338까지는 A–U / W / 가…하 / 스무째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 Y`만으로 채워 빈 띠가 남는다. 그 제목만 제거. 띄어쓴 `스무 번째` / `기둥 Z`(로마 `X`는 이미 번호)와 번호+본문(`기둥 Y 실카피`)은 유지. 한글 열 라벨은 `하`가 끝. 280 vs 900 sidebar는 건드리지 않음. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프339 · deck-framework-compact · heal-loop331-335-residuals.

### 루프338 — 칸 번호 W 빈 카드

루프337까지는 A–U / 가…하 / 스무째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 W`만으로 채워 빈 띠가 남는다. 그 제목만 제거. 띄어쓴 `스무 번째` / `기둥 Y`(로마 `X`는 이미 번호)와 번호+본문(`기둥 W 실카피`)은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프338 · deck-framework-compact · heal-loop331-335-residuals.

### 루프337 — 칸 번호 U 빈 카드

루프336까지는 A–T / 가…하 / 스무째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 U`만으로 채워 빈 띠가 남는다. 그 제목만 제거. 띄어쓴 `스무 번째` / `기둥 W`(로마 `V`는 이미 번호)와 번호+본문(`기둥 U 실카피`)은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프337 · deck-framework-compact · heal-loop331-335-residuals.

### 루프336 — 칸 번호 T 빈 카드

루프327까지는 A–S / 가…하 / 스무째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 T`만으로 채워 빈 띠가 남는다. 그 제목만 제거. 띄어쓴 `스무 번째` / `기둥 U`와 번호+본문(`기둥 T 실카피`)은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프336 · deck-framework-compact · heal-loop331-335-residuals.

### 루프335 — HTML void element depth 안정화

`listDirectBlockChildOpens` / `countDirectBlockChildren` 이 `<br>` / `<img>` / `<hr>` 등 HTML void 요소를 open 으로 세어 depth 를 계속 밀어 올렸다. `<br><br><br>` 을 넣는 실패 본문 아래로 이어지는 형제 크롬 카드가 depth != 0 이라서 direct child 로 잡히지 않았고, 결과적으로 루프334·197·240 등 “같은 행의 카드” 로직이 실제 카드 개수를 못 봤다. 표준 void 요소 14종을 self-close 로 처리해 direct child 카운팅을 안정화. offset/부모 트리는 그대로.

검증: contracts 전체 스위트 · heal-ai-generated-deck 회귀 · heal-loop331-335-residuals.

### 루프334 — 크롬 카드 본문이 전부 `<br>`만 남은 그리드 제거

MiniMax 실패 시 (예: Tech Stack) 4개 크롬 카드의 본문 슬롯이 라벨(예 `LLM / NLP`) + `<br><br><br>` 로만 남는다. 라벨만 있고 실제 내용이 없어 슬라이드에 “카드 껍데기가 죽 나열된” 모양. 그리드 안 크롬 카드 전부가 본문 슬롯을 `<br>`/공백으로만 채웠다면 그 그리드 하나만 지운다. 슬라이드 제목·꼬리 카피(vendor-lock 등)는 유지. 카드가 하나라도 채워졌으면 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프334.

### 루프333 — orphan `<b>tail</b></div>` 중복 제거

로드맵/차트에서 `<div>...<b>30%</b></div>` 뒤에 `<b>30%</b></div>` 조각이 그대로 한 번 더 붙는 사례가 있다(그리드 컨테이너 조기 종료 + emphasis 중복). 이전 형제 `<div>` 의 마지막이 동일한 `<b>text</b>` 로 끝나고, 뒤이어 블록 태그가 오면 그 조각을 통째로 제거. `<b>` / `<strong>` / `<em>` 대응. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프333.

### 루프332 — 그리드 밖으로 새어나간 본문 조각 흡수

`<grid>` 안 마지막 크롬 카드가 조기 종료(라벨+제목만 남기고 `</div>` 하나 부족)되면 실제 본문은 그리드 다음 형제로 흘러 나가 4번째 열처럼 렌더된다(예: Close 슬라이드 STEP 03). 그리드 내부 마지막 카드의 직접 블록 자식 수가 앞선 크롬 카드들의 최소값보다 작고, 그리드 바로 다음 형제가 카드가 아닌 짧은 본문 div면 그 본문을 마지막 카드 내부(닫기 직전)로 되돌린다. 다른 그리드·이미지·넓은 본문은 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프332.

### 루프331 — `</h1..6>` heading 꼬리 텍스트 중복 제거

Close 슬라이드에서 `<h2>신뢰할 수 있는 AI 파트너,<br>neuralstudio.kr</h2> AI 파트너,<br>neuralstudio.kr <div>` 같이 heading 마지막 구절이 그대로 한 번 더 붙어 나오는 사례가 있다. `</hN>` 다음의 텍스트+`<br>` 만으로 이뤄진 짧은 꼬리(≤ 160자)가 heading 내부 정규화 텍스트의 정확한 suffix (≥ 4자) 이고 뒤에 블록 태그가 오면 제거. 정상 heading + 본문은 유지. 카피 발명 없음.

검증: contracts heal-loop331-335-residuals 루프331.

### 루프327 — 칸 번호 S 빈 카드

루프326까지는 A–R / 가…하 / 스무째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 S`만으로 채워 빈 띠가 남는다. 그 제목만 제거. 띄어쓴 `스무 번째` / `기둥 T`와 번호+본문(`기둥 S 실카피`)은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프327 · deck-framework-compact.

### 루프326 — 칸 번호 R 빈 카드

### 루프325 — 칸 번호 스무째 빈 카드

루프324는 Q만 빈 칸 번호로 본다. 모델이 빠진 3열을 `스무째`만으로 채워 빈 띠가 남는다. 그 제목만 제거. 띄어쓴 `스무 번째` / `기둥 R`과 번호+본문은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프325 · deck-framework-compact.

### 루프324 — 칸 번호 Q 빈 카드

루프322까지는 A–P / 가…하 / 열아홉째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 Q`만으로 채워 빈 띠가 남는다. 그 제목만 제거. `스무 번째` / `기둥 R`과 번호+본문(`기둥 Q 실카피`)은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음. 공식 영문 카탈로그는 brief 없이 유지.

검증: contracts heal-ai-generated-deck 루프324 · deck-framework-compact.

### 루프323 — toolbox skill/plugin/큐 제목 워크플로 숨김

루프321은 액션(디자인 다듬기 등)만 짧게 두고 워크플로를 `[Design toolbox instruction]`으로 붙였다. skill 행·plugin/MCP/connector 픽은 여전히 리소스 인덱스를 input에 넣었고, 큐 제목·큐 수정 복원·첫 턴 프로젝트명이 그 덤프를 그대로 보여 줬다. 모든 toolbox 픽을 짧은 제목(+@mention)만 보이게 하고, 복원 시 visible/instruction을 다시 나누며, 큐 제목·프로젝트명은 strip 한다.

검증: web design-toolbox · ChatComposer.design-toolbox · ChatPane.streaming · projectName · comments strip.

### 루프322 — 칸 번호 P · 열아홉째 빈 카드

루프291까지는 A–O / 가…하 / 열여덟째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 P` / `열아홉째`만으로 채워 빈 띠가 남는다. 그 제목만 제거. `스무 번째` / `기둥 Q`와 번호+본문은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프322 · deck-framework-compact.

### 루프321 — 디자인 다듬기 입력창 워크플로 숨김

next-step 「디자인 다듬기 / 출시 준비 완료」가 전역 리소스 인덱스·skill 목록·워크플로 규칙을 input에 그대로 넣었다. 입력에는 액션 제목(+@skill)만 두고, 긴 지시는 `[Design toolbox instruction]`으로 전송·말풍선에서 제거. 사용자가 제목을 지우고 다른 글을 쓰면 숨은 지시는 붙지 않음.

검증: web design-toolbox · ChatComposer.design-toolbox · comments strip.

### 루프320 — first-fill 명시 1–10장 한 턴

토큰이 병목이 아니면 명시 8–10장을 6장에서 자를 이유가 없다. 명시 1–10(및 8-10 프리셋)은 이번 턴에 전부 닫고, 미지정(「피피티 만들어줘」·Home/Canvas `6-8` auto)은 그대로 6장, 11+만 6장+숨김 top-up. 3+3+3 금지 유지. persist short-draft 게이트(≤6)는 건드리지 않음.

검증: contracts deck-framework-compact · system-prompt-api-mode · web templateCloneContentFill · slideCountTopUp · resume.

### 루프319 — 문장부호만 다른 연속 substance 장

루프295는 정규화 텍스트가 완전히 같을 때만 접는다. MiniMax는 같은 마무리를 `있다` / `있다.`로만 바꿔 한 장 더 넣는다. 글자·숫자만 같으면 뒤 장 제거. 추가 문장·커버·비인접 재사용 유지. 카피 발명 없음.

검증: contracts heal-loop295-299-residuals 루프319.

### 루프318 — minmax(0ch/0ex/0lh/0cqw, share) floor

소프트 플로어가 `0`/`0px`/`0%`/`0em`만. MiniMax `minmax(0ch,33%)` / `minmax(0cqw,calc(100%/3))`는 언랩 실패. ch/ex/lh/cq* 0-floor 추가. `minmax(200px,1fr)` 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프318.

### 루프317 — constant(..., share) equal-track

`env()`만 언랩. 구형 `constant(safe-area-inset-*, 33%)` leftover fallback도 동일. `constant(..., 50%)` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프317.

### 루프316 — grid-auto-rows leftover share

309는 열만. MiniMax `grid-auto-rows:33%` implicit 행이 빈 띠를 남김. 자식 2–6 · leftover share만 `minmax(0,1fr)`. `grid-auto-rows:50%` 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프316.

### 루프315 — 33/34 leftover rounding

동일 share만 equal-track으로 봤다. MiniMax `33% 33% 34%` 반올림 leftover는 파서가 null. 같은 단위 · 22–48 밴드 · 차이 ≤2(%/vw) 또는 ≤0.02fr. `30% 50%` 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프315.

### 루프314 — sibling-count() equal-track

`calc(100%/sibling-count())` / `calc((100% - 48px)/sibling-count())`는 자식 수에 따른 균등 leftover. `1fr`로 보고 `minmax(0,1fr)`. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프314.

### 루프313 — -webkit-flex leftover peer-lock

표준 `flex:`만 보면 MiniMax `-webkit-flex:2 1 33%` / `-webkit-flex-basis:33%` 잠금이 남는다. vendor shorthand도 22–48 share일 때 `flex:1 1 0`. `-webkit-flex:2 1 50%` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프313.

### 루프312 — gap-adjusted calc(share) equal-track

`calc(33%)`는 언랩되지만 MiniMax `calc(33% - 16px)` / `calc((100% - 48px) / 3)` / `calc(100%/3 - 8px)`는 갭을 뺀 leftover. 작은 길이 차감만. `calc(50% - 16px)` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프312.

### 루프311 — repeat(auto-fill|auto-fit, share)

숫자 `repeat(N, share)`만 보던 파서가 `repeat(auto-fill, 33%)` leftover를 놓침. 자식 2–6일 때 `repeat(N, minmax(0,1fr))`. `repeat(auto-fill, 50%)` / px 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프311.

### 루프310 — env(..., share) equal-track

`var(--x, 33%)`만 언랩. MiniMax `env(safe-area-inset-left, 33%)` / `minmax(0, env(..., calc(100%/3)))` fallback도 동일. `env(..., 50%)` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프310.

### 루프309 — grid-auto-columns leftover share

template-columns가 없거나 none/auto일 때 `grid-auto-columns:33%` implicit 트랙이 3열을 잠금. 자식 2–6 · leftover share만 `minmax(0,1fr)`. `grid-auto-columns:50%` 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프309.

### 루프308 — flex:G S leftover basis

302–305는 `1 1` / `0 1` / one-value만. MiniMax `flex:2 1 33%` / `flex:3 2 calc(33%)`는 grow가 커도 basis가 leftover. 22–48 share만 `flex:1 1 0`. `flex:2 1 50%` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프308.

### 루프307 — inline-grid chrome-card spill

293–298 absorb는 `display:grid`만. MiniMax `display:inline-grid` 행의 조기 close spill을 놓침. `(?:inline-)?grid`로 동일 absorb. 카피 발명 없음.

검증: contracts heal-spilled-chrome-card-siblings 루프307.

### 루프306 — fit-content(share) equal-track

`clamp`/`min`은 언랩되지만 MiniMax `fit-content(33%)` / `minmax(0,fit-content(calc(100%/3)))`는 파서가 null. 인자만 share로 본다. `fit-content(50%)` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프306.

### 루프305 — flex:33% one-value peer-lock

302–304는 `flex:G S basis` 세 값만. CSS `flex:33%` / `flex:calc(33%)`는 `1 1 33%`인데 파서가 null. 토큰이 하나이고 22–48 share일 때만 `flex:1 1 0`. `flex:50%` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프305.

### 루프304 — flex:0 1 calc(share) peer-lock

루프302는 `flex:1 1 …`만. MiniMax `flex:0 1 calc(33%)`는 shrink만 켜고 basis는 3열 잠금. 22–48 share만 `flex:1 1 0`. `flex:0 1 50%` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프304.

### 루프303 — clamp/min/max share equal-track

`calc(33%)`는 언랩되지만 MiniMax `clamp(0px,33%,1fr)` / `minmax(0,min(33%,1fr))`는 파서가 null. preferred(middle) 또는 유일한 22–48 share만. `clamp(...,50%,...)` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프303.

### 루프302 — flex:1 1 calc(share) peer-lock

`flex:0 0 33%`는 벗기지만 MiniMax `flex:1 1 calc(33%)` / `flex:1 1 33%`는 grow가 있어 잠금으로 안 봤다. 22–48 share basis만 `flex:1 1 0`으로 정규화. `flex:1 1 50%` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프302.

### 루프301 — class-bound 인접 동일 카드

루프297은 inline `display:grid|flex`만. `.cards` / `.grid` 행의 완전 동일 인접 카드는 남음. 클래스 바인딩 행도 뒤 칸만 제거. 카피 발명 없음.

검증: contracts heal-loop295-299-residuals 루프301.

### 루프300 — minmax(0px, …) soft floor

루프289/292는 floor가 bare `0`일 때만. MiniMax `minmax(0px,1fr)` / `minmax(0%,33%)`는 파서가 null. `0px`/`0%`/`0em`도 soft floor. `minmax(200px,1fr)` sidebar 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프300.

### 루프299 — var(--x, share) equal-track

루프292는 `calc(33%)`만. MiniMax `var(--col, 33%)` / `minmax(0, var(--col, calc(100%/3)))`는 커스텀 프로퍼티 fallback이 share인데 파서가 null. fallback만 unwrap. `var(--col, 50%)` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프299.

### 루프298 — class-bound 행 크롬 카드 spill

루프293–294는 inline `display:grid|flex`만. `.cards { display:flex }` / `.grid { repeat(3,1fr) }` 바인딩은 조기 close를 못 되돌림. 클래스 트랙/플렉스 맵으로 같은 absorb. 카피 발명 없음.

검증: contracts heal-loop295-299-residuals 루프298.

### 루프297 — 인접 동일 피어 카드 drop

같은 그리드/플렉스 행에서 정규화 텍스트가 완전히 같은 카드가 붙어 있으면 뒤 칸만 제거. 12자 미만·다른 본문 유지. 카피 발명 없음.

검증: contracts heal-loop295-299-residuals 루프297.

### 루프296 — calc() peer-lock width strip

`width:33%`는 벗기지만 `width:calc(33%)` / `inline-size:calc(100%/3)`는 cssLengthToPx가 null. share unwrap 후 3열 잠금 제거. `calc(50%)` 2열 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프296.

### 루프295 — 연속 동일 substance 슬라이드 drop

루프182/236은 title-only(≤40자)만. MiniMax는 같은 마무리 장을 본문째 한 번 더 넣음. 정규화 텍스트가 완전히 같고 40자를 넘는 연속 쌍만 뒤 장 제거. 비인접 재사용·다른 본문·커버 유지. 카피 발명 없음.

검증: contracts heal-loop295-299-residuals 루프295.

### 루프294 — flex 행 크롬 카드 spill absorb

루프293은 `display:grid` + 선언 열 초과만 본다. MiniMax는 같은 조기 close를 `display:flex;gap` 카드 행에도 넣어 공식·본문이 형제로 남고 루프191이 맨몸 조각을 peer로 키운다. 크롬 카드가 2개 이상이고 자식이 그보다 많을 때만 라벨 카드 뒤 맨몸 1–2개를 되돌림. 크롬 1개인 라벨+본문 스플릿·`flex-direction:column`·px sidebar 유지. 카피 발명 없음.

검증: contracts heal-spilled-chrome-card-siblings 루프294.

### 루프293 — class 없는 크롬 카드 spill · 동일 스타일 nest

사용자 fixture(삼각함수 pitch-deck)는 `class="card"` 없이 border/background/padding만 그린다. (1) TAN처럼 같은 style을 한 번 더 연 nest는 루프270 token 매칭 밖. (2) 「① 피타고라스」만 닫히고 공식·설명이 그리드 형제가 되면 shrink가 5열로 승격. 동일 inline 크롬 nest flatten + 선언 열보다 자식이 많을 때만 라벨 카드(≤48자) 뒤 맨몸 조각 1–2개를 카드 안으로 되돌림. `calc(50%)` 2열·px sidebar·3글자 absolute `SOH` 유지. 카피 발명 없음.

검증: contracts heal-spilled-chrome-card-siblings 루프293.

### 루프292 — minmax(0, calc(share)) equal-track

루프289는 `minmax(0,33%)`만 언랩. MiniMax `minmax(0, calc(33%))` / `repeat(3, minmax(0, calc(100%/3)))`는 `[^)]+`가 calc 첫 `)`에서 잘려 파서가 null. 괄호 depth로 repeat·track를 나누고 `calc(33%)`·`calc(100%/3)`만 share로 본다. `calc(50%)` 2열·`minmax(200px,1fr)` sidebar 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프292.

### 루프291 — 칸 번호 O · 열여덟째 빈 카드

루프288까지는 A–N / 가…하 / 열일곱째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 O` / `열여덟째`만으로 채워 빈 띠가 남는다. 그 제목만 제거. `스무 번째` / `기둥 P`와 번호+본문은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프291 · deck-framework-compact.

### 루프290 — logical inline-size peer lock strip

`max-width`/`width`는 벗기지만 MiniMax가 `max-inline-size:560px` / `inline-size:30vw`로 같은 3열 잠금을 유지. `peerFixedMainSizePx` · strip에 logical size 추가. 280 vs 900 sidebar 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프290.

### 루프289 — minmax(0, share) equal-track

bare `33%`/`30vw`/`0.33fr`은 이미 heal되지만 `minmax(0,33%)` 래퍼는 파서가 null. soft floor unwrap 후 underfilled shrink · filled → `minmax(0,1fr)`. `minmax(200px,1fr)` sidebar 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프289.

### 루프288 — 칸 번호 N · 열 라벨 하 · 열일곱째 빈 카드

루프286까지는 A–M / 가…파 / 열여섯째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 N` / `기둥 하` / `열일곱째`만으로 채워 빈 띠가 남는다. 그 세 제목만 제거. `스무 번째` / `기둥 O`와 번호+본문은 유지. 한글 열 라벨은 `하`가 끝. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프288 · deck-framework-compact.

### 루프287 — 슬라이드 조각의 고아 `</div>` strip

사용자 fixture(삼각함수 pitch-deck)는 nested card soup 뒤에 `</div>`가 남아 장 호스트/`data-od-slide-flow`를 닫았다. `repairUnbalancedCardDivsInFragment`는 매칭 open이 없어도 close를 그대로 통과시켰다. 조각 스택에 짝이 없는 close만 제거. 미종료 open은 기존처럼 닫는다. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프287.

### 루프286 — 칸 번호 M · 열 라벨 파 · 열여섯째 빈 카드

루프285까지는 A–L / 가…타 / 열다섯째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 M` / `기둥 파` / `열여섯째`만으로 채워 빈 띠가 남는다. 그 세 제목만 제거. `스무 번째` / `기둥 하` / `기둥 N`과 번호+본문은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프286 · deck-framework-compact.

### 루프285 — 칸 번호 L · 열 라벨 타 · 열다섯째 빈 카드

루프278까지는 A–K / 가…카 / 열네째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `기둥 L` / `기둥 타` / `열다섯째`만으로 채워 빈 띠가 남는다. 그 세 제목만 제거. `스무 번째` / `기둥 파` / `기둥 M`과 번호+본문은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프285 · deck-framework-compact.

### 루프284 — leftover 용어를 「빈 칸 번호 카드」로 정리

문서·주석·테스트 제목이 `leftover 문자 L/스무째`처럼 읽혀 제품 카피로 오해됨. 검출 범위는 그대로(A–K · 가…카 · 첫째…열네째). 유지 픽스처만 어색한 `스무째` → `스무 번째`.

검증: contracts heal-ai-generated-deck 루프278/284.

### 루프283 — substance-rich prior top-up noop = calm skipped-noop

thin host(루프269/275) incomplete와 달리 cover+body / 채워진 multi-slide prior는 top-up append 실패 시 `skipped-noop` 유지. incomplete_output 플래시 금지.

검증: web teamver-canvas-slide-launch 루프283.

### 루프282 — pagination `.active` 우선

`syncPaginationControls` soft class(`is-active`/`current`)보다 exact `.active`를 우선해 native paint와 맞춤.

검증: web srcdoc-deck-bridge-nested-slides.

### 루프281 — native transform track active off-by-one

letterbox `clientWidth/n` 추측 금지. authored/computed step 또는 `-1` → pagination fall-through. go 경로의 `transformSlideStepPx` 임계는 유지해 native `#deck-next`를 host `translateX`가 가로채지 않음.

검증: web srcdoc-deck-bridge-nested-slides 루프281.

### 루프280 — substance-rich persist가 daemon stub-guard에 422 오탐

루프273/279가 client byte·slide-count gate는 열었다. persist는 leftover/seed일 때만 `skipArtifactStubGuard`를 켠다. 데몬 가드는 바이트 비율만 본다(`minRetainedRatio` 0.35). 5장 완성본이 큰 8장 prior의 35% 미만이면 client는 통과해도 `422 ARTIFACT_REGRESSION` → 사용자는 다시 "짧은 초안" 배너를 본다. embed는 `forceArtifactStubGuardReject`까지 켜져 더 잘 막힌다.

수정: `shouldSkipDaemonArtifactStubGuard` — leftover/seed **또는** substance-rich(4+ · meetsMinimum · not low-substance)면 skip. 1–3장 thin·title-only는 skip하지 않아 기존 stub 거절을 유지. embed force-reject도 같은 조건.

검증: `project-view-substance-rich-replacement` 루프280 · teamver-canvas-slide-launch · project-view-message-load.

### 루프279 — substance-rich 8→5가 slide-count regression 오탐 · 배너 분리

루프273은 `findClientArtifactRegression` byte-guard만 열었다. 같은 5장 완성본이 8장 prior 위에 오면 `findClientSlideCountRegression`이 `dropped >= 3`으로 저장을 다시 거부하고, 배너는 그대로 "짧은 초안"이라 사용자는 완성본이 초안으로 거절된 것처럼 본다.

수정:

- `isSubstanceRichDeckReplacement` (4+ · meetsMinimum · not low-substance)를 두 persist gate가 공유.
- greenfield(`!strict`)에서 substance-rich shrink는 slide-count 면제. image/comment/target persist(`strict`)는 1장이라도 줄면 계속 차단.
- 8→2 / 1–3장 thin은 4장 바 아래로 계속 차단.
- slide-count 거절 배너: "슬라이드 수가 크게 줄어든 초안" — 짧은 초안 카피와 분리.

검증: `project-view-substance-rich-replacement` 루프279 · persist-result · message-merge · teamver-project-error-messages · project-view-message-load.

### 루프278 — 칸 번호 K · 열 라벨 카 · 열네째 빈 카드 · 공식 Replit preview 실경로

루프274까지는 A–J / 열세째까지만 빈 칸 번호로 본다. 모델이 빠진 3열을 `K` / `기둥 카` / `열네째`만으로 채워 빈 띠가 남는다. 그 세 제목만 제거. `스무 번째` / `기둥 타` / `기둥 L`과 번호+본문은 유지. 카피 발명 없음.

공식 `example-replit-deck` `/preview`가 helix 커버를 주고 `[REPLACE]` 시드를 주지 않는 실경로 스펙을 고정. catalog `example.html`은 `design-templates` helix와 byte-identical.

검증: contracts heal-ai-generated-deck 루프278 · deck-framework-compact · template-visual-kit helix sync · daemon plugins-preview-replit-bundled.

### 루프277 — nested section/article card flatten

루프270은 `<div class="card">`만 flatten. MiniMax `<section|article class="card|panel">` 중첩도 same-tag flatten. Motif 보호 · idempotent. 카피 발명 없음.

검증: contracts heal-nested-duplicate-card-flatten 루프277.

### 루프276 — thin-prior top-up 배너 = Retry 톤

`thin-prior-top-up-no-append` 전용 카피: 슬라이드 추가 실패 + 제목만 초안 + 다시 시도. cut-off "이어서"/"중간에 끊겼" 금지.

검증: web teamver-project-error-messages 루프276.

### 루프275 — solo title-only cover thin top-up host

1장 제목-only prior + top-up noop → incomplete. `deckLooksLikeThinTopUpHostPrior`.

검증: web deck-html-content · teamver-canvas-slide-launch 루프275.

### 루프274 — J/기둥 차/열세째 leftover · stale preview는 example.html

루프272는 A–H / 열두째까지 leftover로 본다. MiniMax는 `J`/`기둥 차`/`열세째`로 빠진 기둥을 채워 3열이 유지된다. J·차·열세째만 leftover. `열네째`/`기둥 카`/`기둥 K`와 index+추가 본문은 유지. 카피 발명 없음.

떠 있는 데몬의 옛 매니페스트는 없는 `index.html` 다음 `assets/template.html`을 고른다. `/preview`는 `exampleOutputs`·루트 `example.html`을 시드보다 먼저 시도한다.

검증: contracts heal-ai-generated-deck 루프274 · deck-framework-compact · daemon plugins-preview-catalog-example · plugins-preview-fallback.


### 루프273 — substance-rich replacement가 `artifact_regression` 오탐되던 회귀 해소

사용자 리포트 2026-08-31: MiniMax가 5장 완성본을 반환했는데 client 배너 `AI가 이번 응답에서 완성된 슬라이드 대신 짧은 초안만 반환해 저장하지 않았습니다`가 노출되며 파일이 저장되지 않는다. 사용자 fixture(`/tmp/user-fixture-artifact-regression.html`): 5 slides · 각 100~320 chars 실체 콘텐츠 · `<h2>` + `<p>` + `<ul>`/`grid` cards · `meetsMinimumDeckDeliverableQuality = true` · `isLowSubstanceSlideDeckArtifact = false`.

원인 진단 (프로브): heal 후 fixture는 substance 완전한데도 아래 3 signal이 모두 `true`이므로 `incomingCompactDraft = true`가 됨.

- `isPersistableShortDeckDraft` — slide ≤ 6 + titled cover이면 true (top-up-safe 목적)
- `isPersistableShortDeckDraftAfterHeal` — 위와 동일 heal 후 판정
- `isClosedSoftSalvageDeckHtml && count ≤ 6`

즉 `findClientArtifactRegression`이 5 slides의 완성본을 "1-6 slide 짧은 draft"로 취급. Prior on-disk deck이 8+ slide substance full이면 `priorCount ≤ 6` / `isPersistableShortDeckDraft(prior)` / `isPersistableShortDeckDraftAfterHeal(prior)` / `isLowSubstanceSlideDeckArtifact(prior)` 모두 false → byte-size guard로 fall-through → `newSize < priorSize * ARTIFACT_REGRESSION_MIN_RATIO` → **regression 판정 → 저장 거부**.

Loop187 이후 (loop232-236 · loop251-254 · loop263-269 등) short-draft signal 범위가 넓어지면서 substance-rich multi-slide replacement까지 잡는 오탐 회귀 축적. 사용자 관점: 정상 응답을 client가 거부 → "결과물 품질 저하"로 인지.

수정 (`apps/web/src/components/ProjectView.tsx#findClientArtifactRegression`):

```ts
// 루프273 — Substance-rich replacement bypass.
if (
  incomingSlideCount >= 4
  && meetsMinimumDeckDeliverableQuality(input.htmlBody)
  && !isLowSubstanceSlideDeckArtifact(input.htmlBody, input.healBrief, input.healTitle)
) {
  return null;
}
```

- 4+ slides · `meetsMinimum` · not low-substance 세 조건 모두 만족하면 substance-rich replacement로 간주 → gate 통과 (early return null).
- 1-3 slide title-only draft, motif SVG dump, failed-generate skeleton은 여전히 아래 compact-draft branch에서 잡힘.
- byte-shrink만으로는 regression을 만들지 않지만, prior가 큰 완성본인데 새 output이 short/low-substance이면 여전히 byte-guard가 blocking.

검증:

- `apps/web/tests/project-view-substance-rich-replacement.test.ts` — 5 red-spec 전원 green (사용자 fixture round-trip · 8-slide prior 위 5-slide substance-rich replacement · 1-slide title-only draft still blocked · 3-slide thin compact still blocked · non-deck 무관).
- `apps/web/tests/project-view-persist-result.test.ts` 11 pre-existing spec 회귀 없음 (6-slide first-fill over thin prior · 3-slide over full-eight blocked 등 모두 pass).
- `apps/web/tests/artifacts/validate.test.ts` 47 · `deck-html-content.test.ts` 38 pre-existing 회귀 없음.

리포트 2 (`59741f71dd` 이후 품질 회귀) 상관관계: loop187~loop270 사이 short-draft/soft-salvage/low-substance signal이 강화되며 permissive 가드가 반대로 substance-rich replacement까지 잡던 accumulation이 이 오탐의 축. loop273은 완성본 replacement 축만 열어 놓고 나머지 강화 gate는 그대로 유지 → "짧은 draft/실패 skeleton" 축과 분리.


### 생성 마법사 — Replit Deck 흰 썸네일

`od.preview.entry`가 없는 `index.html`을 가리켜 시드 `assets/template.html`(`[REPLACE]` · helix `#fafafa`)이 카드에 올랐다. 헬릭스 `example.html`을 실어 카탈로그 커버를 보드 표지로 고정. 시드는 생성용 유지.

검증: web project-card-html-cover · contracts pickPluginPreviewHtmlPath.

### 루프272 — H/기둥 자/열두째 leftover 인덱스

루프266은 A–G / 열한째까지 leftover로 본다. MiniMax는 `H`/`기둥 자`/`열두째`로 빠진 기둥을 채워 3열이 유지된다. H·자·열두째만 leftover. `열세째`/`기둥 차`/`J`–`Z`(로마 숫자 I/V/X 제외)와 index+추가 본문은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프272 · deck-framework-compact.

### 루프271 — 선택 템플릿 motif/색상/아이콘 실렌더 강제

사용자 리포트 2026-08-31: 템플릿을 선택해도 대표 SVG/색상/아이콘/도형이 첫 결과물에 충분히 반영되지 않음. 특히 Daisy/Capsule/Studio류는 썸네일 identity와 실제 산출물이 다르게 보인다.

원인: compact fill 안정화 과정에서 `official Motif merged after save`, `may stay empty`, `empty absolute shells` 문구가 남아 모델이 빈 `.deco-*` shell 또는 generic shape만 emit해도 된다고 해석할 수 있었다. 실제 서비스에서는 저장 후 별도 motif paint가 항상 사용자-visible 결과물을 보강한다고 가정하면 안 된다.

수정: Template visual kit / selected-template final authority / slim fill 치환문을 “visible kit Motif anchors”로 통일. 긴 SVG dump와 Motif-before-title hang은 계속 막되, cover와 본문 2장 이상에 kit 색상·geometry 기반의 실제 보이는 CSS/HTML motif 또는 짧은 공식 sprite를 넣도록 요구한다. 빈 shell은 실패 조건으로 명시.

검증: contracts `template-visual-kit` 회귀에서 Daisy/Capsule slim kit가 visible motif anchor를 요구하고 `may stay empty`/`empty absolute shells`/`official Motif merged after save`로 후퇴하지 않는지 확인.

### 루프270 — nested duplicate `.card` open flatten

사용자 리포트 2026-08-31 · 삼각함수 pitch-deck (slide 4 항등식 · 5 그래프): MiniMax fill이 각 카드 시작 시 nested duplicate open을 emit — `<div class="card"><div class="card">제목</div>공식본문</div>`. Loop194는 두 open을 peer로 갈라내며 outer body를 카드 밖으로 밀어냄. Loop199는 outer가 완전 비어야만 unwrap. 실측: heal 후 slide 4 `div opens=29, closes=32, diff=-3` (닫힘 초과 · layout 파괴).

`flattenNestedDuplicateCardOpens`: 인접 두 `<div>` open이 exact same cardish token(`card`/`pillar`/`tile`/`panel`/`cell`/`box`/`metric`/`stat`/`kpi`)이고 사이에 공백만 있으면, inner open + 대응 close 페어를 함께 strip. Outer body(공식/설명)는 그대로 보존, 태그 balance 완전 유지. Motif-only shell(`data-od-official-motif-html`) 보호. Idempotent. `unwrapRedundantNestedPeerCards` (loop199) 이전에 실행.

검증: contracts `heal-nested-duplicate-card-flatten.test.ts` 10/10 · 사용자 fixture 실측 slide 4 diff=0 (opens=closes=27), 전체 46/46.

### 루프266 — G/기둥 아/열한째 leftover 인덱스

루프261은 A–F / 열째까지 leftover로 본다. MiniMax는 `G`/`기둥 아`/`열한째`로 빠진 기둥을 채워 3열이 유지된다. G·아·열한째만 leftover. `열두째`/`기둥 자`/`H`–`Z`와 index+추가 본문은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프266 · deck-framework-compact.

### 루프265 — leftover stub는 주제 단어가 아님 (그외/other)

`미분`/`적분`만 빼면 `그외`/`나머지`/`other`/`rest` leftover가 3열을 붙잡는다. 그 계열만 leftover. stub+추가 본문은 주제 무관 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프265 · deck-framework-compact.

### 루프269 — thin prior top-up noop → incomplete

top-up이 장을 못 붙였을 때 prior가 제목+빈 셸/low-substance면 `skipped-noop` 대신 `skipped-incomplete` + `thin-prior-top-up-no-append`. AC 거부·내용 부족 배너.

검증: web resume · teamver-project-error-messages · teamver-canvas-slide-launch.

### 루프268 — Teamver embed stub-warn → force reject

`OD_ARTIFACT_STUB_GUARD=warn`이어도 embed persist는 `forceArtifactStubGuardReject`로 warn→reject. 디스크 stub 덮어쓰기 방지. `off`는 유지.

검증: daemon artifact-stub-guard · projects-stub-guard · teamver-canvas-slide-launch.

### 루프267 — title-only cover + empty hosts short-draft 거절

제목만 커버 + 빈 slide host ≥2는 `isPersistableShortDeckDraft` false. 본문 있는 cover+empty · 1장 title cover는 top-up용 유지.

검증: web deck-html-content 루프267.

### 루프264 — misc/기타사항 leftover stub

`기타`만 leftover면 `기타사항`은 남은 `사항` 때문에 3열이 유지된다. misc/miscellaneous · 기타사항만 leftover. stub+추가 본문은 주제 무관 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프264 · deck-framework-compact.

### 루프259 — leftover extra-copy는 토픽 단어가 아님

사용자 brief의 `미분`/`적분`은 예시일 뿐 leftover 유지 어휘가 아니다. stub/index 토큰만 leftover. 남은 글자는 어떤 주제든 실카피. 제품 주석에서 주제 단어 하드코딩 제거. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프259.


### 루프263 — contracts pretest 언블록 (exactOptionalPropertyTypes)

루프195 `collectClassEqualTrackDecls`가 optional `{cols, rows}`에 `undefined`를 명시 대입해 `exactOptionalPropertyTypes: true` 아래 TS2379로 `pnpm --filter @open-design/web test` pretest(contracts 빌드)를 통째로 봉쇄. Conditional assign으로 최소 diff 수정. 3-col clip · 2x2 leftover auto-repair 원 의도는 보존.

검증: contracts vitest 전체 — heal-ai-generated-deck 계열 초록 유지, 신규 회귀 0. apps/web pretest 통과, vitest 실행 확인 (Test Files 86 failed | 626 passed | 1 skipped — 기존 A/B/C/D 실패는 이번 스코프 밖).

### 루프262 — 3열 400 vs 800 max-width leftover lock

루프240은 비율 ≤1.6만 균일로 본다. MiniMax는 3카드에 `max-width:400` / `800`으로 판정을 피해 3열이 잠긴다. 3장 이상만 비율 2.05까지 leftover. 2장 400 vs 800 · 3장 280 vs 900 sidebar는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프262 · deck-framework-compact.

### 루프261 — E/기둥 바/여섯째 leftover 인덱스

루프239는 A–D / 가나다라마 / 첫째–다섯째만 leftover 문자로 본다. MiniMax는 `기둥 E`/`기둥 바`/`여섯째`만 남겨 3열이 유지된다. E–F·바사·여섯째–열째만 leftover. `열한째`/`기둥 아`/index+추가 본문은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프261 · deck-framework-compact.

### 루프258 — ok/완료 leftover stub

루프241–257 leftover stub는 etc/기타까지 본다. MiniMax는 `ok`/`done`/`완료`로 빠진 기둥을 채워 3열이 유지된다. ok/okay/done · 완료만 leftover. stub+추가 본문은 유지(주제 단어 아님). 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프258 · deck-framework-compact.

### 루프257 — etc/기타 leftover stub

루프241–249 leftover stub는 FIXME/hack/foo까지 본다. MiniMax는 `etc`/`기타`/`등등`로 빠진 기둥을 채워 3열이 유지된다. etc/etcetera · 기타/등등만 leftover. stub+추가 본문은 유지(주제 단어 아님). 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프257 · deck-framework-compact.

### 루프256 — Lesson/강 leftover 인덱스

루프205–248 leftover 인덱스는 pillar/chapter/장만 본다. MiniMax는 `Lesson 3`/`강 3`로 빠진 기둥을 채워 3열이 유지된다. lesson/lecture · 강/회/레슨만 leftover. 전-인덱스 Lesson 스텝 행은 유지. `UNIT 3`은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프256 · deck-framework-compact.

### 루프255 — 동일 0.33fr 그리드 leftover

루프190/220는 `1fr`만 equal track으로 본다. MiniMax는 `0.33fr 0.33fr 0.33fr`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 0.22–0.48fr만 `minmax(0,1fr)`로 바꾼다. `0.5fr` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프255 · deck-framework-compact.

### 루프254 — listAiSlideSpans depth-match

heal slide span이 nested/unclosed host에서 본문 범위를 오인했다. same-tag depth count + nested containment filter. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프254.

### 루프253 — closed soft-salvage body bar

닫힌 title-only 골격이 soft salvage로 성공 persist되던 구멍. multi-slide는 deliverable body ≥1 필요. mid-stream truncation bar는 유지.

검증: web deck-html-content 루프253.

### 루프252 — class-bound heal AI marker gate

영문 MiniMax fill이 Hangul gate에 막혀 class-bound shrink/balance가 스킵됐다. `data-od-slide-flow`/`tpl-*`/multi-slide card면 통과. empty-brief 영문 카탈로그는 유지.

검증: contracts heal-ai-generated-deck 루프252.

### 루프251 — 동일 33vi 그리드·카드 폭 leftover

루프245–250은 물리 뷰포트 단위만 본다. MiniMax는 `33vi 33vi 33vi`나 `width:30vb`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 22–48vi/vb만 `minmax(0,1fr)`로 바꾸고 카드 폭을 벗긴다. `50vb` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프251 · deck-framework-compact.

### 루프250 — 동일 33dvmin 그리드·카드 폭 leftover

루프245/246은 dvw/cqmin만 본다. MiniMax는 `33dvmin 33dvmin 33dvmin`나 `width:30svmin`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 22–48dvmin/svmin/lvmin/dvmax만 `minmax(0,1fr)`로 바꾸고 카드 폭을 벗긴다. `50lvmax` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프250 · deck-framework-compact.

### 루프249 — FIXME/hack leftover stub

루프200–247 stub에 FIXME/hack이 없었다. MiniMax는 `FIXME`/`hack`으로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `FIXME 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프249 · deck-framework-compact.

### 루프248 — Chapter/장 leftover 인덱스

루프205–242 leftover 인덱스는 pillar/group/행만 본다. MiniMax는 `Chapter 3`/`장 3`로 빠진 기둥을 채워 3열이 유지된다. chapter/cluster/panel · 장/클러스터/패널만 leftover. 전-인덱스 Chapter 스텝 행은 유지. `UNIT 3`은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프248 · deck-framework-compact.

### 루프247 — foo/bar leftover stub

루프241–244는 xxx/pass stub만 본다. MiniMax는 `foo`/`bar`/`baz`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `bar 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프247 · deck-framework-compact.

### 루프246 — 동일 33cqmin 그리드·카드 폭 leftover

루프238/245는 cqw/cqi만 본다. MiniMax는 `33cqmin 33cqmin 33cqmin`나 `width:30cqmax`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 22–48cqmin/cqmax만 `minmax(0,1fr)`로 바꾸고 카드 폭을 벗긴다. `50cqmax` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프246 · deck-framework-compact.

### 루프245 — 동일 33dvw 그리드·카드 폭 leftover

루프238은 vh/vmin/dvh만 본다. MiniMax는 `33dvw 33dvw 33dvw`나 `width:30lvw`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 22–48dvw/svw/lvw만 `minmax(0,1fr)`로 바꾸고 카드 폭을 벗긴다. `50svw` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프245 · deck-framework-compact.

### 루프244 — pass/skip leftover stub

루프224–243은 생략/null stub만 본다. MiniMax는 `pass`/`스킵`으로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `pass 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프244 · deck-framework-compact.

### 루프243 — null/undefined leftover stub

루프208–241은 없음/xxx stub만 본다. MiniMax는 `null`/`undefined`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `null 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프243 · deck-framework-compact.

### 루프242 — Group/행 leftover 인덱스

루프205–239 leftover 인덱스는 pillar/module/섹션만 본다. MiniMax는 `Group 3`/`행 3`로 빠진 기둥을 채워 3열이 유지된다. group/lane/row · 그룹/레인/행만 leftover. 전-인덱스 Group 스텝 행은 유지. `UNIT 3`은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프242 · deck-framework-compact.

### 루프241 — xxx/asdf leftover stub

루프200–231은 TBD/lorem/임시 stub만 본다. MiniMax는 `xxx`/`asdf`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `xxx 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프241 · deck-framework-compact.

### 루프240 — 400 vs 600 max-width leftover lock

루프201은 비율 ≤1.35만 균일로 본다. MiniMax는 `max-width:400` / `600`으로 판정을 피해 3열이 잠긴다. 비율 1.6까지 같은 leftover lock. 280 vs 900 · 400 vs 800 sidebar는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프240 · deck-framework-compact.

### 루프239 — D/기둥 마/첫째 leftover 인덱스

루프237은 A–C / 가나다라만 leftover 문자로 본다. MiniMax는 `D`/`기둥 마`/`셋째`만 남겨 3열이 유지된다. D·마·첫째–다섯째만 leftover. 전-인덱스 서수 스텝 행과 `여섯째`/`기둥 바`/`첫째 적분`은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프239 · deck-framework-compact.

### 루프238 — 동일 33vh/vmin 그리드·카드 폭 leftover

루프213/215는 vw만 본다. MiniMax는 `33vh 33vh 33vh`나 `width:30vmin`을 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 22–48vh/vmin/cq*만 `minmax(0,1fr)`로 바꾸고 카드 폭을 벗긴다. `50vmin` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프238 · deck-framework-compact.

### 루프237 — 알파벳/괄호/번 leftover 인덱스

루프205–230는 숫자·로마·원문자·Phase·Module만 leftover 인덱스로 본다. MiniMax는 `C`/`기둥 다`/`(3)`/`3번`만 남겨 3열이 유지된다. A–C·가나다라·괄호·번/번째만 leftover. 전-인덱스 스텝 행은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프237 · deck-framework-compact.

### 루프236 — 비연속 duplicate title-only leftover

루프182 연속 drop 이후에도 `title | 실본문 | 같은 title-only`가 남았다. 뒤쪽 non-cover title-only를 제거. chapter/cover/background motif는 유지. 카피 발명 없음.

검증: contracts heal-duplicate-title-only-slide 루프236.

### 루프235 — title+장식 media ≠ deliverable

title+Motif SVG가 filled/low-substance 면제를 받던 구멍. heading·media 제거 후 body만 deliverable. media short-circuit는 minimum bar 통과 시에만. 카피 발명 없음.

검증: web deck-html-content · validate 루프235.

### 루프234 — leading intro without cover attrs

bare `class="slide"` 실cover 앞 title splash가 남던 구멍. substantive + same-topic이면 cover attrs 없이도 splash drop. chapter 유지.

검증: contracts heal-duplicate-title-only-slide 루프234.

### 루프233 — 2장 brief parrot

루프193은 3장+. 닫힌 2장 thin parrot도 low-substance. cover+실본문은 유지.

검증: web deck-html-content · validate 루프233.

### 루프232 — unanchored translate(-50%,-50%)

`translateY`만 중화하던 구멍. `translate(-50%,-50%)` / `translate3d`도 앵커 없으면 제거. top/left 50% 앵커 유지.

검증: contracts heal-duplicate-title-only-slide 루프232.

### 루프231 — 임시/fake leftover stub

루프218–228은 dummy/자료없음 stub만 본다. MiniMax는 `임시`/`fake`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `임시 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프231 · deck-framework-compact.

### 루프230 — 10/PILLAR 10 leftover 인덱스

루프225 leftover digit는 `0–9`/`00–09`만 본다. MiniMax는 `10`/`PILLAR 10`으로 빠진 기둥을 채워 3열이 유지된다. digit에 `10`만 추가. `10%` KPI는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프230 · deck-framework-compact.

### 루프229 — Module/섹션 leftover 인덱스

루프205–226 leftover 인덱스는 pillar/phase/축만 본다. MiniMax는 `Module 3`/`섹션 3`로 빠진 기둥을 채워 3열이 유지된다. module/track/section · 모듈/트랙/섹션만 leftover. 전-인덱스 Module 스텝 행은 유지. `UNIT 3`은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프229 · deck-framework-compact.

### 루프228 — 자료없음/정보없음 leftover stub

루프208의 `없음`은 compact 앞에 있을 때만 맞는다. MiniMax는 `자료없음`/`정보없음`으로 빠진 기둥을 채워 3열이 유지된다. 복합 stub만 leftover. `자료 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프228 · deck-framework-compact.

### 루프227 — lorem ipsum/placeholder leftover stub

루프200은 `lorem`만 leftover로 본다. MiniMax는 `lorem ipsum`/`placeholder`로 빠진 기둥을 채워 3열이 유지된다. `ipsum`/`placeholder`/`filler` 추가. `lorem 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프227 · deck-framework-compact.

### 루프226 — 전각/원문자 ０ leftover 인덱스

루프219는 ①–⑨ / １–９만 leftover로 본다. MiniMax는 `０`/`⓪`/`기둥 ０`로 빠진 기둥을 채워 3열이 유지된다. 원문자·전각 0을 leftover mark에 추가. 전-인덱스 ⓪①② 스텝 행은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프226 · deck-framework-compact.

### 루프225 — 00/PILLAR 0 leftover 인덱스

루프205–222 leftover 인덱스는 `1–9`/`01–09`만 본다. MiniMax는 `00`/`PILLAR 0`로 빠진 기둥을 채워 3열이 유지된다. digit를 `0?[0-9]`로 확장. `0%` KPI는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프225 · deck-framework-compact.

### 루프224 — 대기/soon leftover stub

루프202–223은 TBD/tobefilled stub만 본다. MiniMax는 `대기`/`soon`/`later`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `나중에 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프224 · deck-framework-compact.

### 루프223 — tobefilled/filllater leftover stub

루프200–218은 TBD/dummy/작성예정 stub만 본다. MiniMax는 `to be filled`/`fill later`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `to be filled 적분` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프223 · deck-framework-compact.

### 루프222 — Phase/축/레이어 leftover 인덱스

루프205–219는 pillar/key/번호 leftover만 본다. MiniMax는 `Phase 3`/`축 3`/`레이어 3`로 빠진 기둥을 채워 3열이 유지된다. phase/axis/layer · 페이즈/축/레이어만 leftover. 전-인덱스 Phase 스텝 행은 유지. `UNIT 3`은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프222 · deck-framework-compact.

### 루프221 — minmax(auto,1fr) 트랙 클립

루프195는 `1fr`만 `minmax(0,1fr)`로 바꾼다. MiniMax는 `minmax(auto,1fr)`를 찍어 3장이 잘린다. auto/min-content/max-content 하한을 `minmax(0,1fr)`로 바꾼다. `minmax(200px,1fr)` sidebar는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프221 · deck-framework-compact.

### 루프220 — 1.0fr equal 트랙 leftover

루프190/195는 `1fr`만 equal track으로 본다. MiniMax는 `1.0fr 1.0fr 1.0fr`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. `1.0fr`을 `minmax(0,1fr)`로 바꾼다. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프220 · deck-framework-compact.

### 루프219 — 원문자/전각 숫자 leftover 카드

루프205/209는 아라비아·로마만 leftover 인덱스로 본다. MiniMax는 `③`/`기둥 ３`로 빠진 기둥을 채워 3열이 유지된다. 원문자·전각 1–9만 leftover. 전-인덱스 스텝 행은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프219 · deck-framework-compact.

### 루프218 — dummy/예시 leftover 카드

루프200–216은 placeholder/stub만 leftover로 본다. MiniMax는 `dummy`/`예시`/`샘플`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `sample mean` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프218 · deck-framework-compact.

### 루프217 — KEY 3 / 테마 3 인덱스 leftover

루프205/212는 pillar/No./번호만 본다. MiniMax는 `KEY 3`/`테마 3`만 남겨 3열이 유지된다. 해당 접두+숫자만 leftover. 전-인덱스 스텝 행은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프217 · deck-framework-compact.

### 루프216 — 작성예정/입력필요 leftover 카드

루프202/208은 준비중/해당없음만 stub로 본다. MiniMax는 `작성 예정`/`입력필요`로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `추후 적분 예정` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프216 · deck-framework-compact.

### 루프215 — 동일 33vw 그리드 트랙 leftover

루프210은 `%`만 equal track으로 본다. MiniMax는 `33vw 33vw 33vw`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 22–48vw/vmin만 `minmax(0,1fr)`로 바꾼다. `50vw 50vw` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프215 · deck-framework-compact.

### 루프214 — empty/blank/pending leftover 카드

루프202–208은 TBD/해당없음만 stub로 본다. MiniMax는 `empty`/`blank`/`pending`으로 빠진 기둥을 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `empty set` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프214 · deck-framework-compact.

### 루프213 — 동일 vw 폭이 3열을 잠그는 문제

루프207은 %만 column-share로 본다. MiniMax는 `width:30vw`를 찍어 3열이 잘리거나 grow가 막힌다. 22–48vw만 벗긴다. 100vw·50vw는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프213 · deck-framework-compact.

### 루프212 — No. 3 / 번호 3 인덱스 leftover

루프205는 pillar/column/기둥만 본다. MiniMax는 `No. 3`/`번호 3`만 남겨 3열이 유지된다. 해당 접두+숫자만 leftover. 전-인덱스 스텝 행은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프212 · deck-framework-compact.

### 루프211 — n.a. / t.b.d. dotted stub 카드

루프202는 `na`/`tbd`만 본다. MiniMax는 `n.a.`/`T.B.D.`처럼 점을 남겨 3열이 유지된다. compact에서 `.`를 지워 기존 stub 토큰에 맞춘다. `3.14` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프211 · deck-framework-compact.

### 루프210 — 동일 33% 그리드 트랙 leftover

루프190/195는 `1fr`만 equal track으로 본다. MiniMax는 `33% 33% 33%`를 남겨 2장이면 빈 띠, 3장이면 클립이 난다. 동일 22–48% 트랙만 `minmax(0,1fr)`로 바꾼다. `50% 50%` split은 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프210 · deck-framework-compact.

### 루프209 — PILLAR III 로마숫자 leftover 카드

루프205는 아라비아 인덱스만 leftover로 본다. MiniMax는 `PILLAR III`/`기둥 Ⅲ`로 빠진 기둥을 채워 3열이 유지된다. 로마 I–XII / Ⅰ–Ⅻ만 있는 카드만 제거. 전-로마 스텝 행과 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프209 · deck-framework-compact.

### 루프208 — 해당없음/미입력 leftover 카드가 3열을 붙잡는 문제

루프202는 TBD/N/A/준비중만 stub로 본다. MiniMax는 빠진 기둥을 `해당없음`/`미입력`으로 채워 3열이 유지된다. 카드 전체가 stub일 때만 제거. `부작용 없음` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프208 · deck-framework-compact.

### 루프207 — 동일 % 폭이 3열을 잠그는 문제

루프198–201은 px/rem만 본다. MiniMax는 `width:32%`/`flex:0 0 33%`를 찍어 3열이 잘리거나 grow가 막힌다. 22–48% column-share만 벗긴다. 100% stretch·50% split·영문 카탈로그는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프207 · deck-framework-compact.

### 루프206 — stacked first-child가 페이지 2를 가리는 문제

`#od-stacked-deck-stage > .slide:first-child { display:block }`는 부트용인데 전환 후에도 살아 있다. 인라인 hide가 빠지면 1장이 다시 그려진다. `.active`가 생기기 전에만 first-child를 켠다. 카피 발명 없음.

검증: web srcdoc-deck-bridge-nested-slides 루프206.

### 루프205 — PILLAR/COLUMN 인덱스만 leftover 카드

루프197–202는 빈 셸·placeholder·TBD stub만 leftover로 본다. MiniMax는 빠진 기둥을 `PILLAR 03`/`기둥 3`으로 채워 3열이 유지된다. 카드 전체가 인덱스 라벨일 때만 제거. 전 peer가 숫자인 스텝 행과 `PILLAR 03`+실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프205 · deck-framework-compact.

### 루프204 — 클래스 flex 행이 191을 건너뛰어 좌측 편중

루프191은 인라인 `display:flex`만 본다. `.cards { display:flex }` 클래스 행은 grow가 없어 카드가 왼쪽에 몰린다. Hangul/brief 덱만 peer에 `flex:1 1 0`. 컬럼·영문 카탈로그·인라인 flex는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프204 · deck-framework-compact.

### 루프203 — 제목+내부 카드를 194가 빈 셸로 쪼개는 문제

루프199는 바깥 텍스트 없는 이중 래핑만 푼다. `PILLAR 01` + 내부 `.card`는 호스트로 남겼는데 194가 안쪽을 형제로 닫아 빈 셸이 됐다. 안쪽이 스스로 닫힌 뒤 호스트 `</div>`가 이어지면 봉합하지 않는다. 미닫힌 형제는 그대로 닫는다. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프203 · 194 · unbalanced-card-slide.

### 루프202 — TBD/N/A/준비중 stub 카드가 3열을 붙잡는 문제

루프200은 `제목`/`내용`/`...`만 leftover로 본다. MiniMax는 빠진 기둥을 `TBD`/`N/A`/`준비중`으로 채워 3열이 유지된다. 카드 전체가 stub 토큰일 때만 제거. `추후 적분 예정` 실카피는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프202 · deck-framework-compact.

### 루프201 — 동일 max-width / flex:0 0 이 3열을 잠그는 문제

루프198은 `width`/`min-width`/`flex-basis`만 벗긴다. MiniMax는 카드마다 `max-width:560px` 또는 `flex: 0 0 36rem`을 찍어 191이 grow를 줘도 폭이 잠기고 우측이 빈 띠가 된다. peer 전부가 비슷한 큰 고정 주축일 때만 max-width와 `flex:0 0`/`none` 길이를 제거한다. `flex:1 1` grow와 혼합 sidebar, 영문 카탈로그는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프201 · deck-framework-compact.

### 루프200 — placeholder leftover 카드가 3열을 붙잡는 문제

루프197은 `visibleText.length < 2`만 빈 셸로 본다. MiniMax는 빠진 기둥을 `제목`/`내용`/`...`/`내용을 입력하세요`로 채워 자식이 3이라 190/195/197이 축소하지 못한다. 카드 전체가 placeholder 토큰 1–4개일 때만 제거한다. `극한`/`적분` 실카피와 영문 카탈로그 Title/Body는 유지. 적분 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프200 · deck-framework-compact placeholder card shell.

### 루프199 — 균형 잡힌 card-in-card 이중 래핑

루프194는 미닫힌 형제만 봉합한다. 이미 닫힌 `<div class="card"><div class="card">`는 형제로 오인해 빈 바깥 셸이 생기고 패딩이 겹친다. 같은 토큰·자식 1장·바깥 텍스트 없을 때만 안쪽을 남긴다. `card-body`와 두 장 호스트는 유지. 194보다 먼저 실행. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프199 · unbalanced-card-slide.

### 루프198 — 동일 고정폭 카드가 3열을 자르는 문제

루프195는 트랙을 `minmax(0,1fr)`로 줄일 수 있게 했다. MiniMax는 카드마다 `width:560px`/`min-width:580px`를 남겨 3장이 1920 밖으로 잘리거나, 루프191이 sidebar로 오인해 `flex:1`을 안 준다. peer 전부가 비슷한 큰 고정 폭일 때만 그 제약을 제거한다. 혼합 sidebar와 영문 카탈로그는 유지. 카피 발명 없음.

검증: contracts heal-ai-generated-deck 루프198 · deck-framework-compact.

### 루프197 — 빈 leftover 카드 셸이 3열을 붙잡는 문제

루프190/195는 그리드 자식 *개수*로 열을 줄인다. MiniMax는 빠진 기둥을 `<div class="card"></div>`(또는 padding만 있는 빈 박스)로 남겨 자식이 3이라 축소가 안 되고, 루프191이 그 빈 셸에 `flex:1`을 줘 미적분 리포트와 같은 우측 빈 띠가 남는다. 채워진 peer가 1장 이상 있을 때만 빈 cardish peer를 제거한다 — 빠진 적분 카피는 만들지 않는다. Hangul/brief 게이트로 영문 카탈로그 빈 셀은 유지.

검증: contracts heal-ai-generated-deck 루프197 · deck-framework-compact empty card shell.

### 루프196 — 공손형 프롬프트 앵무 · residual 2겹 drop

루프193은 `만들어줘`와 `피피티를 만들어 주세요`를 다른 문자열로 봐 공손형 복붙이 persist됐다. 루프194 봉합 뒤에도 `article`/`aside` 2겹과 봉합 실패 residual은 임계 3에 안 걸린다. parrot normalize + drop 임계 2.

검증: web validate/deck-html-content · contracts unbalanced-card-slide.

### 루프195 — 3열 클립 · 2×2 leftover · class grid

루프190은 인라인 `1fr 1fr 1fr`만 줄였다. 카드가 3장이어도 `1fr` = `minmax(auto,1fr)`이라 마지막이 1920 밖으로 잘리고, 템플릿 `.grid` 2×2에 카드 2장만 있으면 아랫줄이 빈 띠다. `minmax(0,1fr)` 정규화 + equal row 축소 + Hangul/brief 클래스 그리드 인라인 축소.

### 루프194 — nested unclosed `.card` sibling 봉합

루프189 residual: 슬라이드 4/5에서 MiniMax가 `<div class="card">`를 닫지 않고 다음 카드를 열어 뒤 본문이 삼켜졌다. 루프190b는 open-close 차이 ≥3인 non-cover 장만 drop한다. 루프194는 (1) 형제 cardish 열기 전 이전 card 닫기 (2) slide fragment 끝 leftover open 닫기로 장을 살려 severe drop 전에 균형을 맞춘다 — 카피 발명 없음. cardish 판정은 class 속성만 본다(`grid-template-columns` `columns` 오탐 방지).

검증: contracts heal-ai-generated-deck · heal-severely-unbalanced-card-slide · outline/user-report.

### 루프193 — raw prompt 반복 덱 차단

사용자 리포트에서 “템플릿을 골랐는데 내용 생성이 아니라 입력 프롬프트가 그대로 들어간 덱”이 반복됐다. 구조상 `<!doctype html>…</html>`로 닫혀 있고 일부 템플릿 장식도 있어 기존 HTML validator와 short-draft heal 허용을 통과할 수 있었다. 이번 루프에서는 3장 이상 덱에서 사용자 원문 brief가 여러 슬라이드 heading/body에 반복되는 경우를 `low-substance`로 분류한다.

보수적으로 적용했다. 단일 cover가 “피피티 만들어줘”류 instruction-copy인 케이스는 기존처럼 cover retitle/top-up 경로가 처리한다. 차단 대상은 같은 raw brief가 여러 장에 반복되어 실제 내용 생성 실패로 보는 경우다.

검증: `apps/web` artifact validate/deck-html-content 76/76.

### 루프190b — 심한 container tag 불균형 slide drop (루프194 auto-repair 실패 시 fallback)

삼각함수 리포트 계열에서 카드형 slide 내부 `<div>` open이 close보다 3개 이상 많아 뒤 슬라이드가 카드/grid 컨텍스트에 말려 들어가거나 preview에서 세로 붕괴처럼 보였다. 누락 close를 추정 삽입하는 방식은 형제 컨테이너를 잘못 포섭할 위험이 커서, 현재 시점에서는 non-cover slide 단위 drop을 선택했다. 루프194가 slide 단위 auto-repair (`closeUnclosedSiblingCardsInSlides`)를 severe drop 직전 실행하므로, 이 190b drop 은 auto-repair 후에도 여전히 diff ≥ 3 인 절망적 케이스만 처리하는 fallback 이다.

규칙: `<script>/<style>/comment`를 제외하고 slide body 안 `<div>` open-close 차이가 3 이상인 경우만 제거한다. 첫 슬라이드는 절대 제거하지 않아 빈 덱으로 바뀌지 않게 했다. Full heal pipeline에서 idempotent하게 동작한다.

검증: `packages/contracts` severe-unbalanced-card-slide + deck-template-look-css 89/89.

### 다음 루프 후보 (2026-08-31 EOD 기준)

- **완료 (루프391):** user turn은 brief만 persist. 호스트 계약은 시스템 프롬프트(`templateClonePromptFill` / JSON fill). 계보는 `runContext.templateCloneFill`. Expo 예시는 주제 중립.
- **완료 (루프382):** prompt-fill 호스트 계약은 채팅에서 숨김. Expo worked example은 시스템 프롬프트에만. 덱 HTML 누수 heal.
- **완료 (루프378):** leftover host-nav는 display toggle이 translate/scroll보다 앞선다. clone-size hoist · 빈 deco unwrap. F3/IB ROW · Zhangzara · simple-deck 유지.
- **완료 (루프374):** leftover `#stage`+swipe script는 authored 1920/column이면 forceReveal가 실제로 숨김. deco residue · `div.slide` hoist · `min-width:1920`. F3/IB ROW 유지.
- **완료 (루프366):** 1920 leftover는 script가 있어도 `#stage` hoist. section/main unwrap. snap/overflow-x+1920은 swipe 아님. vw nudge 거부. Zhangzara `#deck`·공식 IB 유지.
- **완료 (루프363):** 1920 leftover + leaked `min-width:100vw`는 swipe가 아님. forceReveal 숨김 · scrollGo nudge 거부 · pan reset은 이동 후.
- **완료 (루프361):** neutralize column `#stage` leftover를 가로 스트립으로 오인하지 않음. host ←/→는 2장을 그림. 100vw nudge 거부. F3/281 유지.
- **완료 (루프355):** 칸 번호 `스무 번째` 빈 카드. 번호+본문 유지. 문자·서수 leftover 트랙 닫음.
- **완료 (루프354):** 본문 있는 행에서 heading-only 카드만 제거. 칩 행·2열 제목+본문·크롬 라벨 칩 유지.
- **완료 (루프353):** 빈 스페이서 혼합 행 제거. 전부 빈 크롬/스페이서면 행 전체 drop.
- **완료 (루프356–358):** numeric nbsp/ZWSP/empty heading · dash/ellipsis body · leftover-token body(전 비라벨 슬롯 미채움). 실본문 유지.
- **완료 (루프352):** 혼합 크롬+비크롬 행에서 빈 크롬만 제거. `.card` / `<ul>` 앵커 · column·영문 카탈로그 유지.
- **완료 (루프345–351):** Process/Pricing/Roadmap 구조 spill · title cover center · 칸 번호 Z. flex-column orphan grid / ul spill / cross-grid list / orphan chrome / inline cardish / flow text-align / `기둥 Z` drop.
- **완료 (루프344):** 빈 `<p>` / `<span>` 래퍼 본문 슬롯도 미채움. 미디어·라벨-only 칩·실본문 유지.
- **완료 (루프343):** 빈 `<div></div>` / `&nbsp;` 본문 슬롯도 미채움. 라벨-only 칩·실본문 유지.
- **완료 (루프342):** 혼합 행에서 `<br>`-only 본문 크롬 카드만 제거. 채워진 카드·column·영문 카탈로그 유지.
- **완료 (루프340):** flex 행 empty `<br>`-body 크롬 카드 drop. column·본문 있는 행 유지.
- **완료 (루프339):** 칸 번호 Y 빈 카드. 띄어쓴 `스무 번째` / `기둥 Z`와 번호+본문은 유지. 280 vs 900 sidebar는 유지.
- **완료 (루프338):** 칸 번호 W 빈 카드. 띄어쓴 `스무 번째` / `기둥 Y`(로마 `X` 제외)와 번호+본문은 유지.
- **완료 (루프337):** 칸 번호 U 빈 카드. 띄어쓴 `스무 번째` / `기둥 W`(로마 `V` 제외)와 번호+본문은 유지.
- **완료 (루프336):** 칸 번호 T 빈 카드. 띄어쓴 `스무 번째` / `기둥 U`와 번호+본문은 유지.
- **완료 (루프331–335):** neuralstudio.kr 회사소개 잔여. h2 tail dup / cross-grid absorb / orphan `<b>` tail / empty `<br>`-body grid / void depth 안정화.
- **완료 (루프327):** 칸 번호 S 빈 카드. 띄어쓴 `스무 번째` / `기둥 T`와 번호+본문은 유지.
- **완료 (루프326):** 칸 번호 R 빈 카드. 띄어쓴 `스무 번째` / `기둥 S`와 번호+본문은 유지.
- **완료 (루프325):** 칸 번호 스무째 빈 카드. 띄어쓴 `스무 번째` / `기둥 R`과 번호+본문은 유지.
- **완료 (루프324):** 칸 번호 Q 빈 카드. `스무 번째` / `기둥 R`과 번호+본문은 유지.
- **완료 (루프323):** toolbox skill/plugin/MCP/connector 픽·큐 제목·restore·프로젝트명이 워크플로 덤프를 노출하지 않음. `기둥 Q`는 여전히 번호로 보지 않음.
- **완료 (루프322):** 칸 번호 P · 열아홉째 빈 카드. `스무 번째` / `기둥 Q`와 번호+본문은 유지.
- **완료 (루프321):** 디자인 다듬기 등 toolbox 액션이 input에 워크플로 덤프를 넣지 않음. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프320):** first-fill 명시 1–10장 한 턴 · 미지정 6 · 11+ top-up. persist short-draft ≤6 유지. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프314–319):** `sibling-count()` 균등 트랙 · 33/34 rounding · `grid-auto-rows` share · `constant(..., share)` · `0ch`/`0cqw` floor · 문장부호-only 연속 장. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프307–313):** inline-grid spill · `flex:G S` leftover · `grid-auto-columns` share · `env(..., share)` · `repeat(auto-fill|fit, share)` · gap-adjusted calc · `-webkit-flex`. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프305–306):** `flex:33%` one-value · `fit-content(share)` 트랙. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프303–304):** `clamp`/`min`/`max` share 트랙 · `flex:0 1 calc(share)` basis. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프300–302):** `minmax(0px,…)` floor · class-bound 인접 동일 카드 · `flex:1 1 calc(share)` basis. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프295–299):** 연속 동일 substance 장 · calc() peer-lock · 인접 동일 카드 · class-bound spill · var(--x, share) 트랙. `기둥 P`는 여전히 번호로 보지 않음.
- **완료 (루프294):** flex 행 크롬 카드 spill. 크롬 1개 스플릿·column·sidebar 유지.
- **완료 (루프293):** class 없는 크롬 카드 spill absorb · 동일 style nest flatten. `SOH` footer·50/50·sidebar 유지.
- **완료 (루프292):** `minmax(0, calc(share))` / `calc(100%/3)` equal-track. `calc(50%)` 2열은 유지.
- **완료 (루프351 · 칸 번호 Z):** `기둥 Z` 빈 카드 drop. 띄어쓴 `스무 번째`·번호+본문 유지. 로마 `V`/`X` 유지.
- **완료 (루프289–290):** `minmax(0,share)` equal-track · logical `inline-size` peer lock. 3장 280 vs 900 sidebar는 의도적 유지.
- **인접 (루프206 밖):** native `#deck-next` active off-by-one는 루프281–282로 닫힘.
- **완료 (후보 C · leftover 문자/서수):** A–Z / 가…하 / 첫째…스무 번째 닫힘(루프355). 280 vs 900 sidebar는 의도적 유지.

## 진행

| 항목 | 상태 |
|------|------|
| chat leftover: WD/SLIDE 짧은 트랙 크롬 | ☑ round27–28 |
| chat leftover: PAGE/SEC/LECTURE · bullet/hyphen · middle-dot 배지 | ☑ round29 |
| chat leftover: CHAPTER 트랙 · 한 자리 `5 / CHECKLIST` | ☑ round30 |
| chat leftover: PART 트랙 · figure hsl | ☑ round31 |
| chat leftover: UNIT/STEP/MODULE/SECTION · ACT/SCENE/PHASE · EPISODE/BLOCK/FRAME/SESSION | ☑ round32 |
| chat leftover: APPENDIX/TABLE/TOPIC/TRACK/PANEL/CARD/BEAT/LESSON/CLIP/ROUND/PASS/NOTE | ☑ round33 |
| chat leftover: QUOTE/ASIDE/CALL/HINT/FAQ/LAB/DEMO/DRILL/INDEX/TOC/MAP/BRIEF | ☑ round34 |
| chat leftover: HOOK/OUTRO/AGENDA/COVER/TAKEAWAY/QNA/TIP/EXAMPLE … | ☑ round35 |
| chat leftover: SCREEN/TASK/WORKSHOP/DECK/MOTIF | ☑ round35 |
| chat leftover: OVERVIEW/PROBLEM/KPI/CTA/ROADMAP/COMPARE … | ☑ round36 |
| chat leftover: LAYOUT/HERO/NAV/BADGE/ICON/FIGURE … | ☑ round37 |
| chat leftover: GALLERY/MODAL/TAB/FORM/BUTTON/WIDGET … | ☑ round38 |
| chat leftover: AVATAR/CHIP/DROPDOWN/DASHBOARD/CANVAS … | ☑ round39 |
| chat leftover: TOOLTIP/CALLOUT/COMMENT/LOGO/SKELETON/PAGINATION … | ☑ round40 |
| chat leftover: SPLIT/SURFACE/GRADIENT/GLASS/SHADOW … | ☑ round41 |
| chat leftover: RIBBON/WATERMARK/SCRIM/DIVIDER/CONTAINER … | ☑ round42 |
| chat leftover: BLEED/PARALLAX/DRAFT/TODO … | ☑ round43 |
| chat leftover: LETTERBOX/ZINDEX/SVG/GLITCH … | ☑ round44 |
| chat leftover: SPARKLINE/DROPCAP/FUNNEL/GLOSSARY … | ☑ round45 |
| chat leftover: AXIS/KPISTRIP/SPLITVIEW/MAGNIFIER … | ☑ round46 |
| chat leftover: TOCENTRY/HASHTAG/DOWNLOADBTN … | ☑ round47 |
| chat leftover: ICONBTN/SEGMENT/COMMANDPALETTE … | ☑ round48 |
| chat leftover: ACTIONBAR/EMPTYSTATE/DATAGRID … | ☑ round49 |
| chat leftover: DRAGDROP/HITAREA/IFRAME … | ☑ round50 |
| chat leftover: *BTN/*CTRL/*STATE 접미사 캐치올 | ☑ round51 |
| chat leftover: VIEW/HOST/PANEL/CARD … 접미사 확장 | ☑ round52 |
| chat leftover: MODAL/CHART/IMAGE/VIDEO … 접미사 확장 | ☑ round53 |
| chat leftover: HERO/KPI/COVER/SECTION … 접미사 확장 | ☑ round54 |
| chat leftover: BRIEF/SOLUTION/LAB/BEAT … 접미사 확장 | ☑ round55 |
| chat leftover: WEEK/CHAPTER/SLIDE/FINALE … 접미사 · @font-palette-values | ☑ round56 |
| chat leftover: GALLERY/STEPPER/COMMENT · @scroll-timeline | ☑ round57 |
| chat leftover: LABEL/AVATAR/CAPTION/TABLEAU … | ☑ round58 |
| chat leftover: DASHBOARD/STORYBOARD · truncated prop: | ☑ round59 |
| chat leftover: PORTFOLIO/PITCH/TEASER · @annotation | ☑ round60 |
| chat leftover: REEL/STORY/PODCAST/FAQS … | ☑ round61 |
| chat leftover: KEYVISUAL/TOKENS/THEME … | ☑ round62 |
| chat leftover: WIRE/SPRINT/USABILITY … | ☑ round63 |
| chat leftover: generic ALLCAPS `FOOXYZ 1 · XYZ` | ☑ round64 |
| chat leftover: 2글자 ALLCAPS `UX 2 · RESEARCH` | ☑ round68 |
| chat leftover: @custom-media/@stylistic | ☑ round65 |
| chat leftover: @custom-selector/@view-transition | ☑ round66 |
| leftover APPEND가 producedFiles 있어도 말풍선에 남음 | ☑ 루프18 |
| dump fallback이 `초안.`/`진행.`/한글 완료 문장을 지움 | ☑ 루프19 |
| split-* 마감/체크리스트가 inner clip을 건너뛰어 16:9 overflow | ☑ 루프20 |
| two-column `flex-direction:row` · col-left/right가 persist 후 세로 적재 | ☑ 루프21 |
| soft-CSS: oklab / color() continuation debris | ☑ round32 |
| soft-CSS: light-dark / device-cmyk continuation debris | ☑ round34 |
| soft-CSS: standalone `prop: value;` after Hangul status | ☑ round36 |
| persist: `li` + `hsl()` invented frame | ☑ |
| persist: `figure` comma/space hsl 프레임 | ☑ |
| persist: overlay `05 / CHECKLIST` span | ☑ |
| persist: 카드 안 중첩 배지 · h2/header · `position:fixed` · `05 · LABEL` | ☑ |
| persist: navy/indigo/cyan 1–2px fake outline | ☑ |
| persist: 색 방언 무관 1–2px 프레임 + `box-shadow` ring · kit `var(--border)` 유지 | ☑ |
| persist: oklch/oklab/lab/lch/color/color-mix · emerald/amber named frames | ☑ round32 |
| persist: `hwb()` invented frames · outline oklch | ☑ round33 |
| persist: device-cmyk · light-dark invented frames | ☑ round34 |
| persist: coral/tomato/rebeccapurple/gold … named frames | ☑ round35 |
| persist: main/blockquote/nav/ul/ol/dl kit bind hosts | ☑ round35 |
| persist: firebrick/orangered/khaki/slategray … named frames | ☑ round36 |
| persist: card-like p/span/h2–h4 (≥12px padding) kit bind · thin accent keep | ☑ round37 |
| persist: card-like rem/em padding (≥0.75rem) kit bind | ☑ round38 |
| persist: card-like % (≥4%) · ch (≥2ch) padding kit bind | ☑ round39 |
| persist: card-like vh/vw/vmin/vmax/dvh (≥2) padding kit bind | ☑ round40 |
| persist: card-like cqw/cqh/cqi/cqb (≥2) · details/summary/label/output kit bind | ☑ round41 |
| persist: card-like lh/cap/ex/ic/vb (≥2) · fieldset/legend/dialog/menu kit bind | ☑ round42 |
| persist: card-like pt/mm/cm (≥8pt/4mm) · h1/h5/mark/time kit bind | ☑ round43 |
| persist: cite/q/kbd/samp/small selective kit bind (a/button keep) | ☑ round44 |
| persist: aliceblue/chartreuse/darkgray … CSS named invent frames | ☑ round47 |
| persist: table/td/th selective kit bind (svg keep) | ☑ round48 |
| persist: column-count/place-items/flex-grow/writing-mode flow 복사 | ☑ round49 |
| persist: container-type/name/container flow 복사 | ☑ round51 |
| persist: scroll-snap/isolation/contain/user-select flow 복사 | ☑ round52 |
| persist: perspective/will-change/scroll-margin/print-color-adjust flow 복사 | ☑ round53 |
| persist: position/aspect-ratio/background/view-transition flow 복사 | ☑ round54 |
| persist: overflow/offset-path/view-timeline/margin flow 복사 | ☑ round55 |
| persist: font/text-align/color flow 복사 | ☑ round56 |
| persist: padding-block/list-style/table-layout flow 복사 | ☑ round57 |
| persist: float/break/orphans/shape-outside flow 복사 | ☑ round58 |
| persist: text-emphasis/field-sizing/reading-flow flow 복사 | ☑ round59 |
| persist: position-area/mask/text-box/initial-letter flow 복사 | ☑ round60 |
| persist: masonry/baseline/paint-order flow 복사 | ☑ round61 |
| persist: animation-range/column-rule flow 복사 | ☑ round62 |
| persist: scroll-marker/interactivity/contrast-color flow 복사 | ☑ round63 |
| persist: address/hgroup/search · data/meter kit bind | ☑ round65 |
| persist: corner-shape/text-box/anchor-center flow 복사 | ☑ round66 |
| persist: form kit · font-palette/wrap flow 복사 | ☑ round67 |
| persist: caret-animation/text-spacing flow 복사 | ☑ round68 |
| persist: math kit · scroll-padding/margin longhand flow | ☑ round69 |
| persist: scroll-padding-top · overflow-block flow 복사 | ☑ round70 |
| persist: margin/inset longhand · outline/border-block flow | ☑ round71 |
| persist: background/transform/transition/animation flow | ☑ round72 |
| persist: border-radius · grid-column/row flow | ☑ round73 |
| persist: cursor/scrollbar/text-edge flow | ☑ round74 |
| persist: font-variant/text-orientation flow | ☑ round75 |
| persist: padding-block/inline ic kit · font-synthesis-* | ☑ 루프74–75 / round91–92 |
| persist: text-size-adjust · text-wrap-mode/style | ☑ 루프76 / round93 |
| persist: initial-letter-* · math-shift · hyphenate-lines | ☑ 루프77 / round94 |
| persist: rt/rp/rtc kit · ascent/size-adjust · forced-colors | ☑ 루프78 / round95 |
| persist: scroll/view-timeline shorthand · line-clamp · palette | ☑ 루프79–82 / round96–99 |
| persist: page/marks/shape-inside/calc-size | ☑ 루프83 / round100 |
| persist: SVG fill/stroke · speak/user-modify · thin pad keep | ☑ 루프84–87 / round101–104 |
| persist: set5 combo 회귀 | ☑ 루프88 / round105 |
| persist: font-smooth · bdi/del/sub kit · SVG path · app-region | ☑ 루프89–93 / round106–110 |
| persist: webkit text-stroke/clip/box-orient · fullwidth · | ☑ 루프94–98 / round111–115 |
| persist: thin bdi keep · fill+path · starting-style · closure | ☑ 루프99–103 / round116–120 |
| persist: webkit-mask/filter/transform · print-color · pre kit | ☑ 루프104–113 / round121–130 |
| chat/persist: colon/pipe chrome · thin pre · combo/closure | ☑ 루프114–118 / round131–135 |
| persist: webkit-animation · hyphens/columns · text-security/drag | ☑ 루프120–124 / round136–140 |
| chat/persist: slash chrome · @function · reflect/locale · combo | ☑ 루프125–134 / round141–150 |
| persist: webkit-box-* · font-feature · logical sizes | ☑ 루프150–154 / round151–155 |
| persist: border-image · text-zoom · marquee · @nest · closure | ☑ 루프155–164 / round156–165 |
| persist: touch-callout · decoration-break · background vendor | ☑ 루프165–169 / round166–170 |
| persist: column-break · hyphenate · margin/padding/border logical | ☑ 루프170–179 / round171–180 |
| persist: transform-origin · writing-mode · opacity · flex longhands | ☑ 루프180–189 / round181–190 |
| chat/persist: @document · FOO keep · set22–24 combo/closure | ☑ 루프190–194 / round191–195 |
| persist: transition delay/timing · text-emphasis · box-sizing · border-spacing | ☑ 루프195–199 / round196–201 |
| chat/persist: @namespace · @font-feature-values · invent-frame · closure | ☑ 루프200–209 / round202–210 |
| persist: border-radius longhands · epub · clip-path · mask-box-image | ☑ 루프210–214 / round211–215 |
| persist: word-break · hyphenate · moz/ms select/transform · @charset | ☑ 루프215–224 / round216–225 |
| persist: ms-flex/grid · moz-background/columns · margin-collapse | ☑ 루프225–229 / round226–230 |
| persist: moz-user · ms-scroll/wrap · @view-transition · closure | ☑ 루프230–239 / round231–240 |
| persist: moz-border/box · transition/animation · invent-frame | ☑ 루프240–244 / round241–245 |
| persist: moz-outline/text · ms-flow · @scope · closure | ☑ 루프245–254 / round246–255 |
| persist: mask xy · moz-border-colors · ms-scrollbar · column-rule | ☑ 루프255–259 / round256–260 |
| persist: border-image · ms-word · line-grid · epub · at-rule harden | ☑ 루프260–284 / round261–285 |
| persist: blend · aspect-ratio · view-transition-class · shape/wrap | ☑ 루프285–294 / round286–295 |
| kit/chat: blockquote kit · region/flow · @page/@scroll-* · closure | ☑ 루프295–314 / round296–315 |
| persist: obscure moz/webkit vendor · moz-text-emphasis | ☑ 루프315–319 / round316–320 |
| kit/chat: list/landmark selective · @font-face/@keyframes · closure | ☑ 루프320–344 / round321–345 |
| kit: calc/min/max/clamp · lvh/lvw card padding | ☑ 루프345–349 / round346–350 |
| kit: section selective · nested slide close · invent-frame off flow | ☑ 루프350–354 / round351–355 |
| chat: FOO `=＝→⇒` separators · Step `:` keep | ☑ 루프355–359 / round356–360 |
| kit/chat: set58–60 combo/closure · flow style order harden | ☑ 루프360–374 / round361–375 |
| kit: lvmin/svmin/dv* · Q padding | ☑ 루프375–379 / round376–380 |
| kit: form selective · invent-frame off flow | ☑ 루프380–384 / round381–385 |
| chat: FOO `：»›≫` · @when/@else harden | ☑ 루프385–389 / round386–390 |
| kit/chat: set64–66 combo/closure | ☑ 루프390–404 / round391–405 |
| kit: leading-dot rem/em · env/var px · .4cm/.15in | ☑ 루프405–409 / round406–410 |
| chat: FOO `⇢⇝↦➤⟹` · form/section selective keep | ☑ 루프410–419 / round411–420 |
| kit/chat: set70–72 combo/closure | ☑ 루프420–434 / round421–435 |
| kit: calc additive same-unit sum (px/rem/Q…) | ☑ 루프435–439 / round436–440 |
| chat: FOO `⟶➜➡➔➢` · form/section calc | ☑ 루프440–449 / round441–450 |
| kit/chat: set76–78 combo/closure | ☑ 루프450–464 / round451–465 |
| kit: calc % sum · rem/em+px@16 mixed | ☑ 루프465–469 / round466–470 |
| chat: FOO `↠↝➞➠◆♦▶▷▸▹` | ☑ 루프470–479 / round471–480 |
| kit/chat: set82–83 combo/closure | ☑ 루프480–489 / round481–490 |
| kit: calc rem+em 1:1 mixed | ☑ 루프490–494 / round491–495 |
| chat: FOO `➙➛➝➟➣►◁◀◂◃◇○` | ☑ 루프495–504 / round496–505 |
| kit/chat: set87–88 combo/closure | ☑ 루프505–514 / round506–515 |
| clone: IB pitch-book 데모 카피가 한국어 brief에 남음 | ☑ 루프57 |
| preview: #stage 1920px 스트립이 100vw로만 살짝 이동 | ☑ 루프57 |
| persist: 카탈로그 예제 leftover를 filled로 저장 | ☑ |
| leftover가 persist skip 후에도 미리보기로 열림 · top-up append | ☑ |
| leftover IB가 artifact_regression으로 토픽 fill을 막음 | ☑ |
| preview: #stage next가 첫 장만 밀림 (핀 전용·stacked 선점) | ☑ |
| persist: 스크럽된 IB 껍데기가 다시 regression | ☑ |
| preview: liveHtml/raw example이 Hartfield를 그대로 그림 | ☑ 루프119 |
| preview: 1920px #stage next가 native 100vw로 첫 장만 밀림 | ☑ 루프119 |
| persist: leftover catalog를 skip만 하고 저장하지 않음 | ☑ 루프119 |
| preview: `[od:slide_count_top_up]`이 슬라이드 본문으로 보임 | ☑ |
| persist: Motif bind가 Hartfield stamp를 다시 넣음 | ☑ |
| persist: 커버 제목 `슬라이드`가 brief를 무시 | ☑ |
| preview: brief 없는 FileViewer가 raw IB leftover를 그대로 그림 | ☑ 루프135 |
| preview: 인슬라이드 #next가 native 100vw로 첫 장만 밀림 | ☑ 루프135 |
| persist/preview: IB 표지가 빈 빨간 리본+잘린 h1로 남음 | ☑ 루프136 |
| persist: empty `.ribbon`/`.stamp` Motif가 밀집도를 깨뜨림 | ☑ 루프136 |
| preview: `[data-od-slide-flow]`가 neutralize relative로 이중 패딩 | ☑ 루프136 |
| heal: Daisy/weekly/Studio를 IB 매거진으로 오탐 | ☑ 루프137 |
| heal: 커버에 회화/쉐도잉 토픽 카피를 발명 | ☑ 루프137 |
| export: standalone가 성긴 IB 표지를 그대로 내보냄 | ☑ 루프137 |
| persist/preview: IB `.slide-inner` 1320×820 카드가 16:9를 안 채움 | ☑ 루프139 |
| persist/preview: IB 본문이 매거진 프레임 없이 상단 정렬 | ☑ 루프139 |
| persist/preview: flow가 magazine padding/`justify-content:center`를 이중 적용 | ☑ 루프140 |
| persist/preview: 16:9 채움 후 표지 제목이 하단, 본문은 위만 사용 | ☑ 루프141 |
| persist/preview: 성긴 본문 오른쪽 공백 · 카드 위 공백 · 44px h2 | ☑ 루프142 |
| persist/preview: 성긴 칩 세로 중앙 · 카드/리스트 내부 공백 · 14px ol | ☑ 루프143 |
| persist/preview: 제목+lede만 있는 본문이 16:9 하단을 비움 | ☑ 루프145 |
| kit: calc vh/%/vw + px 혼합 | ☑ 루프515–519 / round516–520 |
| chat: FOO `▲▼△▽★☆✦✧●◉` | ☑ 루프520–529 / round521–530 |
| kit/chat: set89–93 combo/closure | ☑ 루프530–544 / round531–545 |
| kit: calc lh|cap|ex · vb|vi 혼합 | ☑ 루프546–555 / round547–556 |
| chat: FOO `❖✪✫◎▣▢■□` (+★☆✦✧●◉) | ☑ 루프556–565 / round557–566 |
| kit/chat: set94–98 combo/closure | ☑ 루프566–570 / round567–571 |
| kit: calc cq · ic|ric · print 혼합 | ☑ 루프571–580 / round572–581 |
| chat: FOO `✶✸✹✺❋※†‡‣∙` | ☑ 루프581–590 / round582–591 |
| kit/chat: set99–103 combo/closure | ☑ 루프591–595 / round592–596 |
| kit: calc 교차 ch+cq · lh+ic · cq+vh · rem+ch · %+cq | ☑ 루프596–605 / round597–606 |
| chat: FOO `⬡⬢⬤⬥⬦◊◈⊕⊖⊗⊘⊙` | ☑ 루프606–615 / round607–616 |
| kit/chat: set104–108 combo/closure | ☑ 루프616–620 / round617–621 |
| kit: calc 교차 print+view/cq/% · ch|ic+vh | ☑ 루프621–630 / round622–631 |
| chat: FOO `⊞⊟⊠⊡⋄⋆∗∘⁕⁜` | ☑ 루프631–640 / round632–641 |
| kit/chat: set109–113 combo/closure | ☑ 루프641–645 / round642–646 |
| kit: calc 교차 rem|em+view/cq/% · lh|ex+view/cq | ☑ 루프646–655 / round647–656 |
| chat: FOO `✙✚✛✜✝✞✟✠✡✢` | ☑ 루프656–665 / round657–666 |
| kit/chat: set114–118 combo/closure | ☑ 루프666–670 / round667–671 |
| kit: calc 교차 rem|line|ch|ic|vb+print | ☑ 루프671–680 / round672–681 |
| chat: FOO `✣✤✥❇❈❁❂❃❄❅` | ☑ 루프681–690 / round682–691 |
| kit/chat: set119–123 combo/closure | ☑ 루프691–695 / round692–696 |
| kit: calc 교차 px+ch|lh|ic|vb|cq | ☑ 루프696–705 / round697–706 |
| chat: FOO `❆☾☽☿♁☰☱☲☳☴⚙⚛⚜` | ☑ 루프706–715 / round707–716 |
| kit/chat: set124–128 combo/closure | ☑ 루프716–720 / round717–721 |
| kit: calc 교차 px+print(pt/mm/pc/Q/cm/in) | ☑ 루프721–730 / round722–731 |
| chat: FOO `⚝⚡⚠⚽⚾⚀⚁⚂⚃⚄♔♕♖♗♘` | ☑ 루프731–740 / round732–741 |
| kit/chat: set129–133 combo/closure | ☑ 루프741–745 / round742–746 |
| kit: calc 삼중+ 단위 혼합(px 환산≥13) | ☑ 루프746–755 / round747–756 |
| chat: FOO `♟♜♝♞♛✂✈✉✎✏` | ☑ 루프756–765 / round757–766 |
| kit/chat: set134–138 combo/closure | ☑ 루프766–770 / round767–771 |
| kit: calc 음수 항·괄호 additive | ☑ 루프771–780 / round772–781 |
| chat: FOO `☏☎✆ℹ‽♮♯♭♩♪` | ☑ 루프781–790 / round782–791 |
| kit: calc 곱·나눗셈(단위×스칼라·괄호 additive) | ☑ 루프796–810 / round797–811 |
| chat: FOO `♠♣♥♦♤♡♢♧⌘⌥` | ☑ 루프811–820 / round812–821 |
| kit: calc 곱나눗셈 체인 · nested calc | ☑ 루프821–830 / round822–831 |
| chat: FOO `✓✔✕✖✗✘✚✱✳` | ☑ 루프831–840 / round832–841 |
| kit: min/max/clamp 패딩 해석 | ☑ 루프846–860 / round847–861 |
| chat: FOO `☀☁☂☃☄☼♨⌀⌂` | ☑ 루프861–870 / round862–871 |
| kit: calc +/* 우선순위 · nested min/max/clamp | ☑ 루프871–885 / round872–886 |
| chat: FOO `◐◑◒◓◔◕◖◗◘` | ☑ 루프886–895 / round887–896 |
| kit: calc(min)+ · var/env 폴백 | ☑ 루프896–910 / round897–911 |
| chat: FOO `①②③④⑤⑥⑦⑧⑨` | ☑ 루프911–920 / round912–921 |
| kit/chat: set139–143 combo/closure | ☑ 루프791–795 / round792–796 |
| persist/preview: leftover `·` 칩·발명 TOC가 brief 카피처럼 보임 | ☑ 루프144 |
| preview: 레터박스 `#17181d`만 보이고 1/N만 동작 | ☑ 루프146 |
| persist/preview: 표지 오른쪽 TOC 칸 공백 · 성긴 slide-inner 상단 고정 | ☑ 루프147 |
| persist/preview: 제목-only 본문 하단 공백 · lede가 목록 fill-track에 흡수 | ☑ 루프148 |
| persist/preview: framed leftover · FileViewer no-brief · 한글 `·` 오삭 | ☑ 루프149 |
| persist/preview: Biennale `에 대한` 표지 · 빈 장 · 헤딩 삼킴 · 4열 1카드 | ☑ 루프150 |
| persist/preview: Biennale에 IB Study Notes 표지가 남음 · relative radial | ☑ 루프151 |
| persist/FileViewer: AI 덱 heal이 저장 경로에 없음 · `에 대한` 제목 | ☑ 루프153 |
| persist/preview: Biennale 크림 위 크림 · Study Notes · Shado · overlay flatten | ☑ 루프154 |
| persist/preview: mast 없는 IB ribbon 표지가 Biennale에 남음 | ☑ 루프155 |
| persist/preview: Biennale 표지 blocks 없음 · chapter 16:9 공백 · 조사 공백 | ☑ 루프156 |
| persist/preview: Biennale s-data 1카드 공백 · quote 기본 문단 · footer 없는 표지 | ☑ 루프157 |
| persist/preview: Motif `.marker`가 본문 배지를 제목에 겹침 · pill이 flow를 쪼갬 · `.s6 .flow` 하단 클립 | ☑ 루프158 |
| pin: `<ul>/<li>/<figure>` 등 목록 컨테이너가 `position:absolute`로 park되면 평탄화 되지 않음 | ☑ 루프158-A |
| pin: flow wrapper 개수 · idempotency · motif 보존 invariant 방어 부재 | ☑ 루프158-A |
| persist/preview: look 슬롯 `.h/.arrow/.cell` absolute · content marker `::after` | ☑ 루프160 |
| persist/preview: 공식 PRESS PLAY Motif가 본문 `DAILY 30 MIN`과 겹침 | ☑ 루프161 |
| persist/preview: MiniMax 2×2 `.grid`가 카드 1개만 품고 3장을 형제로 버림 | ☑ 루프162 |
| persist/preview: flow 밖 SPEAKING pill이 clip 뒤에 숨고 비범위 deco remmerge 누락 | ☑ 루프163 |
| first-fill이 3장에서 멈추고 top-up 3+3으로 기본 6장이 3턴 | ☑ 루프164 |
| top-up이 remaining-all을 말해도 3장 배치 습관이면 기본 6장이 다시 3턴 | ☑ 루프169 |
| persist/preview: kami-deck leftover(Berlin/Claude Design/SKILL.md)가 삼각함수 브리프에 남음 | ☑ 루프165 |
| persist/preview: look CSS가 1–2장 사이에 끼어 표지 밀집도가 깨짐 | ☑ follow-up |
| persist/preview: MiniMax `<p="">` · 유출 `· Label` | ☑ follow-up |
| preview: Motif `span.ribbon`이 relative stretch로 빨간 줄 | ☑ follow-up |
| persist/preview: MiniMax 카드 `</div>` 조기 마감 · 64px step `</ol>` | ☑ 루프138 |
| persist/preview: 클래스만 있는 빈 `.ribbon` 빨간 칩 | ☑ 루프138 |
| FileViewer/export: magazine/salvage 미적용 | ☑ 루프138 |
| API-mode "save this as deck.html" 유출로 덱이 안 생김 | ☑ |
| clone: demo-banner/TOC/stat-quote 잔여 · #total 불일치 | ☑ 루프58 |
| preview: #slideCounter 고정 · hoist가 chrome 삭제 | ☑ 루프58 |
| daemon: leftover 데모 시드가 재클론을 막음 | ☑ 루프58 |
| 16:9 inner clip · kit card bind | ☑ |
| top-up 재진입 재호출 + 내부 프롬프트 노출 | ☑ 센티널+autoOpen; 루프9 reattach 차단 · leftover 숨김 |
| first-fill 3장 강제 → 요청 1–6장 한 턴 | ☑ 루프9 |
| first-fill: 명시 8–10장이 6장 캡+7+ top-up으로 잘림 | ☑ 루프320 |
| next-step 「디자인 다듬기」가 input에 워크플로 덤프를 노출 | ☑ 루프321 |
| toolbox skill/plugin/MCP 픽·큐 제목·restore가 워크플로 덤프를 노출 | ☑ 루프323 |
| auto-continue / streaming rule / short-draft 캡 3장 잔여 | ☑ 루프14 |
| 스트리밍 official look — 첫 닫힌 슬라이드에서 heal | ☑ 루프14 |
| PreviewModal/connector message 가드 | ☑ |
| cover 제목 `Presentation` → `슬라이드` | ☑ |
| MiniMax head-only incomplete-html-document-shell | ☑ 1차 |
| MiniMax `<body>`+미종료 `<style>` kit → incomplete-html-document-shell | ☑ 2차 |
| persist: Neutral 호스트/inner overlay 페인트 · 3장 1타이틀 · catalog heal skip | ☑ 루프5 |
| persist: grid flow clip · in-flow badge · CSS motif 전 장 | ☑ 루프5 |
| auto-continue: 슬라이드 카피 있는 truncated HTML 보존 · SLOT cover 거부 | ☑ 루프5 |
| persist: heading type-lock · inline Quicksand strip · low-substance verify | ☑ 루프8 |
| think 태그 / 내부 마크업 필터 | ☑ 기존 |
| preview/export: 작성자 JS presenter를 MiniMax salvage로 오인해 페이지 누락 | ☑ 루프159 |
| preview/export: MiniMax `.slide .arrow{display:none}` scope-rewrite 부작용으로 body `.arrow` CSS-삼각형 chrome이 step 카드에 잔재 | ☑ 루프166 |
| preview/export: MiniMax 인라인 uppercase-mono footer(PAGE·EDITION·CHAPTER)가 class 없이 flow 앞쪽에 몰려 하단 대공백 잔존 | ☑ 루프167 |
| persist recover/reuse: `AGENT_EXECUTION_FAILED` 후 남은 kami-deck example.html leftover가 스크럽 없이 저장·렌더 (Claude Design·Apache-2.0·Berlin 잔재 + tagline/dash-list brief 유출) | ☑ 루프168 |
| persist/preview: heal `allowEmptyBrief`가 공식 영문 kami LOOK/export를 지움 | ☑ 루프172 |
| persist/preview: Claude Design 문장 없는 부분 leftover(eyebrow·Berlin) 미감지 | ☑ 루프173 |
| persist/preview: `삼각함수 · N` 제목-only 빈 장 · leftover `#nav`/`#hint` | ☑ 루프174 |
| persist/preview: Broadside leftover(`[[Author Name]]`·빈 li·브리프 lead) + `[data-anim]` 비가시 | ☑ 루프175 |
| persist/preview: look 부재 시 Broadside `[data-anim]` 비가시 · CSS 토큰 leftover 오탐 | ☑ 루프176–177 |
| persist/preview: business-template placeholder 확장(`[Company]`·`[Client]`·`[Project]`·`[Version]` 등) leftover 미scrub | ☑ 루프178 |
| persist recover/reuse: topic+counter 빈 장(`X · N`)이 short-draft로 저장 · skipped-incomplete 미적용 | ☑ 루프179 |
| preview: pitch-deck cover 그라디언트(`var(--grad)`)가 `.tpl-* .mega/.avatar/.cover-blob`로부터 슬라이드 paper로 오탐 → 모든 슬라이드 배경 그라디언트 (사용자 리포트 "결과물 내용 없음 + 템플릿 적용 안됨") | ☑ 루프180 |
| persist/preview: 제목-only 아웃라인(≥4장·≥60% heading-only) · 긴 제목만으로 filled 오판 | ☑ 루프181 |
| heal: MiniMax body-fill 실패로 동일 title-only 슬라이드 연속 2장 (예: `<h1>삼각함수</h1>` × 2) — persist gate를 우회한 케이스에서 preview 축소 | ☑ 루프182 |
| persist/UX: low-substance skip을 "응답 끊김" 배너로 오표기 | ☑ 루프183 |
| first-fill: Home/Canvas `5-6` 숏 요청이 안정성 캡+later-append로 여러 턴 | ☑ 루프184 |
| persist/UX: low-substance skip 후에도 auto-continue("이어쓰기") 발동 | ☑ 루프185 |
| heal: 첫 장 임시 `slide-title` title-only 셸 뒤에 실제 cover가 이어지는 덱 · 앵커 없는 `translateY(-50%)`로 제목이 상단 클립 | ☑ 루프186 |
| persist/preview: pitch-deck `.cover-bg` compact flatten으로 워시 소실 · 투명 장 letterbox 투시 | ☑ 루프187 |
| heal/persist: bare leading title splash(`slide-title` 없음) · 3장 all-title outline short-draft | ☑ 루프188 |
| QA/heal: 사용자 삼각함수 fixture pin + `AGENT_EXECUTION_STALLED` 전용 카피 회귀 + calc pure-mul px floor | ☑ 루프189 |
| persist/preview: `1fr 1fr 1fr` 3열에 카드 2장만 남아 좌측 편중 · 빈 세 번째 트랙 (미적분 세 기둥) | ☑ 루프190 |
| persist/preview: flex row에 grow 없이 카드 2–3장만 남아 좌측 편중 | ☑ 루프191 |
| catalog PreviewModal: Sakura Chroma 등 `.stage` opacity-stack을 IB 가로 스트립으로 오역해 페이지 이동 시 본문 공백 | ☑ 루프192 |
| persist: raw user brief가 여러 장 heading/body에 반복되는 닫힌 덱 low-substance 차단 | ☑ 루프193 |
| heal: 심한 `<div>` 불균형(open−close≥3) non-cover 장 drop (루프190b) | ☑ 루프190b |
| heal: 슬라이드 4/5 nested unclosed `.card`로 뒤 본문 삼킴 (루프189 residual) | ☑ 루프194 |
| persist/preview: 채워진 3열 `1fr` 클립 · 2×2 leftover 빈 아랫줄 · 클래스 그리드 미달 | ☑ 루프195 |
| persist: `만들어 주세요`/`을를`만 다른 프롬프트 앵무 · residual 2겹 drop | ☑ 루프196 |
| persist/preview: 빈 leftover 카드 셸이 3열/flex 행을 붙잡아 우측 빈 띠 | ☑ 루프197 |
| persist/preview: 동일 px/rem 카드 폭이 minmax/flex shrink를 막아 3열 클립 | ☑ 루프198 |
| heal: 균형 잡힌 card-in-card 이중 래핑이 194에 빈 셸로 오분해됨 | ☑ 루프199 |
| persist/preview: 제목/내용/... placeholder 카드가 3열을 붙잡아 빈 띠 | ☑ 루프200 |
| persist/preview: 동일 max-width / flex:0 0 이 grow를 막아 3열 클립·빈 띠 | ☑ 루프201 |
| persist/preview: TBD/N/A/준비중 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프202 |
| heal: 제목+내부 `.card`를 194가 빈 셸로 쪼갬 | ☑ 루프203 |
| persist/preview: 클래스 `.cards{display:flex}` 행이 grow 없이 좌측 편중 | ☑ 루프204 |
| persist/preview: PILLAR/COLUMN/기둥 N 인덱스 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프205 |
| catalog PreviewModal: stacked first-child CSS가 페이지 2에서 1장을 다시 그림 | ☑ 루프206 |
| persist/preview: 동일 22–48% 카드 폭이 grow를 막아 3열 클립·빈 띠 | ☑ 루프207 |
| persist/preview: 해당없음/미입력 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프208 |
| persist/preview: PILLAR III/기둥 Ⅲ 로마 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프209 |
| persist/preview: 동일 33% 그리드 트랙이 2장 leftover · 3장 클립 | ☑ 루프210 |
| persist/preview: n.a./T.B.D. dotted stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프211 |
| persist/preview: No. 3/번호 3 인덱스 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프212 |
| persist/preview: 동일 22–48vw 카드 폭이 grow를 막아 3열 클립·빈 띠 | ☑ 루프213 |
| persist/preview: empty/blank/pending stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프214 |
| persist/preview: 동일 33vw 그리드 트랙이 2장 leftover · 3장 클립 | ☑ 루프215 |
| persist/preview: 작성예정/입력필요 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프216 |
| persist/preview: KEY 3/테마 3 인덱스 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프217 |
| persist/preview: dummy/예시 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프218 |
| persist/preview: 원문자 ③/전각 ３ leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프219 |
| persist/preview: 동일 1.0fr 그리드 트랙이 2장 leftover · 3장 클립 | ☑ 루프220 |
| persist/preview: minmax(auto,1fr) 트랙이 3열 클립 · 2장 leftover | ☑ 루프221 |
| persist/preview: Phase 3/축 3 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프222 |
| persist/preview: tobefilled/filllater stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프223 |
| persist/preview: 대기/soon/later stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프224 |
| persist/preview: 00/PILLAR 0 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프225 |
| persist/preview: 전각 ０/원문자 ⓪ leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프226 |
| persist/preview: lorem ipsum/placeholder stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프227 |
| persist/preview: 자료없음/정보없음 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프228 |
| persist/preview: Module 3/섹션 3 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프229 |
| persist/preview: 10/PILLAR 10 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프230 |
| persist/preview: 임시/fake stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프231 |
| heal: 앵커 없는 `translate(-50%,-50%)` / translate3d 클립 | ☑ 루프232 |
| persist: 닫힌 2장 raw brief parrot low-substance | ☑ 루프233 |
| heal: bare slide 실cover 앞 title splash 잔존 | ☑ 루프234 |
| persist: title+장식 SVG가 deliverable/low-substance 면제 | ☑ 루프235 |
| heal: 비연속 duplicate title-only leftover 잔존 | ☑ 루프236 |
| persist/preview: C/기둥 다/(3)/3번 leftover 인덱스가 3열을 붙잡아 빈 띠 | ☑ 루프237 |
| persist/preview: 동일 33vh/vmin 트랙·카드 폭이 leftover 빈 띠·클립 | ☑ 루프238 |
| persist/preview: D/기둥 마/첫째 leftover 인덱스가 3열을 붙잡아 빈 띠 | ☑ 루프239 |
| persist/preview: 400 vs 600 max-width가 leftover lock을 피해 3열 클립 | ☑ 루프240 |
| persist/preview: xxx/asdf stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프241 |
| persist/preview: Group 3/행 3 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프242 |
| persist/preview: null/undefined stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프243 |
| persist/preview: pass/skip stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프244 |
| persist/preview: 동일 33dvw/lvw 트랙·카드 폭이 leftover 빈 띠·클립 | ☑ 루프245 |
| persist/preview: 동일 33cqmin/cqmax 트랙·카드 폭이 leftover 빈 띠·클립 | ☑ 루프246 |
| persist/preview: foo/bar/baz stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프247 |
| persist/preview: Chapter 3/장 3 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프248 |
| persist/preview: FIXME/hack stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프249 |
| persist/preview: 동일 33dvmin/svmin 트랙·카드 폭이 leftover 빈 띠·클립 | ☑ 루프250 |
| persist/preview: 동일 33vi/vb 트랙·카드 폭이 leftover 빈 띠·클립 | ☑ 루프251 |
| heal: 영문 MiniMax class-bound grid/flex가 Hangul gate에 스킵 | ☑ 루프252 |
| persist: 닫힌 title-only 골격 soft-salvage 면제 | ☑ 루프253 |
| heal: nested/unclosed slide span 범위 오인 | ☑ 루프254 |
| persist/preview: 동일 0.33fr 그리드 트랙이 2장 leftover · 3장 클립 | ☑ 루프255 |
| persist/preview: Lesson 3/강 3 leftover 카드가 3열을 붙잡아 빈 띠 | ☑ 루프256 |
| persist/preview: etc/기타/등등 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프257 |
| persist/preview: ok/done/완료 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프258 |
| persist/preview: E/기둥 바/여섯째 leftover 인덱스가 3열을 붙잡아 빈 띠 | ☑ 루프261 |
| persist/preview: 3열 400 vs 800 max-width가 leftover lock을 피해 클립 | ☑ 루프262 |
| leftover extra-copy를 주제 단어(미분/적분)로 하드코딩 | ☑ 루프259 |
| persist/preview: misc/기타사항 stub 카드가 3열을 붙잡아 빈 띠 | ☑ 루프264 |
| persist/preview: 그외/other/rest leftover stub가 3열을 붙잡아 빈 띠 | ☑ 루프265 |
| persist/preview: G/기둥 아/열한째 leftover 인덱스가 3열을 붙잡아 빈 띠 | ☑ 루프266 |
| persist/preview: H/기둥 자/열두째 leftover 인덱스가 3열을 붙잡아 빈 띠 | ☑ 루프272 |
| persist/preview: J/기둥 차/열세째 leftover 인덱스가 3열을 붙잡아 빈 띠 | ☑ 루프274 |
| persist/preview: 칸 번호만 있는 3열 카드(K · 열 라벨 카 · 열네째) | ☑ 루프278 |
| persist/preview: 칸 번호만 있는 3열 카드(L · 열 라벨 타 · 열다섯째) | ☑ 루프285 |
| persist/preview: 칸 번호만 있는 3열 카드(M · 열 라벨 파 · 열여섯째) | ☑ 루프286 |
| persist/preview: 칸 번호만 있는 3열 카드(N · 하 · 열일곱째) | ☑ 루프288 |
| persist/preview: 칸 번호만 있는 3열 카드(O · 열여덟째) | ☑ 루프291 |
| persist/preview: 칸 번호만 있는 3열 카드(P · 열아홉째) | ☑ 루프322 |
| persist/preview: 칸 번호만 있는 3열 카드(Q) | ☑ 루프324 |
| persist/preview: 칸 번호만 있는 3열 카드(스무째) | ☑ 루프325 |
| persist/preview: 칸 번호만 있는 3열 카드(R) | ☑ 루프326 |
| persist/preview: 칸 번호만 있는 3열 카드(S) | ☑ 루프327 |
| persist/preview: 칸 번호만 있는 3열 카드(T) | ☑ 루프336 |
| persist/preview: 칸 번호만 있는 3열 카드(U) | ☑ 루프337 |
| heal: `</hN>` heading 꼬리 텍스트 중복 (`AI 파트너,<br>domain`) | ☑ 루프331 |
| heal: 그리드 밖 형제로 새어나간 STEP 03 본문 흡수 | ☑ 루프332 |
| heal: orphan `<b>30%</b></div>` inline tail 조각 제거 | ☑ 루프333 |
| heal: Tech Stack 크롬 카드 본문이 `<br>`뿐인 그리드 제거 | ☑ 루프334 |
| heal: Tech Stack empty `<br>`-body flex 행 제거 | ☑ 루프340 |
| heal: class-bound flex/grid empty `<br>`-body 행 제거 | ☑ 루프341 |
| heal: Process flex-column orphan grid merge | ☑ 루프345 |
| heal: Pricing `<ul>` spill · sibling 상한 4 | ☑ 루프346 |
| heal: Roadmap cross-grid list spill · multi-pass | ☑ 루프347 |
| heal: Roadmap orphan chrome card pull-back | ☑ 루프348 |
| heal: inline chrome cardish sibling close | ☑ 루프349 |
| heal: title-only cover flow text-align center | ☑ 루프350 |
| persist/preview: 칸 번호만 있는 3열 카드(Z) | ☑ 루프351 |
| heal: numeric nbsp / ZWSP / spaced empty tag / empty heading | ☑ 루프356 |
| heal: dash / ellipsis-only chrome body slots | ☑ 루프357 |
| heal: leftover-token chrome body after label | ☑ 루프358 |
| heal: 혼합 크롬+비크롬 행의 빈 크롬만 제거 | ☑ 루프352 |
| heal: 빈 스페이서 혼합 행 제거 | ☑ 루프353 |
| heal: 제목만 있는 카드 형제 제거 | ☑ 루프354 |
| persist/preview: 칸 번호만 있는 3열 카드(스무 번째) | ☑ 루프355 |
| preview: neutralize column `#stage` leftover host ←/→ nudge | ☑ 루프361 |
| chat/persist: Clone 호스트 계약은 시스템 프롬프트 · user turn brief-only · runContext 계보 | ☑ 루프391 |
| prompts: 명시 8–10 first-fill 한 턴 · streaming/compact "close 6" 덮어쓰기 | ☑ 루프402 |
| prompts/persist: 8–10 hard cap 10 · 15장 오버슈트 trim | ☑ 루프405 |
| seed/persist: 8–10 잔여 15장 경로 · honor shrink Source 회귀 | ☑ 루프411 |
| chat/persist: Clone prompt-fill 호스트 계약 숨김 · Expo 예시 user-turn 제거 | ☑ 루프382 |
| preview: leftover host-nav 불변식 (clone-size · deco · gotoIndex) | ☑ 루프378 |
| preview: leftover `#stage`+swipe script deco residue host ←/→ nudge | ☑ 루프374 |
| preview: 1920 leftover `#stage`+script / section unwrap / snap leftover host ←/→ nudge | ☑ 루프366 |
| preview: 1920 leftover + leaked 100vw host ←/→ nudge | ☑ 루프363 |
| heal: 혼합 행의 `<br>`-only 본문 크롬 카드만 제거 | ☑ 루프342 |
| heal: 빈 div / `&nbsp;` 본문 슬롯도 미채움 | ☑ 루프343 |
| heal: 빈 `<p>` / `<span>` 래퍼 본문 슬롯도 미채움 | ☑ 루프344 |
| heal: HTML void `<br>/<img>/<hr>` 등 depth 안정화 | ☑ 루프335 |
| heal: nested card soup extra `</div>`가 장 호스트를 닫음 | ☑ 루프287 |
| docs: leftover 용어를 「빈 칸 번호 카드」로 정리 | ☑ 루프284 |
| preview: 공식 example-replit-deck GET이 helix를 주고 시드를 주지 않음 | ☑ 루프278 |
| persist: substance-rich replacement가 artifact_regression 오탐 | ☑ 루프273 |
| persist: substance-rich 8→5가 slide-count regression 오탐 | ☑ 루프279 |
| persist: slide-count 거절 배너가 짧은 초안과 동일 | ☑ 루프279 |
| persist: substance-rich rewrite가 daemon stub-guard 422 | ☑ 루프280 |
| 생성 마법사: Replit Deck 썸네일이 흰 시드/미존재 index | ☑ example.html |
| preview: stale 매니페스트가 assets/template.html 시드를 example.html보다 먼저 | ☑ 루프274 |
| heal: nested duplicate `.card` open flatten | ☑ 루프270 |
| prompts: 선택 템플릿 motif/색상/아이콘 실렌더 | ☑ 루프271 |
| persist: title-only cover + empty hosts가 short-draft 성공 | ☑ 루프267 |
| persist: embed stub-warn overwrite | ☑ 루프268 |
| persist: thin prior top-up noop가 calm success | ☑ 루프269 |
| persist: solo title-only cover top-up noop가 calm success | ☑ 루프275 |
| persist: thin-prior 배너가 cut-off "이어서" 톤 | ☑ 루프276 |
| heal: nested section/article cardish open flatten | ☑ 루프277 |
| preview: native transform strip active off-by-one (letterbox clientWidth/n) | ☑ 루프281 |
| preview: pagination soft is-active가 exact .active보다 앞섬 | ☑ 루프282 |
| persist: substance-rich prior top-up noop가 incomplete_output | ☑ 루프283 |
| heal: minmax(0,33%/30vw/0.33fr) equal-track dodge | ☑ 루프289 |
| heal: max-inline-size / inline-size peer lock | ☑ 루프290 |
| contracts pretest: exactOptionalPropertyTypes TS2379 봉쇄 | ☑ 루프263 |
| 실제 MiniMax 생성 라운드트립(브라우저) | ☐ 이 환경에서 managed MiniMax 키 없음. `minimax-live-e2e.gate.test.ts`가 키 부재를 고정 |

## 이번 루프 (루프415 · MiniMax AGENT_EXECUTION_FAILED 진단·재분류)

- [x] daemon Upstream SSE message에 redacted body snippet 포함
- [x] FE `proxyErrorMessage`가 status-only일 때 `details` 본문 병합
- [x] opaque `AGENT_EXECUTION_FAILED` → message로 CONTEXT/529 등 재분류
- [x] ChatPane diagnostics `error_code: n/a` 방지 (detail marker / fallback)
- [x] compose catch 분류 후 stamp
- [ ] Staging 웹+daemon 재배포 후 동일 project 재현 시 raw_error/구체 문구 확인

## 직전 루프 (루프414 · Home MiniMax JSON fill 제거)

- [x] Home/Canvas deterministic = 서버 content-fill, MiniMax fill 턴 없음
- [x] `=prompt` / `clone` → HTML rewrite 유지 (`json`만 AI JSON)
- [x] staging/production example `deterministic`
- [x] web mode 정규화 · App pin
- [ ] staging 재배포 후 동일 브리프 재생성

## 직전 루프 (루프413 · Clone LOOK seed + dense JSON slot-fill)

- [x] env-empty default `deterministic` (LOOK seed + slot-fill)
- [x] schema `kicker` / `lead` / `items[]{title,body}` — 카드·스탯 본문 충전
- [x] `=prompt` / `clone` → `json`; HTML rewrite는 `prompt-fill`만
- [x] web mode 정규화 · contracts dense items/outline/fill
- [ ] `www.teamver.com + Capsule + 8~10장` E2E 품질 게이트

## 직전 루프 (루프412 · MiniMax AGENT_EXECUTION_STALLED idle 완화)

- [x] FE `PROXY_STREAM_IDLE_TIMEOUT_DECK_MS` 10m (minOutputTokens)
- [x] daemon BYOK inactivity default 10m · staging env `OD_BYOK_PROXY_INACTIVITY_TIMEOUT_MS=600000`
- [x] stale API force-fail 11m
- [x] web api-proxy · backgroundChatRecovery tests
- [ ] Staging 재배포 후 장시간 MiniMax 생성 QA

## 직전 루프 (루프411 · 8–10→15 잔여 경로)

- [x] LOOK 시드 honor max · `8-10 (close this turn)` 파싱 · 11+ 시드 패딩 금지
- [x] honor≥5만 outline shrink (Source 제목 캡 3 유지)
- [x] prompt-fill / override — hard cap 10, 15장 overshoot
- [x] persist 최종 trim · 미지정 first-fill 6 · 12–15 유지
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)
- [ ] FileViewer/채팅 브라우저 클릭 (이 환경에서 불가 — 유지)

## 직전 루프 (루프410 · staging pure-prompt + kit pin)

- [x] `.env.staging.example` → `pure-prompt` (production `=prompt` 유지)
- [x] contracts composeTeamverSlideApiPrompt kit-without-clone-fill pin
- [x] App skip-seed 주석 · canvas-slide-launch pin
- [ ] Staging 웹 재배포 후 사용자 QA
- [ ] Production env 승격 여부 결정

## 직전 루프 (루프409 · env-empty pure-prompt default)

- [x] `TEMPLATE_CLONE_FILL_DEFAULT_MODE = 'pure-prompt'`
- [x] explicit `=prompt` legacy 유지

## 직전 루프 (루프408 · top-up busy 재예약·대기열 비주차)

- [x] handleSend: hidden automation은 busy 시 queue 금지
- [x] top-up: phantom busy clear + abort busy retry (max 3)
- [x] loadQueuedChatSends: automation purge
- [x] web pin / slideCountTopUp constants
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)
- [ ] FileViewer/채팅 브라우저 클릭 (이 환경에서 불가 — 유지)

## 직전 루프 (루프407 · 숨은 top-up 대기열 비노출)

- [x] `isHiddenAutomationUserPrompt` / `isHiddenAutomationQueuedSend` export
- [x] ProjectView `currentConversationQueuedItems`에서 automation 제외
- [x] ChatPane `QueuedSendStrip` visible filter + summarize 안전망
- [x] web chat-message-render · project-view-message-load
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)
- [ ] FileViewer/채팅 브라우저 클릭 (이 환경에서 불가 — 유지)

## 직전 루프 (루프406 · letterbox escape deco 재부모화)

- [x] `reparentEscapedDecoIntoSlideFlow` · Motif chrome 보존
- [x] contracts loop406 fixture 9/9

## 직전 루프 (루프405 · 8–10 요청 15장 오버슈트)

- [x] honor hard cap 10 · 15장은 failed overshoot
- [x] JSON outline max 20 → 8–10이면 cap 10
- [x] slot-fill / buildTemplateClonedDeckHtml shrink
- [x] persist `trimDeckHtmlToMaxSlides` (1–10만, 12–15 유지)
- [x] contracts compact/system-prompt/outline/heal · web ceiling
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)
- [ ] FileViewer/채팅 브라우저 클릭 (이 환경에서 불가 — 유지)

## 직전 루프 (루프404 · 장수 게이트 save+top-up)

- [x] 장수 shortfall persist 허용 · top-up salvage
- [x] 구조 게이트 유지 · prompt-fill LOOK seed recovery

## 직전 루프 (루프402 · 명시 8–10 first-fill 한 턴)

- [x] `applyFirstFillArtifactCountPhrase` — 백틱 없는 `at least 6` + `close 6 THIS TURN` 교체
- [x] honor READ LAST — stopping at 6 is a failed deliverable, no hidden top-up
- [x] `firstFillSlideCountHint` ← durable/`pluginInputs.slideCount` (8-10)
- [x] auto-continue honor 7–10 OVERRIDE
- [x] produced 8 of 8–10 → top-up 없음 · 6장 미스는 salvage
- [x] contracts compact/system-prompt · web topUp/resume/recovery
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)
- [ ] FileViewer/채팅 브라우저 클릭 (이 환경에서 불가 — 유지)

## 직전 루프 (루프401 · `pure-prompt` opt-in)

- [x] `TemplateCloneFillMode` `'pure-prompt'` · `shouldSkipTemplateCloneSeed`
- [x] 홈/Canvas/Drive clone-seed 4곳 가드
- [x] kit spec은 시스템 프롬프트에 유지

## 직전 루프 (루프391 · 호스트 계약은 시스템 프롬프트)

- [x] persistableUserMessageContent — user turn은 brief만
- [x] `templateClonePromptFill` 시스템 프롬프트 HTML-fill 계약 (JSON과 상호 배타)
- [x] `runContext.templateCloneFill` 계보 · auto-continue/resume 복원
- [x] auto-send prompt-fill에 JSON 스탬프 금지
- [x] Expo worked example 주제 중립
- [x] comments · templateCloneContentFill · resume · contracts compose · canvas-slide-launch
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)
- [ ] FileViewer/채팅 브라우저 클릭 (이 환경에서 불가 — 유지)

## 직전 루프 (루프382 · prompt-fill 호스트 계약 숨김)

- [x] `[Template clone prompt fill]` 채팅 숨김
- [x] user-turn seed에서 Expo worked example / expansion contract 제거
- [x] Quality bar 중복 접두 제거
- [x] 덱 HTML host-contract heal
- [x] comments · templateCloneContentFill · slideCountTopUp · contracts host-leak
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프378 · leftover host-nav 불변식)

- [x] `leftoverHostNavMustPaintByDisplay`가 `go()`/`gotoIndex()`에서 translate/scroll보다 먼저
- [x] clone-size leftover · 빈/주석 deco hoist · leftover `#stage` 잔여도 2장 표시
- [x] 공식 IB pin-only F3 · Zhangzara `#deck` · simple-deck swipe 유지
- [x] srcdoc-leftover-host-nav-invariant · transform-driven · compact-api · contracts hoist
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)
- [ ] FileViewer 브라우저 클릭 (이 환경에서 불가 — 유지)

## 직전 루프 (루프374 · leftover `#stage`+swipe forceReveal)

- [x] authored 1920 leftover는 swipe script가 있어도 display toggle
- [x] deco residue `#stage` · neutralized 100vw column leftover도 2장 표시
- [x] `div.slide` hoist · `min-width:1920` 고정 캔버스
- [x] 공식 IB pin-only F3 · Zhangzara · simple-deck 유지
- [x] srcdoc-deck-bridge-transform-driven · compact-api-stacked-deck · contracts hoist 루프374
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프366 · 1920 leftover `#stage` + swipe 지문)

- [x] 1920 leftover는 author script가 있어도 `#stage` hoist
- [x] `section`/`main` `#stage` unwrap
- [x] `scroll-snap-x` / body overflow-x + 1920은 swipe 아님. Zhangzara `#deck` 100vw는 compact 유지
- [x] vw/`innerWidth` nudge 거부 · 보이는 iframe 먼저
- [x] 공식 IB example.html swipe `#stage` · simple-deck · F3/281 유지
- [x] compact-api-stacked-deck · srcdoc-deck-bridge-transform-driven · contracts hoist 루프366
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프363 · 1920 leftover + leaked 100vw)

- [x] 1920 캔버스 leftover는 `min-width:100vw`만으로 swipe 아님
- [x] dead leftover `forceReveal` 실제 숨김
- [x] 1920 overflow는 scroll-strip 아님 · pan reset은 이동 후
- [x] simple-deck / F3/281 유지
- [x] compact-api-stacked-deck · srcdoc-deck-bridge-transform-driven 루프363
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프361 · host ←/→ 첫 장 nudge)

- [x] `trackLooksLikeHorizontalStrip` — column / 세로 `#stage`는 가로 트랙 아님
- [x] letterbox `forceReveal`로 2장 표시
- [x] `transformGo` 세로 스택 X 거부 · 1920 핀에서 100vw fallback 거부
- [x] F3/281 가로 스트립 유지
- [x] srcdoc-deck-bridge-transform-driven 루프361
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프356–358 · nbsp/dash/TBD body)

- [x] 루프356 — numeric nbsp / ZWSP / empty heading
- [x] 루프357 — dash / ellipsis body
- [x] 루프358 — leftover-token body · mixed stub+실본문 유지
- [x] heal-loop331-335-residuals 루프356–358
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프353–355 · 스페이서 · 제목-only · 스무 번째)

- [x] 루프353 — 빈 스페이서 혼합 행 · 전부 빈 행 drop
- [x] 루프354 — heading-only 카드 형제 제거. 칩 행·2열·라벨 칩 유지
- [x] 루프355 — `스무 번째` 칸 번호. 번호+본문 유지. leftover 문자/서수 트랙 닫음
- [x] heal-loop331-335-residuals 루프353–354 · heal-ai-generated-deck 루프355 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프352 · 혼합 크롬+비크롬 빈 크롬)

- [x] `dropUnfilledChromeCardPeersInAllocatedRows` — 비크롬 형제 있어도 빈 크롬만 제거
- [x] 채워진 `.card` / `<ul>` / 크롬 앵커. 빈 스페이서·column·영문 카탈로그 유지
- [x] 전체 행 drop(334)은 크롬-only
- [x] heal-loop331-335-residuals 루프352
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프345–351 · Process/Pricing/Roadmap + title + Z)

- [x] 루프345 — `absorbOrphanContentGridIntoFlexColumnHost`
- [x] 루프346 — `<ul>/<ol>` spill · sibling 상한 4
- [x] 루프347 — cross-grid list spill · 크롬 2–6 · 3패스
- [x] 루프348 — orphan chrome card pull-back
- [x] 루프349 — inline chrome `attrsLookCardish`
- [x] 루프350 — title cover `[data-od-slide-flow]` center
- [x] 루프351 — 칸 번호 Z 빈 카드 · compact `W/Y/Z`
- [x] heal-loop345-350-residuals · heal-duplicate-title-only-slide · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프344 · 빈 `<p>` / `<span>` 래퍼 본문 슬롯)

- [x] `innerBlockContainsOnlyEmptyPlaceholders` — 빈 `<p>` / `<span>` 래퍼 반복 접음
- [x] 미디어·실본문·라벨-only 칩 유지. 카피 발명 없음
- [x] heal-loop331-335-residuals 루프344
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프343 · 빈 div / `&nbsp;` 본문 슬롯)

- [x] `innerBlockContainsOnlyEmptyPlaceholders` — 빈 소스 / `&nbsp;` / `<br>` 동일
- [x] `<br>` 없이 라벨+빈 본문이면 미채움. 라벨-only 칩 유지
- [x] heal-loop331-335-residuals 루프343
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프342 · 혼합 행 빈 본문 크롬 카드)

- [x] `dropUnfilledChromeCardPeersInAllocatedRows` — 채워진 카드 유지, `<br>`-only 형제만 제거
- [x] grid / flex / class-bound · column·영문 카탈로그 유지
- [x] heal-loop331-335-residuals 루프342
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프340 · flex empty `<br>`-body chrome)

- [x] dropChromeCardGridsWithAllEmptyBodies — inline flex 행
- [x] column flex · 본문 있는 행 유지
- [x] heal-loop331-335-residuals 루프340

## 직전 루프 (루프339 · 칸 번호 Y)

- [x] 빈 칸 번호 — Y
- [x] 띄어쓴 `스무 번째` / `기둥 Z` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프339 · deck-framework-compact
- [x] 280 vs 900 sidebar 유지 (비율 2.05 미상향)
- [x] MiniMax 실키 E2E 게이트 테스트 (키 없으면 skip 고정, live 호출 없음)
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프338 · 칸 번호 W)

- [x] 빈 칸 번호 — W
- [x] 띄어쓴 `스무 번째` / `기둥 Y` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프338 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프337 · 칸 번호 U)

- [x] 빈 칸 번호 — U
- [x] 띄어쓴 `스무 번째` / `기둥 W` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프337 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프336 · 칸 번호 T)

- [x] 빈 칸 번호 — T
- [x] 띄어쓴 `스무 번째` / `기둥 U` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프336 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프331–335 · neuralstudio.kr 회사소개 잔여)

- [x] 루프331 — `<h2>...파트너,<br>domain</h2> tail dup` heading 꼬리 텍스트 제거
- [x] 루프332 — 그리드 밖으로 새어나간 STEP 03 본문을 마지막 크롬 카드로 되돌림
- [x] 루프333 — Roadmap `<b>30%</b></div>` orphan inline tail 조각 제거
- [x] 루프334 — Tech Stack 처럼 크롬 카드 본문이 `<br>`뿐인 그리드만 제거
- [x] 루프335 — `<br>/<img>/<hr>` 등 HTML void 요소 depth 안정화
- [x] heal-loop331-335-residuals (10 tests) · 전체 스위트 회귀 없음

## 직전 루프 (루프327 · 칸 번호 S)

- [x] 빈 칸 번호 — S
- [x] 띄어쓴 `스무 번째` / `기둥 T` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프327 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프326 · 칸 번호 R)

- [x] 빈 칸 번호 — R
- [x] 띄어쓴 `스무 번째` / `기둥 S` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프326 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프325 · 칸 번호 스무째)

- [x] 빈 칸 번호 — 스무째
- [x] 띄어쓴 `스무 번째` / `기둥 R` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프325 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프324 · 칸 번호 Q)

- [x] 빈 칸 번호 — Q
- [x] `스무 번째` / `기둥 R` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프324 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프323 · toolbox skill/plugin/큐 제목 워크플로 숨김)

- [x] skill/plugin/MCP/connector 픽 = 짧은 제목 + @mention
- [x] restoreDraft가 visible/instruction을 다시 나눔
- [x] 큐 제목·프로젝트명에서 toolbox instruction strip
- [x] design-toolbox · ChatComposer.design-toolbox · ChatPane.streaming · projectName
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프322 · 칸 번호 P/열아홉째)

- [x] 빈 칸 번호 — P · 열아홉째
- [x] `스무 번째` / `기둥 Q` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프322 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프321 · 디자인 다듬기 input 워크플로 숨김)

- [x] toolbox 액션 입력 = 제목 + @skill
- [x] `[Design toolbox instruction]` 전송 · 말풍선 strip
- [x] 제목 삭제 후 다른 글이면 숨은 지시 미첨부
- [x] design-toolbox · ChatComposer.design-toolbox · comments
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프320 · first-fill 명시 1–10장 한 턴)

- [x] `COMPACT_FIRST_FILL` — honor 1–10 · unspecified 6 · top-up 11+
- [x] clone-fill hint — `8장`/`10장`/`8-10` 이번 턴 닫기 · `6-8` auto는 6 · `12-15`는 캡
- [x] resume / system.ts `7+` → `11+`
- [x] persist short-draft ≤6 유지 (인접)
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프291 · 칸 번호 O/열여덟째)

- [x] 빈 칸 번호 — O · 열여덟째
- [x] `스무 번째` / `기둥 P` · 번호+본문 유지
- [x] 용어표에서 「열 라벨」 제거 — 전부 칸 번호
- [x] heal-ai-generated-deck 루프291 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프289–290 · minmax share track · logical inline-size lock)

- [x] unwrapEqualShareTrack · shrink/normalize minmax(0,share)
- [x] peerFixedMainSizePx · strip inline-size / max-inline-size
- [x] minmax(200px,1fr) · 280 vs 900 sidebar 유지
- [x] heal-ai-generated-deck 루프289–290

## 직전 루프 (루프288 · 칸 번호 N/하/열일곱째)

- [x] 빈 칸 번호 — N · 열 라벨 하 · 열일곱째
- [x] `스무 번째` / `기둥 O` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프288 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프287 · 고아 `</div>` strip)

- [x] repairUnbalancedCardDivsInFragment — 짝 없는 close 제거
- [x] 미종료 open close-append 유지
- [x] heal-ai-generated-deck 루프287

## 직전 루프 (루프286 · 칸 번호 M/파/열여섯째)

- [x] 빈 칸 번호 — M · 열 라벨 파 · 열여섯째
- [x] `스무 번째` / `기둥 하` / `기둥 N` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프286 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프285 · 칸 번호 L/타/열다섯째)

- [x] 빈 칸 번호 — L · 열 라벨 타 · 열다섯째
- [x] `스무 번째` / `기둥 파` / `기둥 M` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프285 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프284 · leftover 용어를 「빈 칸 번호 카드」로 정리)

- [x] 54-2 용어표 · 주석 · 테스트 제목을 제품 카피가 아닌 칸 번호 말로 바꿈
- [x] 유지 픽스처 `스무째` → `스무 번째`
- [x] 검출 범위 유지 (A–K · 가…카 · 첫째…열네째)
- [x] heal-ai-generated-deck 루프278/284

## 직전 루프 (루프281–283 · transform active · pagination .active · substance-rich top-up noop)

- [x] transformTrackFallbackStepPx · activeIndexFromTransform -1 (no clientWidth/n)
- [x] activeIndexFromPagination exact .active 우선
- [x] substance-rich top-up noop = skipped-noop 핀
- [x] srcdoc-deck-bridge-nested-slides · teamver-canvas-slide-launch 루프283

## 직전 루프 (루프280 · daemon stub-guard substance-rich skip)

- [x] shouldSkipDaemonArtifactStubGuard — leftover 또는 substance-rich
- [x] persist revision/write 모두 skip · embed force-reject 동기화
- [x] 1–3장 thin은 skip하지 않음
- [x] project-view-substance-rich-replacement · canvas-slide-launch

## 직전 루프 (루프279 · slide-count substance-rich 면제 · 배너 분리)

- [x] findClientSlideCountRegression greenfield substance-rich 8→5 허용
- [x] strict image-embed 8→5 · 8→2 hard collapse · 3-slide thin 계속 차단
- [x] slide-count 배너 ≠ 짧은 초안
- [x] project-view-substance-rich-replacement · persist-result · message-merge · error-messages

## 직전 루프 (루프278 · 칸 번호 K/카/열네째 + 공식 Replit preview 실경로)

- [x] 빈 칸 번호 — K · 열 라벨 카 · 열네째
- [x] `스무 번째` / `기둥 타` / `기둥 L` · 번호+본문 유지
- [x] heal-ai-generated-deck 루프278 · deck-framework-compact
- [x] 공식 example-replit-deck `/preview` helix · helix byte-sync
- [x] daemon plugins-preview-replit-bundled · template-visual-kit
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프275–277 · thin top-up host · Retry 톤 · section card flatten)

- [x] solo title-only / zero-body prior → thin top-up incomplete
- [x] thin-prior 배너 = 다시 시도 톤 (이어서 금지)
- [x] nested section/article/aside cardish flatten
- [x] deck-html-content · project-error-messages · heal-nested-duplicate-card-flatten · canvas-slide-launch

## 직전 루프 (루프274 · J/열세째 인덱스 + stale preview example.html)

- [x] leftover index — J · 차 · 열세째
- [x] `열네째` / `기둥 카` / `기둥 K` · index+추가 본문 유지
- [x] heal-ai-generated-deck 루프274 · deck-framework-compact
- [x] `/preview` example.html을 assets 시드보다 앞세움
- [x] daemon plugins-preview-catalog-example · plugins-preview-fallback
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프273 · substance-rich replacement 오탐)

- [x] 4+ slides · meetsMinimum · not low-substance → artifact_regression bypass
- [x] project-view-substance-rich-replacement · persist-result
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)


## 직전 루프 (루프272 · H/열두째 인덱스 + Replit Deck 썸네일)

- [x] leftover index — H · 자 · 열두째
- [x] `열세째` / `기둥 차` / `J`–`Z`(로마 I/V/X 제외) · index+추가 본문 유지
- [x] heal-ai-generated-deck 루프272 · deck-framework-compact
- [x] Replit Deck `example.html`(helix) · preview.entry / exampleOutputs
- [x] project-card-html-cover · pickPluginPreviewHtmlPath
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프271 · 선택 템플릿 motif 실렌더)

- [x] visible kit Motif anchors · 빈 `.deco-*` shell 실패
- [x] contracts template-visual-kit · selected-template prompt
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프270 · nested duplicate `.card` open flatten)

- [x] flattenNestedDuplicateCardOpens · Motif-only shell 보호
- [x] heal-nested-duplicate-card-flatten
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프266 · G/열한째 인덱스)

- [x] leftover index — G · 아 · 열한째
- [x] `열두째` / `기둥 자` / `H`–`Z` · index+추가 본문 유지
- [x] heal-ai-generated-deck 루프266 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프265 · 그외/other stub · 주제 단어 아님)

- [x] other/others/another/rest · 그외/나머지/여타 leftover
- [x] stub+추가 본문은 어떤 주제 단어든 유지
- [x] heal-ai-generated-deck 루프265 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프267–269 · short-draft empty · stub force reject · thin top-up)

- [x] title-only cover + ≥2 empty hosts → short-draft 거절 (본문 cover+empty 유지)
- [x] Teamver embed `forceArtifactStubGuardReject` (warn→reject)
- [x] thin prior top-up noop → incomplete + AC 거부
- [x] deck-html-content · artifact-stub-guard · projects-stub-guard · resume · error-messages · canvas-slide-launch
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프264 · misc/기타사항 stub)

- [x] misc/miscellaneous · 기타사항 leftover
- [x] stub+추가 본문 유지 (주제 단어 아님)
- [x] heal-ai-generated-deck 루프264 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프259 · extra-copy 토픽 중립)

- [x] leftover 판정은 stub/index 토큰만. 남은 글자는 주제 무관 실카피
- [x] 제품 주석에서 `미분`/`적분` 하드코딩 제거
- [x] heal-ai-generated-deck 루프259
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프263 · contracts pretest 언블록)

- [x] collectClassEqualTrackDecls conditional assign
- [x] 3-col clip · 2x2 leftover 원 의도 유지
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프261–262 · E/서수 인덱스 · 3열 400 vs 800)

- [x] leftover index — E–F / 바사 / 여섯째–열째. `열한째`/`기둥 아`/index+추가 본문 유지
- [x] 3장 peer 주축 비율 2.05. 400 vs 800 strip, 2장 400 vs 800 · 3장 280 vs 900 유지
- [x] compact vocabulary E/여섯째
- [x] heal-ai-generated-deck 루프261–262 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프258 · ok/완료 stub)

- [x] ok/okay/done · 완료 leftover
- [x] stub+추가 본문 유지 (주제 단어 아님)
- [x] heal-ai-generated-deck 루프258 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프257 · etc/기타 stub)

- [x] etc/etcetera · 기타/등등 leftover
- [x] stub+추가 본문 유지 (주제 단어 아님)
- [x] heal-ai-generated-deck 루프257 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프256 · Lesson/강 인덱스)

- [x] lesson/lecture · 강/회/레슨 leftover
- [x] 전-인덱스 Lesson 스텝 행 · UNIT 3 유지
- [x] heal-ai-generated-deck 루프256 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프255 · 0.33fr equal tracks)

- [x] `0.22–0.48fr` equal column · minmax(0,1fr) 변환
- [x] `0.5fr 0.5fr` split 유지
- [x] heal-ai-generated-deck 루프255 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프254 · listAiSlideSpans depth-match)

- [x] same-tag depth count · nested containment filter
- [x] heal-ai-generated-deck 루프254
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프253 · closed soft-salvage body bar)

- [x] multi-slide soft → ≥1 deliverable body
- [x] mid-stream truncation bar 유지
- [x] deck-html-content 루프253
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프252 · class-bound AI marker gate)

- [x] `sourceLooksLikeAiGeneratedDeck` — flow/tpl/multi-slide card
- [x] empty-brief 영문 카탈로그 skip 유지
- [x] heal-ai-generated-deck 루프252
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프251 · 33vi/vb 트랙)

- [x] equal track + card lock — 22–48 vi/vb/svi/dvi → minmax / strip
- [x] `50vb` split 유지
- [x] heal-ai-generated-deck 루프251 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프250 · 33dvmin/svmin 트랙)

- [x] equal track + card lock — 22–48 dvmin/svmin/lvmin/dvmax → minmax / strip
- [x] `50lvmax` split 유지
- [x] heal-ai-generated-deck 루프250 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프249 · FIXME/hack stub)

- [x] fixme/hack/고쳐야함 leftover
- [x] FIXME 적분 실카피 유지
- [x] heal-ai-generated-deck 루프249 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프248 · Chapter/장 인덱스)

- [x] chapter/cluster/panel · 장/클러스터/패널 leftover
- [x] 전-인덱스 Chapter 스텝 행 · UNIT 3 유지
- [x] heal-ai-generated-deck 루프248 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프247 · foo/bar stub)

- [x] foo/bar/baz leftover
- [x] bar 적분 실카피 유지
- [x] heal-ai-generated-deck 루프247 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프246 · 33cqmin/cqmax 트랙)

- [x] equal track + card lock — 22–48 cqmin/cqmax → minmax / strip
- [x] `50cqmax` split 유지
- [x] heal-ai-generated-deck 루프246 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프245 · 33dvw/lvw 트랙)

- [x] equal track + card lock — 22–48 dvw/svw/lvw → minmax / strip
- [x] `50svw` split 유지
- [x] heal-ai-generated-deck 루프245 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프244 · pass/skip stub)

- [x] pass/skip · 패스/스킵 leftover
- [x] pass 적분 실카피 유지
- [x] heal-ai-generated-deck 루프244 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프243 · null/undefined stub)

- [x] undefined/null/nil/널 leftover
- [x] null 적분 실카피 유지
- [x] heal-ai-generated-deck 루프243 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프242 · Group/행 인덱스)

- [x] group/lane/row · 그룹/레인/행 leftover
- [x] 전-인덱스 Group 스텝 행 · UNIT 3 유지
- [x] heal-ai-generated-deck 루프242 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프241 · xxx/asdf stub)

- [x] xxx/xx/asdf/qwerty leftover
- [x] xxx 적분 실카피 유지
- [x] heal-ai-generated-deck 루프241 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프239–240 · D/서수 인덱스 · 비균일 max-width)

- [x] leftover index — D / 마 / 첫째–다섯째. 전-인덱스 서수 스텝 행 · `여섯째`/`기둥 바` 유지
- [x] peer 주축 비율 1.35 → 1.6. 400 vs 600 strip, 280 vs 900 · 400 vs 800 유지
- [x] compact vocabulary D/첫째/셋째
- [x] heal-ai-generated-deck 루프239–240 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프237–238 · 알파벳/괄호/번 인덱스 · vh/vmin 트랙)

- [x] leftover index — A–C / 가나다라 / `(3)` / `3번`. 전-인덱스 스텝 행 유지
- [x] equal track + card lock — 22–48 vh/vmin/cq* → minmax / strip. 50 split 유지
- [x] compact vocabulary 33vh/vmin · C/3번/(3)
- [x] heal-ai-generated-deck 루프237–238 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프236 · non-adjacent title-only drop)

- [x] 이전 title-only와 동일 텍스트인 뒤쪽 non-cover title-only 제거
- [x] chapter/cover/background motif 유지
- [x] heal-duplicate-title-only-slide 루프236
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프235 · title+decorative media gate)

- [x] title-only / deliverable — media는 body 동반 시에만
- [x] validate media short-circuit → minimum bar 필요
- [x] deck-html-content · validate
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프234 · leading intro without cover attrs)

- [x] substantive same-topic slide 2면 cover attrs 없이도 splash drop
- [x] chapter host 유지
- [x] heal-duplicate-title-only-slide
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프233 · 2-slide brief parrot)

- [x] 2장 thin parrot ≥2 → failed generation
- [x] cover parrot + 실본문 유지
- [x] deck-html-content · validate
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프232 · translate(-50%,-50%) neutralize)

- [x] unanchored translate / translate3d 제거
- [x] anchored top/left 50% 유지
- [x] heal-duplicate-title-only-slide
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프231 · 임시/fake stub)

- [x] 임시/가짜/가데이터 · temp/fake leftover
- [x] 임시 적분 실카피 유지
- [x] heal-ai-generated-deck 루프231 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프230 · 10/PILLAR 10 인덱스)

- [x] leftover digit `10` 추가 (11–99 유지)
- [x] `10%` KPI 유지
- [x] heal-ai-generated-deck 루프230 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프229 · Module/섹션 인덱스)

- [x] module/track/section · 모듈/트랙/섹션 leftover
- [x] 전-인덱스 Module 스텝 행 · UNIT 3 유지
- [x] heal-ai-generated-deck 루프229 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프228 · 자료없음/정보없음 stub)

- [x] 자료없음/정보없음/데이터없음 leftover
- [x] 자료 적분 실카피 유지
- [x] heal-ai-generated-deck 루프228 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프227 · lorem ipsum/placeholder stub)

- [x] ipsum/placeholder/filler leftover
- [x] lorem 적분 실카피 유지
- [x] heal-ai-generated-deck 루프227 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프226 · 전각/원문자 ０ 인덱스)

- [x] ⓪ / ⓿ / 전각 ０ leftover
- [x] 전-인덱스 ⓪①② 스텝 행 유지
- [x] heal-ai-generated-deck 루프226 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프225 · 00/PILLAR 0 인덱스)

- [x] leftover digit `0?[0-9]` (0 / 00 / 01–09)
- [x] `0%` KPI 유지
- [x] heal-ai-generated-deck 루프225 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프224 · 대기/soon stub)

- [x] 대기/보류/생략 · soon/later leftover
- [x] 나중에 적분 실카피 유지
- [x] heal-ai-generated-deck 루프224 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프223 · tobefilled/filllater stub)

- [x] tobefilled/filllater/inserthere/typetext/fillme leftover
- [x] stub 뒤 실카피 유지
- [x] heal-ai-generated-deck 루프223 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프222 · Phase/축/레이어 인덱스)

- [x] phase/axis/layer · 페이즈/축/레이어 leftover
- [x] 전-인덱스 Phase 스텝 행 · UNIT 3 유지
- [x] heal-ai-generated-deck 루프222 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프221 · minmax(auto,1fr))

- [x] `minmax(auto|min-content|max-content,1fr)` → `minmax(0,1fr)`
- [x] `minmax(200px,1fr)` sidebar 유지
- [x] heal-ai-generated-deck 루프221 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프220 · 1.0fr equal tracks)

- [x] `1.0fr` / `minmax(0,1.0fr)` equal column · minmax(0,1fr) 변환
- [x] heal-ai-generated-deck 루프220 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프219 · 원문자/전각 인덱스)

- [x] ①–⑨ / ❶–❾ / 전각 １–９
- [x] 전-인덱스 스텝 행 유지
- [x] heal-ai-generated-deck 루프219 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프218 · dummy/예시 stub)

- [x] leftover 토큰 dummy/sample/예시/샘플 · `sample mean` 유지
- [x] heal-ai-generated-deck 루프218 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프217 · KEY/테마 인덱스)

- [x] `key`/`theme`/`block`/`키`/`테마`/`블록` 접두
- [x] 전-인덱스 스텝 행 유지
- [x] heal-ai-generated-deck 루프217 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프216 · 작성예정 stub)

- [x] leftover 토큰 작성예정/입력필요/추후입력 · 실카피 접두 유지
- [x] heal-ai-generated-deck 루프216 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프215 · 33vw equal tracks)

- [x] equal column-share에 22–48vw/vmin · `50vw 50vw` 유지
- [x] `minmax(0,1fr)` 변환 · heal-ai-generated-deck 루프215
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프214 · empty/blank stub)

- [x] leftover 토큰 empty/blank/pending/none · `empty set` 유지
- [x] heal-ai-generated-deck 루프214 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프213 · vw column-share)

- [x] `cssLengthToPx` 22–48vw · 100vw/50vw 유지
- [x] heal-ai-generated-deck 루프213 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프212 · No./번호 인덱스)

- [x] `no.`/`number`/`번호`/`포인트` 접두
- [x] 전-인덱스 스텝 행 유지
- [x] heal-ai-generated-deck 루프212 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프211 · dotted stub)

- [x] leftover compact에서 `.` 제거 · `3.14` 유지
- [x] heal-ai-generated-deck 루프211 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프210 · 33% equal tracks)

- [x] `parseDeclaredEqualColumns` 동일 22–48% · `50% 50%` 유지
- [x] `minmaxUnitForEqualFr` % → minmax(0,1fr)
- [x] heal-ai-generated-deck 루프210 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프209 · 로마 인덱스 leftover)

- [x] `textLooksLikeLeftoverIndexLabel` — I–XII / Ⅰ–Ⅻ
- [x] 전-로마 스텝 행 · 실카피 접두 유지
- [x] heal-ai-generated-deck 루프209 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프208 · 해당없음 stub)

- [x] leftover 토큰 해당없음/미입력/없음 · 실카피 접두 유지
- [x] heal-ai-generated-deck 루프208 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프207 · % column-share)

- [x] `cssLengthToPx` 22–48% · `flex:0 0 33%`
- [x] 100% stretch · 50% split · 영문 카탈로그 유지
- [x] heal-ai-generated-deck 루프207 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프206 · stacked first-child)

- [x] `:has(.slide.active)` 부트 전용 first-child
- [x] 인라인 hide 유실 후에도 1장 display:none
- [x] srcdoc-deck-bridge-nested-slides 루프206
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프205 · 인덱스 leftover)

- [x] `textLooksLikeLeftoverIndexLabel` — PILLAR/COLUMN/기둥 N(+마침표)만 drop
- [x] 전-인덱스 스텝 행 · 실카피 접두 유지
- [x] heal-ai-generated-deck 루프205 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프204 · 클래스 flex 행)

- [x] `collectClassFlexRowNames` · `balanceClassBoundFlexCardRow`
- [x] Hangul/brief 게이트 · column/영문/인라인 191 유지
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프203 · 제목+내부 카드 194 유지)

- [x] peek-ahead: 안쪽 카드 닫힌 뒤 호스트 `</div>`면 봉합 skip
- [x] 미닫힌 형제 194 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프202 · TBD/N/A/준비중 stub)

- [x] leftover 토큰 stub 확장 · 실카피 접두 유지
- [x] heal-ai-generated-deck 루프202 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프200–201 · placeholder peer · max-width/flex 0 0)

- [x] `textLooksLikeLeftoverPeerPlaceholder` — 제목/내용/.../`내용을 입력하세요` 1–4 토큰만 drop
- [x] `극한`/`적분` 실카피 · SVG/모티프 · 영문 Title/Body(빈 brief) 유지
- [x] `peerFixedMainSizePx` — max-width + `flex:0 0`/`none` 길이 인식
- [x] `stripFixedMainSizeFromOpenTag` — 균일 큰 주축일 때만 max-width/`flex:0 0` strip
- [x] `flex:1 1` grow · 혼합 sidebar · 영문 카탈로그 유지
- [x] compact vocabulary placeholder card shell · max-width · flex: 0 0
- [x] heal-ai-generated-deck 루프200–201 · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프199 · card-in-card unwrap)

- [x] `unwrapRedundantNestedPeerCards` — 같은 토큰·1자식·바깥 텍스트 없음만 unwrap
- [x] `card-body` / 두 장 호스트 / 제목+내부 카드 유지
- [x] 194보다 먼저 실행 · Hangul/brief 게이트 · compact vocabulary
- [x] heal-ai-generated-deck 루프199 · 194 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프198 · 동일 고정폭 카드 클립)

- [x] `relaxUniformPeerCardFixedMainSize` — 균일 큰 고정 폭만 strip
- [x] 혼합 sidebar / 영문 카탈로그 유지
- [x] shrink·191 전에 파이프라인 연결 · compact vocabulary
- [x] heal-ai-generated-deck 루프198
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프197 · 빈 leftover 카드 셸)

- [x] `dropEmptyLeftoverPeerCardsInAllocatedRows` — flex/equal-grid 행에서 빈 cardish peer만 제거
- [x] 채워진 peer 0장이면 행을 비우지 않음 · SVG/모티프 카드 유지
- [x] Hangul/brief 게이트 · 영문 카탈로그 빈 셀 유지
- [x] shrink/flex-balance 전에 파이프라인 연결 · compact vocabulary empty card shell
- [x] heal-ai-generated-deck 루프197
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프196 · 공손형 앵무 · residual 2겹 drop)

- [x] parrot normalize `만들어 주세요` + `을/를`
- [x] severe drop 임계 2 · `article`/`aside`/`main` · 194 봉합 후 residual
- [x] web validate/deck-html-content · unbalanced-card-slide
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프195 · 3열 클립 · 2×2 leftover · class grid)

- [x] `1fr` 동일 트랙 → `minmax(0,1fr)` (3-of-3 clip)
- [x] underfilled equal rows 축소 (2×2 빈 아랫줄)
- [x] Hangul/brief 클래스 그리드만 인라인 축소 · 영문 카탈로그 유지
- [x] heal-ai-generated-deck 루프195
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프194 · nested unclosed .card sibling close)

- [x] `repairUnbalancedCardDivsInFragment` — peer card 열기 전 이전 cardish 닫기 · leftover close
- [x] `closeUnclosedSiblingCardsInSlides` — slide span 단위 · 카피 발명 없음 · severe drop 직전
- [x] cardish/`classAttrValue` — style 문자열 `columns` 오탐 방지 (3기둥 grid 회귀)
- [x] 190b fixture 04/05·bad-nest는 봉합 후 생존 (drop 대신 repair)
- [x] heal-ai-generated-deck · outline/user-report 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프193 · raw prompt parrot low-substance)

- [x] `deckLooksLikeRepeatedUserBriefParrot` — 3장+ · brief 다수 장 반복 → failed generation
- [x] `isLowSubstanceSlideDeckArtifact` — short-draft 허용보다 먼저 차단
- [x] 단일 instruction-copy cover + 실본문 2장은 heal/top-up 유지
- [x] web validate/deck-html-content 76/76
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프192 · opacity-stack .stage page nav)

- [x] overlapping absolute/opacity `.stage`는 translate 트랙이 아님
- [x] Sakura Chroma / Cobalt Grid / Long Table / Biennale Yellow next 후 `.active` + transform 없음
- [x] IB `#stage` 가로 스트립 translate 유지
- [x] srcdoc-deck-bridge-official-presenter · transform-driven IB
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프191 · flex row card grow)

- [x] `balanceUnderfilledFlexCardRow` — peer card에 `flex:1 1 0` · 행 `width:100%`
- [x] column / 기존 grow / 고정폭 sidebar / chrome 라벨 행 보존
- [x] heal 파이프라인 — grid shrink 직후
- [x] heal-ai-generated-deck 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프190 · underfilled equal-track grid)

- [x] `shrinkOverAllocatedRepeatGrid` — `repeat(N)`뿐 아니라 `1fr 1fr 1fr` / `minmax(0,1fr)` 동일 트랙도 자식 수에 맞게 축소
- [x] mixed `1.3fr 1fr` 사이드바는 그대로
- [x] look-slot-flow `.grid` `width:100%` — shrink-wrap 좌측 편중 제거
- [x] compact vocabulary `Column count = card count`
- [x] heal-ai-generated-deck · deck-template-look-css · deck-framework-compact
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프189 · fixture pin + stall copy + calc pure-mul)

- [x] 사용자 삼각함수 HTML verbatim fixture pin (`heal-leading-outline-shell-user-report.test.ts`)
- [x] `AGENT_EXECUTION_STALLED` 전용 카피·retryable gate 회귀 (api-proxy · projectErrorMessages)
- [x] `bodyHasTopLevelMulDiv` — top-level `+`/`−` 있으면 additive 유지; pure mul px floor 13
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프188 · bare leading splash · 3장 all-title)

- [x] bare title splash before real cover — `slide-title` 없이도 drop
- [x] 실제 cover host는 splash로 취급하지 않음
- [x] 3장 all-title outline → failed-generate / low-substance (`슬라이드 N` 제외)
- [x] heal-duplicate-title-only-slide · deck-html-content · validate
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프187 · pitch-deck cover-bg 복구)

- [x] `.cover-bg` Motif/deco — flatten 금지
- [x] pin CSS로 이미 평탄화된 cover-bg full-bleed 복구
- [x] 투명 슬라이드 `var(--bg, #ffffff)` letterbox 투시 방지
- [x] flatten leftover centering transform 이중 방어
- [x] contracts deck-fixed-canvas 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프186 · leading title-only intro / translateY clip)

- [x] `dropLeadingTitleOnlyIntroBeforeRealCover` — title-only intro + substantive cover 후속 시 intro drop
- [x] `neutralizeUnanchoredTranslateYInSlideContent` — 앵커 없는 `translateY(-50%)` 제거
- [x] `healAiGeneratedDeckMarkup` 파이프라인 통합
- [x] `deck-fixed-canvas` calc/min card-padding heuristic 보강
- [x] `heal-leading-outline-shell-user-report.test.ts` — 사용자 2026-08-31 fixture pin (루프189)
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프185 · low-substance auto-continue 거부)

- [x] `shouldAutoContinueForIncompleteOutput` — low-substance/unfilled-catalog reason이면 false
- [x] 잘림 shell(`incomplete-html-document-shell`) AC 유지
- [x] resume.test 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프184 · 5–6페이지 숏 요청 한 턴 마감)

- [x] `5-6` / `5~6`을 first-fill 안정성 캡으로 바꾸지 않음 — `close at least 5 this turn`
- [x] override notice — 숏 5–6은 later-append 금지. 7+ 캡만 later-append
- [x] first-fill 가이던스 (contracts / resume / clone-fill) — 5+ 타깃에서 3장 정지 실패
- [x] 5장 닫힌 5–6 요청은 hidden +1 없음. 1·3장 miss는 honored top-up 1회
- [x] web templateCloneContentFill · slideCountTopUp · contracts compact 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 이전 루프 (루프183 · low-substance 배너 문구)

- [x] `looksLikeLowSubstancePersistSkipReason` / `formatProjectRunLowSubstanceDeliverableError`
- [x] `formatProjectRunDeliverableMissingError` reason-aware — cut-off와 분리
- [x] ProjectView terminal·replay persist 실패 경로 reason 전달
- [x] teamver-project-error-messages · ProjectView source 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프182 · duplicate title-only slide preview 축소)

- [x] `dropDuplicateConsecutiveTitleOnlyLeftoverSlides` — 인접 동일 title-only 장 preview 축소
- [x] heal 파이프라인 · fixture 2→1
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프181 · title-only outline · heading-only deliverable)

- [x] `slideInnerIsTitleOnlyShell` — heading 외 본문 없음 → deliverable false (긴 제목만 filled 오판 차단)
- [x] `deckLooksLikeTitleOnlyOutlineShell` — ≥4장·≥60% title-only → failed-generate
- [x] short-draft / low-substance 연동 — outline 해골 덱 persist·reuse skip
- [x] 1장 제목 커버 short-draft · 짧은 `<p>` 본문 · filled outline 보존
- [x] web deck-html-content · validate 회귀
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프179 · topic+counter 빈 장 저장 게이트)

- [x] `deckSlideHeadingsLookLikeTopicCounterShell` — 커버 주제 + 빈 `topic · N` ≥2 → failed-generate
- [x] short-draft / low-substance 연동 — kami 해골 덱 persist skip
- [x] `isReusableSameTurnDeckWrite` — low-substance면 recover/reuse write 거부
- [x] web deck-html-content · validate · ProjectView source 게이트
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프896–920 / round897–921)

- [x] **루프896–900**: `calc(min/max/clamp(…)+…)` 평탄화 혼합
- [x] **루프901–905**: `var()`/`env()` 폴백 → calc/min/rem
- [x] **루프906–910**: max+px · env+min · vh/ch · var+우선순위
- [x] **루프911–915**: FOO `①②③④⑤` + 회귀
- [x] **루프916–920**: FOO `⑥⑦⑧⑨` · invent-frame≠slide-flow 마감
- [x] `normalizePaddingLengthValue` + FOO BMP
- [x] `chat-leak-probe-round897`…`921` 25/25
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프182 · duplicate title-only slide preview 축소)

### 배경

- 루프180/181 후속 · 사용자 리포트 2026-08-31 · 삼각함수: pitch-deck 카탈로그 생성 결과가 `<section class="slide"><h1>삼각함수</h1></section>` × 2 만 존재. 콘텐츠 부재
- 루프180이 배경 그라디언트 오탐(paper surface), 루프181이 persist/reuse gate로 아웃라인 해골 저장 차단 — 두 축이 함께 방어하지만 preview heal 사이드는 별도 방어 필요 (persist gate를 우회한 old artifact 재열람 · same-turn recover 등)
- 기존 heal 파이프라인 gap:
  - `dropEmptyLikelyDeckSlides`: heading에 텍스트가 있어 empty로 판정 안 됨
  - `dropTitleOnlyNumberedLeftoverSlides`: `삼각함수 · 2` 처럼 counter 접미사가 있어야 매치 (fixture는 그냥 반복)

### 근본 원인

- MiniMax가 body 생성에 실패하면 outline의 첫 슬라이드 셸(title-only)이 다음 슬라이드 자리에도 그대로 emit됨. 완전히 동일한 innerHTML이 연속으로 반복
- 프로브: heal 후 slide count가 2 그대로 유지 → 사용자 화면에 title 2장

### 변경

1. **`dropDuplicateConsecutiveTitleOnlyLeftoverSlides` 신규** (`heal-ai-generated-deck.ts`):
   - `listAiSlideSpans`로 스팬 수집 → 인접 쌍 순회 (뒤에서 앞으로)
   - 두 body 모두 title-only 조건 (visible text 길이 ≤ 40 · svg/img/video/canvas/iframe/picture/figure 없음) 통과
   - 두 body의 정규화된 visible text 완전 일치
   - motif-only 데코 shell (background gradient inline style) 보존
   - 첫 슬라이드 절대 drop 안 함
2. **파이프라인 통합** — `dropTitleOnlyNumberedLeftoverSlides` 직후 실행. counter 케이스와 non-counter 케이스 모두 방어
3. **범위 제한** — CONSECUTIVE만 처리. 중간에 실체 슬라이드가 끼면 후속 chapter divider 재사용으로 간주하여 유지

### 회귀 방어

- 실체 body 있는 슬라이드는 절대 drop 안 함 (bullets/paragraphs)
- 단일 title-only 슬라이드는 유지 (cover만이라도 필요)
- svg/img 미디어 포함 슬라이드는 텍스트 동일해도 유지
- 200+ 자 long-form body가 우연히 opening heading 동일해도 drop 안 함 (title-only 판정 실패)
- Non-adjacent 반복 (실체 슬라이드가 사이에 있음)은 유지

**검증:** `heal-duplicate-title-only-slide.test.ts` 10/10 · 사용자 fixture 라운드트립 slide count 2→1

## 직전 루프 (루프180 · pitch-deck cover 그라디언트 오탐)

### 배경

- 사용자 리포트 2026-08-31 · 삼각함수: pitch-deck 카탈로그로 생성한 슬라이드가 콘텐츠 부재 + 모든 슬라이드에 보라 그라디언트 배경. 스크린샷은 "결과물 내용 없음 + 템플릿 적용 안됨"으로 읽힘
- HTML 검사 결과: `<style data-od-slide-surface-bleed>html, body, .slide, ... { background: var(--grad) !important; }` — 그라디언트가 슬라이드 paper로 승격됨

### 근본 원인

- `deck-slide-surface.ts::inferDeckSlidePaperSurface` 가 `identityHostBg` 추출 시 selector가 `.tpl-*` 로 시작하고 `.slide`를 포함하지 않으면 통과시킴
- pitch-deck 카탈로그의 `.tpl-pitch-deck .mega`(mega 숫자 텍스트 fill), `.cover-blob`(blob 데코), `.avatar`(아바타 원), `.brand-dot`(브랜드 dot), `.ask-box`(강조 박스), `.metric .n`(지표 숫자), `.traction-bar .bar`(그래프 바) 등 하위 요소 규칙이 모두 매치되어 그라디언트가 슬라이드 paper로 오탐
- 또한 `isDecorativeBackground` 는 리터럴 `gradient(`/`url(`/`image-set(`만 검사 → `var(--grad)` 는 non-decorative 로 취급되어 promotion 통과

### 변경

1. **`isIdentityHostSelector` 신규 헬퍼** — identity host = template body class **자체** 만 매치 (`.tpl-hermes-cyber-terminal`, `.theme-noir`). descendant/child combinator (`\s>+~`) 포함 시 거부. 하위 요소 규칙(`.tpl-pitch-deck .mega`, `.tpl-pitch-deck .cover-blob` 등) 필터됨
2. **`isDecorativeBackground` 확장** — 리터럴 검사에 실패하면 var 이름 힌트로 fallback. `/\bvar\s*\(\s*--(?:grad|gradient)\b/i` 매치 시 decorative로 취급
3. **`inferDeckSlidePaperSurface` 통합** — `identityHostBg` 추출을 `isIdentityHostSelector`로 좁힘

### 회귀 방어

- Hermes cyber terminal (`.tpl-hermes-cyber-terminal { background: var(--hc-bg); }`) exact host 매치 유지 → solid `#0a0c10` 정상 승격
- Bold Poster / Biennale / 기타 identity host 카탈로그 unchanged
- 기존 `deck-slide-surface.test.ts` 18/18 · `deck-slide-surface-catalog.test.ts` 미회귀

**검증:** `deck-slide-surface-pitch-deck-gradient.test.ts` 5/5 · 기존 surface + catalog 24/24 (총 24 pass · 회귀 없음)

## 직전 루프 (루프178 · placeholder scrub whitelist 확장)

### 배경

- 루프175–176/177에서 upstream이 Broadside의 3-토큰(`[[Author Name]]`·`[Author Name]`·`[Year]`) placeholder를 wrapper-only + Hangul-gate로 scrub하도록 방어함
- 사용자 fixture(2026-08-28 · 삼각함수)는 이미 완벽히 처리되지만, 다른 business-template 카탈로그는 `[Company Name]`·`[Client]`·`[Project]`·`[Version]`·`[Location]` 등 더 넓은 placeholder 세트를 씀
- 부분 실패(catalog fingerprint 미hit) 시나리오에서도 leftover가 노출되지 않도록 defence-in-depth 확장

### 변경

1. **`scrubUnresolvedTemplatePlaceholders`** — heal-ai-generated-deck에 whitelist 23개 (`Author Name`·`Author`·`Year`·`Date`·`Title`·`Subtitle`·`Company`·`Company Name`·`Client`·`Client Name`·`Project`·`Project Name`·`Team`·`Team Name`·`Product`·`Product Name`·`Version`·`Location`·`Category`·`Section`·`Chapter`·`Speaker`·`Presenter`·`Organization`) 신규 함수
2. **Wrapper-only 매칭** — `<div>/<span>/<p>/<h1..6>/<li>/<a>/<em>/<strong>/<small>/<td>/<th>` 안 텍스트가 100% placeholder인 경우만 클리어. 인라인 언급 (`<p>replace [Company] with...</p>`)은 보존
2. **Hangul-gate** — `destHasHangulTopic` 안에서만 실행. upstream contract 준수 (영문 official catalog 손상 방지)
3. **파이프라인 순서** — upstream 좁은 scrub(`scrubTemplatePlaceholderSlots`) 다음에 실행. 두 함수 모두 idempotent

### 회귀 방어

- 한글 대괄호 프로즈(`[참고]`·`[주1]`·`[1]`) 보존
- Citation-style 참조(`[Smith 2024]`) 보존 — whitelist에 없는 토큰은 미매치
- 영문 topic + null brief 시 `[[Author Name]]`·`[Year]` 유지 — upstream 계약 존중

**검증:** heal-broadside-leftover.test.ts (6/6) — whitelist scrub · 프로즈 보존 · citation 보존 · idempotency · Hangul dest scrub · 영문 dest 보존

## 직전 루프 (루프176–177)

1. heal — look neutralize 없어도 `data-od-data-anim-reveal` 주입. `[data-anim-target]`/`[class*="anim-"]` 포함
2. remmerge — `od-data-anim-visible` + `od-data-anim-reveal` 둘 다 있어야 current
3. leftover — Hangul dest placeholder 스크럽. persist는 `ZONE A`/`--c-bg-orange`를 지문으로 쓰지 않음

**검증:** Broadside leftover heal · official catalog 무브리프 · look-css · leftover sweep · deck-html-content

## 직전 루프 (루프175)

1. leftover — Broadside `[[Author Name]]` / demo title. persist ≥2 hit (`ZONE B · ENGINE`)
2. heal — `.lead` brief leak. Hangul leftover scrub. 공식 영문 catalog 유지
3. neutralize — `od-data-anim-visible` (`[data-anim]{opacity:1}`)

**검증:** heal Broadside leftover · template-clone-fill official · look-css · deck-html-content

## 직전 루프 (루프871–895 / round872–896)

- [x] **루프871–875**: calc `+`/`*`/`/` 우선순위 (px/rem/vh)
- [x] **루프876–880**: nested min/max · min(우선순위) · clamp+min
- [x] **루프881–885**: ch/pt/ic · rem+px* · max 우선순위
- [x] **루프886–890**: nested min rem · FOO `◐◑◒◓◔`
- [x] **루프891–895**: FOO `◕◖◗◘` · invent-frame≠slide-flow 마감
- [x] `splitTopLevelAddSub` / nested `evaluateMinMaxClampBody` + FOO BMP
- [x] `chat-leak-probe-round872`…`896` 25/25
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프846–870 / round847–871)

- [x] **루프846–850**: `min(calc…)` — px/rem/vh · mixed · 3인자
- [x] **루프851–855**: `max`/`clamp` — px/rem · mixed
- [x] **루프856–860**: ch/pt/vh/ic/cqh min·max·clamp
- [x] **루프861–865**: FOO `☀☁☂☃☄` + 회귀
- [x] **루프866–870**: FOO `☼♨⌀⌂` · invent-frame≠slide-flow 마감
- [x] `minMaxClampLooksCardLike` — top-level min|max|clamp는 nested calc skip
- [x] `chat-leak-probe-round847`…`871` 25/25
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프821–845 / round822–846)

- [x] **루프821–825**: left-associative `*`/`/` 체인 (px/rem)
- [x] **루프826–830**: nested `calc(calc(...))` · 괄호 체인
- [x] **루프831–835**: FOO `✓✔✕✖✗` + 체인 회귀
- [x] **루프836–840**: FOO `✘✚✱✳` + vh/ch/ic/cqh
- [x] **루프841–845**: 단위 체인·nested · invent-frame≠slide-flow 마감
- [x] `flattenNestedCalcCalls` / left-fold mul·div + FOO BMP
- [x] `chat-leak-probe-round822`…`846` 25/25
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프796–820 / round797–821)

- [x] **루프796–800**: `calc` 곱·나눗셈 — px/rem ×÷ 스칼라 (thin 미바인드)
- [x] **루프801–805**: vh/ch/pt × · `(a+b)*k` · `k*(rem+px)`
- [x] **루프806–810**: 괄호 `/` · cqh/ic × · (rem|vh+px)×
- [x] **루프811–815**: FOO `♠♣♥♦♤` + mul/div 회귀
- [x] **루프816–820**: FOO `♡♢♧⌘`+⌥ · invent-frame≠slide-flow 마감
- [x] `resolveCalcLengthParts` + FOO BMP 확장
- [x] `chat-leak-probe-round797`…`821` 25/25
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프172–174)

1. heal leftover — Hangul dest/brief일 때만 scrub. 공식 영문 catalog는 무브리프 유지
2. leftover/catalog 지문 — eyebrow · Berlin 좌표 · kami colophon · Apache/BYOK 태그 조합
3. heal — 제목-only 번호 장 drop · 스크립트 없는 leftover presenter chrome 제거. 강의 문장 발명 없음

**검증:** official kami 무브리프 · 부분 leftover · title-only drop · leftover sweep


## 직전 루프 (루프771–795 / round772–796)

- [x] **루프771–775**: 괄호 `calc` unwrap + 음수 항 합산(rem/vh/cqh/lh/ch·px) — thin 미바인드·thick 바인드
- [x] **루프776–780**: pt/in·vw/rem·vh·ic·vb 음수/괄호 혼합 calc
- [x] **루프781–785**: FOO `☏☎` + 음수 calc / hangul / fence / invent-frame≠slide-flow
- [x] **루프786–790**: FOO `✆ℹ‽` + 음수/괄호 calc 조합
- [x] **루프791–795**: FOO `♮♯♭♩♪` + 음수 calc 마감·회귀
- [x] `extractCalcBodies` / `unwrapAdditiveCalcParens` + FOO BMP 확장
- [x] `chat-leak-probe-round772`…`796` 25/25
- [ ] MiniMax 실키 브라우저 E2E (키 없음 — 유지)

## 직전 루프 (루프166–167 · MiniMax 시각 잔재 감사)

### 감사 방법

1. `pinDeckSlidesToFixedCanvas` + `buildStandaloneDeckHtmlDocument`로 사용자 fixture(6장) 파이프라인 통과 결과물 생성
2. Chrome for Testing 헤드리스로 1920×1080 6장 스택 렌더링 → 슬라이드별 크롭
3. 슬라이드 1(COVER) · 2(WHY) · 3(FOUR SKILLS) · 4(FOUR-STEP DRILL) · 5(THREE WAYS) · 6(CLOSING) 육안 감사

### 발견 · 해결

**루프166 · `.arrow` CSS-삼각형 body chrome 잔재 (해결)**

- 증상: 슬라이드 4 FOUR-STEP DRILL의 4개 step 카드(01 LISTENING · 02 SHADOW · 03 REWRITE · 04 SPEAK LIVE) 하단에 작은 검은 삼각형(`<div class="arrow"></div>`) 잔재
- 원인: MiniMax는 `<style data-od-official-motif-deco-css>`에 두 쌍 규칙을 함께 emit
  ```
  .slide .arrow{position:absolute; ...; border-*}   # CSS 삼각형 deco
  .slide .arrow{display:none}                        # universal hide
  ```
  루프158의 `scopeMotifDecoCssToOfficialHosts`가 두 규칙 모두를 `.slide [data-od-official-motif-html].arrow`로 좁혀, body의 빈 `<div class="arrow">` (본문 카드 안 CSS 삼각형 chrome)가 `display:none` 규칙을 잃고 렌더링에 노출됨
- 해결: `LOOK_NEUTRALIZE_CSS`에 `od-body-arrow-chrome-hide` 규칙 추가
  ```
  .slide [data-od-slide-flow] :is(.arrow, .arr):not([data-od-official-motif-html]):empty {
    display: none !important;
  }
  ```
  `:empty` 필터로 텍스트 있는 `.arrow`(예: "→ Next step")는 유지, chrome-only 빈 CSS-삼각형만 hide

**루프167 · 후행 MiniMax footer 텍스트 하단 앵커 (해결)**

- 증상: 슬라이드 3·5·6 등에서 flow의 후행 텍스트("ENGLISH", "PAGE 06 /", "EDITION 01" 등)가 컨텐츠 바로 아래 몰려 있고 슬라이드 하단에 큰 빈 영역이 남음
- 원인: MiniMax는 이 후행 텍스트를 인라인 스타일(`font-family:'JetBrains Mono',monospace; text-transform:uppercase`)로 emit하지만 class를 붙이지 않음. 기존 look CSS `.slide > [data-od-slide-flow] > :is(.slide-footer, .slide-meta, .kicker-footer, .footer) { margin-top:auto }`가 잡아내지 못해 flex-column flow에서 자연 순서로 상단에 몰림
- 해결: pin 단계(`pinDeckSlidesToFixedCanvas` → `wrapNonMotifSlideFlow` 이후) 새 post-heal `markTrailingMiniMaxFootersInPinnedFlow` 추가
  - 각 `[data-od-slide-flow]` wrapper 안 top-level 자식들을 뒤에서부터 순회
  - `text-transform:uppercase` + monospace 계열(mono/JetBrains Mono/Fira Code/Space Mono/IBM Plex Mono/Roboto Mono/Inconsolata/Menlo/Consolas/Monaco/Courier) 조건 모두 만족 시 후행 시퀀스로 판정
  - 시퀀스 첫 요소에만 `class="slide-footer"` 부여 (기존 class 있으면 확장, 이미 있으면 no-op)
  - 시퀀스가 flow 전체를 삼키면(startOfRun === 0) 안전 no-op
  - motif host(`data-od-official-motif-html`)는 제외
- 효과: 기존 `.slide-footer { margin-top:auto }` 규칙이 자동 발동 → 후행 footer 그룹이 flow 하단에 정렬. content bulk는 상단에 그대로, footer는 slide 바닥에 pinning

### 방어 축

**red-spec 파일 2개**
- `tests/deck-fixed-canvas-arrow-chrome-hide.test.ts` (4/4) — `.arrow`/`.arr` hide 규칙 존재 · deco CSS 계약 · pin+export end-to-end · 텍스트 있는 `.arrow` 보존
- `tests/deck-fixed-canvas-footer-anchor.test.ts` (5/5) — 2개 후행 · 단일 후행 · 기존 class 확장 · 상단 kicker 오탐 방지 · idempotency

**소스 변경**
- `packages/contracts/src/html/deck-template-look-css.ts` — `LOOK_NEUTRALIZE_CSS`에 `od-body-arrow-chrome-hide` 규칙 삽입
- `packages/contracts/src/html/deck-fixed-canvas.ts` — `markTrailingMiniMaxFootersInPinnedFlow` export 추가, pin 파이프라인에 hook

**검증:** contracts 전체 (823 파일 / 2090 테스트) · deck-template-look-css 회귀 (81/81) · deck-fixed-canvas 계열 (167/167)

## 직전 루프 (루프169 / top-up remaining-all)

1. top-up 프롬프트 — remaining > 3이면 3장 배치 금지. 이번 턴에 잔여 전부
2. invariant — `countHonoredSlideCountTopUpTurns`: 기본 6 미스(1·3장) = top-up 1회. 15장 = 2회

**검증:** web slideCountTopUp · contracts deck-framework-compact

## 직전 루프 (루프168 · kami-deck leftover recover/reuse persist 갭)

사용자 리포트(2026-08-28 · staging MiniMax 한글 "삼각함수" 브리프) `AGENT_EXECUTION_FAILED` 후 남긴 kami-deck example.html leftover가 스크럽 없이 저장·렌더된 사건. 루프165에서 `catalogExampleShouldBeScrubbed` + `scrubLeftoverCatalogExampleHtml`을 만들었지만 **`ProjectView.tsx` persist 경로에만 wire되어 있었고**, `recover existing artifact` (line 8253) / `same-turn write short-circuit` (line 10274) 경로는 `healAiGeneratedDeckMarkup`만 호출하고 catalog scrub은 건너뛰었다.

### 증상 (사용자 fixture)

- Cover: `<h1>삼각함수</h1>` + `<p class='tagline'>${brief}</p>` — 브리프가 tagline에 그대로 노출
- Slide 2: kami 카탈로그 문장 잔재 ("Open Design is the open-source alternative to Anthropic's Claude Design", "A local-first design studio for the agent you already trust", `Apache-2.0` / `Local-first` / `BYOK` 태그, `Berlin · 52.5200° N · 13.4050° E`, `MMXXVI`)
- Slide 2 body: `<ul class='dash'><li>${brief}</li></ul>` — 브리프가 dash-list item에 그대로 노출
- Slides 3–6: "삼각함수 · 3/4/5/6" 제목만 반복, 실질 콘텐츠 없음 (`<li></li>` 3개 등 빈 shell)
- `AGENT_EXECUTION_FAILED` 배너: "슬라이드 실행 중 오류가 발생했습니다"

### 원인 감사

1. **파이프라인 갭 (핵심)** — `apps/web/src/components/ProjectView.tsx`의 3개 heal 경로 중 `persistArtifact` (line 5626) 하나만 `scrubLeftoverCatalogExampleHtml`을 호출. `recover` (line 8253), `same-turn reuse` (line 10274) 두 경로는 `healAiGeneratedDeckMarkup`만 호출해서 leftover가 그대로 저장·렌더됨.
2. **brief-leak 슬롯 협소** — `scrubBriefLeakFromMetaSlots`의 slotClasses는 `['v', 'conf', 'kicker', 'brief', 'summary', 'note', 'lede', 'tagline']`만 처리. dash-list `<li>` 안의 brief 유출은 미처리.
3. **부분-실행 실패**의 결과물이 저장 skip 게이트(`isLowSubstanceSlideDeckArtifact`, `deckSlideHeadingsLookLikeFailedGenerate`)를 부분적으로 통과 — recover/reuse 경로는 이 게이트 자체가 없음.

### 해결 (근본 fix — heal 함수 자체가 스크럽을 소유)

**소스 변경 · `packages/contracts/src/html/heal-ai-generated-deck.ts`**

1. `healAiGeneratedDeckMarkup` 진입점에 catalog leftover scrub 통합
   - `catalogExampleShouldBeScrubbed(html, brief, {allowEmptyBrief: true})` 통과 시 `scrubLeftoverCatalogExampleHtml` 선행 실행
   - Idempotent — 이미 스크럽된 markup은 `catalogExampleShouldBeScrubbed`가 false 리턴해서 no-op
   - persist 경로 (이미 scrub 호출)에서 중복 호출되어도 안전
   - **모든 heal 호출자 (persist / recover / reuse / preview / srcdoc) 를 한 곳에서 방어**
2. `scrubBriefLeakFromMetaSlots`에 `<li>` 처리 추가
   - `<li>` 안 텍스트가 정확히 brief와 일치하면 empty로 blank
   - 인접한 정상 li는 보존 (`<li>내용</li>` 유지)
   - dash-list 특화 아님 — 일반 `<ul><li>${brief}</li></ul>` 도 처리

**red-spec 파일 1개**
- `tests/heal-ai-generated-deck-catalog-leftover.test.ts` (5/5)
  1. `healAiGeneratedDeckMarkup(kamiLeftover, brief)` 이 Claude Design/local-first studio/SKILL.md/Apache-2.0/BYOK/Berlin/MMXXVI/brief 완전 제거 + 삼각함수 topic 보존
  2. 정상 AI 덱은 무손실 (false-positive 없음)
  3. Idempotent — 두 번째 heal 패스는 첫 패스 결과와 정확히 동일
  4. `scrubBriefLeakFromMetaSlots`가 dash-list `<li>` 안 brief 유출 blank
  5. `scrubBriefLeakFromMetaSlots`가 plain `<ul><li>` 도 처리

### 방어 흐름

파이프라인 진입 순서 (변경 후):

```
recover/reuse 경로: readDiskHtml → healInstructionCopyCoverHeading →
                     mergeOfficialLookCssForTemplate → sanitizePersistedDeckHostLeaks →
                     healOfficialMagazineLayoutDensity →
                     healAiGeneratedDeckMarkup ← 이 안에서 catalog scrub 자동 실행
                     → repairDeckSlideSurfaceBleed → pin → write
persist 경로: healAiGeneratedDeckMarkup (이미 scrub 호출됨) → ...
srcdoc 경로: scrubLeftoverCatalogExampleHtml → healAiGeneratedDeckMarkup ← double-defense
```

**검증:** contracts 전체 (824 파일 / 2095 테스트) · heal-ai-generated-deck-catalog-leftover (5/5) · 사용자 fixture end-to-end 프로브 (heal-only 경로에서 kami 문장 · Apache-2.0 · Berlin · MMXXVI · brief leak 모두 제거, 슬라이드 6→4로 축소된 skeleton 대체)

**후속 (루프179에서 닫음)**: topic+counter failed-generate + recover/reuse low-substance refuse

## 직전 루프 (루프166–167 · MiniMax 시각 잔재 감사)

사용자 리포트(2026-08-28 · staging MiniMax 영어 회화 덱) 시각 잔재 감사 및 후속 해결. 루프158-A로 flow wrapper invariant는 확보되었으나, 실제 파이프라인을 Chrome for Testing 헤드리스로 렌더링해 슬라이드별 잔여 결함을 육안 감사했다.

### 감사 방법

1. `pinDeckSlidesToFixedCanvas` + `buildStandaloneDeckHtmlDocument`로 사용자 fixture(6장) 파이프라인 통과 결과물 생성
2. Chrome for Testing 헤드리스로 1920×1080 6장 스택 렌더링 → 슬라이드별 크롭
3. 슬라이드 1(COVER) · 2(WHY) · 3(FOUR SKILLS) · 4(FOUR-STEP DRILL) · 5(THREE WAYS) · 6(CLOSING) 육안 감사

### 발견 · 해결

**루프166 · `.arrow` CSS-삼각형 body chrome 잔재 (해결)**

- 증상: 슬라이드 4 FOUR-STEP DRILL의 4개 step 카드(01 LISTENING · 02 SHADOW · 03 REWRITE · 04 SPEAK LIVE) 하단에 작은 검은 삼각형(`<div class="arrow"></div>`) 잔재
- 원인: MiniMax는 `<style data-od-official-motif-deco-css>`에 두 쌍 규칙을 함께 emit
  ```
  .slide .arrow{position:absolute; ...; border-*}   # CSS 삼각형 deco
  .slide .arrow{display:none}                        # universal hide
  ```
  루프158의 `scopeMotifDecoCssToOfficialHosts`가 두 규칙 모두를 `.slide [data-od-official-motif-html].arrow`로 좁혀, body의 빈 `<div class="arrow">` (본문 카드 안 CSS 삼각형 chrome)가 `display:none` 규칙을 잃고 렌더링에 노출됨
- 해결: `LOOK_NEUTRALIZE_CSS`에 `od-body-arrow-chrome-hide` 규칙 추가
  ```
  .slide [data-od-slide-flow] :is(.arrow, .arr):not([data-od-official-motif-html]):empty {
    display: none !important;
  }
  ```
  `:empty` 필터로 텍스트 있는 `.arrow`(예: "→ Next step")는 유지, chrome-only 빈 CSS-삼각형만 hide

**루프167 · 후행 MiniMax footer 텍스트 하단 앵커 (해결)**

- 증상: 슬라이드 3·5·6 등에서 flow의 후행 텍스트("ENGLISH", "PAGE 06 /", "EDITION 01" 등)가 컨텐츠 바로 아래 몰려 있고 슬라이드 하단에 큰 빈 영역이 남음
- 원인: MiniMax는 이 후행 텍스트를 인라인 스타일(`font-family:'JetBrains Mono',monospace; text-transform:uppercase`)로 emit하지만 class를 붙이지 않음. 기존 look CSS `.slide > [data-od-slide-flow] > :is(.slide-footer, .slide-meta, .kicker-footer, .footer) { margin-top:auto }`가 잡아내지 못해 flex-column flow에서 자연 순서로 상단에 몰림
- 해결: pin 단계(`pinDeckSlidesToFixedCanvas` → `wrapNonMotifSlideFlow` 이후) 새 post-heal `markTrailingMiniMaxFootersInPinnedFlow` 추가
  - 각 `[data-od-slide-flow]` wrapper 안 top-level 자식들을 뒤에서부터 순회
  - `text-transform:uppercase` + monospace 계열(mono/JetBrains Mono/Fira Code/Space Mono/IBM Plex Mono/Roboto Mono/Inconsolata/Menlo/Consolas/Monaco/Courier) 조건 모두 만족 시 후행 시퀀스로 판정
  - 시퀀스 첫 요소에만 `class="slide-footer"` 부여 (기존 class 있으면 확장, 이미 있으면 no-op)
  - 시퀀스가 flow 전체를 삼키면(startOfRun === 0) 안전 no-op
  - motif host(`data-od-official-motif-html`)는 제외
- 효과: 기존 `.slide-footer { margin-top:auto }` 규칙이 자동 발동 → 후행 footer 그룹이 flow 하단에 정렬. content bulk는 상단에 그대로, footer는 slide 바닥에 pinning

### 방어 축

**red-spec 파일 2개**
- `tests/deck-fixed-canvas-arrow-chrome-hide.test.ts` (4/4) — `.arrow`/`.arr` hide 규칙 존재 · deco CSS 계약 · pin+export end-to-end · 텍스트 있는 `.arrow` 보존
- `tests/deck-fixed-canvas-footer-anchor.test.ts` (5/5) — 2개 후행 · 단일 후행 · 기존 class 확장 · 상단 kicker 오탐 방지 · idempotency

**소스 변경**
- `packages/contracts/src/html/deck-template-look-css.ts` — `LOOK_NEUTRALIZE_CSS`에 `od-body-arrow-chrome-hide` 규칙 삽입
- `packages/contracts/src/html/deck-fixed-canvas.ts` — `markTrailingMiniMaxFootersInPinnedFlow` export 추가, pin 파이프라인에 hook

**검증:** contracts 전체 (823 파일 / 2090 테스트) · deck-template-look-css 회귀 (81/81) · deck-fixed-canvas 계열 (167/167)

## 직전 루프 (루프165)

1. leftover — kami 스튜디오 문장(`Claude Design` alternative · local-first studio) 감지
2. persist — catalog fingerprint + `catalogExampleShouldBeScrubbed`. 갤러리 example은 무브리프에서 유지
3. heal — tagline brief leak 제거. leftover HTML pin/heal no-throw. 삼각함수 강의 문장 발명 없음

**검증:** template-clone-fill kami leftover · leftover sweep · deck-html-content · heal tagline

## 직전 루프 (루프164)

1. compact 계약 — 3장 와이어프레임은 minimum shape. 목표 6/미지정에서 3장 마감 실패. 기본 덱은 hidden top-up 분할 금지
2. first-fill 가이던스 — `3+3+3 top-up split` 금지. resume / clone-fill 로컬 카피 동기화
3. top-up — batch 6. 숏 미스(1 또는 3장)는 remaining-all 한 턴으로 기본 6장 마감

**검증:** contracts deck-framework-compact · web slideCountTopUp · templateCloneContentFill

## 직전 루프 (루프746–770 / round747–771)

1. padding — 삼중+ 단위 px 환산 합≥13
2. chat — FOO `♟♜♝♞♛✂✈✉✎✏`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round747–771 (25/25)

## 직전 루프 (루프163)


1. neutralize/pin — `od-sibling-chrome-above-flow`로 본문 pill/stamp를 flow clip 위
2. deco remmerge — 비범위 `.slide .marker`/`.arrow`는 Motif 호스트로 재작성

**검증:** creative-mode compact fixture · remmerge · look-css · magazine · pin

## 직전 루프 (루프158-A · flow invariant 방어층)

사용자 리포트(2026-08-28 · staging MiniMax 영어 회화 덱) 재발 방지. 루프158이 해결한 "표지 전체가 사라지는" 회귀에 대한 방어 layer.

1. invariant 방어 — `pinDeckSlidesToFixedCanvas` 이후 슬라이드마다 `[data-od-slide-flow]` wrapper ≤ 1개 · 콘텐츠 텍스트 유실 없음 · chrome 지문(`.pill`/`.stamp`) 유실 없음 · idempotent(`pin(pin(x))===pin(x)`) invariant를 다양한 MiniMax 인터리브 시나리오(표지·마감·중간 · 이미 다중 flow된 상태 · footer 배지 뒤섞임)에 대해 강제
2. 사용자 fixture 회귀 가드 — 사용자가 제출한 44KB 실제 HTML을 `tests/fixtures/`에 저장, 6장 슬라이드 모두 wrapper ≤ 1개 · 표지 시그니처 `SPOKEN·ENGLISH·PRACTICED` 유지 검증
3. pin — `ABS_FLOW_OPEN_RE` whitelist 확장. MiniMax의 `<ul style="position:absolute">` / `<li>` / `<figure>` / `<blockquote>` / `<table>` 등 목록·블록 컨테이너 태그가 절대 위치로 park되어도 문서 흐름으로 평탄화 (기존은 `div/span/p/h1-6/section/article/aside/header/footer/small/label`만 대상)
4. round54 정정 — 루프158 semantics에 맞춰 chat-leak-probe-round54의 "position/background copy" 기대치를 최신 flow open 계약(position/background 미복사, 나머지 layout/paint 복사)으로 갱신

**검증:** deck-fixed-canvas-flow-invariants (28/28) · contracts 전체 (796 파일 / 2051 테스트) · chat-leak-probe-round54 · web pin 소비자 3파일 (38 테스트)

## 직전 루프 (루프160–162)

1. neutralize — `od-look-slot-flow-ext`로 `.h/.arrow/.cell/.pill` 등 잔여 슬롯 offset 해제. 본문 `.marker::after` 차단
2. Motif — `.marker`/`.arrow`는 카탈로그 칩으로 추출하지 않음. 본문과 같은 paint 클래스면 official 인스턴스 drop
3. salvage — 2×2 `.grid` 고아 카드 3장을 그리드로 재부모. PAGE 푸터는 밖에 유지

**검증:** ext upgrade · PRESS PLAY 미스탬프 · 1+3 재부모 · Daisy/IB/official Creative Mode 유지

## 직전 루프 (루프159)

1. preview — 작성자 JS presenter(`showSlide/currentSlide/slideCounter` + 다중 slide)는 MiniMax salvage/heal 묶음에서 제외
2. bridge — `.slide-counter` wrapper 안의 `#current/#total/#now` span 보존. wrapper `textContent` 덮어쓰기 금지
3. export — daemon PDF/image/PPTX/HTML pagination에서 nested slide-like 후보 제거

**검증:** capsule/retro slide count 보존 · compact stacked `#deck` 회귀 · daemon deck export pagination 회귀

## 직전 루프 (루프721–745 / round722–746)

1. padding — px+print(pt/mm/pc/Q/cm/in) → px≥13
2. chat — FOO `⚝⚡⚠⚽⚾⚀⚁⚂⚃⚄♔♕♖♗♘`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round722–746 (25/25)

## 직전 루프 (루프158)

1. deco — `.slide .marker`/`.arrow`를 `[data-od-official-motif-html]`에만. 본문 `DAILY 30 MIN`은 `bottom:160px` 금지
2. pin — pill/stamp가 flow를 쪼개지 않음. 이미 쪼갠 flow는 하나로 합침. flow에서 position/background 복사 금지
3. neutralize — 공식 `.flow`/`.grid`/`.table`/`.step` 슬롯의 absolute/`top:380`/`height:420`를 flow 안에서 해제

**검증:** cover 1 flow · deco scoped · od-look-slot-flow · Daisy/IB 유지

## 직전 루프 (루프696–720 / round697–721)

1. padding — px+ch|lh|ic|vb|cq → px≥13
2. chat — FOO `❆☾☽☿♁☰☱☲☳☴⚙⚛⚜`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round697–721 (25/25)

## 직전 루프 (루프671–695 / round672–696)

1. padding — rem|line|ch|ic|vb + print → px≥13
2. chat — FOO `✣✤✥❇❈❁❂❃❄❅`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round672–696 (25/25)

## 직전 루프 (루프157)

1. restyle — 성긴 `s-data`를 `.frame`/`.head`/`.stat`. chart·카드 발명 금지
2. restyle — 성긴 `s-quote`/`s-manifesto`를 `.qwrap`/`.quote`. kicker 발명 금지
3. CSS — footer 없는 표지 titlewrap 하향 · `.nm` 없는 chapter ttl 확대 · chart 없는 data 1열
4. pin — `yblock`/`haze`는 overlay로 유지

**검증:** frame/stat · qbody · sparse-fill CSS · official example 유지 · Daisy/IB 유지

## 직전 루프 (루프156)

1. restyle — Biennale 표지에 공식 `.blocks` b1–b4 (카피 발명 금지)
2. restyle — 성긴 `s-chapter`를 `.stack`/`.ttl`/`.lede`. 숫자·vrail 발명 금지
3. magazine heal — 한글 조사 공백. overlay orb는 stack 밖

**검증:** blocks · chapter stack · 회로를 · dense/stacked skip

## 직전 루프 (루프646–670 / round647–671)

1. padding — rem|em+view/cq/% → px≥13 · line-box+view/cq 1:1
2. chat — FOO `✙✚✛✜✝✞✟✠✡✢`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round647–671 (25/25)

## 직전 루프 (루프621–645 / round622–646)

1. padding — print+view/cq/% → px≥13 · ch+view · ic×2+view
2. chat — FOO `⊞⊟⊠⊡⋄⋆∗∘⁕⁜`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round622–646 (25/25)

## 직전 루프 (루프155)

1. restyle — mast 없는 IB ribbon/`h1.display`/cover-meta 표지를 Biennale `s-cover`+`titlewrap`
2. restyle — mast 없는 경로는 Biennale look만. 이미 `s-cover`+sunglow면 no-op
3. magazine heal에서도 동일 리스타일 (look-heal 미리보기)

**검증:** no-mast restyle · idempotent · biennale heal → s-cover · Daisy skip · no 학습 노트

## 직전 루프 (루프596–620 / round597–621)

1. padding — 교차 가족 ch+cq · line|ch+ic(×2) · cq+viewport · rem|em+ch · %+cq
2. chat — FOO `⬡⬢⬤⬥⬦◊◈⊕⊖⊗⊘⊙`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round597–621 (25/25)

## 직전 루프 (루프154)

1. heal — Biennale `--sun` 장에서 크림 글자(`#E9E5DB`/`#DCD6C4`)를 `--ink`로. footer `에 대한` polish
2. heal — 한글 덱의 `Study Notes`/`Working notes`만 삭제(`학습 노트` 발명 금지). 같은 문서의 긴 단어로 `Shado` 복구
3. heal+pin — overlay sun/orb(`translate(-50%)` · 50% radial · ≥400 정사각)는 absolute 유지

**검증:** biennale cream-on-cream · no Study Notes · Shado→Shadowing · pin overlay absolute

## 직전 루프 (루프571–595 / round572–596)

1. padding — cq 가족 합≥2 · ic|ric 합≥1 · print 혼합 px≥13
2. chat — FOO `✶✸✹✺❋※†‡‣∙`
3. invent-frame≠flow 회귀

**검증:** chat-leak-probe-round572–596 (25/25)

## 직전 루프 (루프546–570 / round547–571)


1. padding — calc line-box·fontVp 혼합 합≥2 card-like (`1lh+1ex`, `1vb+1vi`; thin 0.5+0.5 유지)
2. chat — FOO `❖✪✫◎▣▢■□`
3. invent-frame≠flow 물리 border/shadow/background 미카피

**검증:** chat-leak-probe-round547–571 (25/25)

## 직전 루프 (루프153)


1. persist — magazine 뒤 `healAiGeneratedDeckMarkup` (저장·same-turn·recovered)
2. FileViewer accept · preview look-heal도 동일
3. Q6 — `에 대한`/`예시에` 제목 polish. 발명 금지

**검증:** heal-ai Q6 · project-view 파이프 · FileViewer accept

## 직전 루프 (루프151)

1. salvage — persist가 찍은 IB `mast/ribbon/Study Notes`를 Biennale `s-cover`+`titlewrap`으로 되돌림
2. persist — poster `s-chapter`/`s-cover`·비IB look에는 IB stub rebuild 금지
3. deco radial absolute. Hartfield/Daisy/IB stub 유지

**검증:** clone-fill Biennale restyle · no Study Notes · IB stub 유지

## 직전 루프 (루프150)

1. heal — 잘린 `에 대한` 제목·Brief echo cover-meta·빈 장·혼자 남은 repeat 그리드
2. salvage — `</h>` · 헤딩이 삼킨 lede/grid 분리 · 제목 이중 `<br>`
3. Biennale 인라인 `#0a0a0a` → `--paper`. IB 매거진/토픽 발명 금지

**검증:** biennale compact fill · lede outside h1 · no Brief · lonely 1fr · 4 slides

## 직전 루프 (루프149)

1. heal — framed leftover 매 회 스크럽. 균형 태그 · 한/영 칩만 삭제. 한글 `·` 유지. 투팬 aside ≥2. 투팬 미달 요청 카피 유지
2. 표지 — no-brief는 기존 제목 polish만. 빈 제목은 `슬라이드`를 발명하지 않음
3. FileViewer accept/look-heal에 `userBrief`. srcdoc leftover 가드

**검증:** framed leftover · hyphen/li · no-brief stub · Hangul · keep · FileViewer brief wire

## 직전 루프 (루프148)

1. 본문 — leftover 이후 `h2`만 남으면 `od-magazine-title-fill`로 16:9 well을 채움
2. 본문 — 첫 문단/`div` 산문은 lede, 남은 리스트·카드만 fill-track. lede-fill은 제목+lede만
3. Hartfield 본문 · Daisy/Studio · 발명 카피 금지 유지

**검증:** heal title-fill · lede 위 fill-track · dense IB skip · look-css `od-magazine-title-fill`

## 직전 루프 (루프147)

1. 표지 — `cover-meta`가 없으면 1열(`od-magazine-cover-solo`). 후속 장 제목 없을 때만 후속 lede를 subhead
2. 본문 — 성긴 MiniMax `slide-inner`를 fill-track/lede-fill로 재프레임. 2줄 리스트도 채움
3. Hartfield 본문 · Daisy/Studio · on-brief 표지 유지

**검증:** heal cover-solo · sparse inner · 2-item list · dense IB skip · look-css `od-magazine-cover-solo`

## 직전 루프 (루프146)

1. stacked stage — 기본 `translate(-50%, -50%)`로 호스트 viewport 전 빈 레터박스 방지
2. 첫 장 — CSS로 브릿지/`display:none` 전에 페인트. 이후 인라인 hide 유지
3. inner fill — `min-height:100%`(이전 `min-height:0` 접힘 해제). Daisy/Hartfield 비개입

**검증:** compact-api-stacked-deck letterbox center · heal-official-magazine-layout min-fill · look-css `od-slide-inner-min-fill`

## 직전 루프 (루프145 · 루프515–544 / round516–545)

1. heal — 제목+lede만 있는 본문은 `od-magazine-lede-fill`로 남은 16:9 well을 채움 (칩 투팬·fill-track·leftover 칩 삭제는 유지)
2. neutralize — lede 36px, `od-magazine-lede-fill` 없으면 재주입
3. padding — calc `vh|vw|% + px`를 1920×1080 환산(≥12px). thin `0.4vh+2px` / `0.2%+2px` 유지
4. chat — FOO `▲▼△▽★☆✦✧●◉` · invent-frame/`box-shadow` 보류

**검증:** heal lede-fill · look-css · chat-leak-probe-round516–545

## 직전 루프 (루프144)

1. heal — MiniMax `·` leftover 칩을 본문/cover-meta에서 삭제. 요청된 aside만 투팬
2. 표지 — 후속 장 제목만 TOC. `개요/핵심 포인트`·발명 subhead 금지. on-brief 제목+본문 표지는 rebuild하지 않음
3. Daisy/Studio/weekly · 카탈로그 IB paper 유지

**검증:** heal leftover drop · requested aside two-pane · on-brief cover keep

## 직전 루프 (루프143)

1. heal — 성긴 본문은 제목 전폭 상단 + lede|칩 `od-magazine-sparse-spread` (`align-items:start`)
2. neutralize — fill-track 리스트 28px·li stretch, 카드 내부 center, `od-magazine-body-fill` 없으면 재주입
3. 카탈로그 IB paper · Daisy/Studio/weekly · 토픽 카피 발명 금지 유지

**검증:** heal sparse-spread · look-css 28px list · Chrome persist 재측정

## 직전 루프 (루프490–514 / round491–515)

1. padding — calc rem+em 1:1 합산(≥0.75)
2. chat — FOO `➙➛➝➟➣►◁◀◂◃◇○` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round491–515

## 직전 루프 (루프142)

1. heal — 성긴 본문은 `1.3fr 1fr` 투팬(lede + 기존 칩 cover-meta). 카드/리스트는 fill-track으로 1fr 행을 채움
2. neutralize — `h2.section` 56px, fill-track stretch, `od-magazine-body-spread` 없으면 재주입
3. 카탈로그 IB paper · Daisy/Studio/weekly 유지. 토픽 카피 발명 금지

**검증:** heal two-pane / fill-track / 2×2 · look-css 56px · Chrome persist 재측정

## 직전 루프 (루프465–489 / round466–490)

1. padding — calc `%` 토큰 경계 · rem/em+px@16px root 합산
2. chat — FOO `↠↝➞➠◆♦▶▷▸▹` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round466–490

## 직전 루프 (루프435–464 / round436–465)

1. padding — additive `calc()` 동일 단위 합산 (`8px+4px`, `.5rem+.25rem`, `4Q+4Q`)
2. chat — FOO `⟶➜➡➔➢` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round436–465

## 직전 루프 (루프141)

1. neutralize — 16:9에서 `.cover .body`는 `align-items:center` (카탈로그는 `end` 유지)
2. heal — 성긴 본문 `.body`는 flex center, 밀집 본문은 flex-start + height 100%
3. look current — `od-magazine-optical-place` 없으면 neutralize 재주입

**검증:** heal-official-magazine-layout sparse/dense body · look-css optical-place

## 직전 루프 (루프140)

1. flow wrap — magazine `.slide-inner`가 있으면 padding/`justify-content`를 복사하지 않고, 이미 있는 flow에서도 걷어냄
2. neutralize — flow `:has(.slide-inner)` padding 0. paper `box-shadow` 제거
3. pin CSS — paper stretch는 compact/stacked에만. 카탈로그 IB는 Hartfield paper 유지

**검증:** deck-fixed-canvas magazine inner/flow slim · look-css neutralize · heal pin+neutralize · raw IB `min(1320px)`

## 직전 루프 (루프139)

1. neutralize — stacked 16:9에서 `.slide-inner`를 1920×1080 페이지에 맞춤 (IB 1320×820 / 92vw 카드 해제)
2. heal — 커버·본문 매거진 프레임이 페이지를 채움. 본문은 기존 제목/본문만 `h2.section`으로 배치
3. 카탈로그 프레젠터·Hartfield 본문 `slide-inner`·Daisy/Studio는 유지

**검증:** heal-official-magazine-layout fill/section · look-css neutralize `od-slide-inner-canvas-fill`

## 직전 루프 (루프405–434 / round406–435)

1. padding — leading-dot `.75rem`/`.8em` · `.4cm`/`.15in` · env/var 폴백 스펙
2. chat — FOO `⇢⇝↦➤⟹` · invent-frame/`box-shadow` 보류

**검증:** chat-leak-probe-round406–435

## 직전 루프 (루프375–404 / round376–405)

1. padding — `lvmin/lvmax/svmin/svmax/dvmin/dvmax` · CSS `Q`(≥8Q)
2. kit — `form` 선택적 · `div` 비선택 유지
3. chat — FOO `：»›≫` · `@when`/`@else` harden (`box-shadow` 보류)

**검증:** chat-leak-probe-round376–405

## 직전 루프 (루프345–374 / round346–375)

1. padding — `calc/min/max/clamp` 내부 · `lvh/lvw` 카드 인식
2. kit — `section` 선택적 · nested same-tag close · `div` 비선택 유지
3. chat — generic FOO 구분자 `=＝→⇒` · `Step 1: Setup` 유지
4. tests — flow style `box-sizing` 순서 관대 매칭 (`box-shadow` 보류)

**검증:** chat-leak-probe-round346–375 · deck-fixed-canvas

## 직전 루프 (루프315–344 / round316–345)

1. persist — `-moz-stack-sizing`/`-moz-binding` · `-webkit-box-flex-group` · `-webkit-mask-composite-source` · `-ms-content-zoom-snap-points-*` · `-moz-text-emphasis*`
2. kit — `ul/ol/li/dl/dt/dd/figure/article/aside/header/footer/nav/main/s/u/wbr/colgroup/col` 선택적(얇은 테두리 미바인딩)
3. chat — `@font-face` · `@keyframes` · `@media` · `@font-palette-values` · `@annotation` · `@custom-media` · `@stylistic` · `@color-profile` · `@nest` · `@function` · `@position-try` · invent-frame · set49–54 closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round316–345

## 직전 루프 (루프285–314 / round286–315)

1. persist — background-blend · `-ms-color-scheme` · `-moz-text-orientation` · `-webkit-ruby-align` · `-webkit-aspect-ratio` · ime-mode · view-transition-class/group
2. persist — dashboard/border-fit · `-webkit-shape-*` · `-webkit-wrap-*` · `-webkit-flow-*` · `-webkit-region-*` · mask-attachment
3. kit — `blockquote`/`address`/`hgroup`/`search`/`s`/`u` 선택적
4. chat — `@starting-style` · `@scroll-state` · `@counter-style` · `@page` · `@scroll-timeline` · invent-frame · set43–48 closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round286–315

## 직전 루프 (루프255–284 / round256–285)

1. persist — `-webkit-mask-*-x/y` · `-moz-border-*-colors` · `-moz-text-blink` · `-ms-scrollbar-*` · column-rule longhands · font-feature/kerning
2. persist — `-moz-border-image*` · `-ms-word-*`/`-ms-writing-mode` · `text-zoom` · `-webkit-line-grid/align/snap` · border-before/after longhands
3. persist — `-ms-content-zoom*`/`-ms-scroll-limit*` · `-epub-text-emphasis*` · `-moz-inert`/`-webkit-marquee-dir`
4. chat — `@supports` · `@container` · `@layer` · `@property` harden · invent-frame · set37–42 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round256–285

## 직전 루프 (루프138)

1. persist/preview — MiniMax `auto auto 1fr` 카드 · 64px step `</ol>` · 유출 `· Label` 복구 (IB TOC 유지)
2. persist/preview — 클래스만 있는 빈 `.ribbon`/`.stamp` 제거. srcdoc은 brief 없이도 salvage
3. FileViewer accept · standalone export — salvage 후 magazine
4. persist — salvage를 magazine 힐 앞에 두어 표지 메타가 뒤 장 제목을 읽게 함

**검증:** template-clone-fill card/ol/IB leftover · srcdoc brief-less salvage · deck-pdf-export · FileViewer source

## 직전 루프 (루프137)

1. heal — IB 매거진은 official `h1.display`(조각 시트 포함) 또는 `.cover .ribbon`+`.cover-meta`+`.mast`. Daisy `.slide-inner`는 오탐 아님
2. heal — 커버 카피는 brief/후속 장 제목. 회화·쉐도잉·In context 발명 금지
3. export/preview — standalone heal과 preview look merge 뒤에도 동일 복구
4. first-fill — 중복 bilingual `·` · 빈 demo-banner/pill · 커버 인라인 flex 제거

**검증:** heal-official-magazine-layout Daisy/Studio/expo/fragment · srcdoc sparse cover · standalone export

## 직전 루프 (표지 밀도 follow-up: look CSS hoist · MiniMax 태그)

1. persist/preview — 슬라이드 사이 official look CSS를 문서 끝으로 이동
2. persist/preview — `<p="">` · 유출 `· Label` 복구 (카탈로그 목록은 유지)
3. neutralize — Motif `span.ribbon`은 relative stretch 제외
4. preview — srcdoc에서 heading-heal을 돌리지 않아 leftover IB 카탈로그 `#now`를 유지

**검증:** template-clone-fill stub cover/salvage · look-css hoist · srcdoc stub cover

## 직전 루프 (루프136)

1. persist/preview — 빈 IB `.ribbon`/`.stamp` Motif 껍데기를 주입하지 않고 제거
2. persist/preview — 제목만 있는 IB 표지를 `h1.display` + ribbon + cover-meta 매거진 커버로 복구
3. neutralize — `[data-od-slide-flow]`는 absolute clip을 유지해 이중 패딩을 막음
4. first-fill — `</p="">` · 유출 `· Small talk</div>` 마크업 복구

**검증:** heal-official-magazine-layout · deck-template-look-css · template-clone-fill

## 직전 루프 (루프240–254 / round241–255)

1. persist — `-moz-border-radius*` · `-moz-box-*` · `-moz-float-edge`/`-moz-orient`/`-moz-image-region`
2. persist — `-moz-transition*` · `-moz-animation*` · `-moz-perspective*`/`-moz-transform-style`/`-moz-opacity`
3. persist — `-moz-outline*` · `-moz-hyphens`/`-moz-text-*` · `-ms-high-contrast-adjust`/`-ms-ime-align`/`-ms-flow-*`
4. chat — `@scope` harden · invent-frame negative · set34–36 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round241–255

## 직전 루프 (루프225–239 / round226–240)

1. persist — `-ms-flex*`/`-ms-order` · `-ms-grid*` · `-moz-background-*` · `-moz-column*`
2. persist — `-webkit-margin-*-collapse`/`-webkit-rtl-ordering` · `-moz-user-*`/`-moz-print-color-adjust`
3. persist — `-ms-touch-action`/`-ms-text-overflow`/`-ms-scroll*`/`-ms-wrap*`/`-ms-block-progression`
4. chat — `@view-transition` harden · invent-frame negative · set31–33 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round226–240

## 직전 루프 (루프210–224 / round211–225)

1. persist — `-webkit-border-*-radius` · `-webkit-text-orientation`/`-epub-*` · `-webkit-clip-path` · `-webkit-image-rendering` · `-webkit-mask-box-image*`
2. persist — `-webkit-word-break`/`text-decorations-in-effect`/`line-box-contain` · hyphenate-limit last/zone
3. persist — `-moz`/`-ms` appearance · user-select · text-size-adjust · transform/origin · backface · overflow-style · word-wrap/`-o-text-overflow`/`-moz-tab-size`
4. chat — `@charset` opacity dump · invent-frame negative · set28–30 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round211–225

## 직전 루프 (루프195–209 / round196–210)

1. persist — `-webkit-transition-delay` · `-webkit-transition-timing-function`
2. persist — `-webkit-text-emphasis*` · `-webkit-box-sizing` · `-webkit-border-*-spacing`
3. chat — `@namespace` · `@font-feature-values` opacity dump · FOO separator keep
4. invent-frame negative · set25–27 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round196–210

## 직전 루프 (루프180–194 / round181–195)

1. persist — `-webkit-perspective-origin` · `-webkit-transform-origin/style`
2. persist — `-webkit-font-size-adjust` · `-webkit-writing-mode` · `-webkit-text-combine*`
3. persist — `-webkit-opacity` · `-webkit-flex-wrap/flow/grow/shrink/basis` · order/align/justify · column-axis/progression
4. chat — `@document` opacity dump · FOO separator keep
5. flow/chat — set22–24 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round181–195

## 직전 루프 (루프165–179 / round166–180)

1. persist — `-webkit-touch-callout` · `-webkit-nbsp-mode` · `-webkit-line-break`
2. persist — `-webkit-box-decoration-break` · `-webkit-mask-source-type`
3. persist — `-webkit-background-origin/size/composite` · `-webkit-user-modify`
4. persist — `-webkit-column-break-*` · `-webkit-hyphenate-*` · margin/padding/border before/after/start/end
5. chat — `@color-profile` opacity dump · FOO separator keep · set19–21 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round166–180

## 직전 루프 (루프150–164 / round151–165)

1. persist — `-webkit-box-pack/align/flex/ordinal-group/lines`
2. persist — `-webkit-font-feature-settings` · `-webkit-font-variant-ligatures`
3. persist — `-webkit-logical-*` · `-webkit-border-image*`
4. persist — `-webkit-text-zoom` · `-webkit-marquee*`
5. chat — `@nest` opacity dump · FOO separator keep · set16–18 combo/closure (`box-shadow` 보류)

**검증:** chat-leak-probe-round151–165

## 직전 루프 (top-up 센티널 · motif Hartfield · 커버 슬라이드)

1. persist/preview — `[od:slide_count_top_up]`·빈 `<artifact>`를 덱 HTML에서 제거. liveHtml도 동일
2. persist/preview — Motif `.who` leftover Hartfield 비움. 갤러리 example은 유지
3. heal — 커버 `<h1>슬라이드</h1>`를 brief 주제로 교체

**검증:** template-clone-fill sentinel/Hartfield/슬라이드 heal · srcdoc sentinel strip

## 직전 루프 (IB #stage 첫 장 밀림 · 스크럽 leftover)

1. preview — `#stage` 수평 스트립은 stacked hoist/`forceReveal`보다 px `transformGo`를 먼저
2. preview — `data-od-deck-fixed-canvas-pin`만 있어도 스텝은 1920px. native `100vw` next는 클릭하지 않음
3. persist — Hartfield를 지운 IB 껍데기+placeholder는 compact 토픽 fill로 교체 허용

**검증:** srcdoc pin-only IB 1920 next · persist scrubbed IB shell · catalog swipe shell

## 직전 루프 (루프135)

1. preview — 프로젝트 FileViewer/memory-only는 leftover catalog를 brief 없이도 스크럽. 갤러리는 원본 유지
2. clone — 템플릿 칩 `pitch book`만으로는 Hartfield를 유지하지 않음
3. preview — `#stage` 스트립은 iframe 폭과 같아도 1920px step. 인슬라이드 `#next`/`#prev`는 native 100vw를 가로챔
4. persist — leftover scrub에 `allowEmptyBrief`

**검증:** template-clone-fill empty-brief/chip · srcdoc project scrub · IB #next 1920px · memory-only leftover

## 직전 루프 (루프120–134 / round136–150)

1. persist — `-webkit-animation*` (shorthand + longhands)
2. persist — `-webkit-hyphens` · `-webkit-column-rule/span/width/fill`
3. persist — `-webkit-text-security` · `-webkit-user-drag`/`user-drag` · box-reflect · locale · ruby-position
4. chat — ALLCAPS generic `/`·`／` separators · `@function` opacity dump
5. flow/chat — set13–15 combo·closure 회귀 (`box-shadow` 계속 보류)

**검증:** chat-leak-probe-round136–150

## 직전 루프 (leftover IB artifact_regression)

1. persist — leftover catalog / demo prior는 compact 토픽 fill로 교체 허용
2. persist — byte·장수 regression + daemon stub-guard를 leftover prior에서 건너뜀
3. 진짜 8장 사용자 덱 → 3장 축소는 그대로 차단

**검증:** project-view-persist-result leftover IB · findClientSlideCountRegression leftover

## 직전 루프 (루프119)

1. clone — leftover Hartfield/DCF는 한국어 brief(띄어쓴 한글 포함)에서 재클론
2. preview — `buildSrcdoc`이 leftover catalog를 스크럽. FileViewer/memory-only가 last user brief를 넘김. 갤러리(brief 없음)는 원본 유지
3. preview — 1920px `#stage`는 native `100vw`보다 px `transformGo`를 먼저
4. persist — leftover catalog는 skip 대신 스크럽 후 저장

**검증:** template-clone-fill IB scrub · srcdoc leftover+1920px next · memory-only leftover · FileViewer/FileWorkspace brief 핀

## 직전 루프 (API-mode save-as-deck 유출)

1. 프롬프트 — filesystem write / save-this-as-deck 문장 제거. 호스트 persist만 지시
2. chat — 유출 문장 sanitize. fenced HTML은 말풍선에서 제거
3. persist — standalone recover identifier=`deck`. HTML 없는 유출 문장은 미완료

**검증:** system-prompt-api-mode · agent-prose-sanitize · recover/strip · deck-deliverable-prose

## 직전 루프 (루프104–118 / round121–135)

1. persist — `-webkit-mask*` · `-webkit-filter`/`backdrop-filter` · `-webkit-transform`/`transition*`
2. persist — `-webkit-print-color-adjust` · `text-decoration-skip`
3. kit — selective `pre` (`em`/`strong`/`picture` keep)
4. persist — `-webkit-flex*` · `-webkit-columns*` · perspective/backface/overflow-scrolling/border-radius
5. chat — ALLCAPS generic `:`/`|` separators · `@position-try` opacity dump
6. kit/flow — thin pre keep · set10–11 combo · closure 회귀

**검증:** chat-leak-probe-round121–135

## 직전 루프 (루프89–103 / round106–120)

1. persist — `font-smooth` / `-webkit-font-smoothing` / `-moz-osx-font-smoothing`
2. kit — selective `bdi`/`bdo`/`del`/`ins` · `sub`/`sup`/`var`/`code` (`strong` keep)
3. persist — SVG `x`/`y`/`d`/`points`/`pathLength` · `app-region` / tap / appearance / user-select
4. persist — `-webkit-text-fill/stroke*` · `-webkit-background-clip` · `-webkit-box-orient/direction`
5. chat — fullwidth `・`/`･` middle-dot chrome · `@starting-style` opacity dump
6. kit/flow — thin bdi/code keep · fill+path · set7/8 combo·closure 회귀

**검증:** chat-leak-probe-round106–120

## 직전 루프 (루프79–88 / round96–105)

1. persist — `scroll-timeline`/`view-timeline` shorthand
2. persist — `-webkit-line-clamp` · `color-adjust`
3. persist — `hyphenate-limit-before/after` · `base-palette`/`override-colors`
4. persist — `page`/`marks` · `shape-inside` · `calc-size`
5. persist — SVG `fill`/`stroke`(+opacity/geometry) · `speak*`/`user-modify`
6. chat — `@scroll-state` framework cutter harden
7. kit — thin `padding-block:0.5ic` accent keep · set5 combo 회귀

**검증:** chat-leak-probe-round96–105

## 직전 루프 (루프74–78 / round91–95)

1. persist — `padding-block`/`padding-inline`(+start/end) ≥1ic/ric kit bind
2. persist — `font-synthesis-weight/style/small-caps/position` flow
3. persist — `text-size-adjust` · `-webkit-text-size-adjust` · `text-wrap-mode/style`
4. persist — `initial-letter-align/wrap` · `math-shift` · `hyphenate-limit-lines`
5. persist — selective `rt`/`rp`/`rtc` kit · `ascent/descent/line-gap/size-adjust` · `forced-colors-adjust` · `font-display`

**검증:** chat-leak-probe-round91–95

## 직전 루프 (leftover open/top-up)

1. verify / usable / seed recover — leftover catalog example은 미리보기·LOOK seed 복구로 쓰지 않음
2. top-up — leftover prior에 append하지 않음. incoming leftover는 skip
3. preview — transform step은 slide/track/authored 폭

**검증:** verify leftover · srcdoc report chrome · project-view leftover top-up

## 직전 루프 (루프73 / round90)

1. persist — border-image+counter combo 회귀

**검증:** chat-leak-probe-round90

## 직전 루프 (루프72 / round89)

1. chat — `@scroll-state` dump cutter 회귀

**검증:** chat-leak-probe-round89

## 직전 루프 (루프71 / round88)

1. persist — padding ≥1ric kit bind

**검증:** chat-leak-probe-round88

## 직전 루프 (루프70 / round87)

1. chat — MASK/STROKE generic chrome 회귀

**검증:** chat-leak-probe-round87

## 직전 루프 (루프69 / round86)

1. persist — text-anchor/kerning flow

**검증:** chat-leak-probe-round86

## 직전 루프 (루프68 / round85)

1. persist — bookmark/footnote flow

**검증:** chat-leak-probe-round85

## 직전 루프 (루프67 / round84)

1. persist — nav/spatial-navigation flow

**검증:** chat-leak-probe-round84

## 직전 루프 (루프66 / round83)

1. persist — flood/stop/lighting flow

**검증:** chat-leak-probe-round83

## 직전 루프 (루프65 / round82)

1. persist — stroke/fill presentation flow

**검증:** chat-leak-probe-round82

## 직전 루프 (루프64 / round81)

1. persist — mask/mask-border flow

**검증:** chat-leak-probe-round81

## 직전 루프 (루프63 / round80)

1. persist — padding ≥1ic kit bind

**검증:** chat-leak-probe-round80

## 직전 루프 (루프62 / round79)

1. persist — brown/snow named invent frames

**검증:** chat-leak-probe-round79

## 직전 루프 (루프61 / round78)

1. chat — `@scroll-state` 스크럽

**검증:** chat-leak-probe-round78

## 직전 루프 (루프60 / round77)

1. persist — counter/contain-intrinsic/content/quotes flow

**검증:** chat-leak-probe-round77

## 직전 루프 (루프59 / round76)

1. persist — border-image flow

**검증:** chat-leak-probe-round76

## 직전 루프 (루프58)


1. clone — demo-banner/TOC/simple-deck 잔여 삭제. `#total` 동기화. persist heal도 demo chrome 제거
2. preview — `#slideCounter`/`#counter` 동기화. authored 1920px translate. hoist prune이 chrome 유지
3. daemon — leftover 데모 시드는 깨끗한 재클론으로 교체

**검증:** template-clone-fill · srcdoc-deck-bridge-transform-driven · compact-api-stacked-deck · template-clone-deck

## 직전 루프 (persist leftover catalog example)

1. persist — 사용자 브리프와 다른 Hartfield/DCF 예제를 `unfilled-catalog-example`로 거절
2. fill — 예제 고유명·표 REPLACE. leftover DCF 제목에 주제를 이어 붙이지 말 것

**검증:** deckLooksLikeUnfilledCatalogExample · project-view persist source

## 직전 루프 (루프57)

1. clone — placeholder brief가 IB pitch-book DCF/Hartfield/WACC 데모 카피를 남기지 않음. `maxSlides` 패딩도 placeholder 본문에서는 끔
2. preview — `#stage` 1920px 스트립은 sibling hide를 건너뛰고 slide width(px)로 이동. `#now`/`#total` 동기화

**검증:** template-clone-fill · srcdoc-deck-bridge-transform-driven · compact-api-stacked-deck

## 직전 루프 (루프56 / round75)

1. persist — font-variant · text-orientation flow 복사

**검증:** chat-leak-probe-round75 · round74 · deck-fixed-canvas

## 직전 루프 (루프55 / round74)

1. persist — cursor · scrollbar · text-edge/margin-trim flow 복사

**검증:** chat-leak-probe-round74 · round73 · deck-fixed-canvas

## 직전 루프 (루프54 / round73)

1. persist — border-radius · grid-column/row flow 복사

**검증:** chat-leak-probe-round73 · round72 · deck-fixed-canvas

## 직전 루프 (루프53 / round72)

1. persist — background/transform/transition/animation/offset flow 복사

**검증:** chat-leak-probe-round72 · round71 · deck-fixed-canvas

## 직전 루프 (루프52 / round71)

1. persist — margin/inset longhand · outline/border-block · scroll-*-start flow

**검증:** chat-leak-probe-round71 · round70 · deck-fixed-canvas

## 직전 루프 (루프51 / round70)

1. persist — scroll-padding-top · overflow-block flow 복사

**검증:** chat-leak-probe-round70 · round69 · deck-fixed-canvas

## 직전 루프 (루프50 / round69)

1. persist — math/mrow kit bind · scroll-padding/margin longhand flow

**검증:** chat-leak-probe-round69 · round68 · deck-fixed-canvas

## 직전 루프 (루프49 / round68)

1. chat — 2글자 ALLCAPS track (`UX 2 · RESEARCH`) 캐치올
2. persist — caret-animation/text-spacing flow 복사

**검증:** chat-leak-probe-round68 · round64 · deck-fixed-canvas

## 직전 루프 (루프48 / round67)

1. persist — form kit bind · font-palette/wrap flow 복사

**검증:** chat-leak-probe-round67 · round66 · deck-fixed-canvas

## 직전 루프 (루프47 / round66)

1. chat — `@custom-selector`/`@view-transition` 스크럽
2. persist — corner-shape/text-box/anchor-center flow 복사

**검증:** chat-leak-probe-round66 · round65 · deck-fixed-canvas

## 직전 루프 (루프46 / round65)

1. chat — `@custom-media`/`@stylistic` 스크럽
2. persist — address/hgroup/search · data/meter/progress/ruby kit bind

**검증:** chat-leak-probe-round65 · round64 · deck-fixed-canvas

## 직전 루프 (루프45 / round64)

1. chat — generic ALLCAPS track (`FOOXYZ 1 · XYZ`) 캐치올

**검증:** chat-leak-probe-round64 · round63

## 직전 루프 (루프44 / round63)

1. chat — WIRE/SPRINT/USABILITY 접미사 캐치올
2. persist — scroll-marker/interactivity/contrast-color flow 복사

**검증:** chat-leak-probe-round63 · round62 · deck-fixed-canvas

## 직전 루프 (루프43 / round62)

1. chat — KEYVISUAL/TOKENS/THEME 접미사 캐치올
2. persist — animation-range/column-rule flow 복사

**검증:** chat-leak-probe-round62 · round61 · deck-fixed-canvas

## 직전 루프 (루프42 / round61)

1. chat — REEL/STORY/PODCAST/FAQS 접미사 캐치올
2. persist — masonry/baseline/paint-order flow 복사

**검증:** chat-leak-probe-round61 · round60 · deck-fixed-canvas

## 직전 루프 (루프41 / round60)

1. chat — PORTFOLIO/PITCH/TEASER 접미사 · `@annotation`/`@namespace` 스크럽
2. persist — position-area/mask/text-box/initial-letter flow 복사

**검증:** chat-leak-probe-round60 · round59 · deck-fixed-canvas

## 직전 루프 (루프40 / round59)

1. chat — DASHBOARD/STORYBOARD 접미사 · 잘린 `prop:` CSS 스크럽
2. persist — text-emphasis/field-sizing/reading-flow flow 복사

**검증:** chat-leak-probe-round59 · round58 · deck-fixed-canvas

## 직전 루프 (루프39 / round58)

1. chat — LABEL/AVATAR/CAPTION/TABLEAU 접미사 캐치올
2. persist — float/break/orphans/shape-outside flow 복사

**검증:** chat-leak-probe-round58 · round57 · deck-fixed-canvas

## 직전 루프 (루프38 / round57)

1. chat — GALLERY/STEPPER/COMMENT 접미사 · `@scroll-timeline`/`@position-try` 스크럽
2. persist — padding-block/list-style/table-layout flow 복사

**검증:** chat-leak-probe-round57 · round56 · deck-fixed-canvas

## 직전 루프 (루프37 / round56)

1. chat — WEEK/CHAPTER/SLIDE 접미사 · `@font-palette-values`/`@property` 스크럽
2. persist — font/text-align/color flow 복사

**검증:** chat-leak-probe-round56 · round55 · deck-fixed-canvas

## 직전 루프 (루프36 / round55)

1. chat — BRIEF/SOLUTION/LAB/BEAT 등 피치 역할 접미사 캐치올
2. persist — overflow/offset-path/view-timeline/margin flow 복사 · props 중복 제거

**검증:** chat-leak-probe-round55 · round54 · deck-fixed-canvas

## 직전 루프 (루프35 / round54)

1. chat — HERO/KPI/COVER/SECTION 등 덱 역할 접미사 캐치올
2. persist — position/inset/aspect-ratio/background/view-transition flow 복사

**검증:** chat-leak-probe-round54 · round53 · deck-fixed-canvas

## 직전 루프 (루프34 / round53)

1. chat — MODAL/CHART/IMAGE/VIDEO 등 위젯·미디어 접미사 캐치올
2. persist — perspective/will-change/scroll-margin/print-color-adjust flow 복사

**검증:** chat-leak-probe-round53 · round52 · deck-fixed-canvas

## 직전 루프 (루프33 / round52)

1. chat — VIEW/HOST/PANEL/CARD 등 접미사 캐치올 확장 (`{0,28}`)
2. persist — scroll-snap/isolation/contain/user-select 등 flow 복사

**검증:** chat-leak-probe-round52 · round51 · round50 · deck-fixed-canvas

## 직전 루프 (루프32 / round51)

1. chat — `*BTN`/`*CTRL`/`*STATE` 접미사 leftover 캐치올 (토큰 나열 없이)
2. persist — container-type/name/container flow 복사

**검증:** chat-leak-probe-round51 · round50 · round48

## 직전 루프 (루프31 / round50)

1. chat — DRAGDROP/HITAREA/IFRAME 등 제스처·박스·호스트 트랙 숨김
2. persist — `grid:` 단축 · `justify-self` flow 복사 스펙 고정

**검증:** chat-leak-probe-round50 · round49 · deck-fixed-canvas

## 직전 루프 (루프30 / round49)

1. persist — flow wrap이 column-count/columns/place-items/flex-grow/writing-mode 복사
2. chat — ACTIONBAR/EMPTYSTATE/DATAGRID 등 바·상태·그리드 트랙 숨김

**검증:** chat-leak-probe-round49 · round48 · deck-fixed-canvas

## 직전 루프 (루프29 / round48)

1. chat — ICONBTN/SEGMENT/COMMANDPALETTE 등 버튼·컨트롤·필드 트랙 숨김
2. persist — table/td/th/thead는 card-like padding일 때만 kit bind (svg 미바인드)

**검증:** chat-leak-probe-round48 · round47

## 직전 루프 (루프28 / round47)

1. chat — TOCENTRY/HASHTAG/DOWNLOADBTN 등 TOC·소셜·툴바 트랙 숨김
2. persist — aliceblue/chartreuse/darkgray 등 잔여 CSS named invent 프레임을 kit bind

**검증:** chat-leak-probe-round47 · round46 · round35

## 직전 루프 (루프27 / round46)

1. chat — AXIS/KPISTRIP/SPLITVIEW/MAGNIFIER 등 축·KPI·비교 트랙 숨김
2. 본문형 `AXIS 범위…`는 유지

**검증:** chat-leak-probe-round46 · round45

## 직전 루프 (루프26 / round45)

1. chat — SPARKLINE/DROPCAP/FUNNEL/GLOSSARY 등 타이포·차트·인쇄·콜아웃 트랙 숨김
2. 본문형 `FUNNEL 지표…`는 유지

**검증:** chat-leak-probe-round45 · round44 · round40

## 직전 루프 (루프25 / round44)

1. chat — LETTERBOX/ZINDEX/SVG/GLITCH 등 필름·CSS·그래픽 트랙 숨김
2. persist — cite/q/kbd/samp/small/abbr/dfn은 card-like padding일 때만 kit bind
3. a/button/strong은 CTA·본문이라 미바인드

**검증:** chat-leak-probe-round44 · round43 · round42

## 직전 루프 (루프24 / round43)

1. chat — BLEED/PARALLAX/DRAFT/TODO 등 인쇄·모션·WIP 트랙 숨김
2. persist — card-like padding에 ≥8pt / ≥4mm / ≥0.4cm (thin `2pt`/`1mm` 유지)
3. persist — h1–h6/mark/time는 card-like padding일 때만 kit bind

**검증:** chat-leak-probe-round43 · round42 · round41

## 직전 루프 (루프23 / round42)

1. chat — RIBBON/WATERMARK/SCRIM/DIVIDER/CONTAINER 등 장식·래퍼 트랙 숨김
2. persist — card-like padding에 ≥2lh/cap/ex/ic/vb/vi (thin `1lh` 유지)
3. persist — fieldset/legend/dialog/menu는 card-like padding일 때만 kit bind

**검증:** chat-leak-probe-round42 · round41 · round40

## 직전 루프 (루프22 / round41)

1. chat — SPLIT/SURFACE/GRADIENT/GLASS/SHADOW 등 분할·서피스 트랙 숨김
2. persist — card-like padding에 ≥2cqw/cqh/cqi/cqb (thin `1cqw` 유지)
3. persist — details/summary/label/output는 card-like padding일 때만 kit bind

**검증:** chat-leak-probe-round41 · round40 · round39 · round38

## 직전 루프 (루프21)

1. 호스트 `flex-direction` / `flex-wrap` / `flex-flow`를 flow wrap에 복사
2. `col-left`+`col-right`는 row clip (split과 동일). persist-split 없음

**검증:** deck-fixed-canvas · deck-template-look-css · deck-pdf-export

## 직전 루프 (루프20)

1. split-* 슬라이드도 `[data-od-slide-flow]` clip — Motif sibling, `.slide` overflow 없음
2. split-left/right는 row, split-top/bottom은 column. 호스트 padding/gap/grid 복사
3. persist-split 없음

**검증:** deck-fixed-canvas · deck-template-look-css · deck-pdf-export

## 직전 루프 (루프19)

1. dump fallback은 첫 줄 한글 상태를 마침표 포함 유지 (`초안.`/`진행.` 포함)
2. 같은 줄 glue-cut은 가장 긴 상태 접두어 (`완료됨.` > `완료`)
3. opener dump만 마침표 제거

**검증:** chat-leak-probe-round40 · round26 · round24 · round10 · agent-prose-sanitize

## 직전 루프 (round40 / 루프18)

1. leftover slide-count APPEND는 본문에서 지우고, `producedFiles`가 있으면 행만 유지
2. fail-closed sanitizer는 짧은 한글 완료 문장 유지
3. chat — TOOLTIP/CALLOUT/COMMENT/LOGO/SKELETON/PAGINATION 등 오버레이·브랜드 트랙 숨김
4. persist — card-like padding에 ≥2vh/vw/vmin/vmax/dvh 추가 (thin `1vh`/`1.5vw` 유지)

**검증:** chat-leak-probe-round40 · chat-message-render · chat-events-display · sanitize-persisted-assistant-fail-closed · deck-fixed-canvas

## 직전 루프 (incomplete-shell 2차)

1. persist — MiniMax가 `<body>` 다음 미종료 `<style>` 키트를 800자 덤프하면 CSS가 본문으로 잡혀 커버 초안이 스킵되고, prepare가 스타일을 지운 뒤 truncation salvage도 null → `incomplete-html-document-shell`
2. persist — 불완전 셸 skip 직전에 최후 1920 커버를 강제 저장

**검증:** salvage-truncated body+unclosed style · tiny doctype · CSS-comment fake slide · project-view persist last-resort

## 직전 루프 (round39 / 루프17)

1. chat — AVATAR/CHIP/DROPDOWN/DASHBOARD/CANVAS 등 컨트롤·대시보드 트랙 숨김
2. persist — card-like padding에 ≥4% · ≥2ch 추가 (thin `2%`/`1.5ch` 유지)

**검증:** contracts chat-leak-probe-round39 · round38 · round37 · deck-fixed-canvas

## 직전 루프 (round38 / 루프16)

1. chat — GALLERY/MODAL/TAB/FORM/BUTTON/WIDGET 등 UI 위젯 트랙 숨김
2. persist — card-like padding에 ≥0.75rem/em 포함 (thin `0.25rem` 유지)

**검증:** contracts chat-leak-probe-round38 · round37 · deck-fixed-canvas

## 직전 루프 (round37 / 루프15)

1. chat — LAYOUT/HERO/NAV/BADGE/ICON/FIGURE 등 UI 역할 트랙 숨김
2. persist — `p`/`span`/`h2–h4`/`figcaption`은 padding ≥12px일 때만 kit 카드 바인딩
3. persist — 얇은 padding 본문 액센트 프레임은 유지

**검증:** contracts chat-leak-probe-round37 · round36 · round35 · deck-fixed-canvas

## 직전 루프 (루프14)

1. auto-continue · 시스템 streaming rule · persist short-draft/regression을 first-fill 6장에 맞춤
2. chat — SCREEN/TASK/WORKSHOP/DECK/MOTIF를 round35 역할 트랙에 합침
3. 스트리밍 preview — 제목 있는 슬라이드가 닫히면 official look heal (`</html>` 대기 없음)

**검증:** resume · deck-html-content · persist-result · chat-leak-probe-round35 · chat-events-display · deck-preview-official-look-heal · system-prompt-api-mode

## 직전 루프 (round36 / 루프13)

1. chat — OVERVIEW/PROBLEM/KPI/CTA/ROADMAP/COMPARE 등 피치 덱 역할 트랙 숨김
2. debris — Hangul 없는 단독 `prop: value;` CSS 선언 줄 스크럽
3. persist — firebrick/orangered/khaki/slategray 등 named 1–2px 프레임을 kit 카드로 바인딩

**검증:** contracts chat-leak-probe-round36 · round35 · round34 · round29 · round28 · deck-fixed-canvas

## 직전 루프 (round35 / 루프12)

1. chat — HOOK/OUTRO/AGENDA/COVER/TAKEAWAY/QNA/TIP/EXAMPLE 등 역할 트랙 숨김
2. persist — coral/tomato/rebeccapurple/gold 등 named 1–2px 프레임을 kit 카드로 바인딩
3. persist — main/header/footer/blockquote/nav/ul/ol/dl/dt/dd 호스트 확장 (p/span 제외)

**검증:** contracts chat-leak-probe-round35 · round34 · round33 · deck-fixed-canvas

## 직전 루프 (round34 / 루프11)

1. chat — QUOTE/ASIDE/CALL/HINT/FAQ/LAB/DEMO/DRILL/INDEX/TOC/MAP/BRIEF 트랙 숨김
2. soft-CSS — light-dark/device-cmyk debris 줄 스크럽
3. persist — device-cmyk · light-dark 1–2px 프레임을 kit 카드로 바인딩

**검증:** contracts chat-leak-probe-round34 · round33 · round32 · deck-fixed-canvas

## 직전 루프 (round33 / 루프10)

1. chat — APPENDIX/TABLE/TOPIC/TRACK/PANEL/CARD/BEAT/LESSON/CLIP/ROUND/PASS/NOTE 트랙 숨김
2. persist — `hwb()` 1–2px 프레임을 kit 카드로 바인딩 (outline oklch 회귀)

**검증:** contracts chat-leak-probe-round33 · round32 · round31 · round30 · round28 · deck-fixed-canvas

## 직전 루프 (round32 / 루프9)

1. chat — UNIT/STEP/MODULE/SECTION/ACT/SCENE/PHASE/EPISODE/BLOCK/FRAME/SESSION 트랙 숨김
2. soft-CSS — oklab/lab/color() debris 줄 스크럽
3. persist — oklch/oklab/lab/lch/color/color-mix + emerald/amber 1–2px 프레임을 kit 카드로 바인딩

**검증:** contracts chat-leak-probe-round32 · round31 · round30 · deck-fixed-canvas

## 직전 루프 (루프8)

1. type-lock — `.slide { font-family }`가 있어도 display heading lock 유지
2. persist — official look 있을 때 slide 호스트 inline `font-family` 제거
3. verify — Motif-SVG hang / low-substance disk HTML 거부

**검증:** deck-template-look-css · deck-fixed-canvas · slide-deliverable-recovery

## 이번 루프 (루프9)

1. first-fill THIS TURN을 3장 고정에서 요청 1–6장(미지정 6)으로 변경
2. reattach/reload는 hidden APPEND를 다시 큐하지 않음
3. sanitized leftover(`The / Keep / APPEND`)를 user·assistant 행에서 숨김

**검증:** templateCloneContentFill · slideCountTopUp · chat-message-render · deck-framework-compact

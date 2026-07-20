# OD upstream main 반영 검토

**판단 시점:** 2026-07-20 현재.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 3. `5f411466b` QuestionsPanel submit lock 핵심을 Teamver의 단순화된 form 구조에 맞춰 수동 포팅했다. Continue/Skip/auto countdown이 같은 form occurrence에서 중복 제출을 만들지 않도록 첫 submit 직후 UI와 chokepoint를 잠근다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 2. `21f25cde5` composer placeholder carousel caret 보정은 CSS 한정 변경이라 안전하게 수동 포팅했다. 빈 composer에서 decorative caret와 native caret가 동시에 깜박이는 UX 노이즈를 줄인다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 1. `3e5725e54`, `188ae72f8` question-form parser 안정화는 Teamver 채팅 마크업 비노출 이슈와 직접 연결되어 수동 포팅했다. 반면 `cdffb1b63` library ingest SSRF 차단은 현재 Teamver staging에 동일 library ingest route가 활성 경로로 존재하지 않아 이번 루프에서는 적용하지 않았다.
**반영 갱신:** 2026-07-20 — 로컬 `upstream/main` 최신 `f13ed2cb7 landing-page: enrich and redesign the codex-design page (#5872)` 기준으로 prompt/cache·작업 속도 후보를 추가 재검토했다. `9b5cdd843`의 connected-MCP directive cache 분리는 Teamver run 구조에 맞춰 수동 포팅했다. `ed48a7d22` transient ACP persistence filter는 이미 Teamver `server.ts` 경로에 반영되어 있어 중복 적용하지 않았다.
**반영 갱신:** 2026-07-20 — `origin/main` 최신 `3447f60a3 fix packaged payload desktop handoff (#5678)` 기준으로 속도·프롬프트 관련 후보를 재검토했다. 전체 merge 금지 원칙은 유지한다. 보류했던 `4b660237c`는 문구 단위로 다시 검토해 안전한 축약 문구만 수동 포팅했다.
**반영 갱신:** 2026-07-16 — `git fetch origin main` 후 `origin/main` 최신 상태를 재확인했다. Teamver `staging`에는 Drive 인증/HA, S3/preview/cache, background run, 다운로드 안정화 패치가 계속 누적되어 있으므로 전체 merge 위험도는 여전히 높다.
**비교 기준:** `staging` (`10b0ba491 fix(export): prefer screenshot pptx fidelity by default`) ↔ `origin/main` (`94a5bd2e0 fix BYOK OpenCode permission bypass (#5701)`).
**결론:** 공식 OD 최신 `main` 전체를 Teamver `staging`에 merge하지 않는다. Teamver 기존 동작을 깨지 않도록, 필요한 커밋만 수동 포팅한다.

---

## 0. 2026-07-16 현재 main 상태 요약

### 2026-07-20 속도·프롬프트 후보 재검토

| 커밋 | 내용 | 현재 판단 |
|------|------|-----------|
| `ed48a7d22` | `fix(daemon): filter transient ACP status events at persistence time` | **2026-07-20 선별 반영.** staging에는 별도 `chat-run-messages.ts`가 없어 `server.ts` 내 persistence 함수에 수동 포팅. 빈 process row와 불필요한 DB event write를 줄인다. |
| `9b5cdd843` | `fix(daemon): move connected-MCP directive out of the cached system prompt` | **2026-07-20 선별 반영.** 연결된 외부 MCP 서버 목록은 OAuth token/live connection state에 따라 바뀌므로 cacheable system prompt에서 제거하고 run instruction slice에만 주입하도록 수동 포팅했다. 큰 system prompt cache invalidation을 줄여 재시도/연속 작업의 시작 지연과 token overhead를 낮춘다. |
| `3e5725e54` / `188ae72f8` | question-form false-positive open tag 복구 / array payload 렌더 | **2026-07-20 선별 반영.** 채팅 prose 안의 `<question-form>` 언급이 실제 form을 삼키는 문제와 배열형 payload가 raw JSON으로 보이는 문제를 막는다. malformed completed block은 raw markup 대신 안전 fallback으로 대체한다. |
| `21f25cde5` | composer placeholder carousel native caret 숨김 | **2026-07-20 선별 반영.** CSS 한정 변경. 빈 composer placeholder animation 중 native caret가 함께 깜박이는 시각적 노이즈를 줄인다. |
| `5f411466b` | QuestionsPanel Continue 중복 제출 방지 | **2026-07-20 선별 반영.** Teamver `QuestionsPanel` 구조에 맞춰 submit lock만 포팅했다. 질문 form 답변 제출 직후 버튼을 즉시 disabled/busy로 바꿔 중복 run enqueue와 사용자의 stuck 오해를 줄인다. |
| `a1b0dd0d7` 계열 | POSIX argv prompt budget 보정 | **2026-07-20 선별 반영.** Linux/macOS에서 Windows용 30KB prompt argv 제한을 그대로 적용하는 false-positive를 줄인다. runaway prompt는 120KB에서 fail-fast 유지. |
| `4b660237c` | `feat(prompts): land the slim system-prompt line as the default charter` | **2026-07-20 부분 반영.** 전체 slim charter/core prompt 전환은 계속 보류. 단, 비미디어 프로젝트에 주입되던 긴 media dispatcher Bash loop 예시를 축약하고, zh-CN quick brief의 broad non-deck 선택지 예시를 scope-neutral 문구로 교체했다. Teamver deck-only UX와 background/comment 패치에 닿는 구조 변경은 반영하지 않음. |
| `04236af50` | `fix(daemon): scan user-authored text only and latch intent signals per conversation` | **P1 후보.** 의도 감지/프롬프트 안정성에 도움 가능성이 있으나 DB/server run state 변경이 커서 background/comment run 회귀 테스트 확보 후 검토. |

`origin/main`은 현재 `94a5bd2e0 fix BYOK OpenCode permission bypass (#5701)`까지 반영되어 있다. `staging...origin/main` divergence는 `703 / 586`으로, 2026-07-15 기준 `665 / 410`보다 더 벌어졌다. 이 상태에서 전체 merge는 Teamver 전용 인증, S3/DB 저장, Drive, background run, export cache 정책을 회귀시킬 가능성이 높다.

최근 `origin/main`에서 Teamver AI Design에 바로 검토 가치가 있는 변경은 다음이다.

| 커밋 | 내용 | 현재 판단 |
|------|------|-----------|
| `cdffb1b63` | `fix(daemon): block SSRF in library ingest remote fetch` | **P0 보안 후보.** Teamver에서 URL 기반 분석/web-fetch/라이브러리 ingest를 제공하거나 재활성화할 때 반드시 필요한 방어선이다. 다만 Teamver BFF/auth와 SSRF allow/deny 정책을 대조해 수동 포팅한다. |
| `b5d9a12f4` | `fix(web): break redirect-loop scripts that freeze the HTML preview` | **2026-07-16 선별 반영.** 생성 HTML이 redirect-loop script를 포함할 때 preview가 멈추는 문제를 막는다. exportDocument에는 주입하지 않아 다운로드/내보내기 결과물에는 영향이 없도록 했다. |
| `24c7876b3` | `fix(web): preserve delivery for in-place HTML edits` | **P1 후보.** 댓글/수정 요청 후 in-place HTML edit delivery가 보존되는지 확인할 가치가 있다. Teamver background/reattach 패치와 충돌 가능성이 있어 ProjectView 전체 cherry-pick은 금지. |
| `88c238ec7` | `fix(web): reveal rendered deck thumbnails` | **2026-07-16 검토 후 보류.** upstream의 `DeckThumbnailRail.tsx` 기반 패치인데 현재 Teamver `staging`에는 동일 컴포넌트가 없어 직접 포팅 대상이 아니다. 홈/프로젝트 목록 썸네일 문제는 Teamver의 별도 cover/cache 경로에서 따로 봐야 한다. |
| `498802189` | `fix: use baked previews for slide presets` | **2026-07-16 잔여 보강 반영.** baked preview 우선 로직은 이미 들어와 있었고, deck preset eager 전달 및 commercial slide baked preview 회귀 테스트를 추가했다. |
| `05cb03c8a` | `fix(web): sandbox the speaker-notes presenter deck iframes` | **P2 보안/격리 후보.** presenter notes 경로를 Teamver가 노출하지 않는다면 후순위. |
| `167db9de2` / `c67048516` | preview delivery status feedback/polish | **P2 UX 후보.** Teamver의 생성 중 이탈/재진입 UX와 맞닿지만, 먼저 background run 안정성 회귀 여부를 확인한 뒤 선별한다. |

**현재 바로 추진 추천:** 전체 merge 대신 `24c7876b3` in-place HTML edit delivery 보존, Community preview runtime fallback 잔여, intent signal latch(`04236af50`)를 순서대로 검토한다. `4b660237c` slim prompt는 문구 축약만 반영했으므로, full slim charter 전환은 실제 슬라이드 품질/댓글 수정/background 재진입 회귀 샘플을 확보한 뒤 판단한다. AtomCode, SiliconFlow, Vela CLI bump, MiniMax/media provider 계열은 Teamver AI Design 핵심 경로가 아니므로 보류한다.

---

## 0-1. 2026-07-15 main 상태 요약 기록

`main`은 현재 `7b9864614 feat(media): wire MiniMax image-01 through the minimax provider slot (#4563)`까지 반영되어 있다. `staging...main` divergence는 `665 / 410`으로, 2026-07-08 당시 `532 / 376`보다 더 벌어졌다.

확인 결과 `main`에는 **프로그램식 PPTX 다운로드/export 기능이 추가되어 있음**:

- `59bca72f7 feat(export): programmatic screenshot-based PPTX/PDF export (#4604)`
- daemon: `apps/daemon/src/deck-export.ts`, `/api/projects/:id/export/pptx`, `od export --format pptx`
- desktop: `apps/desktop/src/main/deck-capture.ts`의 `dom-to-pptx` 기반 editable PPTX 경로
- tests: `apps/daemon/tests/deck-export.test.ts`, `apps/daemon/tests/screenshot-export-file-handoff.test.ts`, `apps/daemon/tests/export-cli-routing.test.ts`

반면 `staging`에는 검토 당시 위 programmatic PPTX route가 없었다. `PptxGenJS` 관련 문구/프롬프트는 존재했지만, 사용자가 다운로드 메뉴에서 안정적으로 받을 수 있는 `/export/pptx` 구현은 미반영 상태였다.

**현재 판단:** PPTX 다운로드는 Teamver AI Design의 “슬라이드 결과물 다운로드” 핵심 기능과 직접 연결되므로 반영 후보로 격상한다. 다만 `59bca72f7` 단일 커밋도 66개 파일, 5천 줄 이상을 건드리며 desktop/sidecar/packaging/vendor까지 포함한다. Teamver 웹 배포형/daemon 기반 구조에는 그대로 cherry-pick하지 말고, **screenshot 기반 PPTX 최소 경로부터 수동 이식**한다.

**2026-07-15 적용 메모:** `staging`에는 전체 cherry-pick 없이 daemon/web 최소 경로만 수동 반영했다. 새 `pptxgenjs` dependency는 추가하지 않고, 이미 daemon이 사용하는 `JSZip`으로 PPTX OOXML package를 구성해 lockfile/배포 이미지 변경 리스크를 낮췄다.

## 1. 왜 전체 merge 금지인가

`staging`과 `main`은 크게 diverge되어 있다. 2026-07-15 검토 시점 기준 `git rev-list --left-right --count staging...main` 결과는 `665 410`이다.

즉 Teamver 전용 변경도 많고, 공식 OD 쪽 신규 변경도 많다. 공식 OD `main`에는 다음 성격의 변경이 섞여 있다.

- landing / SEO / packaged / updater / release 자동화
- agent-protocol / daemon server helper 대형 refactor
- AMR / onboarding / analytics / cloud balance gate
- media provider / MiniMax image 모델 추가
- export, preview, SSE, recovered run 등 Teamver 문제 영역과 맞닿는 수정

Teamver `staging`에는 별도 정책이 이미 들어가 있다.

- Teamver SSO / workspace / BFF auth 흐름
- `runtime-config` API key 비노출 + daemon managed key 사용
- S3/DB 저장, scratch materialization, registry create retry
- `/api/version`, `/api/runs`, session, analytics config 호출량 최적화
- OD 브랜딩/로컬 UX/마켓 기능 비노출
- slide-only embed gate, Community/template 제한
- Drive publish/import, 다운로드/내보내기 분기

따라서 공식 OD `main`을 그대로 merge하면 위 정책 중 일부가 되돌아가거나, 다시 불필요 API 호출·인증 redirect·S3 sync gap·UI 노출 회귀가 생길 수 있다.

---

## 2. 반영 후보

### P0 후보 — 백그라운드 run / 재진입 / SSE 안정성

Teamver에서 계속 문제가 되었던 영역과 직접 관련 있다.

| 커밋 | 내용 | 판단 |
|------|------|------|
| `9abba14fc` | `fix(chat): abort BYOK proxy upstreams when the client disconnects` | **2026-07-09 부분 적용.** explicit Stop abort signal을 upstream/tool loop에 전파. Teamver background 정책상 단순 탭 닫힘/페이지 이동 abort는 적용하지 않음. |
| `708cd0654` | `fix(web): catch SSE reader errors to enable reconnection` | **2026-07-09 적용.** SSE reader error 후 재연결 안정성 개선. |
| `8230a3a97` | `fix(web): keep consuming recovered daemon retries` | **2026-07-09 적용.** recovered retry stream을 계속 소비하도록 반영. |
| `f6fb7c204` | `fix(web): reattach spuriously-failed messages on reload when daemon run succeeded` | 강한 후보지만 위험도 높음. reload/re-entry 후 성공 run 메시지 재부착과 관련 있으나 `ProjectView.tsx` 대형 변경이다. |

**적용 방식:** cherry-pick 금지. `apps/web/src/providers/daemon.ts`, `apps/web/src/components/ProjectView.tsx`, `apps/web/src/runtime/chat-events.ts`를 Teamver 패치와 대조해 수동 포팅한다.

**검증 필수:**

1. 슬라이드 생성 중 프로젝트 상세 이탈.
2. 루트/다른 페이지 이동 후 동일 프로젝트 재진입.
3. input 버튼이 `중지`/진행 상태를 올바르게 표시.
4. 메시지가 이어서 갱신.
5. 완료 후 새로고침 없이 preview가 표시.
6. `teamver-bff/auth/session`, `/api/runs`, message `PUT` 호출량이 기존 Teamver 최적화 수준에서 회귀하지 않음.

---

### P0/P1 후보 — export print-ready handshake

| 커밋 | 내용 | 판단 |
|------|------|------|
| `20c61f773` | `fix(web): gate PDF print-ready handshake on a usable content size` | **2026-07-09 적용.** Teamver deck flatten/다운로드 fallback을 유지하며 print-ready usable size gate만 수동 병합. |

**적용 방식:** 수동 포팅. Teamver 다운로드/Drive 내보내기 분기와 충돌하지 않는지 확인한다.

**검증 필수:**

1. PDF 다운로드가 첫 페이지만 포함하지 않고 전체 deck을 포함.
2. 가로/세로 방향 수동 선택 없이 deck 비율이 올바름.
3. 불필요한 scrollbar UI가 PDF/image/html/zip에 남지 않음.
4. Drive 내보내기 결과와 다운로드 결과의 렌더링 차이가 커지지 않음.

---

### P0/P1 후보 — PPTX 다운로드/export 추가

| 커밋 | 내용 | 판단 |
|------|------|------|
| `59bca72f7` | `feat(export): programmatic screenshot-based PPTX/PDF export` | **2026-07-15 신규 격상 후보.** main에 PPTX 다운로드 기능이 추가되어 있으며, Teamver 슬라이드 결과물의 핵심 다운로드 포맷으로 가치가 높다. 다만 66개 파일/desktop/vendor/sidecar/packaging까지 포함하므로 전체 cherry-pick 금지. |
| `5a5431e3e` | `fix(daemon): recover PPTX export renderer failures` | PPTX route 도입 시 함께 검토. renderer 실패를 구조적으로 복구하는 후속 안정화 성격. |
| `5b8e3a25f` | `fix(desktop): keep CJK typefaces intact in editable PPTX export` | editable PPTX까지 도입할 경우 CJK/한글 폰트 품질 때문에 필요. 단, 1차 screenshot PPTX에는 후순위. |

**2026-07-16 적용 상태:** screenshot-based PPTX 최소 경로는 Teamver `staging`에 수동 반영 완료. 일반 `PPTX 다운로드`는 OD `main`과 동일하게 **미리보기 충실도 우선 screenshot PPTX**를 기본으로 사용한다. editable PPTX는 daemon hosted 환경용 실험 경로로 남겨두되, `editable:true`가 명시될 때만 사용한다. arbitrary HTML/CSS를 완전한 editable PPTX로 1:1 변환하는 것은 `dom-to-pptx` 한계가 있어 일반 다운로드 기본값으로 두지 않는다.

- ✅ daemon `buildScreenshotPptx` 최소 구현. 새 의존성 추가 없이 `JSZip` 기반 PPTX package 생성.
- ✅ `/api/projects/:id/export/pptx` route 추가.
- ✅ daemon `renderHeadlessEditablePptx` 추가. 단, 일반 PPTX 다운로드는 screenshot PPTX가 기본이며, `editable:true` 요청 시에만 native shape/text editable PPTX 경로를 사용한다.
- ✅ `dom-to-pptx` v2.0.1 MIT browser bundle을 daemon vendor에 포함. npm package의 Puppeteer/Chromium dependency는 설치하지 않는다.
- ✅ 기존 Teamver PDF/image export에서 보강한 inline HTML snapshot, S3/scratch sync 회피, auth gate, filename, export cache/ticket 흐름을 유지.
- ✅ FE 다운로드 메뉴의 `PPTX로 다운로드`는 기존 agent prompt 요청 대신 daemon rendered download로 연결.
- ✅ Drive로 내보내기와 혼동되지 않도록 “내 컴퓨터에 저장/다운로드” 그룹 안에만 노출.

**보류 범위:** OD `main`의 desktop renderer/sidecar/packaging 전체 cherry-pick은 계속 보류한다. Teamver hosted 환경은 desktop runtime이 없으므로, desktop Electron handoff를 그대로 가져오면 작동하지 않는다.

**검증 필수:**

1. 8~12장 HTML deck에서 PPTX 다운로드가 각 slide 1장씩 생성.
2. Google Slides/PowerPoint에서 미리보기와 유사한 시각 결과로 열린다.
3. 한글/CJK 텍스트가 깨지지 않음. 일반 경로는 screenshot PPTX이므로 편집 가능성보다 fidelity를 우선한다.
4. PDF/image/html/zip 기존 다운로드가 회귀하지 않음.
5. 슬라이드 생성 직후 S3 sync 전후 상태에서 `/export/pptx`가 동일하게 동작.
6. 대형 deck에서 서버 CPU/메모리 부하가 PDF/image export보다 과도하게 증가하지 않음.
7. 실패 응답이 `EXPORT_FAILED`, `NO_SLIDES`, renderer unavailable 등으로 구조화되어 FE 토스트가 구분 가능.

---

### P1 후보 — Community / plugin preview 동기화

| 커밋 | 내용 | 판단 |
|------|------|------|
| `390fcf88f` | `fix(plugin-previews): keep Community gallery previews in sync with shipped plugins` | 반영 후보. Community template preview stale/missing 문제와 관련 있다. 단, bake pipeline/manifest/CI가 포함되어 런타임에 필요한 부분만 선별한다. |

**적용 방식:** 전체 cherry-pick 금지. `applyBakedPreviews`, preview manifest lookup, runtime gallery fallback에 필요한 부분만 확인한다.

**검증 필수:**

1. Community deck template 썸네일이 단색 blank처럼 보이지 않음.
2. preview modal에서 "예제 HTML을 가져오지 못했습니다"가 재발하지 않음.
3. Teamver embed에서 OD marketplace/불필요 Community 진입점 비노출 정책이 회귀하지 않음.

---

### P2 후보 — 작은 UI 안정화

| 커밋 | 내용 | 판단 |
|------|------|------|
| `4d2fb936e` | `Fix plugins flyout closing while typing in its search box` | 작고 안전한 편. plugin/search UX가 남아 있다면 후순위 반영 가능. |
| `b86537483` | `fix(web): clamp floating composer within scrolled preview bounds` | 작은 UI 보정. 현재 Teamver 핵심 장애보다 우선순위 낮음. |

---

## 3. 보류 / 비추천

| 커밋 | 내용 | 판단 |
|------|------|------|
| `91f22f301` | agent-protocol 대형 refactor | 보류. daemon 구조를 크게 바꾸므로 Teamver S3/DB/run lifecycle 패치와 충돌 위험이 크다. |
| `59bca72f7` 전체 cherry-pick | programmatic screenshot-based PPTX/PDF export 전체 커밋 | **전체 cherry-pick은 보류.** 다만 screenshot-based PPTX 최소 경로는 위 P0/P1 후보로 격상한다. desktop editable PPTX/vendor/sidecar/packaging은 후순위. |
| `7b9864614` | MiniMax image-01 provider wiring | 보류. 현재 Teamver AI Design은 slide/deck 안정화가 우선이며, image/media 기능은 embed MVP에서 낮은 우선순위 또는 비노출 영역이다. |
| landing / SEO / updater / packaged / AMR / onboarding 계열 | 공식 OD 제품/마케팅 변경 | Teamver staging 출시 안정화와 직접 관련 낮음. 반영하지 않는다. |

---

## 4. 권장 작업 순서

1. **P0:** `cdffb1b63`의 library ingest SSRF 차단을 Teamver daemon에 수동 포팅할 수 있는지 검토한다. URL 기반 분석/web-fetch/라이브러리 ingest는 외부 URL을 다루므로, 출시 전 보안 방어가 우선이다.
2. **P1:** `24c7876b3` in-place HTML edit delivery 보존 로직을 댓글 수정/재진입/background run 패치와 대조한다. `ProjectView.tsx` 전체 cherry-pick은 금지하고, delivery 보존에 필요한 최소 변경만 검토한다.
3. **P1/P2:** `4b660237c` slim system prompt/token 절약 패치는 전체 전환하지 않는다. 이미 안전한 문구 축약과 `9b5cdd843` prompt-cache 안정화는 반영했으므로, 남은 full slim charter 전환은 실제 슬라이드 생성 품질, 블록 비노출, Teamver managed key 흐름, 질문 form UX를 샘플로 검증한 뒤 별도 루프로 판단한다.
4. PPTX는 일반 다운로드 screenshot 기본 정책을 유지한다. editable PPTX는 별도 메뉴/고급 옵션을 만들기 전까지 일반 사용자 경로에 노출하지 않는다.
5. 모든 반영 후 `/api/version`, `/api/runs`, `auth/session`, `auth/refresh`, analytics config, message `PUT` 호출량이 회귀하지 않았는지 Network에서 확인한다.

---

## 5. 운영 원칙

- 공식 OD `main`은 reference branch로만 사용한다.
- Teamver `staging`에는 full merge, broad cherry-pick, refactor cherry-pick을 하지 않는다.
- Teamver 장애 이력과 직접 연결되는 커밋만 수동 포팅한다.
- 포팅 단위마다 문서와 테스트를 함께 갱신한다.
- 기존 동작에 영향이 있을 수 있는 경우 기능 추가보다 회귀 방지가 우선이다.

---

## 6. 다음 추천 작업

1. **P0:** `cdffb1b63` library ingest SSRF 차단을 먼저 검토한다. web-fetch/사이트 분석 기능을 출시하려면 외부 URL 접근 안전장치가 선행되어야 한다.
2. **P1:** `24c7876b3` in-place HTML edit delivery 보존 로직을 댓글 수정 플로우에 맞춰 최소 포팅 가능 여부만 확인한다.
3. **P1:** `04236af50` user-authored text only intent latch는 memory/run DB 경로 변경이 커서 바로 적용하지 말고, background/comment 재진입 회귀 테스트와 함께 별도 검토한다.
4. **P1/P2:** slim system prompt/token 절약 패치는 별도 품질 평가 루프를 먼저 만든다. 프롬프트 축소는 비용에는 유리하지만 Teamver slide 품질과 도구 호출 안정성을 동시에 흔들 수 있다.

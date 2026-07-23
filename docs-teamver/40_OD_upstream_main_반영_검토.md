# OD upstream main 반영 검토

**판단 시점:** 2026-07-23 현재.
**반영 갱신:** 2026-07-23 — 추가 검토 루프 20. `origin/main` 최신 `034c3895d fix(web): hide empty tool_call/tool_call_update status rows (#4621)` 기준으로 `staging`과의 divergence(`700 / 998`)를 재확인했다. 2026-07-21 이후 main에 합쳐진 daemon run 안정화·보안·export·artifact recovery 커밋을 우선순위별로 분류했고, **코드 포팅은 이번 루프에서 수행하지 않았다.** 전체 merge/cherry-pick 금지 원칙은 유지한다.
**반영 갱신:** 2026-07-21 — 추가 포팅 루프 19. `04236af50` intent signal latch는 전체 포팅하지 않았다. 현재 Teamver `composeSystemPrompt`는 upstream의 per-turn intent-gated stable blocks(`freeformDeckSignal` 등)를 쓰지 않고, `metadata.kind='deck'` + slide-only override + freeform conditional deck framework로 이미 다른 구조다. DB `intent_signals_json` migration/latch를 그대로 넣으면 background/session/cache 경로를 넓게 흔들 수 있어 보류했다. 대신 안전한 공통 부분인 `extractUserAuthoredSignalText`를 수동 포팅해, Research canonical query fallback이 packed transcript 전체(assistant discovery form/options/generated code)가 아니라 사용자 작성 텍스트만 사용하도록 좁혔다.
**반영 갱신:** 2026-07-21 — 추가 포팅 루프 18. `b86537483` floating composer clamp는 현재 Teamver `PreviewDrawOverlay` 구조와 대조한 결과 직접 포팅하지 않았다. upstream의 `computePreviewDrawDockLayout` 기반 floating dock 함수가 staging에는 존재하지 않고, 현재 Teamver는 portal toolbar/inline overlay 구조로 이미 달라져 있어 cherry-pick/재구현 시 오히려 회귀 위험이 크다. 대신 직전 `ComposerPlusMenu` search flyout 보정이 Escape/outside-click 닫힘을 깨지 않는지 회귀 테스트를 추가했다.
**반영 갱신:** 2026-07-21 — 추가 포팅 루프 17. `4d2fb936e` plugin flyout search 안정화 패치를 Teamver `ComposerPlusMenu` 구조에 맞춰 수동 포팅했다. 프로젝트 상세 composer의 `+ > 플러그인` 검색 중 목록 reflow가 synthetic `mouseleave`를 만들면 submenu close timer가 검색창과 preview column을 닫을 수 있었다. 이제 flyout 내부 search input이 focus를 가진 동안에는 hover-close를 무시하고, outside click/Escape/선택으로만 닫히도록 보정했다.
**반영 갱신:** 2026-07-21 — 추가 포팅 루프 16. Community preview runtime fallback 잔여를 Teamver 구조 기준으로 재검토했다. daemon `/preview` fallback chain은 이미 exampleOutputs와 shallow HTML discovery를 포함하므로 서버 대형 포팅은 하지 않았다. 대신 FE가 `examples/<name>/index.html`을 `/example/index`로 요청하던 모호성을 줄여 parent folder stem(`/example/<name>`)을 사용하도록 보정했고, Teamver embed에서 로컬 Open Design 실행 안내처럼 보이던 preview error body를 서비스형 문구로 정리했다.
**반영 갱신:** 2026-07-21 — 추가 포팅 루프 15. `cdffb1b63` library ingest SSRF 패치는 Teamver staging의 활성 web-fetch 경로와 대조했다. daemon `/api/tools/web-fetch`는 이미 `assertExternalAssetUrl` 기반 SSRF guard + redirect 차단을 사용하므로 route-level 대형 포팅은 불필요했다. 대신 실제 사용자 요청인 `teamver.com` / `www.teamver.com` 참고 요청이 fetch되지 않던 FE URL 추출 구멍을 수정해 bare 도메인을 `https://`로 정규화하고, 한국어 조사/문장이 URL path에 붙지 않도록 ASCII URL token만 인식한다. 이메일과 `.html` 파일명 오인은 테스트로 막았다. 같은 루프에서 web-fetch User-Agent의 OpenDesign 잔재를 Teamver 명칭으로 교체했다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 14. `24c7876b3` in-place HTML edit delivery 보존 패치 중 현재 Teamver 구조에 바로 맞는 안전 부분을 수동 반영했다. 기존 Claude 전용 `allowAnyHtmlWrite` blind fallback은 내용이 다른 same-turn HTML 파일도 결과물로 묶을 수 있어 queued/comment 수정 플로우에서 엉뚱한 파일을 열거나 완료로 표시할 위험이 있었다. 이제 같은 turn HTML write는 normalize된 실제 HTML 내용이 일치할 때만 recovered artifact로 인정한다. 호출부 호환성은 유지했다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 13. loop 11~12의 `endedWithUnfinishedWork` 신호를 pet/task center 최근 작업 요약까지 연결했다. succeeded run이라도 미완료 항목이 남아 있으면 최근 완료 목록에서 `incomplete` 상태로 보존하고 warning dot으로 표시해, background 작업 센터가 “완료됨”처럼 오인되는 경로를 줄였다. 기존 active running/queued grouping과 preview deep-link 흐름은 변경하지 않았다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 12. loop 11에서 daemon이 노출한 `endedWithUnfinishedWork`를 Teamver embed background completion surface에서 소비하도록 FE 최소 경로를 보강했다. succeeded run이라도 unfinished 신호가 있으면 toast/desktop notification을 “완료”가 아닌 “확인 필요/미완료 항목 있음”으로 표시하고, 성공음·성공 톤으로 오인하지 않게 했다. preview deep-link는 유지해 사용자가 생성된 결과물과 남은 작업을 바로 확인할 수 있다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 11. `bc5b6f058`의 전체 project-status/UI/DB 변경은 계속 보류하되, 핵심 run completeness 신호만 현재 Teamver run service에 수동 포팅했다. TodoWrite 최신 snapshot에 미완료 항목이 있거나 usage `stopReason=max_tokens`로 끝난 succeeded run은 `/api/runs` status와 terminal `end` event에 `endedWithUnfinishedWork:true`를 싣는다. 기존 `status:succeeded`는 유지해 호환성을 지키면서, background/re-entry UI가 “완료처럼 보이지만 실제로는 미완료” 상태를 구분할 수 있는 기반을 만든다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 10-A. `24c7876b3` in-place HTML edit delivery 보존 패치는 현재 Teamver `ProjectView` 구조와 직접 대응되지 않아 코드 포팅하지 않았다. upstream은 `computeTraceObjectFiles`/agent touched file path 기반인데, staging은 해당 경로가 제거되고 content match 기반 artifact recovery를 사용한다. 이후 댓글 수정 실패가 재현되면 Teamver의 `findSameTurnHtmlWriteForRecoveredArtifact`/preview comment attachment 경로에서 별도 보강한다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 10. `cfc6ae089` AMR/Vela API proxy pipe error guard를 현재 Teamver `server.ts` 구조에 맞춰 수동 포팅했다. upstream response reset 또는 client upload abort가 source stream `error`로 발생해도 unhandled exception으로 daemon이 죽지 않도록, 양방향 pipe에 명시적 error listener를 붙이는 helper와 회귀 테스트를 추가했다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 9. `443e31319` host-tool launch `shell:true` 제거 패치를 수동 포팅했다. 프로젝트 폴더를 로컬 editor/파일관리자로 여는 host-tool 경로에서 Windows shell metacharacter가 해석되지 않도록 `createCommandInvocation`을 사용하고, launch helper를 테스트 가능하게 분리했다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 8. `88b411efd`의 same-run retry process group reap 핵심을 Teamver 구조(`apps/daemon/src/runs.ts`, `apps/daemon/src/server.ts`)에 수동 포팅했다. retry/cancel/shutdown에서 direct child가 이미 종료된 뒤에도 process group에 남은 descendant를 신호할 수 있게 하고, same-run retry 시작 전 실패 시도의 process group을 정리해 orphan process 누적과 서버 부하를 줄인다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 7. `c23e158d8`, `489fda899`의 Claude stream false-success 방지 핵심을 Teamver daemon 구조(`apps/daemon/src/claude-stream.ts`, `apps/daemon/src/server.ts`)에 수동 포팅했다. Claude `is_error` result frame과 Task sub-agent `turn_end`를 성공 종료로 오인하지 않게 해 “작업은 끝난 것처럼 보이지만 결과/미리보기가 없는” 문제를 줄인다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 6. `4b4c7f402` empty agent output guidance를 수동 포팅했다. 빈 출력으로 run이 종료될 때 단순 로그 확인 안내에서 그치지 않고 재인증, 쿼터 확인, 모델 전환까지 다음 액션을 명시해 실패 후 재시도 판단을 빠르게 한다. 같은 루프에서 `5c4907add`, `2133796cd`, `5643d6431`은 이미 staging에 반영되어 있음을 재확인했고, `2192a7f6b`, `4ddfc6e44`, `bc5b6f058`은 변경 범위가 커 production 직전 수동 포팅 대상으로 보류했다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 5. `bdc66c978`, `ebada4cac` deck framework prompt 품질 보강을 daemon/contracts 양쪽에 수동 포팅했다. 데이터 차트는 실제 값 기반 `--v`/`--max` 계산을 요구하고, Mermaid는 다크 덱에서 theme/themeVariables를 명시하도록 고정해 슬라이드 결과물 품질 회귀를 줄인다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 4. `c110e40e8` frontmatter parser 안정화를 현재 Teamver parser 경로(`apps/daemon/src/frontmatter.ts`, `packages/plugin-runtime/src/parsers/frontmatter.ts`)에 수동 포팅했다. flush-left YAML sequence, quoted inline array, deep block scalar를 안정적으로 읽어 template/design-system metadata 누락을 줄인다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 3. `5f411466b` QuestionsPanel submit lock 핵심을 Teamver의 단순화된 form 구조에 맞춰 수동 포팅했다. Continue/Skip/auto countdown이 같은 form occurrence에서 중복 제출을 만들지 않도록 첫 submit 직후 UI와 chokepoint를 잠근다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 2. `21f25cde5` composer placeholder carousel caret 보정은 CSS 한정 변경이라 안전하게 수동 포팅했다. 빈 composer에서 decorative caret와 native caret가 동시에 깜박이는 UX 노이즈를 줄인다.
**반영 갱신:** 2026-07-20 — 추가 포팅 루프 1. `3e5725e54`, `188ae72f8` question-form parser 안정화는 Teamver 채팅 마크업 비노출 이슈와 직접 연결되어 수동 포팅했다. 반면 `cdffb1b63` library ingest SSRF 차단은 현재 Teamver staging에 동일 library ingest route가 활성 경로로 존재하지 않아 이번 루프에서는 적용하지 않았다.
**반영 갱신:** 2026-07-20 — 로컬 `upstream/main` 최신 `f13ed2cb7 landing-page: enrich and redesign the codex-design page (#5872)` 기준으로 prompt/cache·작업 속도 후보를 추가 재검토했다. `9b5cdd843`의 connected-MCP directive cache 분리는 Teamver run 구조에 맞춰 수동 포팅했다. `ed48a7d22` transient ACP persistence filter는 이미 Teamver `server.ts` 경로에 반영되어 있어 중복 적용하지 않았다.
**반영 갱신:** 2026-07-20 — `origin/main` 최신 `3447f60a3 fix packaged payload desktop handoff (#5678)` 기준으로 속도·프롬프트 관련 후보를 재검토했다. 전체 merge 금지 원칙은 유지한다. 보류했던 `4b660237c`는 문구 단위로 다시 검토해 안전한 축약 문구만 수동 포팅했다.
**반영 갱신:** 2026-07-16 — `git fetch origin main` 후 `origin/main` 최신 상태를 재확인했다. Teamver `staging`에는 Drive 인증/HA, S3/preview/cache, background run, 다운로드 안정화 패치가 계속 누적되어 있으므로 전체 merge 위험도는 여전히 높다.
**비교 기준:** `staging` (`ad03c0931 test(contracts): harden slide template prompt contracts`) ↔ `origin/main` (`034c3895d fix(web): hide empty tool_call/tool_call_update status rows (#4621)`).
**merge-base:** `f6ce40ead` (2026-06-15) — 이후 양쪽 모두 대규모 독립 변경.
**divergence:** `git rev-list --left-right --count staging...origin/main` → **`700 / 998`** (main 700 ahead, staging 998 ahead).
**결론:** 공식 OD 최신 `main` 전체를 Teamver `staging`에 merge하지 않는다. Teamver 기존 동작을 깨지 않도록, 필요한 커밋만 수동 포팅한다.

---

## 0. 2026-07-23 현재 main 상태 요약 (루프 20)

### 0.1 2026-07-21 이후 main 신규 커밋 (staging 미반영)

`git log staging..origin/main --since=2026-07-21` 기준 **43개** non-merge 커밋. 아래는 Teamver AI Design(staging) 관점에서 **적용 가치·위험도**를 재분류한 목록이다.

| 우선 | 커밋 | 내용 | Teamver 적용 판단 | 포팅 방안 |
|------|------|------|-------------------|-----------|
| **P0** | `7b27d4ba6` | canceled run이 late agent error에 의해 `failed`로 뒤집히지 않게 보정 | **강한 후보.** embed background run·명시적 Stop 후 상태 오인이 Teamver 이슈와 직결. | cherry-pick 금지. main은 `apps/daemon/src/runtimes/runs.ts` 구조인데 staging은 `apps/daemon/src/runs.ts` 단일 파일. `runtimeFailureObservedBeforeCancellation` 플래그·`waitForCanceledChildExit`·`server.ts` cancel/error 순서 보정만 수동 이식. |
| **P0** | `d1372da02` | daemon 재시작 후 run terminal reconcile | **강한 후보.** 2노드 HA·daemon container restart 후 `running` 고착·telemetry 누락 방지. | `run-terminal-reconciliation.ts` 신규 모듈 + `server.ts` boot hook. Teamver `runs.ts` 경로에 맞춰 import 경로 조정. analytics/Langfuse 연동은 Teamver telemetry 정책과 대조 후 최소만 반영. |
| **P0** | `4054b5357` | plain-stream artifact가 event ring buffer(2000) 초과 시 유실 방지 | **강한 후보.** 긴 plain-stream run에서 `<artifact>`가 ring에서 밀려 **결과물 미저장** 가능. slide 생성 실패·빈 preview와 연결. | `plain-stream.ts` + `server.ts` accumulator(8MiB head-biased) + ring fallback. Teamver artifact recovery·S3 sync 경로와 충돌 여부 확인. |
| **P0** | `34a050737` | recovered sub-agent in-stream error가 main run을 fail 처리하지 않음 | **후보.** 2026-07-20에 `489fda899` Task sub-agent `turn_end` 오인 방지를 이미 포팅. 본 커밋은 **in-stream error** 케이스 보완. | `claude-stream.ts` 최소 diff만. 기존 false-success/false-failure 테스트와 함께 회귀 검증. |
| **P0** | `5c94dda27` | 타 프로젝트 conversation으로 run 생성 거부 | **보안 후보.** multi-tenant·project hash 라우팅 환경에서 conversation/project 불일치 차단. | `routes/runs.ts`(staging 경로 확인)에 validation helper 추가. cross-project leak 테스트 이식. |
| **P0** | `cbc38a498` | plugin uninstall 시 plugin id path traversal 차단 | **보안 후보.** daemon이 plugin registry를 `rm`할 때 id 검증. embed에서 marketplace UI는 숨겨도 HTTP route는 살아 있음. | `installer.ts`/`registry.ts` id validator만 수동 포팅. |
| **P0** | `bb7a10d97` | imported folder가 home dotfiles 노출·`$HOME` import 차단 | **보안 후보.** folder import 경로가 Teamver에서 활성인지 확인 필요. 활성이면 P0. | `import-export-routes.ts` + `projects.ts` guard. Teamver S3 materialization과 충돌 없는지 확인. |
| **P0** | `ace06eac1` | image export 시 preview viewport 반영 | **후보.** Teamver PNG/JPEG 다운로드 품질(크롭/빈 여백) 직결. | `FileViewer.tsx` + `exports.ts` viewport 전달만. PDF/PPTX/screenshot PPTX 기존 경로 회귀 테스트 필수. |
| **P1** | `d997318f9` | marketplace add/refresh·plugin install fetch SSRF 차단 | **보안 후보.** staging `plugin-asset-cache.ts`에는 SSRF guard가 있으나 marketplace/installer fetch에는 **미적용**. | `plugin-asset-cache.ts`의 `assertSafePublicUrl` 재사용해 installer/marketplace fetch에 연결. embed UI 비노출과 무관하게 daemon SSRF 방어는 필요. |
| **P1** | `068c9ae83` | Anthropic-compatible BYOK base URL 정규화 | **조건부.** embed managed key가 주력이나 BYOK proxy 경로 존재. | `byok-opencode.ts` helper만. Settings/BYOK UI 비노출 정책과 충돌 없음 확인. |
| **P1** | `4fb217c95` | protocol downgrade 재저장 실패 시 loaded config 유지 | **후보.** embed `runtime-config`·protocol 설정 드리프트 시 UX 안정. | `apps/web/src/state/config.ts` 10줄 수준. typecheck + embed boot smoke. |
| **P1** | `d3e091e15` | deterministic failure 분류·retry attribution 보존 | **후보.** background retry·run recovery 표시 정확도. | `run-failure-classification.ts` + `runs.ts` 최소. Teamver `endedWithUnfinishedWork` 신호와 정합성 확인. |
| **P1** | `034c3895d` | 빈 `tool_call`/`tool_call_update` status row 숨김 | **후보.** 채팅 UI 노이즈 감소. 변경 2파일·저위험. | `AssistantMessage.tsx` filter 로직만. Teamver chat markup 정책과 충돌 없음. |
| **P1** | `85ec1b624` | deck thumbnail markup DOMPurify sanitize | **조건부.** staging에 `deck-thumbnail-parser.ts` **없음**. Teamver는 `ProjectCardHtmlCover` + srcDoc iframe 경로. | upstream parser 포팅보다 Teamver cover XSS surface(`ProjectCardHtmlCover`, `authenticatedHtmlSrcDoc`) 별도 감사 우선. 필요 시 DOMPurify를 Teamver cover 경로에만 적용. |
| **P1** | `7bc2b5948` | resumed run에 MCP prompt 전달 | **낮은 우선.** embed는 MCP UI 비노출(`embedDaemonFetchPolicy`). daemon route는 잔존. | MCP를 product scope에 다시 열 때 포팅. 현재는 보류 가능. |
| **P2** | `91a3df9a3` | dark-first brand canvas derived theme 보존 | **후순위.** custom design system 추출 품질. slide MVP 핵심 아님. | brand extraction 사용 시에만 검토. |
| **P2** | `40c394df0` | blocked preview asset error 표면화 | **UX 후보.** preview 실패 원인 가시성. | embed preview error copy 정책(`teamverEmbedVisuals`)과 통합 검토. |
| **P2** | `421ac5ad5` | model picker viewport anchor | **후순위.** embed model picker 노출 범위 제한적. | 재현 시 Teamver composer에만 국소 수정. |
| **P2** | `2fd9d8134` / `3a5c52931` | workspace tab label·home context picker token | **후순위.** embed home UX 미세 조정. | CSS/token 한정. 브랜딩 provider와 충돌 확인. |
| **P3** | `233793271` | GPT-5.5 Fast service tier | **보류.** managed key 모델 목록은 Teamver BE/runtime-config가 통제. | 모델 tier를 product에 노출할 때만. |
| **P3** | `df58a5f3d` / `4e8db9a9b` / `6fb644a57` | stable-prefix drift·retry provenance·turn index telemetry | **보류.** analytics/observability. 기능 회귀와 무관. | telemetry 요구 시 별도. |
| **—** | `d8b6b797f` | chat execution disclosures 대형 리팩터 | **보류(고위험).** `AssistantMessage`/`ChatPane`/`ToolCard` 등 20+ 파일. Teamver chat markup·embed 정책과 충돌 가능성 큼. | 전체 cherry-pick **금지**. 개별 UX 버그 재현 시 국소 패치만. |
| **—** | `2d1f25ac6` 계열 | message center 신규 기능 | **비적용.** Teamver embed에 message center 없음·노출 계획 없음. | 반영하지 않음. |
| **—** | packaged/desktop/landing/updater 계열 | `dcdb0c420`, `4fe8bb1db`, `447b18b98`, `c401b99fa`, `888d35ce9` 등 | **비적용.** Teamver는 hosted web+daemon Docker. Electron/packaged 경로 없음. | 반영하지 않음. |
| **—** | `1912c3ba9`, `5435274ab` | 신규 plugin (Atelier Zero, Humanize PPT) | **비적용.** embed slide MVP는 deck template gate·불필요 plugin 비노출. | marketplace 정책 변경 시 별도. |
| **—** | `3162da5f2`, `910e5d338` | test·release notes | **비적용.** 문서/테스트만. | — |

### 0.2 2026-07-23 권장 포팅 순서 (기존 동작 보호 우선)

기존에 잘 동작하는 embed 인증·S3 sync·background run·export·Drive publish를 **절대 회귀시키지 않는 것**이 최우선이다. 아래 순서는 **한 루프에 하나의 P0 테마**만 다루고, 각 단계마다 회귀 테스트를 통과한 뒤 다음으로 넘긴다.

1. **P0-A (run lifecycle):** `7b27d4ba6` → `34a050737` — cancel/false-failure/sub-agent error. 검증: 명시적 Stop, background reattach, `endedWithUnfinishedWork` 신호 유지.
2. **P0-B (artifact durability):** `4054b5357` — plain-stream artifact ring buffer 유실. 검증: 8~12장 deck 생성 후 artifact·preview·S3 sync.
3. **P0-C (daemon restart / HA):** `d1372da02` — run terminal reconcile. 검증: daemon container restart 후 `running` 고착 없음, 2노드 hash 라우팅.
4. **P0-D (security):** `5c94dda27` → `cbc38a498` → `bb7a10d97` → `d997318f9` — cross-project·path traversal·SSRF. 검증: 악의적 plugin id·내부 URL fetch 거부.
5. **P0-E (export):** `ace06eac1` — image export viewport. 검증: PNG/JPEG/PDF/PPTX 기존 다운로드 회귀 없음.
6. **P1 (저위험 UX):** `034c3895d` → `4fb217c95` → `d3e091e15` — 채팅 UI·config·failure taxonomy.
7. **보류 유지:** `d8b6b797f`, message center, packaged, `2192a7f6b` BYOK preflight, `4ddfc6e44` media retry.

### 0.3 루프 20에서 **코드를 포팅하지 않은** 이유

- divergence `700/998`로 structural drift가 크다(main은 `runtimes/runs.ts` 분리, staging은 `runs.ts` 단일).
- 최근 staging 작업(slide template 검증, Drive import reference, background recovery)과 **동시에 daemon 대형 변경을 넣으면 회귀 원인 분리가 불가능**.
- 본 루프는 **검토·우선순위·포팅 방안 문서화**만 수행. 실제 코드 반영은 위 0.2 순서의 **단일 P0 테마 단위**로 별도 루프에서 진행.

### 0.4 루프 20 회귀 검증 체크리스트 (포팅 시 필수)

| # | 시나리오 | 확인 |
|---|----------|------|
| 1 | embed 로그인 → 홈 → 프로젝트 생성 → 슬라이드 생성 | preview·artifact 정상 |
| 2 | 생성 중 탭 이탈 → 재진입 | background run reattach, input 상태 |
| 3 | 명시적 Stop | `canceled` 유지, late error로 `failed` 오인 없음 |
| 4 | PNG/JPEG/PDF/PPTX 다운로드 | 기존 품질·파일명·auth gate |
| 5 | Drive publish/import | 세션·workspace 정합 |
| 6 | Network | `/api/version`, `/api/runs`, `auth/session`, message `PUT` 호출량 회귀 없음 |
| 7 | 2노드(staging) | project hash 라우팅·daemon restart 후 run 상태 |

---

## 0-legacy. 2026-07-16 현재 main 상태 요약

### 2026-07-20 속도·프롬프트 후보 재검토

| 커밋 | 내용 | 현재 판단 |
|------|------|-----------|
| `ed48a7d22` | `fix(daemon): filter transient ACP status events at persistence time` | **2026-07-20 선별 반영.** staging에는 별도 `chat-run-messages.ts`가 없어 `server.ts` 내 persistence 함수에 수동 포팅. 빈 process row와 불필요한 DB event write를 줄인다. |
| `9b5cdd843` | `fix(daemon): move connected-MCP directive out of the cached system prompt` | **2026-07-20 선별 반영.** 연결된 외부 MCP 서버 목록은 OAuth token/live connection state에 따라 바뀌므로 cacheable system prompt에서 제거하고 run instruction slice에만 주입하도록 수동 포팅했다. 큰 system prompt cache invalidation을 줄여 재시도/연속 작업의 시작 지연과 token overhead를 낮춘다. |
| `3e5725e54` / `188ae72f8` | question-form false-positive open tag 복구 / array payload 렌더 | **2026-07-20 선별 반영.** 채팅 prose 안의 `<question-form>` 언급이 실제 form을 삼키는 문제와 배열형 payload가 raw JSON으로 보이는 문제를 막는다. malformed completed block은 raw markup 대신 안전 fallback으로 대체한다. |
| `21f25cde5` | composer placeholder carousel native caret 숨김 | **2026-07-20 선별 반영.** CSS 한정 변경. 빈 composer placeholder animation 중 native caret가 함께 깜박이는 시각적 노이즈를 줄인다. |
| `5f411466b` | QuestionsPanel Continue 중복 제출 방지 | **2026-07-20 선별 반영.** Teamver `QuestionsPanel` 구조에 맞춰 submit lock만 포팅했다. 질문 form 답변 제출 직후 버튼을 즉시 disabled/busy로 바꿔 중복 run enqueue와 사용자의 stuck 오해를 줄인다. |
| `c110e40e8` | frontmatter parser 안정화 | **2026-07-20 선별 반영.** flush-left sequence, quoted inline array, block scalar indentation을 daemon/runtime parser 양쪽에 수동 포팅했다. 템플릿/디자인 시스템 metadata 파싱 누락을 줄인다. |
| `bdc66c978` / `ebada4cac` | deck data-chart / Mermaid dark-theme prompt discipline | **2026-07-20 선별 반영.** prompt-only 품질 보강. 차트 비율/라벨 누락과 다크 덱 Mermaid 대비 문제를 줄인다. |
| `4b4c7f402` | empty agent output guidance 개선 | **2026-07-20 선별 반영.** 빈 출력 종료 시 재인증/쿼터/모델 전환까지 안내해 사용자가 원인 진단 없이 같은 실패를 반복하는 시간을 줄인다. |
| `c23e158d8` | Claude `is_error` result termination 표면화 | **2026-07-20 선별 반영.** `is_error:true` result frame을 usage+terminal error로 전달하고, bookkeeping에서는 stdin만 닫되 clean completion으로 표시하지 않는다. CLI가 실패했는데 run이 성공처럼 보이는 false-success를 줄인다. |
| `489fda899` | Task sub-agent `turn_end`를 main turn 완료로 오인하지 않음 | **2026-07-20 선별 반영.** `parent_tool_use_id`가 있는 assistant wrapper에서는 `turn_end`를 내보내지 않는다. sub-agent 내부 종료 때문에 main run stdin이 닫히거나 실패가 성공 처리되는 문제를 막는다. |
| `88b411efd` | same-run retry 실패 시도 process group 정리 | **2026-07-20 선별 반영.** retry/cancel/shutdown에서 descendant process가 orphan으로 남아 서버 자원을 누적 소모하지 않도록 process group signaling/reap을 보강했다. |
| `443e31319` | host-tool launch `shell:true` 제거 | **2026-07-20 선별 반영.** Windows에서 project-derived path가 shell metacharacter로 해석되는 command injection 가능성을 줄인다. |
| `cfc6ae089` | AMR/Vela proxy pipe error guard | **2026-07-20 선별 반영.** current staging은 AMR proxy가 `server.ts`에 통합되어 있어 helper/test 방식으로 수동 포팅했다. upstream/client stream error가 daemon crash로 이어지지 않도록 양방향 pipe를 guard한다. |
| `5c4907add` | system prompt dedup / on-demand injection / per-turn input curbs | **이미 반영 확인.** direction library 조건부 주입, shared frames 조건부 주입, 파일 재읽기/렌더 반복 제한, responsive breakpoint 정합성이 staging에 존재한다. 작업 속도와 token 비용 절감 핵심 패치이므로 유지한다. |
| `2133796cd` | prior-turn artifact HTML transcript 요약 | **이미 반영 확인.** persisted artifact는 transcript에 전체 HTML 대신 저장 파일명/metadata 요약만 보내도록 되어 있어 후속 수정 turn의 input token 폭증을 줄인다. |
| `5643d6431` | frontmatter closing delimiter/body 보존 강화 | **이미 반영 확인.** plugin-runtime parser에 partial block 보존, delimiter 검증, newline body 보존 테스트가 존재한다. |
| `a1b0dd0d7` 계열 | POSIX argv prompt budget 보정 | **2026-07-20 선별 반영.** Linux/macOS에서 Windows용 30KB prompt argv 제한을 그대로 적용하는 false-positive를 줄인다. runaway prompt는 120KB에서 fail-fast 유지. |
| `4b660237c` | `feat(prompts): land the slim system-prompt line as the default charter` | **2026-07-20 부분 반영.** 전체 slim charter/core prompt 전환은 계속 보류. 단, 비미디어 프로젝트에 주입되던 긴 media dispatcher Bash loop 예시를 축약하고, zh-CN quick brief의 broad non-deck 선택지 예시를 scope-neutral 문구로 교체했다. Teamver deck-only UX와 background/comment 패치에 닿는 구조 변경은 반영하지 않음. |
| `c6241ecad` | BYOK media defaults를 dispatch hint에 반영 | **보류.** upstream은 `ByokMediaDefaults` 기반 prompt composer 구조인데 staging의 media dispatch prompt는 Teamver용 단순화 버전이다. 미디어/이미지 경로는 현재 slide MVP 핵심보다 낮고, 구조 추가가 동반되어 이번 루프에서는 적용하지 않는다. |
| `2192a7f6b` | incomplete BYOK configuration preflight | **보류.** daemon/web/settings/contracts 40개 파일 규모로, Teamver managed key/API key 비노출 정책과 충돌 가능성이 있다. 실사용 BYOK 설정 화면 회귀 테스트를 확보한 뒤 별도 검토한다. |
| `4ddfc6e44` | transient image generation response retry | **보류.** media route/analytics/contracts 대형 변경이며 현재 AI Design slide 기본 기능보다 후순위다. image generation을 product scope에 다시 올릴 때 검토한다. |
| `bc5b6f058` | unfinished work run을 completed로 표시하지 않음 | **2026-07-20 부분 반영.** 전체 DB/project-status/UI/i18n 포팅은 보류. run service가 TodoWrite 미완료 또는 `max_tokens` truncation을 감지해 `endedWithUnfinishedWork`를 status/end event에 싣는 최소 신호만 반영했다. |
| `bc5b6f058` FE 후속 | unfinished work background completion 표시 | **2026-07-20 부분 반영.** Teamver embed background toast/desktop notification이 `endedWithUnfinishedWork`를 `incomplete` notice로 매핑한다. 성공 preview 링크는 유지하되 완료 문구·성공음·성공 톤은 피한다. |
| `04236af50` | `fix(daemon): scan user-authored text only and latch intent signals per conversation` | **2026-07-21 부분 반영.** DB latch/intent-gated stable block은 Teamver 구조와 맞지 않아 보류. 사용자 작성 텍스트 extractor만 포팅해 Research fallback query 오염을 차단했다. |

`origin/main`은 현재 `034c3895d`까지 반영되어 있다. `staging...origin/main` divergence는 **`700 / 998`**으로, 2026-07-21 기준 `703 / 586`보다 **staging 쪽 고유 커밋이 더 증가**했다(최근 slide template·Drive import·background recovery 작업). 이 상태에서 전체 merge는 Teamver 전용 인증, S3/DB 저장, Drive, background run, export cache 정책을 회귀시킬 가능성이 높다.

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

**현재 바로 추진 추천 (2026-07-23):** 전체 merge 대신 **§0.2 권장 포팅 순서**를 따른다. 1순위는 run lifecycle(`7b27d4ba6`, `34a050737`)과 artifact durability(`4054b5357`). 2순위는 daemon restart reconcile(`d1372da02`)과 security 묶음. `d8b6b797f` chat disclosure 리팩터·message center·packaged 계열은 계속 보류. AtomCode, SiliconFlow, Vela CLI bump, MiniMax/media provider 계열은 Teamver AI Design 핵심 경로가 아니므로 보류한다.

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
| `390fcf88f` | `fix(plugin-previews): keep Community gallery previews in sync with shipped plugins` | **2026-07-21 부분 반영.** daemon fallback chain은 이미 충분해 대형 포팅은 보류. FE example stem 모호성 제거와 Teamver preview error copy 정리만 반영했다. bake pipeline/manifest/CI 전체는 계속 보류. |

**적용 방식:** 전체 cherry-pick 금지. `applyBakedPreviews`, preview manifest lookup, runtime gallery fallback에 필요한 부분만 확인한다.

**검증 필수:**

1. Community deck template 썸네일이 단색 blank처럼 보이지 않음.
2. preview modal에서 "예제 HTML을 가져오지 못했습니다"가 재발하지 않음.
3. Teamver embed에서 OD marketplace/불필요 Community 진입점 비노출 정책이 회귀하지 않음.

---

### P2 후보 — 작은 UI 안정화

| 커밋 | 내용 | 판단 |
|------|------|------|
| `4d2fb936e` | `Fix plugins flyout closing while typing in its search box` | **2026-07-21 선별 반영.** search input focus 중 synthetic `mouseleave`로 plugin flyout이 닫히지 않도록 최소 포팅했다. |
| `b86537483` | `fix(web): clamp floating composer within scrolled preview bounds` | **2026-07-21 검토 후 보류.** upstream 전제 함수가 현재 Teamver `PreviewDrawOverlay`에 없어 직접 포팅 대상이 아니다. 현재 toolbar/portal 구조에서 재현되면 별도 Teamver 경로로 수정한다. |

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

> **2026-07-23 갱신:** 상세 우선순위·포팅 방안은 **§0.1~0.2**를 SSOT로 한다. 아래는 요약.

1. **P0-A:** `7b27d4ba6` + `34a050737` — cancel/sub-agent error run lifecycle (§0.2-1).
2. **P0-B:** `4054b5357` — plain-stream artifact ring buffer 유실 (§0.2-2).
3. **P0-C:** `d1372da02` — daemon restart run terminal reconcile (§0.2-3).
4. **P0-D:** `5c94dda27` → `cbc38a498` → `bb7a10d97` → `d997318f9` — security (§0.2-4).
5. **P0-E:** `ace06eac1` — image export viewport (§0.2-5).
6. **P1:** `034c3895d`, `4fb217c95`, `d3e091e15`, `068c9ae83` — 저위험 UX·config (§0.2-6).
7. **기존 미완료:** `24c7876b3` in-place HTML edit delivery 보존(2026-07-20 부분 반영) 잔여, `04236af50` DB latch, `bc5b6f058` FE completion UI, `4b660237c` full slim charter — 각각 별도 루프.
8. PPTX는 일반 다운로드 screenshot 기본 정책을 유지한다. editable PPTX는 별도 메뉴/고급 옵션을 만들기 전까지 일반 사용자 경로에 노출하지 않는다.
9. 모든 반영 후 `/api/version`, `/api/runs`, `auth/session`, `auth/refresh`, analytics config, message `PUT` 호출량이 회귀하지 않았는지 Network에서 확인한다.

---

## 5. 운영 원칙

- 공식 OD `main`은 reference branch로만 사용한다.
- Teamver `staging`에는 full merge, broad cherry-pick, refactor cherry-pick을 하지 않는다.
- Teamver 장애 이력과 직접 연결되는 커밋만 수동 포팅한다.
- 포팅 단위마다 문서와 테스트를 함께 갱신한다.
- 기존 동작에 영향이 있을 수 있는 경우 기능 추가보다 회귀 방지가 우선이다.

---

## 6. 다음 추천 작업

1. **P0-A (다음 루프):** `7b27d4ba6` canceled run late-error 보정을 `apps/daemon/src/runs.ts` + `server.ts`에 수동 포팅. `34a050737` sub-agent in-stream error는 같은 루프에서 연속 검토.
2. **P0-B:** `4054b5357` plain-stream artifact accumulator. slide 생성 후 artifact/preview/S3 sync 회귀 테스트.
3. **P0-C:** `d1372da02` run terminal reconcile — staging 2노드 HA에서 daemon restart 시나리오 포함.
4. **P0-D:** security 묶음(`5c94dda27`, `cbc38a498`, `bb7a10d97`, `d997318f9`). marketplace UI 비노출과 무관하게 daemon SSRF/path traversal 방어.
5. **P0-E:** `ace06eac1` image export viewport — PNG/JPEG/PDF/PPTX 다운로드 회귀 없이.
6. **P1:** `034c3895d` 빈 tool status row 숨김 — 2파일 저위험 quick win.
7. **보류 유지:** `d8b6b797f` chat disclosure 리팩터, message center, `2192a7f6b` BYOK preflight, `4b660237c` full slim charter, `04236af50` DB latch.

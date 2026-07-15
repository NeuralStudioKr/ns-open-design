# OD upstream main 반영 검토

**판단 시점:** 2026-07-15 현재.
**반영 갱신:** 2026-07-15 — 현재 `main` 상태와 PPTX export 추가 여부를 재검토. 2026-07-09 이후 Teamver `staging`에는 Drive 인증/HA, S3/preview/cache, 다운로드 안정화 패치가 추가로 많이 반영되어 있으므로 전체 merge 위험도는 더 높아졌다.
**비교 기준:** `staging` (`cac418d52 fix(web): 삭제 프로젝가 홈 최근 목록에 「방금 전」으로 부활하지 않게 함`) ↔ `main` / `origin/main` (`7b9864614 feat(media): wire MiniMax image-01 through the minimax provider slot`).
**결론:** 공식 OD 최신 `main` 전체를 Teamver `staging`에 merge하지 않는다. Teamver 기존 동작을 깨지 않도록, 필요한 커밋만 수동 포팅한다.

---

## 0. 2026-07-15 현재 main 상태 요약

`main`은 현재 `7b9864614 feat(media): wire MiniMax image-01 through the minimax provider slot (#4563)`까지 반영되어 있다. `staging...main` divergence는 `665 / 410`으로, 2026-07-08 당시 `532 / 376`보다 더 벌어졌다.

확인 결과 `main`에는 **프로그램식 PPTX 다운로드/export 기능이 추가되어 있음**:

- `59bca72f7 feat(export): programmatic screenshot-based PPTX/PDF export (#4604)`
- daemon: `apps/daemon/src/deck-export.ts`, `/api/projects/:id/export/pptx`, `od export --format pptx`
- desktop: `apps/desktop/src/main/deck-capture.ts`의 `dom-to-pptx` 기반 editable PPTX 경로
- tests: `apps/daemon/tests/deck-export.test.ts`, `apps/daemon/tests/screenshot-export-file-handoff.test.ts`, `apps/daemon/tests/export-cli-routing.test.ts`

반면 `staging`에는 아직 위 programmatic PPTX route가 없다. `PptxGenJS` 관련 문구/프롬프트는 존재하지만, 사용자가 다운로드 메뉴에서 안정적으로 받을 수 있는 `/export/pptx` 구현은 미반영 상태다.

**현재 판단:** PPTX 다운로드는 Teamver AI Design의 “슬라이드 결과물 다운로드” 핵심 기능과 직접 연결되므로 반영 후보로 격상한다. 다만 `59bca72f7` 단일 커밋도 66개 파일, 5천 줄 이상을 건드리며 desktop/sidecar/packaging/vendor까지 포함한다. Teamver 웹 배포형/daemon 기반 구조에는 그대로 cherry-pick하지 말고, **screenshot 기반 PPTX 최소 경로부터 수동 이식**한다.

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

**권장 1차 범위:** Teamver 웹/daemon 배포에서 바로 쓸 수 있는 screenshot-based PPTX만 수동 이식한다.

- daemon `buildScreenshotPptx` 최소 구현 및 `pptxgenjs` dependency 추가.
- `/api/projects/:id/export/pptx` route 추가.
- 기존 Teamver PDF/image export에서 보강한 S3/scratch sync, auth gate, filename, deck render fallback을 유지.
- FE 다운로드 메뉴에는 `PPTX로 다운로드`를 추가하되, 실패 시 현재 PDF/image 다운로드 UX와 같은 구조화 오류/토스트를 사용.
- Drive로 내보내기와 혼동되지 않도록 “다운로드” 그룹 안에만 노출.

**권장 보류 범위:** editable PPTX / `dom-to-pptx` / desktop renderer vendor bundle / sidecar packaging은 2차로 둔다. Teamver staging은 웹/daemon 흐름 안정화가 우선이며, desktop resource packaging을 같이 들고 오면 충돌면이 급격히 커진다.

**검증 필수:**

1. 8~12장 HTML deck에서 PPTX 다운로드가 각 slide 1장씩 생성.
2. 한글/CJK 텍스트가 깨지지 않음. screenshot PPTX 기준 텍스트는 이미지이므로 폰트 렌더링은 브라우저 렌더 결과와 같아야 한다.
3. PDF/image/html/zip 기존 다운로드가 회귀하지 않음.
4. 슬라이드 생성 직후 S3 sync 전후 상태에서 `/export/pptx`가 동일하게 동작.
5. 대형 deck에서 서버 CPU/메모리 부하가 PDF/image export보다 과도하게 증가하지 않음.
6. 실패 응답이 `EXPORT_FAILED`, `NO_SLIDES`, renderer unavailable 등으로 구조화되어 FE 토스트가 구분 가능.

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

1. **P0/P1:** PPTX screenshot export 최소 경로를 별도 브랜치/작은 루프로 수동 이식한다.
2. `59bca72f7`에서 daemon-only 핵심만 추출한다: `deck-export.ts`, `export-cli-request/routing` 중 route에 필요한 타입, `import-export-routes.ts`의 `/export/pptx` handler, `pptxgenjs` dependency, 관련 daemon tests.
3. Teamver 기존 export 보강과 충돌하는 부분을 먼저 대조한다: S3 sync, scratch materialization, filename, auth gate, headless fallback, structured error.
4. FE는 `FileViewer` 전체 diff를 가져오지 말고 현재 Teamver 다운로드 메뉴에 `PPTX로 다운로드` action만 추가한다.
5. 1차는 screenshot PPTX만 출시 후보로 둔다. editable PPTX/dom-to-pptx/desktop vendor bundle은 한글/CJK 편집 가능성이 필요하다고 판단될 때 2차로 분리한다.
6. PPTX 적용 후 PDF/image/html/zip 기존 다운로드와 Drive 내보내기 회귀 테스트를 먼저 수행한다.
7. 그 다음 P0 background run/re-entry 잔여 후보(`f6fb7c204`)를 다시 검토한다.
8. Community preview sync는 runtime 문제가 재현되는 항목만 선별 반영한다.
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

1. **P0/P1:** PPTX screenshot export 최소 이식 작업을 착수한다. 전체 `59bca72f7` cherry-pick이 아니라 daemon route + FE menu + tests 단위로 작게 진행한다.
2. **P0:** 기존 PDF/image/html/zip 다운로드와 Drive 내보내기 회귀 테스트 목록을 PPTX 작업의 acceptance criteria로 먼저 고정한다.
3. **P0:** `f6fb7c204`의 reload/re-entry restore 로직은 PPTX 최소 이식 이후 검토한다. 현재 Teamver background handling이 많이 바뀌어 있어 바로 적용하면 충돌 위험이 있다.
4. **P1:** Community preview sync는 template preview blank/404가 staging에서 재현될 때 runtime fallback만 선별 반영한다.
5. **P2:** MiniMax image-01 provider wiring은 slide/deck MVP와 직접 관련 낮으므로 보류한다.

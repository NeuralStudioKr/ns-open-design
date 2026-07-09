# OD upstream main 반영 검토

**판단 시점:** 2026-07-08 현재.  
**비교 기준:** `staging` (`3c328f26a fix(teamver): stop app version polling`) ↔ `main` / `origin/main` / `upstream/main` (`7b9864614 feat(media): wire MiniMax image-01 through the minimax provider slot`).  
**결론:** 공식 OD 최신 `main` 전체를 Teamver `staging`에 merge하지 않는다. Teamver 기존 동작을 깨지 않도록, 필요한 커밋만 수동 포팅한다.

---

## 1. 왜 전체 merge 금지인가

`staging`과 `main`은 크게 diverge되어 있다. 2026-07-08 검토 시점 기준 `git rev-list --left-right --count staging...main` 결과는 `532 376`이었다.

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
| `708cd0654` | `fix(web): catch SSE reader errors to enable reconnection` | 반영 후보. SSE reader error 후 재연결 안정성 개선 가능성이 높다. |
| `8230a3a97` | `fix(web): keep consuming recovered daemon retries` | 반영 후보. recovered retry stream을 계속 소비하는 동작은 background run 안정성과 맞닿는다. |
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
| `20c61f773` | `fix(web): gate PDF print-ready handshake on a usable content size` | 반영 후보. PDF/image/html 다운로드 렌더링 이슈와 관련 가능성이 있다. 변경 범위가 `apps/web/src/runtime/exports.ts` 중심이라 비교적 작다. |

**적용 방식:** 수동 포팅. Teamver 다운로드/Drive 내보내기 분기와 충돌하지 않는지 확인한다.

**검증 필수:**

1. PDF 다운로드가 첫 페이지만 포함하지 않고 전체 deck을 포함.
2. 가로/세로 방향 수동 선택 없이 deck 비율이 올바름.
3. 불필요한 scrollbar UI가 PDF/image/html/zip에 남지 않음.
4. Drive 내보내기 결과와 다운로드 결과의 렌더링 차이가 커지지 않음.

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
| `59bca72f7` | programmatic screenshot-based PPTX/PDF export | 보류. 기능적으로 매력은 있으나 60개 이상 파일을 건드리는 대형 변경이다. Teamver export 안정화가 끝난 뒤 별도 트랙으로 검토한다. |
| `7b9864614` | MiniMax image-01 provider wiring | 보류. 현재 Teamver AI Design은 slide/deck 안정화가 우선이며, image/media 기능은 embed MVP에서 낮은 우선순위 또는 비노출 영역이다. |
| landing / SEO / updater / packaged / AMR / onboarding 계열 | 공식 OD 제품/마케팅 변경 | Teamver staging 출시 안정화와 직접 관련 낮음. 반영하지 않는다. |

---

## 4. 권장 작업 순서

1. 깨끗한 `staging` worktree에서 P0 SSE 후보의 diff를 작게 나누어 확인한다.
2. `providers/daemon.ts`의 SSE reconnection/reader error 처리만 먼저 수동 포팅한다.
3. `ProjectView.tsx` reattach/reload 복원 로직은 Teamver background run guard, workspace guard, auth/session 최적화와 대조해 필요한 부분만 옮긴다.
4. staging에서 background run 재진입 QA를 먼저 통과시킨다.
5. 다음으로 `exports.ts` print-ready handshake를 수동 포팅한다.
6. Community preview sync는 runtime 문제로 확인된 항목만 선별 반영한다.
7. 모든 반영 후 `/api/version`, `/api/runs`, `auth/session`, `auth/refresh`, analytics config, message `PUT` 호출량이 회귀하지 않았는지 Network에서 확인한다.

---

## 5. 운영 원칙

- 공식 OD `main`은 reference branch로만 사용한다.
- Teamver `staging`에는 full merge, broad cherry-pick, refactor cherry-pick을 하지 않는다.
- Teamver 장애 이력과 직접 연결되는 커밋만 수동 포팅한다.
- 포팅 단위마다 문서와 테스트를 함께 갱신한다.
- 기존 동작에 영향이 있을 수 있는 경우 기능 추가보다 회귀 방지가 우선이다.

---

## 6. 다음 추천 작업

1. **P0:** `708cd0654`, `8230a3a97`의 `providers/daemon.ts` SSE 처리만 Teamver 코드와 비교해 수동 포팅 가능 여부를 판단한다.
2. **P0:** `f6fb7c204`의 reload/re-entry restore 로직을 읽고, Teamver `ProjectView.tsx`에 이미 구현된 background handling과 누락 gap만 추출한다.
3. **P1:** `20c61f773`의 `exports.ts` print-ready gate를 Teamver export/Drive download 경로에 적용 가능한지 별도 diff로 검토한다.

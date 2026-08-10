# Teamver Design 문서 (`docs-teamver`)

**Teamver ↔ Open Design 연동** 설계·구현 가이드.  
**코드 SSOT:** `deploy/teamver/` · **문서 SSOT:** 이 디렉터리.  
**구현 누적:** **[00 구현 내역](./00_구현_내역_누적.md)** — 코드 변경 시 최상단에 항목 추가.

---

## 지금 할 일 (출시 1순위)

**후속 작업 전체 목록:** [04 §TODO (후속 작업)](./04_구현_우선순위.md#todo-후속-작업) — S-5 browser QA · ops 게이트 · billing.

| 문서 | 내용 |
|------|------|
| **[09 저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md)** | **Prod blocker — S3 · Litestream · registry · 진행 표** |
| **[10 세션·OD패치 보강](./10_세션·OD패치_보강.md)** | **세션·인증 · embed 브랜딩 · upstream 패치** |
| **[11 Usage·Drive Publish](./11_Usage·Drive_Publish_보강.md)** | **usage wiring · Drive Publish v1 · billing** |
| **[13 OD 단독 검증 (서버)](./13_OD_단독_검증_서버_가이드.md)** | **Teamver 없이 OD core·deck 검증 · :7457 격리 스택** |
| **[13 embed 슬라이드 MVP](./13_embed_슬라이드_MVP_기능게이트.md)** | **embed 1차 출시 — deck-only UI·MCP/미디어 비노출** |
| **[15 웹참조 BYOK web_fetch FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md)** | **URL 기반 슬라이드 · web search vs web_fetch · daemon 패치 FAQ** |
| **[48 웹 fetch 외부화 OpenAI 검토 ADR](./48_웹_fetch_외부화_OpenAI_검토_ADR.md)** | **OpenAI web search vs 자체 fetch · ADR · Reader SaaS adapter 로드맵** |
| **[48-2 apex→www redirect 이슈](./48-2-웹_fetch_native_redirect_apex_www_이슈.md)** | **`neuralstudio.kr` 등 apex fetch 실패 RCA · safe redirect fix · staging smoke** |
| **[48-3 web_fetch Production 배포 전·후 체크](./48-3-웹_fetch_Production_배포_전후_체크리스트.md)** | **P0~P5 필수 검증 · sign-off · 롤백 기준 (prod 반영 SSOT)** |
| **[16 S3 데이터 저장 시점 SSOT](./16_S3_데이터_저장_시점_SSOT.md)** | **언제 S3에 올라가는지 · scratch/sync-up · RDS·Drive·Litestream 구분** |
| **[19 S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md)** | **버킷·폴더(prefix)별 저장 내용 · 자동 생성 · lifecycle** |
| **[20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)** | **로컬 scratch+S3 · Litestream · 용량·evict · FAQ** |
| **[21 Scratch 디스크 메트릭](./21_OD_SCRATCH_DISK_METRICS_가이드.md)** | **`OD_SCRATCH_DISK_METRICS` 목적·부하·배포 preflight·FAQ** |
| **[22 Drive·인증·Usage 연동 검토](./22_Drive_인증_Usage_연동_검토.md)** | **Drive/auth/usage wiring 판정 · workspace 정렬 · E2E 체크리스트** |
| **[41 Design Drive 인증 계약 권고](./41_Design_Drive_인증_계약_권고.md)** | **Drive에 붙일 토큰 패밀리 · 방안 A(SSO forward) 권고 · dual-auth 트리거** |
| **[25 플러그인 preview 샌드박스 nginx](./25_플러그인_preview_샌드박스_nginx_보강.md)** | **deck-stage.js·Google Fonts CSP · sandbox subresource · nginx 보강** |
| **[28 embed 숨김 UI API](./28_embed_숨김_UI_API_점검.md)** | **marketing·marketplaces·agents boot — embed 불필요 호출 gate** |
| **[30 embed home boot API 최적화](./30_embed_home_boot_API_최적화.md)** | **`/` 접속 50+ 요청 분석 · hidden unmount · dedup · 검증** |
| **[27 메시지 Persist PUT](./27_메시지_Persist_PUT_아키텍처.md)** | **스트리밍 checkpoint · embed BYOK FE PUT · throttle 5s · design-api vs daemon** |
| **[29 BYOK api mode vs runs](./29_BYOK_api_mode_vs_runs_아키텍처.md)** | **왜 POST /api/runs 없음 · S3 sync-up gap · GET vs POST · 근본 fix 옵션 · 부하 FAQ** |
| **[31 Staging vs Production 네트워크·TLS·DNS](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md)** | **왜 staging/prod가 다른지 · GCP/ALB/nginx 역할 · DNS·인증서·로드밸런싱 SSOT** |
| **[32 프로젝트 썸네일·cover 로딩](./32_프로젝트_썸네일_커버_로딩_개선.md)** | **동적 registry 미리보기 SSOT · CDN/캐시 정책 · Phase 0~2 로드맵** |
| **[33 프로젝트 다운로드·Export](./33_프로젝트_다운로드_Export_아키텍처.md)** | **FE→daemon 경로 · scratch/sync-down · S3 presigned 미사용 · Export vs Drive** |
| **[34 Export 성능 개선](./34_Export_성능_개선_로드맵.md)** | **export 부하 분석 · Chromium/캐시/presigned/async · Phase 0~3 로드맵** |
| **[38 Design 동시성·용량·확장](./38_Design_동시성_용량_확장_가이드.md)** | **UVICORN worker · AI BYOK 동시 stream(workspace cap 8) · export cap · multi-node** |
| [39 Design 이중화·HA](./39_0_Design_이중화_로드맵_개요.md) | **Phase 0~5 · userId hash · scratch/SQLite · [39_6 CTO](./39_6_라우팅_아키텍처_CTO_의사결정.md) · [39_7 저장층 FAQ](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md) · [39_10 BFF 쿠키 경합](./39_10_HA_세션쿠키_경합_해결.md)** |
| **[40 OD upstream main 반영 검토](./40_OD_upstream_main_반영_검토.md)** | **2026-07-23 현재 판단 · 공식 OD main 전체 merge 금지 · P0 run/artifact/security 수동 포팅 후보** |
| **[42 Canvas Apps 슬라이드 생성](./42_Canvas_앱스_슬라이드_생성_기획설계.md)** | **캔버스 헤더 Apps · Design 슬라이드 · JSON/MD/HTML 비교 · Docs 자리(비활성)** |
| **[49 Canvas→Design 런치 모달 UX](./49_Canvas_Design_슬라이드_런치_모달_UX_안_비교.md)** | **스텝 위저드 vs 2열·아코디언 · X-only · 푸터 취소 제거** |
| **[50 Undo/Redo 설계](./50_undo_redo_설계.md)** · [50-1 현황](./50-1-구현현황-undo_redo.md) · **[50-2 Canvas vs Design 비교](./50-2_Teamver_Canvas_vs_Design_Undo_비교.md)** | **수동편집·에이전트 revision undo · Teamver canvas와 차이** |
| **[51-0~2 드래그 리사이즈](./51-0_수동편집_드래그_리사이즈_기획.md)** | **Manual Edit 박스 핸들 · [51-0 기획](./51-0_수동편집_드래그_리사이즈_기획.md) · [51-1 설계](./51-1_수동편집_드래그_리사이즈_설계.md) · [51-2 현황](./51-2_수동편집_드래그_리사이즈_구현현황.md)** |
| **[52-0~2 위치 이동](./52-0_수동편집_위치_이동_기획.md)** | **absolute/fixed 본체 드래그 · [52-0 기획](./52-0_수동편집_위치_이동_기획.md) · [52-1 설계](./52-1_수동편집_위치_이동_설계.md) · [52-2 현황](./52-2_수동편집_위치_이동_구현현황.md)** |
| **[53-0~2 위치 승격](./53-0_수동편집_위치_승격_기획.md)** | **flow→positioned 승격 · [53-0](./53-0_수동편집_위치_승격_기획.md) · [53-1](./53-1_수동편집_위치_승격_설계.md) · [53-2](./53-2_수동편집_위치_승격_구현현황.md)** |
| **[54 MiniMax 전환 기획·설계](./54_MiniMax_전환_기획_설계.md)** | **2026-08-03 현재 판단 · Claude 비용 절감 · server-only MiniMax · deck-only · web_fetch · S3/DB/백그라운드 계약** |
| **[54-1 MiniMax 전환 개발설계](./54-1_MiniMax_전환_개발설계.md)** | **구현자용 상세 설계 · 파일별 변경점 · API/env 계약 · stream/tool loop · 테스트·배포 순서** |
| **[55 Main↔Design UI 스타일](./55_Main_Teamver_vs_Design_UI_스타일_통일_분석.md)** | **분석·보류 — indigo/Geist 통일은 합의 전 재개 금지** |
| **[56 UI polish a11y·터치](./56_UI_polish_a11y_터치_개선.md)** | **focus·hit·touch · soft/28 포화·리뷰 교정** |
| **[57-0~1 Docker 배포 빌드](./57-0_Docker_배포_빌드_가속_현황.md)** | **Phase 0 가속 현황 · [57-1 CI·ECR 설계](./57-1_Docker_이미지_CI_ECR_배포_설계.md) (미구현) · 구 52-x Docker에서 재번호** |
| **[58 덱 Preview letterbox](./58_덱_미리보기_letterbox_빈화면_안정화.md)** | **재진입·사용 중 검정 Preview · prefix settle · filesRefresh · host-viewport fit** |
| **[60 Canvas→Slide 시스템 프롬프트·템플릿](./60_Canvas_Slide_시스템_프롬프트_템플릿적용_개선.md)** | **Daisy Days→Neutral RCA · compose 우선순위 · FE/BE · 퀵설정 · 회귀 방어 SSOT** |
| **[46 embed 슬라이드 품질](./46_embed_슬라이드_품질_원인분석_개선로드맵.md)** | **품질 trade-off · Phase 1~3 로드맵** |
| **[47 body-first compact deck 검토](./47_body-first_compact_deck_아키텍처_검토_및_0716이후_변경판단.md)** | **body-first 결정 · 0716 이후 판단 · 유지/롤백 SSOT** |
| **[17 Production 출시 작업 순서](./17_Production_출시_작업_순서.md)** | **Step 0~6 체크리스트 · ACM→TF→DNS→EC2→e2e-strict** |
| **[18 EC2 Instance Profile · S3](./18_EC2_IAM_Instance_Profile_S3_설정.md)** | **IAM role/profile · IMDS hop 2 · Docker S3 creds · 검증** |
| **[00 구현 내역](./00_구현_내역_누적.md)** | **코드·연동 변경 누적 (날짜 역순)** |
| **[05 OD UI 재사용](./05_OD_UI_재사용_빠른출시.md)** | 프록시·인증·브랜딩 |
| [04 구현 우선순위](./04_구현_우선순위.md) | Track A/B/C · Phase 요약 |

---

## 연동 설계

| # | 문서 |
|---|------|
| 00 | **[구현 내역 누적](./00_구현_내역_누적.md)** |
| 09 | **[저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md)** |
| 10 | **[세션·OD패치 보강](./10_세션·OD패치_보강.md)** |
| 11 | **[Usage·Drive Publish](./11_Usage·Drive_Publish_보강.md)** |
| 15 | **[웹참조 BYOK web_fetch FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md)** |
| 48 | **[웹 fetch 외부화 OpenAI 검토 ADR](./48_웹_fetch_외부화_OpenAI_검토_ADR.md)** |
| 48-2 | **[native redirect apex→www 이슈](./48-2-웹_fetch_native_redirect_apex_www_이슈.md)** — staging 실측 · SSRF-safe follow |
| 48-3 | **[web_fetch Production 배포 전·후 체크](./48-3-웹_fetch_Production_배포_전후_체크리스트.md)** — P0~P5 · 롤백 · sign-off |
| 16 | **[S3 데이터 저장 시점 SSOT](./16_S3_데이터_저장_시점_SSOT.md)** |
| 19 | **[S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md)** |
| 20 | **[Hybrid 저장소 (로컬+S3)](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)** |
| 21 | **[Scratch 디스크 메트릭](./21_OD_SCRATCH_DISK_METRICS_가이드.md)** |
| 22 | **[Drive·인증·Usage 연동 검토](./22_Drive_인증_Usage_연동_검토.md)** |
| 41 | **[Design Drive 인증 계약 권고](./41_Design_Drive_인증_계약_권고.md)** — Apps JWT vs Main SSO · 방안 A 권고 |
| 27 | **[메시지 Persist PUT 아키텍처](./27_메시지_Persist_PUT_아키텍처.md)** |
| 28 | **[embed 숨김 UI API 점검](./28_embed_숨김_UI_API_점검.md)** |
| 30 | **[embed home boot API 최적화](./30_embed_home_boot_API_최적화.md)** |
| 31 | **[Staging vs Production 네트워크·TLS·DNS](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md)** |
| 32 | **[프로젝트 썸네일·cover 로딩](./32_프로젝트_썸네일_커버_로딩_개선.md)** |
| 33 | **[프로젝트 다운로드·Export](./33_프로젝트_다운로드_Export_아키텍처.md)** |
| 34 | **[Export 성능 개선](./34_Export_성능_개선_로드맵.md)** |
| 38 | **[Design 동시성·용량·확장](./38_Design_동시성_용량_확장_가이드.md)** — §5 AI 동시 이용 SSOT |
| 39 | **[Design 이중화·HA](./39_0_Design_이중화_로드맵_개요.md)** — [39_1](./39_1_이중화_Phase_로드맵.md) Phase · [39_2](./39_2_ALB_nginx_라우팅_설계.md) 라우팅 · [39_6](./39_6_라우팅_아키텍처_CTO_의사결정.md) CTO · [39_7](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md) scratch·DaemonDb · [39_3~5](./39_3_scratch_SQLite_SSE_제약.md) |
| 40 | **[OD upstream main 반영 검토](./40_OD_upstream_main_반영_검토.md)** — 2026-07-23 현재 판단, 전체 merge 금지, run lifecycle·artifact·security P0 수동 포팅 후보 |
| 42 | **[Canvas Apps 슬라이드 생성 기획·설계](./42_Canvas_앱스_슬라이드_생성_기획설계.md)** — Apps 메뉴 · HTML handoff 유지 · Docs disabled |
| 49 | **[Canvas→Design 런치 모달 UX 안 비교](./49_Canvas_Design_슬라이드_런치_모달_UX_안_비교.md)** — 스텝 위저드(권장) · Studio 2열 폐기 · 크롬 X-only |
| 50 | **[Undo/Redo 설계](./50_undo_redo_설계.md)** · [50-1 현황](./50-1-구현현황-undo_redo.md) · **[50-2 Canvas vs Design 비교](./50-2_Teamver_Canvas_vs_Design_Undo_비교.md)** |
| 51-0 | **[드래그 리사이즈 기획](./51-0_수동편집_드래그_리사이즈_기획.md)** · [51-1 설계](./51-1_수동편집_드래그_리사이즈_설계.md) · [51-2 현황](./51-2_수동편집_드래그_리사이즈_구현현황.md) |
| 52-0 | **[위치 이동 기획](./52-0_수동편집_위치_이동_기획.md)** · [52-1 설계](./52-1_수동편집_위치_이동_설계.md) · [52-2 현황](./52-2_수동편집_위치_이동_구현현황.md) |
| 53-0 | **[위치 승격 기획](./53-0_수동편집_위치_승격_기획.md)** · [53-1 설계](./53-1_수동편집_위치_승격_설계.md) · [53-2 현황](./53-2_수동편집_위치_승격_구현현황.md) |
| 54 | **[MiniMax 전환 기획·설계](./54_MiniMax_전환_기획_설계.md)** — 2026-08-03 현재 판단 · Claude 비용 절감 · server-only MiniMax · deck-only · web_fetch · S3/DB/백그라운드 |
| 54-1 | **[MiniMax 전환 개발설계](./54-1_MiniMax_전환_개발설계.md)** — 구현자용 상세 설계 · 파일별 변경점 · API/env 계약 · stream/tool loop · 테스트·배포 순서 |
| 55 | **[Main↔Design UI 스타일 통일 분석](./55_Main_Teamver_vs_Design_UI_스타일_통일_분석.md)** — 보류 |
| 56 | **[UI polish a11y·터치](./56_UI_polish_a11y_터치_개선.md)** — soft/28 포화 |
| 57-0 | **[Docker 배포 빌드 가속 현황](./57-0_Docker_배포_빌드_가속_현황.md)** — Phase 0 BuildKit·Playwright (구 52-0 Docker) |
| 57-1 | **[Docker 이미지 CI·ECR 배포 설계](./57-1_Docker_이미지_CI_ECR_배포_설계.md)** — 다음 단계 (미구현 · 구 52-1 Docker) |
| 58 | **[덱 Preview letterbox / 빈 화면](./58_덱_미리보기_letterbox_빈화면_안정화.md)** — 재진입·사용 중 검정 Preview · host-viewport |
| 46 | **[embed 슬라이드 품질 원인분석·로드맵](./46_embed_슬라이드_품질_원인분석_개선로드맵.md)** — Phase 1~3 |
| 47 | **[body-first compact deck 검토·0716 이후 판단](./47_body-first_compact_deck_아키텍처_검토_및_0716이후_변경판단.md)** — 유지/롤백 SSOT |
| 17 | **[Production 출시 작업 순서](./17_Production_출시_작업_순서.md)** |
| 18 | **[EC2 Instance Profile · S3 설정](./18_EC2_IAM_Instance_Profile_S3_설정.md)** |
| 05 | **[OD UI 재사용](./05_OD_UI_재사용_빠른출시.md)** |
| 06 | **[Docs/Slides형 연동](./06_Docs슬라이드형_연동.md)** |
| 07 | **[EC2·배포·인프라](./07_VM_배포_인프라.md)** |
| 08 | **[Teamver SDK vendor · 배포](./08_Teamver_SDK_vendor와_배포.md)** · auth 공통화: [platform §10](../../ns-teamver-platform/docs/10_Apps_Auth_공통_패턴_패키지화_및_마이그레이션_가이드.md) |
| 04 | [구현 우선순위](./04_구현_우선순위.md) |
| 01 | [통합 아키텍처](./01_통합_아키텍처.md) |
| 02 | [design-app ↔ daemon](./02_design-app_daemon_연동.md) |
| 03 | [키·Drive·DB](./03_키_저장소_Drive_DB.md) |

**OD upstream 참고:** [open-design-index.md](./open-design-index.md) · `ns-open-design/docs/`

---

## 코드 위치

| 항목 | 경로 |
|------|------|
| design-api BE | `deploy/teamver/be/` |
| compose | `deploy/teamver/docker-compose.yml` |
| nginx · Terraform | `deploy/teamver/devops/` · `ns-teamver-devops/terraform/services/teamver-design/` |
| **Teamver SDK vendor** | `vendor/teamver/` — **[08 vendor·배포](./08_Teamver_SDK_vendor와_배포.md)** |
| **저장소 출시 게이트** | **[09](./09_Design_저장소_격리_출시게이트.md)** · OD `apps/daemon/src/storage/` |
| **인프라 SSOT** | **[07_VM_배포_인프라.md](./07_VM_배포_인프라.md)** |
| 연동 SSOT | `deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md` |

---

## 관리 원칙

- **구현 누적** — 코드·연동 변경 시 **[00_구현_내역_누적.md](./00_구현_내역_누적.md)** 최상단에 날짜 항목 추가 (`ns-teamver-be/docs/00_*` 동형)
- **현행 설계** — `01~11` (출시 SSOT = `05` + **Prod 게이트 = `09`** + **연동 보강 = `10`·`11`**)
- **진행 표** — Phase 완료 시 [09 §4](./09_Design_저장소_격리_출시게이트.md#4-작업-우선순위--진행-상황) 상태를 ✅ 로 갱신
- **보관** — `archive/` (삭제 안 함, 수정 안 함)
- **OD 정본** — `ns-open-design/docs/` (Teamver Design 스펙은 `docs-teamver/`)

### 보관 → 현행 매핑

| archive/ | 현행 |
|----------|------|
| `01_1` 통합방안 | `01_통합_아키텍처` (Track B) |
| `01_2`, `02`, `03` OD 분석 | `open-design-index` → upstream |
| `04` 키·저장소 | `03_키_저장소_Drive_DB` + **09** + **11 Drive** |
| `10` S3 패턴 참고 | `archive/10_S3_저장소_패턴_참고` |
| `05` daemon 연동 | `02_design-app_daemon_연동` |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-08-04 | Docker 문서 **52 → 57** 재번호 — 수동편집 위치이동 `52-x`와 충돌 해소 ([57-0](./57-0_Docker_배포_빌드_가속_현황.md) · [57-1](./57-1_Docker_이미지_CI_ECR_배포_설계.md)) |
| 2026-08-03 | [54-1 MiniMax 전환 개발설계](./54-1_MiniMax_전환_개발설계.md) — 구현자용 상세 설계 · 파일별 변경점 · API/env 계약 · 테스트·배포 순서 |
| 2026-08-03 | [54 MiniMax 전환 기획·설계](./54_MiniMax_전환_기획_설계.md) — 2026-08-03 현재 판단 · Claude 비용 절감 · server-only MiniMax 전환 로드맵 |
| 2026-07-31 | [57-0 Docker 빌드 가속 현황](./57-0_Docker_배포_빌드_가속_현황.md) · [57-1 CI·ECR 배포 설계](./57-1_Docker_이미지_CI_ECR_배포_설계.md) |
| 2026-07-23 | [40 OD upstream main 반영 검토](./40_OD_upstream_main_반영_검토.md) — 루프 20: main `034c3895d` 기준 43개 신규 커밋 분류, P0 run/artifact/security 포팅 순서 갱신 |
| 2026-07-14 | [39_10 HA 세션쿠키 경합](./39_10_HA_세션쿠키_경합_해결.md) — Drive `session_expired` 근본 원인·해결 SSOT |
| 2026-07-08 | [40 OD upstream main 반영 검토](./40_OD_upstream_main_반영_검토.md) — 현재 시점 기준 반영 후보·보류 커밋 정리 |
| 2026-07-08 | [39_7 scratch·DaemonDb FAQ](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md) |
| 2026-07-07 | [39 Design 이중화·HA](./39_0_Design_이중화_로드맵_개요.md) 시리즈 추가 |
| 2026-06-24 | [22 Drive·인증·Usage 연동 검토](./22_Drive_인증_Usage_연동_검토.md) — loop 354 검토 SSOT |
| 2026-06-22 | [20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) — scratch+S3, Litestream, 용량 |
| 2026-06-22 | [19 S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md) — prefix별 저장·자동 생성·lifecycle |
| 2026-06-22 | [15 웹참조 BYOK web_fetch FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md) — URL 슬라이드 · Main BE web search 대비 |
| 2026-06-15 | [10 세션·OD패치](./10_세션·OD패치_보강.md) · [11 Usage·Drive](./11_Usage·Drive_Publish_보강.md) — 연동 보강 SSOT |
| 2026-06-15 | [09 저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md) — Prod blocker |
| 2026-06-15 | [00 구현 내역 누적](./00_구현_내역_누적.md) — Track A 구현분·관리 원칙 |
| 2026-06-15 | [08 Teamver SDK vendor·배포](./08_Teamver_SDK_vendor와_배포.md) — ECR 없는 EC2 배포 정책 |
| 2026-06-15 | **`ns-teamver-design/docs` → `ns-open-design/docs-teamver` 이전** |
| 2026-06-15 | [07_EC2·배포·인프라](./07_VM_배포_인프라.md) — Staging/Prod EC2 분리·Terraform SSOT |
| 2026-06-15 | 구현 코드 → `deploy/teamver/be` |
| 2026-06-15 | Track A OD UI 재사용 1순위 |
| 2026-06-15 | 기존 6편 → `archive/` 보존 |

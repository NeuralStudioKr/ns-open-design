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
| **[16 S3 데이터 저장 시점 SSOT](./16_S3_데이터_저장_시점_SSOT.md)** | **언제 S3에 올라가는지 · scratch/sync-up · RDS·Drive·Litestream 구분** |
| **[19 S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md)** | **버킷·폴더(prefix)별 저장 내용 · 자동 생성 · lifecycle** |
| **[20 Hybrid 저장소 가이드](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)** | **로컬 scratch+S3 · Litestream · 용량·evict · FAQ** |
| **[21 Scratch 디스크 메트릭](./21_OD_SCRATCH_DISK_METRICS_가이드.md)** | **`OD_SCRATCH_DISK_METRICS` 목적·부하·배포 preflight·FAQ** |
| **[22 Drive·인증·Usage 연동 검토](./22_Drive_인증_Usage_연동_검토.md)** | **Drive/auth/usage wiring 판정 · workspace 정렬 · E2E 체크리스트** |
| **[25 플러그인 preview 샌드박스 nginx](./25_플러그인_preview_샌드박스_nginx_보강.md)** | **deck-stage.js·Google Fonts CSP · sandbox subresource · nginx 보강** |
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
| 16 | **[S3 데이터 저장 시점 SSOT](./16_S3_데이터_저장_시점_SSOT.md)** |
| 19 | **[S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md)** |
| 20 | **[Hybrid 저장소 (로컬+S3)](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)** |
| 21 | **[Scratch 디스크 메트릭](./21_OD_SCRATCH_DISK_METRICS_가이드.md)** |
| 22 | **[Drive·인증·Usage 연동 검토](./22_Drive_인증_Usage_연동_검토.md)** |
| 17 | **[Production 출시 작업 순서](./17_Production_출시_작업_순서.md)** |
| 18 | **[EC2 Instance Profile · S3 설정](./18_EC2_IAM_Instance_Profile_S3_설정.md)** |
| 05 | **[OD UI 재사용](./05_OD_UI_재사용_빠른출시.md)** |
| 06 | **[Docs/Slides형 연동](./06_Docs슬라이드형_연동.md)** |
| 07 | **[EC2·배포·인프라](./07_VM_배포_인프라.md)** |
| 08 | **[Teamver SDK vendor · 배포](./08_Teamver_SDK_vendor와_배포.md)** |
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

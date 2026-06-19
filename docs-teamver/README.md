# Teamver Design 문서 (`docs-teamver`)

**Teamver ↔ Open Design 연동** 설계·구현 가이드.  
**코드 SSOT:** `deploy/teamver/` · **문서 SSOT:** 이 디렉터리.  
**구현 누적:** **[00 구현 내역](./00_구현_내역_누적.md)** — 코드 변경 시 최상단에 항목 추가.

---

## 지금 할 일 (출시 1순위)

| 문서 | 내용 |
|------|------|
| **[09 저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md)** | **Prod blocker — S3 · Litestream · registry · 진행 표** |
| **[10 세션·OD패치 보강](./10_세션·OD패치_보강.md)** | **세션·인증 · embed 브랜딩 · upstream 패치** |
| **[11 Usage·Drive Publish](./11_Usage·Drive_Publish_보강.md)** | **usage wiring · Drive Publish v1 · billing** |
| **[13 OD 단독 검증 (서버)](./13_OD_단독_검증_서버_가이드.md)** | **Teamver 없이 OD core·deck 검증 · :7457 격리 스택** |
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
| 2026-06-15 | [10 세션·OD패치](./10_세션·OD패치_보강.md) · [11 Usage·Drive](./11_Usage·Drive_Publish_보강.md) — 연동 보강 SSOT |
| 2026-06-15 | [09 저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md) — Prod blocker |
| 2026-06-15 | [00 구현 내역 누적](./00_구현_내역_누적.md) — Track A 구현분·관리 원칙 |
| 2026-06-15 | [08 Teamver SDK vendor·배포](./08_Teamver_SDK_vendor와_배포.md) — ECR 없는 EC2 배포 정책 |
| 2026-06-15 | **`ns-teamver-design/docs` → `ns-open-design/docs-teamver` 이전** |
| 2026-06-15 | [07_EC2·배포·인프라](./07_VM_배포_인프라.md) — Staging/Prod EC2 분리·Terraform SSOT |
| 2026-06-15 | 구현 코드 → `deploy/teamver/be` |
| 2026-06-15 | Track A OD UI 재사용 1순위 |
| 2026-06-15 | 기존 6편 → `archive/` 보존 |

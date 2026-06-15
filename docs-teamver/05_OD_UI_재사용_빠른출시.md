# OD UI 재사용 — 빠른 출시 경로

**현재 Teamver Design AI App의 1순위 전략.** 별도 FE를 만들지 않고, **open-design 제품 UI(`apps/web`)를 최소 변형**해 Teamver 서비스에 포함·출시한다.

**관련:** [04_구현_우선순위](./04_구현_우선순위.md) · **[09 저장소·격리](./09_Design_저장소_격리_출시게이트.md)** · **[10 세션·OD패치](./10_세션·OD패치_보강.md)** · [07_VM_배포_인프라](./07_VM_배포_인프라.md) · [01_통합_아키텍처](./01_통합_아키텍처.md) · [open-design-index](./open-design-index.md)

---

## 한 줄 결론

> **OD docker( web + daemon `:7456` )를 띄우고, Teamver는 프록시·메뉴·인증만 얹는다.**  
> **Prod 오픈 전** [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) Phase 0~3 + [10 세션·패치](./10_세션·OD패치_보강.md) 필수. 커스텀 design-app FE·run/job wrapper BE는 **출시 이후** 단계.

---

## 왜 이 경로인가

| 항목 | 커스텀 FE+wrapper BE | **OD UI 재사용 (채택)** |
|------|------------------------|-------------------------|
| 출시 속도 | 느림 (Studio UX 전부 재구현) | **빠름** — OD 제품 UI 그대로 |
| 기능 완성도 | MVP에서 기능 부족 | 스킬·DS·플러그인·export 즉시 사용 |
| 유지보수 | 이중 UI | OD upstream + **얇은 패치** |
| Teamver 통합 | app-sdk·Drive 네이티브 | 1차: 프록시·앱 메뉴; Drive는 후속 |

---

## 목표 아키텍처

OD Docker 이미지는 **한 포트(`7456`)에서 API + 제품 SPA**를 함께 서빙한다 (`registerStaticSpaFallback`). Teamver는 이를 **AI App 한 칸**으로 노출한다.

```text
[사용자] teamver.com 로그인
    ↓
[teamver-fe-v2] AI Apps → "Design" 메뉴
    ↓  (reverse proxy 또는 iframe)
[OD 컨테이너 :7456]
    ├─ GET /          → OD web SPA (apps/web 빌드)
    └─ /api/*         → daemon (같은 오리진 → CORS 단순)
```

**브라우저 → daemon 직접 호출:** 이 모드에서는 OD **정식 토폴로지**다. 커스텀 wrapper FE를 쓸 때만 “FE가 `:7456`에 붙지 않는다” 규칙이 적용된다 ([02](./02_design-app_daemon_연동.md) §Summary 참고).

### 배포 형태 (Staging / Production EC2 분리)

slides·docs 와 동일하게 **stg EC2 ≠ prod EC2**. 상세(사양·DNS·TLS·Terraform·체크리스트)는 **[07_VM_배포_인프라](./07_VM_배포_인프라.md)**.

| 환경 | 호스트 |
|------|--------|
| Staging | `stg-design` / `stg-design-api` |
| Production | `design` / `design-api` (AWS ALB) |

운영 runbook: `deploy/teamver/devops/nginx/README.md` (stg) · `deploy/teamver/docs/DEPLOY-AWS.md` (prod)  
Terraform: `ns-teamver-devops/terraform/services/teamver-design/`

---

## Teamver가 할 일 (얇은 층)

| # | 작업 | 레포 | P0 |
|---|------|------|-----|
| 1 | OD 컨테이너 배포 (`deploy/teamver`) | `ns-open-design` | ✓ |
| 2 | Ingress / reverse proxy + `OD_API_TOKEN` | prod: ALB + EC2 nginx · stg: nginx | conf |
| 3 | Teamver 로그인 게이트 | nginx → `api.teamver.com/session-check` + design-api SSO | ✓ conf |
| 4 | AI Apps 메뉴 등록 | `ns-teamver-fe-v2` | ✓ |
| 5 | 프록시 → daemon `OD_API_TOKEN` | EC2 nginx (ALB 뒤) | ✓ conf |
| 6 | **design-api BE** — SSO·bootstrap·usage | `ns-open-design/deploy/teamver/be` | 스캐폴드 |

**하지 않는 것 (1차 출시):**

- OD UI 전체 재구현
- Track B headless wrapper (출시 후)
- Drive 자동 업로드 (후속)

**Docs/Slides형 연동:** [06_Docs슬라이드형_연동](./06_Docs슬라이드형_연동.md) → 구현은 `ns-open-design/deploy/teamver/`

---

## OD 쪽 최소 변형 (패치 범위)

upstream을 크게 fork하지 않고 **`ns-open-design`에 작은 패치**만 둔다.

| 영역 | 예시 | 경로 |
|------|------|------|
| 브랜딩 | 로고·타이틀·favicon "Teamver Design" | `TeamverBrandingProvider` — [10 §4](./10_세션·OD패치_보강.md) |
| 네비게이션 | OD 마케팅·Discord·GitHub 링크 숨김 | embed 게이트 — [10 §4.3](./10_세션·OD패치_보강.md) |
| BFF SSO | `@teamver/app-sdk` design-api 연동 | `apps/web/src/teamver/designBffClient.ts` |
| 테마 (선택) | Teamver primary 색 CSS 변수 | `apps/web/src/styles/teamver.css` |
| 배포 | `deploy/teamver` env·이미지 태그 | 이미 존재 |
| 환경 | `VITE_TEAMVER_*`, `OD_ALLOWED_ORIGINS`, `OD_API_TOKEN` | compose / K8s secret |

**넣지 않을 것:** Teamver JWT를 OD `/api/chat`에 전달, OD DB 스키마 변경, daemon 내부 teamver import.

**넣는 것 (Track A 예외):** `@teamver/app-sdk` — design-api BFF Cookie SSO (`apps/web/src/teamver/`). upstream daemon에는 teamver 코드 없음.

패치는 `patches/teamver/` + `apps/web/src/teamver/` 격리 — [10 §4.5~§4.7](./10_세션·OD패치_보강.md).

---

## 구현 체크리스트 (출시 MVP)

**연동**

```text
[x] deploy/teamver nginx conf — ns-open-design/deploy/teamver/devops/nginx/
[ ] deploy/teamver 로컬·스테이징 기동 확인 (curl /api/health, 브라우저 /)
[ ] OD embed 브랜딩 — TeamverBrandingProvider, 외부 링크 폐쇄 — [10 §4](./10_세션·OD패치_보강.md)
[x] stg-design.teamver.com reverse proxy + OD_API_TOKEN 주입 (nginx conf)
[x] Teamver 로그인 게이트 — auth_request → /api/auth/session-check
[x] AI Apps 메뉴에 Design 앱 노출 (fe-v2 AppsShowcase)
[ ] workspace 멤버만 접근 (Teamver 권한 정책)
[ ] (선택) 에이전트 CLI / BYOK — OD 설정 화면 그대로 사용
```

**세션·인증 — [10 §3](./10_세션·OD패치_보강.md) (출시 전 P0)**

```text
[ ] /auth/session 401 정책 통일
[ ] SDK refresh → Main BE 직결
[ ] design-api nginx auth_request (usage/projects)
[ ] FE auth recovery + same-tab login redirect
[ ] localhost dev — Vite proxy BFF
```

**Usage — [11 §3](./11_Usage·Drive_Publish_보강.md) (출시 전 P0)**

```text
[ ] FE saveMessage → reportTeamverDesignUsage hook
[ ] (workspace_id, run_id) 멱등 unique index
[ ] Main BE design M2M by-model
```

**저장소·격리 — [09](./09_Design_저장소_격리_출시게이트.md) (Prod 필수, Phase 0~3)**

```text
[ ] S3 bucket + IAM (Phase 0)
[ ] OD ProjectStorage S3 wiring + CachingProjectStorage (Phase 1)
[ ] Litestream app.sqlite → S3 (Phase 2)
[ ] design_projects registry + tenant isolation (Phase 3)
[ ] Staging E2E — S3 객체·403 격리·복구 (09 §8)
```

---

## 후속 (출시 다음)

| 순서 | 항목 | 문서 |
|------|------|------|
| 1 | Drive export 자동 업로드 (G7) | [11 §6](./11_Usage·Drive_Publish_보강.md) · [09 Phase 4](./09_Design_저장소_격리_출시게이트.md) |
| 2 | Registry billing reserve/commit | [11 §4](./11_Usage·Drive_Publish_보강.md) |
| 3 | wrapper BE + job queue | [02](./02_design-app_daemon_연동.md) |
| 4 | Teamver 네이티브 FE (필요 시) | — |

---

## 결정 기록

| 일자 | 결정 |
|------|------|
| 2026-06-15 | **빠른 출시 우선** — OD UI 재사용, 커스텀 FE 보류 |
| 2026-06-15 | 1차 통합 = **프록시 + 인증 + 최소 브랜딩 패치** |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-15 | **10 세션·패치** — 브랜딩·인증 보강 SSOT, app-sdk 예외 정정 |
| 2026-06-15 | **09 저장소·격리** — Prod blocker 체크리스트 |
| 2026-06-15 | 초안 — OD UI embed/fast-launch SSOT |

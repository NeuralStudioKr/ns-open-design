# Design — Docs/Slides형 Teamver 연동 (요약)

> **구현·배포 SSOT는 `deploy/teamver/` 입니다.**  
> → [`TEAMVER_APPS_INTEGRATION.md`](../deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md)  
> **EC2·인프라 SSOT:** [07_VM_배포_인프라.md](./07_VM_배포_인프라.md)

| 항목 | 레포 · 경로 |
|------|-------------|
| design-api BE | `deploy/teamver/be/` |
| compose (daemon + BE) | `deploy/teamver/docker-compose.yml` |
| nginx · Terraform | `deploy/teamver/devops/nginx/` · `ns-teamver-devops/terraform/services/teamver-design/` |
| headless client | `packages/teamver-integration/` |
| Main BE AppKey | `ns-teamver-be` — `design` |

**설계 문서는 `docs-teamver/`**, 코드는 `ns-open-design` 본 레포에 둡니다.

---

## 한 줄 구조

```text
design.teamver.com (OD UI) + design-api.teamver.com (wrapper BE) → api.teamver.com (Main BE, 별도 VM)
```

상세: [`TEAMVER_APPS_INTEGRATION.md`](../deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md)

---

## Docs/Slides와 동형인 부분

| 영역 | Docs/Slides 패턴 | Design SSOT |
|------|------------------|-------------|
| Sidecar BFF | FastAPI + `teamver-app-sdk-python` | `deploy/teamver/be/` |
| Cookie SSO | `@teamver/app-sdk` → BFF `/api/v1` | [10 §3](./10_세션·OD패치_보강.md) |
| nginx auth_request | Main BE `session-check` | [10 §3.3](./10_세션·OD패치_보강.md) |
| usage events | `POST /usage/events` + M2M by-model | [11 §3~§5](./11_Usage·Drive_Publish_보강.md) |
| Drive Publish | presigned 3-step + SDK | [11 §6](./11_Usage·Drive_Publish_보강.md) |
| Registry billing | reserve/commit/refund | [11 §4](./11_Usage·Drive_Publish_보강.md) (출시 후) |
| SDK vendor | tarball/wheel in repo | [08](./08_Teamver_SDK_vendor와_배포.md) |

---

## Design만 다른 부분

| 항목 | Docs/Slides | Design |
|------|-------------|--------|
| FE | 커스텀 Next.js 앱 | **OD UI embed** ([05](./05_OD_UI_재사용_빠른출시.md)) |
| daemon | 없음 (자체 BE) | open-design daemon `:7456` |
| 프로젝트 SSOT | 자체 DB + S3 | S3 + Litestream + registry ([09](./09_Design_저장소_격리_출시게이트.md)) |
| usage 생산자 | BE/daemon | **FE-first** ([11 §3.1](./11_Usage·Drive_Publish_보강.md)) |
| export | 자체 format | daemon HTML/ZIP → design-api Publish |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-15 | auth/usage/Drive 상세 → [10](./10_세션·OD패치_보강.md) · [11](./11_Usage·Drive_Publish_보강.md) 위임 |
| 2026-06-15 | 초안 — Docs/Slides형 요약 |

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

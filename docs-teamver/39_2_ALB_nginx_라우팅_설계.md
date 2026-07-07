# Teamver Design — ALB·nginx 라우팅 설계 (affinity / sticky)

**목적:** Phase 4 **Active-Active** 에서 `/api/*` (daemon) 요청을 **같은 EC2** 로 묶는 **L7 라우팅** SSOT.  
**전제:** [39_3](./39_3_scratch_SQLite_SSE_제약.md) — sticky는 **부분 해결**; Phase 2 Passive는 sticky **불필요**.

**관련:** [31 네트워크·TLS·DNS](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md) · [07 §3.2 ALB](./07_VM_배포_인프라.md) · nginx `deploy/teamver/devops/nginx/design.teamver.com.http.conf`

---

## 1. 한 줄 결론

> Production은 **ALB → EC2 nginx :80** ([31](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md)).  
> **daemon (`/api/*`)** affinity SSOT: nginx **`hash $teamver_user_id consistent`** ([§4](#4-nginx-userid-hash-phase-4--ssot)).  
> **ALB stickiness (LBCookie)** 는 multi-node 에서 **OFF** — 브라우저 쿠키가 아니라 **userId 전체 문자열** 해시로 노드 결정 (홀짝·끝자리 규칙 없음).  
> **static·BFF** 는 sticky/hash 없이 로컬 daemon 또는 round-robin OK.

---

## 2. 트래픽 분류 — 무엇에 sticky를 걸까

| 경로 | upstream | sticky | 이유 |
|------|----------|--------|------|
| `/` SPA, `/_next/static/*` | daemon (static) | **OFF** | stateless; CDN/균등 분산 OK |
| `/api/*` | daemon :7456 | **ON** | scratch·SSE·BYOK proxy |
| `/teamver-bff/*` | design-api :16000 | **OFF** | stateless BFF; RDS SSOT |
| `auth_request` → Main BE | 외부 | N/A | session-check only |

**실수:** ALB stickiness를 **전 호스트**에 켜면 design-api까지 한 EC2에 고정 → BFF scale-out 무의미.

### 2.1 Production 호스트 분리 (권장)

현재도 호스트가 나뉜다:

| Host | 주요 upstream |
|------|----------------|
| `design.teamver.com` | nginx → daemon (+ static) |
| `design-api.teamver.com` | nginx → design-api |

**Phase 4 옵션 A (단순):** `design.teamver.com` ALB target group **2 EC2**, stickiness ON — `/api` + static 같이 sticky.  
**옵션 B (정교):** nginx `location` 별 upstream — `/api/` 만 `hash` upstream, `/` 는 round-robin (구현·테스트 부담 ↑).

---

## 3. ALB stickiness (Phase 4 — 1차 권장)

### 3.1 설정 (AWS)

| 항목 | 권장값 | 이유 |
|------|--------|------|
| **Stickiness** | Enabled (LB cookie) | 구현 최소 |
| **Duration** | **86400s (24h)** | 장시간 편집·SSE |
| **Idle timeout** | **3600s** | BYOK SSE ([07 §3.2](./07_VM_배포_인프라.md)) |
| **Health check** | `/_nginx/health` | unhealthy drain |
| **Deregistration delay** | **300~600s** | in-flight SSE drain |

Terraform (개념):

```hcl
stickiness {
  type            = "lb_cookie"
  cookie_duration = 86400
  enabled         = true
}
```

### 3.2 ALB cookie sticky의 특성

| 장점 | 한계 |
|------|------|
| 브라우저 탭·같은 세션 → 같은 EC2 | **시크릿 창** = 다른 노드 |
| nginx 변경 최소 | **다른 기기** = 다른 노드 → S3 sync-down |
| SSE 유지에 적합 | cookie 만료·target drain → **노드 이동** |

→ “userId sticky”와 **동일하지 않음** — 실무 embed는 **대부분 1 browser** 라서 허용 가능.

---

## 4. nginx userId hash (Phase 4 — **SSOT**)

**구현:** `deploy/teamver/devops/nginx/teamver-design-od-daemon-upstream.inc.conf`  
**Peer 목록:** `scripts/render_od_daemon_peers_nginx.sh` → `/etc/nginx/conf.d/teamver-design-od-daemon-peers.inc.conf`

### 4.0 해시 방식 (홀짝·끝자리 아님)

nginx `consistent` hash 는 **userId 문자열 전체**를 해시 ring 에 매핑한다.  
`user-…0` / `user-…1` 같은 **마지막 글자 홀짝 규칙은 없다.**

| hash key | 조건 |
|----------|------|
| `$teamver_user_id` | auth_request / session-probe 성공 후 ( **1순위** ) |
| URI 내 `projectId` | `/api/projects/:id/preview/…` (iframe, session 없음) |
| `$binary_remote_addr` | public static asset 등 fallback |

동일 userId → **항상 같은 EC2 daemon** (브라우저·기기 무관).  
ALB 는 **round-robin** 으로 아무 EC2 nginx 에나 도착 → nginx 가 peer 포함 upstream 으로 **올바른 daemon** 에 프록시.

### 4.1 이미 있는 identity header

nginx `auth_request` 후 daemon으로 전달 ([10](./10_세션·OD패치_보강.md)):

```nginx
auth_request_set $teamver_user_id $upstream_http_x_teamver_user_id;
auth_request_set $teamver_workspace_id $upstream_http_x_teamver_workspace_id;
proxy_set_header X-Teamver-User-Id $teamver_user_id;
proxy_set_header X-Teamver-Workspace-Id $teamver_workspace_id;
```

daemon: `readTeamverIdentityFromRequest(req)` — `apps/daemon/src/teamver-project-access.ts`

### 4.2 upstream hash (개념 — **배포 전 리뷰 필수**)

```nginx
upstream open_design_daemon_hashed {
    hash $teamver_user_id consistent;
    server 127.0.0.1:7456;   # single-host — Phase 4에서는 peer IP
    # server 10.0.1.11:7456;
    # server 10.0.1.12:7456;
}
```

**주의:**

- `$teamver_user_id` 는 **`/api/` location에서 auth_request 성공 후** 만 존재
- 미인증 요청 → hash key 빈값 → **한 backend로 쏠림**
- health `/api/health` 는 **auth 제외** — 별도 upstream

### 4.3 userId vs workspaceId vs projectId

| hash key | 장점 | 단점 |
|----------|------|------|
| **userId** | nginx에 이미 있음 | 동일 project **다인** 편집 시 다른 scratch |
| **workspaceId** | seat 단위 | 한 ws 여러 project 동시 |
| **projectId** | scratch SSOT에 최적 | URL/body마다 다름 — **Phase 5** |

**Phase 4 권장:** userId hash **또는** ALB cookie — product: **동일 deck 동시 공편집 비권장** ([38 §5.5](./38_Design_동시성_용량_확장_가이드.md)).

**CTO·아키텍처 전체 설명:** [39_6 라우팅·의사결정](./39_6_라우팅_아키텍처_CTO_의사결정.md) (이중화 의미, 중앙 nginx 비교, projectId 연기, 장기 Phase 5).

---

## 5. SSE·장기 연결 요구사항

BYOK embed: `POST /api/proxy/…/stream` — **수분~수십분** 연결.

| 레이어 | 설정 |
|--------|------|
| ALB | `idle_timeout = 3600` |
| nginx | `proxy_read_timeout 3600s;` · `proxy_buffering off;` |
| nginx | `proxy_http_version 1.1;` · `Connection ""` (keep-alive) |

**노드 drain:** ALB target deregister → 기존 SSE **끊김** → FE 재연결 → **다른 노드** → S3 sync-down.  
→ drain 전 **connection count** 확인 (39_4).

---

## 6. design-api 이중화 (Phase 4 병행)

design-api는 **stateless** — EC2마다 동일 compose 또는 **별도 ASG**.

| 패턴 | 설명 |
|------|------|
| **Colocated** | 각 EC2에 daemon+design-api — 배포 단순 |
| **Split ASG** | design-api만 N대 — BFF burst 흡수; daemon sticky와 **독립** |

`design-api.teamver.com` ALB target: **round-robin OK** (sticky OFF).

RDS pool: `UVICORN_WORKERS × EC2 수` — max connections 모니터링 ([38 §6.2](./38_Design_동시성_용량_확장_가이드.md)).

---

## 7. Anti-patterns (하지 말 것)

| ❌ | 이유 |
|----|------|
| daemon replica 2, **공유 od-data EBS** | SQLite lock·scratch corruption |
| ALB round-robin on `/api/*` | scratch split-brain |
| stickiness 없이 multi-node | [38 §8.2](./38_Design_동시성_용량_확장_가이드.md) |
| sticky on static only, `/api` RR | SSE 시작·PUT 불일치 |
| drain delay 0s | 사용자 SSE 중간 단절 |

---

## 8. 구현 체크리스트 (Phase 4 착수 전)

- [ ] ALB idle 3600s 확인 ([07](./07_VM_배포_인프라.md))
- [ ] Target group stickiness duration ≥ 24h
- [ ] Health: `/_nginx/health` — daemon down 시 target 제외
- [ ] nginx `/api/` — auth_request + identity header 유지
- [ ] `GET /api/health` — LB probe 경로와 daemon probe 분리 검토
- [ ] Rolling deploy: **한 target drain → deploy → healthy → 다음** (39_4)
- [ ] CloudWatch: target **UnHealthyHostCount** 알람

---

## 9. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-07 | ALB sticky·nginx hash·경로별 정책 SSOT |

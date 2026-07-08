# Teamver Design — Staging Nginx (전용 VM)

**Design Staging VM** — slides/meetings AI Apps staging VM 과 **별도** 머신.  
TLS 종료·리버스 프록시는 Nginx. Main BE(`stg-api.teamver.com`)는 **다른 VM**.

프로덕션은 [docs/DEPLOY-AWS.md](../docs/DEPLOY-AWS.md) (AWS ALB + Production EC2).

**Design 인프라 SSOT:** [docs-teamver/07_VM_배포_인프라.md](../../../docs-teamver/07_VM_배포_인프라.md)  
**Staging vs Production 차이 (TLS·DNS·ALB·왜 staging은 certbot):** [docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md](../../../docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md)  
**ALB cutover · 2노드 · bootstrap 수동 복구:** [docs-teamver/39_4 §10](../../../docs-teamver/39_4_배포_Terraform_운영_Runbook.md#10-ec2-부트스트랩수동-복구-runbook-d6-2노드--신규-ec2-공통)

> **2026-07 staging:** 사용자 TLS 는 **ALB(ACM)** → EC2 nginx **:80 only** (`stg-design.teamver.com.http.conf`). certbot HTTPS conf 는 EIP 직접 노출 시절 legacy — cutover 후 비활성.

---

## 0. 도메인 ↔ 업스트림

| 호스트 | 서비스 | 포트 |
|--------|--------|------|
| `stg-design.teamver.com` | OD web + daemon | `7456` |
| `stg-design-api.teamver.com` | teamver-design-api | `16000` |

Main BE: `stg-api.teamver.com` — Apps JWT exchange·bootstrap M2M (별도 VM).  
**인증 (2026-07):** embed HTML `location /` 는 **auth_request 없음** (Mail 동형 cold start). daemon `/api/*`·design-api 보호 라우트는 **BFF session-probe** (`/_teamver_bff_session` → design-api `/api/v1/auth/session-probe`).

---

## 1. VM · DNS

| 항목 | 내용 |
|------|------|
| **VM** | Design **Staging 전용** (prod VM 과 분리) |
| **권장 사양** | `e2-medium` (2 vCPU, 4GB) |
| **DNS** | `stg-design*` 2호스트 A/AAAA → **이 VM** 공인 IP |

```bash
for d in stg-design.teamver.com stg-design-api.teamver.com; do
  printf '%-32s → %s\n' "$d" "$(dig +short A "$d" @8.8.8.8 | head -1)"
done
```

---

## 2. 컨테이너 기동

```bash
cd ns-open-design/deploy/teamver
cp .env.staging.example .env.staging
# OD_API_TOKEN, TEAMVER_JWKS_URL, DESIGN_BFF_SESSION_SECRET, TEAMVER_INTERNAL_API_KEY, POSTGRES_PASSWD
# staging/prod: TEAMVER_JWT_SECRET(HS256) 금지 — validate_deploy_env.sh
chmod +x scripts/run_docker.sh
bash scripts/run_docker.sh --staging
```

---

## 3. Nginx 적용 (slides 동형)

**전제:** 현재 디렉터리가 `deploy/teamver` (`.../ns-open-design/deploy/teamver`).

```bash
cd devops/nginx
chmod +x apply_teamver_design_staging_nginx_conf.sh issue_stg_design_teamver_cert.sh
sudo cp teamver-design-od-token.conf.example /etc/nginx/conf.d/teamver-design-od-token.conf
# OD_API_TOKEN 편집

# (1) HTTP
sudo bash ./apply_teamver_design_staging_nginx_conf.sh ./stg-design.teamver.com.http.conf

# (2) Let's Encrypt (SAN 2)
sudo bash ./issue_stg_design_teamver_cert.sh

# (3) HTTPS
sudo bash ./apply_teamver_design_staging_nginx_conf.sh ./stg-design.teamver.com.https.conf \
  --disable stg-design.teamver.com.http.conf
```

---

## 4. 검증

```bash
for h in stg-design.teamver.com stg-design-api.teamver.com; do
  printf '%-32s %s\n' "$h" "$(curl -sS -o /dev/null -w '%{http_code}' "https://$h/_nginx/health")"
done
curl -sSI https://stg-design.teamver.com/   # 미인증 → 200 SPA (FE cold start → Main sign-in)
curl -sS https://stg-design-api.teamver.com/api/v1/design/auth/config | head -c 200
# 기대: {"app_id":"teamver-design",...}
curl -sSI https://stg-design.teamver.com/api/runs   # 미인증 BFF → 401 JSON (302 signin 아님)

# plugin asset (sandbox subresource — no session cookie; docs-teamver/25)
curl -sSI "https://stg-design.teamver.com/api/plugins/example-html-ppt-zhangzara-creative-mode/asset/assets/deck-stage.js" | head -15
# 기대: 200 application/javascript (또는 404 plugin 미설치), Location signin 없음

# design-api CORS preflight (embed → design-api cross-origin POST)
curl -si -X OPTIONS \
  -H "Origin: https://stg-design.teamver.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-workspace-id" \
  https://stg-design-api.teamver.com/api/v1/usage/events | head -12
# 기대: HTTP/2 204 + access-control-allow-origin (418 이면 nginx conf 재적용)
```

---

## 5. 파일 목록

| 파일 | 용도 |
|------|------|
| `stg-design.teamver.com.http.conf` | 80 — OD + design-api + certbot |
| `stg-design.teamver.com.https.conf` | 443 TLS |
| `issue_stg_design_teamver_cert.sh` | SAN 2 인증서 |
| `apply_teamver_design_staging_nginx_conf.sh` | conf apply |
| `teamver-design-od-bff.inc.conf` | same-origin design-api BFF (`/teamver-bff/*`) + `/_teamver_bff_session` probe |
| `teamver-design-api-bff-session.inc.conf` | design-api host용 BFF session-probe (protected routes) |
| `teamver-design-api-public-auth.inc.conf` | cold start 공개: config/exchange/session/refresh |
| `teamver-design-api-protected-routes.inc.conf` | usage/bootstrap/projects/drive — BFF auth_request |
| `teamver-design-plugin-preview.inc.conf` | plugin/skill preview sandbox — asset no-auth + CSP ([25](../../../docs-teamver/25_플러그인_preview_샌드박스_nginx_보강.md)) |
| `teamver-design-od-public-static.inc.conf` | Next.js `/_next/*`·favicon — auth_request 제외 ([31 §8.2](../../../docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md#82-chunkloaderror--_nextstaticchunksjs-auth_request-on-static)) |
| `teamver-design-od-preview-scope.inc.conf` | sandbox iframe 서브리소스 `/api/projects/:id/preview/:scope/*` — auth_request 제외, OD bearer만 |
| `teamver-design-od-token.conf.example` | OD_API_TOKEN (서버 로컬) |

**프로덕션 conf:** `design.teamver.com.http.conf` — staging VM 에 enable 하지 않음.

---

## 관련

- [TEAMVER_APPS_INTEGRATION.md](../docs/TEAMVER_APPS_INTEGRATION.md)
- [DEPLOY-AWS.md](../docs/DEPLOY-AWS.md) — 프로덕션 EC2

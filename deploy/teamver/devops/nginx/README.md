# Teamver Design — Nginx (Staging / Production EC2)

**Design Staging·Production EC2** — TLS는 **AWS ALB(ACM)** 가 종료. EC2 nginx는 **:80 only** (`*.http.conf`).  
Main BE(`stg-api` / `api.teamver.com`)는 **다른 스택**.

| 문서 | 내용 |
|------|------|
| **ALB apply 순서·default·empty peers** | [docs-teamver/39_4 §10.11](../../../docs-teamver/39_4_배포_Terraform_운영_Runbook.md#1011-nginx-alb-httpconf-적용-순서--함정-prodstaging) |
| peers 0개 · 502 · health 404 | [39_5 §3.1.1~3.1.3](../../../docs-teamver/39_5_검증_체크리스트_FAQ.md#311-peer-0개-트러블슈팅) |
| 라우팅 설계 | [39_2](../../../docs-teamver/39_2_ALB_nginx_라우팅_설계.md) |
| Production 배포 | [docs/DEPLOY-AWS.md](../docs/DEPLOY-AWS.md) |
| Staging vs Production TLS/DNS | [31](../../../docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md) |

> **2026-07:** 사용자 TLS = ALB → EC2 `:80`. certbot `*.https.conf` 는 **legacy** — ALB cutover 후 **비활성** (`--disable …https.conf`).

---

## Production (ALB) — 적용 순서

```bash
# 전제: deploy.sh --production --rds 완료, OD_DOCKER_PUBLISH_HOST=0.0.0.0
# 권장: sudo apt-get install -y awscli   # peer 자동 발견

cd ~/neural/ns-open-design/deploy/teamver/devops/nginx
sudo bash ./apply_teamver_design_nginx_conf.sh \
  ./design.teamver.com.http.conf \
  --disable design.teamver.com.https.conf

# apply가 자동으로 sites-enabled/default 제거 (ALB Host-less health → 404 방지)
ls -la /etc/nginx/sites-enabled/          # http.conf 만
curl -fsS http://127.0.0.1/_nginx/health  # Host 없이 → ok
cat /etc/nginx/teamver-design-od-daemon-peers.inc   # server …:7456 N줄 (주석만이면 ❌)

# 2노드: 양쪽 기동 후 peer 재생성 (파일 내용 동일해야 함)
cd ~/neural/ns-open-design/deploy/teamver
sudo bash ./scripts/render_od_daemon_peers_nginx.sh
sudo nginx -t && sudo systemctl reload nginx
```

**금지:** `design.teamver.com.https.conf` enable.

### 자주 나는 에러

| 증상 | 원인 | 조치 |
|------|------|------|
| `no servers are inside upstream` | peers.inc 빈 stub + awscli 없음 | [39_4 §10.11 함정 A](../../../docs-teamver/39_4_배포_Terraform_운영_Runbook.md#함정-a--no-servers-are-inside-upstream) |
| `/_nginx/health` 404 | `default` 잔존 또는 nginx -t 실패로 reload 안 됨 | default 제거 + peers 채운 뒤 `nginx -t && reload` |
| peers를 `conf.d/*.conf`에 둠 | bare `server` 파싱 실패 | `/etc/nginx/teamver-design-od-daemon-peers.inc` 만 사용 |

---

## Staging (ALB cutover 후)

```bash
cd devops/nginx
sudo bash ./apply_teamver_design_staging_nginx_conf.sh \
  ./stg-design.teamver.com.http.conf \
  --disable stg-design.teamver.com.https.conf
curl -fsS http://127.0.0.1/_nginx/health
```

---

## 0. 도메인 ↔ 업스트림

| 호스트 | 서비스 | 포트 |
|--------|--------|------|
| `stg-design.teamver.com` / `design.teamver.com` | OD web + daemon | `7456` |
| `stg-design-api.teamver.com` / `design-api.teamver.com` | teamver-design-api | `16000` |

Main BE: `stg-api.teamver.com` / `api.teamver.com` — Apps JWT exchange·bootstrap M2M (별도).  
**인증 (2026-07):** embed HTML `location /` 는 **auth_request 없음** (Mail 동형 cold start). daemon `/api/*`·design-api 보호 라우트는 **BFF session-probe**.

---

## 1. VM · DNS (legacy EIP 직접 노출 — 참고만)

ALB cutover **이전** staging은 EIP A 레코드 + certbot 이었다. **현재 SSOT는 ALB CNAME** ([31](../../../docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md)).

```bash
for d in stg-design.teamver.com stg-design-api.teamver.com; do
  printf '%-32s → %s\n' "$d" "$(dig +short A "$d" @8.8.8.8 | head -1)"
done
# → ALB DNS name 기대
```

---

## 2. 컨테이너 기동

```bash
cd ns-open-design/deploy/teamver
cp .env.staging.example .env.staging
# OD_API_TOKEN, TEAMVER_JWKS_URL, DESIGN_BFF_SESSION_SECRET, TEAMVER_INTERNAL_API_KEY, POSTGRES_PASSWD
# 2노드: OD_DOCKER_PUBLISH_HOST=0.0.0.0
# DaemonDb: OD_DAEMON_DB=postgres + OD_PG_* + RDS CREATE DATABASE 1회 (39_9)
chmod +x scripts/run_docker.sh
bash scripts/run_docker.sh --staging
```

---

## 3. Nginx 적용 — legacy certbot 경로 (EIP 직접 TLS 시절)

> ALB 전환 **후에는 쓰지 않음.** 롤백·문서 보존용.

```bash
cd devops/nginx
chmod +x apply_teamver_design_staging_nginx_conf.sh issue_stg_design_teamver_cert.sh
# (1) HTTP → (2) certbot → (3) HTTPS --disable http
```

---

## 4. 검증

```bash
# 로컬 (ALB health와 동일 — Host 없음)
curl -fsS http://127.0.0.1/_nginx/health

for h in stg-design.teamver.com stg-design-api.teamver.com; do
  printf '%-32s %s\n' "$h" "$(curl -sS -o /dev/null -w '%{http_code}' "https://$h/_nginx/health")"
done
curl -sSI https://stg-design.teamver.com/   # 미인증 → 200 SPA
curl -sS https://stg-design-api.teamver.com/api/v1/design/auth/config | head -c 200
curl -sSI https://stg-design.teamver.com/api/runs   # 미인증 BFF → 401 JSON

# plugin asset (docs-teamver/25)
curl -sSI "https://stg-design.teamver.com/api/plugins/example-html-ppt-zhangzara-creative-mode/asset/assets/deck-stage.js" | head -15

# design-api CORS preflight
curl -si -X OPTIONS \
  -H "Origin: https://stg-design.teamver.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-workspace-id" \
  https://stg-design-api.teamver.com/api/v1/usage/events | head -12
```

---

## 5. 파일 목록

| 파일 | 용도 |
|------|------|
| `design.teamver.com.http.conf` | **Production** ALB → :80 (`default_server`) |
| `stg-design.teamver.com.http.conf` | **Staging** ALB → :80 |
| `*.https.conf` | legacy certbot — ALB 뒤 **disable** |
| `apply_teamver_design_nginx_conf.sh` | Production apply (+ default 비활성 + peers render) |
| `apply_teamver_design_staging_nginx_conf.sh` | Staging apply |
| `teamver-design-od-daemon-upstream.inc.conf` | hash upstream + local upstream |
| `teamver-design-od-daemon-peers.inc.conf.example` | peers stub → `/etc/nginx/teamver-design-od-daemon-peers.inc` |
| `../../scripts/render_od_daemon_peers_nginx.sh` | cluster private IP → peers.inc |
| `teamver-design-od-bff.inc.conf` | same-origin BFF + session-probe |
| `teamver-design-api-*.inc.conf` | design-api auth / protected / CORS |
| `teamver-design-plugin-preview.inc.conf` | plugin preview ([25](../../../docs-teamver/25_플러그인_preview_샌드박스_nginx_보강.md)) |
| `teamver-design-od-public-static.inc.conf` | `/_next/*` auth 제외 ([31 §8.2](../../../docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md#82-chunkloaderror--_nextstaticchunksjs-auth_request-on-static)) |
| `teamver-design-od-preview-scope.inc.conf` | preview scope auth 제외 |
| `teamver-design-od-token.conf.example` | OD_API_TOKEN |

---

## 관련

- [TEAMVER_APPS_INTEGRATION.md](../docs/TEAMVER_APPS_INTEGRATION.md)
- [DEPLOY-AWS.md](../docs/DEPLOY-AWS.md)
- [39_4 §10.11](../../../docs-teamver/39_4_배포_Terraform_운영_Runbook.md#1011-nginx-alb-httpconf-적용-순서--함정-prodstaging)

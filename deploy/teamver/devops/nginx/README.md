# Teamver Design — Staging Nginx (전용 VM)

**Design Staging VM** — slides/meetings AI Apps staging VM 과 **별도** 머신.  
TLS 종료·리버스 프록시는 Nginx. Main BE(`stg-api.teamver.com`)는 **다른 VM**.

프로덕션은 [docs/DEPLOY-AWS.md](../docs/DEPLOY-AWS.md) (AWS ALB + Production EC2).

**Design 인프라 SSOT:** [docs-teamver/07_VM_배포_인프라.md](../../../docs-teamver/07_VM_배포_인프라.md)

---

## 0. 도메인 ↔ 업스트림

| 호스트 | 서비스 | 포트 |
|--------|--------|------|
| `stg-design.teamver.com` | OD web + daemon | `7456` |
| `stg-design-api.teamver.com` | teamver-design-api | `16000` |

Main BE: `stg-api.teamver.com` — `auth_request`·bootstrap (별도 VM).

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
# OD_API_TOKEN, TEAMVER_JWT_SECRET, TEAMVER_INTERNAL_API_KEY, POSTGRES_PASSWD
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
curl -sSI https://stg-design.teamver.com/   # 미인증 → 302 stg.teamver.com/login

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
| `teamver-design-od-bff.inc.conf` | same-origin design-api BFF (`/teamver-bff/*`) |
| `teamver-design-plugin-preview.inc.conf` | plugin/skill preview sandbox — asset no-auth + CSP ([25](../../../docs-teamver/25_플러그인_preview_샌드박스_nginx_보강.md)) |
| `teamver-design-od-token.conf.example` | OD_API_TOKEN (서버 로컬) |

**프로덕션 conf:** `design.teamver.com.http.conf` — staging VM 에 enable 하지 않음.

---

## 관련

- [TEAMVER_APPS_INTEGRATION.md](../docs/TEAMVER_APPS_INTEGRATION.md)
- [DEPLOY-AWS.md](../docs/DEPLOY-AWS.md) — 프로덕션 EC2

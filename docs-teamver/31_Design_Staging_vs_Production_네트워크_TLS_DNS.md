# Design Staging vs Production — 네트워크·TLS·DNS·로드밸런싱 SSOT

**목적:** “왜 staging과 production이 다르게 보이는가?”를 **한 문서**에서 이해할 수 있게 정리한다.  
**대상:** Design EC2 배포·nginx·DNS 설정 담당자.  
**코드 SSOT:** `deploy/teamver/devops/nginx/` · Terraform `ns-teamver-devops/terraform/services/teamver-design/`

**관련 (세부 runbook):**

| 환경 | 문서 |
|------|------|
| Staging nginx·certbot | [deploy/teamver/devops/nginx/README.md](../deploy/teamver/devops/nginx/README.md) |
| Production EC2·ALB | [deploy/teamver/docs/DEPLOY-AWS.md](../deploy/teamver/docs/DEPLOY-AWS.md) |
| GCP DNS + ACM (prod) | [GCP_DNS_AND_ACM.md](../../../ns-teamver-devops/terraform/services/teamver-design/docs/GCP_DNS_AND_ACM.md) |
| 인프라 전체 | [07 VM 배포·인프라](./07_VM_배포_인프라.md) |
| Production 출시 순서 | [17 Production 출시 작업 순서](./17_Production_출시_작업_순서.md) |

---

## 0. 한 줄 요약 (꼭 기억할 것)

| 질문 | 답 |
|------|-----|
| **GCP Cloud DNS는 뭐 하는데?** | `teamver.com` **이름표** — “`design.teamver.com`은 어디로 가라”만 알려 줌. 앱·TLS·nginx와 **별개** (Mail MX도 같은 zone). |
| **Production ALB는 뭐 하는데?** | 브라우저 **HTTPS(443) 종료** + (단일 EC2여도) **표준 prod 진입점** + 헬스체크. |
| **nginx는 뭐 하는데?** | EC2 **안쪽 HTTP 라우터** — Teamver 로그인 검증, `design` / `design-api` 분기, daemon·design-api로 프록시. **staging은 여기서 TLS도 함.** **production은 TLS는 ALB, nginx는 :80만.** |
| **왜 staging이랑 다름?** | **의도된 설계.** Staging = 빠르게·저렴하게·EIP+certbot. Production = Teamver Page/Mail과 같은 **ALB+ACM** 패턴. |

---

## 1. 왜 두 환경을 다르게 만들었나?

### 1.1 실수가 아니라 Trade-off

Design은 Slides/Docs와 같이 **호스트 2개**(UI + API) 패턴을 따른다.  
**TLS·DNS만** staging과 production에서 다르다.

| 목표 | Staging | Production |
|------|---------|--------------|
| **비용·단순성** | ALB 없음 → 월 ALB 비용·ACM 연동 단계 생략 | ALB 비용 감수, 대신 운영 표준 |
| **속도** | EIP + A 레코드 + certbot → **DNS 2줄**이면 HTTPS | ACM validation + Terraform + ALB CNAME → 단계 많음 |
| **운영 표준** | 팀 내부·QA용 — certbot 갱신만 신경 | **Page/Mail prod와 동형** — ACM 자동 갱신, ALB idle timeout(SSE), SG 분리 |
| **보안** | EC2 :443 인터넷 노출 (certbot) | **EC2 :443 닫음** — 인터넷 → ALB만, EC2는 ALB SG에서 :80만 |

Terraform 변수 `enable_alb`:

- **staging** `false` → ALB·ACM 리소스 **0개**
- **production** `true` → ALB + ACM listener + target group

### 1.2 “복잡해 보이는” 이유

Production 한 번 올릴 때 **역할이 3곳**으로 나뉜다:

1. **GCP Cloud DNS** — `teamver.com` zone (Route53이 아님 → Terraform이 사용자 DNS 자동 생성 **안 함**)
2. **AWS ALB + ACM** — HTTPS 종료
3. **EC2 nginx + Docker** — 앱 (staging과 **거의 동일한** compose·nginx 로직)

staging은 ②가 없어서 “EC2 하나 = 전부”처럼 보인다.

### 1.3 이게 좋은 방법인가?

| 관점 | 판단 |
|------|------|
| **Production** | ✅ **ALB + ACM + EC2 nginx HTTP** — AWS에서 흔한 패턴. SSE(긴 스트림), 인증서 갱신, EC2 직접 노출 최소화에 유리. |
| **Staging** | ✅ **EIP + certbot** — 소규모 staging VM(slides/docs/design)과 **동일** 운영 습관. ALB까지 두면 staging 비용·설정만 불필요하게 증가. |
| **단점** | ⚠️ 두 runbook을 알아야 함. GCP DNS에 **ACM용 `_xxx` CNAME**과 **사용자용 `design` CNAME**을 혼동하기 쉬움 → §4 참고. |

**통일하지 않은 이유:** staging까지 ALB를 쓰면 비용·ACM·Phase A~C runbook이 **매 staging VM마다** 필요해지고, Design staging은 **이미 EIP+certbot으로 검증된** slides/docs 패턴과 맞춰져 있다.

---

## 2. 역할 분담 — GCP / ALB / nginx / Docker

### 2.1 공통: 앱 계층 (staging = production)

두 환경 모두 **EC2 한 대**에서 Docker compose로 동일 계열 서비스를 띄운다.

| 프로세스 | 포트 | 인터넷 노출 |
|----------|------|-------------|
| `open-design-daemon` (OD UI+API) | **7456** | ❌ loopback만 |
| `teamver-design-api` | **16000** | ❌ loopback만 |
| `litestream` (sidecar) | — | ❌ |
| **nginx** | **80** (prod) / **80+443** (stg) | ✅ (경로는 환경별로 다름) |

**7456 / 16000을 SG에 안 여는 이유:** nginx가 `auth_request`·OD token·Host 라우팅을 담당. 직접 노출하면 로그인 게이트 우회 위험.

### 2.2 GCP Cloud DNS (`teamver.com` managed zone)

**역할:** 권한 있는 DNS — 브라우저가 “`design.teamver.com` IP가 뭐야?”라고 물을 때 답함.

**하지 않는 것:**

- TLS 종료 ❌
- 로드밸런싱 ❌ (CNAME이 ALB를 가리킬 뿐, GCP가 트래픽을 나누지 않음)
- Teamver 로그인 ❌

**teamver.com zone을 GCP에 두는 이유:** Mail(MX/SES), Docs, Slides, Design 등 **여러 서비스**가 같은 apex 아래 서브도메인을 쓴다. AWS Route53에 `teamver.com` zone이 Terraform에 없어서 **Design prod ALB alias도 GCP에 수동 등록**한다.

### 2.3 AWS ALB (Production only)

**역할:**

- 브라우저 ↔ **HTTPS :443** (ACM 인증서)
- Target: EC2 nginx **:80**
- `/_nginx/health` 로 healthy/unhealthy
- **idle timeout 3600s** — OD SSE/장시간 스트림

**하지 않는 것:**

- `auth_request` (Teamver session-check) ❌ → nginx
- `design` vs `design-api` Host 분기 ❌ → nginx (ALB는 Host 헤더 **그대로** EC2로 전달)

### 2.4 EC2 nginx

**공통 역할 (staging + production):**

- `design*.teamver.com` / `stg-design*.teamver.com` → `127.0.0.1:7456`
- `design-api*` / `stg-design-api*` → `127.0.0.1:16000`
- `auth_request` → Main BE `session-check` (stg-api / api.teamver.com)
- 미인증 → Main FE sign-in URL로 302
- `/api/` (daemon)에 `Authorization: Bearer $OD_API_TOKEN` 주입
- `/_nginx/health` → `200 ok` (ALB health check)

**환경별 차이:**

| | Staging | Production |
|---|---------|------------|
| listen | **:80 + :443** | **:80 only** |
| TLS 인증서 | **Let's Encrypt (certbot)** on EC2 | **없음** (ALB ACM) |
| conf 파일 | `stg-design.teamver.com.{http,https}.conf` | `design.teamver.com.http.conf` **only** |
| `X-Forwarded-Proto` | `$scheme` (https) | **`$http_x_forwarded_proto`** (ALB가 https 넣어 줌) |

---

## 3. 트래픽 경로 (그림)

### 3.1 Staging — “EC2가 문 앞까지”

```text
[브라우저]
    │  HTTPS :443
    ▼
GCP Cloud DNS
    │  A 레코드 → Staging EC2 EIP (예: 54.116.160.243)
    ▼
┌─────────────────────────────────────────┐
│  Staging EC2                             │
│  nginx :443 (Let's Encrypt)            │
│       │ auth_request → stg-api.teamver.com
│       ├─ Host: stg-design.teamver.com → :7456 daemon
│       └─ Host: stg-design-api...      → :16000 design-api
└─────────────────────────────────────────┘
```

**certbot 단계:** 먼저 `*.http.conf` (:80, ACME challenge) → 인증서 발급 → `*.https.conf` enable.

### 3.2 Production — “ALB가 HTTPS, EC2는 HTTP만”

```text
[브라우저]
    │  HTTPS :443
    ▼
GCP Cloud DNS
    │  CNAME design / design-api → ALB DNS name
    ▼
┌─────────────────────────────────────────┐
│  AWS ALB (ap-northeast-2)                │
│  TLS: ACM (design + design-api SAN)      │
│  Listener :443 → Target Group :80        │
└─────────────────┬───────────────────────┘
                  │  HTTP :80 (평문, VPC 내부/ALB→EC2)
                  ▼
┌─────────────────────────────────────────┐
│  Production EC2 (EIP는 SSH용, DNS 아님)   │
│  nginx :80 only                          │
│       │ auth_request → api.teamver.com   │
│       ├─ Host: design.teamver.com → :7456
│       └─ Host: design-api...      → :16000
└─────────────────────────────────────────┘
```

**EIP (`3.34.223.229` 등):** `ssh ubuntu@...` · 배포용. **브라우저 DNS에 A 레코드로 넣지 않는다.**

---

## 4. GCP Cloud DNS — 레코드 종류 (헷갈리기 쉬운 부분)

같은 zone에 **용도가 다른** 레코드가 공존한다.

### 4.1 Production ACM 검증용 (Phase A)

| 예시 | Type | 의미 |
|------|------|------|
| `_2114d3c8....design.teamver.com` | CNAME | `_d080fc60....acm-validations.aws` |

- **underscore(`_`)로 시작** — 사용자 URL 아님
- ACM이 “이 도메인 소유 맞아?” 확인할 때만 사용
- **Issued 후에도 유지** (갱신 시 필요)
- 브라우저가 `https://design.teamver.com` 접속할 때 **이 레코드만으로는 부족** → NXDOMAIN

### 4.2 Production 사용자 트래픽 (Phase C) — **필수**

| DNS name (GCP UI) | Type | Data |
|-------------------|------|------|
| `design` | **CNAME** | `teamver-design-prod-alb-....elb.amazonaws.com` |
| `design-api` | **CNAME** | **동일** ALB DNS name |

확인:

```bash
terraform -chdir=ns-teamver-devops/terraform/services/teamver-design output -raw alb_dns_name
dig +short design.teamver.com @8.8.8.8
```

### 4.3 Staging 사용자 트래픽

| DNS name | Type | Data |
|----------|------|------|
| `stg-design` | **A** | Staging EC2 **EIP** |
| `stg-design-api` | **A** | **동일** EIP |

Production의 `design` A 레코드를 EIP로 넣으면 **ALB·ACM을 우회** → TLS/헬스/운영 설계와 어긋남.

---

## 5. Staging vs Production — 전 항목 대조표

| 항목 | Staging | Production |
|------|---------|------------|
| **호스트** | `stg-design.teamver.com`, `stg-design-api.teamver.com` | `design.teamver.com`, `design-api.teamver.com` |
| **EC2** | `t3.large`, EIP | `t3.xlarge`, EIP + **ALB** |
| **Terraform `enable_alb`** | `false` | `true` |
| **사용자 DNS (GCP)** | **A** → EIP | **CNAME** → ALB |
| **ACM validation CNAME** | (staging certbot — **불필요**) | **`_xxx.design...` → acm-validations.aws** |
| **TLS 종료** | **EC2 nginx + Let's Encrypt** | **ALB + ACM** |
| **EC2 nginx listen** | 80 + 443 | **80 only** |
| **nginx conf** | `stg-design.teamver.com.http.conf` → certbot → `https.conf` | `design.teamver.com.http.conf` **only** |
| **EC2 :443 인터넷** | ✅ (certbot) | ❌ (`ec2_public_web_cidr_blocks = []`) |
| **로드밸런서** | 없음 (EIP 1대) | **ALB** (현재 target EC2 1대, 확장 가능) |
| **인증서 갱신** | certbot (cron) | **ACM 자동** |
| **ALB idle timeout** | — | **3600s** (SSE) |
| **Health check** | (수동 curl) | ALB → `/_nginx/health` |
| **Main BE session-check** | `stg-api.teamver.com` | `api.teamver.com` |
| **RDS** | `teamver-staging-postgres` + DB `teamver_design_staging` | **`teamver-design-prod-postgres`** + `teamver_design_production` |
| **S3 bucket** | `teamver-design-staging-data` | `teamver-design-prod-data` |
| **S3 creds** | instance profile (hop 2) 또는 임시 static key | **instance profile only** (static key validate fail) |
| **`.env`** | `.env.staging` | `.env.production` |
| **deploy** | `deploy.sh --staging --rds` | `deploy.sh --production --rds` |
| **nginx apply script** | `apply_teamver_design_staging_nginx_conf.sh` | `apply_teamver_design_nginx_conf.sh` |
| **상세 runbook** | [devops/nginx/README.md](../deploy/teamver/devops/nginx/README.md) | [DEPLOY-AWS.md](../deploy/teamver/docs/DEPLOY-AWS.md) |

---

## 6. 인증서 — 누가, 어디서, 어떻게

### 6.1 Staging (Let's Encrypt on EC2)

1. GCP: `stg-design*` → EIP **A**
2. nginx: `stg-design.teamver.com.http.conf` (:80, ACME)
3. `issue_stg_design_teamver_cert.sh` (certbot)
4. nginx: `stg-design.teamver.com.https.conf` enable, http conf disable

인증서 파일: EC2 `/etc/letsencrypt/...` — nginx가 직접 참조.

### 6.2 Production (ACM on ALB)

1. **Phase A (apply 전):** AWS ACM ap-northeast-2에서 `design` + `design-api` SAN 요청
2. GCP: ACM이 알려 준 **`_xxx` validation CNAME** 추가 → Status **Issued**
3. `prod.terraform.tfvars`: `alb_certificate_arn = "arn:aws:acm:..."`
4. `terraform apply` → ALB HTTPS listener 생성
5. **Phase C:** GCP **`design` / `design-api` → ALB CNAME** (§4.2)
6. EC2 nginx: **certbot/443 conf 사용 안 함**

**금지:** `design.teamver.com.https.conf` enable → ALB(:443 TLS) + EC2(:443 TLS) **이중 종료·redirect loop** 위험.

---

## 7. 로드밸런싱

| | Staging | Production |
|---|---------|------------|
| **LB 장치** | 없음 | **AWS Application Load Balancer** |
| **Target** | — | EC2 nginx :80 (instance ID 등록) |
| **다중 EC2** | 현재 1대 (수동 DNS) | ALB TG에 instance 추가하면 **수평 확장 가능** (nginx conf 동일) |
| **SSE/장시간 연결** | nginx `proxy_read_timeout` | ALB **idle_timeout=3600** + nginx timeout |

현재 Design prod는 **EC2 1대**지만, ALB를 둔 이유는 “나중에 TG만 늘리면 됨” + **표준 prod TLS 경계** 때문이다.

---

## 8. 자주 하는 실수 · 증상

| 실수 | 증상 | 해결 |
|------|------|------|
| GCP에 **`design` CNAME 없음** (validation `_xxx`만 있음) | `DNS_PROBE_FINISHED_NXDOMAIN` | §4.2 CNAME 2개 추가 |
| prod `design` → **EIP A 레코드** | ALB/ACM 우회, TLS·헬스 이상 | CNAME → ALB |
| prod EC2 **`https.conf` enable** | redirect loop, 이중 TLS | `http.conf` only |
| staging runbook으로 prod nginx | certbot/443 기대 | prod는 `design.teamver.com.http.conf` |
| **`GET /` 500** (`/_nginx/health`는 200) | nginx `auth_request` → `api.teamver.com` SSL/SNI 실패 | §8.1 |
| loopback OK, 브라우저 fail | DNS/ALB 문제 | `dig design.teamver.com`, ALB target healthy |
| daemon crash `accessKeyId` | S3 IMDS/creds | [18 Instance Profile](./18_EC2_IAM_Instance_Profile_S3_설정.md) |

### 8.1 Production `GET /` 500 — auth_request + GCP Main BE

**증상:** 브라우저·콘솔 `GET https://design.teamver.com/ 500`. `/_nginx/health` 는 **200**.

**원인:** `location /` 는 nginx **`auth_request`** 로 Main BE `api.teamver.com/api/auth/session-check` 를 먼저 호출한다.  
Production Main BE는 **GCP** (`34.54.x.x`). nginx `upstream { server api.teamver.com:443 }` 는 reload 시 **IP로 캐시**하는데, IP 직접 TLS는 **SNI 없음** → GCP LB가 handshake 끊음 → subrequest **502** → 클라이언트 **500**.

**nginx error.log 예:**

```text
peer closed connection in SSL handshake ... upstream: "https://34.54.77.213:443/api/auth/session-check"
auth request unexpected status: 502
```

**해결 (코드 SSOT):** `design.teamver.com.http.conf` — `resolver` + **변수 `proxy_pass`**:

```nginx
resolver 127.0.0.53 valid=300s ipv6=off;
set $teamver_main_be_host api.teamver.com;
proxy_pass https://$teamver_main_be_host/api/auth/session-check;
```

Staging `stg-api.teamver.com`(AWS) 은 static upstream으로도 동작할 수 있으나, prod는 위 패턴 **필수**.

**정상(미로그인):** `GET /` → **302** → `https://teamver.com/auth/signin?returnTo=https%3A%2F%2Fdesign.teamver.com/`

### 8.2 ChunkLoadError — `/_next/static/chunks/*.js` (auth_request on static)

**증상:** 콘솔 `ChunkLoadError: Failed to load chunk /_next/static/chunks/xxx.js`. favicon도 함께 실패할 수 있음.

**원인:** nginx `location /` 의 `auth_request` 가 **Next.js 정적 청크**에도 적용됨. 미로그인·세션 만료·로그인 직후 쿠키 타이밍 등으로 subrequest가 **401/302** → 브라우저는 JS 대신 HTML(로그인 redirect)을 받음 → `ChunkLoadError`.

**확인:**

```bash
# 302면 auth_request 문제 (200이어야 함)
curl -sS -o /dev/null -w "%{http_code}\n" \
  https://design.teamver.com/_next/static/chunks/07qylarpgn99o.js
```

**해결 (코드 SSOT):** `teamver-design-od-public-static.inc.conf` — `^~ /_next/` 는 **auth 없이** daemon `:7456`으로 프록시 (해시된 빌드 산출물은 공개). `apply_*_nginx_conf.sh` 가 include 자동 복사.

**즉시 (브라우저):** 하드 리프레시(Cmd+Shift+R) 또는 시크릿 창에서 `teamver.com` 로그인 후 `design.teamver.com` 재접속.

---

## 9. 검증 명령 (복붙)

### Staging

```bash
curl -sf https://stg-design.teamver.com/_nginx/health
curl -sf https://stg-design-api.teamver.com/_nginx/health
curl -sS http://127.0.0.1:7456/api/health    # EC2 내부
```

### Production

```bash
# EC2 내부
curl -sS -H "Host: design.teamver.com" http://127.0.0.1/_nginx/health

# 외부 (DNS Phase C 후)
curl -sf https://design.teamver.com/_nginx/health
curl -sf https://design-api.teamver.com/_nginx/health

dig +short design.teamver.com @8.8.8.8
```

---

## 10. 관련 Terraform · 파일 위치

| 리소스 | Staging | Production |
|--------|---------|------------|
| tfvars | `staging.terraform.tfvars` | `prod.terraform.tfvars` |
| state | `teamver-design/staging/...` | `teamver-design/prod/...` + `backend-prod.hcl` |
| ALB | 없음 | `alb.tf`, `aws_lb_target_group.nginx` |
| nginx conf | `stg-design.teamver.com.{http,https}.conf` | `design.teamver.com.http.conf` |
| apply script | `apply_teamver_design_staging_nginx_conf.sh` | `apply_teamver_design_nginx_conf.sh` |

---

## 11. FAQ

**Q. nginx를 prod에서도 TLS 하면 안 되나?**  
A. ALB 뒤에서 EC2 443을 열면 인증서 이중 관리·SG 노출·redirect loop가 생긴다. Teamver prod Design/Page/Mail은 **ALB TLS + EC2 HTTP**가 표준.

**Q. staging도 ALB 쓰면 runbook 하나로 통일되지 않나?**  
A. 가능하지만 staging마다 ALB+ACM+Phase A~C 비용·작업이 늘고, slides/docs staging과 **운영 습관이 달라진다**. 현재는 EIP+certbot이 staging 전체와 맞춰져 있다.

**Q. GCP Cloud DNS를 AWS Route53으로 옮기면?**  
A. `teamver.com` 전체(Mail 등) 이전이 필요. Design만 Route53에 두는 건 zone 분할 정책 문제 — **현재는 GCP 수동 CNAME이 정식**.

**Q. `design-api`도 ALB 하나에 묶는 이유?**  
A. Host header로 nginx가 :7456 vs :16000 분기. ALB 2개 필요 없음. ACM SAN에 `design-api` 포함.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-30 | §8.1 — prod `GET /` 500 (auth_request SNI·GCP api.teamver.com) |
| 2026-06-29 | 초版 — staging/prod 네트워크·TLS·DNS·역할 분담 SSOT (NXDOMAIN 사례 반영) |

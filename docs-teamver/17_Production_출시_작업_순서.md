# Design Production 출시 — 작업 순서 SSOT

**목적:** Production 공개 오픈까지 **해야 할 일을 순서대로** 고정한다.  
**선행 문서:** [31 Staging vs Production 네트워크·TLS·DNS](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md) · [09 저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md) · [07 VM 배포·인프라](./07_VM_배포_인프라.md) · [DEPLOY-AWS.md](../deploy/teamver/docs/DEPLOY-AWS.md) · [GCP_DNS_AND_ACM.md](../../../ns-teamver-devops/terraform/services/teamver-design/docs/GCP_DNS_AND_ACM.md)

**범례:** `[ ]` 미완 · `[x]` 완료(증적 있음) · `[~]` 부분 · **담당** = 작업 위치

---

## 0. 출시 전제 (Track A Acceptance)

아래 **G1~G6** 미충족 시 공개 오픈 금지 ([09 §2](./09_Design_저장소_격리_출시게이트.md)).

| # | 기준 | 검증 |
|---|------|------|
| G1 | 프로젝트 파일 SSOT → S3 (instance profile) | `check_storage_isolation.sh --production` |
| G2 | `app.sqlite` Litestream → S3 | Litestream profile + restore dry-run smoke |
| G3~G5 | registry + access 격리 | `run_post_deploy_track_a.sh --e2e-strict` |
| G6 | scratch only + 알람 runbook | CW alarm apply + scratch metrics 권장 |
| G7 | Drive publish (권장) | `TEAMVER_DRIVE_PUBLISH_FOLDER_ID` |

**코드 Phase:** 0(인프라) → 1+3(storage+registry) → 2(Litestream) → **§14 E2E** → prod DNS 트affic.

---

## 1. 권장 전체 순서 (한 페이지)

```text
┌─ Step 0 ─ Staging 실증 (같은 패턴, 낮은 리스크) ─────────────────────┐
│  S3 creds · daemon healthy · post-deploy smoke od_storage=ok        │
└────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Step 1 ─ Phase A: ACM Issued (apply 전) ────────────────────────────┐
│  AWS ACM ap-northeast-2 · GCP validation CNAME · alb_certificate_arn │
└────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Step 2 ─ Phase B: Terraform prod apply ─────────────────────────────┐
│  EC2 + ALB + RDS + S3 + IAM (hop limit 2)                            │
└────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Step 3 ─ Phase C: GCP 사용자 DNS ───────────────────────────────────┐
│  design / design-api → ALB CNAME (EIP 아님)                          │
└────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Step 4 ─ Phase D: Production EC2 앱 ───────────────────────────────┐
│  .env.production · phase0 activate · deploy · Litestream · seed    │
└────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Step 5 ─ Phase E: 출시 게이트 검증 ─────────────────────────────────┐
│  smoke · storage isolation · e2e-strict · CW alarms                │
└────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─ Step 6 ─ 트affic 오픈 / 모니터링 ───────────────────────────────────┐
│  DNS TTL 전파 확인 · 소수 내부 사용자 → 공개                         │
└────────────────────────────────────────────────────────────────────┘
```

**Production vs Staging 차이 (기억용):**

| 항목 | Staging | Production |
|------|---------|------------|
| TLS | EC2 Nginx + Let's Encrypt | **ALB + ACM** |
| DNS | EIP | **ALB CNAME** (GCP) |
| RDS | 공유 staging postgres | **전용** `teamver-design-prod-postgres` |
| S3 creds | static key **허용** (Docker 우회) | **instance profile only** (static key validate fail) |
| EC2 IMDS hop | 2 권장 (terraform prod는 2) | terraform **2** |

S3 저장 시점: [16 S3 데이터 저장 시점 SSOT](./16_S3_데이터_저장_시점_SSOT.md)

---

## 2. Step 0 — Staging 실증 (Production 직전 권장)

**왜:** prod와 동일 storage/registry 코드 경로를 staging에서 먼저 증명.

| # | 작업 | 담당 | 명령 / 증적 |
|---|------|------|-------------|
| 0-1 | Staging S3 — daemon 기동 | Design Staging EC2 | IAM user key 또는 hop limit 2 + instance profile |
| 0-2 | `.env.staging` validate | EC2 | `bash scripts/validate_deploy_env.sh --staging --rds` |
| 0-3 | deploy + smoke | EC2 | `bash deploy.sh --staging --rds` → `run_post_deploy_track_a.sh --staging --rds --smoke` |
| 0-4 | storage isolation | EC2 | `bash scripts/check_storage_isolation.sh --staging` — **0 fail** |
| 0-5 | (선택) Track A E2E | EC2 | `run_post_deploy_track_a.sh --staging --rds --smoke --e2e` |

**완료 기준:** `checks.od_storage=ok` (degraded 아님), daemon crash loop 없음.

---

## 3. Step 1 — Phase A: ACM (Terraform apply **전**)

**SSOT:** [GCP_DNS_AND_ACM.md §Phase A](../../../ns-teamver-devops/terraform/services/teamver-design/docs/GCP_DNS_AND_ACM.md)

| # | 작업 | 담당 |
|---|------|------|
| 1-1 | ACM 인증서 요청 (`design.teamver.com`, `design-api.teamver.com`) | AWS Console ap-northeast-2 |
| 1-2 | GCP validation CNAME | GCP Cloud DNS |
| 1-3 | ACM Status = **Issued** | AWS Console |
| 1-4 | `prod.terraform.tfvars` → `alb_certificate_arn` | 노트북 (devops repo) |

**완료 기준:** `alb_certificate_arn` 이 Issued ARN과 일치.

---

## 4. Step 2 — Phase B: Terraform prod

**SSOT:** `ns-teamver-devops/terraform/services/teamver-design/prod.terraform.tfvars`

```bash
cd ns-teamver-devops/terraform/services/teamver-design
export TF_VAR_teamver_design_rds_pass='…'   # ≠ staging, ≠ Main BE GCP
terraform init -backend-config=backend-prod.hcl -reconfigure
terraform plan -var-file=prod.terraform.tfvars -out=tfplan-prod
# plan 확인: aws_lb_listener.https, RDS, S3, EC2 instance profile
terraform apply tfplan-prod
terraform output post_deploy_checklist
```

| # | 산출물 | 확인 |
|---|--------|------|
| 2-1 | S3 `teamver-design-prod-data` | `terraform output project_data_bucket` |
| 2-2 | RDS endpoint | `terraform output -raw postgres_host` |
| 2-3 | ALB DNS | `terraform output alb_dns_name` |
| 2-4 | EC2 EIP + SSH | `terraform output ssh_command` |
| 2-5 | IAM instance profile S3 policy | EC2 role `teamver-design-prod-app` |

**완료 기준:** apply 성공 + output 값이 `.env.production` POSTGRES_HOST 등과 일치.

---

## 5. Step 3 — Phase C: GCP 사용자 DNS

**SSOT:** [GCP_DNS_AND_ACM.md §Phase C](../../../ns-teamver-devops/terraform/services/teamver-design/docs/GCP_DNS_AND_ACM.md)

| 레코드 | 타입 | 값 |
|--------|------|-----|
| `design.teamver.com` | CNAME | `terraform output alb_dns_name` |
| `design-api.teamver.com` | CNAME | 동일 ALB |

**주의:** EIP로 A 레코드 넣으면 ALB TLS 경로가 깨짐.

**완료 기준:**

```bash
dig +short design.teamver.com
dig +short design-api.teamver.com
# → ALB hostname
```

---

## 6. Step 4 — Phase D: Production EC2 앱 배포

### 4-1. 레포·디렉터리 (Production EC2)

```bash
ssh -i ~/.k/ec2-key-teamver-prod-design.pem ubuntu@<prod-eip>
sudo mkdir -p /opt/teamver-design && sudo chown ubuntu:ubuntu /opt/teamver-design
cd /opt/teamver-design
git clone / pull ns-open-design   # vendor/teamver 포함 — [08 SDK vendor](./08_Teamver_SDK_vendor와_배포.md)
cd deploy/teamver
cp .env.production.example .env.production
```

### 4-2. `.env.production` secrets (필수)

| 변수 | 출처 | validate |
|------|------|----------|
| `OD_API_TOKEN` | `openssl rand -hex 32` (nginx·daemon 공유) | **필수 fail** |
| `TEAMVER_JWT_SECRET` | Main BE prod `JWT_SECRET_KEY` | **필수 fail** |
| `TEAMVER_INTERNAL_API_KEY` | Main BE prod 동일 | 필수 |
| `POSTGRES_HOST` | `terraform output -raw postgres_host` | 필수 |
| `POSTGRES_PASSWD` | `TF_VAR_teamver_design_rds_pass` | 필수 |
| `ANTHROPIC_API_KEY` 또는 `TEAMVER_OD_API_KEY` | LLM | prod **필수 fail** |
| `OD_S3_*` | bucket/region/prefix | **Access Key 넣지 않음** (instance profile) |
| `LITESTREAM_BUCKET` | `teamver-design-prod-data` | G2 — warn if unset |

**금지:** `OD_S3_ACCESS_KEY_ID` / `AWS_ACCESS_KEY_ID` (validate fail). 긴급만 `ALLOW_STATIC_AWS_KEYS=1`.

### 4-3. Phase 0 env merge + validate

```bash
bash scripts/run_production_phase0_activate.sh --from-terraform
bash scripts/validate_deploy_env.sh --production --rds
```

### 4-4. Compose 배포 + Litestream (G2)

```bash
bash deploy.sh --production --rds
# Litestream (09 Phase 2 / G2):
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --env-file .env.production --profile litestream up -d
bash scripts/seed_od_runtime_config.sh --production
```

**Production daemon S3:** terraform EC2는 `http_put_response_hop_limit = 2` — Docker 컨테이너가 instance profile creds 사용 가능. Staging과 달리 **static IAM user 불필요**. 상세: [18 EC2 Instance Profile · S3](./18_EC2_IAM_Instance_Profile_S3_설정.md).

### 4-5. nginx (ALB 백엔드 HTTP)

Production EC2 nginx는 **TLS 종료 없음** — ALB → EC2 :80.  
`deploy/teamver/devops/nginx/` production 템플릿·`OD_API_TOKEN` 주입 확인.

---

## 7. Step 5 — Phase E: 출시 게이트 검증

### 5-1. Post-deploy Track A (필수)

```bash
bash scripts/run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict
```

**포함 Phase:** validate → compose → sidecar deps → smoke → wiring → **storage isolation** → (strict) E2E.

### 5-2. 수동·스크립트 매핑 ([09 §14.1](./09_Design_저장소_격리_출시게이트.md))

| 체크 | 명령 |
|------|------|
| HTTPS health | `curl -sf https://design.teamver.com/_nginx/health` |
| storage isolation | `bash scripts/check_storage_isolation.sh --production` |
| daemon S3 | loopback `curl -H "Authorization: Bearer $OD_API_TOKEN" http://127.0.0.1:7456/api/health/storage` |
| Main BE wiring | `bash scripts/check_main_be_design_wiring.sh --live --production` |
| Litestream runbook | `bash scripts/restore_app_sqlite_from_s3.sh --production --litestream --dry-run` |

### 5-3. CloudWatch 알람 (P0-6 / P1-10)

```bash
bash scripts/print_cloudwatch_alarm_commands.sh --production
# LOG_GROUP / SNS_TOPIC_ARN 설정 후 --apply
```

권장: `od_s3_sync_up_failed`, scratch disk 80%, RDS/design-api 5xx.

### 5-4. strict E2E env (선택 변수)

```bash
bash scripts/print_production_track_a_e2e_env.sh --from-env .env.production
# TEAMVER_COOKIE, TEAMVER_COOKIE_USER_B, TEAMVER_S3_BUCKET 등 채운 뒤 e2e
```

---

## 8. Step 6 — 트affic 오픈

| # | 작업 |
|---|------|
| 6-1 | 내부 계정으로 design.teamver.com 로그인 → 프로젝트 create → chat run → S3 tenant prefix 객체 확인 ([16](./16_S3_데이터_저장_시점_SSOT.md)) |
| 6-2 | Publish → Drive (G7 folder id 설정 시) |
| 6-3 | Main FE AI Apps 링크 / feature flag |
| 6-4 | 24h 모니터: sync-up failed, scratch disk, RDS |

---

## 9. 현재 진행 상태 (갱신용 체크리스트)

> 아래는 **로컬/문서 기준 스냅샷**. EC2·terraform 실측 후 `[x]` 갱신.

### Staging (Step 0)

- [ ] daemon S3 init 성공 (crash loop 해소)
- [ ] `run_post_deploy_track_a.sh --staging --rds --smoke` pass
- [ ] `od_storage=ok`

### Infra (Step 1~3)

- [~] Phase A ACM — `prod.terraform.tfvars`에 `alb_certificate_arn` 있음 (Issued 재확인 필요)
- [~] Phase B Terraform — `.env.production`에 prod RDS host 있음 (apply·output 재확인)
- [ ] Phase C GCP CNAME → ALB (`dig` 확인)

### App (Step 4)

- [ ] `.env.production` on **Prod EC2** (gitignore — EC2에만)
- [ ] `OD_API_TOKEN` 설정
- [ ] `TEAMVER_JWT_SECRET` = Main BE prod
- [ ] `validate_deploy_env.sh --production --rds` **0 error**
- [ ] `deploy.sh --production --rds`
- [ ] Litestream profile active
- [ ] `seed_od_runtime_config.sh --production`

### Gate (Step 5)

- [ ] `run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict`
- [ ] `check_storage_isolation.sh --production`
- [ ] CW alarms applied

### Open (Step 6)

- [ ] 내부 E2E sign-off
- [ ] 공개 트affic

---

## 10. 지금 당장 할 일 (다음 3 action)

**Action 1 — Staging unblock (Step 0-1)**  
Design Staging EC2: S3 IAM user key → `.env.staging` → daemon up → smoke `od_storage=ok`.

**Action 2 — Production secrets (Step 4-2)**  
노트북 `deploy/teamver/.env.production`:

```bash
openssl rand -hex 32   # → OD_API_TOKEN (nginx에도 동일)
# TEAMVER_JWT_SECRET ← Main BE production JWT_SECRET_KEY
bash scripts/validate_deploy_env.sh --production --rds   # 0 error 목표
```

**Action 3 — Infra 증적 (Step 2~3)**  
노트북 (Design AWS 계정 creds):

```bash
cd ns-teamver-devops/terraform/services/teamver-design
terraform output alb_dns_name postgres_host project_data_bucket
dig +short design.teamver.com
```

---

## 11. 관련 스크립트·경로

| 스크립트 | 용도 |
|----------|------|
| `run_production_phase0_activate.sh` | RDS+S3 env merge |
| `apply_production_s3_env.sh` | S3/RDS only merge |
| `validate_deploy_env.sh --production --rds` | 출시 env gate |
| `deploy.sh --production --rds` | compose up |
| `run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict` | 통합 gate |
| `check_storage_isolation.sh --production` | G1 SSOT |
| `print_cloudwatch_alarm_commands.sh` | ops alarms |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-19 | 초版 — Step 0~6 순서, staging/prod 차이, 현재 상태 템플릿, next 3 actions |

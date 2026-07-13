# Teamver Design — AWS 프로덕션 배포

**Design Production EC2** — Staging EC2 와 **완전 분리**.  
TLS는 **AWS ALB (ACM)**, EC2는 **HTTP :80** 백엔드만 (Page/Mail 패턴).

**Design 인프라 SSOT:** [docs-teamver/07_VM_배포_인프라.md](../../../docs-teamver/07_VM_배포_인프라.md)  
**Staging vs Production (왜 다르게 구현했는지 — 네트워크·TLS·DNS·로드밸런싱):** [docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md](../../../docs-teamver/31_Design_Staging_vs_Production_네트워크_TLS_DNS.md)  
**Terraform:** `ns-teamver-devops/terraform/services/teamver-design/` — prod apply 후 이 문서 진행.  
**GCP DNS + ACM (수동, apply 전 필수):** [`GCP_DNS_AND_ACM.md`](../../../../ns-teamver-devops/terraform/services/teamver-design/docs/GCP_DNS_AND_ACM.md)

스테이징: [devops/nginx/README.md](../devops/nginx/README.md)

### Staging S3 활성화 (09 Phase 0)

Terraform apply 후 EC2에서 Phase 0 activation 스크립트를 실행합니다.

```bash
cd deploy/teamver
cp .env.staging.example .env.staging   # secrets: OD_API_TOKEN, JWT, POSTGRES_PASSWD, …
bash scripts/run_staging_phase0_activate.sh --from-terraform
bash deploy.sh --staging --rds
bash scripts/run_post_deploy_track_a.sh --staging --rds --smoke
```

S3/RDS env만 출력하려면:

```bash
bash scripts/print_staging_s3_env.sh --from-terraform
```

**로컬 S3 (MinIO, P1-9 — 선택):** S3 materialize 경로만 로컬에서 검증할 때 사용. **일반 로컬 개발은 `OD_PROJECT_STORAGE=local`이면 MinIO 불필요.**

```bash
bash deploy.sh --staging --local-db --with-minio
# 또는
bash scripts/run_minio_s3_dev.sh --integration-test
```

**로컬에서 staging AWS bucket 직접 연결은 비권장** (데이터 오염·scratch evict 실수). 상세: [09 §10.1](../../../docs-teamver/09_Design_저장소_격리_출시게이트.md#101-로컬-개발--storage-모드-선택-ssot) · [TEAMVER_APPS_INTEGRATION §로컬 vs Staging S3](./TEAMVER_APPS_INTEGRATION.md#로컬-vs-staging-s3-vs-minio).

EC2 IAM instance profile이 버킷에 접근 가능해야 합니다 (`terraform output project_data_bucket`). 키 파일 불필요.

---

## 아키텍처

```text
[브라우저] ──HTTPS──► [AWS ALB + ACM]
                              ├─ design.teamver.com      → EC2 nginx → OD :7456
                              └─ design-api.teamver.com  → EC2 nginx → design-api :16000
                                        ↓
                              api.teamver.com (Main BE, 별도 호스트)
                                        ↓
                              AWS RDS — AI Design only: teamver_design_production
                              (Main BE prod DB = GCP Cloud SQL — 별도)
```

| 호스트 | 역할 |
|--------|------|
| **Design Staging EC2** | `stg-design*` — Nginx TLS (Let's Encrypt), EIP |
| **Design Production EC2** | `design*` — Nginx HTTP, **ALB** TLS, **EIP** (SSH/운영) |
| **Main BE** | `api.teamver.com` / `stg-api.teamver.com` |

---

### Production Phase 0 (09)

Terraform prod apply 후 EC2에서:

```bash
cd deploy/teamver
cp .env.production.example .env.production   # secrets: OD_API_TOKEN, JWT, POSTGRES_PASSWD, LLM keys
bash scripts/run_production_phase0_activate.sh --from-terraform
bash deploy.sh --production --rds
bash scripts/print_production_track_a_e2e_env.sh --from-env .env.production
bash scripts/run_post_deploy_track_a.sh --production --rds --smoke --e2e-strict
```

S3/RDS env만 출력:

```bash
bash scripts/print_production_s3_env.sh --from-terraform
```

**접속:** `terraform output ssh_command` (EIP). SSM: `terraform output ssm_command`. **사용자 DNS**는 ALB (`dns_manual`), EIP가 아님.

---

## 1. Terraform (선행)

**순서:** ACM Issued + `alb_certificate_arn` → terraform apply → GCP에 ALB CNAME → EC2 배포.  
상세: [`GCP_DNS_AND_ACM.md`](../../../../ns-teamver-devops/terraform/services/teamver-design/docs/GCP_DNS_AND_ACM.md)

```bash
cd ns-teamver-devops/terraform/services/teamver-design
export TF_VAR_teamver_design_rds_pass='...'   # Design prod RDS master (≠ Main BE GCP DB)
# prod.terraform.tfvars 에 alb_certificate_arn 설정 후:
terraform init -backend-config=backend-prod.hcl -reconfigure
terraform plan -var-file=prod.terraform.tfvars -out=tfplan-prod
terraform apply tfplan-prod
```

RDS: Terraform apply로 **Design sidecar 전용** `teamver-design-prod-postgres` + `teamver_design_production` 생성. Main BE GCP DB와 무관.

`terraform output post_deploy_checklist` 참고.

---

## 2. Production EC2 앱 배포

**권장:** **`t3.2xlarge`** (staging `t3.large` 대비), EBS data 100GB (`OD_DATA_DIR`), design-api **`UVICORN_WORKERS=5`**

```bash
# EC2 (SSH — terraform output ssh_command)
ssh -i ~/.k/ec2-key-teamver-prod-design.pem ubuntu@<eip>
sudo mkdir -p /opt/teamver-design && sudo chown ubuntu:ubuntu /opt/teamver-design
cd /opt/teamver-design
# git pull ns-open-design (vendor/teamver 포함 권장 — [08 vendor·배포](../../../docs-teamver/08_Teamver_SDK_vendor와_배포.md))

cp .env.production.example .env.production
# POSTGRES_HOST = terraform output postgres_host
# POSTGRES_PASSWD = TF_VAR_teamver_design_rds_pass (Design prod RDS master)
# POSTGRES_SSLMODE=require

chmod +x deploy.sh scripts/run_docker.sh
bash deploy.sh --production --rds
bash scripts/seed_od_runtime_config.sh --production
bash scripts/smoke_design.sh --production   # 배포 후 health·auth gate·od_storage probe
```

| 서비스 | 포트 |
|--------|------|
| open-design-daemon | 7456 |
| teamver-design-api | 16000 |

연동: [TEAMVER_APPS_INTEGRATION.md](./TEAMVER_APPS_INTEGRATION.md)

**Health endpoints**

| Endpoint | 출처 | 용도 |
|----------|------|------|
| `GET /api/health` | OD daemon | 버전·alive |
| `GET /api/ready` | OD daemon | shutdown 직전 503 (drain 알림) |
| `GET /api/health/storage` | OD daemon | S3 모드 reachability (`list-type=2&max-keys=1`) / local 모드 projectsDir mkdir+access. 6s 내부 timeout. 200=ok / 503=ok:false / 504=probe_timeout |
| `GET /api/healthz` | design-api | DB schema 표 + status |
| `GET /api/healthz/deps` | design-api | `checks.{db,daemon,main_be,od_storage}` 및 `config.{m2m_key,od_token,managed_api,drive_publish_folder,bootstrap,project_storage,registry_creds}` broker. `od_storage=degraded` 면 daemon 의 `/api/health/storage` 를 직접 확인 |

`smoke_design.sh` 가 위 6개 엔드포인트와 별도로 `restore_app_sqlite_from_s3.sh --litestream --dry-run` 까지 자체 호출해 runbook 스크립트가 깨지지 않았는지 검증 (env 파일 있는 host 한정).

**OD runtime seed:** 최초 기동 후 `bash scripts/seed_od_runtime_config.sh --production` — daemon `app-config.json`에 `onboardingCompleted: true` (idempotent). LLM provider key는 `.env`의 `ANTHROPIC_API_KEY` 등 → compose env (git 커밋 금지). embed FE lock과 함께 onboarding 재진입을 막는다.

### Nginx (HTTP only — ALB 뒤)

**상세 순서·함정 (default / empty peers / health 404):**  
[docs-teamver/39_4 §10.11](../../../docs-teamver/39_4_배포_Terraform_운영_Runbook.md#1011-nginx-alb-httpconf-적용-순서--함정-prodstaging) · [devops/nginx/README.md](../devops/nginx/README.md)

```bash
# 권장: sudo apt-get install -y awscli
cd devops/nginx
sudo bash ./apply_teamver_design_nginx_conf.sh \
  ./design.teamver.com.http.conf \
  --disable design.teamver.com.https.conf
# → sites-enabled/default 자동 제거, peers render 시도
curl -fsS http://127.0.0.1/_nginx/health   # Host 없이 → ok
cat /etc/nginx/teamver-design-od-daemon-peers.inc   # server …:7456 필수
```

**금지:** `design.teamver.com.https.conf` enable (ALB + EC2 443 → 리다이렉트 루프).

**2노드:** 양쪽 deploy 후 `sudo bash scripts/render_od_daemon_peers_nginx.sh` (peers.inc 내용 동일).  
`no servers are inside upstream` → [39_5 §3.1.3](../../../docs-teamver/39_5_검증_체크리스트_FAQ.md#313-nginx-no-servers-are-inside-upstream--_nginxhealth-404).

---

## 3. ALB · DNS 검증

Terraform이 Route53 ALIAS (`design*`, `design-api*`) 를 생성했다면:

```bash
curl -sf https://design.teamver.com/_nginx/health
curl -sf https://design-api.teamver.com/_nginx/health
```

외부 DNS(Route53 외)인 경우: ALB DNS name에 CNAME/ALIAS 수동 설정 (`terraform output alb_dns_name`).

ALB **idle timeout 3600s** — Terraform `alb_idle_timeout` 기본값.

---

## 4. 스키마

design-api 최초 기동 시 `be/scripts/create_schema.sql` 또는 앱 bootstrap.  
RDS에 `teamver_design_production` database 가 있어야 합니다.

---

## 5. Litestream restore (app.sqlite)

`docker compose --profile litestream up -d` 사용 시 S3 replica: `litestream/app.sqlite`.

**EC2 유실 후 복구 (Phase 2 P2-2 helper 사용 권장):**

```bash
# 1. compose down
docker compose down

# 2. Litestream replica → 격리된 restore/<env>/<ts>/ 디렉토리에 복원
#    (실행 중인 /data/app.sqlite 우발 덮어쓰기 방지)
bash scripts/restore_app_sqlite_from_s3.sh --production --litestream

# 3. 검증 후 daemon 컨테이너에 적용
bash scripts/restore_app_sqlite_from_s3.sh --production --litestream --apply

# 4. compose up
bash deploy.sh --production --rds
```

**fallback (Litestream 없을 때 — `backup_sqlite_to_s3.sh` snapshot 사용):**

```bash
bash scripts/restore_app_sqlite_from_s3.sh --production \
  --from-snapshot LATEST.json --apply
```

`--at <ISO8601>` / `--generation <id>` 로 PITR 가능. `--dry-run` 으로 어떤 명령이 실행될지 미리 확인.

---

## 6. S3 lifecycle 정책 (P3-8 — 비용 위생)

soft-delete 된 프로젝트 scratch debris, fallback sqlite-backups, 미완료 multipart 를 만료시킵니다.

```bash
# JSON 정책 stdout 으로 확인
bash scripts/s3_lifecycle_policy.sh --production

# live 정책과 diff
bash scripts/s3_lifecycle_policy.sh --production --diff

# 적용
bash scripts/s3_lifecycle_policy.sh --production --apply
```

기본:
- abort-incomplete-multipart 7d (버킷 전체)
- sqlite-backups expire 30d (`SQLITE_BACKUP_PREFIX` 아래)
- scratch evict expire 14d (`OD_S3_PREFIX$S3_LIFECYCLE_SCRATCH_PREFIX/`)

기간/prefix 조정: `.env.production` 에 `S3_LIFECYCLE_SQLITE_BACKUP_DAYS` / `S3_LIFECYCLE_SCRATCH_PREFIX` / `S3_LIFECYCLE_SCRATCH_DAYS`.

---

## 7. Track A 알람·메트릭

CloudWatch log metric filter + 알람을 일괄 출력/적용:

```bash
SNS_TOPIC_ARN=arn:aws:sns:ap-northeast-2:<acct>:teamver-design-alerts \
  INSTANCE_ID=i-... \
  bash scripts/print_cloudwatch_alarm_commands.sh --production --apply
```

생성되는 신호:
1. `od_s3_sync_up_failed` 마커 → `TeamverDesignS3SyncUpFailed` 알람
2. `teamver_usage_5xx` 마커 → `TeamverDesignUsage5xx` 알람 (>=5 / 5min)
3. CW Agent `disk_used_percent` (`OD_SCRATCH_DIR` path) → 80% 알람
4. `od_scratch_disk_usage` + `overThreshold:true` → `TeamverDesignScratchOverThreshold` 알람
5. `teamver_project_access_5xx` 마커 → `TeamverDesignProjectAccess5xx` 알람 (>=5 / 5min)

`od_scratch_disk_usage` 활성화는 `.env.production` (상세: [21 Scratch 디스크 메트릭](../../../docs-teamver/21_OD_SCRATCH_DISK_METRICS_가이드.md)):
- `OD_SCRATCH_DISK_METRICS=1`
- `OD_SCRATCH_DISK_THRESHOLD_MB=2048` (기본)
- `OD_SCRATCH_DISK_METRIC_INTERVAL_MS=300000` (기본 5분)

`OD_SCRATCH_EVICT_AFTER_RUN=1` + `OD_S3_SYNC_UP_METRICS=1` 도 같이 set 권장.

---

프로젝트 파일 SSOT는 S3 tenant prefix — scratch는 재생성. 상세: [09 §12](../../../docs-teamver/09_Design_저장소_격리_출시게이트.md).

### Litestream 장애 시 수동 fallback

Litestream을 바로 사용할 수 없을 때만 짧은 정지 창을 잡고 `app.sqlite` bundle을 S3에 업로드합니다.

```bash
cd deploy/teamver
bash scripts/backup_sqlite_to_s3.sh --production --stop-daemon
# staging:
# bash scripts/backup_sqlite_to_s3.sh --staging --stop-daemon
```

업로드 경로: `s3://$LITESTREAM_BUCKET/sqlite-backups/<env>/<timestamp>/`.
`--allow-live-copy`는 일관성 보장이 약하므로 incident triage 외에는 쓰지 않습니다.
복구는 §5 의 `restore_app_sqlite_from_s3.sh --from-snapshot LATEST.json --apply` 사용.

---

## 8. 롤백

- compose: `docker compose down` 후 이전 이미지 태그
- ALB: unhealthy target 제거 또는 이전 EC2 AMI
- DB: RDS snapshot 복원 (global 스택)

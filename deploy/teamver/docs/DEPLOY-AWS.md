# Teamver Design — AWS 프로덕션 배포

**Design Production EC2** — Staging EC2 와 **완전 분리**.  
TLS는 **AWS ALB (ACM)**, EC2는 **HTTP :80** 백엔드만 (Page/Mail 패턴).

**Design 인프라 SSOT:** [docs-teamver/07_VM_배포_인프라.md](../../../docs-teamver/07_VM_배포_인프라.md)  
**Terraform:** `ns-teamver-devops/terraform/services/teamver-design/` — prod apply 후 이 문서 진행.

스테이징: [devops/nginx/README.md](../devops/nginx/README.md)

### Staging S3 활성화 (09 Phase 0)

Terraform apply 후 EC2 `.env.staging`에 S3 블록을 추가합니다.

```bash
cd deploy/teamver
bash scripts/print_staging_s3_env.sh --from-terraform >> .env.staging
# 또는 수동: OD_PROJECT_STORAGE=s3, OD_S3_BUCKET=teamver-design-staging-data, …

docker compose down
bash scripts/run_docker.sh --staging --rds
# (선택) Litestream: docker compose --profile litestream up -d
bash scripts/smoke_design.sh --staging
```

**로컬 S3 (MinIO, P1-9 — 선택):** S3 materialize 경로만 로컬에서 검증할 때 사용. **일반 로컬 개발은 `OD_PROJECT_STORAGE=local`이면 MinIO 불필요.**

```bash
bash scripts/run_docker.sh --staging --local-db --with-minio
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
                              AWS RDS — database teamver_design_production
```

| 호스트 | 역할 |
|--------|------|
| **Design Staging EC2** | `stg-design*` — Nginx TLS (Let's Encrypt), EIP |
| **Design Production EC2** | `design*` — Nginx HTTP, ALB 앞단, private subnet |
| **Main BE** | `api.teamver.com` / `stg-api.teamver.com` |

---

## 1. Terraform (선행)

```bash
cd ns-teamver-devops/terraform/services/teamver-design
export TF_VAR_teamver_aws_rds1_pass='...'
terraform init -backend-config=backend-prod.hcl -reconfigure
terraform apply -var-file=prod.terraform.tfvars
```

RDS: Terraform apply로 **전용 인스턴스** + `teamver_design_production` 생성. `CREATE DATABASE` 수동 불필요.

`terraform output post_deploy_checklist` 참고.

---

## 2. Production EC2 앱 배포

**권장:** `t3.large`, EBS data 50GB (`OD_DATA_DIR`)

```bash
# EC2 (SSM 또는 ssh)
sudo mkdir -p /opt/teamver-design && sudo chown ubuntu:ubuntu /opt/teamver-design
cd /opt/teamver-design
# git pull ns-open-design (vendor/teamver 포함 권장 — [08 vendor·배포](../../../docs-teamver/08_Teamver_SDK_vendor와_배포.md))

cp .env.production.example .env.production
# POSTGRES_HOST = terraform output postgres_host
# POSTGRES_PASSWD = TF_VAR_teamver_aws_rds1_pass (또는 전용 DB user)
# POSTGRES_SSLMODE=require

chmod +x scripts/run_docker.sh
bash scripts/run_docker.sh --production --rds
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

```bash
cd devops/nginx
sudo cp teamver-design-od-token.conf.example /etc/nginx/conf.d/teamver-design-od-token.conf
# OD_API_TOKEN 편집
sudo bash ./apply_teamver_design_nginx_conf.sh ./design.teamver.com.http.conf
```

**금지:** `design.teamver.com.https.conf` enable (ALB + EC2 443 → 리다이렉트 루프).

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
bash scripts/run_docker.sh --production --rds
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

`od_scratch_disk_usage` 활성화는 `.env.production`:
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

# Design EC2 — IAM Instance Profile · S3 설정 SSOT

**목적:** Design EC2에서 **Docker daemon / Litestream** 이 S3에 접근할 때 쓰는 **EC2 instance profile** 설정을 한 문서로 고정한다.  
**Production 정식 경로:** instance profile **만** (static `OD_S3_ACCESS_KEY_ID` 금지).  
**관련:** [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) · [16 S3 저장 시점](./16_S3_데이터_저장_시점_SSOT.md) · [17 Production 출시 순서](./17_Production_출시_작업_순서.md) · [07 VM 배포·인프라](./07_VM_배포_인프라.md)

**Terraform SSOT:** `ns-teamver-devops/terraform/services/teamver-design/` — `iam.tf`, `s3.tf`, `ec2.tf`

---

## 0. 한 줄 결론

> **IAM User + Access Key가 아니라, EC2 Instance Profile(Role) + IMDS hop limit 2** 로 S3 creds를 Docker 컨테이너까지 전달한다.  
> `.env` 에 S3 access key 를 **넣지 않는다** (production). Terraform prod apply 가 권장 경로.

---

## 1. 왜 instance profile인가

| 방식 | Production | Staging |
|------|------------|---------|
| **EC2 instance profile + IMDS** | ✅ **정식** (`validate_deploy_env.sh` 기본) | ✅ 권장 (hop limit 2) |
| **Static IAM user access key** in `.env` | ❌ validate **fail** (`ALLOW_STATIC_AWS_KEYS=1` 긴급만) | ✅ 임시 허용 (Docker/IMDS 이슈 우회) |

daemon은 env key가 비어 있으면 **EC2 IMDS**에서 role creds를 읽는다:

- 코드: `apps/daemon/src/storage/aws-imds-credentials.ts`
- 호출: `apps/daemon/src/storage/materializing-project-storage.ts` → `resolveRemoteProjectStorage()`

```text
EC2 Instance Profile (IAM Role)
        │
        ▼ IMDS (169.254.169.254)
   open-design-daemon 컨테이너
        │
        ▼ SigV4
   s3://teamver-design-{env}-data/design/…
```

**Litestream** sidecar도 compose에 AWS key env 가 없으면 **동일 IMDS** 경로를 사용한다 (`docker-compose.yml` `litestream` service).

---

## 2. 구성 요소 (3개)

| # | AWS 리소스 | 역할 | 이름 패턴 (`name_prefix = teamver-design-{env}`) |
|---|------------|------|--------------------------------------------------|
| 1 | **IAM Role** | EC2가 assume | `teamver-design-staging-app` / `teamver-design-prod-app` |
| 2 | **Role policy** | S3 project-data + Litestream | `{name_prefix}-s3-project-data` (inline on role) |
| 3 | **Instance Profile** | EC2 ↔ Role 연결 | `{name_prefix}-app` (profile 이름) |

**Role에 추가로 붙는 managed policy (ops):**

| Policy | 용도 |
|--------|------|
| `AmazonSSMManagedInstanceCore` | SSM Session Manager |
| `CloudWatchAgentServerPolicy` | CloudWatch Agent (호스트) |

S3 project 파일 접근은 **custom inline policy** (`s3.tf`) — managed `AmazonS3FullAccess` **사용 안 함**.

---

## 3. S3 permission scope (Role policy)

Terraform `s3.tf` → `app_s3_project_data` 와 **동일 scope** 유지.

| 리소스 | Action | Prefix / path |
|--------|--------|---------------|
| `teamver-design-{env}-data` bucket | `s3:ListBucket` | `design/`, `design/*` (condition) |
| `…/design/*` objects | `GetObject`, `PutObject`, `DeleteObject` | tenant prefix 하위 전체 |
| bucket + `litestream/*` | List + R/W/D | Litestream replica (09 G2) |

**버킷 이름:**

| 환경 | Bucket |
|------|--------|
| Staging | `teamver-design-staging-data` |
| Production | `teamver-design-prod-data` |

### 3.1 수동 policy JSON 예 (콘솔 inline — prod)

`teamver-design-prod-data` 기준. Staging은 bucket 이름만 바꾼다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListProjectDataPrefix",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::teamver-design-prod-data",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["design/", "design/*"]
        }
      }
    },
    {
      "Sid": "ReadWriteProjectDataObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::teamver-design-prod-data/design/*"
    },
    {
      "Sid": "LitestreamReplicaPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::teamver-design-prod-data",
        "arn:aws:s3:::teamver-design-prod-data/litestream/*"
      ]
    }
  ]
}
```

수동 `sqlite-backups/*` fallback script 를 instance profile 로 돌릴 경우 statement 추가 ([16 §7](./16_S3_데이터_저장_시점_SSOT.md)).

---

## 4. 설정 방법 A — Terraform (권장)

Design AWS 계정에서 `teamver-design` service apply 시 **자동 생성·연결**.

### 4.1 IAM + Instance Profile (`iam.tf`)

```hcl
resource "aws_iam_role" "app" {
  name = "${local.name_prefix}-app"
  # trust: ec2.amazonaws.com
}
resource "aws_iam_instance_profile" "app" {
  name = "${local.name_prefix}-app"
  role = aws_iam_role.app.name
}
```

### 4.2 S3 policy on role (`s3.tf`)

`aws_iam_role_policy.app_s3_project_data` — §3 scope.

### 4.3 EC2 attach + IMDS hop limit (`ec2.tf`)

```hcl
resource "aws_instance" "app" {
  iam_instance_profile = aws_iam_instance_profile.app.name

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2   # Docker 필수
  }
}
```

### 4.4 Apply

```bash
cd ns-teamver-devops/terraform/services/teamver-design

# staging
terraform init -backend-config=backend-staging.hcl -reconfigure
terraform apply -var-file=staging.terraform.tfvars

# production
export TF_VAR_teamver_design_rds_pass='…'
terraform init -backend-config=backend-prod.hcl -reconfigure
terraform apply -var-file=prod.terraform.tfvars
```

**확인:**

```bash
terraform output -raw project_data_bucket
# EC2 Instances → IAM role = teamver-design-{env}-app
```

---

## 5. 설정 방법 B — AWS 콘솔 (수동)

Terraform 없이 / 기존 EC2 보완 시.

### 5-1. IAM Role

1. IAM → Roles → Create role  
2. Trusted entity: **AWS service → EC2**  
3. Role name: `teamver-design-prod-app` (staging: `…-staging-app`)

### 5-2. Policy attach

1. Role → Add permissions → **Create inline policy**  
2. §3.1 JSON 붙여넣기 (bucket/env 맞게 수정)  
3. (선택) Managed: `AmazonSSMManagedInstanceCore`, `CloudWatchAgentServerPolicy`

### 5-3. Instance Profile → EC2

1. IAM → Roles → 해당 role (profile이 role에 자동 연결됨)  
2. EC2 → Instances → Design EC2 → **Actions → Security → Modify IAM role**  
3. `teamver-design-{env}-app` 선택

### 5-4. IMDS hop limit (Docker — 필수)

Terraform EC2가 **아니거나** 예전 인스턴스면 **반드시** hop **2**:

**CLI (노트북, Design AWS creds):**

```bash
aws ec2 modify-instance-metadata-options \
  --instance-id i-xxxxxxxx \
  --http-endpoint enabled \
  --http-tokens required \
  --http-put-response-hop-limit 2 \
  --region ap-northeast-2
```

**콘솔:** EC2 → Instance → **Actions → Instance settings → Modify instance metadata options**

| 옵션 | 값 |
|------|-----|
| Metadata accessible | Enabled |
| Metadata version | V2 only (token required) |
| Metadata response hop limit | **2** |

변경 후 daemon / Litestream **컨테이너 재시작** 필요.

---

## 6. `.env` 설정 (instance profile 사용 시)

S3 bucket/region/prefix 만 설정. **Access Key 슬롯은 비움.**

```bash
OD_PROJECT_STORAGE=s3
OD_S3_BUCKET=teamver-design-prod-data      # staging: teamver-design-staging-data
OD_S3_REGION=ap-northeast-2
OD_S3_PREFIX=design/
AWS_REGION=ap-northeast-2

# instance profile 사용 — 아래 비움 (production 필수)
# OD_S3_ACCESS_KEY_ID=
# OD_S3_SECRET_ACCESS_KEY=
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
```

**Litestream (G2):**

```bash
LITESTREAM_BUCKET=teamver-design-prod-data
LITESTREAM_REGION=ap-northeast-2
```

`validate_deploy_env.sh --production --rds` 는 static AWS key 가 있으면 **fail**.

---

## 7. 검증 절차 (EC2)

### 7-1. 호스트 — role 연결

```bash
TOKEN=$(curl -sfX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -sfH "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
# 출력: teamver-design-prod-app (또는 staging-app)
```

### 7-2. 호스트 — S3 list (aws CLI, key 없을 때)

```bash
aws s3 ls s3://teamver-design-prod-data/design/ --region ap-northeast-2
```

### 7-3. Docker 컨테이너 — IMDS (hop limit 확인)

**가장 중요.** 호스트 OK + 컨테이너 FAIL = hop limit 1.

```bash
docker exec teamver-open-design-daemon node -e "
fetch('http://169.254.169.254/latest/api/token',{
  method:'PUT',headers:{'X-aws-ec2-metadata-token-ttl-seconds':'60'}})
  .then(r=>r.text()).then(t=>
    fetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/',{
      headers:{'X-aws-ec2-metadata-token':t}}))
  .then(r=>r.text()).then(console.log).catch(e=>console.error('IMDS FAIL',e))
"
```

성공 시 JSON에 `AccessKeyId`, `SecretAccessKey`, `Token` 포함.

### 7-4. daemon storage health

```bash
# OD_API_TOKEN 은 .env / nginx 와 동일
curl -sS -H "Authorization: Bearer $OD_API_TOKEN" \
  http://127.0.0.1:7456/api/health/storage | jq .
# 기대: ok=true, mode=s3
```

### 7-5. 배포 게이트

```bash
cd deploy/teamver
bash scripts/check_storage_isolation.sh --production   # 또는 --staging
bash scripts/smoke_design.sh --production
```

---

## 8. Staging vs Production

| 항목 | Staging | Production |
|------|---------|------------|
| Instance profile | `teamver-design-staging-app` | `teamver-design-prod-app` |
| S3 bucket | `teamver-design-staging-data` | `teamver-design-prod-data` |
| Static access key | 임시 허용 (validate warn) | **금지** (validate fail) |
| IMDS hop limit | **2** 권장 | Terraform **2** |
| IAM user `teamver-design-staging-s3` | static key 우회용 **선택** | **만들지 않음** |

Staging에서 static key 로 복구한 뒤, hop 2 + instance profile 확인되면 **key 제거**하고 profile만 사용하는 것이 목표.

---

## 9. 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| `od_s3_storage_init_failed` / `requires credentials.accessKeyId` | 컨테이너 IMDS 불가 또는 role 없음 | hop limit **2**; EC2 IAM role 연결 확인 |
| 호스트 IMDS OK, 컨테이너 IMDS fail | hop limit = 1 | §5-4 `modify-instance-metadata-options` |
| role 있음, S3 AccessDenied | policy bucket/prefix 불일치 | §3 scope vs 실제 `OD_S3_BUCKET` / prefix |
| production validate fail (static key) | `.env` 에 `AWS_ACCESS_KEY_ID` | key 제거, instance profile만 |
| Litestream S3 fail, daemon OK | Litestream도 IMDS 의존 | 동일 hop 2; role에 `litestream/*` |
| 구 Docker 이미지만 사용 | 코드/IMDS 경로 구버전 | staging 소스 `docker compose build open-design-daemon` |

**로그:**

```bash
docker logs teamver-open-design-daemon 2>&1 | grep -E 'storage_init|materialization|IMDS'
```

---

## 10. IAM User(static key)와의 관계

| 질문 | 답 |
|------|-----|
| instance profile + IAM user 둘 다 필요? | **아니요.** profile이 정식; user key는 staging 임시 |
| env에 key도 넣고 profile도? | env key **우선** — profile은 사용 안 됨 |
| production에 staging용 IAM user? | **불필요** — EC2 role만 |

static key 생성 runbook: staging 한정, [17 Step 0](./17_Production_출시_작업_순서.md) 또는 대화 기록의 IAM user 가이드. **본 문서 SSOT는 instance profile.**

---

## 11. 관련 코드·스크립트

| 경로 | 내용 |
|------|------|
| `terraform/.../teamver-design/iam.tf` | role + instance profile |
| `terraform/.../teamver-design/s3.tf` | S3 inline policy |
| `terraform/.../teamver-design/ec2.tf` | profile attach, hop limit 2 |
| `apps/daemon/src/storage/aws-imds-credentials.ts` | IMDSv2 fetch |
| `apps/daemon/src/storage/materializing-project-storage.ts` | env key → else IMDS |
| `deploy/teamver/scripts/validate_deploy_env.sh` | prod static key 금지 |
| `deploy/teamver/scripts/check_storage_isolation.sh` | 컨테이너 ENV + health |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-19 | 초版 — Terraform/콘솔/hop limit/.env/검증/트러블슈팅/staging vs prod |

# Teamver Design — 배포·Terraform·운영 Runbook (이중화)

**목적:** Phase 2 (Passive) · Phase 4 (Active-Active) **실행 절차** — Terraform, deploy, failover, rolling, Litestream.  
**EC2 bootstrap 실패·node2 수동 구축:** **[§10](#10-ec2-부트스트랩수동-복구-runbook-d6-2노드--신규-ec2-공통)** (증상·Docker·`.env.staging`·EBS mount·EIP quota).  
**nginx ALB apply · default · empty peers:** **[§10.11](#1011-nginx-alb-httpconf-적용-순서--함정-prodstaging)**.  
**Rolling deploy (Mac vs EC2·빌드 위치·git pull):** **[§3](#3-rolling-배포-phase-4)**.  
**관련:** [07 VM 배포](./07_VM_배포_인프라.md) · [17 Production 출시](./17_Production_출시_작업_순서.md) · [39_2 라우팅](./39_2_ALB_nginx_라우팅_설계.md)

**Terraform SSOT:** `ns-teamver-devops/terraform/services/teamver-design/`  
**배포 SSOT:** `ns-open-design/deploy/teamver/deploy.sh`

> **대기 중 (2026-07-20):** auth / FE sticky / **nginx public `session-probe`** 는 staging만 반영.  
> production 배포 시 체크리스트 → [39_10 §10](./39_10_HA_세션쿠키_경합_해결.md#10-production-배포-대기--auth--session-probe-2026-07-20) (`deploy.sh` 후 **nginx apply 필수**).

---

## 1. 현재 Production (Phase 0) — 1 EC2

| 항목 | SSOT |
|------|------|
| EC2 | `t3.2xlarge`, `enable_alb=true` |
| Target | 1 instance → nginx :80 |
| od-data | `/opt/teamver-design/od-data` — **100GiB EBS** |
| 배포 | `bash deploy.sh --production --rds` |
| DNS | `design*` → ALB CNAME ([31](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md)) |

---

## 2. Phase 4 준비 — Terraform 변경 개략

> **주의:** 아래는 **설계 초안** — apply 전 devops PR·staging 리허설 필수.

### 2.1 EC2 2대

| 리소스 | Phase 0 | Phase 4 | Terraform 변수 |
|--------|---------|---------|----------------|
| `aws_instance` count | 1 | **2** | `ec2_instance_count = 2` |
| od-data EBS | 1 × 100GiB | **2 × 100GiB** (인스턴스별, AZ per-node) | `od_data_volume_gb` × count |
| ALB target | 1 | **2** | `aws_lb_target_group_attachment.nginx` count=`ec2_instance_count` |
| ALB stickiness | optional | **OFF** (39_2 §4 · [39_6](./39_6_라우팅_아키텍처_CTO_의사결정.md)) | `alb_stickiness_enabled=false` — affinity는 **nginx userId hash** |
| nginx userId hash | N/A | **enabled** (peer :7456) | `render_od_daemon_peers_nginx.sh` + `teamver-design-od-daemon-upstream.inc.conf` |
| Deregistration delay | 0~60s | **300s+** (SSE drain) | `alb_deregistration_delay_seconds=300` |
| EIP | 1 (break-glass) | **2** (노드별 SSH) | `enable_ec2_eip=true`, count=`ec2_instance_count` |

**backward-compat**: `ec2_instance_count` default=1 로 두면 기존 tfstate 는 `aws_instance.app[0]` 로 `moved` 만 되고 destroy/create 없음.

**staging → production 순서:**
1. staging.terraform.tfvars 에 `ec2_instance_count = 1` 로 먼저 apply (Phase 0 → ALB·nginx hash upstream inc 배포, 실질 no-op).
2. staging.terraform.tfvars 를 `ec2_instance_count = 2` 로 flip → 2번째 EC2/EBS/EIP/TG-attachment 생성.
3. [39_5](./39_5_검증_체크리스트_FAQ.md) 리허설 통과 후 prod.terraform.tfvars 동일 flip.

### 2.2 각 인스턴스 독립 od-data

```text
EC2-1: /opt/teamver-design/od-data  (vol-aaa)
EC2-2: /opt/teamver-design/od-data  (vol-bbb)
```

**공유 금지** — SQLite·scratch ([39_3](./39_3_scratch_SQLite_SSE_제약.md)).

### 2.3 환경 동기화

| 파일 | 동기화 |
|------|--------|
| `.env.production` | **동일 revision** (두 EC2) |
| Docker image tag | **동일** (`deploy.sh` git SHA) |
| nginx conf | **동일** |

---

## 3. Rolling 배포 (Phase 4)

**목표:** 한 번에 **한 target** 만 drain — SSE 사용자 보호. 다른 노드는 항상 InService.

**스크립트 SSOT:** `deploy/teamver/scripts/rolling_deploy.sh`  
**앱 빌드 SSOT:** 각 EC2에서 `deploy.sh` → `docker compose up -d --build` ([deploy.sh](../deploy/teamver/deploy.sh))

### 3.1 한 줄 요약

| 질문 | 답 |
|------|-----|
| **어디서 실행?** | **Mac / CI / bastion** — EC2(node1·node2) **위가 아님** |
| **Mac에서 Docker 빌드?** | **아니요** — 빌드는 SSH로 접속한 **각 EC2의 `deploy.sh`** |
| **`git pull`?** | **자동 없음** — rolling 전 각 EC2 repo 를 **동일 SHA** 로 맞출 것 |
| **`--hosts` 순서?** | **rolling 순서** (앞 host 전체 drain→deploy→register 후 다음) |
| **SSM?** | **미지원** — `--ssh-key` `.pem` 필수 (코드 TODO) |

### 3.2 아키텍처 — Mac vs EC2

```text
┌──────────────────────────────────────────────────────────────┐
│ Mac (로컬)                                                    │
│  rolling_deploy.sh                                            │
│    • aws elbv2 deregister-targets / register-targets          │
│    • aws elbv2 describe-target-health (drain·healthy poll)    │
│    • ssh → 원격 deploy.sh 한 줄                                │
│    • Docker · git · nginx 설정 없음                           │
└────────────────────────────┬─────────────────────────────────┘
                             │ SSH (--ssh-key, --ssh-opts ProxyJump 등)
           ┌─────────────────┴─────────────────┐
           ▼                                   ▼
     EC2 node1                              EC2 node2
     deploy.sh --staging --rds              (hosts 순서대로, 한 대씩)
       validate_deploy_env
       docker compose build / up -d --build  ← Next.js _next 청크·BE 이미지
       Litestream sidecar · health wait
       OD_NODE_ID ← IMDS instance-id
```

**ChunkLoadError 예방:** ALB가 노드를 번갈아 보내므로 **모든 EC2가 동일 git revision·동일 compose build** 여야 한다 ([31 §8.2.1](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md#821-chunkloaderror--2노드-alb--빌드-revision-불일치-404)). `rolling_deploy` 만으로는 부족 — **사전 `git pull` + rolling** 이 SSOT.

### 3.3 내부 동작 (per host)

`--hosts "hostA hostB"` → **hostA 전체 완료 후 hostB** (병렬 아님).

| # | 실행 주체 | 동작 |
|---|-----------|------|
| 1 | Mac + AWS | `resolve_target_id_for_host` — `--hosts` 의 IP 또는 `i-…` → instance-id |
| 2 | Mac + AWS | `deregister-targets` — ALB TG 에서 해당 EC2 제거 |
| 3 | Mac + AWS | `wait_target_drained` — state `draining`/`unused` (기본 **60s** budget) |
| 4 | **EC2 (SSH)** | `cd $REMOTE_DEPLOY_DIR && bash deploy.sh --<env> ${DEPLOY_EXTRA}` |
| 5 | **EC2 (SSH)** | `curl -fsS http://127.0.0.1/_nginx/health` ( `--skip-local-health-check` 로 생략 가능) |
| 6 | Mac + AWS | `register-targets` |
| 7 | Mac + AWS | `wait_target_healthy` — state `healthy` (기본 **180s** budget) |
| 8 | 다음 host | 1~7 반복 |

**실패 시:** 현재 host 에서 중단 — **남은 host 는 건드리지 않음** (최소 1대 InService 유지).

**`deploy.sh` 가 EC2에서 하는 일 (rolling이 아닌 앱 SSOT):**

- `validate_deploy_env.sh` preflight
- Teamver vendor 산출물 확인
- `docker compose … build` / `up -d --build` — **이미지 빌드는 EC2 CPU·디스크 사용**
- Litestream · sidecar health · seed 스크립트

> 구 문서의 “compose pull & up” 표현은 부정확 — **pull-only 가 아니라 `--build` 포함** (staging 은 보통 EC2 로컬 빌드).

**`rolling_deploy` 가 하지 않는 것:**

| 항목 | 비고 |
|------|------|
| `git fetch` / `git pull` | 원격 checkout 그대로 deploy — [§3.4](#34-사전-조건) |
| `docker build` on Mac | 없음 |
| nginx `apply_*_nginx_conf.sh` | deploy 완료 메시지 참고 — token conf 는 [§10.6](#106-앱-배포--nginx-node2-완료-체크리스트) |
| SSM Session Manager | `--ssh-key` 필수 |

### 3.4 사전 조건

**Mac (또는 orchestrator):**

- AWS CLI + `ap-northeast-2` 권한 (`elbv2:*`, `ec2:DescribeInstances`)
- `terraform output -raw alb_target_group_arn` 또는 `--tg-name`
- SSH `.pem` — node2 private IP 만 reachable 이면 `--ssh-opts "-o ProxyJump=ubuntu@<node1-eip>"`

**각 EC2 (rolling 전 1회 권장):**

```bash
cd ~/neural/ns-open-design   # 팀 convention — --remote-deploy-dir 로 변경 가능
git fetch && git checkout staging && git pull
git rev-parse --short HEAD   # 양쪽 동일 SHA 확인
```

**env:** 양쪽 `.env.staging` (또는 production) **동일 revision** — secrets·`DESIGN_BFF_SESSION_SECRET` 동일 ([§10.4](#104-환경-파일--envstaging-vs-etcteamver-designenv)).

### 3.5 실행 예 (Staging 2노드)

**작업 디렉터리:** monorepo clone 의 `ns-open-design/deploy/teamver` (Mac).

```bash
cd ns-open-design/deploy/teamver

TG_ARN="$(cd ../../../ns-teamver-devops/terraform/services/teamver-design \
  && terraform init -reconfigure >/dev/null 2>&1; terraform output -raw alb_target_group_arn)"

# 1) plan — aws/ssh 미실행
bash scripts/rolling_deploy.sh \
  --env staging \
  --tg-arn "$TG_ARN" \
  --hosts "ubuntu@54.116.160.243 ubuntu@10.10.101.198" \
  --ssh-key ~/.k/ec2-key-teamver-staging-design.pem \
  --ssh-opts "-o ProxyJump=ubuntu@54.116.160.243" \
  --remote-deploy-dir '$HOME/neural/ns-open-design/deploy/teamver' \
  --deploy-extra "--rds" \
  --dry-run

# 2) 실제 rolling (양쪽 git pull 완료 후)
bash scripts/rolling_deploy.sh \
  --env staging \
  --tg-arn "$TG_ARN" \
  --hosts "ubuntu@54.116.160.243 ubuntu@10.10.101.198" \
  --ssh-key ~/.k/ec2-key-teamver-staging-design.pem \
  --ssh-opts "-o ProxyJump=ubuntu@54.116.160.243" \
  --remote-deploy-dir '$HOME/neural/ns-open-design/deploy/teamver' \
  --deploy-extra "--rds"
```

**`--hosts` 대안:** ALB drain 용 instance-id 직접 — `ubuntu@i-0007d671156cd1bb1 ubuntu@i-04d5d2c49d934aa72` (SSH 는 여전히 IP·ProxyJump 필요).

**Production:**

```bash
bash scripts/rolling_deploy.sh \
  --env production \
  --tg-name teamver-design-prod-nginx-tg \
  --hosts "ubuntu@<node1-eip> ubuntu@<node2-eip>" \
  --ssh-key ~/.k/ec2-key-teamver-prod-design.pem \
  --deploy-extra "--rds"
```

### 3.6 CLI 옵션 요약

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--env staging\|production` | ✅ | `deploy.sh --staging` / `--production` 전달 |
| `--tg-arn` 또는 `--tg-name` | ✅ | 잘못된 TG drain 방지 가드 |
| `--hosts "u@h1 u@h2 …"` | ✅ | 공백 구분, **순서 = rolling 순서** |
| `--ssh-key <path>` | ✅ | SSM 미지원 |
| `--deploy-extra "…"` | 권장 | 예: `--rds`, `--no-cache` |
| `--region` | | 기본 `ap-northeast-2` |
| `--ssh-opts "…"` | | 예: `-o ProxyJump=…` |
| `--remote-deploy-dir` | | 기본 `$HOME/ns-open-design/deploy/teamver` |
| `--drain-wait` / `--healthy-wait` | | 기본 60s / 180s |
| `--skip-local-health-check` | | ALB healthy 만 신뢰 |
| `--dry-run` | | aws·ssh stub — plan 출력만 |

테스트: `bash scripts/test_rolling_deploy.sh`

### 3.7 배포 중 사용자 영향

| userId hash (정상) | drain 중 |
|--------------------|----------|
| 해당 user → drain target daemon | SSE **끊길 수 있음** → FE backoff → hash 재계산 시 healthy peer |
| 다른 user | healthy target 계속 서비스 |

### 3.8 관측 — X-OD-Node-Id / X-Design-Api-Node

배포 중 요청이 어느 노드로 갔는지 즉시 확인:

```bash
# 로그인 세션 — userId hash: 동일 user → 동일 X-OD-Node-Id (ALB round-robin과 무관)
curl -sI -c cookies.txt https://design.teamver.com/api/health | grep -i x-od-node-id
for i in $(seq 1 20); do
  curl -sI -b cookies.txt https://design.teamver.com/api/health | awk 'tolower($1)=="x-od-node-id:"{print}'
done | sort -u
# → 1줄만 출력되면 userId hash OK (39_5 A5).

# design-api 쪽
curl -sI https://design-api.teamver.com/api/healthz | grep -i x-design-api-node
```

- `OD_NODE_ID` 는 `deploy.sh` 가 IMDS 로 EC2 `instance-id` 를 조회해 자동 주입 (비-EC2는 `hostname` fallback).
- `/api/health` 응답 body 의 `nodeId` 필드 · 헤더 `X-OD-Node-Id` 두 채널로 노출.
- `/healthz` 응답 body 의 `node_id` 필드 · 헤더 `X-Design-Api-Node`.

### 3.9 Litestream replica 분리

두 EC2 가 각자 `app.sqlite` 를 write 하므로 S3 replica prefix 를 노드별로 격리:

- `deploy.sh` 가 `OD_NODE_ID` → `LITESTREAM_REPLICA_PATH=litestream/<sanitized-node-id>/app.sqlite` 로 자동 계산.
- 단일 노드는 legacy `litestream/app.sqlite` 유지 (기존 데이터 이관 없음).
- restore: `bash scripts/restore_app_sqlite_from_s3.sh --production --litestream --replica-id <node-id>`.
- 자세한 근거: [39_3 §5.2](./39_3_scratch_SQLite_SSE_제약.md#52-multi-node-phase-4).

---

## 4. Phase 2 — Active-Passive Failover

### 4.1 구성

| 역할 | ALB | od-data |
|------|-----|---------|
| **ACTIVE** | InService | primary traffic |
| **STANDBY** | OutOfService **또는** Weight 0 | Litestream replica |

### 4.2 Failover (수동 runbook)

```text
1. ACTIVE unhealthy 확인 (ALB, /_nginx/health)
2. ACTIVE target deregister:
   aws elbv2 deregister-targets \
     --target-group-arn "$(terraform output -raw alb_target_group_arn)" \
     --targets Id=<active-instance-id> --region ap-northeast-2
3. STANDBY:
   a. bash deploy/teamver/scripts/restore_app_sqlite_from_s3.sh \
        --production --litestream --replica-id <active-node-id> --apply
      (multi-node 환경에서 여러 replica 가 있으므로 --replica-id 지정 필수)
   b. docker compose up (이미지 최신 확인)
   c. health green — curl http://127.0.0.1/_nginx/health
4. STANDBY ALB register:
   aws elbv2 register-targets \
     --target-group-arn "$(terraform output -raw alb_target_group_arn)" \
     --targets Id=<standby-instance-id> --region ap-northeast-2
5. DNS/모니터링 — 5xx, session, export, X-OD-Node-Id 헤더 sanity
6. 구 ACTIVE 복구 후 → STANDBY로 재전환 (역할 swap)
```

### 4.3 Litestream

- **writer 1** — ACTIVE만 write
- STANDBY promote 시: **restore → promote to writer** ([20 §6](./20_Design_Hybrid_저장소_로컬_S3_가이드.md))
- **분기 1회 restore 리허설** — RTO 검증

### 4.4 S3

프로젝트 파일은 **S3 SSOT** — EC2 교체해도 sync-down으로 복구.  
**sync-up 안 된 scratch** 만 유실 위험 — BYOK proxy hook 정상 필수 ([29](./29_BYOK_api_mode_vs_runs_아키텍처.md)).

---

## 5. Phase 4 — 장애·스케일 이벤트

### 5.1 EC2 1대 down (AA)

| 단계 | 동작 |
|------|------|
| ALB | unhealthy target 제외 |
| 사용자 (해당 node sticky) | 재요청 → **남은 node** → sync-down |
| 용량 | **50%** — soft AI cap ↓ |

### 5.2 Auto Scaling (선택)

- CPU > 70% 10분 → **+1 EC2** (max 4)
- Scale-in: **connection drain** 필수 — sticky 세션 보호

### 5.3 od-data 디스크 full

- [21 scratch metrics](./21_OD_SCRATCH_DISK_METRICS_가이드.md)
- **노드별** 알람 — 한 노드 full이 다른 노드에 영향 없음

---

## 6. 모니터링 (이중화 필수)

| 알람 | Phase |
|------|-------|
| ALB `UnHealthyHostCount` ≥ 1 | 2, 4 |
| Target **active connection** count (drain) | 4 |
| daemon OOM restart | 0+ |
| `od_export_failed` rate | 0+ |
| `od_byok_proxy_workspace_limit` | 0+ |
| Litestream lag | 2 |
| od-data **disk > 80%** per instance | 0+ |

---

## 7. Staging에서 리허설 (실제 절차)

Production Phase 4 **전** staging 에 동일 구조를 세워 리허설한다. staging DNS 는 GCP Cloud DNS 이므로 **ACM 발급·DNS cutover 는 수동**.

D1. **ACM 발급** (ALB region — ap-northeast-2)
- SAN: `stg-design.teamver.com`, `stg-design-api.teamver.com`
- DNS validation → ACM 이 요구하는 CNAME 을 GCP Cloud DNS 에 수동 추가
- 발급 완료 후 `arn:aws:acm:…` 확보

D2. **`staging.terraform.tfvars` 1차 apply** (ALB 만, EC2 는 아직 1)
```hcl
enable_alb              = true
alb_certificate_arn     = "arn:aws:acm:ap-northeast-2:…"
ec2_instance_count      = 1
alb_stickiness_enabled  = true
alb_stickiness_cookie_duration_seconds = 86400
alb_deregistration_delay_seconds       = 300
ec2_public_web_cidr_blocks = []  # ALB SG 만 EC2:80 허용
```
`terraform plan` 확인 → ALB/SG/리스너 신설, EC2/EBS 는 no-op → apply.

D3. **DNS cutover 리허설**
- GCP Cloud DNS 임시 레코드: `stg-design-alb.teamver.com` → ALB DNS (CNAME).
- `curl -H "Host: stg-design.teamver.com" https://stg-design-alb.teamver.com/_nginx/health` 200 확인.

D4. **nginx staging 구성 전환** (EC2-1)
- `stg-design.teamver.com.https.conf` (certbot) → `stg-design.teamver.com.http.conf` (ALB→:80).
- `apply_teamver_design_staging_nginx_conf.sh --disable stg-design.teamver.com.https.conf`.
- certbot renewal cron 은 확실히 이관 확인 후 제거.

D5. **DNS 실이관**
- GCP Cloud DNS: `stg-design.teamver.com` A → EIP 를 CNAME → ALB DNS 로 변경.
- `stg-design-api.teamver.com` 동일. TTL 300s.
- 롤백: A → EIP 복원 (nginx https.conf 재활성).

D6. **`ec2_instance_count = 2` 로 재 apply**
- 2번째 EC2 + EBS + ALB target 신설 (EIP[1]은 region quota 초과 시 apply 일부 실패 가능 — **§10.7**).
- **부트스트랩·앱 배포는 §10 Runbook 전체를 따른다** (user_data 실패 시 수동 복구가 일반적).
- node1과 **동일 revision** `.env.staging` + `deploy.sh --staging --rds` + nginx http conf.
- `OD_NODE_ID` 는 `deploy.sh` IMDS 자동 주입 — 별도 지정 불필요.

D7. **[39_5](./39_5_검증_체크리스트_FAQ.md) 리허설**
- A1~A5, H1, H3 시나리오.
- Sticky: `curl -c cookies.txt/-b cookies.txt` 로 `X-OD-Node-Id` 헤더가 동일 노드 반복 확인.

D8. **Litestream 노드별 replica 검증**
- S3 → `LITESTREAM_BUCKET` → `litestream/<node1-id>/app.sqlite/`, `litestream/<node2-id>/app.sqlite/` 두 prefix 가 각각 채워지는지 확인.
- `bash scripts/verify_litestream_replica.sh --staging` — 배너 `prefix=litestream/…/app.sqlite` 확인.

리허설 통과 후에만 production tfvars 를 `ec2_instance_count = 2` 로 flip.

---

## 8. 체크리스트 — Phase 4 Go-Live

- [ ] Terraform: `ec2_instance_count=2`, `alb_stickiness_enabled=true`, `alb_deregistration_delay_seconds≥300`
- [ ] `.env.production` 양쪽 동일 (git 동일 SHA + `deploy.sh` 순차)
- [ ] [39_2](./39_2_ALB_nginx_라우팅_설계.md) ALB idle 3600s
- [ ] `deploy/teamver/scripts/rolling_deploy.sh --dry-run` 통과
- [ ] `curl` 로 `X-OD-Node-Id` / `X-Design-Api-Node` 두 노드 확인
- [ ] Litestream S3 prefix — 노드별 `litestream/<node-id>/app.sqlite` 확인
- [ ] [39_5](./39_5_검증_체크리스트_FAQ.md) 부하·failover 시나리오 통과
- [ ] On-call: UnHealthyHostCount runbook 링크

---

## 10. EC2 부트스트랩·수동 복구 Runbook (D6 2노드 · 신규 EC2 공통)

**언제:** Terraform `apply` 직후, **2번째 노드 추가**, instance replace, 또는 `cloud-init` 실패 후.  
**SSOT 스크립트:** `deploy/teamver/scripts/mount_od_data_ebs.sh`, `migrate_od_data_ebs.sh`, `deploy.sh`  
**Terraform bootstrap:** `ns-teamver-devops/.../teamver-design/templates/ec2_bootstrap.sh.tpl`

> node1을 예전에 **수동 설치**만 했다면 `/etc/teamver-design.env` 가 없고 `.env.staging` 만 있을 수 있다 — **정상**. 배포는 `.env.staging` 만 본다.

### 10.1 증상 · 1차 진단

| 확인 | 정상 | 부트스트랩/배포 실패 징후 |
|------|------|---------------------------|
| `docker --version` | Docker CE 설치됨 | `command not found` |
| `nginx -v` | 설치됨 | 없음 |
| `sudo tail -30 /var/log/cloud-init-output.log` | `bootstrap complete` 근처 | `Failed to run module scripts_user` |
| `lsblk -f` | `nvme0n1` + **`nvme1n1`** (od-data) | `nvme1n1` 없음 → EBS 미부착 |
| `mountpoint /opt/teamver-design/od-data` | `is a mountpoint` | `not a mountpoint` |
| `deploy.sh --staging --rds` | preflight 통과 | `OD_DATA_HOST_PATH=… 가 마운트되지 않음` |

**cloud-init 실패 (2026-07 실제 사례):** 구 bootstrap 이 Ubuntu 22.04 기본 apt 에 없는 패키지를 `set -e` 로 설치하다 중단:

```text
E: Unable to locate package docker-compose-plugin
E: Unable to locate package amazon-cloudwatch-agent
```

→ Docker·nginx·`/etc/teamver-design.env`·EBS mount **전부 스킵**. tpl 은 Docker CE 공식 repo 방식으로 수정됨 — **이미 생성된 인스턴스에는 user_data 재실행 안 됨** → 아래 수동 절차 필수.

### 10.2 EC2 접속 (SSH · SSM · node2 private IP)

| 방법 | 명령 |
|------|------|
| node1 EIP | `terraform output ssh_command` (staging 예: `54.116.160.243`) |
| SSM (EIP 없을 때) | `aws ssm start-session --region ap-northeast-2 --target <instance-id>` |
| node1 → node2 (private) | node1 SSH 후 `scp … ubuntu@10.10.101.x:/tmp/` (동일 VPC) |

- `.pem` 은 팀 비밀 저장소 — [`teamver-design/README.md`](../../../ns-teamver-devops/terraform/services/teamver-design/README.md) §SSH 키.
- node2 EIP 가 `AddressLimitExceeded` 로 미생성되어도 **ALB target + private IP** 로 서비스 가능 — SSH 는 SSM 또는 node1 경유.

### 10.3 OS 수동 부트스트랩 (Docker CE + nginx)

**node2 / cloud-init 실패 EC2** 에서 root 로:

```bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release nginx git

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
# docker 그룹 반영: 로그아웃 후 재접속 또는 newgrp docker
docker compose version
nginx -v
```

CloudWatch agent 는 **선택** — 없어도 deploy 가능.

### 10.4 환경 파일 — `.env.staging` vs `/etc/teamver-design.env`

| 파일 | 생성 주체 | deploy 필수 | 용도 |
|------|-----------|-------------|------|
| **`deploy/teamver/.env.staging`** | 운영자 (수동·복사) | **✅** | `docker compose --env-file`, secrets, S3/RDS |
| **`/etc/teamver-design.env`** | Terraform user_data (bootstrap 성공 시) | ❌ | Terraform·운영 참고용 메타 (RDS host 등) |

**`.env.staging` 만드는 3가지 방법 (우선순위):**

1. **node1에서 복사 (권장)** — 동일 secrets·BFF session·internal key 유지  
2. **수동** — `cp .env.staging.example .env.staging` + secrets 입력 + `run_staging_phase0_activate.sh --from-terraform`  
3. **`/etc/teamver-design.env` 에서 scp** — ❌ node1에도 없을 수 있음 (수동 구축 EC2)

**필수 secrets** (example 에 비어 있음):

| 키 | 출처 |
|----|------|
| `POSTGRES_PASSWD` | teamver-staging RDS master (`TF_VAR_teamver_design_rds_pass`) |
| `OD_API_TOKEN` | node1 / 1Password — nginx `teamver-design-od-token.conf` 와 **동일** |
| `TEAMVER_INTERNAL_API_KEY` | **Main BE** `ns-teamver-be/.env.staging` 과 **동일** |
| `DESIGN_BFF_SESSION_SECRET` | node1과 **동일** (노드마다 다르면 BFF 쿠키 불일치) |

**Mac → node1 → node2 복사 예:**

```bash
# Mac → node1
scp -i ~/.k/ec2-key-teamver-staging-design.pem \
  ubuntu@<node1-eip>:~/neural/ns-open-design/deploy/teamver/.env.staging /tmp/.env.staging

# node1 → node2 (private IP)
scp /tmp/.env.staging ubuntu@10.10.101.198:/tmp/.env.staging
```

node2:

```bash
mkdir -p ~/neural/ns-open-design/deploy/teamver
cp /tmp/.env.staging ~/neural/ns-open-design/deploy/teamver/.env.staging
chmod 600 ~/neural/ns-open-design/deploy/teamver/.env.staging
```

경로는 팀 convention (`~/neural/ns-open-design` vs `/opt/teamver-design`) — **node1과 동일**하게.

**수동 생성 (복사 불가 시):**

```bash
cd ~/neural/ns-open-design/deploy/teamver
cp .env.staging.example .env.staging
# 위 4 secrets + 필요 시 LLM keys 편집
bash scripts/run_staging_phase0_activate.sh --from-terraform
bash scripts/validate_deploy_env.sh --staging --rds
```

### 10.5 od-data EBS 마운트 (deploy preflight 필수)

`validate_deploy_env.sh` 는 `OD_DATA_HOST_PATH=/opt/teamver-design/od-data` 가 **실제 mountpoint** 인지 검사한다. bootstrap 실패·EBS late attach 시 흔한 blocker.

**1) 디스크 확인**

```bash
lsblk -f
df -h / /opt/teamver-design/od-data
mountpoint /opt/teamver-design/od-data || true
```

| `lsblk` | 조치 |
|---------|------|
| `nvme1n1` 있음, MOUNTPOINT 비어 있음 | **10.5.2** mount 스크립트 |
| `nvme1n1` 없음 | AWS EC2 → Volumes → instance 에 30GiB od-data attached? → Terraform `ebs_data.tf` / re-attach |
| `nvme1n1` 이미 `/opt/teamver-design/od-data` | deploy 로 진행 |

**2) 마운트 (repo clone 후 `deploy/teamver` 에서)**

```bash
cd ~/neural/ns-open-design/deploy/teamver

# 마운트만 (신규 node2 — Docker 스택 없을 때)
sudo bash scripts/mount_od_data_ebs.sh --apply
mountpoint /opt/teamver-design/od-data && df -h /opt/teamver-design/od-data
```

또는 마운트 + systemd boot unit + (legacy volume 있으면) migrate + deploy:

```bash
sudo bash scripts/migrate_od_data_ebs.sh --apply --staging
```

- **node2 (fresh):** legacy Docker named volume 없음 → rsync 스킵, mount 후 `deploy.sh --staging --rds --skip-validate` 까지 실행.
- **node1 (root 디스크 full):** legacy volume → bind mount 이전용.

**3) 권한** — 스크립트가 container uid **1001** 로 `chown` (`fix_od_data_permissions.sh`).

### 10.6 앱 배포 · nginx (node2 완료 체크리스트)

> **nginx 상세(순서·default 비활성·empty peers):** **[§10.11](#1011-nginx-alb-httpconf-적용-순서--함정-prodstaging)**  
> **DaemonDb `CREATE DATABASE`:** [39_9](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md) — `teamver_design_daemon_*` 없으면 daemon Restarting.

```bash
cd ~/neural/ns-open-design/deploy/teamver

# repo (미 clone 시)
# mkdir -p ~/neural && cd ~/neural
# git clone -b staging https://github.com/NeuralStudioKr/ns-open-design.git

# .env: OD_DOCKER_PUBLISH_HOST=0.0.0.0 (2노드 peer :7456 필수)
# .env: OD_DAEMON_DB=postgres + OD_PG_* (DaemonDb) — DB는 RDS에 1회 CREATE 후
bash deploy.sh --staging --rds          # staging
# bash deploy.sh --production --rds     # production

# --- nginx: §10.11 전체 순서 권장 ---
# Staging (ALB cutover 후 — http only, certbot https 금지)
cd devops/nginx
sudo bash ./apply_teamver_design_staging_nginx_conf.sh \
  ./stg-design.teamver.com.http.conf \
  --disable stg-design.teamver.com.https.conf
# Production
# sudo bash ./apply_teamver_design_nginx_conf.sh \
#   ./design.teamver.com.http.conf \
#   --disable design.teamver.com.https.conf
#
# apply 스크립트가 자동:
#   - sites-enabled/default 제거 (ALB Host 없는 health → Ubuntu 웰컴 HTML 404 방지)
#   - peers stub + render_od_daemon_peers_nginx.sh (awscli 없으면 IMDS self-IP 폴백; 2노드는 수동/awscli)
# OD token: .env.* OD_API_TOKEN → /etc/nginx/conf.d/teamver-design-od-token.conf
```

**로컬 헬스 (node2) — Host 없이 (ALB와 동일):**

```bash
curl -fsS http://127.0.0.1/_nginx/health   # 기대: ok (200). 404 = default 잔존 또는 nginx -t 실패로 reload 안 됨
ls -la /etc/nginx/sites-enabled/           # http.conf 만 (default / https.conf 없어야 함)
docker ps
```

**ALB (Mac):**

```bash
curl -fsS https://stg-design.teamver.com/_nginx/health     # staging
# curl -fsS https://design.teamver.com/_nginx/health      # production
# AWS: target group 2/2 healthy
curl -sI https://stg-design.teamver.com/api/health | grep -i x-od-node-id
```

### 10.7 Terraform 잔여 이슈 — EIP quota

`aws_eip.app[1]` apply 실패:

```text
AddressLimitExceeded: The maximum number of addresses has been reached
```

- **서비스:** ALB/NAT/기존 EC2 EIP 가 quota(예: 10) 소진 — Release 불가(eni 연결) 항목 많음.
- **조치:** AWS Service Quotas → EC2 **Elastic IP addresses** 상향(권장 12~15) → `terraform apply` 재시도.
- **node2 운영:** EIP 없이 **SSM + private IP** 로 배포 가능 — 사용자 트래픽은 ALB.

### 10.8 node1도 bootstrap 미완료인 경우

node1이 수동으로만 올라간 전형적 상태:

- `/etc/teamver-design.env` 없음 ✅
- `~/neural/ns-open-design/deploy/teamver/.env.staging` 있음 ✅
- od-data 는 예전에 수동 mount 또는 `migrate_od_data_ebs.sh` 완료

**node2만 §10.3~10.6** 수행. node1 재부트 시 od-data 유실 방지:

```bash
# node1에서 boot mount unit 있는지
systemctl is-enabled teamver-design-od-data.mount.service 2>/dev/null || \
  sudo bash scripts/migrate_od_data_ebs.sh --apply --staging
```

### 10.9 트러블슈팅 요약

| 에러 | 원인 | 해결 |
|------|------|------|
| `docker: command not found` | user_data 중단 | §10.3 |
| `scp: /etc/teamver-design.env: No such file` | bootstrap 미실행 EC2 | §10.4 — `.env.staging` 사용 |
| `OD_DATA_HOST_PATH … 마운트되지 않음` | EBS 미포맷/미마운트 | §10.5 `mount_od_data_ebs.sh --apply` |
| `No unattached od-data block device` | EBS 미부착 | AWS volume attachment / terraform |
| `validate_deploy_env` secrets | `.env.staging` 누락 | §10.4 |
| ALB 1/2 healthy | node2 미배포/nginx | §10.6 · **§10.11** |
| `/_nginx/health` **404** (Host 없음) | Ubuntu `sites-enabled/default` 또는 `nginx -t` 실패로 reload 안 됨 | §10.11 — default 제거 + peers 채운 뒤 `nginx -t && reload` |
| `nginx: no servers are inside upstream` | peers.inc **빈 stub** (awscli 없음·render skip) | §10.11 · [39_5 §3.1.3](./39_5_검증_체크리스트_FAQ.md#313-nginx-no-servers-are-inside-upstream--_nginxhealth-404) |
| daemon Restarting · `database "…_daemon_…" does not exist` | DaemonDb **CREATE 미실행** | [39_9](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md) `rds_create_daemon_database_sql` |
| `/_next/static/*.js` 404 · ChunkLoadError | **node1·node2 Docker 빌드 불일치** (ALB RR) | [31 §8.2.1](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md#821-chunkloaderror--2노드-alb--빌드-revision-불일치-404) — node1 deploy 동기화 |
| `/api/*` **502** (nginx → `10.10.101.x:7456`) | daemon **127.0.0.1:7456 only** — hash peer unreachable | `.env` **`OD_DOCKER_PUBLISH_HOST=0.0.0.0`** + deploy ([39_5 §3.1.2](./39_5_검증_체크리스트_FAQ.md#312-api-502--hash-peer-7456-unreachable)) |
| SSH node2 publickey | EIP/키 불일치 | SSM §10.2 |
| RDS `password authentication failed` | terraform apply 시 `TF_VAR_teamver_design_rds_pass` 오타로 master 덮임 | AWS `modify-db-instance --master-user-password` 후 `.env` `POSTGRES_PASSWD`/`OD_PG_PASSWORD` 동기화. plan에 `aws_db_instance … password` 보이면 의도 없으면 apply 금지 |

### 10.10 instance replace 시 (bootstrap tpl 수정 반영)

user_data 는 **첫 부팅에만** 실행. tpl 수정 후 기존 node2에 반영하려면:

```bash
# terraform: instance replace (downtime — rolling_deploy 권장)
terraform apply -var-file=staging.terraform.tfvars -replace='aws_instance.app[1]'
```

또는 **수동 §10.3~10.6** (replace 없이) — staging 리허설에서 더 빠른 경우 많음.

### 10.11 nginx ALB http.conf 적용 순서 · 함정 (prod/staging)

**SSOT 스크립트**

| 환경 | apply | conf |
|------|-------|------|
| Staging | `devops/nginx/apply_teamver_design_staging_nginx_conf.sh` | `stg-design.teamver.com.http.conf` |
| Production | `devops/nginx/apply_teamver_design_nginx_conf.sh` | `design.teamver.com.http.conf` |
| Peers | `scripts/render_od_daemon_peers_nginx.sh` | `/etc/nginx/teamver-design-od-daemon-peers.inc` |

**금지:** `*.https.conf` enable (ALB가 TLS 종료 — EC2 certbot enable 시 **redirect loop**).

#### 권장 순서 (node1 → healthy → node2 → 양쪽 peer)

1. **deploy** — `.env`에 `OD_DOCKER_PUBLISH_HOST=0.0.0.0`. DaemonDb 사용 시 RDS에 DB 존재 ([39_9](./39_9_DaemonDb_B5_잔여_plugins_후속_및_RDS.md)).
2. **(권장) awscli** — `sudo apt-get install -y awscli` (인스턴스 프로파일 `ec2:DescribeInstances` — terraform `app_ec2_peer_discovery`).
3. **nginx apply** (아래 Production 예):

```bash
cd ~/neural/ns-open-design/deploy/teamver/devops/nginx
sudo bash ./apply_teamver_design_nginx_conf.sh \
  ./design.teamver.com.http.conf \
  --disable design.teamver.com.https.conf
```

apply가 하는 일:

| 단계 | 동작 |
|------|------|
| backup | `/etc/nginx/backup_YYYYMMDD_HHMMSS/` |
| `--disable` | 지정 conf를 `sites-enabled`에서 이동 |
| **default 제거** | `sites-enabled/default` 이동 — ALB health는 **Host 없음**이라 Ubuntu default(웰컴 HTML)로 가면 `/_nginx/health` **404** |
| http.conf | `listen 80 default_server` + `design` / `design-api` |
| includes | `teamver-design*.inc.conf` → `sites-available/` |
| peers | stub 없으면 example 복사 → `render_od_daemon_peers_nginx.sh` |
| token | `.env.production` `OD_API_TOKEN` → `conf.d/teamver-design-od-token.conf` |
| reload | `nginx -t` 성공 시에만 `systemctl reload`. peers에 `server` 줄 없으면 **apply가 exit 1** (빈 stub로 -t 실패하기 전 명시적 에러) |

4. **검증 (해당 노드)**

```bash
ls -la /etc/nginx/sites-enabled/
# 기대: *.http.conf 심볼릭만 (default / https.conf 없음)

curl -fsS http://127.0.0.1/_nginx/health
# Host 헤더 없이 — ALB 와 동일. 기대: ok

cat /etc/nginx/teamver-design-od-daemon-peers.inc
# 기대: server 10.x.x.x:7456 … N줄 (2노드면 2줄, sorted, self 포함). 주석만이면 ❌
```

5. **양쪽 기동 후 peer 재생성** (hash ring 동일):

```bash
cd ~/neural/ns-open-design/deploy/teamver
sudo bash ./scripts/render_od_daemon_peers_nginx.sh
sudo nginx -t && sudo systemctl reload nginx
# node1·node2 둘 다 — peers.inc 내용이 같아야 함
```

#### 함정 A — `no servers are inside upstream`

**증상 (apply 직후):**

```text
⚠️ aws CLI not found — skipping peer render …
nginx: [emerg] no servers are inside upstream in …/teamver-design-od-daemon-upstream.inc.conf
nginx: configuration file … test failed
```

**원인:** `open_design_daemon_hashed` 가 `include /etc/nginx/teamver-design-od-daemon-peers.inc` 하는데 파일이 **주석만**(example stub)이면 nginx 거부.  
`sites-enabled` 는 이미 http.conf로 바뀌었는데 **reload는 실패** → 메모리상 구 conf 또는 default 제거만 반영된 어중간 상태 → Host 없는 `/_nginx/health` **404**.

**즉시 복구 (prod private IP 예 — 실제 EIP/IP는 `terraform output` / IMDS):**

```bash
# 양쪽 EC2에 동일 내용 (IP는 환경에 맞게, sort 유지)
sudo tee /etc/nginx/teamver-design-od-daemon-peers.inc >/dev/null <<'EOF'
server 10.10.101.63:7456 max_fails=2 fail_timeout=10s;
server 10.10.101.138:7456 max_fails=2 fail_timeout=10s;
EOF
sudo nginx -t && sudo systemctl reload nginx
curl -fsS http://127.0.0.1/_nginx/health
```

그다음 `apt install awscli` + `render_od_daemon_peers_nginx.sh` 로 자동화.  
(최신 스크립트: awscli 없어도 **IMDS self-IP** 는 써서 upstream 이 비지 않게 함 — 2노드 ring은 여전히 awscli/수동 필요.)

#### 함정 B — Ubuntu `default` vs `default_server`

| | Ubuntu `sites-enabled/default` | Design `*.http.conf` |
|--|-------------------------------|----------------------|
| listen | `80 default_server` | `80 default_server` |
| Host 없는 요청 | 웰컴 HTML / 경로 404 | `/_nginx/health` → **ok** |
| ALB health | **실패 (404)** | **성공** |

apply `*.http.conf` 시 스크립트가 `default` 를 **자동 비활성**. 수동만 할 때:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

#### 함정 C — peers 경로

| 경로 | OK? |
|------|-----|
| `/etc/nginx/teamver-design-od-daemon-peers.inc` | ✅ upstream `{ include }` |
| `/etc/nginx/conf.d/…peers….conf` | ❌ bare `server` → nginx 파싱 실패 |

---

## 11. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-13 | §10.11 nginx ALB apply 순서·default·empty peers·DaemonDb/RDS password 트러블슈팅 보강 |
| 2026-07-08 | §10.9 `/api/*` 502 — `OD_DOCKER_PUBLISH_HOST=0.0.0.0` 트러블슈팅 |
| 2026-07-08 | §10 EC2 부트스트랩·수동 복구 Runbook (D6 node2, `.env.staging`, od-data EBS, EIP quota) |
| 2026-07-07 | Phase 2/4 배포·failover·rolling SSOT |
| 2026-07-07 | Terraform `ec2_instance_count` count 화, `rolling_deploy.sh` 도입, Litestream 노드별 replica prefix, `OD_NODE_ID` 관측 |

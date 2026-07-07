# Teamver Design — 배포·Terraform·운영 Runbook (이중화)

**목적:** Phase 2 (Passive) · Phase 4 (Active-Active) **실행 절차** — Terraform, deploy, failover, rolling, Litestream.  
**관련:** [07 VM 배포](./07_VM_배포_인프라.md) · [17 Production 출시](./17_Production_출시_작업_순서.md) · [39_2 라우팅](./39_2_ALB_nginx_라우팅_설계.md)

**Terraform SSOT:** `ns-teamver-devops/terraform/services/teamver-design/`  
**배포 SSOT:** `ns-open-design/deploy/teamver/deploy.sh`

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

### 3.1 rolling_deploy.sh (SSOT)

`deploy/teamver/scripts/rolling_deploy.sh` — ALB drain → SSH deploy → local health → register 를 host 순차 실행. dry-run 지원.

```bash
# Staging (2 EC2 리허설)
bash deploy/teamver/scripts/rolling_deploy.sh \
  --env staging \
  --tg-arn "$(cd ns-teamver-devops/terraform/services/teamver-design && terraform output -raw alb_target_group_arn)" \
  --hosts "ubuntu@<node1-ip> ubuntu@<node2-ip>" \
  --ssh-key ~/.ssh/teamver-design-staging.pem \
  --deploy-extra "--rds"

# Production
bash deploy/teamver/scripts/rolling_deploy.sh \
  --env production \
  --tg-name teamver-design-prod-nginx-tg \
  --hosts "ubuntu@<node1-ip> ubuntu@<node2-ip>" \
  --ssh-key ~/.ssh/teamver-design-prod.pem \
  --deploy-extra "--rds"

# Dry-run (aws / ssh 미호출 — plan 만 출력)
bash deploy/teamver/scripts/rolling_deploy.sh \
  --env production --tg-name teamver-design-prod-nginx-tg \
  --hosts "ubuntu@i-0aaa ubuntu@i-0bbb" --ssh-key ~/.ssh/prod.pem --dry-run
```

절차 (내부):

```text
per host in --hosts:
  1. aws elbv2 deregister-targets --targets Id=<instance-id>
  2. wait for state=draining|unused (drain-wait, default 60s)
     ↑ ALB deregistration_delay 동안 in-flight SSE 자연 종료
  3. ssh <host> "cd ~/ns-open-design/deploy/teamver && bash deploy.sh --<env> --rds …"
     ↑ 해당 EC2 에서 docker compose pull & up (OD_NODE_ID IMDS 자동 주입)
  4. ssh <host> "curl -fsS http://127.0.0.1/_nginx/health"
  5. aws elbv2 register-targets → wait for state=healthy (healthy-wait, default 180s)
  6. move on to next host
```

### 3.2 배포 중 사용자 영향

| userId hash (정상) | drain 중 |
|--------------------|----------|
| 해당 user → drain target daemon | SSE **끊길 수 있음** → FE backoff → hash 재계산 시 healthy peer |
| 다른 user | healthy target 계속 서비스 |

### 3.3 관측 — X-OD-Node-Id / X-Design-Api-Node

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

### 3.4 Litestream replica 분리

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
- 2번째 EC2 + EBS + EIP + ALB target 신설.
- 부트스트랩 완료 후 SSH → `git clone ns-open-design` → `.env.staging` 배포 → `bash deploy.sh --staging --rds`.
- `OD_NODE_ID` 는 자동 주입 — 별도 지정 불필요.

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

## 9. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-07 | Phase 2/4 배포·failover·rolling SSOT |
| 2026-07-07 | Terraform `ec2_instance_count` count 화, `rolling_deploy.sh` 도입, Litestream 노드별 replica prefix, `OD_NODE_ID` 관측 |

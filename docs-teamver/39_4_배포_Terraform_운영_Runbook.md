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

| 리소스 | Phase 0 | Phase 4 |
|--------|---------|---------|
| `aws_instance` count | 1 | **2** (또는 ASG min=2) |
| od-data EBS | 1 × 100GiB | **2 × 100GiB** (인스턴스별) |
| ALB target | 1 | **2** |
| Stickiness | optional | **enabled** (39_2) |

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

**목표:** 한 번에 **한 target** 만 drain — SSE 사용자 보호.

### 3.1 절차

```text
1. ALB target-1 deregister (connection draining ON, delay 300s+)
2. target-1 에서: docker compose pull && up -d
3. /_nginx/health + /api/health green
4. target-1 register
5. 5~10분 관찰 (5xx, od_export, od_byok_proxy)
6. target-2 반복
```

### 3.2 deploy.sh

현재 `deploy.sh`는 **단일 EC2 SSH** 가정 — Phase 4에서는:

- `DEPLOY_HOSTS="ec2-1 ec2-2"` 순차 loop **또는**
- Ansible/SSM **Run Command** — **아직 미구현** → runbook 수동 또는 스크립트 확장 TODO

### 3.3 배포 중 사용자 영향

| sticky ON | drain 중 |
|-----------|----------|
| 기존 cookie → drain target | SSE **끊길 수 있음** → FE backoff |
| 신규 → healthy target | sync-down 지연 가능 |

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
2. ACTIVE target deregister 또는 ASG detach
3. STANDBY:
   a. Litestream restore app.sqlite (필요 시)
   b. docker compose up (이미지 최신 확인)
   c. health green
4. STANDBY ALB register
5. DNS/모니터링 — 5xx, session, export
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

## 7. Staging에서 리허설

Production Phase 4 **전**:

1. staging은 **ALB 없음** — EIP 1대로 **nginx hash 2 upstream** 시뮬레이션 **불가** (로컬 2 daemon은 SQLite 공유 문제 — **od-data 분리 VM 2** 필요)
2. **대안:** dev/staging **2 EC2 mini** + ALB test TG — 비용 trade-off
3. **최소:** Phase 2 failover만 staging에서 Litestream restore 리허설

---

## 8. 체크리스트 — Phase 4 Go-Live

- [ ] Terraform: 2 instance, 2 EBS, stickiness ON
- [ ] `.env.production` 양쪽 동일
- [ ] [39_2](./39_2_ALB_nginx_라우팅_설계.md) ALB idle 3600s
- [ ] Rolling deploy runbook 팀 공유
- [ ] [39_5](./39_5_검증_체크리스트_FAQ.md) 부하·failover 시나리오 통과
- [ ] On-call: UnHealthyHostCount runbook 링크

---

## 9. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-07 | Phase 2/4 배포·failover·rolling SSOT |

# Teamver Design — 이중화 Phase 로드맵 (0 → 5)

**목적:** [39_0 개요](./39_0_Design_이중화_로드맵_개요.md) 의 Phase 표를 **실행 가능한 단계**로 풀어 쓴다.  
**독자:** DevOps·백엔드·출시 PM — “다음 스프린트에 무엇을 할지” 기준.

**관련:** [38 §12.4 P3](./38_Design_동시성_용량_확장_가이드.md#124-상용-scale-up-p3--multi-node는-여기) · [34 Export Phase 3](./34_Export_성능_개선_로드맵.md)

---

## 1. Phase 한 장 요약

```text
Phase 0 ──► Phase 1 ──► Phase 2 (HA)     ──┐
   │            │              │            │
   │            │              └──► Phase 4 (AA + sticky)
   │            │
   │            └──► Phase 3 (export worker) ──► Phase 5 (Track B)
   │
   └── single EC2 (현재 상용 1호기)
```

| Phase | 언제 | 산출물 | 공수 (rough) |
|-------|------|--------|--------------|
| **0** | 오픈 전 | prod 단일 EC2, G1~G6 | 1~2주 (배포·검증) |
| **1** | soft cap 압박 | t3.2xlarge→더 큰 타입 또는 ENV | 1~3일 |
| **2** | HA SLA | Standby EC2, failover runbook | 1~2주 |
| **3** | export 병목 | export worker / async job | 2~4주 |
| **4** | 용량 2× | ALB 2 target, sticky, 39_2~4 | 2~3주 |
| **5** | scale+정석 | Postgres DaemonDb, project routing | **분기** |

---

## 2. Phase 0 — 오픈 1호기 (단일 EC2) ✅ 현재 정석

**목표:** SPOF를 감수하고 **기능·격리·S3 SSOT** 로 상용 오픈.

### 2.1 아키텍처

```text
[ALB prod]
   └─ EC2-1 (t3.2xlarge)
         ├─ nginx :80
         ├─ open-design-daemon :7456
         ├─ teamver-design-api :16000
         └─ EBS od-data (app.sqlite + scratch)
[S3 project-data] [RDS design-api] [Litestream → S3]
```

### 2.2 필수 (38 P0)

- Terraform `t3.2xlarge`, od-data **100GiB**
- `.env.production` §13.1 — `UVICORN_WORKERS=5`, `OD_MEM_LIMIT=8g`, `OD_EXPORT_MAX_CONCURRENT=6`
- [09](./09_Design_저장소_격리_출시게이트.md) G1~G6
- CloudWatch OOM·scratch·export 알람

### 2.3 이중화 하지 않는 이유

- SQLite **multi-writer** 미지원
- scratch **노드 로컬** — LB round-robin 시 split-brain
- Track B **미구현** ([04 Track B](./04_구현_우선순위.md))

### 2.4 성공 기준

- 동시 브라우징 50+ — API 5xx 없음
- 동시 AI ~5~10 — 완료 (latency 허용)
- export 6 parallel + queue — OOM restart 0

---

## 3. Phase 1 — Vertical scale (단일 노드 튜닝)

**트리거:** [38 §12.3](./38_Design_동시성_용량_확장_가이드.md) — OOM, AI p95 latency, export queue p95 > 60s **인데** multi-node 아직 부담.

### 3.1 조치 (우선순위)

1. `OD_EXPORT_CACHE_ENABLED=1` — 재export Chromium ↓
2. `OD_EXPORT_MAX_CONCURRENT` 6→8 (MEM_LIMIT와 함께)
3. EC2 **한 단계 업** (예: `t3.2xlarge` → `m6i.2xlarge` — 메모리 bound 시)
4. `OD_BYOK_PROXY_MAX_PER_WORKSPACE` — seat/plan 정책과 정합 (default 8 유지 권장)

### 3.2 하지 않을 것

- daemon replica 2 on **same EBS**
- ALB target만 추가 (Phase 4 선행조건 없이)

---

## 4. Phase 2 — Active-Passive HA (용량 2× 아님)

**목표:** **장애 시 RTO 단축**. 동시 처리량은 **여전히 1대 분**.

### 4.1 아키텍처

```text
[ALB]
   ├─ EC2-A (ACTIVE)   ← 100% 트래픽
   └─ EC2-B (STANDBY)  ← health만, 또는 DR용 cold/warm

각 EC2: 독립 od-data EBS + Litestream
S3: 공통 SSOT (프로젝트 파일)
```

### 4.2 동작

| 이벤트 | 동작 |
|--------|------|
| ACTIVE healthy | STANDBY는 ALB target **draining** 또는 **미등록** |
| ACTIVE fail | ALB unhealthy → **수동/자동** STANDBY promote |
| Promote 후 | STANDBY od-data **Litestream restore** 또는 S3 sync-down으로 warm |

### 4.3 scratch / SQLite

- **항상 writer 1** — split-brain **없음**
- sticky **불필요** (트래픽 1대)
- [38 Q4](./38_Design_동시성_용량_확장_가이드.md) **차선**과 동일

### 4.4 선행조건

- [39_4 Runbook](./39_4_배포_Terraform_운영_Runbook.md) §3 failover
- Litestream restore **리허설** (분기 1회)
- 동일 `.env.production` revision — **배포 동기화**

### 4.5 적합한 SLA

- RTO **15~30분** (수동 failover)
- RPO: Litestream lag + S3 sync-up 주기

---

## 5. Phase 3 — Export worker 분리 (daemon 전체 이중화 전)

**목표:** PDF/ZIP spike가 **daemon OOM·restart** 로 이어지지 않게.

**SSOT:** [34 §9 Phase 3](./34_Export_성능_개선_로드맵.md)

### 5.1 아키텍처 (목표)

```text
[EC2 main]
   daemon (chat, BYOK, files) ──publish──► [export queue / Redis / SQS]
                                                    │
[EC2 or ECS export worker] ◄──consume── Chromium render → S3 exports/
```

### 5.2 이중화와의 관계

- **용량:** export 6 slot → worker pool **M × 6**
- **HA:** export worker 자체를 2+ — daemon HA와 **독립**
- **scratch:** export input은 **S3 sync-down 또는 FE inline HTML** ([33](./33_프로젝트_다운로드_Export_아키텍처.md)) — worker는 **stateless**에 가깝

### 5.3 Phase 4 전에 export worker를 먼저 하는 이유

- Active-Active 2 daemon 시 **Chromium × 2 노드** → RAM **2배** — export 분리로 main daemon RAM 확보
- export spike가 **양쪽 노드**를 동시에 죽이는 패턴 완화

---

## 6. Phase 4 — Active-Active (EC2 2+ + affinity)

**목표:** **동시 AI·브라우징 용량** 확대 + ALB 레벨 HA.

### 6.1 아키텍처

```text
[ALB sticky or nginx hash]
   ├─ EC2-1 (full stack)  od-data-1
   └─ EC2-2 (full stack)  od-data-2

design-api: 각 EC2에 1 compose — **또는** design-api만 별도 ASG (선택)
daemon /api/*: **반드시 affinity**
```

### 6.2 affinity 키 선택 (39_2·39_3)

| 옵션 | 구현 | 권장 시점 |
|------|------|-----------|
| **ALB LBCookie** | Target group stickiness | **빠른 1차** — 구현 최소 |
| **nginx hash $teamver_user_id** | auth_request 후 hash | **userId 명시** — embed와 정합 |
| **projectId hash** | body/URL 파싱 | **Track B** 전까지 어려움 |

**Phase 4 기본 권장:** ALB stickiness **+** nginx `X-Teamver-User-Id` 전달 (이미 있음) → 추후 hash upstream.

### 6.3 용량 기대

| 지표 | single node | 2 node AA (균등 sticky) |
|------|-------------|-------------------------|
| soft AI stream | ~5~10 | ~10~20 |
| ws cap 8 | 노드당 동일 | 노드당 동일 (전역 2× **아님**) |
| export concurrent | 6 | **6×2** (노드별 ENV) |

### 6.4 선행조건 (게이트)

- [39_2](./39_2_ALB_nginx_라우팅_설계.md) 구현·리뷰
- [39_5](./39_5_검증_체크리스트_FAQ.md) Phase 4 시나리오 통과
- **동일 project 다인 편집** — 제품상 비권장 유지 ([38 §5.5](./38_Design_동시성_용량_확장_가이드.md))
- 노드 drain 시 **S3 sync-down** 전제 ([20](./20_Design_Hybrid_저장소_로컬_S3_가이드.md))

### 6.5 Terraform 변경 (개략)

- `teamver-design` module: `ec2_count = 2` (또는 ASG min=2)
- ALB target group: **2 instances**, stickiness enabled
- **독립** `od_data_volume` per instance
- 배포: `deploy.sh` **순차 rolling** (39_4)

---

## 7. Phase 5 — Track B (multi-daemon 정석)

**목표:** scratch·SQLite·공정성·circuit breaker — **코드 레벨** multi-daemon.

**SSOT:** [02 design-app ↔ daemon](./02_design-app_daemon_연동.md) · [04 Track B](./04_구현_우선순위.md)

### 7.1 구현 순서 (38 §12.4 + 02)

```text
1. design-api wrapper: job/run API + 발행 슬롯 + circuit breaker (B1, B4)
2. export async job + dedicated worker (Phase 3와 합류 가능)
3. OD DaemonDb → Postgres (B5, upstream OD)
4. ALB / gateway: projectId → daemon 라우팅 (registry)
5. (선택) S3 export cache multi-instance warm share
```

### 7.2 Phase 4와의 차이

| | Phase 4 sticky | Phase 5 Track B |
|--|----------------|-----------------|
| affinity | userId / cookie | **projectId** (SSOT) |
| daemon DB | SQLite × N | **Postgres 1** |
| scratch | 노드 로컬 | S3-first + affinity 또는 공유 FS (비권장) |
| 새 run 발행 | 무제한 fan-in | **슬롯·큐·breaker** |

### 7.3 공수

- **엔지니어링 프로젝트 (분기 단위)** — OD upstream Postgres DaemonDb 일정에 종속

---

## 8. Phase 선택 가이드 (PM용)

| 질문 | 답 → Phase |
|------|------------|
| 아직 오픈 전? | **0** |
| OOM만 가끔? | **1** |
| EC2 죽으면 30분 downtime unacceptable? | **2** |
| PDF만 느리고 AI OK? | **3** |
| DAU↑, 동시 AI 10+ 지속? | **4** |
| 4 했는데 scratch 502·registry 꼬임? | **5** |

---

## 9. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-07 | Phase 0~5 상세·트리거·선행조건 |

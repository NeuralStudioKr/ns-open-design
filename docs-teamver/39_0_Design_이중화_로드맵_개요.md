# Teamver Design — 이중화·수평 확장 로드맵 개요 (39 시리즈 SSOT)

**목적:** 상용화 이후 **용량·가용성(HA)** 를 위해 Design 인프라를 어떻게 **단계적으로** 이중화·확장할지 **의사결정·로드맵·문서 색인**을 한곳에 둔다.  
**전제:** 현재 MVP·1호기 상용은 **단일 EC2 + daemon 1** ([38 §12](./38_Design_동시성_용량_확장_가이드.md)). 이 시리즈는 **그 다음 단계**를 다룬다.

**관련 SSOT**

| 문서 | 내용 |
|------|------|
| [38 동시성·용량·확장](./38_Design_동시성_용량_확장_가이드.md) | worker·AI cap·single-node 한계·P0~P3 |
| [07 EC2·배포·인프라](./07_VM_배포_인프라.md) | t3.2xlarge·ALB·EBS·ENV |
| [39_4 배포·Terraform Runbook §3](./39_4_배포_Terraform_운영_Runbook.md#3-rolling-배포-phase-4) | **rolling_deploy** — Mac vs EC2·빌드 위치·git pull |
| [39_4 §10](./39_4_배포_Terraform_운영_Runbook.md#10-ec2-부트스트랩수동-복구-runbook-d6-2노드--신규-ec2-공통) | bootstrap 실패·node2 수동·`.env.staging`·od-data EBS |
| [31 Staging vs Production 네트워크](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md) | ALB·nginx·DNS |
| [20 Hybrid 저장소](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) | scratch·S3·SQLite |
| [02 design-app ↔ daemon](./02_design-app_daemon_연동.md) | Track B queue·circuit breaker |
| [04 구현 우선순위](./04_구현_우선순위.md) Track B | B1~B5 작업 목록 |
| [34 Export 성능](./34_Export_성능_개선_로드맵.md) | export worker 분리 Phase 3 |

**코드·인프라 SSOT:** `deploy/teamver/` · `ns-teamver-devops/terraform/services/teamver-design/`

---

## 1. 한 줄 결론

> **상용 “오픈 1호기”에는 이중화가 필수는 아니다** — `t3.2xlarge` + ENV·모니터링이 P0.  
> **상용 “성장·HA” 단계에서는 이중화가 낫다** — 다만 **daemon만 ALB 뒤 replica 2+** 는 **금지**; **EC2 2대 + sticky** 또는 **Active-Passive** 가 현실적 1차.  
> **scratch·SQLite·SSE** 를 근본 해결하려면 **Track B (Postgres DaemonDb + project affinity)** 가 최종 정석이다.

---

## 2. “이중화”가 의미하는 것 (용어)

Teamver Design 스택은 **역할이 3층**이다. 이중화 대상을 혼동하면 장애·데이터 손상이 난다.

```text
[브라우저]
    │
    ├─ design.teamver.com (nginx :80 ← ALB :443)
    │     └─ open-design-daemon :7456   ← scratch·SSE·export·BYOK proxy
    │
    └─ design-api.teamver.com
          └─ teamver-design-api :16000  ← stateless BFF (세션·registry)
                └─ RDS (design-api schema)
```

| 컴포넌트 | stateless? | 이중화 난이도 | 비고 |
|----------|------------|---------------|------|
| **design-api** | ✅ (RDS SSOT) | **쉬움** — replica N + ALB | 이미 FastAPI multi-worker |
| **nginx + SPA static** | ✅ | EC2마다 동일 이미지 | 배포 동기화 필요 |
| **open-design-daemon** | ❌ | **어려움** — scratch·SQLite·SSE | 39 시리즈 핵심 |
| **od-data EBS** | ❌ (노드 로컬) | 노드당 1볼륨 | S3가 파일 SSOT |
| **Main BE / RDS registry** | ✅ | 플랫폼 팀 | Design과 별도 |

**“서버 이중화”** 는 보통 **EC2 2대 이상 + ALB** 를 뜻한다.  
**daemon container만 2 replica (같은 EBS 공유)** 는 현재 아키텍처에서 **하지 않는다** ([39_3](./39_3_scratch_SQLite_SSE_제약.md)).

---

## 3. 상용화에 이중화가 “필수”인가?

### 3.1 오픈 1호기 (P0~P1) — **단일 노드 권장**

[38 §12.1~12.2](./38_Design_동시성_용량_확장_가이드.md) 와 동일:

| 목표 | 단일 `t3.2xlarge` + daemon 1 |
|------|------------------------------|
| 동시 브라우징 50+ | ✅ design-api worker 5 |
| workspace당 AI 8 parallel | ✅ 코드 cap |
| 전역 AI “쾌적” 구간 | **동시 stream ~5~10** (soft cap) |
| export 6 parallel + queue | ✅ ENV |
| EC2 장애 시 RTO | **수동 failover** (Litestream·S3 복구) |

**이중화 없이도 상용 오픈 가능** — 단, **단일 장애점(SPOF)** 은 남는다.

### 3.2 이중화를 검토해야 하는 트리거

| 트리거 | 권장 1차 조치 | 문서 |
|--------|---------------|------|
| EC2 재부팅·OOM이 **월 1회+** | vertical scale·export cache·[34](./34_Export_성능_개선_로드맵.md) | 38 P2 |
| **99.9% HA** SLA (장애 RTO < 15분) | **Active-Passive** 또는 ALB 2 target | [39_1](./39_1_이중화_Phase_로드맵.md) Phase 2 |
| 동시 AI **10~20+** stream 지속 | EC2 2대 **Active-Active + userId hash** | [39_2](./39_2_ALB_nginx_라우팅_설계.md) · [39_6](./39_6_라우팅_아키텍처_CTO_의사결정.md) |
| export만 CPU 80%+ | **export worker 분리** (daemon 전체 이중화 전) | [39_1](./39_1_이중화_Phase_로드맵.md) Phase 3 |
| multi-node 후에도 scratch 502 | **Track B** | [39_1](./39_1_이중화_Phase_로드맵.md) Phase 5 |

### 3.3 의사결정 트리

```text
상용 오픈 전?
  └─ YES → single EC2 t3.2xlarge (38 P0) — 이중화 미룸
  └─ NO (이미 운영 중)
       ├─ 목표가 HA(장애 복구)만?
       │     └─ YES → Phase 2 Active-Passive (용량 2배 아님)
       ├─ 목표가 동시 AI/export 용량 2배?
       │     └─ YES → Phase 4 Active-Active + sticky (39_2)
       ├─ export만 병목?
       │     └─ YES → Phase 3 export worker (34)
       └─ sticky 후에도 scratch/SQLite 이슈?
             └─ YES → Phase 5 Track B (02, 04)
```

---

## 4. Phase 로드맵 요약

상세: **[39_1 이중화 Phase 로드맵](./39_1_이중화_Phase_로드맵.md)**

| Phase | 이름 | 목표 | 이중화 형태 | scratch 해결도 |
|-------|------|------|-------------|----------------|
| **0** | 오픈 1호기 | 용량·게이트 | **단일 EC2** | N/A (단일 scratch) |
| **1** | Vertical scale | CPU/RAM ↑ | 단일 EC2 스펙 업 | N/A |
| **2** | **HA (Passive)** | 장애 시 전환 | **Active-Passive** 2 EC2 | ✅ (writer 1) |
| **3** | Export isolate | PDF spike 격리 | daemon 1 + export worker | 부분 |
| **4** | **용량 AA** | 동시 사용자 ↑ | **2+ EC2 Active-Active + userId hash** | **부분** (userId) |
| **5** | Track B | multi-daemon 정석 | Postgres DaemonDb + project affinity | ✅ 근본 |

**권장 순서:** `0 → (지표) → 2 또는 3 → 4 → 5`  
**비권장:** `0 → 4` 를 **sticky·runbook 없이** — scratch split-brain.

---

## 5. userId hash로 scratch를 해결할 수 있나?

**짧은 답:** **한 사용자·한 브라우저 세션** 범위에서는 **대부분 OK** (embed 1인 1프로젝트 MVP).  
**전체 multi-daemon 정석은 아님** — SQLite per node, 동일 project 다인 편집, 노드 장애 시 재할당.

| 해결 | 미해결 |
|------|--------|
| BYOK SSE + 후속 PUT/GET 같은 scratch | 노드마다 **별도 app.sqlite** |
| export·tool write 같은 daemon 로컬 | **동일 project · 다른 user** → 다른 노드 |
| 단일 ws 8 cap × ws 수 (코드) | ALB cookie ≠ userId (다기기) |

상세: **[39_3 scratch·SQLite·SSE 제약](./39_3_scratch_SQLite_SSE_제약.md)** · **[39_2 라우팅 설계](./39_2_ALB_nginx_라우팅_설계.md)** · **[39_7 scratch·DaemonDb FAQ](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md)** (Postgres B5 vs scratch 근본 해결 구분)

---

## 6. 동시 AI “몇 명”과 이중화의 관계

[38 §5](./38_Design_동시성_용량_확장_가이드.md) SSOT:

| 구분 | single `t3.2xlarge` | 2 EC2 Active-Active (이상적) |
|------|---------------------|------------------------------|
| 코드 hard cap | ws당 **8** stream × ws 수 (전역 4096) | 동일 (daemon **노드당** cap) |
| soft cap (쾌적) | **~5~10** stream | **~10~20** (노드 균등 분산 시) |
| HA | ❌ SPOF | ✅ (Phase 2/4) |

**이중화 = 동시 AI 인원 2배** 가 **자동으로** 되지는 않는다. sticky·노드 스펙·export 분리와 함께 봐야 한다.

---

## 7. 39 시리즈 문서 색인

| # | 문서 | 내용 |
|---|------|------|
| **39_0** | **본 문서** | 개요·의사결정·색인 |
| [39_1](./39_1_이중화_Phase_로드맵.md) | Phase 0~5 상세·일정·선행조건 |
| [39_2](./39_2_ALB_nginx_라우팅_설계.md) | ALB·nginx·userId sticky·SSE timeout |
| [39_3](./39_3_scratch_SQLite_SSE_제약.md) | scratch split-brain·sticky 한계·Track B |
| [39_4](./39_4_배포_Terraform_운영_Runbook.md) | 2 EC2 기동·failover·drain·Litestream |
| [39_5](./39_5_검증_체크리스트_FAQ.md) | 부하·장애 시나리오·FAQ |
| [39_6](./39_6_라우팅_아키텍처_CTO_의사결정.md) | **CTO 보고** — userId hash·이중화 의미·중앙 nginx 비교·장기 방향 |
| [39_7](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md) | **scratch vs DaemonDb vs multi-node** — 저장층 4분면·B5만으로는 부족·OD scratch 제거 불가 |

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-08 | [39_7 scratch·DaemonDb FAQ](./39_7_scratch_DaemonDb_저장층_심층_FAQ.md) — 저장층 4분면·Track B vs scratch 제거 |
| 2026-07-07 | 39 시리즈 초안 — 이중화 로드맵 SSOT (38 §8·§12.4 확장) |

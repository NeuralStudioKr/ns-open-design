# Teamver Design — scratch·SQLite·SSE 제약 (multi-node)

**목적:** 이중화 시 **sticky / userId routing** 이 **해결하는 것·못 하는 것** 을 SSOT로 고정.  
**관련:** [20 Hybrid 저장소](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) · [38 §8.2](./38_Design_동시성_용량_확장_가이드.md) · [29 BYOK sync-up](./29_BYOK_api_mode_vs_runs_아키텍처.md)

---

## 1. 한 줄 결론

> **프로젝트 파일 SSOT = S3**, **run 중 작업 복사본 = daemon 로컬 scratch**.  
> multi-node에서 **같은 projectId** 가 **다른 scratch** 에 동시 materialize 되면 **502·유실·경쟁**.  
> **userId / ALB sticky** 는 “**한 사용자의 한 세션**” 은 대부분 같은 scratch로 묶어 **완화**.  
> **SQLite·다인 동일 project·노드 장애** 는 **Track B** 까지 **완전 해결 아님**.

---

## 2. 데이터 3층 (multi-node 관점)

| 층 | 저장 | multi-node |
|----|------|------------|
| **Registry·권한** | RDS `design_projects` | ✅ 공유 — 문제 없음 |
| **프로젝트 파일 SSOT** | S3 tenant prefix | ✅ 공유 |
| **실행 중 scratch** | `od-data/scratch/projects/<id>/` | ❌ **노드 로컬** |
| **daemon 메타** | `od-data/app.sqlite` | ❌ **노드별 파일** |
| **Litestream** | S3 `litestream/app.sqlite` | 백업·**단일 writer** 복제 |

코드: `apps/daemon/src/storage/project-storage-layout.ts` — S3 모드 `projectsDir = scratchDir/projects`.

---

## 3. scratch split-brain 시나리오

### 3.1 Round-robin (sticky 없음) — **금지**

```text
T0  User → EC2-A: POST /api/proxy/.../stream  (materialize project X on A)
T1  User → EC2-B: PUT .../messages            (scratch on B empty → sync-down race)
T2  tool write on A vs read on B → 502 / stale file / lost edit
```

### 3.2 Sticky / userId hash — **완화**

```text
User U always → EC2-A
  stream → tool → PUT → export 모두 A.scratch
```

**깨지는 경우:**

| 경우 | 결과 |
|------|------|
| ALB cookie 다른 브라우저 | B로 → sync-down (느리나 **복구 가능**) |
| EC2-A fail → U on B | scratch cold → **S3 sync-down** |
| U1→A, U2→B **same project** | **두 scratch** — [§4](#4-동일-project-다인-편집) |

---

## 4. 동일 project · 다인 편집

workspace Plus **6 seat** — **서로 다른 project** 동시 생성은 **정상**.  
**같은 `projectId`** 에 두 사용자가 동시 AI:

- `project-materialization-runtime.ts` — concurrent run 시 sync-down 일부 **skip**
- **새 AI 시작은 막지 않음** — 502/지연 가능
- userId sticky: **U1→A, U2→B** → **sticky로도 미해결**

**제품·ops:** 동일 deck **동시 공편집 비권장** ([38 §5.5](./38_Design_동시성_용량_확장_가이드.md)).  
**근본:** Phase 5 **projectId → daemon** affinity.

---

## 5. SQLite (app.sqlite)

### 5.1 단일 노드

- 채팅·로컬 OD 메타 — **한 파일** · **한 writer** (daemon 프로세스)
- Litestream → S3 복제 ([20 §6](./20_Design_Hybrid_저장소_로컬_S3_가이드.md))

### 5.2 multi-node (Phase 4)

| 패턴 | SQLite |
|------|--------|
| EC2-A + EC2-B **각각 daemon** | **파일 2개** — 메타 **분열** |
| 공유 EBS 1개 + daemon 2 | **동시 write** → corruption **위험** |

**sticky 효과:** user U의 요청만 A.sqlite에 쌓임 — **U 관점** 일관.  
**한계:** U가 노드 이동 → **이전 노드의 sqlite 메타** 와 단절; embed BYOK는 **RDS+S3** 가 SSOT라 **치명도 낮음** — run row 없음 ([29](./29_BYOK_api_mode_vs_runs_아키텍처.md)).

**Track B:** `OD_DAEMON_DB=postgres` (B5) — **multi-writer SSOT**.

---

## 6. SSE·BYOK proxy

| 요구 | sticky 필요 |
|------|-------------|
| `POST /api/proxy/…/stream` 장기 연결 | 시작한 **같은 daemon** |
| stream 중 `GET /api/files` | 같은 scratch |
| stream 종료 sync-up | **같은 daemon** hook ([29 Fix B/C](./29_BYOK_api_mode_vs_runs_아키텍처.md)) |

**노드 drain:** SSE 끊김 → 사용자 **재시도** → 새 노드 → sync-down — **수 초~수십 초** 지연.

---

## 7. sticky로 해결 / 미해결 매트릭스

| 문제 | userId/ALB sticky | Phase 2 Passive | Phase 5 Track B |
|------|-------------------|-----------------|-----------------|
| 1 user 1 project AI | ✅ | ✅ | ✅ |
| SSE + file API 일치 | ✅ | ✅ | ✅ |
| export scratch hit | ✅ | ✅ | ✅ |
| 동일 project 2 user | ❌ | ✅ (1 writer) | ✅ project affinity |
| SQLite global SSOT | △ (분열) | ✅ | ✅ Postgres |
| 노드 fail RTO | △ (재materialize) | ✅ failover | ✅ |
| 용량 2× | ✅ (AA) | ❌ | ✅ |

---

## 8. S3 sync-down/up — multi-node 안전망

scratch는 **캐시** — SSOT는 S3 ([16](./16_S3_데이터_저장_시점_SSOT.md)).

| 이벤트 | 동작 |
|--------|------|
| 새 노드 첫 접근 | lazy **sync-down** |
| proxy/stream 종료 | **sync-up** → S3 |
| idle evict | scratch 삭제 — 다음 접근 sync-down |

**비용:** 노드 이동·cold start 시 **S3 latency** ↑ — sticky가 **줄여 주는 것**.

**위험:** sync-up 전 evict·동시 sync-up — materialization lock ([20](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)).

---

## 9. 코드·ENV 참고

| 항목 | 위치 |
|------|------|
| materialization lock | `apps/daemon/src/storage/lazy-project-materialization.ts` |
| concurrent run guard | `project-materialization-runtime.ts` |
| BYOK sync-up hook | `byok-proxy-materialization.ts` |
| workspace proxy cap | `OD_BYOK_PROXY_MAX_PER_WORKSPACE` (default 8) |
| global proxy registry | `MAX_ACTIVE_PROXY_STREAMS = 4096` |

---

## 10. FAQ

### Q1. sticky만으로 Phase 5 없이 상용 AA 가능?

**조건부 YES** — embed **1인 1프로젝트**, 동일 deck **공편집 없음**, 노드 fail 시 **S3 복구** 허용.  
**NO** — real-time collaboration·strict HA RPO·SQLite 메타 통합.

### Q2. workspaceId hash가 userId보다 나은가?

**seat 단위**로 묶임 — 여전히 **project 충돌** 가능. userId와 **유사한 차선**.

### Q3. scratch를 EFS/NFS로 공유?

**비권장** — file lock·latency·SQLite와 별개 scratch I/O. Track B **S3-first** 가 낫다.

---

## 11. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-07 | scratch·SQLite·SSE sticky 한계 SSOT |

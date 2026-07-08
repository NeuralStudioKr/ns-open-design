# Teamver Design — scratch · DaemonDb · 저장층 심층 FAQ (multi-node)

**목적:** 이중화·Track B 논의에서 반복되는 질문 — **“scratch가 꼭 필요한가?”**, **“Postgres DaemonDb면 scratch 이슈가 사라지는가?”**, **“OD를 scratch 없이 고칠 수 없나?”** — 를 **한 문서(SSOT)** 로 고정한다.  
**독자:** CTO·엔지니어링·운영 — [39_6 CTO](./39_6_라우팅_아키텍처_CTO_의사결정.md) · [39_3 제약](./39_3_scratch_SQLite_SSE_제약.md) · [20 Hybrid](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) 의 **보조·심화** 문서.

**관련:** [09 저장소 게이트 §7](./09_Design_저장소_격리_출시게이트.md#7-저장소-패턴-선택-fuse-vs-sdk-vs-hybrid) · [04 Track B5](./04_구현_우선순위.md#track-b--wrapper--scale-출시-후) · [39_1 Phase 5](./39_1_이중화_Phase_로드맵.md#7-phase-5--track-b-multi-daemon-정석)

**코드 SSOT:** `apps/daemon/src/db.ts` · `apps/daemon/src/storage/materializing-project-storage.ts` · `apps/daemon/src/storage/project-storage-layout.ts` · `deploy/teamver/docker-compose.yml`

---

## 1. 한 줄 결론

> **“프로젝트” 데이터는 한 곳에 있지 않다.**  
> **RDS(registry)** + **DaemonDb(채팅·메타)** + **S3(파일 SSOT)** + **scratch(작업 중 로컬 파일)** 네 층이 **역할이 다르다**.  
> **Postgres DaemonDb(B5)** 는 **SQLite 노드 분열**을 없앤다 — **scratch split-brain은 Track B 전체(project affinity 포함)** 가 되어야 **근본 해결**된다.  
> **OD Daemon을 scratch 없이** 돌리려면 **Open Design upstream 전면 재설계** 수준이며, Teamver fork만으로는 **비현실적**이다.

---

## 2. 저장층 4분면 (혼동 방지)

multi-node·CTO 검토에서 **“DB 분리”** 와 **“scratch”** 를 같은 문제로 보기 쉽다. 아래 표가 **SSOT**이다.

```text
[브라우저 / design-api BFF]
        │
        ├─ RDS (design-api schema)
        │     design_projects — 제목, 권한, s3_prefix (registry, 파일 본문 없음)
        │
        ├─ DaemonDb (app.sqlite → Phase 5: Postgres)
        │     projects, conversations, messages, tabs, runs 메타 …
        │     ※ 슬라이드 HTML·이미지 **본문은 없음**
        │
        └─ open-design-daemon
              │
              ├─ scratch (로컬 FS, SSOT 아님)
              │     od-data/scratch/projects/<id>/
              │     agent CWD · shell · export · tool write
              │
              └─ S3 (tenant prefix, 파일 SSOT)
                    design/ws_…/user_…/proj_…/
                    sync-down ↑  sync-up ↓  (MaterializingProjectStorage)
```

### 2.1 무엇이 어디에 있는가

| 데이터 | SSOT | 작업 중 위치 | multi-node 이슈 |
|--------|------|--------------|-----------------|
| 프로젝트 목록·권한·`s3_prefix` | **RDS** | daemon 무관 | ✅ 공유 |
| 채팅·대화·탭·OD run **메타** | **DaemonDb** (현재 sqlite) | EC2 로컬 파일 또는 Postgres | ❌ 노드마다 sqlite **분열** (Phase 4) |
| 슬라이드 HTML·asset·export 입력 | **S3** | **scratch** (임시) | ❌ 노드마다 scratch **분열** |
| Publish / Drive 산출물 | **Main BE Drive** | 별도 버킷 | ✅ |

상세: [20 §2](./20_Design_Hybrid_저장소_로컬_S3_가이드.md#2-무엇이-어디에-저장되나) · [16 S3 저장 시점](./16_S3_데이터_저장_시점_SSOT.md)

### 2.2 코드가 말하는 경계

`apps/daemon/src/db.ts`:

```text
SQLite … projects, conversations, messages, tabs …
The on-disk project folder under .od/projects/<id>/
  is still the single owner of the user's actual files
  (HTML artifacts, sketches, uploads)
```

**DB = 메타·채팅**, **디스크(scratch) = agent가 만지는 파일 본문**.

---

## 3. “작업 중” 프로젝트 — scratch가 꼭 필요한가?

### 3.1 짧은 답

| 상태 | scratch 필요? |
|------|---------------|
| **idle** (아무도 편집 안 함) | ❌ — S3만 SSOT, scratch evict 가능 |
| **AI run / export / preview / file API** | ✅ — **로컬 working copy** 필수 (S3 모드에서는 `scratch/projects/<id>/`) |
| **로컬 dev** (`OD_PROJECT_STORAGE=local`) | △ — “scratch” **레이어**는 없지만 **`OD_DATA_DIR/projects/` 로컬 디스크**는 동일 역할 |

staging/prod 한 줄 ([20 §0](./20_Design_Hybrid_저장소_로컬_S3_가이드.md#0-한-줄-결론)):

> 로컬은 **실행용 scratch·SQLite**만 쓰고, 프로젝트 파일 SSOT는 **S3**, registry는 **RDS**.

### 3.2 run 단위 lifecycle (Hybrid)

[09 §8.1](./09_Design_저장소_격리_출시게이트.md#81-run-단위-동작):

```text
1. run/chat/export 시작 → S3 → scratch/{projectId}/  (sync-down)
2. agent cwd = scratch/{projectId}/
3. run 종료 → dirty 파일만 S3 PUT (sync-up)
4. (기본) scratch evict → 디스크 비움, SSOT는 S3만
```

**scratch는 “영구 저장”이 아니라 “실행용 캐시”**다. 다만 **실행 중에는 필수**다.

### 3.3 DB 값만으로 대체할 수 있는가?

| 범주 | DB만으로? |
|------|-----------|
| 채팅·탭·run row | ✅ 이미 DaemonDb |
| registry row | ✅ RDS |
| 슬라이드 HTML·png·dist/·agent가 쓴 파일 | ❌ **파일시스템 가정** — DB blob로 옮기려면 OD 코어 재설계 |

---

## 4. Postgres DaemonDb(B5) — scratch 이슈가 사라지는가?

### 4.1 CTO 결정 맥락 (2026-07)

**방향:** 시간이 걸리더라도 **daemon DB 분리(Postgres DaemonDb, Track B5)** 로 진행.

**이 결정이 의미하는 것:**

| 해결 | 미해결 (B5 단독) |
|------|------------------|
| 노드별 `app.sqlite` **분열** | 노드별 **scratch** 분열 |
| multi-node에서 **채팅·run 메타** 전역 SSOT | **동일 project · 다른 user** → 다른 scratch |
| Litestream per-node prefix **운영 부담** 감소 | SSE+PUT **같은 scratch** affinity (project 단위) |
| 노드 failover 시 **메타** 연속성 ↑ | agent **CWD** — 여전히 로컬 FS |

[39_3 §5.2](./39_3_scratch_SQLite_SSE_제약.md#52-multi-node-phase-4): 두 EC2가 각각 daemon → **파일 2개** — 메타 분열.  
**Track B:** `OD_DAEMON_DB=postgres` — **multi-writer SSOT** ([39_3 §5.2](./39_3_scratch_SQLite_SSE_제약.md)).

### 4.2 “사라진다”고 말할 수 있는 조건 — Phase 5 Track B **전체**

[39_1 §7](./39_1_이중화_Phase_로드맵.md#7-phase-5--track-b-multi-daemon-정석) 구현 순서:

```text
1. design-api wrapper: job/run API + 슬롯 + circuit breaker (B1, B4)
2. export async job + worker (Phase 3 합류 가능)
3. OD DaemonDb → Postgres (B5)
4. gateway: projectId → daemon 라우팅 (registry)
5. (선택) S3 export cache multi-instance
```

| | Phase 4 (userId hash) | Phase 5 Track B |
|--|----------------------|-----------------|
| affinity | userId | **projectId** |
| daemon DB | SQLite × N | **Postgres 1** |
| scratch | 노드 로컬 | **S3-first + project affinity** (로컬 working copy **유지**) |
| 동일 project 2 user | ❌ | ✅ (같은 daemon → 같은 scratch) |

**B5만 착수해도 SQLite split-brain은 해소**되지만, **scratch split-brain은 projectId affinity(4번)까지** 가야 **실질적으로** 사라진다.

### 4.3 해결 / 미해결 매트릭스 (통합)

| 문제 | userId hash (Phase 4) | Postgres만 (B5) | Track B 전체 (Phase 5) |
|------|----------------------|-----------------|------------------------|
| 1 user 1 project AI | ✅ | △ (메타만) | ✅ |
| SSE + file API 일치 | ✅ | △ | ✅ |
| 동일 project 2 user | ❌ | ❌ | ✅ |
| SQLite global SSOT | △ 분열 | ✅ | ✅ |
| scratch “wrong node” | △ user 단위 | ❌ | ✅ project 단위 |
| 노드 fail RTO | △ sync-down | △ | ✅ |
| **scratch 디렉터리 자체 제거** | ❌ | ❌ | ❌ (working copy 유지) |

---

## 5. OD Daemon을 scratch **없이** 수정할 수 있는가?

### 5.1 짧은 답

**이름만 없애는 것 ≠ working copy 제거.**  
**로컬 파일 작업공간 없이** 현재 OD agent·export·plugin 스택을 돌리도록 **Teamver만 수정**하는 것은 **사실상 불가**에 가깝다.

### 5.2 scratch가 OD 내부에서 하는 일 (코드)

S3 모드에서 `PROJECTS_DIR` = `scratch/projects` ([`project-storage-layout.ts`](../../apps/daemon/src/storage/project-storage-layout.ts)).

`MaterializingProjectStorage` ([`materializing-project-storage.ts`](../../apps/daemon/src/storage/materializing-project-storage.ts)):

```text
Hybrid storage: agent run cwd reads/writes scratch; S3 is SSOT.
readFile / writeFile / listFiles → 전부 scratch (LocalProjectStorage)
sync-down / sync-up → S3 ↔ scratch
```

daemon `server.ts`는 **수백 곳**에서 `PROJECTS_DIR`·`resolveProjectDir`·로컬 path를 **직접** 사용:

- agent **CWD** · shell spawn
- file event 구독 · preview · export · plugin preview
- materialization middleware

**ProjectStorage 추상화 밖**의 로컬 FS 의존이 크다.

### 5.3 “대안”별 판정 ([09 §7](./09_Design_저장소_격리_출시게이트.md#7-저장소-패턴-선택-fuse-vs-sdk-vs-hybrid))

| 패턴 | scratch | Agent run | Teamver 판단 |
|------|---------|-----------|--------------|
| **A. S3 FUSE mount** | FUSE path | 동작해 보임 | ❌ Prod 금지 (lock·corruption) |
| **B. pure S3 (SDK only)** | 없음 | **불가** | ❌ |
| **C. Hybrid (채택)** | sync + 로컬 | ✅ | ✅ |
| **D. EBS volume SSOT** | 영구 projects/ | ✅ | ❌ prod blocker |
| **E. 파일 전부 DB blob** | 없음 | 재설계 필요 | ❌ upstream 분기 |
| **F. EFS/NFS 공유 scratch** | 공유 FS | ✅ | △ 비권장 ([39_3 Q3](./39_3_scratch_SQLite_SSE_제약.md#q3-scratch를-efsnfs로-공유)) |

`S3ProjectStorage` 클래스는 존재하지만 **remote SSOT + sync** 용이며, **agent shell의 CWD**로 직접 쓰이지 않는다.

### 5.4 scratch 없이 가려면 (이론상)

1. agent·export·preview 전 경로를 `ProjectStorage` API로 통일  
2. shell·npm·파일 도구 제거 또는 S3 SDK 래퍼로 전환  
3. sync-down/up 제거, 모든 write = S3 PUT  

→ **Open Design upstream 아키텍처 변경** (분기~년), Teamver fork 유지비 매우 큼.  
**Track B 로드맵에 포함되지 않음** — Track B는 **Hybrid 유지 + Postgres + project affinity**.

---

## 6. multi-node에서 “문제”의 정확한 정의

### 6.1 scratch가 나쁜 것이 아님

문제는 **scratch 존재**가 아니라 **같은 `projectId`가 서로 다른 노드 scratch에 동시 materialize** 되는 것 ([39_3 §3~4](./39_3_scratch_SQLite_SSE_제약.md)).

```text
U1 (userId hash → EC2-A) ──► scratch-A/projects/X/
U2 (userId hash → EC2-B) ──► scratch-B/projects/X/   ← split-brain
```

### 6.2 Phase 4 브릿지 (현재 SSOT)

- **userId consistent hash** — 1 user 세션 → 1 daemon → 1 scratch ([39_2 §4](./39_2_ALB_nginx_라우팅_설계.md))
- **ALB round-robin** — ingress EC2만 분산; affinity는 nginx
- **Litestream per-node prefix** — sqlite write 충돌 방지 (메타 백업)

embed **1인 1프로젝트** MVP에서는 **대부분 충분** ([39_3 Q1](./39_3_scratch_SQLite_SSE_제약.md#q1-sticky만으로-phase-5-없이-상용-aa-가능)).

### 6.3 Phase 5 목표 (CTO Track B)

```text
projectId → (registry lookup) → 고정 daemon EC2
  → 해당 노드 scratch 1개만 active writer
  → DaemonDb(Postgres) = 전역 run/채팅 SSOT
  → S3 = 파일 SSOT (run 후 sync-up)
```

**nginx 골격**(ALB + EC2 colocated + hash upstream + peer :7456)은 **유지** — hash key만 **userId → projectId** 로 바꿀 수 있음 ([39_6 §5.2](./39_6_라우팅_아키텍처_CTO_의사결정.md)).

---

## 7. 의사결정 가이드 (PM · CTO)

```text
목표가 “sqlite 노드 분열·운영” 해소?
  └─ YES → Track B5 Postgres 착수 (CTO 2026-07 방향)
       └─ scratch 502도 근본 해소?
            └─ YES → B1/B4 + projectId routing(39_1 §7) 병행 계획

목표가 “scratch 디렉터리 없애기”?
  └─ OD upstream 재설계 필요 → Teamver 로드맵 **밖**
       └─ 대안: Hybrid 유지 + affinity (현실적)

Phase 4(2 EC2) 지금 당장?
  └─ YES → userId hash 브릿지 (이미 코드 반영)
       └─ Track B 착수와 **병행 가능** (nginx·EC2 골격 동일)
```

| 선택 | scratch | SQLite | multi-node scratch 502 |
|------|---------|--------|------------------------|
| Phase 0 단일 EC2 | 1개 | 1개 | N/A |
| Phase 4 userId hash | N개 (노드별) | N개 | **완화** (user 단위) |
| B5 Postgres만 | N개 | **1 (Postgres)** | **미해결** (project 다인) |
| **Track B 전체** | N개 (**project당 1 writer**) | Postgres | **근본 해결** |

---

## 8. FAQ

### Q1. idle 프로젝트도 scratch에 항상 있나?

**아니다.** run 종료 후 `OD_SCRATCH_EVICT_AFTER_RUN` 등으로 evict — SSOT는 S3 ([20 §sync-up/evict](./20_Design_Hybrid_저장소_로컬_S3_가이드.md)). 다음 접근 시 sync-down.

### Q2. Postgres 전환 후 Litestream은?

DaemonDb가 Postgres면 **app.sqlite Litestream은 단계적 폐기** 대상. RDS/Postgres HA·백업 runbook으로 대체 ([39_4](./39_4_배포_Terraform_운영_Runbook.md)).

### Q3. projectId hash만 하면 scratch 이슈 끝?

**아니다.** 같은 scratch를 쓰려면 **같은 daemon**으로 보내야 하고, **sqlite/run 메타 전역 SSOT**는 **Postgres(B5)** 가 필요 ([39_6 §5.3](./39_6_라우팅_아키텍처_CTO_의사결정.md)).

### Q4. BYOK embed는 run row가 없다던데?

[29 BYOK](./29_BYOK_api_mode_vs_runs_아키텍처.md) — embed는 RDS+S3가 SSOT라 **sqlite 분열 치명도는 낮음**. 다만 **scratch·SSE·sync-up** 경로는 동일 — multi-node affinity는 여전히 필요.

### Q5. real-time 공편집은 Track B 후 자동?

**아니다.** 동시 run guard·materialization lock 이슈는 남을 수 있음 — **동일 deck 동시 AI 비권장** ([38 §5.5](./38_Design_동시성_용량_확장_가이드.md), [39_3 §4](./39_3_scratch_SQLite_SSE_제약.md)).

### Q6. Phase 4를 Track B 전에 꼭 해야 하나?

**아니다.** CTO가 Track B 우선이면 Phase 4(2 EC2) 리허설 **일부 연기** 가능. 단 **용량 2×·HA** 목표가 있으면 Phase 4 브릿지가 **여전히 유용** — B5와 **골격 충돌 없음**.

---

## 9. 문서·코드 색인

| 주제 | 문서 | 코드 |
|------|------|------|
| Hybrid·evict | [20](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) | `materializing-project-storage.ts` |
| 패턴 A~D | [09 §7](./09_Design_저장소_격리_출시게이트.md#7-저장소-패턴-선택-fuse-vs-sdk-vs-hybrid) | `project-storage.ts` |
| multi-node 제약 | [39_3](./39_3_scratch_SQLite_SSE_제약.md) | `lazy-project-materialization.ts` |
| Phase 5 순서 | [39_1 §7](./39_1_이중화_Phase_로드맵.md) · [04 B1~B5](./04_구현_우선순위.md) | `storage/daemon-db.ts` |
| 라우팅·CTO | [39_6](./39_6_라우팅_아키텍처_CTO_의사결정.md) | `teamver-design-od-daemon-upstream.inc.conf` |
| ENV | [20 §9](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) | `OD_PROJECT_STORAGE`, `OD_SCRATCH_DIR`, `OD_DAEMON_DB` |

---

## 10. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-08 | 초안 — scratch vs DaemonDb vs multi-node FAQ, CTO Track B 우선 맥락, OD scratch 제거 불가 SSOT |

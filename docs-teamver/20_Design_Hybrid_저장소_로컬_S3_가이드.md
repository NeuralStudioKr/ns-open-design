# Design — Hybrid 저장소 (로컬 scratch + S3) 가이드

**목적:** “로컬 디스크를 쓰는데 S3 모드인가?” · “용량은 어떻게 관리하나?” · **Litestream이 뭔가?** 를 **한 문서**에서 설명한다.  
**출시 게이트·Phase:** [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) · **sync-up 시점:** [16 S3 저장 시점](./16_S3_데이터_저장_시점_SSOT.md) · **S3 prefix 트리:** [19 S3 버킷 prefix 역할](./19_S3_버킷_prefix_역할.md)

---

## 용어 (간단 설명)

| 용어 | 설명 |
|------|------|
| **SSOT** (Single Source of Truth) | “진짜 원본”이 있는 저장소. 복구·권한·용량 계획의 기준. |
| **Hybrid SSOT** | 영속 데이터는 **S3·RDS**, 실행 중에만 **로컬 scratch** 를 쓰는 패턴 ([09 §3](./09_Design_저장소_격리_출시게이트.md)). |
| **volume-only** | 프로젝트 파일까지 EC2 EBS에만 두는 구조 — **Prod blocker** (내구성·격리 부족). |
| **`OD_DATA_DIR`** | EC2 od-data EBS 마운트 (`/opt/teamver-design/od-data`). SQLite·scratch 루트. |
| **scratch** | S3 모드에서 daemon이 **임시로** 프로젝트 파일을 읽고 쓰는 로컬 디렉터리 (`OD_SCRATCH_DIR/projects/`). **SSOT 아님.** |
| **materialization** | S3 ↔ scratch 간 파일 복사. **sync-down**(원격→로컬), **sync-up**(로컬→원격). |
| **sync-down** | run/API 읽기 전 S3 tenant prefix → scratch 로 파일 내려받기. |
| **sync-up** | scratch 에서 **변경된 파일만** S3 tenant prefix 로 PUT. |
| **evict** | sync-up 후 scratch 에서 해당 `projectId` 디렉터리 **삭제** (로컬 캐시 비우기). |
| **tenant prefix** | `design/ws_<ws>/user_<user>/proj_<od>/` — workspace·user·프로젝트 격리 단위 (RDS `s3_prefix`). |
| **`app.sqlite`** | OD daemon 로컬 SQLite — 채팅·로컬 OD 메타. EBS 위에 파일로 존재. |
| **Litestream** | SQLite 파일을 **S3에 실시간 복제**하는 오픈소스 도구. EC2 장애 시 `app.sqlite` 복구용 ([§6](#6-litestream-상세)). |
| **registry** | design-api RDS `design_projects` — 프로젝트 목록·권한·`s3_prefix` (파일 본문은 없음). |
| **Publish / Drive** | 완성 산출물을 **Main BE Drive**(별도 S3)에 올리는 경로 — Design project-data 버킷과 무관. |

---

## 0. 한 줄 결론

> **staging/prod는 로컬을 “안 쓰는” 게 아니라, 로컬은 실행용 scratch·SQLite만 쓰고, 프로젝트 파일 SSOT는 S3, registry는 RDS다.**  
> run이 끝나면 **변경분만 sync-up** 하고, 기본 설정에서는 **scratch를 evict** 해 EC2 디스크가 무한히 쌓이지 않게 한다.

---

## 1. 왜 로컬 디스크를 쓰나?

Open Design agent/도구는 **현재 작업 디렉터리(CWD)** 에서 파일을 읽고 쓴다 (shell, export, HTML 편집 등).  
S3를 FUSE로 마운트하거나 매 바이트마다 PUT 하는 **pure S3** 는 SQLite·lock·latency 문제로 Prod SSOT로 쓰지 않는다 ([09 §7 옵션 C vs D](./09_Design_저장소_격리_출시게이트.md)).

채택한 패턴 (**Hybrid**, 09 §3):

```text
영속(장기)  → S3 (프로젝트 파일) + RDS (registry) + Litestream (app.sqlite 복제)
실행(단기)  → EC2 scratch (run/API 동안만)
```

로컬 개발 (`OD_PROJECT_STORAGE=local`) 은 scratch·S3 없이 `OD_DATA_DIR/projects/` 가 곧 SSOT — **EC2 staging/prod 와 다름**.

---

## 2. 무엇이 어디에 저장되나

### 2.1 저장소 맵

| 데이터 | SSOT | 로컬 (EBS) | S3 `teamver-design-*-data` | 비고 |
|--------|------|------------|----------------------------|------|
| 프로젝트 HTML·asset·export 파일 | **S3** `design/…/proj_…/` | scratch **임시** | ✅ tenant prefix | sync-up 후 evict |
| 프로젝트 목록·제목·`s3_prefix` | **RDS** | ❌ | ❌ | design-api |
| usage·output 메타 | **RDS** | ❌ | ❌ | |
| 채팅·OD 로컬 메타 | EBS `app.sqlite` | ✅ 항상 | ✅ `litestream/app.sqlite` | hosted Litestream 필수 |
| Docker·배포·nginx | root EBS | ✅ | ❌ | |
| Drive 발행 파일 | **Main BE Drive** | ❌ | ❌ (다른 버킷) | Publish |

### 2.2 로컬 경로 (S3 모드)

| 경로 | 역할 | 용량 성격 |
|------|------|-----------|
| `/opt/teamver-design/od-data/app.sqlite` | daemon SQLite | **천천히 증가** (채팅·메타) |
| `/opt/teamver-design/od-data/scratch/projects/<id>/` | materialized 프로젝트 | **임시** — evict 대상 |
| root `/` | OS, Docker 이미지 | 배포·이미지 |

코드: `apps/daemon/src/storage/project-storage-layout.ts` — S3 모드 시 `projectsDir = scratchDir/projects`.

### 2.3 “로컬 file storage를 쓰는 것”과의 차이

| | volume-only (구 As-Is) | Hybrid S3 모드 (목표) |
|--|------------------------|------------------------|
| `projects/` on EBS | **영구 SSOT** | **scratch만** — evict 가능 |
| EC2 교체 | 데이터 유실 위험 | S3에서 sync-down 으로 복구 |
| 디스크 증가 | 모든 사용자·프로젝트 누적 | **활성 run·API 세션** 규모에 가깝게 유지 |
| Prod 오픈 | ❌ blocker | G1~G6 충족 시 |

`OD_PROJECT_STORAGE=s3` + sync-up + evict 가 **켜져 있어야** Hybrid가 성립한다. 하나라도 빠지면 로컬에 데이터가 남거나 S3에 안 올라갈 수 있다.

---

## 3. Hybrid 동작 (MaterializingProjectStorage)

### 3.1 전체 흐름

```text
                    ┌──────────────── design-api (RDS) ────────────────┐
                    │  design_projects.s3_prefix, access 검증            │
                    └──────────────────────▲───────────────────────────┘
                                           │
Browser ──► daemon ──► scratch/projects/<id>/  ◄──sync-down──  S3 tenant prefix
              │              │
              │         run 중 read/write (S3 PUT 없음)
              │              │
              └── run 종료 ──► sync-up (변경 파일만) ──► S3
                              └── 전 파일 성공 시에만 evict
```

### 3.2 sync-up — “전체 디스크 업로드”가 아님

`materializing-project-storage.ts` `syncUp()`:

- scratch 파일 목록을 순회
- **run 시작 시각 이후 mtime 이 갱신된 파일만** upload (`RUN_ARTIFACT_RECONCILE_MTIME_GRACE_MS` = 1s)
- 나머지는 `skipped` — stale 로컬 파일은 S3로 안 올림

즉 **“지금 쓰는 것만”** S3에 반영하는 것에 가깝다 (run/API mutation 기준).

### 3.3 sync-down — 필요할 때만

- **run 시작** (`beforeChatRun`)
- **파일 GET/변경 API** (lazy middleware, `OD_PROJECT_LAZY_SYNC_TTL_MS` 캐시)
- 프로젝트 **create** 시 design-api → daemon `scratch/sync-up` (registry commit 전 hard-fail)

명시적 `POST …/scratch/sync-up`은 일부 파일이라도 업로드에 실패하면
`502 PROJECT_STORAGE_SYNC_FAILED`를 반환한다. 따라서 Drive import/create가 S3 반영 실패를
성공으로 오인해 registry만 커밋하지 않는다. 일반 mutation 후 비동기 sync-up은 요청
응답을 지연시키지 않는 best-effort 동작을 유지한다.

### 3.4 evict — 로컬에서 지우기

| 트리거 | 동작 |
|--------|------|
| `OD_SCRATCH_EVICT_AFTER_RUN=1` (hosted 강제) | **run 종료 sync-up 실패 0건일 때만** `scratch/projects/<id>/` 삭제 |
| `POST …/scratch/evict` | design-api delete 등 |
| registry delete | evict + (기본) S3 tenant **purge** |

evict 후에도 **S3 SSOT는 유지**. 다음 접근 시 sync-down. 일부 sync-up 실패 또는 예외가
발생하면 scratch를 보존해 재동기화·복구 가능한 원본을 남긴다.

코드: `project-materialization-runtime.ts` (afterChatRun + evict), `materializing-project-storage.ts` `evictScratchProject()`.

---

## 4. 용량 관리 — EC2 디스크가 꽉 차지 않게

### 4.1 설계 의도

| 계층 | 무엇이 커지나 | 대응 |
|------|----------------|------|
| **scratch** | 활성 프로젝트·대형 export 일시 | evict, 변경분만 sync-up |
| **app.sqlite** | 채팅·메타 누적 | Litestream 복제 + (선택) backup 스크립트 |
| **root EBS** | Docker 레이어 | root 50~100GB, 모니터링 |
| **od-data EBS** | scratch + sqlite | staging 30GB / prod 100GB ([07 §3.5](./07_VM_배포_인프라.md)) |
| **S3** | 전체 tenant 데이터 (의도적 증가) | lifecycle, versioning — **EC2와 별도** |

**workspace별 S3 quota** 는 아직 없음 (09 — 출시 후).

### 4.2 구현된 용량·알람 메커니즘

| 메커니즘 | env / 도구 | 설명 |
|----------|------------|------|
| **run 후 evict** | `OD_SCRATCH_EVICT_AFTER_RUN=1` | scratch 프로젝트 트리 삭제 |
| **scratch 디스크 샘플** | `OD_SCRATCH_DISK_METRICS=1` | `od_scratch_disk_usage` JSON 마커 — **[21 가이드](./21_OD_SCRATCH_DISK_METRICS_가이드.md)** |
| **threshold** | `OD_SCRATCH_DISK_THRESHOLD_MB` (기본 **2048**) | 초과 시 `overThreshold: true` |
| **주기 샘플** | `OD_SCRATCH_DISK_METRIC_INTERVAL_MS` (기본 300000) | 5분마다 periodic 마커 |
| **CloudWatch 알람** | `print_cloudwatch_alarm_commands.sh` | scratch·sync-up 실패 필터 |
| **EBS 80% runbook** | [07 §4](./07_VM_배포_인프라.md) | 확장 또는 scratch 정리 |
| **S3 lifecycle** | `s3_lifecycle_policy.sh` | `sqlite-backups/` 30일, `design/_deleted/` 14일 |
| **validate preflight** | `validate_deploy_env.sh` | hosted s3 모드·evict·sync/disk metrics 누락 시 fail |

코드: `apps/daemon/src/storage/scratch-disk-usage.ts` — scratch 무한 증가 시 disk-full 선제 감지 목적.

### 4.3 evict를 끄면?

로컬 개발에서 `OD_SCRATCH_EVICT_AFTER_RUN` 미설정 시:

- scratch는 **lazy TTL·수동 evict·디스크 알람**에만 의존
- 여러 대형 프로젝트를 연속 materialize 하면 **od-data EBS가 커질 수 있음**
- staging/prod 에서는 **1 필수** (`validate_deploy_env.sh` hard fail, compose override도 1 고정)

### 4.4 여전히 로컬이 일시적으로 커지는 경우

| 상황 | 대략 규모 | SSOT 영향 |
|------|-----------|-----------|
| export / Chrome subprocess | +500MB~1GB 일시 | run 종료 후 evict·sync-up |
| 동시 materialize (여러 project) | scratch 합산 | evict 전까지 증가 |
| sync-up 실패 반복 | scratch에 dirty 유지 | S3는 마지막 성공 시점 — 알람 `od_s3_sync_up_failed` |

### 4.5 Drive import 부하 제한

Drive 가져오기는 design-api에서 파일을 순차 처리하며 파일당 50MB, 요청당 총 100MB,
worker당 동시 요청 2개로 제한한다. 동일 asset/path 반복은 다운로드 전에 차단하므로
불필요한 네트워크·메모리·scratch 쓰기를 만들지 않는다. presigned GET은 1MB chunk로
요청 전용 임시 파일에 기록하고 그 file handle을 daemon multipart로 전달한다. 파일별
upload 종료 즉시 임시 파일을 삭제하므로 네트워크 요청 수는 늘리지 않으면서 대형
`bytes`/multipart 메모리 중복을 제거한다. 상세 저장 순서는
[16 §5.2](./16_S3_데이터_저장_시점_SSOT.md#52-파일업로드-api-변경-직후-lazy-sync-up).

---

## 5. S3 용량 (의도적으로 증가)

사용자·프로젝트가 늘면 **`design/ws_…/proj_…/` 객체 수·바이트는 S3에서 증가**한다. 이것이 **프로젝트 파일 SSOT** 이다.

- EC2 od-data 와 **분리** — evict는 로컬만 비움
- Terraform: `design/` noncurrent version 90일 만료
- 삭제: registry delete + `OD_S3_PURGE_ON_DELETE` (tenant prefix purge)

상세 prefix: [19](./19_S3_버킷_prefix_역할.md).

---

## 6. Litestream 상세

### 6.1 역할

**Litestream** ([litestream.io](https://litestream.io)) 은 SQLite **한 파일**의 WAL 변경을 읽어 **S3에 연속 복제**한다.

Design 에서는 **프로젝트 HTML과 무관** — 대상은 **`app.sqlite` 하나**뿐이다.

| | 프로젝트 파일 | `app.sqlite` |
|--|---------------|--------------|
| SSOT | S3 `design/…/` | EBS + Litestream replica |
| 복제 도구 | daemon sync-up | Litestream sidecar |
| 키 | `design/ws_…/proj_…/file.html` | `litestream/app.sqlite` |

### 6.2 설정·기동

```yaml
# deploy/teamver/litestream.yml
dbs:
  - path: /data/app.sqlite
    replicas:
      - type: s3
        bucket: ${LITESTREAM_BUCKET}
        path: litestream/app.sqlite
        sync-interval: ${LITESTREAM_SYNC_INTERVAL:-3s}
```

```bash
# EC2 deploy/teamver — hosted는 deploy.sh가 litestream 서비스를 직접 기동
bash scripts/verify_litestream_replica.sh --staging
```

env: `LITESTREAM_BUCKET` (= `OD_S3_BUCKET`), `LITESTREAM_REGION`, `LITESTREAM_SYNC_INTERVAL` (기본 **3s** — 1s=촘촘한 RPO, 5s=부하 완화).

staging/production에서는 `deploy.sh`가 Litestream 서비스를 항상 기동한다. 두 env가
누락되거나 `LITESTREAM_BUCKET != OD_S3_BUCKET`이면 preflight가 실패하고, 컨테이너가
running 상태를 유지하지 못해도 daemon/API 후속 배포를 진행하지 않는다. Compose의
`litestream` profile은 수동 실행 호환용이며 hosted 배포의 optional 스위치가 아니다.

### 6.3 Litestream 없을 때

- `app.sqlite` 는 **EBS에만** 존재 — EC2/디스크 손실 시 채팅·로컬 메타 유실 위험
- fallback: `backup_sqlite_to_s3.sh` → `sqlite-backups/<env>/<timestamp>/` (**수동**)
- 복구: `restore_app_sqlite_from_s3.sh --litestream` 또는 `--from-snapshot`

### 6.4 용량 오해 방지

Litestream은 **복구(RPO/RTO)** 용이지, EBS 상의 `app.sqlite` 크기를 줄여 주지 않는다. SQLite 파일은 od-data 에 계속 커질 수 있다 — **알람·백업·(장기) Postgres 이전**이 별도 주제 (09 — DaemonDb Postgres는 출시 후).

### 6.5 replica 객체 · AWS에서 확인

**replica 객체** = Litestream이 S3에 올리는 복제 파일(generation·WAL segment). 프로젝트 HTML과 무관하며 prefix는 `litestream/app.sqlite/` 뿐이다.

| 확인 | 방법 |
|------|------|
| 스크립트 | `bash scripts/verify_litestream_replica.sh --staging` |
| 콘솔 | **S3** → `teamver-design-staging-data` → prefix `litestream/` → `app.sqlite/` 하위 **Last modified** |
| CLI | `aws s3 ls s3://teamver-design-staging-data/litestream/app.sqlite/ --region ap-northeast-2` |

`check_storage_isolation.sh --staging` §7 에서 동일 probe가 포함된다. 상세: [09 §5 Litestream](./09_Design_저장소_격리_출시게이트.md#litestream-예시).

---

## 7. 환경 변수 (저장·용량)

| 변수 | staging/prod 권장 | 역할 |
|------|-------------------|------|
| `OD_PROJECT_STORAGE` | **`s3`** | Hybrid 활성화 |
| `OD_S3_BUCKET` / `OD_S3_PREFIX` | terraform output | remote SSOT 루트 |
| `OD_SCRATCH_DIR` | default `OD_DATA_DIR/scratch` | scratch 루트 |
| `OD_SCRATCH_EVICT_AFTER_RUN` | **1** | run 후 scratch 삭제 |
| `OD_PROJECT_LAZY_SYNC_TTL_MS` | 60000 | GET sync-down 캐시 |
| `OD_S3_SYNC_UP_METRICS` | **1** | lazy sync-up 실패 마커 |
| `OD_SCRATCH_DISK_METRICS` | **1** | scratch 용량 마커 |
| `OD_SCRATCH_DISK_THRESHOLD_MB` | 2048 | 알람 threshold |
| `OD_S3_PURGE_ON_DELETE` | default on | delete 시 S3 purge |
| `LITESTREAM_BUCKET` | = project bucket | Litestream |
| `OD_S3_ALLOW_SCRATCH_FALLBACK` | **0** (prod/stg) | S3 실패 시 local SSOT fallback **금지** |

전체 sync-up 시점 표: [16 §8](./16_S3_데이터_저장_시점_SSOT.md#8-환경-변수-저장-동작에-직접-영향).

---

## 8. FAQ

### Q1. S3 모드인데 왜 `df -h` 에 로컬 용량이 보이나?

S3 모드 = **scratch + SQLite + Docker** 가 EBS를 쓴다. 프로젝트 **영구** 데이터는 S3에 있다.

### Q2. 버킷이 비어 있는데 정상인가?

프로젝트 create·sync-up·Litestream 기동 전에는 **정상**. [19 §4](./19_S3_버킷_prefix_역할.md#4-수동으로-만들어야-하나).

### Q3. 채팅 중 S3 콘솔에 파일이 없다?

run **종료 전**에는 scratch만 변경 — [16 §5.1](./16_S3_데이터_저장_시점_SSOT.md#51-ai-채팅-run-종료-후-가장-흔한-경로).

### Q4. od-data 80% 넘으면?

1) scratch 점검 (`od_scratch_disk_usage`, evict 설정)  
2) 불필요 프로젝트 purge  
3) Terraform `od_data_volume_gb` / root 확장 ([07 §3.5](./07_VM_배포_인프라.md))

### Q5. 로컬 dev 가 staging S3를 쓰면?

**비권장** — 데이터 오염·evict 실수. MinIO 또는 `local` — [09 §10.1](./09_Design_저장소_격리_출시게이트.md).

---

## 9. 코드·스크립트 SSOT

| 영역 | 경로 |
|------|------|
| scratch 레이아웃 | `apps/daemon/src/storage/project-storage-layout.ts` |
| sync-up/down·evict | `apps/daemon/src/storage/materializing-project-storage.ts` |
| run hook | `apps/daemon/src/storage/project-materialization-runtime.ts` |
| lazy API sync | `apps/daemon/src/storage/lazy-project-materialization.ts` |
| scratch disk metric | `apps/daemon/src/storage/scratch-disk-usage.ts` |
| tenant prefix | `deploy/teamver/be/app/db/crud/design_project_crud.py` |
| Litestream | `deploy/teamver/litestream.yml`, hosted `deploy.sh` 자동 기동 + running gate |
| env 검증 | `deploy/teamver/scripts/validate_deploy_env.sh` |
| isolation check | `deploy/teamver/scripts/check_storage_isolation.sh` |
| CW 알람 CLI | `deploy/teamver/scripts/print_cloudwatch_alarm_commands.sh` |

---

## 10. 관련 문서

| 문서 | 내용 |
|------|------|
| [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) | Prod blocker, G1~G7, Phase 진행 |
| [16 S3 저장 시점](./16_S3_데이터_저장_시점_SSOT.md) | sync-up **언제** 발생하는지 |
| [19 S3 버킷 prefix](./19_S3_버킷_prefix_역할.md) | 버킷 안 **폴더별** 역할 |
| [18 Instance Profile](./18_EC2_IAM_Instance_Profile_S3_설정.md) | S3 접근·IMDS |
| [07 VM 인프라](./07_VM_배포_인프라.md) | EBS 2볼륨·용량 |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-22 | 초안 — Hybrid 로컬+S3, 용어, 용량·Litestream, FAQ SSOT |

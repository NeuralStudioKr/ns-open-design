# OD_SCRATCH_DISK_METRICS — scratch 디스크 용량 관측 가이드

**대상:** Design EC2 운영 · staging/production 배포 · S3 hybrid 저장소  
**관련:** [20 Hybrid 저장소](./20_Design_Hybrid_저장소_로컬_S3_가이드.md) · [09 §8.2 scratch·EBS](./09_Design_저장소_격리_출시게이트.md#82-scratch-디스크--ec2-ebs-2볼륨) · [07 VM 배포](./07_VM_배포_인프라.md)

---

## 1. 한 줄 요약

`OD_SCRATCH_DISK_METRICS=1` 은 **S3 모드 daemon이 scratch 디렉터리 용량을 주기적으로 재서 JSON 로그로 남기는 스위치**다.  
채팅·디자인 **기능에는 필수가 아니지만**, hosted 환경에서 **EBS(od-data) 디스크 풀 방지·CloudWatch 알람**을 위해 켜 두는 것이 권장된다.

---

## 2. 배경 — scratch가 왜 생기나

Teamver Design hosted 는 프로젝트 파일 SSOT가 **S3** 이고, daemon 은 run/chat/export 동안만 **scratch** 에 프로젝트 트리를 materialize 한다 ([09 §8.1](./09_Design_저장소_격리_출시게이트.md#81-run-단위-동작)).

```text
run 시작  → S3 prefix → scratch/{projectId}/  (sync-down)
agent cwd = scratch
run 종료  → dirty 파일만 S3 PUT (sync-up)
(선택)    → scratch 프로젝트 트리 삭제 (OD_SCRATCH_EVICT_AFTER_RUN=1)
```

scratch 는 **임시 작업 공간**이지 SSOT 가 아니다. 그러나 evict 실패·sync-up 실패·대형 export·동시 materialize 가 겹치면 scratch 가 **od-data EBS** 위에서 계속 커질 수 있다. 볼륨이 가득 차면 daemon·Docker 전체가 멈출 수 있다 ([20 §4](./20_Design_Hybrid_저장소_로컬_S3_가이드.md#4-용량--디스크-관리)).

| 볼륨 | 마운트 | 역할 |
|------|--------|------|
| root EBS | `/` | OS·Docker 이미지 |
| od-data EBS | `OD_DATA_DIR` / scratch | **일시 미러** + app.sqlite (프로젝트 SSOT = S3) |

---

## 3. 무엇을 하는가

`OD_SCRATCH_DISK_METRICS=1` 이고 `OD_PROJECT_STORAGE=s3` 일 때만 활성 ([`scratch-disk-usage.ts`](../apps/daemon/src/storage/scratch-disk-usage.ts)).

daemon 이 `$OD_SCRATCH_DIR` 아래를 `readdir` + `stat` 으로 walk 하여 **총 bytes·파일 수**를 구하고, stdout 에 한 줄 JSON 을 남긴다.

| 시점 | `stage` | 기본 주기 |
|------|---------|-----------|
| chat run 종료 후 (sync-up 성공/실패 모두) | run-end | 매 run |
| daemon 유휴 중 | `periodic` | **5분** (`OD_SCRATCH_DISK_METRIC_INTERVAL_MS`, 기본 300000) |
| 프로세스 종료(SIGTERM 등) | `drain` | 1회 |

예시 마커:

```json
{
  "metric": "od_scratch_disk_usage",
  "stage": "periodic",
  "scratchDir": "/app/.od/scratch",
  "bytes": 524288000,
  "files": 42,
  "errors": 0,
  "thresholdBytes": 2147483648,
  "overThreshold": false
}
```

`OD_SCRATCH_DISK_THRESHOLD_MB`(기본 **2048** = 2 GiB) 이상이면 `overThreshold: true` 가 붙는다. CloudWatch Logs metric filter 가 이 필드를 잡아 알람을 만든다 ([`print_cloudwatch_alarm_commands.sh`](../deploy/teamver/scripts/print_cloudwatch_alarm_commands.sh) → `TeamverDesignScratchOverThreshold`).

---

## 4. 왜 있는가 (문제를 막는 이유)

| 위험 | 메트릭 없을 때 | 메트릭 있을 때 |
|------|----------------|----------------|
| evict 미동작·누적 | 디스크 풀까지 **증상만** (chat 실패, daemon hang) | 로그·CW 로 **선행 경고** |
| sync-up 반복 실패 | dirty 가 scratch 에 남음 — S3 는 옛 snapshot | run 종료마다 bytes 추이 확인 |
| idle 중 서서히 증가 | run 이 없으면 관측 공백 | **5분 periodic** 샘플 |
| 배포/재시작 직전 | 마지막 상태 불명 | `drain` 1회로 종료 시점 스냅샷 |

S3 에 데이터가 있어도 **scratch·EBS 가 꽉 차면 인스턴스가 죽는다**. SSOT 복구와 별개로 **가용성** 문제다.

---

## 5. 왜 켜 두는 것이 좋은가

1. **부하가 작다** — 로컬 디스크 walk 만. 네트워크·LLM 과 무관. `OD_SCRATCH_EVICT_AFTER_RUN=1` 이면 scratch 트리가 작아 walk 도 가볍다.
2. **run 을 막지 않는다** — 샘플링 실패는 `console.warn` 만. chat/run lifecycle 과 분리.
3. **프로세스 exit 을 막지 않는다** — periodic timer 는 `unref()`.
4. **운영 표준과 맞다** — `validate_deploy_env.sh` hosted preflight, compose staging/production override, `apply_staging_s3_env.sh` backfill 이 모두 `=1` 을 전제.
5. **다른 신호와 짝** — `OD_S3_SYNC_UP_METRICS`(sync 실패 마커), EBS CW Agent `disk_used_percent` 와 함께 **원인·추이**를 볼 수 있다 ([DEPLOY-AWS §알람](../deploy/teamver/docs/DEPLOY-AWS.md)).

---

## 6. 서비스 기능 vs 배포 가드

| 구분 | `OD_SCRATCH_DISK_METRICS` 없음 (`0`/미설정) | `=1` |
|------|---------------------------------------------|------|
| chat / design / S3 sync | **동작함** | 동작함 |
| `od_scratch_disk_usage` 로그 | 없음 | 있음 |
| staging/production `validate_deploy_env.sh` | **fail** (hosted S3 모드) | pass (warn) |
| 로컬 laptop `OD_PROJECT_STORAGE=local` | 검사 대상 아님 (warn only) | 선택 |

**기능 필수는 아니지만, hosted 배포 preflight 에서는 필수**에 가깝다. 데모·저트래픽 staging 도 env 에 명시하는 편이 deploy 마찰을 줄인다.

---

## 7. env 변수

| 변수 | hosted 권장 | 설명 |
|------|-------------|------|
| `OD_SCRATCH_DISK_METRICS` | **1** | 메트릭 emit on/off (`1` 만 true) |
| `OD_SCRATCH_DISK_THRESHOLD_MB` | 2048 | `overThreshold` 기준 (MiB). `<=0` 이면 threshold 플래그만 끔 |
| `OD_SCRATCH_DISK_METRIC_INTERVAL_MS` | 300000 | periodic 주기 (ms). 비양수면 periodic 비활성 |

함께 켜 두는 companion (scratch **관리** 쪽):

| 변수 | hosted 권장 | 역할 |
|------|-------------|------|
| `OD_SCRATCH_EVICT_AFTER_RUN` | 1 | run 후 scratch 프로젝트 트리 삭제 |
| `OD_SCRATCH_EVICT_IDLE` | 1 | lazy-only 잔류 scratch periodic evict (기본 post-run evict 시 on) |
| `OD_S3_SYNC_UP_METRICS` | 1 | sync-up 실패 `od_s3_sync_up_failed` · sync-down `od_s3_sync_down` |

예시: [`.env.staging.example`](../deploy/teamver/.env.staging.example) · [`.env.production.example`](../deploy/teamver/.env.production.example)

---

## 8. 배포·운영 체크리스트

### 8.1 preflight 실패 시

```text
❌ OD_SCRATCH_DISK_METRICS=1 필요 — hosted scratch 디스크 용량 감지 필수
```

`.env.staging` / `.env.production` 에 위 §7 세 줄이 없을 때 난다. 기존 secrets 는 유지한 채 backfill:

```bash
cd deploy/teamver
bash scripts/apply_staging_s3_env.sh      # staging
# bash scripts/apply_production_s3_env.sh  # production
bash scripts/validate_deploy_env.sh --staging --rds
```

### 8.2 상태 확인

```bash
bash scripts/print_track_a_status.sh --staging   # "od_scratch_disk_usage JSON" 라인
```

### 8.3 CloudWatch 알람

```bash
bash scripts/print_cloudwatch_alarm_commands.sh --staging
```

필터 패턴: `{ $.metric = "od_scratch_disk_usage" && $.overThreshold = true }`

---

## 9. FAQ

### Q1. 로컬 개발에서도 켜야 하나?

아니다. `OD_PROJECT_STORAGE=local` 이면 S3 scratch 경로 자체가 다르고, validate hosted hard gate 도 적용되지 않는다. 필요 시만 켠다.

### Q2. 끄면 서버가 가벼워지나?

체감 차이는 거의 없다. evict 가 켜진 hosted 에서는 5분마다 작은 디렉터리 walk 수준이다. **끄는 이유는 부하가 아니라 로그 노이즈를 줄이고 싶을 때** 정도다 — 그 경우에도 hosted validate 를 통과하려면 정책 변경이 필요하다.

### Q3. `OD_SCRATCH_EVICT_AFTER_RUN=1` 만 있으면 충분하지 않나?

evict 는 **정상 경로**에서 scratch 를 비운다. evict 버그·실패·비정상 종료·sync-up 실패는 여전히 남을 수 있다. 메트릭은 **“evict 가 잘 되고 있는지”를 숫자로 증명**하는 안전망이다.

### Q4. S3 용량과 혼동해도 되나?

안 된다. S3 는 tenant 데이터 SSOT 로 **의도적으로 커진다**. 이 메트릭은 **EC2 od-data EBS / scratch** 만 본다 ([19 S3 prefix](./19_S3_버킷_prefix_역할.md) 와 별도).

### Q5. compose 에 이미 `OD_SCRATCH_DISK_METRICS=1` 인데 validate 가 왜 실패하나?

`docker-compose.staging.yml` 은 daemon 컨테이너에 값을 넣지만, **`validate_deploy_env.sh` 는 deploy 전 `.env` 파일**을 검사한다. env 파일과 compose 가 일치해야 operator 가 의도를 명시한 것으로 본다.

---

## 10. 코드·문서 위치

| 항목 | 경로 |
|------|------|
| 샘플러 | `apps/daemon/src/storage/scratch-disk-usage.ts` |
| run-end / periodic hook | `apps/daemon/src/storage/project-materialization-runtime.ts` |
| preflight | `deploy/teamver/scripts/validate_deploy_env.sh` |
| env backfill | `deploy/teamver/scripts/apply_staging_s3_env.sh` |
| 테스트 | `apps/daemon/tests/scratch-disk-usage.test.ts` |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-19 | 초안 — 목적·부하·배포 가드·FAQ 정리 (기존 09/20/DEPLOY-AWS 산재 내용 통합) |

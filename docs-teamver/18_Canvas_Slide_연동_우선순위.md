# Canvas → AI Design Slide 연동 범위·우선순위

2026-06-22 기준, Canvas 결과물을 AI Design slide 생성 source로 사용하는 범위와 Teamver Design의 다음 작업 순서를 결정한다.

**관련 문서:** [04 구현 우선순위](./04_구현_우선순위.md) · [09 저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md) · [13 embed slide MVP](./13_embed_슬라이드_MVP_기능게이트.md) · [14 Drive 연동](./14_Design_Drive_연동_설계.md)

---

## 1. 결정

### 1.1 1차 출시 결정

Canvas 연동은 **현재 구현 범위로 1차 출시에 충분**하다.

- Markdown만으로도 제목·섹션·본문 구조를 안정적으로 slide로 변환할 수 있다.
- 현재 Main Web/Mobile은 Canvas를 **이미지·서식이 포함된 self-contained HTML**로 Drive에 저장하고 AI Design import picker로 전달한다.
- `teamverDriveIntent=create-slides`로 slide 생성 지시문까지 준비한다.
- 사용자는 Drive import 대상을 확인한 후 slide run을 시작할 수 있다.

### 1.2 지금 하지 않는 작업

다음은 **1차 출시 블로커가 아니며 후순위**로 둔다.

- Canvas 폰트·색상·여백·페이지 레이아웃을 slide 테마로 1:1 복제
- Canvas 문단을 slide master/layout slot에 자동 매핑
- DOCX/PDF/HTML 형식별 전용 parser를 OD core에 추가
- import 확정 없이 외부 Drive 파일을 즉시 실행하는 무확인 auto-run

원본 문서와 slide는 화면 비율·정보 밀도·레이아웃 단위가 다르다. 원본 레이아웃 복제를 지금 시작하면 작업량은 크게 늘지만 slide 생성 성공률이나 출시 완성도에 대한 즉시 효과는 작다.

---

## 2. 1차 완료 기준

Canvas 연동은 아래가 동작하면 1차 완료로 본다.

- [x] Main Web/Mobile 모두 `AI Design으로 슬라이드 만들기` 진입점 제공
- [x] Canvas 최신 draft flush 후 self-contained HTML 생성
- [x] 로컬 파일 저장 없이 Main Drive presigned upload
- [x] Drive `assetId/name/mimeType` → Design handoff
- [x] Design import picker에 source 사전 선택
- [x] slide 생성 지시문 자동 준비
- [x] MD·HTML·PDF·DOCX 등 slide-friendly Drive 입력 허용
- [ ] 실제 개인 Drive / 팀 Drive 각 1건에서 import → run → 결과 재진입 확인
- [ ] Canvas 출발 HTML로 제목·섹션·핵심 본문이 slide에 반영되는지 확인

마지막 두 항목은 신규 기능 개발이 아니라 출시 인수 항목이다. 실패가 발견될 때만 해당 경계를 수정한다.

---

## 3. 전체 다음 작업 우선순위

### P0 — 출시 전 필수

| 순위 | 작업 | 이유 | OD core 변경 |
|---|---|---|---|
| 1 | **S3 프로젝트 SSOT 강제** | 재배포·다중 인스턴스·EC2 교체 후에도 프로젝트와 import 파일이 남아야 함 | 없음. Teamver storage adapter/env |
| 2 | **workspace/auth 격리 완료** | 다른 workspace의 프로젝트·Drive source·output을 보면 즉시 출시 불가 | 최소. design-api/BFF/nginx |
| 3 | **slide lifecycle 종단 완성** | 생성 요청 → 배경 실행 → 페이지 이동 → 재진입 → 수정이 같은 run으로 연결되어야 함 | 이미 최소 패치 구현. 누락만 수정 |
| 4 | **Drive 양방향 핵심 경로 완료** | 개인/팀 Drive import와 결과 HTML publish가 실제 권한으로 성공해야 함 | 없음. 기존 wrapper/API 경계 |
| 5 | **runtime model 설정·usage/billing 계약** | 모델 미설정, 사용량 누락, 중복 차감은 메인 기능을 막거나 비용 사고로 연결 | 없음. design-api/Main BE |

### P1 — P0 확인 후 개선

| 순위 | 작업 | 판단 |
|---|---|---|
| 1 | **Canvas import 확인 + slide run 시작을 하나의 확정 action으로 통합** | 핵심 UX 단축이지만 현재도 기능은 완결됨 |
| 2 | **기본 source 구조화** | MD/HTML의 heading·paragraph·image 순서를 정규화. 필요하면 design-api에서 처리 |
| 3 | **결과 HTML/deck 미리보기·Drive publish 완료 동선** | 생성 성공 후 결과 확인·저장을 짧게 만듦 |
| 4 | **Design System 기본 적용** | Canvas 원본 테마 복제보다 workspace Design System/기본 slide theme를 적용하는 편이 품질 대비 효과가 큼 |

### P2 — 출시 후

| 작업 | 보류 이유 |
|---|---|
| Canvas 원본 테마·레이아웃 추출/복원 | 문서 → slide 의미 매핑 설계가 필요하고 개발 범위가 큼 |
| DOCX/PDF 전용 고품질 parser | MD/HTML로 1차 사용 가능. 실사용 품질 문제가 확인될 때 추가 |
| Drive 다중 handoff·원본 deep-link 고도화 | 단일 source 핵심 경로와 무관 |
| full publish asset browser·상세 history UX | 결과 저장 성공 이후의 편의 기능 |
| PDF/PPTX Drive 자동 publish | HTML publish로 1차 출시 가능. 별도 렌더 인프라 결정 필요 |

---

## 4. Canvas 대 다른 작업 판단

| 선택 | 기능 완결도 효과 | 작업량 | OD fork 위험 | 결정 |
|---|---:|---:|---:|---|
| Canvas 테마/레이아웃 보존을 지금 개발 | 중 | 크게 | 높음 | **보류** |
| Canvas one-confirm run | 중 | 작음 | 낮음 | **P1 첫 번째** |
| S3/auth/workspace 격리 | 매우 큼 | 중 | 낮음 | **P0 즉시** |
| slide lifecycle·Drive import/publish 종단 | 매우 큼 | 작음~중 | 낮음 | **P0 즉시** |
| Design System 기본 테마 적용 | 큼 | 중 | 중 | **P1** |

**결론:** Canvas 연동을 더 깊게 개발하기보다 P0 출시 경계를 먼저 닫는다. Canvas는 현재 범위를 유지하고, P0 후에 one-confirm run만 작은 Teamver 전용 패치로 추가한다.

---

## 5. OD 수정 최소화 원칙

1. Drive 권한·download·S3 upload·registry는 `deploy/teamver/be` 또는 Main BE가 담당한다.
2. Canvas export 버튼·Web/Mobile 동일 진입은 Main FE가 담당한다.
3. OD에는 query handoff, composer staging, run attachment 계약 외의 전용 로직을 추가하지 않는다.
4. 형식별 parser가 필요해지면 OD core가 아니라 design-api source normalizer로 구현한다.
5. OD upstream 파일 수정은 feature gate 하의 작은 additive patch로 유지한다.

---

## 6. 다음 실행 순서

1. S3 저장·registry DB·workspace/auth 격리를 출시 구성에서 강제한다.
2. 일반 prompt, Drive MD/HTML, Canvas HTML 세 source로 slide lifecycle을 인수한다.
3. 생성 중 페이지 이동·재진입·수정·Drive publish까지 같은 프로젝트로 유지되는지 확인한다.
4. 실패가 발견된 경계만 Teamver wrapper에서 수정한다.
5. P0 완료 후 Canvas one-confirm run과 Design System 기본 적용을 순서대로 개발한다.

# Canvas → Apps 슬라이드 생성 — 기획·설계

**작성일:** 2026-07-15  
**상태:** 기획 확정 초안 (구현 전)  
**범위:** Main Canvas 헤더 **Apps** 진입 → Design에서 슬라이드 생성. Docs 메뉴는 자리만 두고 비활성.

**관련 문서**

- [18 Canvas → Slide 연동 우선순위](./18_Canvas_Slide_연동_우선순위.md) — 기존 handoff·P0/P1 판단
- [14 Design Drive 연동](./14_Design_Drive_연동_설계.md) §3.3 · §4.6 — `teamverDriveAsset*` · `create-slides`
- [13 embed 슬라이드 MVP](./13_embed_슬라이드_MVP_기능게이트.md)
- Main FE Cookie SSO: `ns-teamver-fe-v2/web/docs/90_Cookie_SSO_AI_Apps_연동.md`
- Canvas HTML export: `ns-teamver-be/docs/61_16_Canvas_HTML_다운로드_설계.md`
- Canvas IR: `ns-teamver-fe-v2/web/docs/be/61_18_Canvas_IR_레이아웃_테마_v1_단계도입설계.md`

---



## 1. 목표

캔버스에서 작성 중인 작업물을 **추가 편집 없이도** Design 슬라이드 초안으로 전환한다.


| 요구           | 의미                                              |
| ------------ | ----------------------------------------------- |
| 캔버스 기반 즉시 생성 | flush 최신 draft → Design one-confirm → slide run |
| 텍스트만이 아님     | 콜아웃·표·이미지·스마트 블록 등 캔버스 요소를 **유실 최소화**로 전달       |
| 진입 UX 재정비    | 드라이브 내보내기와 역할 분리. **Apps** 드롭다운으로 AI 앱 변환 노출    |


성공 기준(제품): 사용자는 캔버스 헤더에서 Apps → `Design \| 슬라이드로 만들기`만으로 Design 탭을 열고, 확인 후 구조·핵심 본문·이미지가 반영된 덱을 받는다.

---



## 2. 비범위 (이번 기획)

- Canvas 테마(폰트·색·여백)를 슬라이드 테마로 **1:1 복제**
- Canvas 블록을 slide master 슬롯에 **결정적 자동 매핑** (스키마 변환기)
- Docs 앱 실제 연동 (`Docs \| 문서로 만들기`는 UI만)
- Design에 Canvas `document-ir-v1` **네이티브 파서**를 OD core에 추가
- 확인 없이 auto-run (기존 one-confirm 유지)

원본 문서와 슬라이드는 정보 밀도·페이지 단위가 다름. “인식·처리”는 **에이전트가 소스에서 의미 있는 구조·에셋을 읽고 재구성**하는 수준을 1차로 한다. 결정적 IR→슬라이드 IR 변환기는 후속(P2).

---



## 3. UX 설계



### 3.1 헤더 버튼 배치

캔버스 패널 헤더 (기존과 동일 패턴: 아이콘 + chevron 펼침):

```text
[ …편집 툴… ]  [ 다운로드 ▾ ]  [ 드라이브 ▾ ]  [ Apps ▾ ]  [ 더보기 ]
                                      ↑
                         드라이브 오른쪽 신규
```


| 메뉴         | 역할                                     |
| ---------- | -------------------------------------- |
| 다운로드       | 로컬 파일 받기 (기존)                          |
| 드라이브로 내보내기 | Drive에 파일 저장만 (기존 포맷). **슬라이드 만들기 제거** |
| **Apps**   | AI 앱으로 **변환·생성**                       |




### 3.2 Apps 드롭다운 항목

형식: `{앱 표시명} | {동작}`


| 항목                   | 상태      | 동작                                                            |
| -------------------- | ------- | ------------------------------------------------------------- |
| `Design | 슬라이드로 만들기` | **활성**  | 기존 `handleCreateSlidesFromCanvas` 동선 (형식·handoff 유지, 진입점만 이동) |
| `Docs | 문서로 만들기`     | **비활성** | disabled + short hint (“곧 지원”) — 클릭 무반응                       |


표시명 로케일 (제품 표기 규칙과 맞춤):


| locale | Design 항목                        | Docs 항목                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------- |
| ko     | `teamver 디자인 | 슬라이드로 만들기`        | `Docs | 문서로 만들기` (또는 `teamver 문서` — Docs 브랜드 확정 전 영문 Docs 허용) |
| en     | `teamver Design | Create slides` | `Docs | Create document` (disabled)                           |
| ja     | `teamverデザイン | スライドを作成`          | `Docs | 文書を作成` (disabled)                                     |


아이콘: Apps 계열(그리드/스파클 등). 다운로드·드라이브와 구분되는 Lucide 계열로 통일.

### 3.3 제거

드라이브 메뉴 최상단 **「…디자인으로 슬라이드 만들기」** (`canvasCreateSlides`) 항목 **삭제**.

- handler `handleCreateSlidesFromCanvas`는 Apps 메뉴에서 재사용.
- Mobile: `CanvasDocExportMenuModal`의 `design-slides`도 Apps 성격 메뉴로 재배치(또는 동등 시트 섹션 “Apps”). Web과 문구·형식 맞출 것.



### 3.4 로딩·에러

기존과 동일: blank/로딩 셸 → Design SSO → one-confirm modal → run.  
실패 toast: 기존 `canvasCreateSlidesFailed` 계열 카피 유지·키만 Apps 문구에 맞게 조정 가능.

---



## 4. 현재 기술 동선 (AS-IS)

```text
Canvas draft (document-ir-v1 JSON, TipTap)
  → dirty flush
  → POST …/canvas/…/export-html   (self-contained HTML, 이미지 base64)
  → Main Drive presigned upload (text/html)
  → Design URL:
       teamverDriveAssetId / Name / MimeType
       + teamverDriveIntent=create-slides
  → TeamverCanvasSlideLaunchModal (one-confirm)
  → import-drive + CANVAS_CREATE_SLIDES_PROMPT
```

**저장 SSOT:** DB `draft_body` JSON (`document-ir-v1`).  
**슬라이드 handoff SSOT(현재):** Drive에 올린 **HTML**, 의도 `create-slides`.

핵심 코드:

- Main Web: `SessionCanvasPanel.tsx` · `aiAppLaunchUrls.ts` · `fetchSessionCanvasDocExportHtmlBlob`
- Design: `driveLaunchHandoff.ts` · `canvasSlideLaunch.ts` · `TeamverCanvasSlideLaunchModal.tsx`

---



## 5. 소스 형식 비교 — JSON IR vs Markdown vs HTML

캔버스는 내부적으로 JSON IR을 쓴다. 슬라이드 생성 파이프에 **무엇을 넘길지**를 비교한다.

### 5.1 후보


| 방식                | 설명                                                                      |
| ----------------- | ----------------------------------------------------------------------- |
| **A. JSON IR 직접** | `draft_body` 전체(또는 sanitize 사본)를 `.json`으로 Drive upload → Design attach |
| **B. Markdown**   | `documentIrToMarkdown` → `.md` (이미지 시 ZIP). Design attach               |
| **C. HTML (현행)**  | BE `export-html` → self-contained `.html` → Drive → Design              |
| **D. 하이브리드 (후속)** | C로 1차 전달 + 선택적으로 “outline JSON”(제목/섹션/블록 타입 요약)을 프롬프트·sidecar로 보조       |




### 5.2 요소별 전달 품질


| 요소                      | JSON IR                          | MD                                  | HTML(현행)                             |
| ----------------------- | -------------------------------- | ----------------------------------- | ------------------------------------ |
| 제목·문단·리스트               | 구조 완전                            | heading/list로 양호                    | DOM으로 양호                             |
| 콜아웃 (tone/title)        | 타입·tone 보존                       | 평문화·톤 약화                            | `data-*`/스타일로 보존 가능                  |
| 표                       | paragraph 내 HTML 또는 구조           | GFM table로 평탄                       | `<table>` 보존                         |
| 이미지                     | `data_asset_id` 참조만 — **바이트 없음** | ZIP assets 또는 링크; Design **zip 차단** | **base64 인라인** → 단일 파일로 완결           |
| Cover / columns / cards | 스키마 완전                           | 레이아웃 붕괴·나열                          | 마크업·CSS로 근사 보존                       |
| FAQ / KPI / Timeline    | 스키마 완전                           | Q/A·불릿 평탄                           | `data-canvas-*` semantic 마크업         |
| Design 측 즉시 소비          | IR 스키마 모름 → **전용 normalizer 필수** | LLM·기존 MD 경로 친화                     | LLM·allowlist·현행 prompt 경로 **이미 동작** |
| 구현 비용 (이번 스프린트)         | 큼 (Design/import + 이미지 resolve)  | 중 (이미지 ZIP 이슈)                      | **작음 (UX 이관 + 카피)**                  |




### 5.3 장단점 요약

**A. JSON IR**

- ✅ 정보 손실 최소, 스마트 블록 의미 명확
- ❌ Design/daemon은 Canvas IR를 모름. 파서·이미지 `data_asset_id`→바이트 resolve·권한 검사 신규
- ❌ “바로 슬라이드” 목표 대비 출시 지연·OD 복잡도↑
- ❌ JSON만 넘기면 LLM이 스키마를 추측해야 해서 **오히려 품질이 들쭉날쭉**할 수 있음 (스키마 문서/프롬프트 없이)

**B. Markdown**

- ✅ 섹션 계층이 slide outline에 잘 맞음 (doc 18도 MD 구조 변환을 긍정)
- ✅ Main에 export 이미 존재
- ❌ 콜아웃·다단·커버·스마트 블록 **시각/의미 소실**
- ❌ 이미지: ZIP은 Design import **차단**. 텍스트 MD만내면 이미지 누락 → “모든 요소” 요구 미달
- ❌ 표는 GFM으로 가능하나 HTML 복잡도 대비 손실 가능

**C. HTML (권고 · 1차)**

- ✅ 이미지·표·스마트 블록 마크업·서식을 **단일 파일**로 동봉
- ✅ Drive allowlist·`create-slides`·one-confirm·prompt **현행 계약 재사용**
- ✅ Main BE renderer가 이미 콜아웃/스마트 블록을 HTML로 내보냄
- ❌ Design이 semantic HTML을 slide 블록으로 **결정적 매핑하지는 않음** — LLM 재구성 (doc 18 P1 #2 “구조화”는 개선 과제)
- ❌ HTML 토큰 비대(대용량 base64) → 긴 캔버스는 size/timeout 주의 (상한·압축은 후속)

**D. 하이브리드**

- 품질↑ 가능하나 스키마 설계·이중 업로드·프롬프트 계약 필요 → **P2**



### 5.4 결정 (권고)


| Phase        | 소스                               | 이유                                                                   |
| ------------ | -------------------------------- | -------------------------------------------------------------------- |
| **1차 (이번)**  | **HTML 유지** + Apps UX 이전         | “모든 요소 인식”을 **전달 충실도**로 충족하는 최단 경로. JSON/MD로의 교체는 이미지·스키마 비용이 큼      |
| **1.1 (품질)** | HTML + prompt 보강                 | 스마트 블록·표·이미지를 보존하라는 명시; semantic `data-canvas-`*를 힌트로 언급             |
| **2 (선택)**   | design-api **source normalizer** | H TML/MD heading·블록 순서를 outline으로 정규화 (doc 18 P1 #2) — OD core 파서 금지 |
| **3 (선택)**   | IR outline sidecar 또는 제한적 JSON   | 블록 타입 목록만 보조 전달. 풀 IR handoff는 Design IR 스키마 합의 후                    |


**JSON을 SSOT로 두는 것과 handoff payload를 무엇으로 쓰는지 분리한다.**  
편집 SSOT는 계속 JSON IR. **본문 포맷은 당분간 HTML이 유리**하다.  
다만 **HTML을 Drive(S3)에 올리는 중계는 필수가 아니다** — §5.5.

MD를 “중간 표현”으로 쓰려면: (1) Design zip 허용 또는 (2) 이미지를 다중 asset으로 전달이 선행되어야 하며, Apps UX와 묶지 않는다.

---

## 5.5 전송 경로 — Drive 업로드는 필요한가? (부하·효율)

### 5.5.1 AS-IS가 실제로 하는 일

```text
Main BE  export-html                 ← CPU: IR→HTML (+ 이미지 base64)
Main FE  blob
Main Drive  presigned PUT            ← 스토리지 쓰기 #1 (Drive에 HTML 잔류)
Design   import-drive
         ← Drive download            ← 스토리지 읽기
         → daemon project upload     ← 스토리지 쓰기 #2 (Design 프로젝트)
LLM run
```

**프로세스끼리 직접 통신이 아니다.** Drive를 중계 객체 스토리지로 쓰는 간접 경로다.  
S3/Drive에 올리는 이유는 “반드시 그래서”가 아니라, **기존 Drive import API·ACL을 재사용**하기 쉬웠기 때문이다.

### 5.5.2 수동 「드라이브에서 가져오기」와 차이

| | 수동 Drive → Design | 현재 자동(Apps) |
|--|---------------------|----------------|
| UX 단계 | 많음 (저장·이동·picker·프롬프트) | 적음 (버튼 + one-confirm) |
| 서버 경로 | Drive 저장 + import | **같은 계열** + 자동 HTML Drive 업로드 |
| Drive 잔류 | 의도한 파일 | **임시 HTML 쓰레기** 가능 |
| intent/prompt | 사용자 | `create-slides` + 고정 prompt |

UX는 자동이 낫다. **인프라 효율은 동급이거나 자동이 더 나쁘다** (렌더 + 이중 저장).  
“단계가 줄어 나은가?” → 사용자는 Yes, 서버 부하는 No. 효율 목표면 **Drive 중계 제거**가 본선이다.

### 5.5.3 전송 대안 (부하 ↑일수록 아래)

| ID | 방식 | Drive | 서버 I/O 요약 | 비고 |
|----|------|-------|---------------|------|
| **T0** | 현행 Drive 중계 | 필요 | HTML렌더 1 + Drive쓰기/읽기 + Design쓰기 | UX만 이득. **장기 비권고** |
| **T1** | Browser `postMessage` Blob → Design 프로젝트 upload | **불필요** | HTML렌더 1 + Design쓰기 1 | FE 직접. 대용량·모바일 주의 |
| **T2** | URL에 `canvasArtifactId` → Design BFF가 Main export-html pull | **불필요** | HTML렌더 1 + Design쓰기 1 | 대용량·권한 단일화에 유리 |
| **T3** | Main→Design ephemeral transferId (TTL object) | 불필요 | 렌더 1 + temp쓰기 + promote | 서버 결합↑ |
| **T4** | IR만 넘기고 Design이 변환 | 불필요 | 변환기 신설 | 비용 최대. 비권고(당분간) |

**권고 (확정):** 포맷은 HTML 유지, 전송은 **T2 artifactId pull 본선** (§5.6). Drive는 「보관용 내보내기」만. T1은 본선 아님.

부하 하한(이상적): **export-html 1회 + Design 프로젝트 저장 1회 + LLM**. Drive round-trip = 0.

### 5.5.4 T1 / T2 스케치

**T1**

```text
flush → export-html → Blob
open Design → postMessage({ intent:'create-slides', file })
Design: origin check → 기존 project upload → one-confirm → run
```

**T2**

```text
flush → open Design?teamverCanvasArtifactId=&intent=create-slides
Design BFF → Main export-html (user auth) → daemon upload → one-confirm → run
```

### 5.5.5 페이즈 쪼개기

| Phase | 내용 |
|-------|------|
| **1a UI** | Apps 메뉴 · Docs disabled · Drive에서 슬라이드 항목 제거 (**handler는 T2가 준비될 때까지 잠시 T0 금지 권고 — 아래 §5.6**. UI만 먼저 가면 T0 임시 OK) |
| **1b Transport** | **T2 artifactId pull** (본선). Drive 제거 |
| 1.1 | prompt·E2E 품질 |
| 2+ | 대용량: base64 축소·이미지 외재화·스트리밍 |

---

## 5.6 권고 구현안 — T2 본선 (에러·장기·대용량)

에러 복구·모바일/새 탭 cold boot·수~수십 MB HTML·향후 Docs 재사용까지 보면 **T2(artifactId pull)를 본선**으로 둔다.  
T1(postMessage)은 “작은 HTML + Web 전용 빠른 경로”로만 두고, **폴백·실험용**이다. T0(Drive)는 장기 유지하지 않는다.

### 5.6.1 왜 T2인가

| 축 | T1 postMessage | **T2 artifactId pull** |
|----|----------------|------------------------|
| 대용량 | 브라우저 메모리·postMessage 한도에 막힘 | 서버 스트림/청크·한도 정책을 BFF에서 일관 적용 |
| 에러 복구 | 메시지 유실 시 재전송·탭 생존 의존. 재시도 UX 복잡 | Design에서 **같은 id로 재요청** 가능 (idempotent ingest) |
| 새 탭 / SSO cold boot | Design boot 전에 message 유실 위험 | URL에 id만 있으면 boot 후 pull — **타이밍 문제 적음** |
| Mobile / 시스템 브라우저 | opener·postMessage 취약 | URL + Cookie SSO와 동일 패턴 (Apps 런치와 정합) |
| 감사·권한 | FE 신뢰 경계가 넓음 | Main ACL(“이 유저·워크스페이스의 artifact인가”) **한곳** |
| 장기 (Docs 등) | 앱마다 Blob 프로토콜 복제 | `sourceKind=canvas` pull 계약 재사용 |
| 구현 비용 | FE만으로 시작 빠름 | Design BFF↔Main 호출·auth forward 필요 |

**결론:** 지금 조금 더 깔아도, 운영·대용량·에러에서 T2가 이긴다. T1을 본선으로 깔면 나중에 T2로 갈아엎는 비용이 난다.

### 5.6.2 타깃 시퀀스 (T2)

```text
[Main FE]
  1. dirty draft flush (실패 → toast, 중단)
  2. ensureAuthCookieForExternalApp
  3. window.open(Design URL + query)
       ?teamverCanvasSessionId=
       &teamverCanvasArtifactId=
       &teamverCanvasRev=          (optional: flush 후 revision/etag)
       &teamverDriveIntent=create-slides
       &workspaceId=               (기존 embed와 동일 규약 있으면 재사용)

[Design FE]
  4. boot + workspace/auth ready
  5. handoff 감지 → one-confirm 모달
       표시: 캔버스 제목(옵션 fetch) · “슬라이드 생성”
  6. 사용자 확인
       → POST design-api /projects/{id}/import-canvas
         body: { sessionId, artifactId, rev? }
  7. [Design BFF]
       a. 사용자 SSO/Cookie로 Main
            POST/GET …/session/{sid}/canvas/item/{aid}/export-html
            (Accept-stream 가능하면 stream)
       b. 크기·MIME 검사 (하드 한도: 예 40MB soft / 50MB hard — Drive import와 정렬)
       c. daemon project upload (기존 upload_project_file_path)
       d. 응답: { path, sizeBytes, name }
  8. composer에 attachment stage + CANVAS_CREATE_SLIDES_PROMPT
  9. run 시작 (기존 one-confirm과 동일)
 10. URL query consume (히스토리에서 id 제거)
```

Drive assetId query는 **사용하지 않는다.**

### 5.6.3 에러 처리 매트릭스

| 단계 | 실패 | 사용자 | 시스템 |
|------|------|--------|--------|
| flush | 저장 실패 | “캔버스를 먼저 저장하지 못했습니다” + 재시도 | Design 탭 미오픈 또는 이미 열었으면 닫지 않고 Main toast만 |
| SSO refresh | 401 | Apps와 동일 로그인 유도 | Design URL 오픈 보류 |
| Design boot | workspace/app disabled | 기존 Design access 메시지 | pull 미실시 |
| Main export 403/404 | 권한·삭제된 캔버스 | “이 캔버스에 접근할 수 없습니다” | import-canvas 4xx, 모달 닫기/재시도 |
| Main export 5xx / timeout | 렌더 과부하 | “잠시 후 다시 시도” + **재시도 버튼** (같은 artifactId) | BFF 타임아웃·재시도 1회(backoff) |
| oversize | Content-Length/실측 > hard | “파일이 너무 큽니다. 이미지를 줄이거나 나눠 주세요” | export 중단 또는 조기 abort. Drive 유도 **금지**(효율 목표와 충돌). 안내만 |
| daemon upload 실패 | scratch/S3 | “Design에 붙이지 못했습니다” + 재시도 | 실패 파일 정리 |
| run 실패 | LLM/daemon | 기존 run 에러 UX | attachment는 프로젝트에 남을 수 있음(재실행 가능) |
| 중복 confirm | 더블클릭 | 버튼 disable / in-flight lock | import-canvas idempotency-key = `{artifactId}:{rev}` |

**원칙:** 실패 지점을 Main/Design에 나눠 숨기지 않는다. Design 모달에 **에러 코드 + 재시도**를 두고, Main은 flush/SSO만 책임진다.

재시도: Design이 **다시 export-html을 호출**한다 (FE에 Blob을 들고 있지 않음 → T2의 강점).

### 5.6.4 대용량 전략 (지금 → 장기)

| 단계 | 조치 |
|------|------|
| **지금 (1b)** | hard cap = Drive import와 동일 대역(≤50MB). soft warn(예 20MB) 시 모달에 “시간이 걸릴 수 있음”. BFF는 **스트리밍 프록시**(전량 메모리 buffer 금지 목표). |
| **곧** | export-html 옵션 `images=link` 또는 `images=refs` — Drive/asset URL을 HTML에 넣고, Design ingest 시 **이미지 별도 fetch**(또는 LLM에 URL). base64 팽창 완화. |
| **이후** | IR outline sidecar(작게) + 이미지 멀티파트. HTML 풀셀프컨테인드만 의존하지 않기. |
| **하지 말 것** | 한도 초과를 Drive 업로드로 “우회” (이중 I/O 회귀). |

Main `export-html`이 동기·대량이면 worker 점유 → BFF/Main에 **timeout·동시성 cap**을 Drive import 세마포어와 비슷한 패턴으로 건다.

### 5.6.5 API 스케치 (신규)

**Design BFF** `POST /projects/{project_ref}/import-canvas`

```json
{
  "sessionId": "...",
  "artifactId": "...",
  "revision": "optional-etag-or-updated-at",
  "filename": "optional.html"
}
```

- Auth: 기존 Design embed SSO (사용자).
- Upstream: Main canvas export-html (동일 사용자 forward).
- 응답: 기존 import-drive와 비슷한 `{ imported: [{ path, name, sizeBytes, mimeType }] }`.
- 정책: slide attach allowlist의 `text/html`만. workspace 격리 동일.

**Main:** 기존 `POST …/export-html` 재사용 우선.  
필요 시 Design 서버 egress용으로 **같은 ACL의 내부/앱 스코프**만 문서화 (새 권한 남발 금지). Cookie forward가 어려우면 short-lived **canvas export ticket**(Main이 FE에 발급 → Design BFF가 ticket로 pull)을 T2 변종으로 둔다 — Blob postMessage보다 안전.

### 5.6.6 T1의 위치

- **본선 아님.**
- 선택: 로컬 개발·VERY small smoke, 또는 soft cap 미만에서만.
- production 기본 경로에 T1을 넣지 않는다 (에러·대용량 분기가 두 갈래가 됨).

### 5.6.7 구현 순서 (권고)

1. **1a UI** — Apps 메뉴, Docs disabled, Drive 메뉴에서 슬라이드 제거.  
   - transport는 **바로 T2 착수**가 이상적. T0를 다시 붙이지 말 것(쓰레기 HTML·이중 I/O).  
   - T2 전까지 버튼을 “준비 중”으로 둘지, T0 임시인지는 일정에 따라 선택(문서 기본값: **T0 임시 최소화**, T2와 UI를 한 스프린트에 묶는 편 권장).
2. **Main FE** — flush 후 Design URL에 session/artifact/intent만 전달. `uploadDriveAssets` 삭제.
3. **Design** — handoff reader + one-confirm을 canvas id용으로 확장(또는 모달 공용화).
4. **Design BFF `import-canvas`** — stream pull + size guard + daemon upload.
5. **에러·재시도 UX** — 매트릭스 §5.6.3.
6. **관측** — export 시간·bytes·실패 코드 메트릭. 1b 완료 기준: Drive create 경로 0건.
7. **대용량 Phase 2** — image refs / soft warn.

### 5.6.8 성공 기준 (1b)

- [ ] Drive에 임시 HTML이 생기지 않는다
- [ ] 동일 artifact로 모달 재시도 시 pull이 다시 성공 가능하다
- [ ] 50MB 초과 시 명확 reject (5xx 아님)
- [ ] 403/404/timeout 각각 구분 메시지
- [ ] Web·Mobile(시스템 브라우저) 동일 query 계약

---

## 6. 타겟 요약 (한 장)

```text
Apps ▾ → Design | 슬라이드로 만들기
  Main: flush → open Design?session&artifact&intent=create-slides
  Design: confirm → BFF import-canvas → Main export-html → daemon upload → run
  Drive: 사용 안 함
```

상세 시퀀스·에러·대용량은 **§5.6**.

---

## 7. “모든 요소 인식” — Phase별 해석


| Phase | 제품 약속                                 | 기술 수단               |
| ----- | ------------------------------------- | ------------------- |
| 1     | 소스에 요소가 **빠지지 않고** 실림. 슬라이드는 AI가 재배치  | HTML self-contained |
| 1.1   | 콜아웃·표·이미지·FAQ/KPI 등이 결과 덱에 **자주** 나타남 | prompt + 샘플 QA      |
| 2     | heading/블록 순서 정규화로 outline 안정         | normalizer          |
| 3     | 블록 타입별 slide 패턴(예: KPI→stat 행)        | 규칙 엔진 또는 IR outline |


인수 시나리오 (최소):

1. 제목 + 문단 + 불릿만 → 섹션 슬라이드
2. 콜아웃 + 표 → 경고/표가 덱에 반영
3. Drive 이미지 1장 이상 삽입 → 슬라이드에 이미지 등장
4. FAQ 또는 KPI 스마트 블록 → 내용이 Q/A 또는 수치로 반영 (레이아웃 1:1 불필요)

---



## 8. 구현 체크리스트



### 8.1 Main FE (Web) — Phase 1a UI

- [ ] 헤더: 드라이브 오른쪽에 Apps 드롭다운 (다운로드/드라이브와 동일 chevron 패턴)
- [ ] 항목 `Design | 슬라이드로 만들기` → 기존 create-slides handler (임시 T0 허용)
- [ ] 항목 `Docs | 문서로 만들기` → `disabled` + hint
- [ ] 드라이브 메뉴에서 create-slides 메뉴 아이템 삭제
- [ ] i18n (ko/en/ja/zh): Apps 라벨·hint; 구 드라이브용 create-slides 문구 정리
- [ ] 빈 artifact / export 중 disable 동작 기존과 동일

### 8.2 Main FE (Mobile) — Phase 1a UI

- [ ] export UI에 Apps 섹션 또는 동등 항목; Drive/다운로드와 분리
- [ ] create-slides 를 Apps로 이동; 구 위치 제거
- [ ] Docs disabled

### 8.3 Phase 1b Transport (T2 본선 — Drive 제거)

- [ ] Design BFF `import-canvas` + Main `export-html` pull (stream·size guard)
- [ ] Main FE: session/artifact/intent query만 전달 · `uploadDriveAssets` 제거
- [ ] Design: canvas handoff + one-confirm · 에러/재시도 (§5.6.3)
- [ ] Drive에 임시 HTML 0건 QA
- [ ] 관측: export-html 1회 + Design project upload 1회
- [ ] 50MB hard reject · 403/404/timeout 구분 메시지

### 8.4 Design — Phase 1.1 (권장, 작은 패치)

- [ ] `CANVAS_CREATE_SLIDES_PROMPT`에 구조·콜아웃·표·이미지·스마트 블록 보존 지시 보강
- [ ] staging E2E: Canvas HTML → one-confirm → run → 본문/이미지 반영 확인 ([18] §2 잔여 ☐)

### 8.5 후속 (Phase 2+)

- [ ] design-api HTML/MD outline normalizer
- [ ] 대용량 HTML(base64) 상한·압축·이미지 외재화 전략
- [ ] Docs 앱 준비 시 동일 Apps 메뉴 활성화 + Docs handoff 계약 문서

---



## 9. 리스크·운영


| 리스크 | 완화 |
| ------ | ---- |
| 긴 캔버스 HTML → 토큰/업로드 한계 | 50MB 상한·toast. T2 스트리밍·이미지 외재화 |
| Drive 중계 유지 시 이중 I/O·쓰레기 파일 | **1b에서 T0 제거** |
| T1 postMessage 유실/용량 | origin allowlist·재시도·한도 초과 시 T2 폴백 |
| T2 Main↔Design auth | Cookie SSO forward·workspace ACL 동일 검증 |
| LLM이 표/스마트 블록 무시 | Phase 1.1 prompt; QA 시나리오 3–4 |
| Drive와 Apps 역할 혼동 | “저장” vs “슬라이드로 만들기” |
| Docs 비활성 클릭 기대 | disabled + “준비 중” hint |


---



## 10. 결정 요약

1. **기능:** Canvas → Design 슬라이드. 진입은 **Apps**.
2. **본문 포맷:** 1차는 **HTML** (JSON IR은 편집 SSOT만). MD는 1차 비권고.
3. **전송:** **T2(artifactId pull) 본선** — Drive 없음. 이상적 부하 `export-html 1회 + Design 프로젝트 저장 1회`. T1은 본선 아님. T0 장기 금지. 상세 §5.6.
4. **버튼:** Apps = Design 활성 / Docs 비활성. 드라이브 내 슬라이드 항목 제거.
5. **수동 Drive import:** UX만 단축된 동급 인프라였음 → 효율 목표에서는 자동 경로가 Drive를 **건너뛰어야** 차별점이 생긴다.

---

## 11. FAQ

**Q. JSON이 원본인데 왜 HTML인가?**  
A. Design은 “파일 attach → LLM/덱” 파이프라이다. JSON을 직접 쓰려면 IR 파서·이미지 resolve가 Design에 필요하다. HTML export가 그 비용을 Main BE에서 이미 처리한다.

**Q. HTML이면 무조건 S3/Drive에 올려야 하나?**  
A. **아니다.** HTML은 “바이트 포맷”일 뿐. Drive/S3 중계 없이 FE `postMessage` 또는 Design→Main pull로 Design 프로젝트에만 저장하면 된다.

**Q. 지금 Drive 올리는 것과 수동 import 차이는?**  
A. 서버 경로는 거의 같고, 자동은 UX·intent/prompt만 단축한다. Drive에 임시 HTML이 남는 부작용이 있다. 효율이 목표면 Drive를 빼는 쪽이 맞다.

**Q. 프로세스 간 직접 통신은?**  
A. 브라우저 탭 간(T1) 또는 Design BFF↔Main API(T2)가 그에 해당한다. 메시지 버스까지는 이 규모에서 과하다.

**Q. Docs는?**  
A. 메뉴 자리만. 활성 시에도 **T2 계열 pull 계약**을 재사용하는 것이 좋다 (Blob 프로토콜 복제 금지).

**Q. 구현은 T1과 T2 중 어떤 것?**  
A. **T2 본선.** 에러 재시도·대용량·모바일·장기 확장에서 T1보다 유리하다. 상세 §5.6.

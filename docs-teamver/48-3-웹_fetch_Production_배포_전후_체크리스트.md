# 48-3 — web_fetch (native safe redirect) Production 배포 전·후 필수 체크리스트

**문서 번호:** 48-3  
**작성:** 2026-07-28 (KST)  
**상태:** Active — Production 반영 시 **매 배포마다** 본 문서를 따라 증적을 남긴다.  
**범위:** `ns-open-design` Design embed · daemon **`web_fetch` / 선-fetch / `<web-fetch-context>`** 파이프라인. (2026-07-28 기준 핵심 변경: [48-2](./48-2-웹_fetch_native_redirect_apex_www_이슈.md) apex→www safe redirect + [48-1](./48-1-구현설계-webfetch-adapter.md) adapter 리팩터 — **기본 동작은 native**)

**Production 인프라·Storage G1~G7 게이트는 별도:** [17 Production 출시 작업 순서](./17_Production_출시_작업_순서.md) · [09 저장소·격리 출시 게이트](./09_Design_저장소_격리_출시게이트.md).  
**본 문서는 “앱 기능(web_fetch)” slice** — 17 Step 0~6 **이후 또는 병행**으로 Design **앱 배포**할 때 web_fetch 회귀를 막기 위한 SSOT.

---

## 0. 한 페이지 요약

| 단계 | 시점 | 필수? | 한 줄 |
|------|------|-------|--------|
| **P0** | 배포 **전** (CI/로컬) | ✅ | daemon 33 + FE 8 tests green |
| **P1** | 배포 **전** (staging) | ✅ | apex + www URL smoke, env reader 금지 |
| **P2** | 배포 **직전** (prod 준비) | ✅ | 배포 커밋·env·롤백 tag 확정 |
| **P3** | 배포 **직후** 0~15분 | ✅ | prod 동일 smoke 2종 + SSRF sanity 1종 |
| **P4** | 배포 **후** 1~24시간 | ✅ | daemon `web_fetch.*` 로그 이상·timeout 비율 |
| **P5** | (해당 시) BYOK tool-loop | ⚠️ | aihubmix/senseaudio 에서 `web_fetch` 1회 |

**Go / No-Go:** P0~P3 전부 Pass 없이 Production 트affic 확대 금지. P4에서 rollback trigger 해당 시 [§8 롤백](#8-롤백-기준-및-조치) 실행.

---

## 1. 배포 대상 식별 (Release identity)

배포 담당자가 **증적에 반드시 기록**할 항목:

| # | 항목 | 확인 방법 | Pass 기준 |
|---|------|-----------|-----------|
| R1 | Git commit SHA | `git rev-parse HEAD` (staging→prod merge 기준) | prod 배포 이미지/번들과 일치 |
| R2 | 변경 요약 | [48-2](./48-2-웹_fetch_native_redirect_apex_www_이슈.md) · [00 누적](./00_구현_내역_누적.md) 해당 항목 | web-fetch 관련 daemon + docs 포함 여부 명시 |
| R3 | `apps/daemon/src/web-fetch/` 존재 | 배포 아티팩트 | `native-backend.ts` safe redirect hop loop |
| R4 | FE 변경 유무 | diff | web_fetch **필수 변경 없음** (선-fetch 계약 동일). FE만 따로 배포하지 않아도 됨 — **daemon과 함께 Design 스택 배포 SSOT** 따름 |

---

## 2. P0 — 배포 전 자동 검증 (로컬 / CI)

**담당:** 개발 · CI  
**시점:** prod merge / deploy 파이프라인 **직전**

### 2.1 Daemon (필수)

```bash
cd ns-open-design
pnpm --filter @open-design/daemon exec vitest run \
  tests/byok-url-tools.test.ts \
  tests/web-fetch-select.test.ts \
  tests/web-fetch-reader-backend.test.ts \
  tests/web-fetch-log.test.ts \
  tests/web-fetch-redirect.test.ts
```

| 결과 | Pass |
|------|------|
| Test files | **5 passed** |
| Tests | **33 passed** |

**커버 의미 (요약):**

- Public `fetchUrlContent` 계약 · HTML→text · SSRF(원본 URL)
- Redirect: apex→www, hop cap, metadata/loopback mid-chain 차단, https→http downgrade 거부
- Env: reader misconfig → native downgrade (코드 경로만; prod 에서 reader enable 금지)
- 로그: PII 미포함, `hops` / `error_code` bucket

### 2.2 Web FE (필수)

```bash
pnpm --filter @open-design/web exec vitest run -c vitest.config.ts \
  tests/api-web-fetch-context.test.ts
```

| 결과 | Pass |
|------|------|
| Tests | **8 passed** |

**커버 의미:** URL 추출 · `POST /api/tools/web-fetch` 호출 · `<web-fetch-context>` 렌더 · 예약 태그 중립화 · prefetch auth 격리 플래그.

### 2.3 TypeScript (권장, 배포 파이프라인에 있으면 필수)

```bash
pnpm --filter @open-design/daemon exec tsc --noEmit
```

daemon `web-fetch/*` 관련 tsc error **0**. (레포 전체 tests project 기존 drift는 **본 slice blocker 아님** — 단, 배포 job이 전체 tsc 를 gate 로 쓰면 그 job Pass 필요.)

---

## 3. P1 — 배포 전 Staging 실증 (필수)

**담당:** QA / 배포 담당  
**시점:** **Production deploy 직전** (같은 commit 또는 prod 에 올릴 staging 이미지)  
**환경:** Teamver Design **embed** (managed BYOK · API mode · deck/slide 생성 경로)

### 3.1 환경·설정 게이트

| # | 확인 | Pass |
|---|------|------|
| E1 | Staging `.env` / secret 에 `WEB_FETCH_BACKEND=reader` **없음** | ✅ |
| E2 | `WEB_FETCH_READER_*` **전부 미설정** ([48 §5.1.1](./48_웹_fetch_외부화_OpenAI_검토_ADR.md#511-정책-갱신-v12--2026-07-28)) | ✅ |
| E3 | daemon healthy · embed 로그인 세션 정상 | ✅ |

### 3.2 브라우저 E2E — Network + 결과 (필수 3케이스)

DevTools **Network** 필터: `web-fetch` (또는 `tools/web-fetch`).

| ID | 사용자 프롬프트 (예) | Network | API body | User turn / 모델 |
|----|----------------------|---------|----------|------------------|
| **S1 회귀** | `www.teamver.com 참고해서 제품 소개 슬라이드 5장` | 채팅 **전** `POST …/api/tools/web-fetch` **200** | `ok: true`, `text` 길이 **> 500** (대략) | `<web-fetch-context>` 존재 · assistant **“URL 접근 불가” 금지** |
| **S2 fix** | `neuralstudio.kr 참고해서 회사 소개 슬라이드 5장` (www **없이**) | 동일 **200** | `ok: true`, `text` **> 0** | context 본문 존재 · 슬라이드 생성 시도 |
| **S3 실패 허용** | `https://this-domain-does-not-exist-48test.invalid/` 참고 | **200** (HTTP) | `ok: false` 또는 FE failed block | **채팅 run 전체는 진행** (hard fail 아님) |

**S2 보조 (선택):** daemon 로그에 `web_fetch.backend=native … hops=1 status=ok` (apex 사이트).

### 3.3 API 직접 호출 (선택 — UI와 분리 검증)

embed 세션 쿠키 확보 후 (Network 요청 복사 권장):

```bash
curl -sS -X POST 'https://<staging-design-daemon>/api/tools/web-fetch' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <session>' \
  -d '{"url":"https://neuralstudio.kr/"}' | jq '{ok,title,textLen:(.text|length),error}'
```

Pass: `ok: true`, `textLen` > 0.

### 3.4 Staging sign-off

| 필드 | 값 |
|------|-----|
| Staging commit SHA | |
| S1 / S2 / S3 | Pass / Fail |
| 서명 (이름·날짜 KST) | |

---

## 4. P2 — Production 배포 직전 (필수)

| # | 항목 | Pass |
|---|------|------|
| D1 | Production `.env` / secret — **E1~E2 와 동일** (reader 계열 **금지**) | |
| D2 | 배포 절차 SSOT | [17 §Step 4~5](./17_Production_출시_작업_순서.md) · 팀 `deploy.sh` 관례 |
| D3 | **롤백 tag / 이전 이미지** ID 기록 ([§8](#8-롤백-기준-및-조치)) | |
| D4 | Staging **P1 sign-off** 완료 | |
| D5 | (HA) multi-node 시 **모든 daemon replica** 동일 버전 배포 계획 | |

---

## 5. P3 — Production 배포 직후 (0~15분, 필수)

**동일 브라우저 시나리오를 Production embed URL에서 반복.**

| ID | 시나리오 | Pass (S1~S2와 동일 기준) |
|----|----------|---------------------------|
| **P-S1** | `www.teamver.com` … 슬라이드 | |
| **P-S2** | `neuralstudio.kr` … (apex) | |
| **P-S3** | SSRF sanity — **직접 API만** (사용자 프롬프트 불필요) | `POST /api/tools/web-fetch` + `http://169.254.169.254/latest/meta-data/` → **실패** (`ok: false` / 400 envelope) |

**직후 확인:**

| # | 확인 | Pass |
|---|------|------|
| M1 | daemon 프로세스 crash loop **없음** | |
| M2 | 배포 직후 **5xx** spike 없음 (ALB/nginx) | |
| M3 | web-fetch 실패만으로 **전체 채팅 5xx** 발생하지 않음 | |

---

## 6. P4 — Production 배포 후 관측 (1~24시간)

### 6.1 로그 패턴 (daemon stdout / 집계)

정상:

```text
web_fetch.backend=native url_host=… duration_ms=… status=ok text_bytes=…
web_fetch.backend=native url_host=… hops=1 status=ok …   # apex 등
```

주의·조사:

| 패턴 | `error_code` | 조치 |
|------|----------------|------|
| redirect 폭주 | `redirect_max` | 특정 host 집중 여부 · abuse |
| SSRF/정책 | `redirect_blocked` | 기대 동작(공격) vs misconfig |
| 지연 | `timeout` | hop+느린 origin · 12s cap |
| reader 오세팅 | `backend=reader` 또는 reader_fallback | **즉시 env rollback native** |

**금지:** 로그에 fetch **본문·쿼리스트링·Cookie** 수동 덤프 (PII).

### 6.2 비율 가이드 (초기 baseline 없을 때)

- 배포 **첫 24h:** `status=error` 비율이 staging 대비 **급증** (+ 사용자 “URL 못 읽음” CS) → [§8](#8-롤백-기준-및-조치) 검토
- `redirect_blocked` **소량** — 정상(스캔·악성 URL)
- **`timeout` 다수** + 특정 CDN — 48-2 §7 한계, hotfix 아님

### 6.3 CS / 내부 채널

- “**www 는 되는데 apex 만**” 재발 리포트 → **즉시 P-S2 재현** + commit SHA 불일치 조사
- “**모든 URL** 실패” → env reader · daemon crash · outbound firewall

---

## 7. P5 — BYOK tool-loop (해당 프로토콜만, 권장)

Teamver managed **Anthropic API mode** 기본 경로는 **선-fetch** ([15 §0](./15_웹참조_BYOK_web_fetch_FAQ.md)).  
**SenseAudio / AIHubMix** 등 daemon **tool loop** 프로토콜을 prod 에서 켠 경우에만:

| # | 확인 | Pass |
|---|------|------|
| B1 | 모델이 `web_fetch` tool 호출 | |
| B2 | `fetchUrlContent` 동일 core 경로 (redirect 정책 공유) | |
| B3 | apex URL 1회 | ok |

미사용 프로토콜이면 **N/A** 로 sign-off.

---

## 8. 롤백 기준 및 조치

### 8.1 즉시 롤백 검토 (하나라도 해당)

1. **P-S1 또는 P-S2** prod smoke **Fail** (staging 에서 Pass였던 동일 시나리오)
2. prod 에서 **`WEB_FETCH_BACKEND=reader`** 또는 reader env 활성화
3. daemon **crash loop** · web-fetch 관련 uncaught throw (설계상 never-throw 위반)
4. `redirect_blocked` / SSRF 우회 **의심** 리포트 (보안)

### 8.2 롤백 조치 (요약)

1. **이전 daemon 이미지/번들** 로 revert deploy ([D3](#4-p2--production-배포-직전-필수) tag)
2. env 에 reader 계열 있으면 **제거** 후 daemon restart
3. P-S1~S2 재검 · incident 메모 · [00 누적](./00_구현_내역_누적.md) 항목 (선택)

**참고:** FE만 롤백해도 web_fetch 동작은 **daemon SSOT** — rollback 대상은 **daemon 포함 Design 배포 단위**.

---

## 9. 알려진 한계 (실패 ≠ 배포 버그)

Production에서 아래는 **pass/fail 게이트 실패가 아님** — [48-2 §7](./48-2-웹_fetch_native_redirect_apex_www_이슈.md#7-한계-fix-후에도-native-가-못-하는-것):

- SPA-only 본문 (JS render)
- Bot block / CAPTCHA
- 로그인 wall
- redirect **4 hop 초과** (`redirect_max`)

---

## 10. 증적 템플릿 (복사용)

```markdown
## web_fetch Production 배포 — 48-3 sign-off

- 날짜 (KST):
- Prod commit:
- 이전 rollback tag:
- P0 tests: daemon 33/33 · FE 8/8
- Staging P1: S1 ☐ S2 ☐ S3 ☐ · SHA:
- Prod P3: P-S1 ☐ P-S2 ☐ P-S3 ☐
- P4 24h 메모:
- 담당:
```

---

## 11. 관련 SSOT

| 문서 | 역할 |
|------|------|
| [48-2 RCA](./48-2-웹_fetch_native_redirect_apex_www_이슈.md) | 증상·원인·fix |
| [48-1 §3.3.1](./48-1-구현설계-webfetch-adapter.md#331-redirect-policy-2026-07-28-갱신) | redirect 정책 상세 |
| [15 FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md) · Q1b | apex vs www FAQ |
| [48 ADR §5.1.1](./48_웹_fetch_외부화_OpenAI_검토_ADR.md) | reader SaaS enable 금지 |
| [17 Production 출시](./17_Production_출시_작업_순서.md) | 인프라·storage 게이트 |
| [04 L-473](./04_구현_우선순위.md) | staging web_fetch 실증 추적 |

---

## 12. 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-07-28 15:45 | v1.0 — Production 배포 전·후 필수 체크리스트 (P0~P5, 롤백, sign-off 템플릿) |

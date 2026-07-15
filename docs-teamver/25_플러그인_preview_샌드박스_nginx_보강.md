# Design — 플러그인·deck preview 샌드박스 nginx 보강

**목적:** embed·갤러리·프로젝트 HTML preview에서 `deck-stage.js`·Google Fonts가 깨지는 문제를 **OD upstream(`apps/daemon`, `apps/web`) 수정 없이** Teamver nginx 레이어에서 해결한다.

**관련:** [10 세션·OD패치](./10_세션·OD패치_보강.md) · [13 embed 슬라이드 MVP](./13_embed_슬라이드_MVP_기능게이트.md) · [05 OD UI 재사용](./05_OD_UI_재사용_빠른출시.md) · `deploy/teamver/devops/nginx/teamver-design-plugin-preview.inc.conf`

---

## 1. 증상 (재현)

브라우저 콘솔 예:

```text
Loading the stylesheet 'https://fonts.googleapis.com/css2?...' violates CSP "style-src 'self' 'unsafe-inline'"
Loading the script 'https://stg.teamver.com/auth/signin?returnTo=...deck-stage.js' violates CSP "script-src 'self' 'unsafe-inline'"
Uncaught TypeError: document.querySLinks is not a function
```

대표 URL:

- Preview iframe: `/api/plugins/example-html-ppt-zhangzara-creative-mode/preview`
- Marketplace alias preview iframe: `/api/plugins/open-design%2Fexample-html-ppt-zhangzara-creative-mode/preview`
- 런타임 JS: `/api/plugins/.../asset/assets/deck-stage.js`
- 생성 deck: `ai-adoption-effects-deck.html` (프로젝트 산출물)

---

## 2. 원인 분석

### 2.1 OD preview CSP (의도적 — upstream)

daemon `servePluginSandboxedHtml` 은 marketplace·embed용 preview에 **§9.2 샌드박스 CSP**를 붙인다.

```text
default-src 'none';
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline';
connect-src 'none';
frame-ancestors 'self'
```

- `fonts.googleapis.com` stylesheet → **차단** (v1에서 원격 폰트 거부 — `docs/plugins-spec.md`)
- `rewritePluginAssetUrls` 는 `src`/`poster` 만 same-origin으로 바꾸고 **`href`(외부 CSS)는 유지**

### 2.2 sandbox iframe + nginx auth (Teamver 연동 부작용)

embed·갤러리 preview iframe:

```html
<iframe sandbox="allow-scripts" src="/api/plugins/:id/preview">
```

- `allow-same-origin` **없음** → 문서 effective origin 은 opaque (보안 by design, `apps/web/src/runtime/exports.ts`)
- iframe **최초 navigation**(`/preview`)은 세션 쿠키로 통과 → HTML 수신 OK
- HTML 내부 `<script src="/api/plugins/.../asset/deck-stage.js">` 는 **credentialed subresource가 아님**
- (구) nginx `@teamver_login` **302** → signin HTML이 script로 로드되어 CSP 위반
- **(현)** session-gated plugin/skills는 `@teamver_od_bff_unauthorized` **401 JSON** — SPA 상위 창이 `/api/plugins/...` returnTo 로 Main 로그인에 끌려가지 않음. 번들 `asset/` 은 세션 gate 제외.

### 2.3 `querySLinks` (콘텐츠 — 인프라로 해결 불가)

에이전트가 생성한 deck HTML 의 **JS 오타** (`querySelectorAll` 등이 정답). `deck-stage.js` 미로드 시 연쇄 실패 가능.

### 2.4 marketplace namespace alias (앱 코드)

bundled plugin 설치 id는 `example-html-ppt-...` 이지만 marketplace/share provenance에는 `open-design/example-html-ppt-...` 가 존재한다. FE가 namespaced id를 그대로 `/api/plugins/:id/preview` 에 넣거나, preview HTML 내부 asset URL이 같은 alias를 유지하면 daemon의 기존 `getInstalledPlugin(id)` 완전 일치 lookup이 실패한다.

2026-07-03 코드 보강:

- FE: plugin preview URL/fetch helper는 `manifest.name` 우선, namespaced id는 마지막 segment로 정규화.
- daemon: `/preview`, `/example/:name`, `/asset/*` 모두 direct id → normalized id → `source_marketplace_entry_name` 순으로 resolve.
- 회귀: `open-design/<id>` alias로 preview/example/asset이 모두 열리는 vitest 추가.

---

## 3. 수정 방향 검토

| 방안 | OD 수정 | 효과 | 판정 |
|------|---------|------|------|
| **A. nginx: plugin `asset/` 세션 gate 제외** | 없음 | `deck-stage.js` 즉시 복구 | **채택 (P0)** |
| **B. nginx: plugin preview CSP 헤더 교체** | 없음 | Google Fonts 복구 | **채택 (P0)** |
| C. `sandbox` + `allow-same-origin` | `PluginDetailView`, `srcdoc.ts` 등 | 근본 해결에 가깝지만 보안 모델 변경 | **비채택** |
| D. daemon CSP·font rewrite | `server.ts` | upstream drift | **비채택** |
| E. `@teamver_login` → 401 JSON만 | nginx | subresource 여전히 401 | **불충분** |
| F. 에이전트 가이드 (폰트·DOM API) | 없음 | `querySLinks` 재발 방지 | **채택 (P1, 문서)** |

**결론:** Teamver fork-native 인 **`deploy/teamver/devops/nginx/`** 만 변경. OD upstream 이슈는 별도 추적(deck-stage inline 번들, font self-host).

---

## 4. 구현 (nginx)

### 4.1 include 파일

`deploy/teamver/devops/nginx/teamver-design-plugin-preview.inc.conf`

`stg-design.teamver.com` / `design.teamver.com` server 블록에서 `location /api/` **앞에** include.

| location | auth_request | CSP |
|----------|--------------|-----|
| `/api/plugins/` → nested `~ /asset/` | **없음** (GET/HEAD only) | Teamver embed CSP (fonts 허용) |
| `/api/plugins/` → nested `~ /(preview\|example)/` | **유지** | 동일 CSP 교체 |
| `/api/plugins/` → nested catch-all `~ ^/api/plugins/` | **유지** (apply·metadata 등) | daemon 기본 |
| `/api/skills/` → nested `~ /assets/` | **없음** (GET/HEAD only) | daemon 기본 |

**parent `location /api/plugins/` 에는 `auth_request` 없음** — nginx nested 상속으로 asset이 다시 signin 302를 받는 것을 방지.

daemon upstream: `127.0.0.1:7456` (loopback 고정 — staging/prod 공통).

`Authorization: Bearer $teamver_od_api_token` 은 **유지** (nginx→daemon M2M). 사용자 세션만 asset 경로에서 생략.

### 4.2 Teamver embed CSP (nginx가 덮어쓰는 값)

OD §9.2 대비 **추가 허용만** (connect-src 등 나머지 동일):

```text
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
```

전체:

```text
default-src 'none'; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'
```

### 4.3 보안 trade-off

| 항목 | 내용 |
|------|------|
| **노출 범위** | 설치된 플러그인·스킬의 **번들 정적 파일** (마켓플레이스 예시와 동일) |
| **미포함** | `/api/projects/*`, `/api/plugins/events`, apply/chat 등 |
| **메서드** | asset 경로 `limit_except GET HEAD { deny all; }` |
| **리스크** | 플러그인 ID 알면 JS/CSS 다운로드 가능 — 사용자 프로젝트·tenant 데이터 아님 |
| **완화** | design 호스트는 여전히 사이트 로그인 뒤; 필요 시 rate limit 추가 가능 |

preview/example HTML 은 **세션 gate 유지** — 미인증 브라우저 navigation 은 기존과 같이 302 signin.

---

## 5. 에이전트·운영 가이드 (P1)

nginx만으로 해결되지 않는 항목:

1. **DOM API:** `querySelector` / `querySelectorAll` 만 사용 — `querySLinks` 등 비표준 이름 금지.
2. **폰트 (CSP 완화 없는 환경 대비):** system font stack 권장.
3. **deck 런타임:** `<script src="assets/deck-stage.js">` 유지 (nginx 적용 후 `/api/plugins/.../asset/...` 로 rewrite 됨).
4. **재생성:** 이미 깨진 `ai-adoption-effects-deck.html` 은 채팅으로 해당 줄 수정 또는 deck 재생성.

---

## 6. 검증

### 6.1 로컬 (conf 정합)

```bash
bash deploy/teamver/scripts/test_teamver_design_plugin_preview_nginx.sh
```

### 6.2 Staging E2E (P-1)

`run_staging_track_a_e2e.sh` — **쿠키 없이** plugin asset URL 이 200/404(플러그인 미설치) 이고 **302 signin 아님** 확인.

```bash
# 수동 (staging VM 또는 VPN)
curl -sSI "https://stg-design.teamver.com/api/plugins/example-html-ppt-zhangzara-creative-mode/asset/assets/deck-stage.js" | head -15
# 기대: HTTP/2 200, Content-Type: application/javascript, Content-Security-Policy에 fonts.googleapis.com
# 비기대: Location: https://stg.teamver.com/auth/signin
```

### 6.3 브라우저

1. embed 로그인 → 슬라이드 deck preview 열기
2. 콘솔에 CSP·signin script 에러 없음
3. 화살표 키·deck-stage 네비 동작

### 6.4 nginx 적용

**작업 디렉터리:** Design Staging EC2에서는 보통 `deploy/teamver` 루트입니다  
(예: `~/neural/ns-open-design/deploy/teamver` 또는 `/opt/teamver-design`).  
이미 그 안에 있다면 `deploy/teamver`를 **한 번 더 붙이지 마세요.**

```bash
# 1) 최신 conf 반영 (include + stg https conf 가 레포에 있어야 함)
cd ~/neural/ns-open-design   # clone 경로에 맞게
git pull origin staging

# 2) deploy/teamver 에서 nginx 적용
cd deploy/teamver/devops/nginx
sudo bash ./apply_teamver_design_staging_nginx_conf.sh ./stg-design.teamver.com.https.conf \
  --disable stg-design.teamver.com.http.conf

# 3) 적용 확인 (VM에서)
cd ../..
bash scripts/check_plugin_preview_nginx_applied.sh --staging --curl
```

`deploy/teamver`에 이미 있을 때 한 줄 apply:

```bash
sudo bash devops/nginx/apply_teamver_design_staging_nginx_conf.sh \
  devops/nginx/stg-design.teamver.com.https.conf \
  --disable stg-design.teamver.com.http.conf
```

### 6.5 트러블슈팅 — curl 이 여전히 302 signin

| 확인 | 명령 |
|------|------|
| main conf에 include 있는지 | `grep plugin-preview /etc/nginx/sites-enabled/stg-design.teamver.com.https.conf` |
| inc 파일 복사됐는지 | `ls -l /etc/nginx/sites-available/teamver-design-plugin-preview.inc.conf` |
| nginx 런타임에 반영됐는지 | `sudo nginx -T 2>/dev/null \| grep -A2 'location /api/plugins/'` |
| 종합 | `bash scripts/check_plugin_preview_nginx_applied.sh --staging --curl` |

302가 나오면 대부분 **git pull 없이 apply** 했거나, **include 파일이 sites-available에 없음** (apply 스크립트가 `teamver-design*.inc.conf` 를 복사함).

상세 runbook: `deploy/teamver/devops/nginx/README.md` §3.

---

## 7. upstream OD (별도 트랙 — Teamver 블로커 아님)

| 항목 | 설명 |
|------|------|
| preview 시 `deck-stage.js` inline 번들 | subresource·CSP 이슈 원천 제거 |
| `rewritePluginAssetUrls` 에 font self-host | Google Fonts 의존 제거 |
| sandbox + same-origin asset only | 정교하지만 OD 보안 설계 변경 |

---

## 8. TODO / 후속

| ID | 작업 | 상태 |
|----|------|------|
| P-1 | nginx include + 4 conf include | ✅ 코드 |
| P-2 | `test_teamver_design_plugin_preview_nginx.sh` | ✅ 코드 |
| P-3 | staging E2E P-1 probe (`TEAMVER_E2E_PLUGIN_PREVIEW=1`) | ✅ 코드 |
| P-4 | staging VM nginx reload | ☐ ops |
| P-5 | embed deck 생성 SKILL 체크리스트 (`docs-teamver/13`) | ☐ 문서 |
| P-6 | `TEAMVER_E2E_PLUGIN_PREVIEW=1` staging cron | ☐ ops |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-25 | 초안 — 원인·방향·nginx SSOT |

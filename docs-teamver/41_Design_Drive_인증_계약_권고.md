# Design Drive 인증 계약 — 문제 · 선택지 · 권고 (41)

**목적:** Design embed가 Main Drive(`/api/drive/*`, `/api/v2/shared-drive/*`, `/api/asset/*`)를 호출할 때 **어떤 토큰을 쓸 것인가**를 SSOT로 고정한다.  
**상태:** 2026-07-14 권고 확정 · Design 측 **SSO 쿠키 forwarding** 이미 staging 반영 (`1a92b4163`)  
**관련:** [39_10 §8](./39_10_HA_세션쿠키_경합_해결.md) · [22 §3.2g](./22_Drive_인증_Usage_연동_검토.md) · [10 §0](./10_세션·OD패치_보강.md) · Main 설계 [15_2 Apps JWT](../../ns-teamver-planning/개발설계/15_2_Apps_JWT_구현요구사항_Main_Apps_BE.md)

---

## 0. TL;DR — 권고

| 항목 | 내용 |
|------|------|
| **지금 권고 (SSOT)** | Design BFF는 Main Drive/Asset 호출 시 **브라우저의 `teamver_access_token`(HS256 platform JWT, parent-domain SSO)** 를 Bearer로 **forwarding**한다. |
| **하지 말 것** | Apps RS256 JWT를 `/api/drive/*`에 붙이기 · Design이 Main `JWT_SECRET`으로 HS256을 위조 · 두 알고리즘을 “하나로 통일”하려 HS256 secret을 Apps와 공유 |
| **나중에 (조건부)** | Main이 Drive/Asset에 **RS256 Apps JWT 수용(dual-auth)** 을 열면, Design은 BFF Apps JWT만으로 통일 가능. **트리거가 올 때까지 기다린다.** |
| **왜 이게 가장 효율적인가** | Main 변경 0 · 기존 SSO·Mail/메인 FE와 동일 계약 · 보안 경계(15_2 secret 공유 금지) 유지 · 이미 배포·검증됨 |

한 줄:

> **알고리즘을 같게 만들 문제가 아니라, “어느 라우트에 어느 토큰 패밀리”를 맞출 문제다.**  
> Drive는 Main 사용자 REST → **platform HS256**. Apps 내부 bootstrap → **Apps RS256**. Design이 Drive를 proxy할 때는 **이미 브라우저에 있는 platform 쿠키를 쓰라.**

---

## 1. 문제 상황 (무엇이 깨졌는가)

### 1.1 운영에서 관측된 패턴

```text
POST /teamver-bff/auth/refresh
  → 200 {"status":"ok","authenticated":true}

GET  /teamver-bff/drive/api/drive/folder?shallow_tree=true
  → 401 {"detail":"session_expired","login_url":"https://stg.teamver.com/auth/signin?..."}

GET  /teamver-bff/drive/api/v2/shared-drive
  → 401 {"detail":"session_expired",...}
```

- 재로그인 직후에도 동일.
- BFF 세션·Apps refresh는 “정상”. Drive만 401.
- HA Set-Cookie 경합([39_10](./39_10_HA_세션쿠키_경합_해결.md) §1~§7)을 고쳐도 **이 패턴은 남았다.**

### 1.2 호출 경로 (loop 394 이후)

```text
Browser (stg-design.teamver.com)
  └─ GET /teamver-bff/drive/api/drive/folder
       └─ nginx → design-api /api/v1/drive/...
            └─ (과거) Authorization: Bearer <BFF Apps RS256 JWT>
                 └─ Main GET /api/drive/folder
                      └─ JWTService.get_current_user → HS256 only
                           └─ 401 {"detail":"Invalid token"}
                                └─ Design이 session_expired로 매핑
```

### 1.3 Main이 실제로 받는 것

| Main 라우트 | Dependency | 허용 토큰 |
|-------------|------------|-----------|
| `/api/drive/*` | `JWTService.get_current_user` | **HS256 platform JWT만** |
| `/api/v2/shared-drive/*` | 동일 | **HS256만** |
| `/api/asset/upload-request`, `/upload-confirm` | 동일 | **HS256만** |
| `/internal/apps/{app_key}/*` | `require_internal_apps_token_user_in_db` | HS256 **또는** RS256 Apps JWT (`aud` 일치) |
| `/api/apps/auth/exchange`, `/refresh` | Internal API key M2M | 서버간 |

BFF session에 들어 있는 access_token은 M12 exchange가 준 **RS256 Apps JWT** (`aud=teamver-design`).  
이는 **`/internal/apps/*` 전용**이다. Drive 사용자 REST에는 **처음부터 맞지 않았다.**

### 1.4 왜 “이중화 이후부터”처럼 보였는가

| 층 | 실제 역할 | 문서 |
|----|-----------|------|
| A. HA stale Set-Cookie | BFF refresh 쿠키 롤백 → 간헐적·병렬 폭주 | [39_10](./39_10_HA_세션쿠키_경합_해결.md) §1~§7 |
| B. **토큰 패밀리 불일치** | Apps JWT → Drive HS256 전용 라우트 → **상시 Invalid token** | **본 문서** / 39_10 §8 |

B는 loop 394(Drive BFF proxy 도입)부터 존재했다. 단일 노드·저부하에서는 다른 recovery·타이밍에 가려지고, HA + Drive 모달 병렬 호출로 **재현율이 100%에 가까워진 것**이다. A를 고쳐도 B가 남으면 refresh 200 + Drive 401이 남는다.

---

## 2. 왜 애초에 HS256과 RS256을 나눴는가

### 2.1 설계 의도 (15_2)

[15_2](../../ns-teamver-planning/개발설계/15_2_Apps_JWT_구현요구사항_Main_Apps_BE.md) 한 줄:

> Main만 private key로 서명. Apps BE는 JWKS **공개키로만 검증**. **secret 공유 금지.**

| | Platform JWT (현재 HS256) | Apps JWT (RS256) |
|--|---------------------------|------------------|
| 발급 | Main IdP (`/api/auth/*`, login cookie) | Main M12 exchange / apps token API |
| 용도 | `teamver.com` FE · Drive · 채팅 등 **메인 사용자 REST** | Design/Mail/Slides 등 **앱 Resource Server** · `/internal/apps/*` |
| 검증 | `JWT_SECRET_KEY` (대칭) | JWKS public (비대칭) |
| 위조 권한 | secret을 가진 주체 = 위조 가능 | private key는 **Main only** |

Apps BE(N개)가 Main의 `JWT_SECRET`을 공유하면:

- 앱 하나 침해 → Main 전체 계정 토큰 위조
- 신뢰 경계·감사·키 rotation이 붕괴

그래서 **알고리즘을 “같게” 만드는 통일(둘 다 HS256)은 목표가 아니다.**  
통일의 올바른 방향은 **둘 다 RS256이되 aud를 나누는 것**(Main `aud=teamver-main`, App `aud=teamver-design`)이며, Main platform 토큰의 RS256 전환은 **별도 플랫폼 로드맵**이다(15_2 Target).

### 2.2 Drive가 어느 쪽에 속하는가

Drive는 **메인 제품 API**이지 Apps 내부 bootstrap API가 아니다.

- Main FE(`stg.teamver.com`)가 `/api/drive/*`를 부를 때 쓰는 것 = platform 세션(HS256 cookie/Bearer).
- Apps BE가 부를 권한이 원래 열려 있던 곳 = `/internal/apps/{app_key}/bootstrap` 등.
- Design이 CORS·same-origin 때문에 Drive를 **BFF proxy**로 감싼 순간, “브라우저→Main 직접” 전제가 깨졌고, proxy가 **잘못된 토큰 패밀리**(Apps JWT)를 붙인 것이 버그다.

---

## 3. 선택지 비교

| ID | 방안 | Main 변경 | Design 변경 | 보안 | 효율 | 비고 |
|----|------|-----------|-------------|------|------|------|
| **A** | Design이 Main SSO 쿠키(`teamver_access_token`)를 Drive/Asset에 **forward** | 없음 | 이미 반영 | ✅ 기존 SSO 계약 | **최고** | `*.teamver.com` 전제 |
| **B** | Main Drive/Asset이 **RS256 Apps JWT도 수용**(dual-auth) | **필수** | 이후 단순화 | 가능(aud/scope 필수) | 중기 | Apps BE self-contained |
| **C** | Design·Main 모두 HS256 secret 공유 | 회귀 | — | ❌ **금지** | — | 15_2 위반 |
| **D** | Design이 Apps JWT로 Main HS256을 재발급 | secret 공유 필요 | — | ❌ **금지** | — | Design이 IdP가 됨 |
| **E** | Drive를 FE에서 다시 cross-origin 직접 호출 | 없음 | 되돌림 | ✅ | 나쁨 | CORS·cookie 이슈로 loop 394에서 포기한 경로 |

### 3.1 A — SSO 쿠키 forwarding (현재·권고)

```text
Browser cookies:
  teamver_access_token          ← Main HS256, Domain=.teamver.com
  teamver_design_bff_session    ← Design BFF (Apps RS256 inside)

Drive request:
  FE → /teamver-bff/drive/... (credentials include)
  nginx → design-api (Cookie 통째 전달)
  design-api → Main /api/drive/...
       Authorization: Bearer <teamver_access_token 값>
```

**장점**

- Main 배포·정책 변경 없음 → **가장 빠르게·싸게** 복구.
- Main FE / Plan B SSO / Mail cold-start 전제와 **동일 계약**.
- Apps RS256 신뢰 경계 유지.
- HA cookie race와 축이 분리됨(Drive는 BFF Set-Cookie에 덜 묶임).

**단점 / 전제**

- `AUTH_COOKIE_ENABLED` + `AUTH_COOKIE_DOMAIN=.teamver.com` + Design host가 자식 서브도메인.
- Main SSO 쿠키가 없으면 Drive는 즉시 `session_expired`(재로그인) — **의도된 실패**.
- 서버 단독(브라우저 없는) 잡이 Drive를 호출하려면 부족 → 그때 B 또는 M2M.

### 3.2 B — Main dual-auth (중기 후보)

`JWTService.get_current_user`(또는 Drive 전용 dependency)가:

1. HS256 platform 검증 시도  
2. 실패 시 RS256 Apps JWT + `aud ∈ {teamver-design, …}` + (권장) Drive 관련 scope  

**장점**

- Design BFF가 **Apps JWT만**으로 Drive까지 self-contained.
- parent-domain cookie 의존 감소(타 도메인 Apps·백그라운드에 유리).

**단점**

- Main BE 변경·회귀·정책(어느 aud/scope가 Drive write를 허용하는지) 필요.
- Apps JWT TTL이 짧아 Drive 장시간 작업 시 refresh 정책이 더 중요해짐.
- **지금 당장 쓰지 않아도 A로 출시·운영 가능.**

**권장 트리거 (이 중 하나일 때만 B를 kick-off)**

1. Design(또는 타 Apps)이 `*.teamver.com` **밖**에서 Drive를 써야 함.  
2. 브라우저 없이 Design 서버가 Drive를 호출해야 함(배치·워커).  
3. 플랫폼이 Main access를 RS256 `aud=teamver-main`으로 전환해 **cookie 경로를 폐기**하려는 일정과 맞춤.  
4. Slides/Docs 등 **여러 Apps**가 동일하게 “BFF→Drive”를 해야 하고 Main 한 번 확장으로 끝내는 게 싸다는 합의.

### 3.3 C·D — 금지

Secret 공유 / Apps가 platform JWT 위조 = 15_2 L4·M9 위반. **후보에서 제외.**

---

## 4. 권고 결정

### 4.1 지금 (staging/production · Design)

**방안 A를 SSOT로 유지·운영한다.**

1. Drive browse proxy(`routers/drive.py`): Main SSO 쿠키 우선 → 없을 때만 BFF Apps JWT 폴백(폴백은 로컬/오구성용, hosted에서는 보통 401).
2. Drive publish/import(`routers/projects.py`): 동일.
3. Main HS256 401(auth-shaped) → **Apps refresh로 복구하지 않음** → `main_sso_required` + `re_login_scope=main` + Main `login_url`. 쿠키 user ≠ Design user → `main_sso_user_mismatch` (proxy 전).
4. HA BFF Set-Cookie 정책([39_10](./39_10_HA_세션쿠키_경합_해결.md) §1~§7)은 **BFF 세션 경로**용으로 계속 유지.

### 4.2 중기 (플랫폼 합의 후)

트리거(§3.2)가 오면 **방안 B**를 Main 팀과 스펙화:

- dependency: HS256 실패 시 `verify_apps_access_token(expected_aud=…)`  
- allowlist: Design Drive proxy가 쓰는 path prefix만 dual-auth  
- scope: 최소 `drive.read` / `drive.write` (Registry와 정합)  
- Design: dual-auth 배포 확인 후 `_resolve_drive_*`에서 Apps JWT 우선으로 단순화 가능

### 4.3 “통일이 더 낫지 않나?”에 대한 답

| 질문 | 답 |
|------|-----|
| 알고리즘을 하나로? | **Secret 공유 HS256 통일은 더 나쁨.** Target은 **둘 다 RS256 + aud 분리**(Main 로드맵). |
| 지금 Drive만 RS256으로 맞출까? | Main 작업 비용 대비, Design은 이미 `.teamver.com` SSO가 있으므로 **A가 ROI 최대**. |
| A가 “임시 땜빵”인가? | **아님.** parent-domain SSO는 Plan B/메인 FE의 **정식 계약**. Drive는 그 계약 위의 사용자 API. A는 계약을 되돌린 것. |
| BFF만으로 전부 갈까? | bootstrap·workspace는 Apps JWT. Drive는 platform JWT. **역할이 다른 두 API면 토큰 두 종류가 정상.** |

---

## 5. Design 구현 요약 (As-Is)

| 파일 | 역할 |
|------|------|
| `deploy/teamver/be/app/routers/drive.py` | `_read_main_sso_cookie` · `_resolve_drive_access_token` → `(token, source)` · main_cookie 401은 Apps refresh 스킵 |
| `deploy/teamver/be/app/routers/projects.py` | publish/import mutation도 Main SSO 쿠키 우선 |
| nginx `teamver-design-od-bff.inc.conf` | `/teamver-bff/drive/`에 `Cookie $http_cookie` (유지) |
| 테스트 | `tests/test_drive_router.py`, `tests/test_projects_publish_router.py` |

쿠키명: Main `AUTH_COOKIE_NAME` 기본 `teamver_access_token` · Design `TEAMVER_AUTH_COOKIE_NAME` 동일.

---

## 6. 운영 체크리스트

### 6.1 배포 전·후

1. Main staging/prod: `AUTH_COOKIE_ENABLED=1`, `AUTH_COOKIE_DOMAIN=.teamver.com`, `AUTH_COOKIE_NAME=teamver_access_token`.
2. Design host = `*.teamver.com` (stg-design / design).
3. 로그인 후 DevTools → Cookies에 Domain=`.teamver.com` 인 `teamver_access_token` 존재.
4. Network: Drive folder/shared-drive **200**. `/auth/refresh`와 독립적으로 성공해야 함.
5. Main SSO 쿠키만 지우고 Drive 호출 → `main_sso_required` + `re_login_scope=main` + `login_url` (정상; Apps refresh 금지).
6. Main SSO 쿠키 user ≠ Design 세션 user → `main_sso_user_mismatch` → FE 자동 재바인딩 (41 §6.3).

### 6.2 여전히 401이면

| 확인 | 의미 |
|------|------|
| Cookie에 `teamver_access_token` 없음 | Main 로그인/쿠키 설정 문제 → Design 코드가 아님 |
| 쿠키는 있는데 Drive 401 | Main이 해당 JWT를 거절(만료·secret·도메인). Main `/api/drive/folder`를 **같은 Bearer로 직접** curl |
| `/auth/refresh`만 200 | **정상 동작과 충돌하지 않음** — refresh는 Apps JWT, Drive는 platform JWT |
| Set-Cookie 경합 의심 | [39_10 §5](./39_10_HA_세션쿠키_경합_해결.md) — BFF 경로용 |
| Drive **403** `error.forbidden` + Design은 정상 | Main SSO 쿠키 `user_id` ≠ Design BFF 세션 사용자. 다른 탭에서 Main에 다른 계정으로 로그인한 경우. BFF는 proxy 전에 `main_sso_user_mismatch`로 차단한다. |

### 6.3 Main SSO ↔ Design 계정 불일치 (`main_sso_user_mismatch`)

**증상 (수정 전):** Design 세션·워크스페이스는 정상인데 `GET …/drive/api/v2/shared-drive`만 Main `{"message":"error.forbidden"}` 403.

**원인:** 브라우저에 `teamver_access_token`(Main HS256)과 `teamver_design_bff_session`이 **서로 다른 Teamver 사용자**를 가리킴. Drive proxy는 Main 쿠키를 Bearer로 보내고 `X-Workspace-Id`는 Design 세션 워크스페이스를 쓰므로, Main ACL이 “그 사용자는 이 워크스페이스 멤버가 아님”으로 거절한다.

**계약 (수정 후):**

| 측 | 동작 |
|----|------|
| BFF Drive / publish / canvas | Main 쿠키 JWT의 `user_id`가 디코드되고 Design `auth.user_id`와 다르면 **proxy 전에** `401` `{ detail/code: main_sso_user_mismatch, re_login_scope: "main", login_url }` (`UnauthorizedError`도 exception handler가 동일 Drive형 body로 변환) |
| FE | **자동 복구**: Main logout + Design cold start(returnTo 유지). 사용자에게 “계정 불일치” 문구·수동 재로그인 CTA를 노출하지 않음. Apps `/auth/refresh` 금지. |
| 디코드 불가 opaque 쿠키 | mismatch로 오판하지 않음 → 기존 Main 401/`main_sso_required` 경로 |

**사용자 경험:** Drive 호출 중 mismatch면 「로그인 상태를 맞추고 있습니다. 잠시만 기다려 주세요.」 loading toast 후 Main 로그인/콜백으로 돌아와 **한 계정으로 세션이 맞춰진 뒤** 원래 화면으로 복귀한다. (갑작스런 새로고침처럼 보이지 않게 안내)

**예방 로드맵:** 위는 “발생 후 복구(Stage 0)”이다. 발생 창을 줄이는 Stage 1–4(exchange 시 `pin_main_user_id`, FE 선제 사용자 비교, 크로스탭 브로드캐스트, Main Drive dual-auth)는 [45 Main SSO ↔ Design BFF 계정 불일치 예방 로드맵](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md) 참고.

---

## 7. FAQ

**Q. Mail은 어떻게 하나?**  
Mail BFF도 Apps RS256 + parent-domain SSO 구조를 쓴다. Mail이 Main Drive 사용자 REST를 Design처럼 proxy하지 않는 한 동일 함정은 없다. 같은 proxy를 만들면 **A를 재사용**한다.

**Q. Apps JWT에 Drive scope를 넣으면?**  
scope만으로는 Main `/api/drive`가 Apps JWT를 받지 않는다. **dependency 변경(B)** 이 선행돼야 한다.

**Q. HA와 이 문서의 관계는?**  
HA는 BFF cookie 오염. 본 문서는 **토큰 패밀리 매핑**. 둘 다 고쳤어야 Drive가 안정이다. 진단 순서: **본 문서(토큰) → 39_10(쿠키 경합)**.

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-21 | `main_sso_user_mismatch`: Main SSO 쿠키 user ≠ Design BFF user 시 proxy 전 401 + FE 자동 재바인딩(Main logout + cold start). opaque 쿠키는 false-positive 없음. |
| 2026-07-14 | 문서 신설. 권고 = 방안 A(SSO forwarding). B는 조건부 중기. C·D 금지. Design 구현 `1a92b4163`. |

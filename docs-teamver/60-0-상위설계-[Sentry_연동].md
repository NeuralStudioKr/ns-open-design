# 60-0 상위설계 — Teamver Design Sentry 연동

**작성:** 2026-08-07  
**브랜치:** `feat/teamver-design-sentry` (base: `staging`)  
**조직:** [neuralstudio](https://neuralstudio.sentry.io)  
**정책 SSOT:** `ns-teamver-fe-v2/docs_all/136_Sentry_Slack알림_중요도_제외정책.md` · 가이드 `135_Sentry_에러모니터링_가이드.md`

---

## 1. 문제

Teamver Apps가 띄우는 **AI Design**(`stg-design` / `design.teamver.com`)은 `ns-open-design` Track A(OD `apps/web` + `deploy/teamver` design-api)인데, Main Web/BE/Mobile/Desktop과 달리 **Sentry 프로젝트·알림·SDK 연동이 없다.** 운영 장애를 Slack/이메일로 받지 못한다.

## 2. 범위

| 포함 | 제외 (후속) |
|------|-------------|
| Sentry 프로젝트 생성 (FE·API) | OD daemon 전용 프로젝트 (필요 시 별도) |
| 이메일 + Slack Issue Alert (stg/prod) | Session Replay·대량 tracing 튜닝 |
| env/DSN 계약·문서 | sourcemap CI 토큰 배포 (연결 구현 단계에서) |
| 코드 SDK 연결 (`apps/web`, `deploy/teamver/be`) | upstream OD main 전체 merge |

## 3. 접근

1. **프로젝트 분리** — 기존 Teamver 관례와 동일하게 플랫폼별 프로젝트.
2. **알림 복제** — `teamver-web`의 `Notify Slack — production|staging` + High priority **email** 규칙을 Design에 복제 (136 필터 포함).
3. **코드** — FE `@sentry/nextjs`, API `sentry-sdk` FastAPI. DSN은 env만 (시크릿은 EC2 `.env` / CI).
4. **브랜치** — `staging`에서 `feat/teamver-design-sentry` 분기 후 SDK·문서만 올리고 검증 뒤 staging merge.

## 4. 터치 포인트 (예정)

| 영역 | 경로 |
|------|------|
| FE init | `apps/web` — instrumentation / `withSentryConfig` / embed `environment` |
| API init | `deploy/teamver/be` — `sentry_sdk.init` + before_send |
| env | `deploy/teamver/.env.*.example`, compose/nginx 문서 |
| 문서 | `docs-teamver/60-*`, `00_구현_내역_누적.md`, (선택) fe-v2 `135` 표 갱신 |

## 5. 리스크

| 리스크 | 완화 |
|--------|------|
| embed Cookie SSO·auth noise → Slack 폭주 | 136 message `nc` 필터 + 코드 beforeSend (Main과 동형) |
| static export / OD 빌드 모드와 Next Sentry 충돌 | `OD_WEB_OUTPUT_MODE` 분기·Teamver 서버 빌드 경로만 활성화 |
| DSN 유출 | public DSN은 FE에 가능하나 Auth Token은 CI/호스트만 |
| staging↔prod env 오분류 | `SENTRY_ENVIRONMENT` / 호스트 추론 (`stg-design`→staging) |

## 6. 검증

- [ ] Sentry UI에 `teamver-design` · `teamver-design-api` 존재
- [ ] Alert: email + Slack stg/prod 각 프로젝트에 존재
- [ ] (코드 연결 후) FE/API debug 엔드포인트 → Issue 생성
- [ ] staging Issue → `#teamver-error-staging`, production → `#teamver-error`
- [ ] ActiveMembers 이메일 수신 (High priority)

## 7. 결정 요약 (본 단계)

| 항목 | 값 |
|------|-----|
| Org | `neuralstudio` |
| FE project | `teamver-design` (`javascript-nextjs`) |
| API project | `teamver-design-api` (`python-fastapi`) |
| Slack prod | `#teamver-error` (`C0B3XFXD64W`) |
| Slack stg | `#teamver-error-staging` (`C0BN6JPP527`) |
| Email | High priority → IssueOwners → ActiveMembers fallthrough |

# 60-2 구현설계 — Sentry SDK 코드 연결

**상위설계:** [60-0](./60-0-상위설계-[Sentry_연동].md)  
**선행:** [60-1 현황](./60-1-구현현황-[Sentry_프로젝트_알림].md) (프로젝트·알림 완료)  
**작성:** 2026-08-07  
**상태:** 대기 (브랜치 `feat/teamver-design-sentry`)

## 1. 범위

| 대상 | SDK | 프로젝트 slug |
|------|-----|---------------|
| `apps/web` | `@sentry/nextjs` | `teamver-design` |
| `deploy/teamver/be` | `sentry-sdk[fastapi]` | `teamver-design-api` |

## 2. FE (`apps/web`)

- **SDK:** `@sentry/react` (Docker static export — `@sentry/nextjs`/SSR 경로 비사용)
- `src/teamver/sentry/*` — environment · eventFilters · initClient · TeamverSentryBootstrap
- `app/layout.tsx` bootstrap + `global-error.tsx` `captureException`
- `environment`: `NEXT_PUBLIC_SENTRY_ENVIRONMENT` → `VITE_TEAMVER_SITE_URL` → hostname
- `beforeSend`: 136 Exclude (auth/network)
- Bake: `NEXT_PUBLIC_SENTRY_*` via `deploy/Dockerfile` ARG + compose build args

## 3. API (`deploy/teamver/be`)

- 앱 기동 최상단 `sentry_sdk.init(dsn=..., environment=..., before_send=...)`
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`
- `GET /sentry-debug` (ZeroDivision) — 인증 게이트 밖 또는 admin only 정책 결정
- Main BE `_sentry_before_send` 동형 필터

## 4. env 예시

`deploy/teamver/.env.staging.example` / `.env.production.example`:

```bash
# Sentry
SENTRY_DSN=           # design-api
SENTRY_ENVIRONMENT=staging  # or production
NEXT_PUBLIC_SENTRY_DSN=     # FE (build-time)
NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging
# SENTRY_AUTH_TOKEN=  # sourcemap upload only (CI/host)
```

## 5. 검증

- staging 배포 후 의도적 에러 → Issue `environment:staging` → `#teamver-error-staging`
- production 동일 → `#teamver-error` + 이메일
- Exclude 메시지(Invalid credentials 등) → Slack 미발화

## 6. 리스크

- OD static export 기본 빌드와 wizard 설정 충돌 → Teamver Docker/compose 빌드 플래그로 가드
- embed 청크 로드 실패 노이즈 → sample rate·필터 조정

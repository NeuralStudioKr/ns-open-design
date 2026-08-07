# 60-2 구현현황 — Sentry SDK 코드 연결

**설계:** [60-2-구현설계-[Sentry_SDK_코드연결].md](./60-2-구현설계-[Sentry_SDK_코드연결].md)  
**브랜치:** `feat/teamver-design-sentry`  
**갱신:** 2026-08-07

## 진행

| 항목 | 상태 | 메모 |
|------|------|------|
| FE `@sentry/react` | ✅ | static export → Next SDK 대신 React browser SDK |
| `TeamverSentryBootstrap` + global-error capture | ✅ | layout mount |
| env / filters / environment helper | ✅ | 136 Exclude 동형 |
| FE unit test | ✅ | `tests/teamver/sentry-filters.test.ts` 5 pass |
| API `sentry_sdk` | ✅ | `app/sentry_init.py` + main 최상단 init |
| `GET /api/sentry-debug` | ✅ | nginx localhost-only |
| env examples · compose build args | ✅ | stg/prod |
| API unit test | ✅ | `tests/test_sentry_init.py` 5 pass |
| staging 재빌드·실수신 | ⏳ | 배포 후 Issue → Slack |

## 결정

- Design FE는 Docker **static export** (`apps/web/out`) 이므로 `@sentry/nextjs` / `withSentryConfig` 대신 **`@sentry/react`** 사용.
- DSN 기본값을 코드에 둠(Main BE와 동일 패턴). hosted는 env로 override.

## 배포 후 검증

```bash
# EC2
curl -sS http://127.0.0.1:16000/api/sentry-debug   # → 500 + Sentry Issue (teamver-design-api)
# FE: 브라우저에서 의도적 throw 또는 global-error 유도 → teamver-design
```

- staging Issue → `#teamver-error-staging`
- production Issue → `#teamver-error` + email

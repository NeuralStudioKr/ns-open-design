# 60-2 구현현황 — Sentry SDK 코드 연결

**설계:** [60-2-구현설계-[Sentry_SDK_코드연결].md](./60-2-구현설계-[Sentry_SDK_코드연결].md)  
**브랜치:** `feat/teamver-design-sentry`

## 진행

| 항목 | 상태 | 메모 |
|------|------|------|
| FE `@sentry/nextjs` | ⏳ | 미착수 |
| API `sentry_sdk` | ⏳ | 미착수 |
| env example | ⏳ | |
| Exclude beforeSend | ⏳ | |
| 실수신 검증 | ⏳ | 프로젝트·Rule은 60-1 완료 |

## 다음 액션

1. FE instrumentation + `withSentryConfig` (export 모드 가드)
2. design-api init + `/sentry-debug`
3. staging `.env`에 DSN 주입 후 smoke

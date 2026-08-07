# 60-1 구현현황 — Sentry 프로젝트·이메일·Slack 알림

**설계:** [60-1-구현설계-[Sentry_프로젝트_알림].md](./60-1-구현설계-[Sentry_프로젝트_알림].md)  
**완료일:** 2026-08-07  
**브랜치:** `feat/teamver-design-sentry`

## 진행

| 항목 | 상태 | 메모 |
|------|------|------|
| `teamver-design` 생성 | ✅ | id `4511868486942720`, Next.js |
| `teamver-design-api` 생성 | ✅ | id `4511868487139328`, FastAPI |
| Email High priority (양쪽) | ✅ | 프로젝트 생성 시 기본 Rule 유지 |
| Slack production (양쪽) | ✅ | `#teamver-error` / `C0B3XFXD64W` |
| Slack staging (양쪽) | ✅ | `#teamver-error-staging` / `C0BN6JPP527` |
| 136 message nc 필터 | ✅ | web 템플릿 복제 8건 |
| 작업 브랜치 | ✅ | `feat/teamver-design-sentry` ← `origin/staging` |
| SDK 코드 연결 | ⏳ | [60-2](./60-2-구현설계-[Sentry_SDK_코드연결].md) |

## Rule ID

### teamver-design

| id | name | env |
|----|------|-----|
| `17392596` | Send a notification for high priority issues | — |
| `17392665` | Notify Slack — production | production |
| `17392668` | Notify Slack — staging | staging |

### teamver-design-api

| id | name | env |
|----|------|-----|
| `17392599` | Send a notification for high priority issues | — |
| `17392669` | Notify Slack — production | production |
| `17392670` | Notify Slack — staging | staging |

## DSN (호스트/CI에만 주입)

```text
teamver-design:
  https://2f2dd26c93488397083e6f3a965caaa6@o4511844488708096.ingest.us.sentry.io/4511868486942720

teamver-design-api:
  https://35a97b930ec504d4a813ad3a2133e816@o4511844488708096.ingest.us.sentry.io/4511868487139328
```

대시보드:

- https://neuralstudio.sentry.io/projects/teamver-design/
- https://neuralstudio.sentry.io/projects/teamver-design-api/

## 남은 일

- [ ] FE/API SDK init + environment 태깅 (60-2)
- [ ] staging/production 배포 env에 DSN 주입
- [ ] 실 Issue로 Slack·이메일 수신 확인
- [ ] (선택) fe-v2 `docs_all/135` 프로젝트 표에 Design 행 추가

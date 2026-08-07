# 60-1 구현설계 — Sentry 프로젝트·이메일·Slack 알림

**상위설계:** [60-0-상위설계-[Sentry_연동].md](./60-0-상위설계-[Sentry_연동].md)  
**작성:** 2026-08-07

## 1. 범위

Sentry **조직 설정만** (코드 SDK 미포함).  
복제 템플릿: `teamver-web` Issue Alert `17381091`(prod Slack), `17381085`(stg Slack), `17375499`(email).

## 2. 프로젝트

| slug | platform | team | 용도 |
|------|----------|------|------|
| `teamver-design` | `javascript-nextjs` | `team-dev` | OD `apps/web` (Design FE) |
| `teamver-design-api` | `python-fastapi` | `team-dev` | `deploy/teamver/be` design-api |

생성: `sentry project create neuralstudio/<slug> <platform> --team team-dev`

## 3. Alert Rules (프로젝트당 3개)

| name | environment | actions | conditions (요약) | filters |
|------|-------------|---------|-------------------|---------|
| `Send a notification for high priority issues` | (none / default) | **Email** IssueOwners→ActiveMembers | new/existing high priority | 없음 |
| `Notify Slack — production` | `production` | Slack `#teamver-error` | high priority + escalate + regression | message `nc` ×8 (136) |
| `Notify Slack — staging` | `staging` | Slack `#teamver-error-staging` | first_seen + high priority + escalate + regression | 동일 `nc` ×8 |

Slack workspace integration id: `480352` (NeuralStudio).  
Tags: `environment,level,url,transaction`.  
Frequency: Slack 5분, Email 1분(API 제약으로 0 불가).

## 4. DSN (코드 연결 시 env)

| 프로젝트 | env 키 (예정) |
|----------|----------------|
| `teamver-design` | `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` |
| `teamver-design-api` | `SENTRY_DSN` |

값은 Sentry Project Settings → Client Keys. **Auth Token은 커밋 금지.**

## 5. 검증

- `sentry project list`에 두 slug 표시
- `GET /api/0/projects/neuralstudio/<slug>/rules/` 에 위 3 rule
- 코드 연결 후 `/sentry-debug`·example page로 Slack/이메일 실수신

## 6. 리스크

- 환경 태그 없이 production Rule만 두면 stg 이벤트 미알림 → SDK에서 `environment` 필수
- Test Notification API 권한 부족 시 → 실제 Issue로 검증

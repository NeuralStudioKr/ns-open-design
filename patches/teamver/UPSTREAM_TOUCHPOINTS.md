# Upstream touchpoints (Teamver embed)

`git format-patch` 대상 upstream 파일 SSOT.  
**`apps/web/src/teamver/`는 이 목록에 포함하지 않습니다** (fork-native).

## Web (`apps/web`)

| 파일 | Teamver 변경 요약 |
|------|-------------------|
| `src/components/EntryShell.tsx` | EntryTopbarChips, branding provider, embed UpdaterPopup 숨김 |
| `src/App.tsx` | embed bootstrap, registry sync, runtime-config |
| `package.json` | `@teamver/app-sdk`, preinstall vendor check |
| `src/main.tsx` / `src/index.css` | TeamverBrandingProvider wrap, embed CSS (해당 시) |

## Daemon (`apps/daemon`)

| 파일 | Teamver 변경 요약 |
|------|-------------------|
| `src/teamver-project-access.ts` | design-api access subrequest |
| `src/storage/*` | S3 materialization, tenant prefix (Teamver 배포) |
| `src/project-routes.ts` | access + lazy materialization middleware |

> Daemon/storage 변경은 upstream OD에도 기여 가능한 generic 코드가 많아, patch series에는 **embed 전용 최소 hook**만 포함하는 것을 권장합니다.

## Deploy

| 경로 | 비고 |
|------|------|
| `deploy/teamver/**` | fork-native (patch 아님) |

## Rebase 충돌 우선순위

1. `EntryShell.tsx` — Teamver import + `teamverEmbed` 분기만 유지  
2. `App.tsx` — `apps/web/src/teamver/` 호출부만 유지  
3. `package.json` / lockfile — `@teamver/app-sdk` + vendor preinstall 유지  

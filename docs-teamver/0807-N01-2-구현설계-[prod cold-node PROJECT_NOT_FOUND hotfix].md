# 0807-N01-2 구현설계 — prod cold-node `PROJECT_NOT_FOUND` hotfix

## 변경

| 파일 | 내용 |
|------|------|
| `apps/daemon/src/project-routes.ts` | `resolveProjectRow` = `getProjectAsync` fallback; revisions·folders·upload·conversation POST에 적용 |
| `apps/daemon/src/teamver-project-sqlite-hydrate.ts` | `warmProjectFromPostgres` 를 `isTeamverDesignManaged` 보다 먼저; trusted-no-identity 시에도 PG warm 후 materialize |
| `apps/daemon/src/server.ts` | (dead duplicate) conversations GET/POST도 async resolve — belt |
| `deploy/teamver/devops/nginx/teamver-design-od-daemon-upstream.inc.conf` | batch slug → userId hash |
| `apps/web/src/teamver/projectErrorMessages.ts` | run 경로 `PROJECT_NOT_FOUND` KO 메시지 |
| `apps/daemon/tests/project-revision-cold-node-resolve.test.ts` | wiring 가드 |

## 배포 순서 (prod)

1. daemon 롤링 (`deploy/teamver/deploy.sh --production` 등)
2. **모든** design EC2에서 nginx include 재적용:
   `sudo bash devops/nginx/apply_teamver_design_nginx_conf.sh ./design.teamver.com.http.conf`
3. 확인: 미인증 `GET /api/version` → 200 (staging과 동일). 현재 prod는 401 `session_expired` → public-api.inc 미적용 가능.
4. 로그인 후 슬라이드 신규 생성 → 저장 → 실행 스모크.

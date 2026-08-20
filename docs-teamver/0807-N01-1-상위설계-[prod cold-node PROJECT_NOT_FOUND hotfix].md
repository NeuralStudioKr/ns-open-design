# 0807-N01-1 상위설계 — prod cold-node `PROJECT_NOT_FOUND` hotfix

## 증상

Production (`design.teamver.com`)에서 슬라이드 생성·저장·실행이 실패:

- 「이 슬라이드 프로젝트를 찾을 수 없어 저장에 실패했습니다…」 (`PROJECT_NOT_FOUND` / 404)
- 「슬라이드 실행 중 오류가 발생했습니다…」 (run 경로 generic fallback)

## 가설 (우선순위)

1. **P0 — multi-node cold peer**: `POST /api/projects` 는 userId hash, `…/files/…/revisions`·conversations 는 projectId hash → 다른 daemon. sync `getProject` 는 in-memory/sqlite cache만 보고 RDS miss 시 404.
2. **P1 — nginx collection slug 누락**: `preview-url-batch` / `cover-html-batch` 가 projectId 로 hash 되어 peer sticky 왜곡.
3. **P1 — hydrate가 design-api gate 뒤에만 PG warm**: design-api 이슈와 무관하게 PG warm이 필요.

## 범위

- daemon: revision / conversation / 주요 file mutation → `getProjectAsync`
- hydrate middleware: PG warm을 design-api 보다 먼저
- nginx upstream map: batch slug 제외
- FE: run 에러에 `PROJECT_NOT_FOUND` 매핑

## 비범위

- design-api RDS 데이터 복구, peers.inc 운영 재생성 (배포/SSH 필요)

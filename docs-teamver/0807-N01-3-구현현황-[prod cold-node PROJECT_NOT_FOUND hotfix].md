# 0807-N01-3 구현현황 — prod cold-node `PROJECT_NOT_FOUND` hotfix

## 진행

- [x] 원인 분석 (userId vs projectId hash + sync `getProject` on revisions/conversations)
- [x] daemon `resolveProjectRow` / hydrate PG-first
- [x] nginx batch slug 제외
- [x] FE run 에러 매핑
- [x] wiring vitest
- [ ] git commit / push (`staging`)
- [ ] **prod daemon 배포**
- [ ] **prod nginx 재적용 (전 노드)**
- [ ] prod 스모크: 생성 → 저장 → 실행

## 검증

```text
pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts \
  tests/project-revision-cold-node-resolve.test.ts \
  tests/teamver-project-sqlite-hydrate.test.ts
→ 2 files / 5 tests passed
```

## 운영 메모

- 외부에서 `https://design.teamver.com/api/version` → 401 `session_expired` (stg는 200). nginx public-api / peers 상태 점검 필요.
- SSH·배포 권한은 이 세션에 없음 → 운영자가 deploy + nginx apply 수행.

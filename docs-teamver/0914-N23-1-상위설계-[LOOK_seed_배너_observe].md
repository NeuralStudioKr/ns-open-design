# 0914-N23-1 상위설계 — LOOK seed 배너 observe-only (loop537)

상위: `0914-N09-1` Option D. Option A는 N15+N22. fill 기본이 prompt로 복구되어 배너가 다시 늘 수 있다.

## 문제

LOOK seed 배너(`CLONE_LOOK_SEED_FALLBACK_STATUS_CODE`)가 얼마나, 왜, generic brief인지가 한곳에 모이지 않는다. persist-quality / outline-quality는 성공 persist만 보고, 배너 낙착은 copy-diagnostics reason만 남긴다.

## 하지 않을 것

- fill / heal / LOOK merge HTML 변경 없음
- persist reject / LOOK seed 승격 없음
- Retry dock · 배너 카피 변경 없음
- 서버 알림 threshold (Option D 후반) 없음 — 데이터 없이 회로 차단하지 않음

## 해결

배너가 붙는 순간만 observe한다.

1. `buildTemplateCloneLookSeedFallbackObserve` — source / reason / genericBrief / fillMode / templateId
2. `devLog.info('[teamver] look-seed-fallback', payload)` — persist-quality와 같은 observe-only
3. 이미 저장되는 error diagnostic tail에 `genericBrief` · `source` · `fillMode` 토큰을 보태 copy-diagnostics / 메시지 스캔이 staging·prod에서도 셀 수 있게 한다

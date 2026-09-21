# 0914-N01-1 상위설계 — `/projects` 썸네일 preview batch

## 문제

루트(홈 Recent)는 `preview-url-batch` · `cover-html-batch`로 HTML 썸네일을 ×1에 가깝게 데운다.
`/projects`(DesignsTab)는 viewport에 cover-hints·publish chip만 배치하고, 보이는 카드마다
`GET …/preview-url` + `/raw?inlineAssets=1`이 나간다.

## 목표

`/projects` 첫 viewport(및 필터로 바뀐 viewport) HTML 커버도 홈과 같은 batch warm을 탄다.
daemon/BFF 신규 API 없음. 기존 `warmTeamverProjectPreviewPrefixes` · `warmTeamverHtmlCoverCache` 재사용.

## 비범위

- image/logo 카드의 S3/raw 단건 (별도 경로)
- cover-hints 자체 배치 변경
- Main FE

## 성공 기준

- viewport HTML N장에 대해 preview-url / cover-html이 **배치 ×1**(합류)로 나가며 카드별 fan-out이 기본 경로가 아님
- warm 전 카드가 `/raw`를 선점하지 않도록 홈의 `homeCoversReady`와 같은 gate
- 기존 home coalesce 테스트·hints-only DesignsTab `/files` 정책 유지(warm은 hints/entryFile 기반)

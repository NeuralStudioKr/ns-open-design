# 0916-N15-3 구현현황 — Block Frame chart-svg Q1..Q5 잔재

## 상태

☑ `neutralizeBlockFrameChartSvgDemoMetrics` export + Q\d+ 라벨 wipe 확장  
☑ `equalizeBlockFrameChartBars` 신규 — 컬러 `<rect>` 균등화, 공통 baseline 검출 시만 적용  
☑ 픽스처 `packages/contracts/tests/fixtures/loop547-block-frame-q1-q5.html` (예시 `.slide-4` 캡처)  
☑ 단위 테스트 — 힐러 직접 (Q\d+ 제거·Y label 제거·15개 막대 균등·baseline 유지·`<line>` 축 미변경)  
☑ 파이프라인 테스트 — `buildTemplateClonedDeckHtml` 후 chart-svg 유지 + Q1..Q5 미노출  
☐ Design staging QA (푸시 후 사용자 재현 확인)

## 검증

- `pnpm --filter @open-design/contracts test` (loop547 2 테스트 포함).
- 기존 loop534 (chart-svg 유지 + nb-label 리필) 회귀 없음.

## 다음 (후속 슬라이스 후보)

- **Retro-Windows 로드맵 테이블** (`Q[1-4] 20\d{2}` 하드코딩): kit-specific
  `healRetroWindowsLeftoverCatalogCopy` 신규 (Broadside/EightBitOrbit 패턴).
- **Raw-Grid pitch KPI** (`$27.6M` 등): 동일 패턴의 kit-specific 힐러 +
  카드 wipe (ordinal 폴백).
- **밀도 프롬프트 미세 조정** — `SLIDE_DECK_UNIQUE_SLOT_COPY_INSTRUCTION`에
  "3-5 concrete points per body slide, each ≥ 25 chars" 정량 힌트 (다른
  슬라이스의 저장 경로/짧은-응답 로직과 충돌 없이).

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 14:41 | 최초 작성 (루프547) |

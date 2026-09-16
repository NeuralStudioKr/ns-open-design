# 0916-N20-1 상위설계 — Raw-Grid pitch 재무 KPI 하드코딩 스크럽

**날짜:** 2026-09-16 · **루프:** 550

## 체감

`html-ppt-zhangzara-raw-grid` pitch 킷은 카탈로그 `example.html`에
`$27.6M` / `$4.5M` / `$42M` / `$1B+` / `+47%` / `63%` 같은 가짜 재무 KPI를
`.s3-bar-fill` · `.s3-stat-number` · `.s7-donut-value` · `.s7-metric-num` ·
`.s8-stat-num` 과 비교 표에 심어 둔다. MiniMax fill이 숫자 슬롯을 건너뛰면
데모 금액이 persist 후에도 그대로 남는다.

## 정책

- kit-specific healer만 추가. Broadside / EightBitOrbit / BlockFrame 로직은 불변.
- 킷 키는 `raw-grid-pitch`. 기존 kit resolver(`resolveOfficialPosterKit` ·
  `resolveTemplateCloneSlotMap`)에만 항목을 추가한다.
- 재무 상투어(`$\d+\.?\d*[MBK]`, demo `\d+%`, `Series [A-E]`)는 wipe 또는
  ordinal. 대체 숫자를 발명하지 않는다.
- 카드/차트 shell(`.s3-bar-track`, `.s7-donut-container` svg, `.s9-table`)은 유지.
- `synthesizeTemplateCloneSlideBody` fallback은 이 킷에서 재무 상투어를 뱉지 않는다.
- 다른 킷(Grove `73%`, Broadside `$3.5B`)에는 이 힐러가 발동하지 않는다.

## 범위 외

- `findClientSlideCountRegression` · 저장 경로 · 프롬프트 상수 · pad 훅 · 자동 재시도.
- Broadside / EightBitOrbit / BlockFrame healer 본문.

## 위치

- `packages/contracts/src/template-clone-fill.ts`
- `packages/contracts/src/template-clone-slot-maps.ts`
- fixture `packages/contracts/tests/fixtures/loop550-raw-grid-kpi.html`
- 테스트 `packages/contracts/tests/template-clone-fill.test.ts`

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 16:28 | 최초 작성 (루프550) |

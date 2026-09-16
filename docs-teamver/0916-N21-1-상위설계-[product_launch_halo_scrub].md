# 0916-N21-1 상위설계 — Product Launch Halo 카탈로그 데모 스크럽

**날짜:** 2026-09-16 · **루프:** 551

## 체감

`tpl-product-launch` / Halo v2 킷으로 생성한 10장 덱이 persist 후에도
영어 카탈로그 카피(`Halo v2`, `halo.audio`, `Studio-grade spatial…`,
`$179`/`$279`/`$399`, `Marques Lin`, `Pre-order Halo`)와 synth 일반
한국어 슬롯(`핵심 포인트`, `핵심 가치`/`사용 장면`/`차별점` 등)을 그대로
남긴다. Broadside / EightBit / Raw-Grid 와 같은 kit-specific leftover
healer가 이 킷에는 없다.

## 정책

- kit-specific healer만 추가. Broadside / EightBitOrbit / BlockFrame /
  Raw-Grid healer 본문은 불변.
- kit key는 `product-launch-halo`. 감지: `tpl-product-launch`,
  `.hero-shot`, `.price-card`, `.feature-card`, `body.tpl-product-launch`.
- Halo/earbuds 영어 데모는 전역 `LEFTOVER_CATALOG_PHRASE_RE` + 킷 전용 RE
  로 strip. `.amount` `$\\d+` 는 wipe 또는 ordinal — 가짜 KPI 발명 금지.
- `.hero-shot` / `.price-card` / `.feature-card` shell 유지.
- 일반 한국어 제목·카드는 topic-aware 로 덮어쓴다. brief가 Teamver 소개면
  Teamver 제품 소개 문장. 이어폰 / Halo / 달러 가격 금지.
- CSS `content:"Halo v2"` 도 heal 단계에서 빈 값 또는 brief 짧은 브랜드로
  치환.

## 범위 외

- `findClientSlideCountRegression` · 저장 경로 · 프롬프트 상수 · pad 훅 ·
  자동 재시도.
- Broadside / EightBitOrbit / BlockFrame / Raw-Grid healer 본문.

## 위치

- `packages/contracts/src/template-clone-fill.ts`
- `packages/contracts/src/template-clone-slot-maps.ts`
- fixture `packages/contracts/tests/fixtures/loop551-product-launch-halo.html`
- 테스트 `packages/contracts/tests/template-clone-fill.test.ts`

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 17:25 | 최초 작성 (루프551) |

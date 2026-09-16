# 0916-N21-3 구현현황 — Product Launch Halo 카탈로그 데모 스크럽

## 상태

☑ kit key `product-launch-halo` + `officialLookIsProductLaunchHalo`  
☑ `resolveTemplateCloneKitKey` / `PRODUCT_LAUNCH_SLOT_MAP` ids 확장  
☑ `LEFTOVER_CATALOG_PHRASE_RE` Halo 슬로건 추가 + 킷 전용 RE  
☑ `healProductLaunchLeftoverCatalogCopy` · `stripProductLaunchCatalogDemoCopy`  
☑ `.amount` `$\\d+` wipe/ordinal (가짜 KPI 발명 없음)  
☑ `.hero-shot::before` `content:"Halo v2"` → brief 짧은 브랜드  
☑ `fillProductLaunchKitSlide` — feature/price/step/testimonial/lede topic-aware  
☑ 일반 한국어 제목·카드(`핵심 포인트`, `핵심 가치` 등) kit-aware 덮어쓰기  
☑ pipeline 연결 (Raw Grid 다음, Retro-Windows 전)  
☑ fixture `loop551-product-launch-halo.html`  
☑ Grove / Broadside isolation pin  
☐ Design staging QA (푸시 후 사용자 재현 확인)

## 검증

- `pnpm --filter @open-design/contracts test` — 3216 passed (997 files).
- `template-clone-fill.test.ts` 루프551 2건 green.
- 힐 후 `Halo v2` / `halo.audio` / `Studio-grade spatial` / `$179` `$279` `$399` /
  `Marques Lin` / `Pre-order Halo` / `AAC + SBC` / `Hi-Res Lossless` 없음.
- `.hero-shot` / `.price-card` / `.feature-card` shell 유지.
- 일반 한국어 제목·카드 heading은 topic-aware 로 교체됨.

## 다음 후보

- Design staging에서 Teamver 소개 × Product Launch 10장 재현.
- 잔여 킷 카탈로그 감사 (이 슬라이스 범위 외).

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 17:29 | 최초 작성 (루프551 구현 완료) |

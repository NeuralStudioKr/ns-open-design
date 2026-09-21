# 0918-N02-3 구현현황 · Cobalt Grid leftover·cover/table 힐러

상위설계: `docs-teamver/0918-N02-1-상위설계-[cobalt_grid_heal].md`

## 상태

구현 완료. staging push. ns-open-design 은 ns_cicd 미등록 — CICD 감시 없음.

## 구현

| 항목 | 상태 |
|---|---|
| kit key `cobalt-grid` | ☑ `.s-cover`+`.s-colophon` 또는 `pixel-glitch`+`.pagenum`. Sakura/PL/BF/Biennale 거부 |
| `healCobaltGridLeftoverCatalogCopy` | ☑ salvage는 orphan reparent **다음**. magazine heal도 동일 |
| `fillCobaltGridKitSlide` | ☑ 역할별 Teamver 카피. 공통 아웃라인 재주입 없음 |
| cover cfooter 2 colf 재조립 | ☑ 고아 ` · ` / 빈 div / 바깥 colf |
| table 영문 head · `파일럿` · `02 / 2` | ☑ 번호/항목/설명/상태. delta wipe |
| 빈 vbig | ☑ ordinal. 가짜 % 없음. pixel-stack chart 셸 |
| 빈 qr-block | ☑ 장식 `px` 유지 |
| `synthesizeTemplateCloneSlideBody` 가드 | ☑ `COBALT_GRID_KIT_KEY`면 역할 팩. 개요/탐색 루프 차단 |
| persist/pad/continue | ☑ 손대지 않음 |

## fixture pin

`packages/contracts/tests/fixtures/loop557-cobalt-grid-teamver.html`

heal 후: `소개 2` 없음 · `No.`/`YoY` 없음 · `파일럿` 없음 · cfooter 고아 ` · ` 없음 · `개요`/`핵심 포인트` h·div 제목 없음 · 탐색+실행+확장 트리오 없음 · cover kicker ≠ footer · manifesto ≠ 소개 2 · index h3 3개 이상 서로 다름 · Halo/Block Frame green · official English example no-op.

## 재현

```bash
cd packages/contracts
npx vitest run tests/template-clone-fill.test.ts -t "Cobalt Grid leftover"
```

brief `Teamver 소개`로 `salvageMalformedMiniMaxSlideMarkup(fixture)` 하면 8장 역할이 매거진 구성(선언 / 작업 목록 / 운영 / 인용 / 도입 단계 / 닫기)으로 갈린다.

## 변경 이력

| 2026-09-18 11:48 | 역할별 Teamver 카피 + leftover/layout 힐러 구현. fixture loop557. |

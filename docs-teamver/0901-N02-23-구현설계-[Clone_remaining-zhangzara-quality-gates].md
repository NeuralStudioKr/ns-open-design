# 0901-N02-23 구현설계 — 남은 10셸 Zhangzara 공식 템플릿 품질 게이트 (루프470)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
직전: [0901-N02-22](./0901-N02-22-구현설계-[Clone_long-table-leftover-refill].md) 루프469 — Long Table / Editorial unique-role.

## 목표

루프469 「다음」 — 공식 Zhangzara 카탈로그의 **아직 4축 게이트가 없는 10셸 키트**를 같은 fixture 게이트로 잠근다. Long Table · Editorial Tri-Tone은 루프469에서 8장 cap으로 이미 고정.

1. 대표 motif 존재
2. demo leftover 없음 (템플릿별 denylist)
3. 1920×1080 캔버스
4. 요청 장수 10 (unique-role cap이 없는 셸)

## 대상

Bold Poster · Cartesian · Coral · Grove · Mat · Monochrome · Neo Grid Bold · Peoples Platform · Pin and Paper · Pink Script · Playful · Raw Grid · Retro Windows · Retro Zine · Signal · Soft Editorial · Stencil Tablet · Vellum

공통 brief는 루프450과 동일. CSS 주석·브랜드 lockup(`Ivory Ledger`, `RAW GRID`, `Pin & Paper`)은 motif chrome으로 두고, 본문 leftover만 denylist에 넣는다.

## leftover 스크럽 최소 수정

`LEFTOVER_CATALOG_PHRASE_RE`에 보이는 잔여만 추가:

- `Twelve weeks of after-hours behavior` (Pink Script `.desc`)
- `Three rules we're keeping` (Pin and Paper)
- `User Research Synthesis` (Monochrome sidebar label)

## 테스트

- contracts `루프450/459/469/470 Zhangzara template quality gates` — 기존 + 18 `it.each`
- daemon 서버 스모크에 Bold Poster / Coral / Playful / Mat

## 비범위

- screenshot / FileViewer 배치 smoke
- MiniMax live E2E
- CSS 주석 안의 템플릿 이름 wipe

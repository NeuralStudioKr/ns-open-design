# 0921-N03-3 구현현황 · Capsule 한글 덱 chrome / overflow / sparse-role

상위설계: `docs-teamver/0921-N03-1-상위설계-[capsule_한글덱_chrome_overflow].md`

## 진행

- [x] `scrubCapsuleLeftoverDecorativeChrome` — deco/orbit/f/c/diagram/mini pill 영문 데모 blank
- [x] `scrubCapsuleLeftoverSpecialtySlotCopy` — chart/timeline/quote/stat/header/closing 영문 데모 blank
- [x] `fillCapsuleEmptyTitlePill` — 빈 커버 title-pill 에 kicker/소개
- [x] `refillCapsuleEmptyStructuredSlots` — outline 순서 semantic refill. 인덱스 placeholder 없음
- [x] `hostIsCapsuleFixedDensity` + `rebuildHostWithPeers` keepCount = peers.length
- [x] `inferTemplateCloneContentRoleFromText` sparse demote → `cards`
- [x] `injectCapsuleLayoutFixIfNeeded` + `CAPSULE_LAYOUT_FIX_CSS` overflow-hidden
- [x] `CAPSULE_SLOT_MAP` specialty host+peer
- [x] persist salvage와 `buildTemplateClonedDeckHtml` 모두에서 **0918-N05 heal 뒤**에 scrub/refill
- [x] staging `fillCapsuleKitSlide` / `healCapsuleLeftoverCatalogCopy` / stackStyle / Block Frame hangul / 555 collapse 유지
- [x] Capsule healer는 `looksLikeCapsuleChrome` — Block Frame/Coral/Playful 에 안 탐
- [x] leftover `개요`/`OVERVIEW` 를 title-pill/header-pill 에 다시 쓰지 않음 (0918-N05 leftover)
- [x] `nav-dot[data-slide]` 는 slide host가 아님 — Capsule pager가 seed 장수를 2배로 세던 충돌 해소

## 검증

```bash
pnpm --filter @open-design/contracts test -- \
  tests/template-clone-fill.test.ts \
  tests/loop559-offline-repro.test.ts \
  tests/loop562-generic-leftover.test.ts
```

fixture: `tests/fixtures/loop510-capsule-korean-deck-clone.html` (describe 이름은 내부 pin 유지).

## 남은 갭

- `.diagram-node` 는 아직 `CAPSULE_SLOT_MAP.peerClasses` 에 없음 → peer 0 → enrich 미적용
- shell picker “요금제 → statement-box” 오매칭은 refill이 outline을 존중하므로 반복 인용만 해소
- 실생성(브라우저) bake는 이 환경에서 탭/로그인 막히면 우회하지 않음

## 변경 이력

| 2026-09-21 | staging 머지 해소 후 구현현황. 역할 pack과 chrome healer 공존. |

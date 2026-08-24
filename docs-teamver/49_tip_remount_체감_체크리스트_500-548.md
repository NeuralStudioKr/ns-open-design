# Tip remount 체감 체크리스트 (500–548)

Manual Edit tip-yield → remount → chrome interactive 경로의 **사용자 체감** 회귀 체크리스트입니다.  
헬퍼/시퀀스 SSOT는 `apps/web/src/edit-mode/manual-edit-freeze.ts` 상단 **Tip remount index (546)** 와 아래 상수입니다.

| 시퀀스 | 상수 |
|--------|------|
| Post-protect | `TIP_REMOUNT_POST_PROTECT_SEQUENCE` |
| Chrome prefix | `TIP_REMOUNT_CHROME_RELEASE_PREFIX` |
| Paint track (∥) | `TIP_REMOUNT_PAINT_SYNC_TRACK` |
| Pointer track (∥) | `TIP_REMOUNT_POINTER_UNLOCK_TRACK` |

CI fail-fast: `pnpm --filter @open-design/web test:tip-remount-smoke`

의도적으로 **바꾸지 않는** 타이밍: chrome release **400ms**, fit remasure `[50,150,400,900,1600]`, latch **1700ms**, soft-land catalogs **2**.

공유 walk fixture: `apps/web/tests/edit-mode/tip-remount-sequence-fixtures.ts` (547).

---

## A. Post-protect (sticky → live)

- [ ] sticky clear 후 soft-land **2** catalogs 동안 tip identity 유지 (500–507)
- [ ] soft-land 종료 → exit latch → absorb (source-only inspector settle) (507/511)
- [ ] pending draft가 absorb settle보다 우선 (514)
- [ ] absorb 후 post-absorb quiet 1 tick (Mixed/inspector 재seed 차단) (509)
- [ ] membership 변경 시 soft-land/absorb/quiet/follow 전부 clear (508)

## B. Chrome suppress → release

- [ ] tip remount 중 resize/multi chrome inert, last rect 유지 (455/458)
- [ ] fit remasure metrics → geometry → paint 순서 (513/515)
- [ ] **400ms** remasure에서 chrome release; 900/1600은 geometry only (476/478)
- [ ] failed 400ms remasure에도 chrome unlock (512)
- [ ] resize 중 remasure skip → gesture end에서 chrome release (489)
- [ ] grace safety/expiry/consume는 bare suppress drop이 아니라 paint-sync release (542)

## C. Paint-sync track (∥ pointer)

- [ ] chrome release 직후 paint-sync hold (double-rAF + token cancel) (530/534)
- [ ] hold 중 last-good / current hostPaint null 가드 (521/523/538/543)
- [ ] layout-effect live paint가 tip session/hold 중 last-good seed (543)
- [ ] layout-effect miss + current empty → last-good apply (543)
- [ ] selection commit이 tip/paint-sync 중 unconditional null 대신 primary last-good (546)
- [ ] mode-exit / no-id / clear-selection / unprotected refresh miss null은 의도적 clear (546 audit)
- [ ] geom-epoch bump는 hold 중 defer → hold clear 시 flush (533)
- [ ] immediate epoch bump는 deferred flag clear (542 double-bump 방지)
- [ ] multi partial paint: composed-only omit + min-size latch + membership/zero-paint clear (529/532/535/541)

## D. Pointer unlock track (∥ paint)

- [ ] unlock gate: hover 또는 buttons-down (520/522)
- [ ] window blur도 buttons-down/unlock clear (531 review)
- [ ] pointerup: deferred geometry flush **먼저**, 그다음 unlock clear (525)
- [ ] post-unlock quiet 1 remasure (재defer/재arm 금지) (528)
- [ ] quiet force-spend: follow-end 또는 2s timeout (531)

## E. Follow / deck nudge

- [ ] deck nudge follow window + throttle catch-up metrics (487/517)
- [ ] sibling partial measure 1회 retry (518)
- [ ] deferred geometry latest-wins + immediate invalidate (519)
- [ ] tip idle 시 last-good host-rect cache clear (524)

## F. 스모크 / walk 테스트

| 파일 | 범위 |
|------|------|
| `manual-edit-tip-remount-smoke.test.ts` | wiring 핀 500–546 |
| `tip-remount-sequence-fixtures.ts` | soft-land×chrome 공유 walk (547) |
| `manual-edit-tip-soft-land-absorb-sequence.test.ts` | post-protect walk |
| `manual-edit-tip-chrome-release-sequence.test.ts` | chrome helper walk |
| `manual-edit-tip-post-protect-chrome-cross-walk.test.ts` | 교차 walk (544) |
| `manual-edit-tip-deck-nudge-follow-chrome-race.test.ts` | follow/chrome race |

---

## 루프 번호 요약

| 구간 | 요지 |
|------|------|
| 500–512 | soft-land/absorb/quiet, follow clear, source settle, failed unlock |
| 513–521 | metrics→geometry, defer, throttle, sibling, latest payload, unlock gate, last-good |
| 522–530 | buttons-down gate, hostPaint last-good, tip-end clear, flush order, trust stale, quiet, partial union, paint-sync |
| 531–539 | quiet force-spend, min-size latch, epoch/paint order, token cancel, latch clear, sequences, walk, null guard, index |
| 540–542 | paint∥pointer tracks, latch membership, grace→paint-sync release |
| 543–545 | layout last-good seed/miss, cross walk, checklist |
| 546–548 | selection-commit last-good, shared walk fixtures, checklist 500–548 |

문서 갱신 시 `docs-teamver/00_구현_내역_누적.md` 최상단에도 한 줄을 남깁니다.

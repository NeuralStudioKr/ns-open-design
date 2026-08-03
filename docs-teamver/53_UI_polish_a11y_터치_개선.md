# Design UI polish — a11y · hit target · 터치 hover-reveal

**문서 번호:** 53  
**상태:** 구현 기록 SSOT (2026-08-03)  
**브랜치:** `staging` (`NeuralStudioKr/ns-open-design`)  
**진행 갱신:** [00 구현 내역](./00_구현_내역_누적.md)

**관련**

| 문서 | 관계 |
|------|------|
| [12 embed 로컬 UX 제거](./12_embed_로컬UX_제거_체크리스트.md) | embed에서 숨기는 표면 — 본 문서의 **비범위**와 정렬 |
| [28 embed 숨김 UI·API](./28_embed_숨김_UI_API_점검.md) | 숨김 UI의 API 스킵 |
| [37 embed OD branding hide](./37_embed_od_branding_hide.md) | 브랜드/내비 숨김 |
| 전역 focus | `apps/web/src/styles/primitives.css` — `button:focus-visible` |

---

## 1. 한 줄 요약

> Teamver Design(embed 포함) **시각·a11y·터치** polish.  
> **원칙:** 밀집 chrome·의도된 28px 체계를 깨지 말고, hover-only 컨트롤은 터치에서도 쓸 수 있게 하며, 전역 focus와 중복되는 CSS를 쌓지 않는다.  
> 과대 hit-target 실험은 **리뷰 후 되돌림**했고, 이후 루프는 터치/ellipsis/스택킹 위주로만 진행한다.

---

## 2. 범위 · 비범위

### 2.1 범위 (본 루프)

| 영역 | 내용 |
|------|------|
| Focus | embed 링크·kebab 등 **전역이 커버하지 않는** `<a>` / custom outline |
| Hit target | 부모 높이·grid 열과 **맞는** 소폭 조정만 (24–28px). 32px 강제 ❌ |
| Stacking | workspace 메뉴가 toast 아래에 깔리는 문제 |
| Tooltip | ellipsis 잘리는 라벨에 `title` |
| Touch | `@media (hover: none)` + `:focus-within` 로 hover-reveal 보완 |
| Disabled CTA | empty Designs CTA의 disabled 시각·title |

### 2.2 비범위 (의도적 미변경)

| 항목 | 이유 |
|------|------|
| MCP env placeholder 문자열 (`GITHUB_TOKEN=…` 등) | 사용자 확인: **의도적 비노출·미번역** |
| `ProjectCardHtmlCover` iframe deck nav **aria selector** | 런타임/테스트 계약 — 로컬라이즈·문구 변경 금지 |
| Composer toolbar 28→32 | 주석상 **의도된 28px 통합 체계** (chat.css / routines.css) |
| Design Files chrome 탭 아이콘 24px | 38px 행용 **compact** override |
| Queue drag/action 24px | `.chat-queued-send-row` grid 첫 열 `24px`와 고정 매칭 |
| `assistant-footer` 항상 표시 | 과거 메시지는 hover/`data-last`/`data-streaming`이 의도된 밀도 |
| Pet Codex 썸네일 애니 항상 on | 터치에서 전 카드 애니 = CPU·시각 노이즈 |
| ns_cicd 감시 | `ns-open-design`은 ns_cicd **미등록** — staging은 `deploy/teamver/deploy.sh` 별도 |

### 2.3 인접 트랙 (i18n — 별도 커밋열)

같은 기간의 **한글/embedUiLabel 하드코드 제거**는 시각 polish와 별 커밋이다. 요약만 남긴다.

| SHA (short) | 요약 |
|-------------|------|
| `4819eac44` … `e26f4000b` | chat/chrome/themes/browser/MCP/plugins/Memory/xAI/pet 등 로컬라이즈 |
| `883473fb5` | pet Buddy placeholder `embedUiLabel` 누락분 |

i18n 상세 문자열 표는 locale 파일 diff를 SSOT로 본다 (`apps/web/src/i18n/locales/ko.ts` 등).

---

## 3. 설계 원칙 (리뷰 후 확정)

1. **부모 geometry 먼저**  
   칩 `min-height: 24`, 검색행 `height: 28`, queue grid `24px` 열을 넘는 버튼은 회귀.
2. **공유 28px 체계 준수**  
   chat session trigger · header icon · composer 컨트롤은 28px. header만 32로 키우지 않음.
3. **전역 focus 중복 금지**  
   `button:focus-visible`가 있으면 동일 outline 재선언하지 않음.  
   예외: `outline: none` 후 box-shadow 링(embed 링크, kebab), 또는 `opacity: 0` 컨트롤의 focus 시 표시.
4. **터치 = hover 대체**  
   hover-reveal 컨트롤은 최소한 다음 중 하나:  
   - `@media (hover: none) { opacity: 1 }`  
   - `:focus-within` on parent  
   - (이미 있는) `:focus-visible` on control
5. **스타일 과잉 금지**  
   disabled CTA에 `border-style: dashed` 같은 장식은 제거. opacity + cursor + title면 충분.
6. **변경 전 “왜 작은가” 주석·override 확인**  
   `routines.css`의 workspace-shell 24px, chat.css composer 28px 주석을 무시하지 않음.

---

## 4. 커밋 타임라인 (시각 · a11y · 터치)

| 순서 | SHA | 내용 | 판정 |
|------|-----|------|------|
| 1 | `a0cdd3151` | embed focus, kebab/menu z-index, plus-menu title, disabled CTA title, 초기 hit 확대 | **부분 유지** (과대 사이즈는 3에서 교정) |
| 2 | `f97ee14ed` | rename/header/queue/tab close 확대 + 중복 focus | **부분 유지** (header 32·queue 28·중복 focus·shell 탭 28은 3에서 되돌림) |
| 3 | `29466ae40` | **리뷰 교정** + context-chip/tab/card close 터치 + background-runs `title` | **유지 (기준점)** |
| 4 | `cf94d6655` | board-pod remove, DS card overlay 터치 | 유지 |
| 5 | `d8975a6f4` | Design Files menu/check, template delete, library edit, example/canvas overlay, hero type-chip close | 유지 |
| 6 | *(후속)* | DS picker preview expand 터치 (`project-ds-picker-preview-expand`) | 본 문서와 함께 기록 |

`f97ee14ed` 메시지의 “28–32px” 방향은 **리뷰로 철회**된 부분이 있음. **유효 SSOT는 `29466ae40` 이후 원칙**.

---

## 5. 유지된 개선 목록

### 5.1 Focus · stacking · title

| 대상 | 파일 | 변경 |
|------|------|------|
| embed sign-in / main-link / teamver-app | `styles/teamver.css` | `:focus-visible` box-shadow 링 (`outline: none` 대체) |
| workspace switcher menu | `styles/teamver.css` | `z-index: 1000` → **1300** (`.od-toast` top placement 1200 위) |
| design card kebab | `styles/workspace/drawer.css` | 28px + custom focus ring; menu `z-index` 80 |
| recent-projects menu anchor | `styles/home/recent-projects.css` | z-index 4 → 6 |
| plus-menu connector/plugin/MCP | `ComposerPlusMenu.tsx` | ellipsis용 `title` |
| Designs empty CTA | `DesignsTab.tsx` + `drawer.css` | disabled 시 `title` + opacity/cursor (dashed ❌) |
| background runs | `TeamverBackgroundRunsBanner.tsx` | detail/list truncated `title` |
| project/conversation rename | `styles/chat.css` | 24 → **28** (헤더 높이 여유 있음) |
| user copy button | `styles/chat.css` | min 28×28 hit |
| workspace tab close | `styles/shell.css` | 18 → **22** + focus 시 `opacity: 1` |
| workspace tabs list close | `styles/shell.css` | 22 → **24** |

### 5.2 Hit target — 최종 수치 (교정 후)

| 컨트롤 | 최종 | 비고 |
|--------|------|------|
| `home-hero__active-clear` | **24px** | 칩 `min-height: 24`에 맞춤 (28 + negative margin ❌) |
| `chat-history-search-clear` | **22px** | 검색행 28 내부 (28 + spill ❌) |
| `chat-conv-item-del` | **24px** | 행 min-height 32; focus/touch reveal 유지 |
| `design-card-more` | **28px** | 카드 여유; 32는 과대 |
| `chat-header-actions .icon-only` | **28px** | session trigger와 동일 |
| queue drag/action | **24px** | grid 열과 일치 |
| workspace-shell tabs new/icon | **24px** | Design Files compact chrome |

### 5.3 Touch / focus-within hover-reveal

데스크톱 hover는 유지. 아래는 `@media (hover: none)` 및/또는 `:focus-within` 추가분.

| 컨트롤 | 파일 |
|--------|------|
| `design-card-close` / `design-card-more` | `drawer.css` |
| `workspace-tab__close` | `shell.css` |
| `context-chip-strip__remove` | `plugin-rail.css` |
| `chat-conv-item-del` | `composio.css` (기존 focus + touch) |
| `board-pod-chip-remove` | `viewer/core.css` |
| `ds-card-thumb-overlay` | `drawer.css` |
| `template-option-delete` | `artifacts.css` |
| `df-row-menu` / `df-row-check` | `design-files.css` |
| `library-ds-edit` | `library.css` |
| `teamver-canvas-slide-launch-template-card-overlay` | `tools.css` |
| `example-preview-overlay` | `composio.css` |
| `home-hero__active-type-chip-close` | `home-hero.css` |
| `project-ds-picker-preview-expand` | `routines.css` |

**이미 올바르던 패턴 (참고, 본 루프 미변경)**

- `df-preview-close` — `@media (hover: hover) and (pointer: fine)` vs `(any-pointer: coarse)` 분리
- `entry-nav-rail__collapse` — touch에서 항상 접기 가능
- `plugins-home__card-overlay` — touch fallback 기존

---

## 6. 되돌린 · 부적절한 시도 (교훈)

| 시도 | 문제 | 조치 |
|------|------|------|
| active-clear / search-clear → 28px + negative margin | 칩·검색 테두리 overflow | 24 / 22로 축소 |
| queue actions → 28px | grid 열 24와 불일치 | 24 유지 |
| chat header icons → 32px | 28px 체계·session trigger와 불일치 | 28 |
| workspace-shell tabs → 28 | 38px Design Files chrome 의도 파손 | 24 |
| 광범위 `:focus-visible` 재선언 | `primitives.css`와 중복 노이즈 | 제거 |
| disabled CTA `border-style: dashed` | 장식 과잉 | 제거 |

---

## 7. 검증 체크리스트

### 7.1 키보드

- [ ] Tab으로 embed bar 로그인/Teamver 앱 링크 → accent ring 보임
- [ ] 프로젝트 카드 kebab → focus 시 보임 + Enter로 메뉴
- [ ] workspace 탭 close → focus 시 opacity 1

### 7.2 마우스 (회귀)

- [ ] 카드 kebab/close는 hover 전 숨김 유지
- [ ] Design Files 행 메뉴/체크는 hover 전 숨김 유지
- [ ] composer + Send + session trigger 높이 정렬(28px)

### 7.3 터치 / coarse pointer

- [ ] 프로젝트 카드 kebab·close 항상 탭 가능
- [ ] Design Files ⋯ / 체크 탭 가능
- [ ] Canvas slide launch 템플릿 카드 설명 overlay 가독
- [ ] context chip / board pod remove 탭 가능

### 7.4 Stacking · tooltip

- [ ] toast 떠 있을 때 workspace 메뉴 클릭 가능
- [ ] plus-menu 긴 이름·background runs 긴 프로젝트명 hover/long-press `title`

---

## 8. 남은 후보 (다음 루프 — 판단 후만)

| 후보 | 메모 |
|------|------|
| `assistant-footer` touch | `data-last`만으로 충분한지 실사용 확인 후 |
| Pet Codex preview touch | 전 카드 애니 비용 vs 포커스만으로 충분한지 |
| `ds-modal-stage-fullscreen` | focus 있음 — touch 필요성 낮음 |
| i18n 잔여 하드코드 | **의도 비노출 제외** 후 스캔 |
| Manual Edit handle | 설계서 14×14 hit 이미 충족 — 크기 변경 금지 |

새 변경 시 **§3 원칙**으로 먼저 기각한 뒤 코드·본 문서 §4–5·[00](./00_구현_내역_누적.md)를 함께 갱신한다.

---

## 9. 파일 인덱스

| 경로 | 역할 |
|------|------|
| `apps/web/src/styles/primitives.css` | 전역 `button:focus-visible` |
| `apps/web/src/styles/teamver.css` | embed focus · workspace menu z-index |
| `apps/web/src/styles/chat.css` | rename / copy / header 28 / queue 24 |
| `apps/web/src/styles/shell.css` | tab close · list close · touch |
| `apps/web/src/styles/home/home-hero.css` | active-clear · type-chip close |
| `apps/web/src/styles/home/recent-projects.css` | menu anchor z-index |
| `apps/web/src/styles/workspace/drawer.css` | card kebab/close · DS overlay · empty CTA |
| `apps/web/src/styles/workspace/design-files.css` | row menu/check |
| `apps/web/src/styles/workspace/artifacts.css` | template delete |
| `apps/web/src/styles/viewer/composio.css` | history clear/del · example overlay |
| `apps/web/src/styles/viewer/plugin-rail.css` | context chip remove |
| `apps/web/src/styles/viewer/core.css` | board pod remove |
| `apps/web/src/styles/viewer/library.css` | library DS edit |
| `apps/web/src/styles/viewer/tools.css` | canvas slide launch overlay |
| `apps/web/src/styles/viewer/routines.css` | shell compact tabs · DS picker expand |
| `apps/web/src/components/ComposerPlusMenu.tsx` | item `title` |
| `apps/web/src/components/DesignsTab.tsx` | empty CTA `title` |
| `apps/web/src/teamver/components/TeamverBackgroundRunsBanner.tsx` | truncated `title` |

---

## 10. 배포 노트

- 코드만 `staging` push. **OD는 ns_cicd 없음** → 실서버 반영은 `deploy/teamver/deploy.sh --staging` (또는 rolling) 별도.
- FE 정적 CSS/TSX만 변경 → daemon/schema 마이그레이션 없음.

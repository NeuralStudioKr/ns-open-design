# Design UI polish — a11y · hit target · 터치 hover-reveal

**문서 번호:** 56  
**상태:** 구현 기록 SSOT (2026-08-03)  
**번호 이력:** 구 `53_UI_polish_…` → **56** (수동편집 승격 `53-0`/`53-1`/`53-2`와 충돌 해소, 2026-08-03)  
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
| 6 | `5d1ba45d0` | DS picker preview expand 터치 (`project-ds-picker-preview-expand`) | 유지 |
| 7 | `c8641fcc5` | 본 문서(당시 53→현 **56**) + [00](./00_구현_내역_누적.md) 기록 | 문서 |
| 8 | `4c4d74f1f` | 53 타임라인 SHA pin | 문서 |
| 9 | `69c688105` | escape Design Home focus 링 · assistant-footer focus-within · Drive/hero/DS/plugin `title` | 유지 |
| 10 | `c525e5cce` | Drive picker/import 모달 시각 polish (색·여백·타이포) — `tools.css` only | 유지 |
| 11 | `df36b570a` | 홈 섹션 제목 sans 통일 (recent/plugins/entry) | 유지 |
| 12 | `34b345db8` | DS fullscreen·BYOK·agent cancel 터치 · empty titles · bg-runs · user-actions 28 · plugins design sans | **부분 유지** (design showcase serif 복구 — §6) |
| 13 | `09bea4edb` | publish chip · staged-remove · connector close 28 · newproj/toolbar text tokens (55 통일 보류) | **부분 유지** (중복 focus-visible 제거 — §6) |
| 14 | `d500b9959` | home-hero/recent/design-card 토큰 · composer 28 정렬 · settings/toast/run-recovery | **부분 유지** (toast·hint·hero 계층 교정 — §6) |
| 15 | `62fa33525` | plugins/examples/history soft · modal close 28 · newproj sans · pet adopt touch | **부분 유지** (newproj title serif 복구 — §6) |
| 16 | `426f31e7a` | **리뷰 교정** — 부적절한 polish 되돌림 · 포화 선언 | 유지 |
| 17 | `315497d76` | 보완: tab close focus-within · 중복 button focus outline 정리 · toast 주석 | 유지 |

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
| workspace tab close | `styles/shell.css` | 18 → **22** + hover/active/**focus-within** 시 `opacity: 1` · 전역 focus outline |
| workspace tabs list close | `styles/shell.css` | 22 → **24** |
| escape Design Home | `styles/teamver.css` | `outline: none`만 있던 focus → **accent box-shadow 링** 복구 |
| assistant-footer | `composio.css` / `routines.css` | `:focus-within`으로 키보드 시 표시 (**터치 항상 on 아님**) |
| Drive target select desc | `TeamverDriveTargetSelect.tsx` | description `title` |
| Drive picker folder cards/rows | `TeamverDrivePickerModal.tsx` | label/description `title` |
| Drive import folder rows | `TeamverDriveImportModal.tsx` | folder `title` |
| home active chips | `HomeHero.tsx` | `home-hero__active-label` `title` |
| DS picker option titles | `DesignSystemPicker.tsx` | option `title` |
| Design Files plugin folder path | `DesignFilesPanel.tsx` | path `title` |
| plugin loop card title | `PluginLoopHome.tsx` | card `title` |
| staged plugin chip name | `ChatComposer.tsx` | `staged-name` `title` |

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
| `assistant-footer` (focus-within only) | `composio.css` / `routines.css` |
| `ds-modal-stage-fullscreen` | `composio.css` (`:focus-within` + `@media (hover: none)`) |
| BYOK info tooltip | `artifacts.css` (`:focus-within`) |
| inline agent Cancel label | `entry-layout.css` (`:focus-within` + `@media (hover: none)`) |
| `pet-codex-adopt-btn` | `library.css` (`@media (hover: none)` — 카드 애니 always-on 아님) |

### 5.4 Drive 모달 시각 polish (색 · 여백 · 타이포)

파일: `apps/web/src/styles/viewer/tools.css` — **CSS only**, hit-target 확대·마크업 변경 없음.

| 영역 | 변경 |
|------|------|
| Header | padding↑ · 제목 `text-strong`/650 · 부제 `text-muted` + max-width |
| Search | 여백·높이 · `:focus-within` accent ring · placeholder `text-soft` |
| List/rows | gap/padding · 선택 행 soft accent · filename stem strong / ext muted |
| Footer (picker) | soft top border · subtle bg mix · current-label uppercase |
| Scope sidebar | ~188px · soft bg · group label uppercase `text-soft` · active item accent tint |
| Import tabs/crumb | 여백 · active tab accent · crumb current strong / sep soft |
| Import cards | 카드 padding·thumb 높이 · selected soft accent · name 600/`text-strong` |
| Import footer | soft border + subtle bg · cancel muted · attach accent weight |
| Select option desc | `text-soft` · 11px |

원칙 준수: 검색 clear/submit·modal-back **28px 유지** · 전역 focus 재선언 없음 · dashed 장식 없음.

### 5.5 Empty / section title · typography · spacing (후속)

| 대상 | 파일 | 변경 |
|------|------|------|
| `.library-empty-title` | `library.css` | 18/600/`text-strong` (designs-empty 패턴) |
| `.df-empty-title` | `design-files.css` | 18/600/`text-strong` |
| `.app .chat-empty-title` | `routines.css` | 14.5/600/`text-strong` (인패널 밀도 유지) |
| `.connector-drawer-titles h2` | `drawer.css` | sans · `text-strong` |
| `.connector-drawer-section-title` | `drawer.css` | `text-faint` → `text-soft` |
| `.plugins-home__design` | `plugins-home.css` | **serif 유지** (showcase display — sans 시도 되돌림) |
| `.msg.user .user-actions` | `chat.css` | min-height 20 → **28** (copy btn geometry) |
| background-runs copy/detail/open | `teamver.css` | gap·font-size·open min-height 28 |
| `.teamver-latest-publish-chip` | `teamver.css` | px·min-height 22 · focus-visible |
| `.design-card-embed-chips` | `drawer.css` | gap/margin 6 |
| `.staged-remove` | `chat.css` | 14→**18** (chip 22 안) · `text-soft` |
| `.connector-drawer-close` | `drawer.css` | 32→**28** (전역 focus만 — 중복 outline 제거) |
| `.connector-drawer-eyebrow` | `drawer.css` | `text-soft` |
| `.newproj-title` / footer | `artifacts.css` | strong / soft tokens |
| Designs toolbar search clear/icon | `connectors.css` | soft 토큰 (중복 focus-visible 제거) |
| chat-history placeholder | `composio.css` | `text-soft` |
| home-hero footer select | `home-hero.css` | group-label **faint** · DS group **muted mix** · description **muted** (soft 일괄 되돌림) |
| recent-projects card name/time/sep | `recent-projects.css` | name 600/`text-strong` · time/sep `text-soft` |
| design-card meta | `drawer.css` | meta gap 2→4 · meta-time `text-soft` |
| composer placeholder / chrome | `chat.css` · `routines.css` | placeholder `text-soft` · icon/send/session **28** · hint는 **color-mix 밀도 유지** |
| settings section / notify / language | `artifacts.css` | h3 `text-strong` · notify hint soft · language tile strong/soft |
| toast details | `routines.css` | **opacity 0.85 유지** (다크 toast에서 `text-soft` 강제 ❌) · margin 6 유지 |
| run-recovery banner | `teamver.css` | title/copy bg-runs와 정렬 (`text-strong` · 0.8125rem) |
| plugins-home search/heading/facet | `plugins-home.css` | icon·placeholder·facet `text-soft` · heading gap 2→4 |
| plugin inputs placeholder | `plugin-rail.css` | `text-soft` |
| examples search | `composio.css` | icon·placeholder `text-soft` |
| chat-history chrome 잔여 | `composio.css` | search icon/clear · menu-count · conv meta → `text-soft` |
| modal closes | `composio.css` · `new-project-modal.css` · `plugins-view.css` | ds/newproj/import close **32→28** |
| new-project-modal title | `new-project-modal.css` | **serif 유지** (display/ceremony — 섹션 sans와 구분) |
| pet-codex adopt | `library.css` | `@media (hover: none)` reveal |

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
| toast details → `text-soft` | 다크 toast(`text-strong` bg + `bg` 전경)에서 라이트 팔레트 회색 강제 | **opacity 0.85 복구** |
| composer-hint → `text-soft` / color-mix 제거 | 의도된 밀도 디밍 상실 | **color-mix(muted) 복구** · base `text-faint` |
| home-hero select desc/group soft 일괄 | secondary·tertiary 계층 평탄화 | description **muted** · group **faint/mix** |
| new-project-modal title sans | display/ceremony를 섹션 chrome처럼 취급 | **serif 복구** |
| plugins-home__design sans | showcase display 타이포 과잉 | **serif 복구** (섹션 title sans는 유지) |
| connector-close / toolbar-clear 커스텀 focus | `primitives.css` `button:focus-visible`와 중복 | outline 블록 제거 |
| `text-faint`→`text-soft` 추가 일괄 | 계층·전역 placeholder(`text-faint`)와 불일치 | **추가 soft 치환 중단** (검색 chrome soft는 유지) |

---

## 6.1 리뷰 결론 (2026-08-03)

| 판정 | 항목 |
|------|------|
| **KEEP** | 28px chrome(composer/modal close/connector) · touch/focus-within · Drive 모달 · 홈 섹션 sans · empty titles · bg-runs · pet adopt touch · publish chip · kanban 제거(버그픽스) |
| **REVERT 완료** | toast soft · composer-hint soft · hero soft 일괄 · newproj/plugins design serif · 중복 focus-visible |
| **포화** | 새 soft/28/여백 polish 패스 **중단**. 다음 작업은 §7 QA 또는 실제 회귀만. |

Placeholder 정책: 전역 `input::placeholder`는 `text-faint` · **검색 필드**만 `text-soft` 허용.

### 6.2 리뷰 후 보완 (2026-08-04)

| 항목 | 조치 |
|------|------|
| `.workspace-tab__close` | `:focus-within`으로 키보드 포커스 시 표시 (§7.1) · 중복 outline 제거 |
| `.chat-session-trigger` / `.chat-active-conversation-rename` / `.chat-history-search-clear` | 전역 `button:focus-visible`와 겹치는 outline 재선언 제거 (색/bg만 유지) |
| `.od-toast-details` | opacity 유지 이유 주석 (tone별 전경 상속) |

soft/28 추가 패스는 계속 **중단**.

## 7. 검증 체크리스트

### 7.1 키보드

- [x] Tab으로 embed bar 로그인/Teamver 앱 링크 → accent ring 보임 — **CSS 보장** (`teamver.css`)
- [x] 프로젝트 카드 kebab → focus 시 보임 + Enter로 메뉴 — **CSS 보장** (`focus-within` / `focus-visible`)
- [x] workspace 탭 close → focus 시 opacity 1 — **CSS 보장** (`:focus-within`, 2026-08-04 보완)

### 7.2 마우스 (회귀)

- [x] 카드 kebab/close는 hover 전 숨김 유지 — **CSS** (`opacity: 0` + hover)
- [x] Design Files 행 메뉴/체크는 hover 전 숨김 유지 — **CSS**
- [x] composer + Send + session trigger 높이 정렬(28px) — **CSS** (`chat.css` / `.app`)

### 7.3 터치 / coarse pointer

- [x] 프로젝트 카드 kebab·close 항상 탭 가능 — **CSS** (`@media (hover: none)`)
- [x] Design Files ⋯ / 체크 탭 가능 — **CSS**
- [ ] Canvas slide launch 템플릿 카드 설명 overlay 가독 — **수동**
- [x] context chip / board pod remove 탭 가능 — **CSS**

### 7.4 Stacking · tooltip

- [x] toast 떠 있을 때 workspace 메뉴 클릭 가능 — **CSS** (menu z-index 1300 > toast 1200)
- [ ] plus-menu 긴 이름·background runs 긴 프로젝트명 hover/long-press `title` — **수동**

---

## 8. 남은 후보 (다음 루프 — 판단 후만)

| 후보 | 메모 |
|------|------|
| `assistant-footer` touch always-on | **하지 않음** — focus-within + data-last/streaming으로 충분 |
| Pet Codex preview touch | 전 카드 애니 always-on ❌ · **adopt만 터치** (§5.3) |
| `ds-modal-stage-fullscreen` | **터치 fallback 추가됨** (§5.3) |
| Drive 모달 색·여백 | **완료** — §5.4 (`tools.css`) |
| DesignsTab status 열(kanban) | **제거** — remount→`/raw` 반복·번쩍임 (00 2026-08-03) |
| 홈 섹션 제목 serif | **sans 통일** — recent-projects / plugins-home / entry-section (hero serif 유지) |
| empty titles · bg-runs · user-actions | **완료** — §5.5 |
| home/recent/composer/settings/toast | **완료** — §5.5 |
| plugins/examples/history · modal close 28 | **부분 유지** — newproj title serif 복구 · 검색 soft·close 28·pet adopt 유지 |
| Main↔Design 스타일 통일 | **분석·보류** — [55](./55_Main_Teamver_vs_Design_UI_스타일_통일_분석.md) (§9) |
| entry topbar 32 | **유지** — `--entry-topbar-h: 44` 계약 |
| 추가 soft/28 polish 패스 | **중단 (포화)** — §6.1 |

새 변경 시 **§3 원칙**으로 먼저 기각한 뒤 코드·본 문서 §4–5·[00](./00_구현_내역_누적.md)를 함께 갱신한다.

---

## 9. 파일 인덱스

| 경로 | 역할 |
|------|------|
| `apps/web/src/styles/primitives.css` | 전역 `button:focus-visible` |
| `apps/web/src/styles/teamver.css` | embed focus · workspace menu z-index · escape Design Home focus |
| `apps/web/src/styles/chat.css` | rename / copy / header 28 / queue 24 |
| `apps/web/src/styles/shell.css` | tab close · list close · touch |
| `apps/web/src/styles/home/home-hero.css` | active-clear · type-chip close |
| `apps/web/src/styles/home/recent-projects.css` | menu anchor z-index |
| `apps/web/src/styles/workspace/drawer.css` | card kebab/close · DS overlay · empty CTA |
| `apps/web/src/styles/workspace/design-files.css` | row menu/check |
| `apps/web/src/styles/workspace/artifacts.css` | template delete |
| `apps/web/src/styles/viewer/composio.css` | history clear/del · example overlay · assistant-footer focus-within |
| `apps/web/src/styles/viewer/plugin-rail.css` | context chip remove |
| `apps/web/src/styles/viewer/core.css` | board pod remove |
| `apps/web/src/styles/viewer/library.css` | library DS edit |
| `apps/web/src/styles/viewer/tools.css` | canvas slide launch overlay |
| `apps/web/src/styles/viewer/routines.css` | shell compact tabs · DS picker expand · assistant-footer |
| `apps/web/src/components/ComposerPlusMenu.tsx` | item `title` |
| `apps/web/src/components/DesignsTab.tsx` | empty CTA `title` |
| `apps/web/src/components/HomeHero.tsx` | active-label `title` |
| `apps/web/src/components/DesignSystemPicker.tsx` | option `title` |
| `apps/web/src/components/DesignFilesPanel.tsx` | folder path `title` |
| `apps/web/src/components/PluginLoopHome.tsx` | card title `title` |
| `apps/web/src/components/ChatComposer.tsx` | staged plugin name `title` |
| `apps/web/src/teamver/components/TeamverBackgroundRunsBanner.tsx` | truncated `title` |
| `apps/web/src/teamver/components/TeamverDrivePickerModal.tsx` | folder card/row `title` |
| `apps/web/src/teamver/components/TeamverDriveImportModal.tsx` | folder row `title` |
| `apps/web/src/teamver/components/TeamverDriveTargetSelect.tsx` | option desc `title` |

---

## 10. 배포 노트

- 코드만 `staging` push. **OD는 ns_cicd 없음** → 실서버 반영은 `deploy/teamver/deploy.sh --staging` (또는 rolling) 별도.
- FE 정적 CSS/TSX만 변경 → daemon/schema 마이그레이션 없음.

# 61-1 구현현황 — Home 슬라이드 생성 마법사 P0

**설계:** [61-1-구현설계](./61-1-구현설계-[Home_슬라이드_생성_마법사_P0].md)  
**전략:** [61](./61_Home_슬라이드_생성_마법사_UX_전략.md)

## 체크리스트

- [x] 루트 UI 백업 `_archive/home-root-ui-2026-08-13`
- [x] 구현설계 문서
- [x] `TeamverHomeCreateHero`
- [x] `TeamverHomeSlideCreateModal` (2스텝 + stepper complete)
- [x] `HomeView` slideOnly 분기 · gallery → wizard
- [x] i18n / CTA 「슬라이드 만들기」·「템플릿 사용」(deck 상세 기존)
- [x] 테스트 `tests/teamver-home-slide-create-modal.test.tsx`
- [x] commit · push (`staging`) — `1370716cd`
- [x] placeholder-only (팁 아이콘 제거) · Home 퀵설정 구체 기본값

## 진행 메모

- 2026-08-13: CreateHero CTA hover가 전역 `button:hover`에 배경이 지워지던 문제 수정 (`button.teamver-home-create-hero-cta` + accent-hover). 마법사는 `teamver-drive-picker-backdrop` + `createPortal(document.body)` — 존재하지 않던 import-backdrop 때문에 Home 아래에 패널이 붙던 문제.
- 2026-08-13: 히어로 제목 영역은 마법사 도입 전 HomeHero와 동일 — `TeamverLogo` 워드마크 + `teamver.homeHero.subtitle`. CTA `+`는 텍스트가 아니라 `Icon plus` (원형 칩 + 필 버튼).
- 2026-08-13: Home wizard / 갤러리 Use → `selectedDeckTemplateId`를 metadata+pluginInputs+EntryShell로 이중 전달해 daemon Clone이 항상 타도록 보강. 내용 스텝에 선택 스타일 칩.
- 2026-08-13: 백업·설계·P0 코드 착수. slideOnly에서만 히어로 CTA + 마법사. OD HomeHero 유지.
- 2026-08-13: placeholder 짧은 안내만. 예시 팁 UI 철회. 퀵설정 기본값 팀/보통/professional.
- 2026-08-13: slide-only Community 갤러리 기본 facet = `deck` + `creative-decks`(크리에이티브 덱). 페이지네이션으로 bucket이 나중에 생기면 재적용; 사용자가 「전체」로 돌리면 재적용하지 않음. 단독 scene bucket일 때도 preferred default는 All로 강제 클리어하지 않음.

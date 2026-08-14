# 61-1 구현설계 — Home 슬라이드 생성 마법사 P0

**SSOT:** [61_Home_슬라이드_생성_마법사_UX_전략.md](./61_Home_슬라이드_생성_마법사_UX_전략.md)  
**범위:** `slideOnlyMvp` embed Home만. OD 데스크톱 HomeHero는 유지.  
**백업:** `apps/web/src/_archive/home-root-ui-2026-08-13/` (히어로·HomeView·갤러리·CSS)

---

## 1. 목표 (P0)

| 항목 | 동작 |
|------|------|
| Home 히어로 | 장문 composer 대신 **「＋ 새 슬라이드」** 단일 CTA |
| 마법사 | 2스텝: **내용**(첨부·퀵·textarea) → **템플릿** |
| CTA 문구 | 항상 **「슬라이드 만들기」** (템플릿명 없음) |
| 갤러리 「사용」 | 마법사 오픈 · 템플릿 prefill · 스텝2 ✓ · 내용만 |
| Canvas 버튼 | Home에 **없음** |
| Create API | 기존 `onSubmit` / Canvas 바인딩 재사용 (`buildSlideOnlyDeckTemplateCreateBinding`, `canvasCreateSlidesRunPrompt`) |

---

## 2. 화면·상태

### 2.1 Home (slideOnly)

```
[＋ 새 슬라이드]     → open wizard (entry=new, step=content, template=L1 default, 첨부 비움)
닫기 / 생성 완료     → 템플릿 선택·첨부·드라이브 피커·last-explicit 핀 초기화 (다음 「새 슬라이드」에 이전 픽·첨부가 남지 않음)
Recent strip         → unchanged
템플릿 갤러리        → 상세 → 사용 → open wizard (entry=template, step=content, template=id, step2=complete, 첨부 비움)
```

히어로 잠금은 마법사 도입 전 HomeHero와 동일: `TeamverLogo` 워드마크 + `teamver.homeHero.subtitle`. CTA는 `Icon plus` + 「새 슬라이드」. 마법사는 `createPortal` + `teamver-drive-picker-backdrop`(고정 오버레이).

### 2.2 마법사 상태

| state | 의미 |
|-------|------|
| `open` | 모달 표시 |
| `entry` | `new` \| `template` |
| `step` | `content` \| `template` |
| `templateComplete` | entry=template 또는 스텝2에서 선택 확정 후 true |
| `prompt` | textarea |
| `quickSettings` | Canvas와 동일 스키마 재사용 |
| `stagedFiles` / `stagedDriveAssets` | HomeView stage. 닫기·생성 완료·「새 슬라이드」·갤러리 사용 시 비움 |
| `selectedTemplateId` | canvas template options |

**Stepper:** entry=template이면 내용 화면에서도 `(2) 템플릿`을 `complete`로 표시하고 푸터는 항상 「슬라이드 만들기」(L1 기본으로 바꿔도 동일). `(2)` 클릭 시에만 템플릿 패널. 스텝·다음 CTA 카피는 모두 「템플릿」. 내용 스텝 푸터에 변경 칩을 두지 않음(61 안 B). 갤러리 진입에서 스텝2 카드를 고르면 내용 + ✓로 복귀. 명시 픽 제목(또는 기본 라벨)은 스텝퍼에 표시.

### 2.3 Confirm

- `canvasCreateSlidesRunPrompt(title, null, prompt, quickSettings)` (+ 첨부가 있으면 source brief에 파일명 요약 가능)
- `buildSlideOnlyDeckTemplateCreateBinding(selected, { slideOnlyMvp: true })`
- `onSubmit({ prompt, pluginId, pluginInputs, projectKind:'deck', projectMetadata, attachments, driveAttachments, conversationMode:'design', skipDiscovery via metadata })`
- 빈 prompt + 첨부 없음 + 퀵만: **허용** (placeholder 강조). L1 템플릿 프리셀렉트.

---

## 3. 파일

| 신규 | 역할 |
|------|------|
| `teamver/components/TeamverHomeCreateHero.tsx` | 단일 CTA |
| `teamver/components/TeamverHomeSlideCreateModal.tsx` | 2스텝 모달 |
| `styles` (viewer/tools.css 또는 teamver 전용 블록) | 모달·CTA — Canvas launch 클래스 **재사용 가능**하면 복제 최소화 |
| `tests/.../home-slide-create-modal*.tsx` | stepper·entry·CTA 문구 |

| 수정 | 역할 |
|------|------|
| `HomeView.tsx` | slideOnly: Hero→CreateHero, modal mount, gallery use→wizard |
| `i18n` ko/en (+ embedUiLabel) | 새 카피 |
| `useCanvasSlideLaunchTemplates` | `active: canvasLaunch \|\| homeWizard` |

**비목표:** Canvas 모달과 공용 셸 리팩터, OD HomeHero 삭제, 히어로 freeform 완전 코드 제거(slideOnly에서만 미마운트).

---

## 4. 갤러리 CTA 카피

slideOnly 상세 primary: 「템플릿 사용」 (기존 「플러그인 사용」 override).  
동작은 `routePluginUse` → wizard (applyPlugin 선행 없음 — confirm 시 binding).

### 4.1 Community 기본 facet (slideOnly)

`SLIDE_ONLY_COMMUNITY_FACET_SELECTION` = `{ category: 'deck', subcategory: 'creative-decks' }`.  
첫 페이지에 creative-decks가 없어도 catalog 확장 시 한 번 적용. 사용자 All/클리어 이후에는 재적용하지 않음.

---

## 5. 롤백

1. `_archive/home-root-ui-2026-08-13`에서 HomeView/HomeHero 등 복원  
2. 또는 feature: slideOnly에서 `TeamverHomeCreateHero` 분기 제거 → 기존 HomeHero

---

## 6. 테스트

- slideOnly Home: CreateHero visible, HomeHero composer 없음  
- 새 슬라이드 → step content → next → template → 만들기  
- 템플릿 사용 → content + stepper step2 complete · primary 「슬라이드 만들기」  
- stepper (2) 클릭 → template panel  
- confirm payload: selectedDeckTemplateId, skipDiscoveryBrief  

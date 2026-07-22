# embed 슬라이드 품질 — 원인 분석 및 개선 로드맵

**작성:** 2026-07-22  
**범위:** Teamver embed slide-only MVP (`staging`)  
**관련 SSOT:** [40 OD upstream main 반영 검토](./40_OD_upstream_main_반영_검토.md) · [13 embed 슬라이드 MVP 기능게이트](./13_embed_슬라이드_MVP_기능게이트.md) · [29 BYOK api mode vs runs 아키텍처](./29_BYOK_api_mode_vs_runs_아키텍처.md)

---

## 1. 배경 — 사용자가 체감한 증상

2026-07 중순 이후 embed에서 슬라이드 생성 시 다음이 보고되었다.

| 증상 | 예시 |
|------|------|
| Quick brief 미표시 / 렌더 실패 | "The assistant sent a question form that could not be rendered" |
| 입력하지 않은 지시 자동 첨부 | `[Deliverable instruction]` 블록이 사용자 메시지에 붙음 |
| 미리보기가 HTML 스크롤처럼 보임 | prev/next 없이 `min-height:100vh` 섹션 세로 스크롤 |
| `incomplete_output` / 빈 미리보기 | 덱이 끝까지 저장되지 않음 |
| **품질 저하** | 예전 대비 인라인 스타일·단순 레이아웃 덱, 1~2분 내 완료 |

이 문서는 **원인을 upstream vs Teamver로 분리**하고, **품질 개선 방향**을 고정한다.

---

## 2. 결론 요약

| 질문 | 답 |
|------|-----|
| 공식 OD `main` 최근 커밋을 통째로 반영해서 품질이 떨어졌나? | **아니오.** Teamver는 전체 merge를 하지 않으며, 선별 포팅은 파서·차트 등 **보강** 위주다. |
| Teamver 자체 수정이 원인인가? | **대부분 예.** 완료율·안정성을 위해 도입한 **compact API prompt**와 embed UX 수정이 품질·버그의 중심이다. |
| 1분 30초 완료는 AI가 일을 안 한 것인가? | **아니다.** API 단일 스트리밍 + no-head compact 덱이면 내용이 채워진 6~8장이 1~2분에 나오는 것이 정상이다. |
| 품질 개선 가능한가? | **가능.** full skeleton 복귀 없이 **중간 스펙**(레이아웃 어휘·DS·brief 반영)으로 조정한다. |

---

## 3. 원인 분해

### 3.1 공식 OD(upstream) — 직접 원인 아님

[40 OD upstream main 반영 검토](./40_OD_upstream_main_반영_검토.md) 원칙:

- `staging` ↔ `origin/main` divergence가 크므로 **전체 merge 금지**
- 필요한 커밋만 **수동 포팅**

품질과 관련해 이미 반영된 upstream (2026-07-20 루프 5 등):

| 커밋 | 내용 | Teamver에 미친 영향 |
|------|------|---------------------|
| `bdc66c978` / `ebada4cac` | 차트 `--v`/`--max`, Mermaid 다크 테마 | **품질 향상** (full deck 경로) |
| `3e5725e54` / `188ae72f8` | question-form 파서 안정화 | **렌더 실패 감소** |
| `4b660237c` | slim system-prompt charter | **전체 전환 보류**, 문구 축약만 일부 반영 |

즉 upstream 반영이 “인라인 스타일 단순 덱”의 **직접 원인은 아니다.**

### 3.2 Teamver 자체 수정 — 주원인

#### A. 품질(심플·인라인 덱)

| 변경 | 커밋·위치 | 의도 | 부작용 |
|------|-----------|------|--------|
| `composeTeamverSlideApiPrompt()` | `fb216ed22`, `packages/contracts/src/prompts/system.ts` | API/BYOK에서 daemon tool 없이 덱 완료 | skill seed·discovery·full charter 제거 |
| `DECK_FRAMEWORK_DIRECTIVE_COMPACT` | `packages/contracts/src/prompts/deck-framework.ts` | `<head>`/skeleton 복사 금지, body-first | 인라인 `section.slide` 예시만 남음 |
| `summarizeApiModeSkillBody()` | `system.ts` | template/layouts **Read·복사** 지시 제거 | 레이아웃 어휘까지 축약 |

**배경:** full deck skeleton(~11KB)을 API 모드에 넣으면 모델이 CSS/JS를 먼저 쓰다 `</html>` 전에 끊겨 `auto_continue_incomplete_output`·빈 미리보기가 반복됐다. **“짧고 끝까지 나오는 덱”**을 우선한 trade-off다.

#### B. UX·워크플로 버그 (대부분 수정 완료, 2026-07-22)

| 증상 | 원인 | 수정 커밋(대표) |
|------|------|-----------------|
| Deliverable 자동 첨부 | `ProjectView` slide-only 첫 메시지 directive | `1f63245b3` |
| Quick brief 스킵 | `skipDiscoveryBrief: true` | `c2b625696` |
| question-form 파싱 실패 | JSON 안에 prose/HTML | `e94430cd6` |
| turn-1 덱이 artifact로 저장 | persist 경로 오인 | `88390d79b`, `e94430cd6` |
| prev/next 없이 스크롤 | stacked `section.slide` + deck bridge 미적용 | `0f17e6d33` |

#### C. 산출물 형태 (의도된 compact contract)

정상 compact 덱의 특징:

- 5~8장 `section.slide`, **인라인 style**
- `<head>` / scale-to-fit JS / print CSS **없음**
- `artifact type="deck"` (not `text/html`)
- 호스트 `srcdoc` bridge가 prev/next·한 장씩 표시 제공

이 형태는 **버그가 아니라 현재 API contract의 설계 결과**다. 다만 **시각 풍부함은 full skill+template 경로보다 낮다.**

---

## 4. upstream vs Teamver 영향도 매트릭스

| 영역 | upstream 선별 반영 | Teamver 전용 |
|------|-------------------|--------------|
| question-form 안정화 | 도움 | turn-1 schema·persist 차단 추가 |
| 차트/Mermaid 프롬프트 | full deck 경로에 도움 | compact 경로에는 layout 예시 부족 |
| slim charter | 문구만 일부 | slide-only scope·lean API composer |
| embed artifact contract | 해당 없음 | `type="deck"`, normalization, streaming rule |
| 미리보기 navigation | 해당 없음 | `forceRevealSlide`, `looksLikeDeck` |

---

## 5. 품질 개선 로드맵

**원칙:** `incomplete_output` 재발을 막는 **no-head·body-first**는 유지한다. full `DECK_FRAMEWORK_DIRECTIVE` + skeleton을 API 경로에 되돌리지 않는다.

### Phase 1 — prompt 중간 스펙 (진행 중)

| 항목 | 내용 | 코드 위치 |
|------|------|-----------|
| **P1-1** compact layout vocabulary | simple-deck 8종 레이아웃을 **인라인 style** 예시로 주입 (cover, body, big-stat, 3-column, pipeline, quote, closing) | `deck-framework.ts` |
| **P1-2** skill 요약 완화 | `summarizeApiModeSkillBody`가 theme rhythm·layout 이름은 유지, template 복사 지시만 제거 | `system.ts` |
| **P1-3** Quick brief 답 반영 | turn 2+에서 `audience` / `tone` / `must_include`를 덱 카피·톤·슬라이드 구성에 **필수 반영** | `system.ts` streaming rule |
| **P1-4** Design System 강화 | compact 모드에서 active DESIGN.md 토큰을 인라인에 bind (기존 블록 문구 강화) | `composeTeamverSlideApiPrompt` |

### Phase 2 — 검증·관측

1. staging embed에서 **새 프로젝트** → turn-1 Quick brief → turn-2 deck.
2. 체크: prev/next, 6~8장, audience/tone 반영, 단색 박스만 반복하지 않는지.
3. 회귀: `incomplete_output`, turn-1 `deck.html` persist, question-form 파싱.
4. 테스트: `packages/contracts/tests/system-prompt-api-mode.test.ts`, web artifact/srcdoc 관련 vitest.

### Phase 3 — 보류·주의

| 항목 | 판단 |
|------|------|
| full `DECK_FRAMEWORK_DIRECTIVE` API 복귀 | **금지** — truncation 재발 위험 큼 |
| upstream `main` 전체 merge | **금지** — SSO, S3, embed 정책 회귀 |
| `4b660237c` full slim charter | **샘플 회귀 후** — background/댓글 수정과 충돌 가능 |
| daemon tool 경로(runs) 품질 | embed API와 별도; 필요 시 non-plain `DECK_FRAMEWORK_DIRECTIVE` 유지 |

---

## 6. 참고 커밋 타임라인 (staging, 2026-07-22 기준)

```
0f17e6d33 fix(teamver): enable prev/next for stacked section.slide decks
e94430cd6 fix(teamver): restore Quick brief when question-form JSON fails
60dcaa9ef fix(teamver): centralize deck contract normalization end-to-end
3e6704d52 fix(teamver): require deck artifact streaming
1f63245b3 fix(teamver): stop appending deliverable text to user messages
fb216ed22 fix(teamver): dedicated lean API prompt so model completes slide decks
```

upstream 선별 반영 이력은 [40 OD upstream main 반영 검토](./40_OD_upstream_main_반영_검토.md) §0·§0-1 참고.

---

## 7. 관련 파일 인덱스

| 파일 | 역할 |
|------|------|
| `packages/contracts/src/prompts/system.ts` | `composeTeamverSlideApiPrompt`, streaming rules, skill 요약 |
| `packages/contracts/src/prompts/deck-framework.ts` | `DECK_FRAMEWORK_DIRECTIVE` vs `_COMPACT` |
| `apps/web/src/components/ProjectView.tsx` | artifact persist, deliverable directive |
| `apps/web/src/runtime/srcdoc.ts` | deck bridge, `forceRevealSlide` |
| `apps/web/src/artifacts/question-form.ts` | tolerant JSON parse |
| `design-templates/simple-deck/references/layouts.md` | full 경로 레이아웃 SSOT (API는 인라인 축약본 주입) |

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-22 | Phase 1 구현 — compact inline layout vocabulary, skill 요약 완화, quick-brief turn-2 binding, DS mandatory 문구 |
| 2026-07-22 | Phase 1 리뷰 — slideCount 6–8 정합, wireframe 예시·layout vocabulary 충돌 완화, deliverable directive 데드코드 제거, 회귀 테스트 추가 |
| 2026-07-22 | 미리보기 UX — stacked deck pan(휠/드래그), center zoom origin, slide flex center, compact vocabulary 타이포 1920×1080 상향 |

---

## 9. Phase 1 리뷰 메모 (2026-07-22)

### 확인된 아키텍처

- Teamver embed slide-only **API 모드**는 `apps/web` `ProjectView`가 `@open-design/contracts` `composeSystemPrompt()`를 **클라이언트에서** 호출한다. Phase 1 prompt 변경은 이 경로에 직접 적용된다.
- `apps/daemon` `composeSystemPrompt()`는 CLI/plain-stream 에이전트용 별도 구현이며 `composeTeamverSlideApiPrompt`를 **아직 사용하지 않는다**. embed API 경로와 무관하나, 향후 daemon plain+slide-only 정합이 필요하면 contracts composer를 import하거나 동일 분기를 포팅해야 한다.

### 수정한 불일치·개선

| 이슈 | 조치 |
|------|------|
| slideCount `5–7` vs `6–8` 혼재 | `deriveApiModePreflight`, skill seed override를 **6–8**로 통일 |
| compact wireframe 예시가 두 개의 동일 흰 슬라이드 | dark/light 2장 wireframe + “literal 복사 금지” 문구 |
| `SLIDE_SKIP_ALL_DELIVERABLE_DIRECTIVE` 데드코드 | 제거; legacy strip regex만 유지 |
| `appendSlideDeliverableDirective` prop 무효 | `QuestionForm` / `QuestionsPanel`에서 제거 |
| 테스트 공백 | `deck-framework-compact.test.ts`, skill rhythm 보존 테스트 추가 |

### 검증

- `pnpm --filter @open-design/contracts test` — 323 tests passed
- `pnpm --filter @open-design/web exec vitest run tests/artifacts/question-form.test.ts tests/components/QuestionForm.test.tsx` — 40 tests passed
- `pnpm guard` — 기존 repo-wide 위반(잔여 JS, dependency exact pin, cross-app test import)은 **이번 변경과 무관**한 선행 이슈

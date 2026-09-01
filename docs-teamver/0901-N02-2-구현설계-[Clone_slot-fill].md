# 0901-N02-2 구현설계 — Clone slot-fill

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
맥락: [54-2](./54-2-구현현황-[MiniMax_품질루프].md) Template Clone content-fill

## 목표

first-fill에서 모델은 **JSON outline만** 내고, 서버/FE가 기존 `buildTemplateClonedDeckHtml`로 템플릿 shell에 치환한 HTML을 최종 저장본으로 쓴다. 모델이 `<section class="slide">` 전체를 다시 쓰지 않는다.

## 데이터 흐름 (P0)

```
[오늘]
seedTemplateClonedDeck → LOOK seed deck.html
  → AI content-fill (HTML artifact) → persist + look merge + heal

[P0 목표]
seedTemplateClonedDeck → LOOK seed deck.html (유지)
  → AI JSON outline only
  → parse/sanitize → buildTemplateClonedDeckHtml(exampleHtml | seed, slides)
  → 동일 persist + official look merge + leftover heal
  → JSON 실패 1회 재요청 → 그래도 실패면 기존 HTML hybrid fallback (안전망)
```

정책 유지: outline 장수가 이김(max 20). 템플릿 demo 페이지 수/순서를 미러하지 않음.

## JSON 계약

### 스키마 (contracts)

새 타입·파서 — `packages/contracts/src/template-clone-fill.ts` (또는 인접 `template-clone-outline.ts`):

```ts
export type TemplateCloneSlideContent = {
  title: string;
  body?: string;
  roleHint?: TemplateCloneShellRole; // optional
};

export type TemplateCloneDeckOutline = {
  title: string;
  slides: TemplateCloneSlideContent[];
};
```

- `parseTemplateCloneDeckOutline(raw: unknown | string): TemplateCloneDeckOutline | null`
  - 문자열이면 JSON 추출(코드펜스·앞뒤 잡문 허용, 첫 `{…}` 시도).
  - `slides` 배열 필수, 길이 1…20.
  - 각 slide `title` trim 필수; 빈 title 슬라이드 drop.
  - `body`는 string만. 줄바꿈 = 슬롯 줄.
  - `roleHint`는 `TemplateCloneShellRole` 화이트리스트만; 아니면 omit.
  - `sanitizeTemplateCloneDeckTitle`로 deck `title` 정리.
- `outlineLooksLikeHtmlDump(text)` — `<!doctype` / `<section class="slide"` / `<html` 감지 시 null + fallback 경로.

금지 필드: HTML 덤프, `<style>`, SVG/motif 재작성. 파서가 만나면 reject.

### 모델 출력 표면

P0는 **채팅 텍스트 JSON** (artifact HTML 아님). 선택:

1. **권장:** plain JSON 또는 ` ```json ` 펜스만. FE/daemon이 파싱.
2. 기존 `<artifact type="deck">`는 JSON 모드에서 **금지**. 파서가 HTML이면 fallback.

## 호출 지점

| 계층 | 파일 | 변경 |
|------|------|------|
| contracts 타입/파서 | `packages/contracts/src/template-clone-fill.ts` (+ export) | `roleHint`, `parseTemplateCloneDeckOutline`, `buildTemplateClonedDeckHtml`에 roleHint 전달 |
| shell fill | 동 파일 `fillSlideShell` / `inferTemplateCloneContentRole` | `roleHint` 있으면 infer보다 우선(유효할 때) |
| compact prompt | `packages/contracts/src/prompts/deck-framework.ts` | `DECK_FRAMEWORK_DIRECTIVE_COMPACT_FOR_TEMPLATE_FILL` → JSON-only 계약 |
| API system | `packages/contracts/src/prompts/system.ts` | `composeTeamverSlideApiPrompt({ templateCloneContentFill })` fill 권한을 JSON으로 |
| daemon template wrap | `apps/daemon/src/prompts/selected-deck-template.ts` | CREATE fill → JSON-only |
| FE seed/hard rules | `apps/web/src/teamver/templateCloneContentFill.ts` | `buildTemplateCloneContentFillSeed` / `templateCloneContentFillHardRules` → JSON-only; HTML 금지 문장 |
| FE instruction | `apps/web/src/components/ProjectView.tsx` | `slideTemplateCloneContentFillInstruction` 동일 |
| resume | `apps/web/src/runtime/resume.ts` | fill hard rules restamp를 JSON 버전으로 |
| persist 분기 | `ProjectView` HTML persist (~fill path) | fill 플래그 on이면: JSON parse → `buildTemplateClonedDeckHtml` → 기존 merge/heal 체인. HTML artifact면 fallback 카운트 |
| LOOK seed | `apps/daemon/src/template-clone-deck.ts` | **유지**. exampleHtml은 계속 seed + slot-fill 입력 |
| 신규 HTTP (선택) | `POST /api/projects/:id/template-clone-slot-fill` | body: `{ outline }` → server-side build+write. FE가 파싱만 하고 이 API로 맡겨도 됨. P0는 FE 로컬 build도 허용(example/seed를 이미 가진 경우) |

### exampleHtml 소스

slot-fill 입력 shell:

1. 우선: 프로젝트에 시드된 `deck.html`(LOOK seed) — 이미 템플릿 shell.
2. 또는 daemon이 plugin `example.html`을 다시 읽어 `buildTemplateClonedDeckHtml` (기존 seed와 동일 소스).

P0: FE가 seed된 `deck.html`을 읽어 outline으로 재치환해도 됨(제목/본문만 덮어씀). motif 유지를 위해 **AI HTML로 덮지 않는 것**이 핵심.

## Fallback (P0 안전망)

1. 응답이 JSON이 아니거나 schema fail → **한 번만** JSON 재요청 턴(짧은 repair prompt).
2. 재요청도 fail 또는 HTML dump → 기존 hybrid content-fill(HTML artifact) 경로로 저장. 플래그 `templateCloneSlotFillFallback: true`(metadata, optional).
3. P1에서 fallback 제거.

강제 전환·MiniMax 기본 경로 변경 없음.

## overflow / leftover

상위설계 표 유지. 구현 메모:

- cards: 내용 줄 수만큼만 카드 채움. 빈 칸 번호·빈 3열 금지.
- list: 기존 `replaceListItems` 동작 유지.
- heal 체인(`healAiGeneratedDeckMarkup` 등)은 저장 후 그대로. heal이 주제 카피 발명하지 않음.

## 테스트 계획 (빨간 스펙 우선)

| 스위트 | 내용 |
|--------|------|
| `packages/contracts/tests/template-clone-outline.test.ts` (신규) | parse 성공/실패, HTML dump reject, roleHint whitelist, max 20 |
| `template-clone-fill.test.ts` | roleHint → shell pick; JSON slides → motif class 유지·제목만 변경; outline 3장 → 3장 |
| `templateCloneContentFill.test.ts` | hard rules / seed에 JSON-only·HTML 금지 문구; `<!doctype` / `section.slide` 요구 문장 제거 |
| `system-prompt-api-mode.test.ts` | fill 모드가 JSON 계약 포함, HTML regenerate 문구 없음 |
| `selected-deck-template.test.ts` | wrap 문구 JSON-only |
| FE persist (최소) | fill 플래그 + JSON 응답 fixture → `buildTemplateClonedDeckHtml` 결과 persist mock |

MiniMax live E2E는 키 있을 때만. 키 없는 환경에서 가짜 live 금지.

## 슬라이스 구현 순서

| 순서 | 내용 | 완료 기준 |
|------|------|-----------|
| **B1** | contracts outline 타입·파서 + unit | parse/reject 초록 |
| **B2** | `roleHint` → pick/infer + fill 회귀 | motif 유지 fixture |
| **B3** | prompt/hard rules JSON-only (contracts + daemon + FE) | prompt 스위트 초록 |
| **B4** | ProjectView persist: JSON → build → 기존 heal/merge | fill path unit/integration |
| **B5** | JSON repair 1회 + HTML fallback | fallback fixture |
| **C (P1)** | 템플릿 id별 slot map | 별도 설계 |
| **D** | hybrid fallback 제거 | 별도 |

## Non-goals (이 설계 문서)

- 변환 코드 착수 범위 밖 문서만 남기지 말 것 — **B1부터 코드 PR로 이어감**. 이 문서는 호출 지점·스키마·테스트 SSOT.
- leftover 인덱스(`기둥 Z`) 확장과 bundling 금지.
- persist-split / `.slide { display:flex }` 강제와 bundling 금지.

## 성공 기준 (상위 재확인)

1. first-fill이 템플릿 shell class/motif/CSS를 유지하고 제목·본문만 바뀐다.
2. AI 출력 계약에 `<!doctype` / `<section class="slide"`가 없다 (unit).
3. outline 3장 → 결과 3장.
4. 빈 카드·칸 번호로 열을 맞추지 않는다.
5. 키 없는 환경에서 live 생성을 가짜로 돌리지 않는다.

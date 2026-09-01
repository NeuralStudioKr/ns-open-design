# 0901-N02-1 상위설계 — Clone slot-fill

기획 맥락: [54](./54_MiniMax_전환_기획_설계.md) · 현황: [54-2](./54-2-구현현황-[MiniMax_품질루프].md) Template Clone content-fill.

## 문제

선택 템플릿 적용은 순수 deterministic DOM slot-fill이 아니다.

현재 경로:

1. daemon `template-clone-deck`이 플러그인 `example.html`에서 LOOK seed를 만든다.
2. AI가 덱 HTML을 **다시 쓴다** (content-fill).
3. 저장 후 official look CSS merge.

그래서 모델이 템플릿 motif/아이콘/색상 cue를 빼거나 generic shape로 바꾸고, compact fill 실패 시 leftover·empty-track heal이 뒤따른다. `buildTemplateClonedDeckHtml`은 이미 title/body를 템플릿 shell에 치환할 수 있지만, first-fill이 그 결과물을 최종본으로 쓰지 않는다.

## 목표 (P0)

AI는 **JSON outline / content slots만** 생성한다.  
서버가 `buildTemplateClonedDeckHtml`로 템플릿 shell에 내용만 치환한다.  
모델이 전체 HTML을 다시 쓰지 않게 한다.

## Non-goals (이번 설계)

- 이번 문서에서 변환 코드를 착수하지 않는다. 구현은 별도 0901-N02-2.
- 템플릿 카탈로그 `example.html` 자체를 다시 쓰거나 Hartfield / dense IB / Daisy / Expo `설치` 데모 카피를 제품 카피로 승격하지 않는다.
- MiniMax를 기본 생성 경로로 바꾸지 않는다. Claude 기본, env opt-in 유지.
- persist-split, `.slide { display:flex }` 강제, leftover 인덱스 확장과  bundling하지 않는다.

## 현재 구현 (읽기)

| 심볼 | 역할 |
|------|------|
| `listTemplateCloneSlideShells` | `section.slide` 또는 `div.slide` shell 수집 |
| `classifyTemplateCloneShellRole` / `inferTemplateCloneContentRole` | cover/list/cards/timeline/stat/quote/team/process/closing/body |
| `pickTemplateShellsForContent` | 콘텐츠 역할에 맞는 shell. 커버 shell은 body에 재사용하지 않음 |
| `fillSlideShell` | h1–h3 / subtitle / `ul`·`ol` / 첫 `p` 치환. placeholder면 데모 카피 비움 |
| `buildTemplateClonedDeckHtml` | outline 장수가 이김. 템플릿 장수·순서를 미러하지 않음. max 20 |

정책 유지: 템플릿 demo 페이지 수/순서를 복사하지 않는다. 사용자 outline이 장수를 정한다.

## P0 계약

### 모델 출력

모델은 HTML이 아니라 JSON만 낸다.

```json
{
  "title": "덱 제목",
  "slides": [
    { "title": "표지", "body": "한 줄 리드", "roleHint": "cover" },
    { "title": "세 가지 포인트", "body": "하나\n다음\n세 번째", "roleHint": "list" }
  ]
}
```

허용 필드: `title`, `slides[].title`, `slides[].body` (줄 = 슬롯), `slides[].roleHint` (optional).  
금지: 전체 문서, `<style>`, `<section class="slide">` 덤프, SVG/motif 재작성.

### 서버

1. JSON 파싱·sanitize (`sanitizeTemplateCloneDeckTitle` 재사용).
2. `buildTemplateClonedDeckHtml(exampleHtml, slides, { title, maxSlides })`.
3. 기존 persist / official look merge / leftover heal은 **저장 후** 그대로. heal이 빈 칸을 주제 카피로 발명하지 않는다.

### 템플릿별 slot map

P0는 공통 heuristic (`fillSlideShell`)만 쓴다. 템플릿 id별 override는 P1.

| 역할 | 채울 슬롯 | overflow |
|------|-----------|----------|
| cover | 제목 heading, subtitle/`p` 1줄 | 초과 줄 버림 |
| list / process | heading + `li`를 body 줄 수만큼 | `li`가 더 많으면 빈 `li`로 남기거나 초과 `li` 제거(기존 `replaceListItems`) |
| cards | heading + 카드 제목/본문 쌍 | 카드 수 > 줄 수면 빈 카드 만들지 않음 (leftover 금지) |
| quote / stat / team / closing | heading + 대표 본문 1 | 나머지 줄은 붙이지 않음 |
| body | heading + 첫 `p` | 동일 |

빈 3열을 `기둥 Z` 같은 칸 번호로 채우지 않는다. 카드 수 = 내용 수.

### 가드

- example.html 원문 / Hartfield / IB / Daisy / Expo `설치` 데모 카피가 사용자 brief 없이 남지 않게 기존 `stripLeftoverTemplateDemoCopy` 유지.
- official English catalog는 empty brief에서 유지 (heal leftover와 동일).
- 한글 brief만으로 leftover catalog를 지우지 않는다.
- 모델이 JSON 대신 HTML을 내면 한 번만 JSON 재요청. 실패 시 현재 hybrid content-fill로 **fallback** (P0 안전망). 강제 전환은 P1.

## 슬라이스

| 슬라이스 | 내용 |
|----------|------|
| **A (P0 설계)** | 이 문서. 계약·overflow·fallback |
| **B (P0 구현)** | daemon/FE compact prompt를 JSON-only로. `buildTemplateClonedDeckHtml`이 first-fill 최종본 |
| **C (P1)** | 템플릿 id별 slot map + overflow 픽스처 |
| **D (후속)** | hybrid fallback 제거. MiniMax 실키 E2E는 키 있을 때만 |

## 성공 기준

1. first-fill이 템플릿 shell class/motif/CSS를 유지하고 제목·본문만 바뀐다.
2. AI 출력에 `<!doctype` / `<section class="slide"`가 없다 (unit).
3. outline 3장이면 결과도 3장. 템플릿 12장을 미러하지 않는다.
4. 빈 카드·칸 번호 카드를 만들어 열을 맞추지 않는다.
5. MiniMax 키 없는 환경에서 live 생성을 가짜로 돌리지 않는다.

## 다음

0901-N02-2 구현설계 — prompt/daemon 호출 지점, JSON schema, fallback 분기, 테스트 픽스처.

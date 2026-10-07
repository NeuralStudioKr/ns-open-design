# 0914-N22-3 구현현황 — LOOK seed 배너 generic-brief 문장

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-07 12:55 | 짧은 주제가 있는 `만들어줘`와, 잘린 fill 리드가 소스 브리프를 가리는 경우를 generic으로 보지 않음 |

## 변경

- LOOK seed 배너에 generic brief일 때만 N09 문장 추가
- fill/heal/LOOK merge HTML 변경 없음
- Retry dock 동작 변경 없음

## 검증

error-messages + templateCloneContentFill + clone-look-seed-recovery (60). MiniMax live bake는 후속.

## 후속 — genericBrief 오판 (2026-10-07)

LOOK seed 폴백(`seed_fallback_untouched_look`) 자체는 JSON 아웃라인이 수리 후에도 비면 그대로다. 배너의 「주제가 명확하지 않았다」 문장만 고친다.

- ☑ `instructionShellHasNoTopic` — `슬라이드 만들어줘`는 generic, `Teamver 소개 슬라이드 만들어줘` / `신제품 런칭 슬라이드를 만들어줘.`는 주제 있음
- ☑ `resolveTemplateCloneRunBrief` — `슬라이드 내용을 채워줘.` 리드를 건너뛰고 `[Source brief]`의 User instruction을 쓴다
- fillMode `json` 유지. LOOK seed HTML은 바꾸지 않음

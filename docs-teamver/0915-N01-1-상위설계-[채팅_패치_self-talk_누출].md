# 0915-N01-1 상위설계 — 채팅 패치 self-talk / 영어 내부 서술 누출

## 문제

한국어 UI 사용자가 Design 채팅에서 **영어 내부 사고·패치 계획**을 그대로 본다.

예: slide index, HTML/`<span>`, `.slide--fadelist`, "I'll patch that slide…"

## 원인

- 생성: 어시스턴트 **일반 prose** (thinking 태그·pseudo-tool XML 아님)
- `sanitizeAssistantProseForDisplay`는 마크업/코드 debris·tool Note는 지우지만, 이런 자연어 패치 계획은 **정상 문장으로 통과**
- UI locale 프롬프트는 있으나 모델이 무시하면 방어막이 없음

## 정책

1. **숨김 우선** — 내부 패치/HTML/index 서술은 사용자에게 번역·요약하지 않고 채팅에서 제거
2. **프롬프트** — UI locale로만 사용자 결과 문장; 패치 계획·슬라이드 index·CSS 클래스 나레이션 금지
3. 사용자용 짧은 한국어 결과("9페이지 가이드라인 문구를 보강했습니다")는 허용 — 단 내부 계획 문단은 제거

## 비범위

- 아티팩트/element-patch 본문
- 정상 디자인 의사결정 설명(내부 HTML 없이)

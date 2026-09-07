# 0901-N02-24 구현설계 — Clone 배치(DOM) smoke (루프472)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
직전: [0901-N02-23](./0901-N02-23-구현설계-[Clone_remaining-zhangzara-quality-gates].md) 루프470 — 남은 10셸 게이트.

## 목표

루프470 「다음」 — 4축 게이트는 문자열 존재만 본다. CSS 변수/`Archivo` 폰트는 스타일시트에만 남아도 통과하므로, **motif 클래스가 실제 태그로 남는지**와 **표지 heading이 비지 않는지**를 같은 fixture 경로에서 잠근다.

FileViewer 클릭·pixel golden은 이 환경에서 확인하지 못한다. 1차 smoke는 DOM 배치 핀이다.

## 5축

기존 1–4축 유지. 추가:

5. **Layout** — `motifMustInclude` 중 클래스형 토큰(`--*` · 폰트명 제외)이 `<… class="…token…">`로 존재. 표지/히어로 셸(없으면 덱 전체)에 `h1–h3` 또는 title/display/headline/lockup/wordmark 호스트가 있다.

빈 deco 셸(`deco-dots` · `sunglow`)과 재작성되는 `slide-chrome`은 live-tag에서 제외하고 stylesheet motif(1축)만 유지한다.

Creative Mode는 클래스 토큰이 없어 `poster`를 motif에 추가한다.

## 테스트

- contracts `assertDeterministicTemplateQualityGate` axis 5 — 기존 `it.each`가 전 종 실행
- daemon Creative Mode motif에 `poster`

## 비범위

- Playwright pixel screenshot / golden
- MiniMax live · FileViewer 클릭

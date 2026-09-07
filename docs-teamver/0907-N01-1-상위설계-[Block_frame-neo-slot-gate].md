# 0907-N01-1 상위설계 — Block Frame neo 슬롯 fill 게이트 회귀 (루프461)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 직전: [0901-N02-20](./0901-N02-20-구현설계-[Clone_template-quality-gates-unique-role].md)

## 사용자 리포트 (2026-09-07)

> "clone 하고서 바로 종료하는 것 같다"

첨부 HTML은 `html-ppt-zhangzara-block-frame`(neo-brutal `--pink` / cream) deterministic
fill 결과물. 표지 `NEO-팀버 소개-STYLE`, `Image Placeholder` / `Visual System` /
`Get Started` / `Overview` / 가짜 차트 레전드, intro-card·data-box orphan 배치 등이
남아 있고 MiniMax auto-send는 없다.

## 원인 분해

1. **의도적 종료 (루프419/421)** — deterministic fill 성공 시 FE가
   `usedDeterministicCloneFill`로 MiniMax auto-send를 억제한다. LOOK/filled 덱을
   MiniMax가 덮어쓰면 Capsule 등에서 `AGENT_EXECUTION_FAILED`가 났기 때문.
   「바로 종료」는 설계상 정상 경로다.
2. **실제 품질 버그 (루프461)** — `fillSlideShell`이
   `officialLookIsNeoBrutalBlockFrame(body)`로 neo 슬롯 fill을 게이트했는데,
   이 fingerprint는 `<style>` / motif-deco CSS를 본다. 슬라이드 **body**만 넘기면
   CSS가 없어 항상 `false` → `fillBlockFrameNeoSlots`가 한 번도 안 돌았다.
   그 결과 visual-label / deco-yellow-bar / nb-btn / chart strip / nb-label 영문
   크롬이 그대로 남고, 사용자는 「클론만 하고 끝난」것처럼 느낀다.
3. **부가** — `replaceFirstExactClassText`가 `div|span|p`만 매칭해
   `<a class="nb-btn">` / `<a class="close-btn">` fill이 실패했다.

## 목표

Block Frame deterministic fill이 neo 슬롯을 실제로 채우고, 게이트 denylist에
`Visual System` / `Get Started` / `By The Numbers` / `Overview` 등을 넣어 회귀를
막는다. MiniMax skip 정책은 유지한다(품질이 충분하면 종료가 맞음).

## 비목표

- deterministic 성공 후 MiniMax polish 재개 (제품 정책 변경 — 별도 루프)
- intro-card orphan reparent (현재 peer-fit는 col-right 안에 유지; 첨부 HTML의
  orphan은 구버전/다른 경로로 보이며 이번 게이트 버그와 별개)

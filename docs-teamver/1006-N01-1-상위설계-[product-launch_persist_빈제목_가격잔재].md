# 1006-N01-1 상위설계 · Product Launch persist 빈 제목·가격 잔재

상위: [0918-N04 실생성 품질](./0918-N04-1-상위설계-[실생성_품질검토_개선].md) · [0921-N05 AI fill 짜맞추기](./0921-N05-1-상위설계-[ai_fill_강제·짜맞추기_제거].md)
정책: persist / pad / continue / head-banner **불변**. healer·역할 pack만.

## 리포트

`tpl-product-launch`에 brief `Teamver 소개`를 채운 실생성 HTML.

| 증상 | 예 |
|---|---|
| 표지와 2장이 같은 제목 | `Teamver 소개` 반복 |
| 서버 jargon 제목 | `Teamver가 다루는 칸` |
| 빈 제목 | kicker `다음 액션` + 빈 `<h1>` |
| 숫자만 제목 | `<h2>02</h2>` |
| 본문 문장을 제목으로 | `주제에서 초안이 … 열린다.` |
| 동일 step 본문 | 3칸 모두 `반복 작업을 한 화면에서…` |
| 론칭 킷 가격 잔재 | `Free` / `₩0` / `지금 시작하기`, amount `01/02/03` |
| 타 킷 스타일 혼입 | Product Launch 문서에 Block Frame 한글 속성/CSS가 남음 |

루프551–554 healer는 Halo/`$179`만 지운다. keepable 한글(≥20자)과 빈/숫자 제목, `₩0`은 통과한다. `genericSlideCopyPack.list`가 `${brand}가 다루는 칸`을 직접 넣는다.

## 원칙

- MiniMax가 낸 **서로 다른** 한글 문장은 덮지 않는다 (루프554).
- 빈 제목·숫자 제목·브리프 파롯(표지 이후)·가격 잔재·같은 슬라이드 동일 본문만 고친다.
- 가격을 지어내지 않는다. `₩0`/`$179`/`01` amount는 비운다.
- `${topic} · N` salt를 다시 넣지 않는다 (N05).

## 목표

1. persist 후 빈 `<h1>`/`<h2>`, `₩0`, 숫자-only 제목, `다루는 칸`이 남지 않는다.
2. 같은 슬라이드 step/feature 본문이 서로 다르다.
3. 표지 이후 제목이 brief 원문과 같지 않다.
4. 루프551–554 회귀 없음.
5. Product Launch 결과에 Block Frame 전용 속성/CSS가 남지 않는다.

## 범위 외

- fillMode / MiniMax 호출 정책
- 킷 선정 (회사 소개 → product-launch)
- persist 장수·pad

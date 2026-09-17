# 0917-N26-1 상위설계 — Product Launch 조사·라벨 누수와 빈 슬라이드

**날짜:** 2026-09-17 · **루프:** 553

## 체감

루프551이 Halo 영어 데모(`Halo v2`, `$179`, Marques)는 지웠다. 그 다음
topic-aware 치환이 한국어를 깨고 레이아웃을 비운다.

사용자 첨부(`Teamver 소개` × `tpl-product-launch`, 10장):

1. 조사 오류 — `핵심 주제이 해결하는 문제`, `핵심 주제을 쓰는 사람들`.
   카드 제목은 `핵심 주제이 해결하는 문제 핵심/장면/차이`처럼 topic +
   템플릿 접미가 난잡하게 붙는다.
2. 내부 라벨 누수 — `핵심 9`, `핵심 10`이 슬라이드 제목으로 노출.
3. 커버 kicker와 lede가 둘 다 `Teamver가 다루는 문제와 제공 가치`.
4. 빈/얇은 장 — Ship은 testimonial만 남고 attribution `— ,`, 우측
   CTA/가격/날짜 컬럼이 사라져 레이아웃이 빔. Introducing 2는
   `핵심 주제 한눈에`만. Introducing 9는 `핵심 9`만.
5. price-card amount는 `01/02/03`(허용)인데 본문이
   `실행 방안에서 의미와 적용 기준을 한 문장으로 정리한다`.
6. Fit 장의 워크스페이스/권한 문장은 밀도가 좋다 — **유지**.

topic이 `핵심 주제`로 fallback된 흔적. brief `Teamver 소개`에서 명사를
`Teamver`로 잠가야 한다.

## 원인

- `${topic}이` / `${topic}을` 하드코딩. `주제`는 받침 없음 → `가`/`를`.
- `fillProductLaunchKitSlide`가 topic을 슬라이드 제목에서 다시 뽑아
  `개요`/`핵심 포인트`/빈 문자열이 `핵심 주제`가 된다.
- 카드 제목에 이미 매핑된 긴 제목을 다시 붙여 `…문제 핵심`이 된다.
- `핵심 N` / `핵심 주제` leftover 탐지가 없어 Halo 스크럽 이후 healer가
  이 장을 건너뛴다. 달러/날짜/인용 출처 wipe가 Ship 우측 컬럼을 같이 지운다.
- 커버 lede 재사용 시 kicker와 동일 문장을 넣는다.

## 정책

- 공통 조사 헬퍼: 마지막 한글 음절 받침 있으면 `이/을/은`, 없으면
  `가/를/는`. Latin 브랜드(Teamver)는 한글 받침이 없어 `가/를/는`.
  `${topic}이` 하드코딩 금지.
- brief → topic 명사 잠금. `핵심 주제` / `개요` / `핵심 N`은 topic이 아님.
- `핵심 N`, `핵심 주제`, `개요`가 제목이면 brief 명사 또는 슬라이드 역할
  제목으로 교체. salt 누수 strip에 `핵심 N` 추가.
- 커버: kicker ≠ lede. 같으면 lede만 다른 한 문장으로 교체.
- Ship: `— ,` wipe. 빈 우측은 topic CTA(가격 숫자 없음)로 복구하거나
  row를 한 칼럼으로 정리.
- 제목만 있는 center 슬라이드에 lede 한 문장.
- price-card 템플릿 문장 금지. Teamver 소개에 맞는 실무/리더/운영 불릿 3개.
  amount ordinal 유지.
- 깨진 슬롯만 고친다. Fit의 구체 문장은 유지.
- Broadside / EightBit / BlockFrame / Raw-Grid healer 본문 불변.
  persist / pad / continue / `SLIDE_DECK_*` 프롬프트 불변.

## 위치

- `packages/contracts/src/template-clone-fill.ts`
  — `attachKoreanJosa` · `fillProductLaunchKitSlide` ·
  `healProductLaunchLeftoverCatalogCopy` ·
  `synthesizeTemplateCloneSlideBody` 조사 헬퍼
- fixture `packages/contracts/tests/fixtures/loop553-product-launch-broken-josa.html`
- 테스트 `packages/contracts/tests/template-clone-fill.test.ts`

## 테스트 pin

- heal 후 `주제이`, `주제을`, `핵심 9`, `핵심 10`, `— ,`,
  `의미와 적용 기준을 한 문장으로` 없음
- cover kicker ≠ lede
- Ship에 빈 `— ,` 없음, testimonial 또는 CTA 중 실질 카피 있음
- Halo / `$179` 없음 (루프551 유지)
- contracts test green

## 범위 외

- persist / pad / continue / `SLIDE_DECK_*`
- Broadside / EightBit / BlockFrame / Raw-Grid healer 로직
- 가짜 달러 KPI 발명

## 변경 이력

| 2026-09-17 11:30 | Product Launch 조사·라벨 누수·빈 슬라이드 상위설계 (루프553). |

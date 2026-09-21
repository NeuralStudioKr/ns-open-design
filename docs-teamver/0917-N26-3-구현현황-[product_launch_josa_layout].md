# 0917-N26-3 구현현황 — Product Launch 조사·라벨 누수와 빈 슬라이드

## 상태

☑ `attachKoreanJosa` — 마지막 한글 음절 받침 → `이/을/은`, 없으면 `가/를/는` (Teamver = `가`)  
☑ `resolveLockedTopicNoun` — brief `Teamver 소개` → `Teamver`. `핵심 주제`/`개요`/`핵심 N`/마케팅 제목 거부  
☑ synth 템플릿·커버 lead에서 `${topic}이` 하드코딩 제거  
☑ `핵심 N` / `핵심 주제` / `개요` 제목을 brief 명사 또는 슬라이드 역할 제목으로 교체  
☑ salt strip에 `핵심 N` 확장  
☑ 커버 kicker ≠ lede  
☑ Ship `— ,` wipe + topic CTA 컬럼 복구 (가격 숫자 없음)  
☑ center 제목-only 슬라이드에 lede 한 문장  
☑ price-card 템플릿 문장 제거, 실무/리더/운영 불릿 3개, amount ordinal 유지  
☑ Fit 워크스페이스/권한 문장 유지 (깨진 슬롯만 refill)  
☑ fixture `loop553-product-launch-broken-josa.html`  
☑ 루프551 Halo/`$179` pin 유지  
☐ Design staging QA (푸시 후 사용자 재현)

## 검증

- `template-clone-fill.test.ts` 루프551·553 + marketing-title pin: 11 passed
- 같은 파일 전체: 293 passed
- 힐 후 `주제이` / `주제을` / `핵심 9` / `핵심 10` / `— ,` /
  `의미와 적용 기준을 한 문장으로` 없음
- cover kicker ≠ lede
- Ship에 testimonial + `Teamver 시작하기` CTA
- Fit 밀도 문장 유지
- Halo / `$179` 없음

## 남은 리스크

- brief 없이 persist되면 topic이 `주제`로 떨어질 수 있음. Home 경로 brief는 전달됨.
- center lede가 서비스 소개 문맥이 아니면 `— 핵심 맥락과 다음 단계` 문장이 들어갈 수 있음.
- Broadside / EightBit / BlockFrame healer의 `${topic}이` 하드코딩은 이 슬라이스에서 안 바꿈.

## 변경 이력

| 2026-09-17 11:36 | 루프553 구현. 조사 헬퍼·topic 잠금·빈 슬라이드 복구. |

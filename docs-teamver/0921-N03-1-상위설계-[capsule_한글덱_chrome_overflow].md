# 0921-N03-1 상위설계 · Capsule 한글 덱 chrome / overflow / sparse-role

상위: [0918-N05 EightBit/Capsule 역할 pack](./0918-N05-1-상위설계-[eightbit_capsule_역할pack].md)  
SSOT: [60](./60_Canvas_Slide_시스템_프롬프트_템플릿적용_개선.md) §1.44  
정책: persist / pad / continue / head-banner **불변**. 0918-N05 healer/fill **삭제·되돌리지 않음**.

## 왜 0918-N05만으로는 부족한가

0918-N05는 kit key `capsule` + `fillCapsuleKitSlide` + `healCapsuleLeftoverCatalogCopy` 로 leftover 제목/`340%` 가짜 KPI를 지운다.  
남아 있는 갭은 역할 pack 경로 밖이다.

| 갭 | 왜 pack이 못 잡나 |
|---|---|
| `.orbit-pill` Research/Ideation/… | catalog RE에 데코 라벨이 없음. 슬롯 맵도 h*/p/li 만 채움 |
| LOOK_NEUTRALIZE `overflow:visible` | 프리뷰/export CSS. fill/heal 이후 클립이 풀리면 abs 데코가 인접 슬라이드로 샘 |
| title-only `지표` → stats-grid | role 추론이 KPI 키워드만 보고 specialty shell로 보냄. items[] 없으면 빈 격자 |
| 고정밀도 peer trim | `rebuildHostWithPeers` 가 line count로 4칸 그리드를 1칸으로 자름 |
| statement-box 인용 | h1/h2 슬롯이 없어 outline title이 사라지고 deck title로 반복 |

## 번호 정합

작업 브랜치는 내부에서 loop510–514로 적었다. staging은 이미 그 번호를 list sparse · Latin 브랜드 · host merge에 썼다.  
이번 머지는 **루프563 / 0921-N03**. 테스트 describe 이름(루프510–514)은 회귀 pin을 깨지 않으려고 유지한다.

## 개선 (상위 갭만)

1. **데코/specialty scrub** — 알려진 영문 데모 라벨만 blank. 한글·숫자·모델이 쓴 문장은 유지.
2. **semantic refill** — blockquote / attribution / closing-pill / header-pill 만 outline 순서로 채움. `항목 2` 같은 인덱스 placeholder는 넣지 않음 (0918-N05 가짜 KPI 금지와 동일).
3. **고정밀도 peer 보존** — Capsule `stats-grid` / `chart-container` / `tier-grid` / `.timeline`+`.timeline-track`. 일반 `.timeline` trim 계약은 유지.
4. **sparse-role demote** — items[] 없고 body < 60 이면 지표/타임라인/팀/프로세스 → `cards`. items[] 있으면 specialty 유지.
5. **overflow clip** — `html[data-od-capsule-layout-fix] .slide { overflow:hidden!important }` 가 LOOK_NEUTRALIZE 를 이김. Capsule fingerprint 에서만.
6. **slot map** — chart/timeline/stats/tier/diagram host+peer를 `CAPSULE_SLOT_MAP`에 추가.

## 하지 말 것

- 0918-N05 / 0921-N02 healer 삭제
- persist / pad / continue / head-banner 정책 변경
- Daisy/Graphify 전역 `overflow:visible` 철회
- specialty 숫자에 가짜 KPI 발명

## 변경 이력

| 2026-09-21 | staging 머지 정합. 역할 pack 위에 chrome/overflow/sparse-role 을 얹고 루프563으로 재번호. |

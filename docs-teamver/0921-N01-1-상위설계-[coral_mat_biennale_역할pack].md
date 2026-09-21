# 0921-N01-1 상위설계 · Coral / Mat / Biennale Yellow 역할 pack

상위: [0918-N06 Daisy/Broadside/Playful 역할 pack](./0918-N06-1-상위설계-[daisy_broadside_playful_역할pack].md)  
정책: persist / pad / continue / head-banner **불변**. healer/fill만.  
기존 EightBit / Capsule / Grove / Studio / BF / Cobalt / PL / Daisy / Broadside / Playful healer는 되돌리지 않는다.

## 목적

직전 SHA `2fcc96963e`에서 Daisy/Broadside/Playful pack까지 있다.  
이번엔 official 킷 중 역할 pack이 없는 **Coral**, **Mat**, **Biennale Yellow**만 본다.

| 킷 | official 플러그인 | example | healer |
|---|---|---|---|
| Coral | `html-ppt-zhangzara-coral` | 있음 (10 `div.slide`) | look/poster slot만. kit key·역할 pack 없음 |
| Mat | `html-ppt-zhangzara-mat` | 있음 (9 `slide--*`) | look/poster slot만. kit key·역할 pack 없음 |
| Biennale Yellow | `html-ppt-zhangzara-biennale-yellow` | 있음 (8 `s-*`) | slot fill(`fillBiennale*`)은 있음. kit key·역할 pack 없음 |

## 검토 축

brief `Teamver 소개` → salvage + leftover heal + (가능하면) 2장→pad. fixture `loop561-*.html`.

| 축 | 미리보기 대비 |
|---|---|
| leftover | 개요 / 탐색·실행·확장 / 영문 데모 / 가짜 KPI |
| 문장 다양성 | 슬라이드마다 서로 다른 Teamver 문장 |
| pad 밀도 | kit-aware fill이 미리보기만큼 칸을 채우는지 |

실생성(브라우저)은 시도하되 탭/로그인 막히면 우회하지 않고 오프라인만.

## 개선 (검토 상위 갭만)

### Coral

kit key / leftover healer / 역할 pack이 없으면 신규.

- kit key `coral` → `resolveTemplateCloneKitKey` / `synthesizeTemplateCloneSlideBody`
- leftover strip: `VENTURE` / `QUARTERLY STRATEGY SESSION` / `01 / Overview` / `CORE PILLARS` / `Alexandra Chen` / `HELLO@VENTURE.IO` 등
- 역할: 커버·스테이트먼트·필러·스탯·임팩트·인용·타임라인·팀·카드·닫기
- 가짜 KPI wipe만 (`+147%` / `2.4M` / `89%` / `3.2x`)

### Mat

`fillStudioKitSlide`를 타지만 **역할 pack이 약하고** `mat-stat` / `cover-headline` leftover가 남는다. healer를 되돌리지 않고 pack을 보강한다.

- kit key `mat`
- leftover strip: `[Studio Name]` / `Craft Matters` / `Dieter Rams` / `4.7 k` / `3.2 ×` / `# 1`
- 역할: 커버·스테이트먼트·스플릿·스탯·인용·리스트·비교·차트·닫기
- 가짜 KPI wipe만. 차트 숫자는 서수·빈칸

### Biennale Yellow

기존 `fillBiennale*` / Aurora leftover 테스트는 유지. kit key + Cobalt식 역할 pack만 추가한다.

- kit key `biennale-yellow`
- leftover 유지: `Aurora` / `Public attendance` / `The Long Yellow` / `76,400` 등
- 역할: 커버·매니페스토·프로그램·챕터·데이터·인용·캘린더·콜로폰
- 가짜 KPI wipe만 (`76,400` / `182 k`)

### 공통

- 루프554: 구체 한국어 ≥20자는 덮지 않음. 가짜 KPI wipe만.
- 공통 synth 가드가 이 세 킷에서 개요/탐색실행확장을 넣지 않게 kit key 분기로 pack을 탄다.
- persist / pad / continue 정책 금지.

## 범위 외

- persist / pad / continue / head-banner 정책
- 이미 있는 EightBit / Capsule / Grove / Studio / BF / Cobalt / PL / Daisy / Broadside / Playful healer 되돌리기
- secrets, ns-open-design CICD

## 변경 이력

| 2026-09-21 13:58 | Coral/Mat/Biennale Yellow 역할 pack 상위설계. |

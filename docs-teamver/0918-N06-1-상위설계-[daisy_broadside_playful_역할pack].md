# 0918-N06-1 상위설계 · Daisy Days / Broadside / Playful 역할 pack

상위: [0918-N05 EightBit/Capsule 역할 pack](./0918-N05-1-상위설계-[eightbit_capsule_역할pack].md)  
정책: persist / pad / continue / head-banner **불변**. healer/fill만.  
기존 EightBit / Capsule / BF / Cobalt / Grove / Studio / PL healer는 되돌리지 않는다.

## 목적

직전 슬라이스에서 EightBit/Capsule/Grove/Studio/BF/Cobalt/PL pack은 있다.  
이번엔 official 킷 중 역할 pack이 없는 **Daisy Days**, **Broadside**, **Playful**만 본다. pack이 이미 있는 킷은 건너뛴다.

| 킷 | official 플러그인 |
|---|---|
| Daisy Days | `html-ppt-zhangzara-daisy-days` |
| Broadside | `html-ppt-zhangzara-broadside` |
| Playful | `html-ppt-zhangzara-playful` |

## 검토 축

brief `Teamver 소개` → salvage + leftover heal + (가능하면) 2장→pad. fixture `loop560-*.html`.

| 축 | 미리보기 대비 |
|---|---|
| leftover | 개요 / 탐색·실행·확장 / 영문 데모 / Broadside `$3.5B` 등 |
| 한글 tracking | 띄어쓰기·조사 (554/555) |
| 빈 슬롯 | 차트/stat/카드/레전드 라벨 |
| 문장 다양성 | 슬라이드마다 서로 다른 Teamver 문장 |
| pad 밀도 | kit-aware fill이 미리보기만큼 칸을 채우는지 |

실생성(브라우저)은 시도하되 탭/로그인 막히면 우회하지 않고 오프라인만.

## 개선 (검토 상위 갭만)

### Daisy Days

kit key / leftover healer / 역할 pack이 없으면 신규.

- kit key `daisy-days` → `resolveTemplateCloneKitKey` / `synthesizeTemplateCloneSlideBody`
- leftover strip: `Daisy Days` / `Welcome to Today` / 교실 주간표 / `A Wise Educator` / `Literacy - 33%` 등
- 역할: 커버·환영·주간·타임라인·차트·카드·인용·팀·프로세스·도넛
- 가짜 KPI wipe만. 차트 숫자는 서수·빈칸

### Broadside

`healBroadsideLeftoverCatalogCopy`는 leftover strip + `fillStudioKitSlide`만 있고 **역할 pack이 약하다**. healer를 되돌리지 않고 pack을 보강한다.

- kit key `broadside`
- leftover 유지: `$3.5B` / `3×` / `#1` / `Leader`/`Challenger` / `[Studio X] Guidelines` / footer `Broadside`
- 역할별 Teamver 문장: 커버·챕터·스테이트먼트·스플릿·스탯·페이드리스트·리스트·인용·비교·차트·다이어그램·파이·닫기
- 가짜 KPI wipe만 (`$3.5B` / `3×` / `#1`)

### Playful

kit key / leftover healer / 역할 pack이 없으면 신규.

- kit key `playful`
- leftover strip: `Creative Direction & Visual Systems` / `What We Will Cover Today` / `The Collective` / `hello@example.studio` / `47`/`98%` 데모 KPI
- 역할: 커버·목차·스테이트먼트·차트·팀·서비스·타임라인·스탯·갤러리·닫기

### 공통

- 루프554: 구체 한국어 ≥20자는 덮지 않음. 가짜 KPI wipe만.
- 공통 synth 가드가 이 세 킷에서 개요/탐색실행확장을 넣지 않게 kit key 분기로 pack을 탄다.
- persist / pad / continue 정책 금지.

## 범위 외

- persist / pad / continue / head-banner 정책
- 이미 있는 EightBit / Capsule / BF / Cobalt / Grove / Studio / PL healer 되돌리기
- secrets, ns-open-design CICD

## 변경 이력

| 2026-09-18 17:10 | Daisy/Broadside/Playful 역할 pack 상위설계. |

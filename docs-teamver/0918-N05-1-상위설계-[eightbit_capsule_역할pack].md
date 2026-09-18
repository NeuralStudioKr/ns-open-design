# 0918-N05-1 상위설계 · EightBit Orbit / Capsule 역할 pack과 leftover

상위: [0918-N04 실생성 품질 검토](./0918-N04-1-상위설계-[실생성_품질검토_개선].md)  
정책: persist / pad / continue / head-banner **불변**. healer/fill만.  
기존 BF / Cobalt / Grove / Studio / Product Launch healer는 되돌리지 않는다.

## 목적

직전 슬라이스에서 Grove/Studio/BF/Cobalt/PL pack은 있다. 이번엔 official 킷 중 역할 pack이 가장 약한 **EightBit Orbit**과 **Capsule**을 미리보기(`example.html`) 대비 검토하고, 상위 갭만 고친다.

| 킷 | official 플러그인 |
|---|---|
| EightBit Orbit | `html-ppt-zhangzara-8-bit-orbit` |
| Capsule | `html-ppt-zhangzara-capsule` |

## 검토 축

brief `Teamver 소개` → salvage + leftover heal + (가능하면) 2장→pad. fixture `loop559-*.html`.

| 축 | 미리보기 대비 |
|---|---|
| leftover | 개요 / 탐색·실행·확장 / 영문 데모 / Rookie / `$0` |
| 한글 tracking | 띄어쓰기·조사 (554/555) |
| 빈 슬롯 | 차트/stat/tier/pill 라벨 |
| 문장 다양성 | 슬라이드별 서로 다른 문장 |
| pad 밀도 | kit-aware fill이 미리보기만큼 칸을 채우는지 |

실생성(브라우저)은 시도하되 탭/로그인 막히면 우회하지 않고 오프라인만.

## 개선 (검토 상위 갭만)

### EightBit Orbit

`healEightBitOrbitLeftoverCatalogCopy` / `fillEightBitOrbitKitSlide`가 있어도 **개요 아웃라인**이 남으면 Cobalt식 역할 pack을 추가한다.

- kit key `eightbit-orbit` → `resolveTemplateCloneKitKey` / `synthesizeTemplateCloneSlideBody`
- 커버·스플릿·피처·차트·타임라인·스탯·인용·티어·닫기 역할 문장
- 영문 데모 스크럽 유지: `Pixel Perfect`, `Rookie`, `$0/mo`, `Studio Orbital` 등
- 가짜 KPI 금지. 차트/스탯 숫자는 서수·빈칸

### Capsule

kit key / leftover healer / 역할 pack이 없으면 신규.

- kit key `capsule`
- leftover strip (영문 카탈로그 + 개요/실무자/탐색실행확장)
- 역할별 Teamver 문장 (커버·인트로·필러·차트·인용·타임라인·스탯·다이어그램·스플릿·닫기)
- 루프554: 구체 한국어 ≥20자는 덮지 않음
- 가짜 KPI 금지 (`340%` / `12.4M` / `8.2M` wipe만)

### 공통 synth 가드

N03 개요/핵심 포인트/탐색·실행·확장 가드가 이 두 킷에도 적용되는지 확인. 적용 안 되면 kit key 분기로 pack을 탄다.

## 범위 외

- persist / pad / continue / head-banner 정책
- 이미 있는 BF / Cobalt / Grove / Studio / PL healer 되돌리기
- secrets, ns-open-design CICD

## 변경 이력

| 2026-09-18 15:52 | EightBit/Capsule 역할 pack 재검토 상위설계. |

# 0901-N02-21 구현설계 — Sakura Chroma leftover refill (루프467)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
직전: [0901-N02-20](./0901-N02-20-구현설계-[Clone_template-quality-gates-unique-role].md) 루프459–460 — Biennale / Cobalt unique-role 게이트 + Field Office persist refill.

## 목표

공식 카탈로그 **Sakura Chroma** (`html-ppt-zhangzara-sakura-chroma`) 8-shell unique-role 키트에서 Tape Garden 데모 카피가 Teamver 브리프 Clone/persist에 남지 않게 한다.

1. unique-role cap이 `s-catalogue` / `s-stripe`를 인식해 10장 요청이 셸을 복제하지 않는다
2. cover / manifesto / catalogue / stripe / data / quote / cal / colophon 슬롯을 브리프로 채운다
3. leftover 감지·스크럽에 Tape Garden 어휘를 넣는다
4. Hangul persist leftover는 슬롯 선채움 후 wipe. KPI(`.vbig`)는 발명하지 않는다
5. 영문 `example.html`은 brief 없이 no-op
6. 4축 품질 게이트에 Sakura Chroma(8)를 편입한다

## 대상 셸

| 셸 | 슬롯 | leftover 예 |
|----|------|-------------|
| `s-cover` | `.hero` `.lockup` `.brand .b1/.b2` | T-26, SUPERCATALOG, tape garden |
| `s-manifesto` | `.stmt` `.kicker` | We make small analog things… |
| `s-catalogue` | `.card .nm/.desc` | BLOOM PEDAL, SUPER TAPE, MIX CHAIR |
| `s-stripe` | `.qbody` `.qkicker` `.qattr` | Ren Kobayashi |
| `s-data` | `.ttl` `.lab` `.lab-tag` `.desc` — **`.vbig` 유지** | Output, by year / Bloom Pedal |
| `s-quote` | `.qbody` `.who-tag` `.meta-tag` | Mei Tanaka |
| `s-cal` | `.ttl-row` `.ven` | Bloom Pedal · first run |
| `s-colophon` | `.ktag` `.ttl` `.ftag` `.ftxt` | See you in volume eight |

## Cobalt 오탐 방지

Sakura는 `.cfooter` / `.stmt-wrap` / `.vbig`를 Cobalt와 공유한다. `officialLookIsSakuraChroma`는 `--ink:#3A2516` + `s-catalogue` / petal / ribbon / lockup+hero. `officialLookIsCobaltGrid`는 Sakura를 deny. cover/colophon Cobalt fill과 data `.vbig` blanking은 Sakura 셸에서 건너뛴다.

## 테스트

- contracts `loop467 — Sakura Chroma 10-slide request caps unique-role and scrubs Tape Garden leftover`
- contracts `루프467: persist leftover refill replaces Tape Garden body after chrome leftover`
- contracts / daemon 4축 게이트 `Sakura Chroma`

## 비범위

- Broadside 47셸 / 8-bit Orbit / Scatterbrain 게이트
- Kami `MMXXVI` leftover
- MiniMax live E2E · FileViewer 클릭
- KPI 숫자 발명

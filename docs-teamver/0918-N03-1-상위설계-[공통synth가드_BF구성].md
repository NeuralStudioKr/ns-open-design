# 0918-N03-1 상위설계 · 공통 개요 synth 가드 + Block Frame 역할별 구성

상위: [0918-N02 Cobalt Grid leftover·cover/table 힐러](./0918-N02-1-상위설계-[cobalt_grid_heal].md)  
정책: 루프554(한국어 ≥20 유지) · 루프555(띄어쓰기) · 루프556(역할 leftover strip)

## 사용자 리포트

v1.4.15 대비 품질이 낮은 핵심은 MiniMax 실패 후 **공통 service-intro synth**가 모든 킷에 주입되는 것이다.

`templatesForSynthTemplateTopic('service-intro')` 가 `개요` / `핵심 포인트` / `탐색·실행·확장` 트리오와 `실무자/리더/운영자` 역할 템플릿을 item title로 넣는다. Cobalt Grid만 루프557에서 가드했다. Block Frame / Studio / 기본 킷은 그대로 맞는다.

루프557이 Block Frame native `.intro-card` / `.nb-card` 안의 `실무자/리더/운영자`를 "사용자 본문"으로 보존한 것도 leftover를 남긴다. 556 정책은 **유지 금지**.

## 1. 공통 가드

`synthesizeTemplateCloneSlideBody` / `biennaleFillLines` / service-intro 라인이 template-clone fill에서 **어느 킷이든** 아래를 제목으로 넣지 못하게 한다.

| 금지 | 처리 |
|---|---|
| 단독 제목 `개요` / `핵심 포인트` | topic 역할 제목으로 치환. lead로도 쓰지 않음 |
| 연속 제목 `탐색` + `실행` + `확장` | 트리오 감지 시 topic 역할 제목으로 치환 |
| leftover 카드 제목 (`실무자`/`리더`/`운영자`, `파일럿`/`확대`/`정착`, `전환`/`활성`/`품질` 등) | 전역 leftover RE로 차단 |

leftover heading / card-title / body RE는 **전역 상수**. Cobalt·Product Launch·Block Frame가 각자 복제하지 않고 같은 RE를 본다.

`biennaleFillLines` fallback 제목 `${topic} 개요` / `핵심 포인트` 도 leftover로 취급해 topic 역할 제목으로 바꾼다.

## 2. Block Frame 내용 구성

brief `Teamver 소개` → topic **Teamver**. leftover strip 후 빈 칸은 **슬라이드 역할별 서로 다른 Teamver 문장**으로만 채운다. 공통 아웃라인을 다시 넣지 않는다.

| 슬라이드 | 셸 | 채움 |
|---|---|---|
| cover | `.hero-frame` | 제품명 + 한 줄 가치. 제목 `개요`/`핵심 포인트` 금지. kicker는 짧은 역할(`표지`) |
| intro | `.intro-card` / `.nb-card` | 같은 보드 / 권한 / 이어서 고치기. `실무자`/`리더`/`운영자` leftover 유지 금지 |
| features | `.feature-card` | 초안 / 수정 / 공유. 서로 다른 문장 |
| chart | `.data-box` | leftover `전환율`/`활성`/`품질` → Teamver 운영 라벨(같은 보드 / 권한 경계 / 결과 이력). 가짜 % 금지 |
| quote | `.quote-frame` | 한 인용. intro/cover와 다른 문장 |
| split | `.split-content` | 작업 흐름 한 줄. leftover 트리오 금지 |
| timeline | `.timeline-step` 3칸 | 한 팀 보드 / 리뷰 습관 / 조직 기준. `파일떴`/`희대다`/`정척적` 손상 없음. leftover `파일럿`/`확대`/`정착` 도 쓰지 않음 |
| close | `.close-frame` | 닫는 메시지 + 다음 행동 |

정책:

- leftover를 지운 뒤 빈 칸은 **역할별 Teamver 문장**으로만 채움.
- `고객경험` → `고객 경험` 띄어쓰기 유지 (555).
- 한국어 ≥20자 **구체** 문장은 덮지 않음 (554). leftover role body(`반복 작업을 줄이고…`)는 구체처럼 보여도 leftover RE로 strip.
- 제목을 `개요` / `핵심 포인트`로 채우지 말 것.
- native card 보존(루프557)은 leftover 역할에 한해 철회. 레이아웃 수리(orphan header / non-metric chart-svg)는 유지.

## 3. pad slide

`data-teamver-pad="short-response"` 장에 공통 개요 synth를 넣지 않는다.

| 조건 | 채움 |
|---|---|
| kit fill 있음 (Block Frame pack) | 그 역할 문장 |
| kit fill 없음 | seed 구조 유지 + brief 한 줄 |

persist / pad / continue / head-banner **로직은 변경하지 않는다.** 마커·장수·drop 가드는 그대로. 바뀌는 것은 **채워 넣는 카피**뿐이다.

## 구현

위치: `packages/contracts/src/template-clone-fill.ts`

- 전역 leftover RE + `sanitizeServiceIntroSynthTitles`
- `synthesizeTemplateCloneSlideBody` 공통 가드 (킷 키 무관)
- `biennaleFillLines` leftover 제목 차단
- `blockFrameSlideCopyPack` + leftover heal/fill이 pack으로 빈 칸을 채움
- Block Frame kit-key synth도 pack 사용. `개요` 라벨을 lead에 넣지 않음
- `refillEmptyBlockFrameNeoLabels` 에 leftover 제목(`개요`)을 넘기지 않음

## 테스트 pin

- synth가 Block Frame / Studio / 기본에서 `탐색`+`실행`+`확장`을 연속 제목으로 안 냄
- Block Frame fixture (loop555 / loop556 + 필요 시 신규) heal 후:
  - `개요` / `핵심 포인트` 제목 없음
  - `실무자` / `리더` / `운영자` leftover 없음
  - `고객경험` 없음, `고객 경험` 유지
  - `파일떴` / `희대다` 없음. 타임라인 3칸 문장 서로 다름
  - data-box leftover `전환율`/`활성`/`품질` 없음
- Cobalt 557 pin 유지
- Halo / Raw-Grid healer 불변
- `pnpm --filter @open-design/contracts test` 관련 파일 green

## 범위 외

- persist / pad / continue / head-banner 로직
- Product Launch / Halo / Raw-Grid / Cobalt 힐러 되돌리기
- Grove / Studio / EightBit 킷 본문 재작성
- secrets. ns-open-design 은 ns_cicd 미등록 — CICD 금지

## 다음 후보

Grove / Studio / EightBit 중 아직 역할별 내용 구성 pack이 없는 킷.

## 변경 이력

| 2026-09-18 13:52 | 공통 개요 synth 가드 + Block Frame 역할별 Teamver 구성 상위설계. |

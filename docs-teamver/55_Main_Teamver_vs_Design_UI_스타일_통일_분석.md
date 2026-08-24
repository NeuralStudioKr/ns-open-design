# Main Teamver ↔ Design UI 스타일 통일 분석

**문서 번호:** 55  
**상태:** 분석 · 추천 (구현 전)  
**작성:** 2026-08-03  
**대상**

| 제품 | 레포 / SSOT |
|------|-------------|
| Main Teamver (앱) | `ns-teamver-fe-v2` — [`DESIGN.md`](../../ns-teamver-fe-v2/DESIGN.md), `web/src/app/{color-tokens,notion-colors,globals}.css` |
| Teamver Design (OD fork) | `ns-open-design` — `apps/web/src/styles/tokens.css`, `teamver.css`, [56 polish](./56_UI_polish_a11y_터치_개선.md) |

**관련**

| 문서 | 관계 |
|------|------|
| [37 embed OD branding hide](./37_embed_od_branding_hide.md) | OD 카탈로그 브랜드 노출 억제 |
| [56 UI polish](./56_UI_polish_a11y_터치_개선.md) | Design chrome 밀도·터치·타이포 원칙 |
| FE `DESIGN.md` | Main 생김새 SSOT (토큰명 중심, hex 재정의 금지) |

---

## 1. 한 줄 요약

> Main은 **Notion형 생산성 UI + indigo `#5F6DF4`**, Design은 **에디토리얼 크래프트 툴 + warm paper + terracotta `#c96442`**.  
> embed는 이미 **크림 첫페인트(`#F4EFE6`)** 로 Main과 맞추려 했으나 **accent·폰트·모달·선택색**은 아직 OD 원형을 유지한다.  
> **추천:** “한 제품처럼 보이게”는 **embed 스코프에서 브랜드 액센트·폰트·모달 반경을 Main에 수렴**하고, **생성물 캔버스·업스트림 OD standalone** 은 중립/원형을 유지한다.

---

## 2. 시각 캐릭터 비교

| 축 | Main Teamver | Design (OD / embed) |
|----|--------------|---------------------|
| 무드 | 차분한 협업 워크스페이스, 크롬이 물러남 | 크래프트/에디터, 생성물이 주인공 |
| 배경 | Notion 화이트 `#FFFFFF` / elevated `#F7F7F7` | Warm paper `#faf9f7` · embed 첫페인트 `#F4EFE6` |
| 브랜드 CTA | Indigo `#5F6DF4` (`--primary-600`) | Terracotta `#c96442` (`--accent`) |
| 선택 강조 | primary와 동일 계열 | CTA와 분리 — `--selected: #2563eb` |
| 타이포 | Geist + Noto Sans KR (sans only) | 크롬 sans(system) · **히어로만 Source Serif** |
| 밀도 | 중밀도 — 리스트 촘촘, 모달·카드 여유 | 툴 IDE 밀도 — **13.5px** base, **28px** 아이콘 체계 |
| 모달 | `rounded-[16–20px]`, scrim `bg-black/30` | 일반 Dialog `radius-lg`+blur · Drive는 8px+slate wash |
| 그림자 | 절제 (`shadow-sm`/`lg`) | hairline + soft layered (`--shadow-sm`…`lg`) |
| 스택 | Tailwind v4 + shadcn new-york | 커스텀 CSS 토큰 (`tokens.css`) |

**이미 비슷한 점**

- embed 로딩/첫페인트 크림 (`#F4EFE6`) — Main FE 크림 계열과 의도적 정렬
- 라이트 우선, 얇은 보더, 과한 네온/그라데이션 마케팅 톤 회피
- 삭제/위험은 소프트 destructive (완전한 원색 버튼만 쓰지 않음)

**어긋나서 “다른 제품”처럼 보이는 점**

1. **CTA 색** (indigo vs terracotta) — iframe 안 Design만 열어도 브랜드 톤이 바뀜  
2. **히어로/일부 카드 serif** vs Main 전면 sans  
3. **모달 반경·스크림** (16–20px / black/30 vs 8–12px / warm blur or slate)  
4. **본문 크기** (Main 14–15 vs Design 13.5)  
5. **버튼 높이** (Main default `h-11`=44 vs Design 28–36)

---

## 3. 토큰·패턴 상세 대조

### 3.1 Color

| 역할 | Main | Design | 갭 |
|------|------|--------|-----|
| Primary / CTA | `#5F6DF4` | `#c96442` | **최대** — 브랜드 정체성 |
| Page bg | `#FFFFFF` | `#faf9f7` / embed `#F4EFE6` | 중간 — cream은 가깝고 white는 다름 |
| Elevated / panel | `#F7F7F7` | `#fdfcfa` / `#fffefc` | 작음 (둘 다 따뜻한 회백) |
| Text default | `#37352F` | `#1a1916` | 작음 (둘 다 warm near-black) |
| Text muted | `#666666` | `#74716b` | 작음 |
| Border | `#EFEFEF` | `#e1e5eb` | 작음 |
| Danger | `#EB5757` 계열 | `#9c2a25` / soft fills | 중간 |
| Selection | primary | `#2563eb` (accent와 분리) | 설계 철학 차이 |

Design 주석(SSOT): accent는 **앱 크롬 CTA만**, 아티팩트 프리뷰 배경에는 브랜드색을 넣지 않음. Main도 콘텐츠 우선이지만 CTA=선택 강조가 같은 indigo.

### 3.2 Typography

| 항목 | Main | Design | 추천 방향 |
|------|------|--------|-----------|
| UI sans | Geist + Noto Sans KR | system stack | embed에서 **Geist/Noto 로드 또는 Main과 동일 CSS 변수 주입** |
| Display | 없음 (sans hierarchy) | Source Serif (hero/brand) | embed: hero도 **sans**로 수렴 가능 · standalone OD는 유지 |
| 섹션 제목 | 14–16 / 600 | 18–22 / 600 sans (53 이후) | 크기만 14–16으로 한 단계 내리면 Main과 더 가까움 |
| Body | 14–15 / 1.5–1.6 | 13.5 / 1.5 | embed `--font-size` 14px 검토 |
| Meta | 11–12 | 11–12.5 | 충분 |

### 3.3 Radius · control size

| 항목 | Main | Design |
|------|------|--------|
| Base radius | 10px (`--radius: 0.625rem`) | 8px (`--radius`) |
| Card | `rounded-xl` (~14) | `--radius` 8–10 |
| Modal | **16–20px** | Dialog 12 · Drive **8** |
| Primary button height | **44px** (h-11) | **36px** (Drive Use) / chrome 28 |
| Icon control | 32–36 (icon size-9) · Notion sm **28** | **28** 체계 (의도, 53) |

**해석:** Design의 28px는 “틀린” 것이 아니라 **에디터 밀도**. Main 기본 버튼은 터치·마케팅 여유.  
통일 시 **아이콘 크롬은 28 유지**, **페이지급 Primary CTA만 36–40으로 Main에 가깝게**가 현실적.

### 3.4 Modal / overlay

| | Main Dialog | Design `.modal` | Design Drive picker |
|--|-------------|-----------------|---------------------|
| Scrim | `black/30` | warm `rgba(28,27,26,0.42)` + blur | slate `rgba(15,23,42,0.26)` no blur |
| Radius | 16–20 | 12 (`--radius-lg`) | 8 |
| Max width | ~440 | ~520 | 560 / import 760 |
| z-index | 50 (앱 내) | 100–1700 | **5000** (portal) |

Drive는 Teamver 전용이라 Main 모달 언어에 맞추기 쉬움 (이미 polish 루프 진행 중).

### 3.5 Cards · empty

| | Main | Design |
|--|------|--------|
| Card | `rounded-xl border shadow-sm`, gap-6, airy | border + soft hover lift 1px, dense meta |
| Empty | icon 48 + `text-lg` + muted sm | designs-empty 18/600 · df/library 동일 패턴으로 수렴 중 (53 §5.5) |

Empty 타이포는 이미 Main empty(`text-lg`)와 근접. 카드 **hover lift**는 Design 특색 — Main은 거의 flat.

---

## 4. 통일성 — 어느 정도가 좋은가?

### 4.1 목표 수준 (권장)

**“한 Teamver 제품 안의 Design 모드”** 수준.  
픽셀 완벽 복제나 OD upstream 전체를 Main 테마로 덮는 것은 **비권장**.

| 층 | 통일 강도 | 이유 |
|----|-----------|------|
| **A. 브랜드 신호** (accent, focus ring, 링크, primary CTA) | **높음** | iframe만 봐도 Teamver임을 느끼게 |
| **B. 타이포 패밀리** (sans 스택) | **중~높음** | 한글/라틴 톤 일치 |
| **C. 모달·시트·Drive** | **중** | 앱↔Design 전환 시 이질감 감소 |
| **D. 리스트/카드 밀도·28px chrome** | **낮음 (유지)** | Design은 에디터; Main 44px로 키우면 회귀 |
| **E. 아티팩트 캔버스·슬라이드 미리보기** | **없음** | 생성물이 자체 팔레트를 가져야 함 (tokens 주석 SSOT) |
| **F. Standalone OD / 업스트림 기여면** | **없음~최소** | terracotta+serif는 OD 정체성; fork 기여와 충돌 |

### 4.2 하지 말아야 할 것

1. Design 전역 `--accent`를 hex로 하드코딩 난사 (Main처럼 **역할 토큰 + 스코프 오버라이드**)  
2. Manual Edit / 슬라이드 캔버스에 Teamver indigo 강제  
3. 28px chrome을 Main h-11로 일괄 확대 (53 원칙 위반)  
4. “보라 그라데이션 랜딩” 류 AI 기본 룩으로 덮기 (양 제품 DESIGN/AGENTS 모두 금지에 가깝음)

---

## 5. 추천 개선안 (우선순위)

### P0 — Embed 브랜드 액센트 정렬 (체감 최대)

**무엇을:** `html.teamver-embed` (및 Teamver branding on) 스코프에서만:

```text
--accent:        var(--teamver-primary, #5F6DF4);
--accent-strong: #4F5CE0;   /* 또는 Main --primary hover 토큰 매핑 */
--accent-hover:  …
--accent-tint:   rgba(95, 109, 244, 0.10);
--accent-soft:   …
```

- Main `DESIGN.md` / `notion-colors`의 primary를 **단일 소스**로 문서화하고, Design은 CSS 변수만 오버라이드.
- `--selected`는 (a) accent와 동일 indigo로 합치거나 (b) 약간 더 진한 indigo로 유지 — **둘 중 하나를 명시**.
- focus ring(`primitives.css` `button:focus-visible`)이 자동으로 따라옴.

**검증:** Drive Use 버튼, Designs empty CTA, embed bar 링크, background-runs open.

### P1 — Embed 타이포 스택

**무엇을:** embed에서 `--sans`를 Main과 맞추기.

- 옵션 A: Design embed 번들에 Geist + Noto Sans KR 로드 → `--sans: var(--font-geist-sans), "Noto Sans KR", …`
- 옵션 B: iframe parent가 font CSS 변수/`@font-face`를 주입 (BFF/embed shell)

히어로 `.home-hero__title` / `__brand-name`: embed에서는 **serif 제거(sans)** — 이미 섹션 제목은 sans 통일됨 (53).

### P2 — Drive · 공유 Dialog를 Main 모달 언어에 가깝게

| 항목 | 현재 Design Drive | 추천 |
|------|-------------------|------|
| radius | 8 | **12–16** (`--radius-lg` 또는 16px 전용 `--radius-modal`) |
| scrim | slate 0.26 | **`rgba(0,0,0,0.30)`** (Main과 동일) |
| primary CTA height | 36 | **40** (Main 44까지는 과할 수 있음) |
| title | 15/650 | 16/600 (Main dialog title에 근접) |

일반 Settings `.modal` blur는 유지해도 됨 — Drive만 Teamver 제품 픽커이므로 우선.

### P3 — 표면 톤 미세 정렬 (선택)

embed에서만:

- `--bg-app` / `--bg` → `#F4EFE6` 또는 Main elevated에 더 가까운 값으로 **토큰 오버라이드** (지금은 일부 하드코드 first-paint만 cream)
- 카드 `--bg-panel`을 `#FFFFFF`에 가깝게 하면 Main Notion 카드와 더 닮음 · 다만 Design warm paper 매력을 깎음 → **A/B 한 스프린트** 권장

### P4 — 문서·가드레일

1. 본 문서(55)를 **통일 SSOT**로 두고, 구현 시 `55-1 구현설계` / `55-2 구현현황` 루프.  
2. Design embed 스코프에 `lint` 또는 리뷰 체크: **terracotta hex 직접 사용 금지** (토큰만).  
3. Main `DESIGN.md`에 “Design embed consumes primary via scoped CSS variables” 한 절 교차 링크.  
4. 53 원칙과 충돌 시 **53 밀도 원칙 우선**, 색만 Main.

---

## 6. 권장 로드맵

| 단계 | 내용 | 예상 체감 | 리스크 |
|------|------|-----------|--------|
| **0** | 본 문서 합의 (어느 층까지 통일할지) | — | 낮음 |
| **1** | P0 accent 스코프 오버라이드 + selected 정책 | 매우 큼 | 중 — 상태 pill/green·amber와 대비 확인 |
| **2** | P1 폰트 + hero sans (embed) | 큼 | 중 — 폰트 로딩/FOUT |
| **3** | P2 Drive/모달 radius·scrim·CTA | 중 | 낮음 |
| **4** | P3 표면 A/B | 중 | 중 — warm paper 정체성 |
| **5** | Standalone OD는 변경 없음 또는 upstream 기여 분리 | — | — |

**한 줄 제품 결정:**  
“Main에서 Design으로 들어와도 **색·글꼴·모달은 Teamver**, **캔버스·편집 밀도는 Design**.”

---

## 7. 의사결정 체크리스트 (합의용)

구현 전 제품/디자인에서 고를 것:

- [ ] Embed accent를 Main indigo로 **완전 교체**할 것인가, tint만 섞을 것인가?  
- [ ] `--selected`를 accent에 합칠 것인가?  
- [ ] Hero serif를 embed에서 제거할 것인가?  
- [ ] Drive 모달만 Main화하고 Settings는 OD blur를 유지할 것인가?  
- [ ] Standalone `stg-design` / 비embed 빌드에도 indigo를 적용할 것인가? (**비권장**이면 branding flag로 스코프)

---

## 8. 파일 인덱스 (분석 시점)

### Main

- `ns-teamver-fe-v2/DESIGN.md`
- `ns-teamver-fe-v2/web/src/app/color-tokens.css`
- `ns-teamver-fe-v2/web/src/app/notion-colors.css`
- `ns-teamver-fe-v2/web/src/app/globals.css`
- `ns-teamver-fe-v2/web/src/components/ui/{button,dialog,card,empty}.tsx`

### Design

- `ns-open-design/apps/web/src/styles/tokens.css`
- `ns-open-design/apps/web/src/styles/base.css` / `primitives.css`
- `ns-open-design/apps/web/src/styles/teamver.css` / `teamver-branding.css`
- `ns-open-design/apps/web/src/styles/viewer/tools.css` (Drive)
- `ns-open-design/docs-teamver/56_UI_polish_a11y_터치_개선.md`

---

## 9. 다음 액션

> **보류 (2026-08-03):** 브랜드 통일(P0+)은 잠시 중단. 다른 UI polish(56) 우선.  
> 완성본 리스크·롤백은 대화 합의 — 실험은 embed 스코프 + 단계 게이트로만.

1. §7 체크리스트 합의 후에만 재개.  
2. 합의 범위로 `55-1_구현설계-embed_브랜드_토큰.md` 작성 후 P0부터 구현.  
3. 단계마다 [00 구현 내역](./00_구현_내역_누적.md) · 필요 시 56에 “색 통일은 55 트랙” 교차 기록.

# Apps ↔ Main auth 멀티앱 정합 — 구현 후보 · 재검토 (0831-N01-1)

| 항목 | 값 |
|------|-----|
| **문서 ID** | `0831-N01-1` |
| **역할** | 1 — 상위기획 / **구현 후보 비교** / 재검토 결론 |
| **작성일** | 2026-08-31 |
| **상태** | 재검토 확정 · Epic [0825-N01](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) Phase 2b에 반영 |
| **관련** | [41](./41_Design_Drive_인증_계약_권고.md) · [45](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md) · [0825-N01-0](./0825-N01-0-CTO전달-[BFF_auth_완전해결].md) |

---

## 0. TL;DR (재검토 결론)

| 질문 | 답 |
|------|-----|
| Plan A(`main_sso_status`)가 최선인가? | **계정 불일치 감지**로는 [41] 이중 쿠키 계약 안에서 **최선에 가깝다.** Design = reference, N앱 복제. |
| Main logout **레지스트리 iframe fan-out**이 필수인가? | **아니다.** logout과 계정전환을 분리하면, 기본해는 **Plan A + `unknown`∧BFF-authenticated → 로컬 BFF 폐기**. fan-out은 **즉시성**이 필요할 때의 **가속(선택)**. |
| 다음에 무엇을 구현하나? | **(1)** 앱 FE 정합 규칙(unknown) · **(2)** Docs Plan A 포트 · **(3 선택)** Main fan-out / M2M |

---

## 1. 문제 분해 (후보 비교의 축)

부모 SSO(`.teamver.com` HttpOnly)와 앱 host-only BFF는 **의도적으로 수명이 분리**된다 ([41](./41_Design_Drive_인증_계약_권고.md)). 그 결과 두 **서로 다른 사건**이 생긴다.

| 사건 | Main 쿠키 | 앱 BFF | Plan A `main_sso_status` | 필요한 조치 |
|------|-----------|--------|--------------------------|-------------|
| **계정 전환** A→B | 새 user | 옛 user | **`mismatch`** | pause + mismatch recovery (cold start) |
| **로그아웃** | **없음** | 살아 있음 | **`unknown`** (mismatch 아님) | BFF를 “로그인된 척”으로 두지 말 것 → **로컬 logout 또는 push 무효화** |

0825-N01 §12.0 초안이 logout·전환을 **fan-out 한 묶음**으로 푼 것이 과한 지점이다.

---

## 2. 구현 후보 표

### 후보 A — Plan A only (서버 `main_sso_status` · 앱별 focus)

| | |
|--|--|
| **내용** | 각 App BFF가 Main HttpOnly 쿠키로 `match`/`mismatch`/`unknown` 판정. FE는 session-first reconcile. |
| **장점** | HttpOnly 정합 · Drive gate와 SSOT 공유 · Main 변경 0 · N앱 스키마 복제 |
| **단점** | `unknown`만으로는 BFF authenticated UI를 자동으로 안 죽임 |
| **적합** | **계정 전환 선제 감지** — **채택 (필수 · Design ☑)** |

### 후보 B — Plan A + unknown 정합 규칙 (권장 기본해)

| | |
|--|--|
| **내용** | focus 시 `mismatch` → 기존 recovery. **`unknown` ∧ (BFF authenticated / embed LIVE)** → pause + `POST /auth/logout`(앱) + UI unauth (Main 로그인 redirect는 제품 정책). |
| **장점** | Main에 앱 목록·iframe **불필요**. 앱 추가 = 포트만. logout·전환이 **같은 session-first 경로**로 수렴 |
| **단점** | 탭을 안 보면 orphan이 잠깐 남음 (fan-out iframe 실패 시와 유사) |
| **적합** | **멀티앱 확장의 기본 SSOT — 채택 (Phase 2b P0)** |

```text
focus / visibility (authenticated embed)
  → GET /auth/session  (force)
  → mismatch?  → pause + mismatch recovery
  → unknown && hadLiveBff? → pause + app POST /auth/logout + clear embed UI
  → match → Phase 1-형 ladder
```

### 후보 C — Main 레지스트리 iframe / M2M fan-out

| | |
|--|--|
| **내용** | Main logout 시 등록 앱 origin[]에 logout-bridge iframe (± M2M `main-logout`). |
| **장점** | OIDC front/back-channel 동형 · **열린 탭 즉시** BFF 폐기 |
| **단점** | 레지스트리·ITP·timeout·앱 추가 시 Main 배포. logout에만 필수에 가깝고 전환에는 Plan A로 충분 |
| **적합** | **가속(선택 · P1/P2)** — “즉시 N앱 동시 폐기” 제품 요구 시 |

### 후보 D — readable epoch / `sso_sub_hash` 쿠키 (구 Plan C)

| | |
|--|--|
| **내용** | `.teamver.com` readable 신호로 FE watcher. |
| **장점** | FE 즉시 반응 가능 |
| **단점** | HttpOnly 정책과 긴장 · 위조·레이스 · Plan A보다 열등한 경우가 많음 |
| **적합** | **보류** — 후보 B bake 후에도 레이스 남을 때만 |

### 후보 E — Stage 4 Dual-auth (Drive가 Apps JWT 수용)

| | |
|--|--|
| **내용** | Main Drive가 `aud` allowlist로 Apps JWT 수용 ([41] 방안 B). |
| **장점** | Drive proxy 앱에서 mismatch **원천 감소** · 앱 N개일 때 Main 한 번 ROI |
| **단점** | Main 변경 · 감사축. **앱 UI BFF orphan은 안 없어짐** |
| **적합** | **Epic 밖** — Drive 사용 앱 증가 시 플랫폼 재평가 |

### 후보 F — BFF 쿠키를 parent domain에 올리고 Main이 일괄 삭제

| | |
|--|--|
| **내용** | `teamver_{app}_bff` on `.teamver.com`. |
| **평가** | 서브도메인 XSS → 전 앱 세션 탈취. **금지** ([41]·15_2). |

### 후보 G — 중앙 Apps Session / Redis

| | |
|--|--|
| **평가** | 이론상 단일 진실 · 인프라 과함. **현재 Epic 비목표**. |

---

## 3. 채택 조합 (확정)

```text
필수 (Phase 2 / 2b P0)
  ├─ 후보 A  Plan A 스키마 · Design reference ☑ · Docs 포트
  └─ 후보 B  unknown ∧ authenticated → 로컬 BFF 폐기

선택 (가속)
  ├─ 후보 C  Main registry fan-out / M2M   — “즉시성” UX
  └─ 후보 D  epoch                         — B 잔여 레이스만

별도 트랙
  └─ 후보 E  Dual-auth                     — Drive N앱 ROI
```

**한 줄:**  
「Plan A를 앱 공통 계약으로 두는 것」은 맞다.  
「그래서 Main이 등록 앱마다 iframe/M2M을 쏴야 한다」는 **차선·가속**이다.  
멀티앱 **기본해 = Plan A + unknown 정합(B)**.

---

## 4. FR 재배치 (0825-N01 Phase 2b에 반영)

| ID | 우선 | 내용 | 비고 |
|----|------|------|------|
| **FR-8~10** | ☑ | Design Plan A | reference |
| **FR-P0** | **P0** | **unknown 정합 규칙(후보 B)** — Design 먼저 · 앱 공통 | **신규** |
| **FR-P4** | P1 | Docs(후속) Plan A + FR-P0 포트 | 유지 |
| **FR-P1·P2** | **P1 선택** | Main logout 레지스트리 fan-out | 필수→가속 |
| **FR-P3** | P2 | M2M fan-out | 선택 |
| **FR-P5** | P2 | mismatch recovery 시 형제 앱 bridge | 선택 · B로 대부분 대체 |
| **FR-13** | P1 | same-origin broadcast only | 크로스앱 아님 |
| **FR-16** | 보류 | epoch | 후보 D |

### 성공 기준 분리

| ID | Pass (필수 vs 선택) |
|----|---------------------|
| S8–S11 | Design Plan A (기존) |
| **S12a (필수)** | Main logout 후 각 등록 앱이 **다음 focus**에서 BFF 미인증 · refresh/probe 폭풍 없음 |
| **S12b (선택)** | Main logout 직후 iframe/M2M으로 **즉시** BFF 폐기 (탭 focus 전) |
| **S13** | 계정 전환 · Design·Docs 동시 오픈 → 각 앱 Plan A `mismatch` 정렬 (fan-out 불필요) |

---

## 5. 구현 순서 (권장)

```text
1. Design FR-P0 (unknown 정합) + vitest · staging S12a
2. Docs FR-P4 (Plan A + P0 포트) · S13
3. (제품 “즉시 logout” 요구 시) Main FR-P1·P2 · S12b
4. (선택) M2M · Stage 3 same-origin · Dual-auth 재평가
```

---

## 6. 비목표

- parent-domain BFF 쿠키 (후보 F)
- 매 navigation auth code exchange 강제
- Plan A로 닫히는 동안 epoch 선행
- BroadcastChannel로 Design↔Docs 정렬

---

## 7. 문서 앵커

| 문서 | 역할 |
|------|------|
| **본 문서** | 후보 비교 · 재검토 결론 SSOT |
| [0825-N01-1 §12.0](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) | Epic에 채택 조합 반영 |
| [0825-N01-2 §15b](./0825-N01-2-구현설계-[BFF_session-probe_refresh_401_완전해결].md) | 슬라이스 · FR-P0 |
| [41](./41_Design_Drive_인증_계약_권고.md) | 토큰 패밀리 · Dual-auth 트리거 |

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-31 15:20 | 신설 — 후보 A~G 비교 · 채택=A+B · fan-out=가속 |

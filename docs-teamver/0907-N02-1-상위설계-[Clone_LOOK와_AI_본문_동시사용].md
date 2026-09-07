# 0907-N02-1 상위설계 — Clone LOOK와 AI 본문 동시 사용

**날짜:** 2026-09-07 · **루프:** 463(+정책 문서화)  
**관련:** [0901-N02 fill 롤백 스위치](./0901-N02-template-clone-fill-rollback-switch.md) · [0901-N02-1 Clone slot-fill](./0901-N02-1-상위설계-[Clone_slot-fill].md) · [0907-N01 Block Frame](./0907-N01-1-상위설계-[Block_frame-neo-slot-gate].md) · [54-2 MiniMax 품질루프](./54-2-구현현황-[MiniMax_품질루프].md)

## 1. 질문 (사용자)

> deterministic(서버 슬롯 fill)과 AI(MiniMax)를 **동시에** 쓰면 안 되는가?  
> 지금은 요청 직후 결과만 나오고 내용 구성이 부적절하다. 왜 AI를 거치지 않는가?

이 문서는 **둘을 동시에 쓸 수 있는지**, **무엇이 금지되었는지**, **현재 기본 경로가 무엇인지**를 SSOT로 고정한다.

---

## 2. 한 줄 결론

| 오해 | 사실 |
|------|------|
| 「LOOK와 AI는 동시에 못 쓴다」 | **쓸 수 있다.** `prompt` 모드가 그것이다. |
| 「둘을 동시에 쓰면 안 된다」 | 금지된 것은 **동시 사용 전체**가 아니라, **서버가 본문까지 채운 뒤 MiniMax가 HTML을 통째로 다시 쓰는 이중 본문 생성**이다. |
| 「즉시 결과가 나오는 것 = 정상 완성」 | 루프419/421의 deterministic-only는 **의도적 단축**이었고, 내용 품질 면에서는 **부적절**하다(루프463에서 기본 폐기). |

**현재 기본(루프463):**  
`LOOK seed(템플릿 chrome)` + `MiniMax prompt-fill(본문)` = **둘 다 사용**.

---

## 3. 역할 분리

생성 파이프라인에는 성격이 다른 두 축이 있다.

### 3.1 LOOK (시각 / 구조)

- 공식 템플릿 `example.html` clone
- 색·폰트·모티프·슬라이드 셸·클래스 구조
- 담당: daemon `template-clone-deck` / LOOK seed
- 목표: 「선택한 템플릿처럼 보이게」

### 3.2 본문 (내용 / 구성)

- 주제·논지·슬라이드 역할·구체 근거·카피 밀도
- 담당(이상): **모델(MiniMax 등)** 이 사용자 브리프·첨부·소스를 읽고 작성
- 담당(단축): 서버 deterministic slot-fill — outline/슬롯에 brief를 끼워 넣음 (빠르지만 구성이 얕음)
- 목표: 「이 요청에 맞는 발표 내용」

**동시 사용의 올바른 의미**는  
「LOOK는 템플릿이 잡고, 본문은 AI가 쓴다」이다.  
「서버가 본문도 다 쓴 다음, AI가 같은 덱을 다시 통짜로 쓴다」가 아니다.

---

## 4. Fill 모드별 동작

환경변수: `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE`  
코드 기본: `TEMPLATE_CLONE_FILL_DEFAULT_MODE` (`apps/web/src/teamver/templateCloneContentFill.ts`)  
상세 이력·롤백: [0901-N02-template-clone-fill-rollback-switch](./0901-N02-template-clone-fill-rollback-switch.md)

| 모드 | LOOK seed | 본문 | MiniMax auto-send | 비고 |
|------|-----------|------|-------------------|------|
| **`prompt`** (루프463 **기본**) | ✅ | ✅ MiniMax HTML prompt-fill | ✅ | **LOOK + AI 동시 사용** |
| `json` | ✅ | ✅ MiniMax dense JSON → 서버 치환 | ✅ | opt-in. JSON-only 턴은 `AGENT_EXECUTION_FAILED` 위험 |
| `deterministic` | ✅ + 서버 슬롯 fill | 서버 outline 수준 | ❌ 억제 | 빠름. 내용 구성 약함. **명시 opt-in만** |
| `pure-prompt` | ❌ (템플릿 없을 때) | ✅ MiniMax | ✅ | 템플릿 미선택. kit는 시스템 프롬프트로만 |
| `pure-prompt` + **템플릿 선택** | ✅ (루프422) | ✅ MiniMax (루프463) | ✅ | LOOK는 강제, 서버-only fill 강제하지 않음 |

### 4.1 `prompt`가 “둘 다”인 이유

1. FE/daemon이 `example.html`을 clone → `deck.html` LOOK seed  
2. 이어서 MiniMax에 **prompt-fill** 턴을 큐 (`[Template clone prompt fill]`)  
3. 모델이 브리프·소스를 반영한 **실내용** HTML artifact를 씀  
4. salvage / heal / official look merge는 후처리

즉 사용자는 “템플릿 룩 + AI가 만든 내용”을 받는다.  
생성에 시간이 걸리는 것이 **정상**이다.

### 4.2 `deterministic`이 AI를 끈 이유 (루프414/419/421)

당시 목표: Home에서 빈 화면·무한 로딩·`AGENT_EXECUTION_FAILED`를 줄이고, Capsule 등 LOOK를 MiniMax rewrite로 잃지 않기.

조치:

- 서버 `template-clone-content-fill`로 슬롯까지 채움  
- 성공 시 `usedDeterministicCloneFill` / `templateCloneContentFilled`  
- **MiniMax auto-send 억제** → 요청 직후 덱이 “완성본”처럼 열림  

트레이드오프:

- ✅ 빠름, LOOK 유지에 유리  
- ❌ 본문이 brief/outline/슬롯 치환 수준 → **내용 구성·깊이 부족** (2026-09-07 사용자 피드백)

따라서 deterministic-only를 **기본 완성 경로로 두면 안 된다** (루프463).

---

## 5. “동시에 쓰면 안 된다”고 느낀 충돌의 정체

금지·회피 대상은 다음 **유해한 이중 본문**이다.

```text
[유해] deterministic이 본문까지 채움
    → MiniMax가 동일 deck.html을 통짜 HTML rewrite
    → LOOK/슬롯 구조 붕괴, Capsule 등 깨짐, AGENT_EXECUTION_FAILED
```

```text
[권장 = 현재 기본 prompt]
LOOK seed만 (또는 최소 chrome)
    → MiniMax가 본문 중심 create (prompt-fill 계약)
    → LOOK 유지 + 내용 품질
```

```text
[미래 UX 후보 — 아직 기본 아님]
deterministic으로 즉시 미리보기(초안)
    → 백그라운드 MiniMax가 본문만 교체 (구조/CSS 보존 계약 강화)
    → 사용자는 빠른 첫 화면 + 이후 내용 고도화
```

세 번째(하이브리드 UX)는 **가능**하나, 계약·idempotent heal·overwrite 가드가 더 필요하다.  
지금은 두 번째(`prompt`)를 기본으로 한다.

---

## 6. 코드 가드 (읽기용)

| 심볼 | 역할 |
|------|------|
| `shouldUseDeterministicTemplateCloneFill` | `mode === 'deterministic'`일 때만 서버 fill + AI 억제 경로 |
| `shouldQueueAiTemplateCloneFill` | `prompt` / `json` 또는 (`pure-prompt` && 명시 템플릿) → MiniMax 큐 |
| `shouldSkipTemplateCloneSeed` | 템플릿 없는 `pure-prompt`만 LOOK skip |
| `usedDeterministicCloneFill` (App) | deterministic 성공 시에만 auto-send 억제 |
| `cloneResultSuppressesAiFill` | filled metadata가 있으면 AI overwrite 억제 |

루프422: 템플릿을 고르면 LOOK seed는 **항상** 한다 (kit-spec-only MiniMax는 Capsule 등을 못 맞춤).  
루프463: 그 경우에도 **AI fill은 큐한다** (서버-only로 끝내지 않음).

---

## 7. 운영 / 롤백

| 목적 | 설정 |
|------|------|
| 기본 (내용 품질) | `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt` 또는 unset(코드 default `prompt`) |
| 빠른 서버-only QA | `=deterministic` (내용 품질 기대치 낮춤) |
| Clone 없이 프롬프트만 | `=pure-prompt` (템플릿 미선택 시). 템플릿 선택 시 LOOK+AI |
| bake-time | Docker/Vite 이미지 재빌드 필요. localStorage는 embed에서 무시(루프420) |

Staging example · production example · 로컬 staging env는 루프463 기준 `prompt`.

---

## 8. 검증 체크리스트

- [ ] 템플릿 선택 후 Home 생성 → **MiniMax 턴이 돈다** (즉시 deterministic-only 종료 아님)
- [ ] 결과 LOOK이 선택 템플릿과 맞다 (Capsule/Daisy/Block Frame 등)
- [ ] 본문이 outline 반복·영문 chrome leftover가 아닌 **요청 주제의 구성**을 가진다
- [ ] `=deterministic` opt-in 시에만 AI 억제·즉시 오픈
- [ ] Block Frame 등: preview heal이 `col-right`/`data-column`을 orphan하지 않는다 (루프462)

---

## 9. 관련 이슈 타임라인 (요약)

| 루프 | 내용 |
|------|------|
| 401–410 | `pure-prompt` 실험 — Clone 이중지시 가설 |
| 413–414 | deterministic / prompt / json 재매핑. MiniMax JSON 실패 회피 |
| 419–421 | deterministic 기본 + filled 후 MiniMax 억제 (속도·LOOK) |
| 422 | 명시 템플릿 → LOOK seed 강제 |
| 461–462 | Block Frame neo fill · heal host orphan |
| **463** | **기본을 `prompt`로 복구.** LOOK+AI 동시 사용을 제품 기본으로 재확인. 본 문서 |

---

## 10. Non-goals (이 문서)

- deterministic 서버 fill 코드 삭제 (opt-in QA용 유지)
- MiniMax 없는 “완벽한” 서버-only 본문 품질을 기본으로 재승격
- 하이브리드(즉시 미리보기 + 백그라운드 AI) 구현 — 별도 실행계획 필요 시 `0907-N02-2`로 분기

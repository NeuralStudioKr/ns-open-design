# 2026-09-02 현재 판단 — 템플릿 Clone Content-Fill 롤백 스위치

## 배경

- 템플릿 선택 후 생성 품질을 개선하기 위해, 기존 방식처럼 모델이 전체 HTML을 다시 작성하는 경로 외에 서버가 템플릿 preview를 읽고 `deck.html`을 content-filled 상태로 저장하는 별도 경로가 필요하다.
- 다만 기존 프롬프트 기반 경로는 현재 출시/데모에서 되돌릴 수 있는 안정판이므로 제거하지 않는다.

## 구현

- 기존 경로: `POST /api/projects/:id/template-clone-deck`
  - 기본값이며 `prompt-fill`로 metadata를 남긴다.
  - 2026-09-02 기준 FE는 JSON outline marker를 붙이지 않는 `prompt-fill` 후속 AI turn을 보낸다.
  - 이 후속 turn은 완성된 `<artifact type="deck" identifier="deck">` HTML을 생성하게 하며, ProjectView의 JSON slot-fill terminal recovery를 타지 않는다.
- 신규 opt-in 경로: `POST /api/projects/:id/template-clone-content-fill`
  - `contentFillMode=deterministic-fill`로 metadata를 남긴다.
  - `deck.html.artifact.json`과 project metadata에 `templateCloneContentFilled=true`, `templateCloneContentFillPending=false`, `templateCloneFillMode=deterministic`을 기록한다.
  - FE는 후속 AI fill turn을 건너뛰고 바로 `deck.html`을 연다.
- FE 스위치:
  - 기본값: `prompt`
  - `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=deterministic`이면 신규 경로 사용.
  - env가 비어 있는 로컬/QA 빌드에서는 `localStorage.od:template-clone-fill-mode=deterministic`으로도 신규 경로를 켤 수 있다. 단, env가 `prompt`로 명시된 배포 빌드에서는 env가 우선한다.
- 2026-09-02 추가 보강:
  - `prompt-fill` 후속 AI turn은 `deck.html`이 이미 있어도 기존 덱 편집으로 분류하지 않는다.
  - 이유: Clone seed로 만들어진 `deck.html`은 LOOK 기준일 뿐이며, 이 턴은 새 콘텐츠를 채운 최종 덱을 생성하는 CREATE turn이다.
  - 기존 덱 편집 지시(`[Existing deck edit]`)나 canonical `deck.html` 자동 첨부가 같이 들어가면 MiniMax/API agent가 "전체 생성"과 "부분 편집"을 동시에 받아 `AGENT_EXECUTION_FAILED` 또는 빈 결과로 빠질 수 있다.
  - 따라서 prompt-fill marker를 별도 판별자로 분리하고, 기존 JSON slot-fill recovery와는 연결하지 않는다.

## 롤백

- 환경변수를 제거하거나 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`로 설정하면 기존 프롬프트 기반 경로로 즉시 복귀한다.
- 신규 API는 별도 endpoint라 기존 `/template-clone-deck` 호출을 변경하지 않는다.

## Env 적용 현황

- 2026-09-02 현재 시점 기준으로 staging 실제 env와 staging example은 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`로 되돌린다.
- 이유: deterministic server content-fill은 JSON outline 재요청/복구 경로와 결합될 때 “JSON outline 형식을 다시 요청하는 중” 상태가 노출되거나, template seed fallback 뒤 품질이 불안정해질 수 있어 출시 기본값으로 두지 않는다.
- production 실제 env와 production example도 `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt`를 유지해, production은 기존 프롬프트 기반 경로를 유지한다.
- deterministic 경로는 제한된 staging env override 또는 env가 비어 있는 로컬/QA 빌드의 `localStorage.od:template-clone-fill-mode=deterministic`으로만 QA한다.
- 공통 `.env.example`에는 `prompt`와 `deterministic` 값을 모두 문서화한다. 값 변경은 Docker image bake-time 설정이라 open-design-daemon 재빌드가 필요하다.

## 검증 항목

- 기본값에서 기존 prompt-fill 경로가 JSON outline marker 없이 완성 deck artifact를 요청하는지 확인.
- prompt-fill 경로에서 cloned `deck.html`이 있어도 `[Existing deck edit]` 지시가 붙지 않고 canonical deck attachment가 제거되는지 확인.
- deterministic opt-in에서 후속 AI fill turn이 자동 전송되지 않는지 확인.
- metadata stamp가 `templateCloneContentFilled=true`로 남아 재진입/새로고침 시 다시 fill을 시작하지 않는지 확인.
- 템플릿 preview clone 실패 시 기존 복구 로직과 단건 retry가 유지되는지 확인.

## 다음 추천 작업

1. env가 비어 있는 로컬/QA 빌드에서 `localStorage.setItem('od:template-clone-fill-mode', 'deterministic')`로 제한 테스트 후 템플릿별 품질을 비교한다.
2. deterministic 결과가 충분하지 않은 템플릿은 해당 템플릿 fixture를 추가해 원인 분석한다.
3. 품질과 복구 UX가 확인된 뒤에만 staging env를 `deterministic`으로 다시 올린다.

> **보관 문서 (2026-06-15)** — 수정하지 마세요. 현행: [README.md](../README.md)

결론부터 말하면, **open-design 소스를 Teamver 내부로 깊게 수정해서 흡수하지 말고**, open-design은 **업스트림으로 유지**하고 Teamver는 **얇은 Adapter / Wrapper / Plugin 패키지**로 붙이는 구조가 좋습니다.

**관련 (패키지·API·저장소·연동 구조):** [02](./02_open-design_packages_개요.md) · [03](./03_open-design_데몬_통신_규격.md) · [04](./04_open-design_키_저장소_Teamver연동_검토.md) · [05](./05_teamver-design-app_open-design_daemon_연동_구조.md)

## 추천 구조

### 1. open-design은 “외부 AI App 엔진”으로 둔다

open-design은 현재 **local-first AI design workspace**이고, skills, design systems, plugins, MCP server, daemon, web/desktop app 구조를 갖고 있습니다. 또한 HTML/PDF/PPTX/MP4 export, sandbox preview, MCP 연동, OpenAI-compatible endpoint/BYOK 방식도 지원합니다. ([GitHub][1])

즉 Teamver 입장에서는 open-design을 다음처럼 보는 게 좋습니다.

> “Teamver Design AI App이 내부적으로 사용하는 디자인 생성 엔진”

Teamver 본 서비스가 open-design의 코드를 직접 많이 고치는 것이 아니라, open-design을 별도 서비스 또는 컨테이너로 띄우고 Teamver AI Apps BE가 호출합니다.

```text
teamver.com
  ↓
Teamver AI Apps Gateway / Registry
  ↓
teamver-design-app
  ↓
open-design daemon / API / MCP
  ↓
artifact 생성: HTML, PPTX, PDF, 이미지 등
```

open-design은 daemon이 API와 static serving을 담당하고, production daemon은 `localhost:7456`에서 동작할 수 있으며 Docker volume에 프로젝트/SQLite 데이터를 보존하는 구조도 설명되어 있습니다. ([GitHub][2])

---

## 2. Teamver package는 “open-design을 수정하지 않기 위한 접착제”로 쓰는 게 맞다

질문한 “teamver package를 이용하는 것인가?”에 대한 답은 **예, 하지만 open-design 안에 강하게 심는 방식은 비추천**입니다.

Teamver package의 역할은 이 정도가 적절합니다.

```text
@teamver/ai-app-sdk
  - Teamver 로그인 토큰 검증
  - workspace/user/app context 파싱
  - Teamver Drive 저장
  - Teamver billing/usage log 기록
  - callback/webhook 전송
  - app_id/access_key 인증
  - artifact metadata 표준화
```

open-design 쪽에는 가능하면 이 패키지를 직접 많이 import하지 않습니다. 대신 **teamver-design-app wrapper**가 Teamver package를 사용합니다.

```text
teamver-design-app
  ├─ uses @teamver/ai-app-sdk
  ├─ calls open-design daemon / CLI / MCP
  ├─ stores output to Teamver Drive
  └─ reports status to Teamver Main BE
```

이렇게 하면 open-design이 업데이트되어도 Teamver 쪽 변경 영향이 작습니다.

---

## 가장 좋은 통합 방식

### 추천 1순위: Sidecar Service 방식

open-design을 별도 컨테이너/서비스로 실행합니다.

```text
teamver-design-app container
open-design-daemon container
shared volume or S3/Drive
```

흐름은 이렇게 됩니다.

```text
사용자 요청
→ Teamver AI Apps BE
→ teamver-design-app
→ open-design daemon /api/chat 또는 MCP 호출
→ artifact 생성
→ Teamver Drive 저장
→ Teamver에 완료 callback
```

장점은 큽니다.

open-design 코드를 거의 안 건드리므로 upstream pull이 쉽습니다. Docker image/tag만 교체하면 업데이트 반영이 쉽고, Teamver 인증/권한/과금/저장은 wrapper에서 처리하면 됩니다. open-design의 내부 UI나 daemon 구조가 바뀌어도 adapter layer만 수정하면 됩니다.

---

## 2순위: Git submodule / subtree + patch 최소화

open-design 소스를 Teamver repo 안에 포함해야 한다면, 직접 복사보다는 아래 중 하나가 낫습니다.

```text
/ns-teamver-ai-apps
  /apps/teamver-design-app
  /vendor/open-design   ← git submodule
  /packages/teamver-open-design-adapter
```

또는

```text
/vendor/open-design     ← git subtree
/patches/open-design    ← patch-package 또는 별도 patch script
```

하지만 이 방식은 업데이트 때 충돌이 생길 수 있습니다. 그래서 **정말 필요한 경우에만** 권장합니다.

---

## 비추천 구조

### open-design을 fork해서 Teamver 기능을 직접 넣기

예를 들어 open-design 내부에 다음 기능을 직접 넣는 것은 피하는 게 좋습니다.

```text
open-design 내부에 Teamver 로그인 코드 추가
open-design DB schema를 Teamver workspace 기준으로 수정
open-design UI를 teamver.com 메뉴 구조에 맞게 대량 변경
open-design artifact 저장 경로를 Teamver Drive 전용으로 변경
```

이렇게 하면 upstream 업데이트가 올 때마다 merge conflict가 발생합니다. open-design은 현재 기능과 구조가 빠르게 변하는 프로젝트로 보이고, README 기준으로 skills/design systems/plugins/agent 지원 수가 계속 확장되고 있습니다. ([GitHub][1])

---

## Teamver AI Apps 관점의 권장 아키텍처

```text
[Teamver Main BE]
  - app_id / access_key 확인
  - workspace 권한 확인
  - usage log
  - Drive file metadata
  - callback URL 관리

        ↓ internal API

[Teamver AI Apps BE]
  - AI App Registry
  - job 생성
  - queue 처리
  - app별 adapter 호출

        ↓

[teamver-design-app]
  - Teamver SDK 사용
  - prompt/context 구성
  - open-design 호출
  - 결과 파일 정리
  - Teamver Drive 업로드

        ↓

[open-design daemon]
  - skill 선택
  - design system 선택
  - artifact 생성
  - preview/export
```

open-design은 prompt composition에서 `BASE_SYSTEM_PROMPT + DESIGN.md + SKILL.md`를 조합해 provider/agent에 전달하는 구조입니다. ([GitHub][2]) Teamver는 여기에 Teamver용 `DESIGN.md`, `SKILL.md`, 템플릿만 추가하고, 실행은 open-design 엔진에 맡기면 됩니다.

---

## Teamver에서 만들어야 할 것

### 1. `teamver-open-design-adapter`

역할:

```ts
generateDesignArtifact({
  workspaceId,
  userId,
  prompt,
  artifactType: "landing-page" | "dashboard" | "deck" | "mobile-app",
  designSystem,
  outputFormat: "html" | "pdf" | "pptx",
})
```

내부에서는 open-design daemon이나 MCP를 호출합니다.

---

### 2. Teamver 전용 Design System

```text
/design-systems/teamver-modern/DESIGN.md
/design-systems/teamver-savvy/DESIGN.md
/design-systems/teamver-enterprise/DESIGN.md
```

Teamver가 원하는 “savvy / modern” 스타일을 여기에 정리합니다.

---

### 3. Teamver 전용 Skill

```text
/skills/teamver-saas-landing/SKILL.md
/skills/teamver-product-page/SKILL.md
/skills/teamver-investor-deck/SKILL.md
/skills/teamver-dashboard-prototype/SKILL.md
```

open-design은 skill과 design system을 조합해서 결과물을 만드는 구조이므로, Teamver 서비스 품질은 결국 **좋은 SKILL.md / DESIGN.md를 얼마나 잘 관리하느냐**가 핵심입니다. ([GitHub][2])

---

## 최종 추천

가장 안전한 구조는 이겁니다.

```text
open-design = 외부 upstream 엔진
teamver-design-app = Teamver용 wrapper AI App
@teamver/ai-app-sdk = 인증/권한/Drive/과금/로그 공통 패키지
teamver-open-design-adapter = open-design 호출 어댑터
Teamver DESIGN.md / SKILL.md = 서비스 차별화 자산
```

즉, **Teamver package를 open-design에 직접 심는 게 아니라, Teamver AI App wrapper가 Teamver package를 사용하고 open-design을 호출하는 구조**가 맞습니다.

이 구조가 open-design 업데이트 반영, Teamver 플랫폼 통합, 유지보수성 측면에서 가장 좋습니다.

[1]: https://github.com/nexu-io/open-design "GitHub - nexu-io/open-design:  Local-first, open-source Claude Design alternative. ️ Native desktop app. ⚡ 259+ Skills · ✨ 142+ Design Systems ️ Web · desktop · mobile prototypes · slides · images · videos · HyperFrames  Sandboxed preview · HTML/PDF/PPTX/MP4 export  Claude Code / OpenClaw / Codex / Cursor / OpenCode / Qwen / Copilot / Hermes / Kimi & 17+ CLIs. · GitHub"
[2]: https://github.com/nexu-io/open-design/blob/main/QUICKSTART.md "open-design/QUICKSTART.md at main · nexu-io/open-design · GitHub"

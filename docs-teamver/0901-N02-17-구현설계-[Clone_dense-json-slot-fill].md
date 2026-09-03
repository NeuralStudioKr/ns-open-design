# 0901-N02-17 구현설계 — Clone dense JSON slot-fill (루프413)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
롤백: [0901-N02-template-clone-fill-rollback-switch.md](./0901-N02-template-clone-fill-rollback-switch.md)

## 문제

Clone의 원래 계약은 "모델은 JSON만, 서버가 템플릿 shell에 치환"이다. 실제 제품 경로는 두 가지로 어긋났다.

1. **HTML rewrite (`prompt-fill`)** — LOOK seed를 참고 자료로 주고 모델이 전체 HTML을 다시 씀. 이중 지시(뼈대 유지 + 새로 작성) 때문에 배치·줄바꿈·모티프가 무너지고 salvage/heal 루프(379–406)가 따라붙었다.
2. **얇은 JSON** — `{ title, body }`만 받아 카드 제목만 채우고 `.card-text` / step-desc / stat-val을 비움. 레이아웃은 살아 있어도 본문이 빈약해 보였다.

루프409는 기본값을 `pure-prompt`(clone 스킵)로 올려 증상을 우회했다. 근본 해결이 아니다.

## 결정

- LOOK seed는 **불변 뼈대**. 모델은 HTML을 쓰지 않는다.
- 기본 fill 모드를 **`json`** 으로 되돌린다.
- JSON 스키마를 밀도 있게 확장한다: `kicker`, `lead`, `items[]{title, body}`.
- 기존 `=prompt` env는 JSON slot-fill로 재매핑한다. HTML rewrite는 `prompt-fill` / `html` 명시 opt-in만.

## 스키마

```ts
type TemplateCloneSlideItem = { title: string; body?: string };
type TemplateCloneSlideContent = {
  title: string;
  body?: string;   // newline fallback
  kicker?: string; // eyebrow / pill
  lead?: string;   // section subtitle
  items?: TemplateCloneSlideItem[];
  roleHint?: TemplateCloneShellRole;
};
```

호환: `items`가 없으면 기존 `body` 줄 분할. 문자열 줄만 있으면 제목만 채우고 데모 본문은 지운다(기존 C 테스트). `items`에 `body`가 있으면 card-text / step-desc / stat-val까지 채운다.

## 호출

| 계층 | 동작 |
|------|------|
| `normalizeTemplateCloneFillMode` | empty/unknown/`prompt`/`clone` → `json` |
| `App.tsx` / `ChatComposer` | json이면 `buildTemplateCloneContentFillSeed` + `queueTemplateCloneContentFill` |
| persist | 기존 `applyTemplateCloneSlotFill` / `decideTemplateCloneSlotFillTerminal` |

## 성공 기준

1. first-fill이 템플릿 class/motif/CSS를 유지하고 제목·카드 본문을 모두 채운다.
2. 모델 계약에 `<!doctype` / `<section class="slide"`가 없다.
3. env-empty와 `=prompt` 모두 JSON slot-fill을 탄다.
4. HTML rewrite는 `prompt-fill`로만 켜진다.

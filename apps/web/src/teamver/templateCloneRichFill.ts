/**
 * 1007-N01 슬라이스 B — official-look 리치 fill 모드 (opt-in, 기본 OFF).
 *
 * 상위분석 `docs-teamver/1007-N01-1-상위분석-[밀도 방향 세 방안 비교].md` 의
 * 방안 B(official_look_seed). 모델이 full HTML을 직접 저작하던 9/4 수준의
 * 밀도를 **모드 스위치로만** 재활성화한다. 기본 `json` 경로는 1비트도 바뀌지
 * 않으며, 이 모듈을 삭제하고 `templateCloneContentFill.ts` 의 분기 1개를
 * 제거하면(혹은 커밋 revert) 즉시 롤백된다.
 *
 * 자동 주제(교육/가이드) 라우팅은 이 슬라이스 범위가 아니다(후속). 여기서는
 * explicit 모드 스위치(`official-rich`)만 제공한다.
 */

import { neutralizeClonedDeckModelHtml } from '@open-design/contracts';

/** B 경로를 켜는 explicit 모드 값. */
export const RICH_OFFICIAL_LOOK_FILL_MODE = 'official-rich' as const;

/**
 * `normalizeTemplateCloneFillMode` 가 `official-rich` 로 접는 raw 별칭들.
 * 기존 `prompt`/`html`(legacy HTML rewrite) 값은 **건드리지 않는다** — 리치
 * 모드는 그 위에 density 계약만 더한 별도 값이다.
 */
const RICH_OFFICIAL_LOOK_FILL_ALIASES = new Set<string>([
  'official-rich',
  'official_look',
  'official-look',
  'officiallook',
  'rich',
  'rich-fill',
  'rich-html',
  'html-rich',
  'density-b',
  'b',
]);

/** raw(소문자·trim 가정) 가 리치 모드 별칭인지. */
export function isRichOfficialLookFillModeValue(raw: unknown): boolean {
  return typeof raw === 'string' && RICH_OFFICIAL_LOOK_FILL_ALIASES.has(raw.trim().toLowerCase());
}

/**
 * official-look 밀도 계약 (압축). `buildTemplateClonePromptFillSeed` 의 기존
 * 가드(EXACTLY N·topic-lock·KPI-ban·cover-brand·1920×1080·close artifact) 뒤에
 * 덧붙여, 9/4 수준의 모델-저작 full HTML 밀도를 유도한다.
 *
 * loop554 조기 종료를 피하려 각 문구는 1줄로 유지하고 "EXACTLY N 유지"를
 * 밀도 지시 바로 옆에 둔다. 밀도는 **실제 주제 실질**에서만 — 패딩·반복
 * 문장·날조 수치·Teamver 보일러플레이트 금지는 기존 라인을 재사용한다.
 */
export function buildRichOfficialLookDensityBlock(): string[] {
  return [
    '[Official-look rich mode]',
    'Author a senior-grade, model-written full HTML deck: each content slide carries a 2-3 sentence lead/body (never a one-line label), not sparse single-column title slides.',
    'Where it fits, add a secondary column of REAL stats (number + what it measures) or a short labeled example/code block, using dense inline-styled layouts (text + stats sidebar, 3 cards with full descriptions).',
    'Density must come from REAL topical substance (brief/source/domain knowledge) only — never padding, repeated sentences, fabricated metrics, or Teamver boilerplate.',
    // 1007-N01 결함1(주제 날조) D안 — 소스/web-fetch-context 밖의 구체 사실을 지어내지
    // 않는다. 기존 KPI-ban 을 요금·연락처·버전·제품명까지 확장. A안(소스 없으면 리치→json
    // 강등)과 병행하는 soft 지시.
    'Never fabricate concrete facts absent from the brief, attached source, or `<web-fetch-context>`: no invented pricing, contact details, email, phone, address, product names, version numbers, dates, named customers, or statistics. If the source does not state a specific fact, describe it qualitatively instead of inventing a number or proper noun.',
    // 1007-N01 슬라이스 C 결함1 — 콘텐츠 슬라이드가 <h1>/<h2> 제목만 남는 것을
    // 모델 저작 단계에서 금지한다. 호스트는 임의로 본문을 합성하지 않으므로
    // 밀도 계약으로만 막는다. 표지/섹션 간지만 제목 단독을 허용한다.
    'Never leave a content slide as a title alone: every content slide MUST have body elements under the heading (a lead paragraph plus cards/steps/a list/a stats row). A heading with no body is a failure. ONLY a deliberate cover or section-divider slide may be title-only, and keep those rare.',
    // 1007-N01 슬라이스 C 결함2 — step 박스에 raw 설정/코드 조각이 쪼개져 들어가
    // 설명이 깨지는 것을 금지한다.
    'Put any code or config inside ONE <pre><code>…</code></pre> block (keep it intact, do not split it across step/card boxes). Step and card boxes hold explanatory prose (a label plus a full sentence), never a bare raw code line like `server {` or `listen 80;`.',
    'Richer bodies, NOT fewer slides: still emit EXACTLY the requested number of slides.',
  ];
}

/**
 * 1007-N01 슬라이스 C — 리치/legacy prompt-fill 가 모델 full HTML 을 그대로 persist
 * 하는 경로에서, JSON slot-fill 과 동일한 주제오염 중립화·카탈로그 demo 스크럽을
 * 적용하는 **격리된 진입점**. 내부적으로 contracts 의 `neutralizeClonedDeckModelHtml`
 * (데크-레벨, content-preserving, topic-guarded, idempotent)만 호출한다.
 *
 * 왜 리치 모듈에 두는가: substance gate 가 raw 모델 HTML 을 내보낼 때 중립화 가드를
 * 우회하지 못하도록 막는 것은 리치(official-rich) 보강의 핵심이다. 롤백 시 이 파일과
 * 호출부만 되돌리면 된다.
 *
 * 밀도 보존: 레이아웃/슬라이드 구조는 건드리지 않고 Teamver 하드코드·demo 카피만
 * 제거한다. Teamver 제품 brief 에서는 no-op → on-topic 본문 보존.
 */
export function applyRichFillPersistTopicGuards(
  html: string,
  options: { brief?: string | null; deckTitle?: string | null } = {},
): string {
  return neutralizeClonedDeckModelHtml(html, options);
}

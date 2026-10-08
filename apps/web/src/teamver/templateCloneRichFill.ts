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
    'Richer bodies, NOT fewer slides: still emit EXACTLY the requested number of slides.',
  ];
}

/**
 * After daemon template Clone seeds LOOK into deck.html, queue one AI turn that
 * fills REAL content while preserving the template visual kit.
 *
 * Clone alone must never leave the user's "만들어줘" instruction as slide copy.
 *
 * Critical: do NOT attach or rewrite the full cloned example.html —
 * that burns max_tokens in `<head>` CSS and hangs for minutes with no deck.
 */

import type { ChatAttachment } from '../types';
import {
  briefLooksLikeGeneralKnowledgeHowToTopic,
  htmlLooksLikeJsonLookSlotFill,
  htmlLooksLikeMixedLookAndOfficialRich,
  htmlLooksLikeOfficialRichDeck,
  looksLikeTemplateCloneServiceIntroBrief,
  SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION,
  SLIDE_DECK_COPY_DENSITY_INSTRUCTION,
  SLIDE_DECK_LAYOUT_VARIETY_INSTRUCTION,
  SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION,
  SLIDE_DECK_TOPIC_LOCK_INSTRUCTION,
  SLIDE_DECK_TOPIC_LOCK_INSTRUCTION_WITHOUT_KPI_BAN,
  SLIDE_DECK_UNIQUE_SLOT_FILL_LINE,
  renderSlideCountRequirementInstruction,
  renderSlideCountSeedHeaderHint,
} from '@open-design/contracts';
import {
  briefLooksLikeAttachedSource,
  CANVAS_CREATE_SLIDES_PROMPT,
  HOME_CREATE_SLIDES_PROMPT,
  HOME_EMPTY_CREATE_SLIDES_PROMPT,
  HOME_FILL_SLIDES_PROMPT,
  HOME_FILL_SLIDES_PROMPT_LEGACY,
  isSlideCreateBoilerplateLine,
} from './slideCreateBoilerplate';
import { isSlideCountRangeHint, parseSlideCountSpec, parseSlideCountTarget } from './slideCountTopUp';
import { readTeamverViteEnv } from './teamverViteEnv';
import { isTeamverEmbedMode } from './designApiBase';
import {
  RICH_OFFICIAL_LOOK_FILL_MODE,
  buildRichOfficialLookDensityBlock,
  isRichOfficialLookFillModeValue,
} from './templateCloneRichFill';

/** Keep local — contracts barrel can be undefined during web test init. */
const FIRST_FILL_SLIDE_COUNT_THIS_TURN = 6;
const FIRST_FILL_HONOR_MAX = 20;
const FIRST_FILL_TOP_UP_FROM = 21;
const FIRST_FILL_SLIDE_COUNT_GUIDANCE =
  `Slide count THIS TURN: honor an explicit user count of 1–${FIRST_FILL_HONOR_MAX} exactly (5-6/5~6 → use the requested range maximum; 8-10 → 10). JSON is compact enough to finish the full requested outline in one turn; do not stop at 6 and defer hidden top-up. If unspecified, close ${FIRST_FILL_SLIDE_COUNT_THIS_TURN} this turn. Never close after a single cover or after 3 slides when the target is 5+. Never exceed the requested max.`;

/** Keep local — importing canvasSlideLaunch here caused circular init of expansion consts. */
const SLIDE_DECK_QUALITY_BAR_INSTRUCTION =
  'Quality bar: each non-divider slide needs a headline, takeaway, and concrete support (specific bullets, metrics, examples, risks, actions, timeline, comparison, or decision criteria). '
  + 'Reject title-only slides, raw user-prompt copy, template demo captions, and generic placeholders. '
  + 'Vary slide roles/layouts and use the 1920×1080 canvas intentionally; keep content dense enough without bloating the HTML.';

export const TEMPLATE_CLONE_CONTENT_FILL_MARKER = '[Template clone content fill]';

/** Appended model-only contract after Clone seed (not an existing-deck edit). */
export const TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER = '[Template clone content fill turn]';

/** Prompt-mode HTML fill (not JSON slot-fill). Model-only — strip from chat UI. */
export const TEMPLATE_CLONE_PROMPT_FILL_MARKER = '[Template clone prompt fill]';

/** One-shot JSON repair after invalid outline (0901-N02 B5). */
export const TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER = '[Template clone slot-fill JSON repair]';

/** handleSend entryFrom for the one-shot JSON repair auto-send (루프368). */
export const CLONE_SLOT_FILL_REPAIR_ENTRY_FROM = 'clone_slot_fill_json_repair';

/**
 * Fill mode for explicit-template deck creates.
 *
 *   `prompt` (**env-empty / staging default since loop535**): LOOK seed, then
 *     MiniMax HTML content fill. Template chrome stays; copy is model-written.
 *     Loop532 briefly defaulted to `deterministic` (no MiniMax) — that made
 *     Home create finish immediately with thin synth copy. Restored here.
 *
 *   `deterministic`: daemon owns LOOK/layout assembly. Concrete source copy
 *     completes immediately; generic synthesized copy queues a JSON outline
 *     so the model improves content without rewriting template HTML.
 *
 *   `json`: LOOK seed + AI dense JSON outline (opt-in only — MiniMax
 *     JSON-only turns often fail AGENT_EXECUTION_FAILED).
 *
 *   `pure-prompt`: SKIP LOOK seeding when no template is picked. Kit spec
 *     still lands in the system prompt. With an explicit template, LOOK
 *     still seeds (loop422) and AI prompt-fill still runs (loop463).
 */
export type TemplateCloneFillMode =
  | 'json'
  | 'prompt'
  | 'deterministic'
  | 'pure-prompt'
  // 1007-N01 슬라이스 B — official-look 리치 모드(opt-in, 기본 OFF). json/prompt
  // 분기와 별개 값이라 기존 `=== 'json'`/`=== 'prompt'` 체크에 영향 없음.
  | 'official-rich';

/**
 * 0918-N03 — AI writes a structured content outline; the host deterministically
 * renders it into official template shells. A missing build-time env must
 * never route the clone through free-form HTML or thin rule-based copy.
 * `deterministic` remains an emergency no-model fallback and `prompt` remains
 * an explicit legacy comparison path.
 */
// 1007-N01 슬라이스 C — 기본값을 official-rich 로 전환(2026-10-08). 모델이 저작한
// full HTML 밀도(ref0904 9/4 기준선)를 기본 경로로 쓴다. 리치 persist 는 JSON
// slot-fill 과 동일한 데크-레벨 주제오염 중립화·demo 스크럽 가드를 통과한다
// (applyRichFillPersistTopicGuards, host-fill 게이트). 즉시 롤백 경로:
//   1) 이 상수 1곳을 'json' 으로 되돌린다, 또는
//   2) env `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=json` / localStorage
//      `od:template-clone-fill-mode=json` override (코드 변경 없이).
export const TEMPLATE_CLONE_FILL_DEFAULT_MODE: TemplateCloneFillMode = 'official-rich';

export function normalizeTemplateCloneFillMode(value: unknown): TemplateCloneFillMode {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  // 1007-N01 슬라이스 B — official-look 리치 모드. json/legacy-prompt 별칭보다
  // 먼저 접어, `rich`/`official-look` 등이 prompt로 흡수되지 않도록 한다.
  if (isRichOfficialLookFillModeValue(raw)) {
    return RICH_OFFICIAL_LOOK_FILL_MODE;
  }
  if (raw === 'deterministic' || raw === 'content-fill' || raw === 'server') {
    return 'deterministic';
  }
  // 루프401/407/413/420 — `pure-prompt` aliases. Empty/unknown → default.
  if (
    raw === 'pure-prompt'
    || raw === 'no-seed'
    || raw === 'skip-seed'
    || raw === 'no-clone'
    || raw === 'pre-clone'
    || raw === 'legacy-prompt'
  ) {
    return 'pure-prompt';
  }
  // 루프414 — Keep existing `=prompt` / `clone` as HTML rewrite.
  // Remapping those to JSON sent MiniMax a JSON-only turn and surfaced
  // AGENT_EXECUTION_FAILED. JSON slot-fill is explicit `json` only.
  if (
    raw === 'prompt'
    || raw === 'prompt-fill'
    || raw === 'html'
    || raw === 'html-fill'
    || raw === 'legacy-html'
    || raw === 'legacy-prompt-fill'
    || raw === 'clone'
    || raw === 'clone-fill'
  ) {
    return 'prompt';
  }
  if (
    raw === 'json'
    || raw === 'slot-fill'
    || raw === 'json-fill'
  ) {
    return 'json';
  }
  return TEMPLATE_CLONE_FILL_DEFAULT_MODE;
}

export function isTemplateClonePromptFillPrompt(text: unknown): boolean {
  return String(text ?? '').includes(TEMPLATE_CLONE_PROMPT_FILL_MARKER);
}

/**
 * 1007-N01 결함1(주제 날조) A안 — 현재 fill 모드와 함께 그 모드가 **사용자의 명시
 * override**(env `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE` / localStorage
 * `od:template-clone-fill-mode`)에서 온 것인지(`explicit`)를 반환한다. 기본값에 의한
 * official-rich 는 `explicit=false` → 소스가 없으면 json 으로 강등 가능.
 */
export function getTemplateCloneFillModeResolution(): {
  mode: TemplateCloneFillMode;
  explicit: boolean;
} {
  const fromEnv = readTeamverViteEnv('VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE');
  if (fromEnv) return { mode: normalizeTemplateCloneFillMode(fromEnv), explicit: true };
  // Teamver embed follows the deployment policy. Local experiments must not
  // silently switch a production embed back to free-form prompt fill.
  if (typeof window !== 'undefined' && !isTeamverEmbedMode()) {
    try {
      const stored = window.localStorage.getItem('od:template-clone-fill-mode');
      if (stored) return { mode: normalizeTemplateCloneFillMode(stored), explicit: true };
    } catch {
      /* no-op — sessionStorage unavailable in SSR / private mode. */
    }
  }
  return { mode: TEMPLATE_CLONE_FILL_DEFAULT_MODE, explicit: false };
}

export function getTemplateCloneFillMode(): TemplateCloneFillMode {
  return getTemplateCloneFillModeResolution().mode;
}

/**
 * 1007-N01 결함1(주제 날조) A안 — 소스가 없으면 '기본값에 의한' official-rich 를
 * json slot-fill 로 강등한다. 리치는 모델이 빈 캔버스를 자유 저작 → 소스 없이는
 * 날조 위험. json 경로는 호스트가 LOOK 시드를 결정론적으로 채워 저작 자유도를 제한한다.
 *
 * - 사용자가 env/localStorage 로 직접 official-rich 를 강제한 경우(`explicit`)는 존중.
 * - json/prompt/pure-prompt/deterministic 등 비리치 모드는 그대로(1비트 불변).
 */
export function resolveEffectiveTemplateCloneFillMode(input: {
  mode: TemplateCloneFillMode;
  explicit: boolean;
  hasSource?: boolean | null;
  /**
   * 1007-N01 슬라이스 E(v1.4.16 품질 회귀) — 소스가 없을 때 리치→json 강등을 적용할지.
   *
   * 결함1 A안(a8d30f3bcd)은 "소스(URL/첨부) 없음"을 곧바로 날조 위험으로 보고 **모든**
   * no-source 리치 기본값을 json slot-fill 로 강등했다. 그 결과 '글을 매력적으로 쓰는 팁'
   * 같은 **일반 지식/교육 주제**(특정 실존 엔티티의 사실을 주장하지 않음 → 날조 위험 없음)
   * 까지 구조적으로 얇은 json product-launch slot-fill 로 떨어져 v1.4.16(기본 official-rich,
   * 강등 없음) 대비 밀도·주제 일관성이 회귀했다.
   *
   * 날조 위험의 실제 트리거는 "소스 없이 **특정 실존 엔티티의 사실**(회사·제품 소개/IR/
   * pitch 등)을 발표"하는 브리프다. 그런 브리프는 그대로 json 으로 강등(날조 방지 유지, D
   * 가드와 중복 안전망). 일반 지식/교육/방법/팁 주제는 리치 유지(모델 자유 저작 = 정상
   * 사용, 밀도 회복). 빈/제네릭 브리프도 json 유지(리치가 가짜 주제를 지어내는 것 방지).
   *
   * `undefined`(미지정) → 기존 동작(강등)로 backward-compat. 호출부가 명시적으로 false 를
   * 넘기면 강등하지 않는다.
   */
  requiresGrounding?: boolean | null;
}): TemplateCloneFillMode {
  if (
    input.mode === RICH_OFFICIAL_LOOK_FILL_MODE
    && !input.explicit
    && input.hasSource === false
    && input.requiresGrounding !== false
  ) {
    return 'json';
  }
  return input.mode;
}

/**
 * 1007-N01 슬라이스 E — 소스가 없을 때 리치→json 강등을 적용해야 하는 브리프인지.
 *
 * true(= 강등해 날조 방지):
 *   - 빈/제네릭 브리프(실 주제 없음) — 리치가 가짜 주제를 지어낼 위험.
 *   - 특정 실존 엔티티의 **소개/발표**(회사·제품·서비스·브랜드 소개, 소개 자료/발표자료/
 *     소개서, IR, pitch deck, 사업계획서, 투자 유치/제안) — 소스 없이 사실을 날조할 위험.
 *
 * false(= 리치 유지, 밀도 회복):
 *   - 일반 지식·교육·방법·팁·개념 주제('글을 매력적으로 쓰는 팁', '영어 회화 공부법',
 *     'React 기초' 등). 모델이 자신의 일반 지식으로 저작 = 정상 사용, 날조 아님.
 *     D 가드가 요금·연락처·버전·수치 날조는 별도로 차단한다.
 */
export function templateCloneBriefRequiresSourceGrounding(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  hasSourceMaterial?: boolean;
}): boolean {
  if (options.hasSourceMaterial === true) return false;
  const combinedBrief = [options.sourceBrief, options.pendingPrompt, options.userInstruction]
    .filter(Boolean)
    .join('\n\n');
  // 빈/제네릭 브리프(실 주제 없음)는 리치가 가짜 주제를 지어낼 위험 → 강등.
  if (isGenericTemplateCloneTopicBrief(combinedBrief, {
    hasSourceMaterial: options.hasSourceMaterial ?? false,
  })) {
    return true;
  }
  const visible = extractTemplateCloneUserFacingRequest({
    userInstruction: options.userInstruction,
    sourceBrief: options.sourceBrief,
    pendingPrompt: options.pendingPrompt,
  });
  const hay = `${visible}\n${combinedBrief}`;
  return briefLooksLikeEntityIntroPresentation(hay);
}

/**
 * 특정 실존 엔티티(회사/제품/서비스/브랜드)의 소개·발표 성격 브리프 판정.
 * 일반 how-to/팁/개념 주제('…하는 팁', '…하는 법', '…란', '…기초')는 매칭하지 않는다.
 */
const ENTITY_INTRO_PRESENTATION_RE =
  /(?:회사|기업|제품|서비스|브랜드|스타트업|사업|조직|기관|앱|어플|플랫폼|솔루션|프로덕트)\s*소개|소개\s*(?:발표\s*)?자료|소개서|소개\s*(?:피피티|ppt|슬라이드|프레젠테이션|덱|deck)|회사소개|제품소개|서비스소개|사업\s*계획서|\bIR\b|pitch\s*deck|투자\s*(?:유치|제안|설명)|company\s+(?:intro|profile|overview)|product\s+(?:launch|intro)/i;

export function briefLooksLikeEntityIntroPresentation(text: string | null | undefined): boolean {
  const value = String(text ?? '');
  if (!value.trim()) return false;
  return ENTITY_INTRO_PRESENTATION_RE.test(value);
}

/**
 * 1007-N01 결함1 A안 — 이번 턴에 '근거 소스'가 있는지(리치 강등 게이팅 전용).
 *
 * `hasSourceMaterial`(첨부/Canvas·Drive 소스)이 true 이거나, 브리프에 공개 URL/도메인이
 * 있으면 true. URL 이 있으면 handleSend 의 web-fetch 가 그 페이지를 그라운딩에 주입한다
 * (`fetchApiWebFetchContexts`). 시드 확정 시점(큐잉/clone 전)이 web-fetch(handleSend 중)
 * 보다 앞서므로, 소스 유무 플래그를 이 빌드 시점 추론으로 주입한다 — 명시 플래그를 넘기면
 * 그 값이 우선한다.
 */
export function inferTemplateCloneFillHasSource(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  hasSourceMaterial?: boolean;
}): boolean {
  if (options.hasSourceMaterial === true) return true;
  const combinedBrief = [options.sourceBrief, options.pendingPrompt, options.userInstruction]
    .filter(Boolean)
    .join('\n\n');
  if (!combinedBrief.trim()) return false;
  return extractWebsiteAnalysisAnchorsFromBrief(combinedBrief).urls.length > 0;
}

/**
 * Server slot-fill only when mode is explicitly `deterministic`.
 * 루프463 — do not force deterministic on `pure-prompt` + picked template;
 * that skipped MiniMax and left thin outline copy. LOOK seed is still
 * required via `shouldSkipTemplateCloneSeed(false)` for explicit templates.
 */
export function shouldUseDeterministicTemplateCloneFill(
  hasExplicitTemplate = false,
): boolean {
  void hasExplicitTemplate;
  return getTemplateCloneFillMode() === 'deterministic';
}

/** 루프535 — mark a just-filled deterministic deck for one sparse/observe pass. */
export function deterministicCloneFilledMetadataFields(): {
  templateCloneContentFilled: true;
  templateCloneContentFillPending: false;
  templateCloneFillMode: 'deterministic';
  templateCloneSparseCheckPending: true;
} {
  return {
    templateCloneContentFilled: true,
    templateCloneContentFillPending: false,
    templateCloneFillMode: 'deterministic',
    templateCloneSparseCheckPending: true,
  };
}

/** AI JSON content outline + deterministic LOOK shell rendering (default). */
export function shouldUseJsonTemplateCloneFill(): boolean {
  return getTemplateCloneFillMode() === 'json';
}

/** Home/App should queue a MiniMax fill turn after LOOK seed. */
export function shouldQueueAiTemplateCloneFill(hasExplicitTemplate = false): boolean {
  if (shouldUseDeterministicTemplateCloneFill(hasExplicitTemplate)) return false;
  const mode = getTemplateCloneFillMode();
  // official-rich 는 prompt-fill 변종이라 json/prompt 와 동일하게 fill 턴을 큐잉.
  if (mode === 'json' || mode === 'prompt' || mode === RICH_OFFICIAL_LOOK_FILL_MODE) return true;
  // 루프463 — picked template on pure-prompt: LOOK seed then AI prompt-fill.
  return mode === 'pure-prompt' && hasExplicitTemplate;
}

/**
 * 루프421 — Skip Home auto-send when the server already delivered the
 * deck. A leftover host-fill seed must not overwrite that deliverable.
 * Unfilled metadata still allows fail-fallback / no-template first messages.
 */
export function shouldSkipCreateAutoSendForDeterministicClone(input: {
  metadata?: unknown;
  seed?: string | null;
  fillQueued?: boolean;
}): boolean {
  const rec = input.metadata && typeof input.metadata === 'object'
    ? (input.metadata as Record<string, unknown>)
    : null;
  if (rec?.templateCloneContentFilled === true) return true;
  if (rec?.templateCloneContentFillPending === true) return false;
  if (shouldUseDeterministicTemplateCloneFill() && isTemplateCloneHostFillPrompt(input.seed)) {
    return true;
  }
  void input.fillQueued;
  return false;
}

/** JSON or prompt-fill seed already queued for this project. */
export function isTemplateCloneHostFillQueued(
  projectId: string,
  extraSeeds: Array<string | null | undefined> = [],
): boolean {
  if (isTemplateCloneContentFillQueued(projectId)) return true;
  return extraSeeds.some((seed) => isTemplateCloneHostFillPrompt(seed));
}

/** LOOK seed + model HTML rewrite (legacy dual-instruction path). */
export function shouldUsePromptTemplateCloneFill(): boolean {
  return getTemplateCloneFillMode() === 'prompt';
}

/**
 * 1007-N01 슬라이스 B — official-look 리치 모드(opt-in, 기본 OFF). 켜면 모델이
 * full HTML을 9/4 밀도로 저작한다. json 경로와 완전히 분리된 별도 값.
 */
export function isRichOfficialLookTemplateCloneFill(): boolean {
  return getTemplateCloneFillMode() === RICH_OFFICIAL_LOOK_FILL_MODE;
}

export function buildTemplateCloneFillSeedForCurrentMode(
  options: Parameters<typeof buildTemplateCloneContentFillSeed>[0] & {
    /**
     * 1007-N01 결함1 A안 — 이번 턴 소스 유무(web-fetch ok:true / 첨부). 명시하면
     * 우선 적용, 생략 시 브리프 URL·`hasSourceMaterial` 로 추론. 소스가 없고
     * 리치가 기본값(비명시)일 때만 json 으로 강등한다.
     */
    hasSource?: boolean | null;
  },
): { seed: string; jsonFill: boolean } {
  const { hasSource: hasSourceOverride, ...seedOptions } = options;
  const resolution = getTemplateCloneFillModeResolution();
  // 1007-N01 결함1 A안 — 소스 없는 '기본값 리치' 는 날조 위험 브리프일 때만 json 으로
  // 강등(날조 차단). 1007-N01 슬라이스 E — 일반 지식/교육/팁 주제는 소스가 없어도
  // 날조 위험이 없으므로 리치를 유지해 v1.4.16 밀도를 회복한다.
  const hasSource = hasSourceOverride ?? inferTemplateCloneFillHasSource(seedOptions);
  const requiresGrounding = templateCloneBriefRequiresSourceGrounding(seedOptions);
  const mode = resolveEffectiveTemplateCloneFillMode({
    mode: resolution.mode,
    explicit: resolution.explicit,
    hasSource,
    requiresGrounding,
  });
  // 1007-N01 슬라이스 B — 리치 모드는 prompt-fill(HTML artifact) 변종. jsonFill
  // false 로 기존 prompt-fill 큐/복구 경로를 그대로 재사용한다.
  if (mode === RICH_OFFICIAL_LOOK_FILL_MODE) {
    return { jsonFill: false, seed: buildTemplateCloneRichOfficialLookFillSeed(seedOptions) };
  }
  const jsonFill = mode === 'json';
  return {
    jsonFill,
    seed: jsonFill
      ? buildTemplateCloneContentFillSeed(seedOptions)
      : buildTemplateClonePromptFillSeed(seedOptions),
  };
}

/**
 * 루프401/422 — Skip LOOK seed only for no-template `pure-prompt`.
 * A picked Capsule/Daisy/… template always clones `example.html`.
 * MiniMax kit-spec-only create cannot apply the visual system.
 */
export function shouldSkipTemplateCloneSeed(hasExplicitTemplate = false): boolean {
  if (hasExplicitTemplate) return false;
  return getTemplateCloneFillMode() === 'pure-prompt';
}

/** True when the current fill mode is `pure-prompt` (see loop400). */
export function isPurePromptTemplateCloneFill(): boolean {
  return getTemplateCloneFillMode() === 'pure-prompt';
}

export function templateCloneContentFillFlagKey(projectId: string): string {
  return `od:template-clone-content-fill:${projectId}`;
}

export function autoSendSeedStorageKey(projectId: string): string {
  return `od:auto-send-seed:${projectId}`;
}

export function isTemplateCloneContentFillPrompt(text: string | null | undefined): boolean {
  const value = String(text ?? '');
  return (
    value.includes(TEMPLATE_CLONE_CONTENT_FILL_MARKER)
    || value.includes(TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER)
    || value.includes(TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER)
  );
}

export type TemplateCloneFillModeFlag = 'prompt' | 'json';

export function isTemplateCloneHostFillPrompt(text: string | null | undefined): boolean {
  return isTemplateCloneContentFillPrompt(text) || isTemplateClonePromptFillPrompt(text);
}

export function templateCloneFillModeFromUserMessage(
  message?: {
    content?: string | null;
    runContext?: { templateCloneFill?: string | null } | null;
  } | null,
): TemplateCloneFillModeFlag | null {
  if (!message) return null;
  if (isTemplateCloneContentFillPrompt(message.content)) return 'json';
  if (isTemplateClonePromptFillPrompt(message.content)) return 'prompt';
  const mode = message.runContext?.templateCloneFill;
  return mode === 'prompt' || mode === 'json' ? mode : null;
}

/** Auto-continue / resume flags after persist stores the brief only. */
export function templateCloneAutoContinueFlags(
  originUser?: Parameters<typeof templateCloneFillModeFromUserMessage>[0],
): { jsonFill: boolean; promptFill: boolean; hostFill: boolean } {
  const mode = templateCloneFillModeFromUserMessage(originUser);
  return {
    jsonFill: mode === 'json',
    promptFill: mode === 'prompt',
    hostFill: mode != null,
  };
}

export function isTemplateCloneSlotFillRepairPrompt(text: string | null | undefined): boolean {
  return String(text ?? '').includes(TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER);
}

/** True when any user turn already requested the one-shot JSON repair. */
export function historyHasTemplateCloneSlotFillRepair(
  messages: readonly { role?: string; content?: string | null }[],
): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user' && isTemplateCloneSlotFillRepairPrompt(message.content)) {
      return true;
    }
  }
  return false;
}

/**
 * Repair already attempted on this fill lineage — includes the in-flight user
 * turn (messagesRef may lag behind the local `userMsg` during finalize).
 */
export function cloneFillJsonRepairAlreadyAttempted(
  messages: readonly { role?: string; content?: string | null }[],
  currentUserContent?: string | null,
): boolean {
  if (isTemplateCloneSlotFillRepairPrompt(currentUserContent)) return true;
  return historyHasTemplateCloneSlotFillRepair(messages);
}

/** True when a one-shot JSON repair auto-send should run before LOOK seed warning. */
export function shouldQueueCloneSlotFillJsonRepair(
  messages: readonly { role?: string; content?: string | null }[],
  currentUserContent?: string | null,
): boolean {
  return !cloneFillJsonRepairAlreadyAttempted(messages, currentUserContent);
}

/** Short repair user turn — not the long incomplete-output auto-continue essay. */
export function buildTemplateCloneSlotFillRepairPrompt(options?: {
  userBrief?: string | null;
  recoveredSlideCount?: number;
  recoveredSlideTitles?: string[];
  targetSlideCount?: number;
}): string {
  const recoveredSlideCount = Math.max(0, Math.floor(options?.recoveredSlideCount ?? 0));
  const targetSlideCount = Math.max(0, Math.floor(options?.targetSlideCount ?? 0));
  const missingSlideCount = targetSlideCount > recoveredSlideCount
    ? targetSlideCount - recoveredSlideCount
    : 0;
  const parts = [
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
    TEMPLATE_CLONE_SLOT_FILL_REPAIR_MARKER,
    recoveredSlideCount > 0 && missingSlideCount > 0
      ? `The host recovered ${recoveredSlideCount} complete AI-authored slides from the truncated reply. Return ONLY the ${missingSlideCount} missing slides in slides[]; the host will append them.`
      : 'Previous reply was not a valid JSON outline (HTML dump or schema fail).',
    'Begin with `{` (or ```json) immediately. Emit ONE JSON outline only this turn with no status sentence, promise, commentary, or progress prose.',
    'Shape: {"title":"...","slides":[{"title":"...","body":"line\\nline","roleHint":"cover|list|cards|timeline|stat|quote|team|process|closing|body"}]}',
    'FORBIDDEN: <!doctype, <html, <head, <style, <section class="slide">, Motif <svg>.',
    // 루프522 — Mirror templateCloneContentFillHardRules: JSON slot-fill turns
    // have no artifact wrapper. Some MiniMax retries here try to "patch" the
    // LOOK seed with `<artifact type="deck-patch"></artifact>` (empty) instead
    // of returning the JSON outline, which is rejected as `incomplete_output`.
    'Never emit `<artifact type="deck-patch">` or `<artifact type="element-patch">` — this is a JSON slot-fill turn (no artifact wrapper).',
    'Host slot-fills the LOOK seed. Do not regenerate deck HTML.',
  ];
  const recoveredTitles = (options?.recoveredSlideTitles ?? [])
    .map((title) => String(title ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 20);
  if (recoveredTitles.length > 0) {
    parts.push(`Already retained slide titles (do not repeat): ${recoveredTitles.join(' | ')}`);
  }
  const brief = String(options?.userBrief ?? '').trim();
  if (brief && !looksLikeInstructionNotSlideCopy(brief)) {
    parts.push(`Original brief (fill REAL topical copy): ${brief.slice(0, 400)}`);
  }
  return parts.join('\n');
}

/** True when the most recent user turn is still a Clone JSON content-fill. */
export function historyHasTemplateCloneContentFill(
  messages: readonly {
    role?: string;
    content?: string | null;
    runContext?: { templateCloneFill?: string | null } | null;
  }[],
): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user') {
      return templateCloneFillModeFromUserMessage(message) === 'json';
    }
  }
  return false;
}

/**
 * 루프468 — Any Clone host fill (prompt or json) in the conversation.
 * Top-up user turns drop fill markers; recovery still needs Clone lineage.
 */
export function conversationHasTemplateCloneHostFill(
  messages: readonly {
    role?: string;
    content?: string | null;
    runContext?: { templateCloneFill?: string | null } | null;
  }[],
): boolean {
  return messages.some((message) => {
    if (message?.role !== 'user') return false;
    const mode = templateCloneFillModeFromUserMessage(message);
    return mode === 'json' || mode === 'prompt';
  });
}

/**
 * Auto-continue prompts drop fill markers — re-stamp CREATE fill contract so
 * handleSend keeps stripping deck.html and never flips to existing-deck edit.
 * No-op when the prompt already carries a fill marker (first seed or prior stamp).
 */
const TEMPLATE_CLONE_FILL_JSON_REPAIR =
  'ABANDON any HTML deck dump. Restart with ONE JSON outline only: {"title":"...","slides":[{"title":"...","body":"...","roleHint":"cover"}]}. No <!doctype / <section class="slide">.';

export function ensureTemplateCloneContentFillContinuePrompt(prompt: string): string {
  const trimmed = String(prompt ?? '').trim();
  if (!trimmed) return trimmed;
  if (isTemplateCloneContentFillPrompt(trimmed)) {
    if (
      trimmed.includes('ABANDON any Motif')
      || trimmed.includes('ABANDON any large Motif')
      || trimmed.includes('ABANDON any HTML deck dump')
      || trimmed.includes('kit Motif vocabulary')
      || trimmed.includes('kit motif vocabulary')
      || trimmed.includes('JSON outline only')
    ) return trimmed;
    return `${trimmed}\n\n${TEMPLATE_CLONE_FILL_JSON_REPAIR}`;
  }
  return [
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    TEMPLATE_CLONE_CONTENT_FILL_TURN_MARKER,
    'This is an auto-continue of a template-clone CONTENT FILL (CREATE), not a surgical edit of the Clone LOOK seed.',
    ...templateCloneContentFillHardRules(),
    TEMPLATE_CLONE_FILL_JSON_REPAIR,
    '',
    trimmed,
  ].join('\n');
}

/** Canvas/Home boilerplate only — user topic lines may still contain "만들어줘". */
export function looksLikeCanvasCreateBoilerplate(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (isSlideCreateBoilerplateLine(t)) return true;
  if (t === CANVAS_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_EMPTY_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_FILL_SLIDES_PROMPT) return true;
  if (t === HOME_FILL_SLIDES_PROMPT_LEGACY) return true;
  if (/^(?:User instruction|Deliverable instruction|Source brief|Quick settings)\s*[:：]/i.test(t)) {
    return true;
  }
  return false;
}

export function looksLikeInstructionNotSlideCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (looksLikeCanvasCreateBoilerplate(t)) return true;
  if (/(?:만들어|작성|생성)\s*(?:줘|주세요)|설명해?\s*(?:줘|주세요)/i.test(t)) return true;
  if (/^(?:please\s+)?(?:make|create|build|write|generate)\s+/i.test(t)) return true;
  if (/피피티|PPT|슬라이드\s*덱/i.test(t) && /(?:만들어|작성|생성|설명)/i.test(t)) return true;
  return false;
}

/**
 * Short cover-topic label from a "만들어줘" request.
 * "expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨." → "expo"
 */
export function deriveTemplateCloneTopicLabel(request: string): string {
  const t = request.trim();
  if (!t) return '';
  const aboutKo = t.match(
    /^(.+?)\s*(?:에\s*대해(?:서)?|에\s*관한)\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)/i,
  )?.[1]?.trim();
  if (aboutKo && aboutKo.length >= 2 && !looksLikeCanvasCreateBoilerplate(aboutKo)) {
    return aboutKo.slice(0, 60);
  }
  const aboutEn = t.match(
    /(?:about|on)\s+(.+?)(?:\s+(?:slides?|deck|presentation|ppt)\b|[.?!]|$)/i,
  )?.[1]?.trim();
  if (aboutEn && aboutEn.length >= 2 && !looksLikeInstructionNotSlideCopy(aboutEn)) {
    return aboutEn.slice(0, 60);
  }
  return '';
}

/**
 * Keep facts the model needs (headings, preview, user topic, quick settings).
 * Drop Home/Canvas create scaffolding that used to be dumped as [Source brief]
 * and drowned the actual topic.
 */
export function compactTemplateCloneFillSourceBrief(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  const parts: string[] = [];
  const push = (label: string, value: string | null | undefined, max = 600) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    parts.push(`${label}: ${v.slice(0, max)}`);
  };

  push('Canvas title', /Canvas title\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push('Drive source file', /Drive source file\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push('Drive source MIME', /Drive source MIME\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push(
    'Visible headings',
    /(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*(.+)$/im.exec(text)?.[1],
  );
  push(
    'Source preview',
    /Source preview\s*[:：]\s*([\s\S]*?)(?=\n(?:Canvas |Drive |Visible |User |Selected |\[)|$)/i
      .exec(text)?.[1],
    600,
  );
  const userInstr = /\[?User instruction\]?\s*[:：]?\s*\n?([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected |\[)|$)/i
    .exec(text)?.[1]?.trim();
  if (userInstr && !looksLikeCanvasCreateBoilerplate(userInstr)) {
    push('User instruction', userInstr, 400);
  }
  const quick = /\[Quick settings\]\s*\n?([\s\S]*?)(?=\n\[|$)/i.exec(text)?.[1]?.trim();
  if (quick) parts.push(`Quick settings:\n${quick}`);

  if (parts.length > 0) return parts.join('\n').slice(0, 1400);
  if (/\[Deliverable instruction\]|\[Selected slide template/i.test(text)) return '';
  // 루프471 — URL / 사이트·서비스 소개 분석 문장은 instruction drop 전에 보존.
  // Otherwise prompt-fill loses the only source anchor before web-fetch binds.
  if (looksLikeTemplateCloneServiceIntroBrief(text)) {
    return text.slice(0, 1400);
  }
  if (looksLikeCanvasCreateBoilerplate(text) || looksLikeInstructionNotSlideCopy(text)) {
    return '';
  }
  return text.slice(0, 1400);
}

/** Anchors extracted from a website/product analysis brief for prompt-fill outline binding. */
export type WebsiteAnalysisAnchors = {
  urls: string[];
  topic: string | null;
  headings: string[];
  previewLines: string[];
};

const WEBSITE_ANALYSIS_URL_RE =
  /\b(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/gi;
const WEBSITE_ANALYSIS_BARE_HOST_RE =
  /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:com|net|org|io|ai|app|dev|kr|co\.kr)\b/gi;

/**
 * Pull URLs, visible headings, and short preview lines from a Clone fill brief
 * so the website-analysis outline can bind slots to real source facts.
 */
export function extractWebsiteAnalysisAnchorsFromBrief(
  brief: string | null | undefined,
): WebsiteAnalysisAnchors {
  const text = String(brief ?? '').trim();
  const urls = new Set<string>();
  for (const match of text.matchAll(WEBSITE_ANALYSIS_URL_RE)) {
    const raw = String(match[0] ?? '').replace(/[.,;:!?]+$/g, '');
    if (raw) urls.add(raw.slice(0, 120));
  }
  for (const match of text.matchAll(WEBSITE_ANALYSIS_BARE_HOST_RE)) {
    const raw = String(match[0] ?? '').trim();
    if (raw && !/^(?:example|localhost)\b/i.test(raw)) urls.add(raw.slice(0, 120));
  }

  const headingsRaw =
    /(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*(.+)$/im.exec(text)?.[1]
    ?? '';
  const headings = headingsRaw
    .split(/\s*\/\s*|\s*[|;·]\s*|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 80)
    .slice(0, 12);

  const previewRaw =
    /Source preview\s*[:：]\s*([\s\S]*?)(?=\n(?:Canvas |Drive |Visible |User |Selected |\[)|$)/i
      .exec(text)?.[1]
    ?? '';
  const previewLines = previewRaw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter((line) => line.length >= 4 && line.length <= 120)
    .slice(0, 8);

  const topic =
    deriveTemplateCloneTopicLabel(text)
    || (/Canvas title\s*[:：]\s*(.+)$/im.exec(text)?.[1]?.trim().slice(0, 60) ?? null)
    || null;

  return {
    urls: [...urls].slice(0, 3),
    topic: topic && topic.length >= 2 ? topic : null,
    headings,
    previewLines,
  };
}

/**
 * 루프471 — Structured service-intro outline for website/product URL analysis.
 * Replaces the generic one-liner so MiniMax must bind sections to brief/web-fetch facts.
 */
export function buildWebsiteServiceIntroOutlineInstruction(
  brief: string | null | undefined,
): string | null {
  const text = String(brief ?? '').trim();
  if (!text || !looksLikeTemplateCloneServiceIntroBrief(text)) return null;

  const anchors = extractWebsiteAnalysisAnchorsFromBrief(text);
  const anchorBits: string[] = [];
  if (anchors.topic) anchorBits.push(`topic=${anchors.topic}`);
  if (anchors.urls.length > 0) anchorBits.push(`urls=${anchors.urls.join(', ')}`);
  if (anchors.headings.length > 0) {
    anchorBits.push(`headings=${anchors.headings.join(' / ')}`);
  }
  if (anchors.previewLines.length > 0) {
    anchorBits.push(`preview=${anchors.previewLines.slice(0, 4).join(' · ')}`);
  }
  const anchorLine = anchorBits.length > 0
    ? `Source anchors (bind these — do not ignore): ${anchorBits.join('; ')}.`
    : 'Source anchors: none parsed yet — bind every section to facts from [Source brief] and any `<web-fetch-context>` page text on this turn.';

  return [
    'Website/product analysis outline (REQUIRED — real service-introduction deck, not a shallow brand intro):',
    '1. Cover — product/brand name only (never a raw URL or truncated host crumb).',
    '2. Problem/context — concrete user/org pain from the source (2–4 bullets).',
    '3. Product promise — what the product claims to deliver (named value, not slogan-only).',
    '4. Core workflow — steps or journey named or implied by the source.',
    '5. Key features — 2–4 named features/modules from the source (title + body each).',
    '6. User/team use cases — who uses it and for what scenes.',
    '7. Closing / adoption path — next step, CTA, or rollout (qualitative unless source states metrics).',
    'Optional only if the source mentions them: integration / security / operations notes.',
    'Bind every section to facts in [Source brief] and any `<web-fetch-context>` on this turn. Prefer page titles, headings, feature names, and workflow copy over invented marketing filler.',
    anchorLine,
    'FORBIDDEN shallow-only decks: brand intro + "한눈에" / "소개" title-only slides, empty section labels, or a cover plus one generic overview. Every content slide needs 2–4 concrete cards/bullets/paragraphs from the source.',
  ].join('\n');
}

/**
 * Prefer the real topic line over Canvas boilerplate / full run prompts.
 * Kept user-facing (may still say "만들어줘") for chat display.
 */
export function extractTemplateCloneUserFacingRequest(input: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
}): string {
  const candidates: string[] = [];
  const push = (raw: string | null | undefined) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const bracketUser = /\[User instruction\]\s*\n([\s\S]*?)(?=\n\n\[|$)/i.exec(text)?.[1]?.trim();
    if (bracketUser) candidates.push(bracketUser);
    const userInstr = /\[?User instruction\]?\s*[:：]\s*\n?([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected |\[)|$)/i
      .exec(text)?.[1]?.trim();
    if (userInstr) candidates.push(userInstr);
    // Prefer the lead line before deliverable / Clone host-contract blocks.
    const beforeDeliverable = text.split(/\n\n\[Deliverable instruction\]/i)[0]?.trim() ?? text;
    const beforeHostContract = beforeDeliverable.split(/\n\[Template clone /i)[0]?.trim() ?? beforeDeliverable;
    for (const line of beforeHostContract.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^\[/.test(trimmed)) continue;
      if (/^(?:Deliverable instruction|Source brief|Quick settings|Selected slide template)/i.test(trimmed)) {
        continue;
      }
      candidates.push(trimmed.replace(/^User instruction\s*[:：]\s*/i, '').trim());
    }
  };
  push(input.userInstruction);
  push(input.sourceBrief);
  push(input.pendingPrompt);

  for (const candidate of candidates) {
    if (!candidate || looksLikeCanvasCreateBoilerplate(candidate)) continue;
    if (candidate.length > 500) continue;
    return candidate;
  }
  return HOME_FILL_SLIDES_PROMPT;
}

/**
 * 루프529 — Home create without source material: empty / boilerplate / title-only
 * briefs that would only produce LOOK-seed fallback after a wasted MiniMax turn.
 * Canvas/Drive (`hasSourceMaterial`) always return false — source brief anchors fill.
 */
export function isGenericTemplateCloneTopicBrief(
  raw: string | null | undefined,
  options?: { hasSourceMaterial?: boolean },
): boolean {
  if (options?.hasSourceMaterial) return false;
  const visible = extractTemplateCloneUserFacingRequest({
    userInstruction: raw,
    pendingPrompt: raw,
  }).trim();
  if (!visible || looksLikeCanvasCreateBoilerplate(visible)) return true;
  // Align with contracts SYNTH_GENERIC_TITLE_RE — cover-only labels.
  if (/^(?:슬라이드|deck|slides?|presentation|발표\s*자료|untitled|artifact)$/i.test(visible)) {
    return true;
  }
  // Extractable topic ("expo에 대해서…") → not generic.
  if (deriveTemplateCloneTopicLabel(visible)) return false;
  // Host / URL in the brief is enough of a topic for fill.
  if (/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/i.test(visible)) {
    return false;
  }
  // Instruction-only shells ("만들어줘", "슬라이드 만들어줘"). A short
  // "Teamver 소개 슬라이드 만들어줘" still names a topic — do not treat every
  // ≤24 character 만들어줘 line as an empty brief.
  if (looksLikeInstructionNotSlideCopy(visible) && visible.length <= 24) {
    if (instructionShellHasNoTopic(visible)) return true;
  }
  // Longer free-form with content beyond the verb phrase → keep auto-fill.
  if (visible.length >= 12) return false;
  return looksLikeInstructionNotSlideCopy(visible);
}

/**
 * True when a create-verb line has no product/topic left after the
 * slide-type words and trailing particles are removed.
 */
function instructionShellHasNoTopic(visible: string): boolean {
  const withoutVerbs = visible
    .replace(/(?:만들어|작성|생성)\s*(?:줘|주세요)|설명해?\s*(?:줘|주세요)/gi, ' ')
    .replace(/\b(?:please\s+)?(?:make|create|build|write|generate)\b/gi, ' ');
  const withoutSlideWords = withoutVerbs
    .replace(/(?:피피티|ppt|슬라이드\s*덱|슬라이드|덱|프레젠테이션|발표\s*자료|\bdeck\b|\bslides?\b|\bpresentation\b)/gi, ' ');
  const tokens = withoutSlideWords
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !/^(?:을|를|은|는|이|가|과|와|도|의|a|an|the)$/i.test(token));
  const residue = tokens.join('');
  return residue.length < 2;
}

const LOOK_SEED_ATTACHED_SOURCE_RE =
  /attached source materials \(Canvas\/Drive\/files\)/i;

/** 1007-N01 — one sentence, adjacent to the slide-count guard. */
const FILL_PER_SLIDE_KICKER_LINE =
  'Each slide kicker is a distinct 2–4 word label; do not paste the same kicker (or the example OVERVIEW) onto every slide.';

/** 1007-N01 — music/deco glyphs. Do not scrub these from other kits' HTML. */
const FILL_MUSIC_DECO_GLYPH_BAN_LINE =
  'Do not use music or deco glyphs (♪ ♫ 🎵 ♩ ◈ ◐ ✦ ✧) as icons or ornaments.';

const FILL_QUALITY_LINES_JSON = [
  SLIDE_DECK_UNIQUE_SLOT_FILL_LINE,
  FILL_PER_SLIDE_KICKER_LINE,
  SLIDE_DECK_TOPIC_LOCK_INSTRUCTION,
  FILL_MUSIC_DECO_GLYPH_BAN_LINE,
] as const;

function renderJsonOutlineSlideCountRequirement(
  seedShellCount: number | null | undefined,
): string {
  if (
    seedShellCount == null
    || !Number.isFinite(seedShellCount)
    || seedShellCount <= 0
  ) {
    return 'Return one slides[] entry for every slide layout in the seed; do not merge or drop entries.';
  }
  const n = Math.max(1, Math.floor(seedShellCount));
  return `Seed contains ${n} slide layouts. Return EXACTLY ${n} entries in slides[].`;
}

/**
 * 루프536 — LOOK seed 배너에 N09 generic-brief 문장을 붙일지.
 * Canvas/Drive 소스나 topical brief에는 붙이지 않는다.
 */
export function shouldExplainGenericBriefOnLookSeedFallback(input: {
  brief?: string | null;
  userContent?: string | null;
  attachments?: readonly unknown[] | null;
}): boolean {
  const hasSourceMaterial =
    (Array.isArray(input.attachments) && input.attachments.length > 0)
    || LOOK_SEED_ATTACHED_SOURCE_RE.test(String(input.userContent ?? ''));
  return isGenericTemplateCloneTopicBrief(input.brief ?? input.userContent, {
    hasSourceMaterial,
  });
}

/**
 * Shared hard rules for Clone → first AI content fill (JSON slot-fill, 0901-N02).
 *
 * JSON turns must express count in `slides[]` entries. Reusing the HTML
 * `<section class="slide">` requirement here gives the model contradictory
 * output contracts and is a common cause of one-slide / incomplete responses.
 */
export function templateCloneContentFillHardRules(options: {
  seedShellCount?: number | null;
  includeSlideCountRequirement?: boolean;
} = {}): string[] {
  const slideCountRequirement = renderJsonOutlineSlideCountRequirement(
    options.seedShellCount ?? null,
  );
  return [
    'Hard rules (READ — JSON slot-fill):',
    '- This is CREATE of real topical content, not a surgical edit. Begin with `{` (or ```json) immediately; emit no status sentence, promise, commentary, or progress prose.',
    '- Emit ONE JSON outline only (plain or ```json fenced). The host slot-fills the LOOK seed — do NOT regenerate deck HTML.',
    '- Never emit `<artifact type="deck-patch">` — this is a JSON slot-fill turn (no artifact).',
    '- Forbidden output: <!doctype, <html, <head, <style, <section class="slide">, Motif <svg>, full example.html rewrite.',
    `- ${SLIDE_DECK_QUALITY_BAR_INSTRUCTION}`,
    `- ${SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION}`,
    // 루프554 — N이 있으면 짧은 정량 한 줄만 (v1.4.15 길이 + EXACTLY N).
    // 1007-N01 — unique-slot / kicker / topic-lock / glyph sit on the next
    // lines. Slide-count text stays unchanged and adjacent.
    ...(options.includeSlideCountRequirement === false
      ? []
      : [`- ${slideCountRequirement}`]),
    ...FILL_QUALITY_LINES_JSON.map((line) => `- ${line}`),
    '- Expand THIS turn\'s brief only. Do not copy host-contract examples or the user instruction onto slides.',
    '- JSON shape: {"title":"...","slides":[{"title":"...","kicker":"...","lead":"...","roleHint":"cover|list|cards|timeline|stat|quote|team|process|closing|body","items":[{"title":"...","body":"..."}]}]}',
    '- Layout variety is mandatory: for 5+ slides use at least 3 distinct body `roleHint` values, and for 8–10 slides use at least 4 when the scaffold map offers them. Do not repeat the same cards/body layout for every page.',
    '- Pick `roleHint` from the Template scaffold map roles: cover once, then mix list/cards/stat/timeline/quote/process/body/closing according to the brief. Preserve semantic fit, but avoid one-layout decks.',
    '- Copy density must fill the chosen layout without becoming a label grid: every non-cover, non-closing slide needs a specific 25–60 Korean-character (12–30 English-word) `lead`; each `items[]` entry needs a concrete 25–60 Korean-character (12–30 English-word) `body`. Bare labels (`핵심`, `개념`, `요약`) and title-only cards fail. `stat` slides are excepted only when the metric is sourced and its label explains what the number measures.',
    '- Brand spelling: keep Latin product/brand spellings from the brief or URL (host-derived; do not phonetic-Hangulize proper nouns).',
    '- Cards / list / stat / process slides MUST use items[] with 3–4 {title, body} slots. lead = section subtitle, not a card. Every item body must state an actor/action, mechanism, trade-off, example, or observable result; do not emit title-only cards.',
    `- ${FIRST_FILL_SLIDE_COUNT_GUIDANCE} Outline length = requested count this turn (8-10 → 10; 20 → 20). Hidden top-up applies only above ${FIRST_FILL_HONOR_MAX}.`,
    '- Treat the daemon Clone seed as the visual baseline the host will keep. You only supply titles/bodies/roleHint.',
    `- If the brief is only a topic, use a default ${FIRST_FILL_SLIDE_COUNT_THIS_TURN}-slide outline (cover, why it matters, key concepts, evidence, next steps, close). Adapt labels to the topic and audience.`,
    '- Do not invent empty pillar/column-number cards to pad a 3-column look. Card count = content count.',
    `- Fill REAL topical titles/body (no "…", no "만들어줘", no create-slides boilerplate). Brief/Quick settings are the eventual target — honor an explicit 1–${FIRST_FILL_HONOR_MAX} this turn; unspecified still closes ${FIRST_FILL_SLIDE_COUNT_THIS_TURN}. Never copy the template demo page lineup.`,
    '- REPLACE every example.html proper noun, table, and metric in your outline text. Hartfield / NorthPeak / Project Atlas / WACC / EBITDA / "Demo-data notice" are forbidden unless the user brief names them.',
    '- Prefer a closed valid JSON outline this turn over Motif/HTML fidelity experiments.',
    '- Honor stated audience/level (e.g. 시니어 개발자 = architecture/internals/trade-offs, not a beginner intro).',
    '- Each body slide needs a real title plus 3–4 concrete bullet lines or a real paragraph in `body`. Across the deck include problem/context, how it works, concrete workflow/example, constraints or trade-offs, and next action. No "핵심 메시지를 정리합니다" filler.',
  ];
}

/** Retry a truncated JSON slot-fill without switching the provider to HTML. */
export function renderTemplateCloneJsonShortResponseRetryPrompt(input: {
  returnedCount: number;
  slideCount: number;
}): string {
  const returnedCount = Math.max(0, Math.floor(input.returnedCount));
  const slideCount = Math.max(1, Math.floor(input.slideCount));
  return [
    `The previous JSON outline returned only ${returnedCount} slides.`,
    `Return ONE complete JSON outline with EXACTLY ${slideCount} entries in slides[].`,
    'Do not emit HTML, <section>, <artifact>, commentary, or status prose.',
    'Use the existing JSON schema: {"title":"...","slides":[{"title":"...","kicker":"...","lead":"...","roleHint":"cover|list|cards|timeline|stat|quote|team|process|closing|body","items":[{"title":"...","body":"..."}]}]}.',
    'Every body slide must contain a concrete lead and 3-4 substantive items or an equally substantive body. Close the JSON object.',
  ].join(' ');
}

/**
 * 1007-N01 슬라이스 G — collapsed prompt-fill 을 JSON LOOK 으로 되돌릴지.
 *
 * v1.4.16 official-rich / how-to 는 HTML 재시도를 유지한다. 7832c6e044 가
 * official-rich 붕괴를 json product-launch slot-fill 로 보내 밀도를 깎았다.
 * 명시 json 턴은 이미 JSON 재시도 분기를 쓰므로 여기선 false.
 */
export function shouldRecoverCollapsedPromptFillViaJson(input: {
  brief?: string | null;
  html?: string | null;
  richFill?: boolean;
  explicitJson?: boolean;
}): boolean {
  if (input.explicitJson) return false;
  if (input.richFill) return false;
  if (briefLooksLikeGeneralKnowledgeHowToTopic(input.brief)) return false;
  if (htmlLooksLikeOfficialRichDeck(input.html) || htmlLooksLikeMixedLookAndOfficialRich(input.html)) {
    return false;
  }
  return true;
}

/**
 * how-to / official-rich persist 는 LOOK 재슬롯·heading-count reconcile 을 건너뛴다.
 * 명시 json override 는 존중한다.
 */
export function shouldPreserveOfficialRichHowToPersist(input: {
  brief?: string | null;
  html?: string | null;
  explicitJson?: boolean;
}): boolean {
  if (input.explicitJson) return false;
  if (briefLooksLikeGeneralKnowledgeHowToTopic(input.brief)) return true;
  if (htmlLooksLikeOfficialRichDeck(input.html)) return true;
  if (htmlLooksLikeMixedLookAndOfficialRich(input.html)) return true;
  return false;
}

/**
 * 1007-N01 슬라이스 J — official-rich / how-to 가 장수 미달이어도
 * JSON LOOK 복구·처음부터 HTML 재생성 대신 부분 덱을 persist 하고 top-up 한다.
 */
export function shouldPersistOfficialRichPartialAndContinue(input: {
  brief?: string | null;
  html?: string | null;
  richFill?: boolean;
  explicitJson?: boolean;
  producedCount: number;
}): boolean {
  if (input.explicitJson) return false;
  if (!Number.isFinite(input.producedCount) || input.producedCount < 1) return false;
  // 슬라이스 K — 얇은 json LOOK 만 있는 부분 덱은 salvage 최종본으로 굳히지 않는다.
  // 부분 보존은 official-rich 슬라이드(look-css / Playfair·gradient)여야 한다.
  if (
    htmlLooksLikeJsonLookSlotFill(input.html)
    && !htmlLooksLikeOfficialRichDeck(input.html)
    && !htmlLooksLikeMixedLookAndOfficialRich(input.html)
  ) {
    return false;
  }
  if (input.richFill) return true;
  return shouldPreserveOfficialRichHowToPersist({
    brief: input.brief,
    html: input.html,
    explicitJson: input.explicitJson,
  });
}

/**
 * 1007-N01 슬라이스 K — LOOK 앞장 위에 official-rich 뒷장을 이어붙이지 않는다.
 * 혼합 덱(얇은 feature-card + Playfair)이 최종본이 된다. 리치 incoming 이
 * 앞장을 통째로 대체할 수 있으면 persist 가 replace 경로를 쓰고, 아니면
 * append 를 거절해 첫 official-rich 시도를 성공시키게 한다.
 */
export function shouldAppendTopUpOntoExistingDeck(input: {
  priorHtml?: string | null;
  incomingHtml?: string | null;
}): boolean {
  const prior = String(input.priorHtml ?? '');
  const incoming = String(input.incomingHtml ?? '');
  if (!prior.trim() || !incoming.trim()) return false;
  if (
    htmlLooksLikeJsonLookSlotFill(prior)
    && !htmlLooksLikeOfficialRichDeck(prior)
    && (
      htmlLooksLikeOfficialRichDeck(incoming)
      || htmlLooksLikeMixedLookAndOfficialRich(incoming)
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Prompt-fill HTML that collapses to a short deck gets one bounded recovery
 * through the smaller JSON outline contract. The host still owns the LOOK
 * seed and renders the model-authored copy into its existing slide layouts.
 *
 * 슬라이스 G — how-to/official-rich 호출부는 `shouldRecoverCollapsedPromptFillViaJson`
 * 이 false 이면 이 시드를 쓰지 않는다.
 */
export function buildPromptFillJsonRecoverySeed(input: {
  userInstruction: string;
  templateTitle?: string | null;
  returnedCount: number;
  slideCount: number;
}): string {
  const slideCount = Math.max(1, Math.floor(input.slideCount));
  return [
    buildTemplateCloneContentFillSeed({
      userInstruction: input.userInstruction,
      templateTitle: input.templateTitle,
      slideCountHint: slideCount,
      seedShellCount: slideCount,
    }),
    '',
    renderTemplateCloneJsonShortResponseRetryPrompt({
      returnedCount: input.returnedCount,
      slideCount,
    }),
  ].join('\n');
}

const FIRST_FILL_SLIDE_COUNT_STABILITY_CAP =
  `${FIRST_FILL_SLIDE_COUNT_THIS_TURN} (stability cap for first template fill)`;

/** Short Home/Canvas preset — a complete compact job, not a first-fill cap. */
const FIRST_FILL_SHORT_RANGE_CLOSE_HINT = '5-6 (close at least 5 this turn)';
const FIRST_FILL_SHORT_RANGE_RE = /^5\s*[-~–—]\s*6$/;
/** Home/Canvas "auto" 6-8 is the unspecified default — still close 6 this turn. */
const FIRST_FILL_AUTO_DEFAULT_RANGE_RE = /^6\s*[-~–—]\s*8$/;
const FIRST_FILL_HONOR_RANGE_CLOSE_RE = /^\d{1,2}-\d{1,2} \(close this turn\)$/;

function isFirstFillShortRangeHint(text: string | number | null | undefined): boolean {
  const raw = String(text ?? '').trim();
  return FIRST_FILL_SHORT_RANGE_RE.test(raw) || raw === FIRST_FILL_SHORT_RANGE_CLOSE_HINT;
}

export function normalizeTemplateCloneFillSlideCountHint(input: string | number | null | undefined): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const explicit = raw.match(/(?:\bexactly\b|정확히)\s*(\d{1,2})/i)
    ?? raw.match(/(\d{1,2})\s*(?:장|slides?|pages?)\s*(?:요청|requested|명시|explicit)/i);
  if (explicit?.[1]) {
    const n = Number(explicit[1]);
    if (Number.isFinite(n) && n >= 1 && n <= FIRST_FILL_HONOR_MAX) return String(n);
    if (Number.isFinite(n) && n >= FIRST_FILL_TOP_UP_FROM) {
      return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
    }
  }
  // 5-6 / 5~6 is a complete short job. Do not rewrite it to the first-fill
  // stability cap — that text plans a later append and splits the work.
  if (isFirstFillShortRangeHint(raw)) {
    return FIRST_FILL_SHORT_RANGE_CLOSE_HINT;
  }
  if (FIRST_FILL_HONOR_RANGE_CLOSE_RE.test(raw)) return raw;
  if (FIRST_FILL_AUTO_DEFAULT_RANGE_RE.test(raw)) {
    return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
  }
  const range = raw.match(/^(\d{1,2})\s*[-~–—]\s*(\d{1,2})$/);
  if (range?.[1] && range[2]) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo >= 1 && hi >= lo) {
      if (hi <= FIRST_FILL_HONOR_MAX) return `${lo}-${hi} (close this turn)`;
      return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
    }
  }
  const single = raw.match(/^(\d{1,2})$/)?.[1];
  if (single) {
    const n = Number(single);
    if (n >= 1 && n <= FIRST_FILL_HONOR_MAX) return String(n);
    return FIRST_FILL_SLIDE_COUNT_STABILITY_CAP;
  }
  return raw;
}

/** JSON slot-fill is compact enough to honor exact counts above the HTML path's 15-slide cap. */
function parseTemplateCloneFillSlideCountTarget(text: string | null | undefined): number | null {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  const match = raw.match(/(?:\bexactly\b|정확히)\s*(\d{1,2})/i)
    ?? raw.match(/(\d{1,2})\s*(?:장|slides?|pages?|페이지)/i);
  const count = Number(match?.[1] ?? NaN);
  return Number.isFinite(count) && count >= 1 && count <= FIRST_FILL_HONOR_MAX
    ? count
    : null;
}

/** Normalize Plugin-input slideCount so Quick settings and the seed agree. */
export function withTemplateCloneFillPluginInputs(
  pluginInputs: Record<string, unknown> | null | undefined,
  slideCountHint?: string | number | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(pluginInputs ?? {}) };
  const capped =
    normalizeTemplateCloneFillSlideCountHint(slideCountHint)
    ?? normalizeTemplateCloneFillSlideCountHint(
      typeof next.slideCount === 'string' || typeof next.slideCount === 'number'
        ? next.slideCount
        : null,
    );
  if (capped) next.slideCount = capped;
  return next;
}

/**
 * Appended after the rendered plugin block on fill turns so snapshot Plugin
 * inputs cannot override the normalized user-requested count.
 */
export function templateCloneFillSlideCountOverrideNotice(
  slideCountHint?: string | number | null,
): string | null {
  const capped = normalizeTemplateCloneFillSlideCountHint(slideCountHint);
  if (!capped) return null;
  if (capped === FIRST_FILL_SHORT_RANGE_CLOSE_HINT || isFirstFillShortRangeHint(slideCountHint)) {
    return [
      '# Template clone fill slideCount override',
      `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
      'Close at least 5 slides this turn. Do not stop after 3 slides or leave remaining slides for a later turn.',
    ].join('\n');
  }
  if (FIRST_FILL_HONOR_RANGE_CLOSE_RE.test(capped)) {
    const range = parseSlideCountSpec(capped, { allowBareNumber: true });
    return [
      '# Template clone fill slideCount override',
      `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
      `Close the requested range this turn with a hard cap at ${range?.max ?? 'the range maximum'}. Exceeding that maximum is a failed overshoot. Do not leave remaining slides for a later turn.`,
    ].join('\n');
  }
  if (capped === FIRST_FILL_SLIDE_COUNT_STABILITY_CAP) {
    return [
      '# Template clone fill slideCount override',
      `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
      'Ignore any larger slideCount in the plugin block above (first-fill stability cap).',
      'Finish a closed compact deck this turn. A later turn may append remaining slides if the user requested more.',
    ].join('\n');
  }
  return [
    '# Template clone fill slideCount override',
    `For THIS first content-fill turn only, treat Plugin input slideCount as "${capped}".`,
    'Finish a closed compact deck this turn.',
  ].join('\n');
}

/** Persist the user request so validation and any later top-up use the same count. */
export function formatUserRequestedSlideCountLine(
  slideCountHint?: string | number | null,
): string | null {
  const raw = String(slideCountHint ?? '').trim();
  if (!raw || /stability cap/i.test(raw)) return null;
  return `User requested slide count: ${raw}.`;
}

function formatSlideCountRange(spec: { min: number; max: number }): string {
  return spec.min === spec.max ? String(spec.max) : `${spec.min}-${spec.max}`;
}

function templateClonePromptFillSlideCountInstruction(input: {
  slideCountHint?: string | null;
  slideCountHintSource?: string | number | null;
}): string {
  const slideCountHint = String(input.slideCountHint ?? '').trim();
  const source = String(input.slideCountHintSource ?? slideCountHint).trim();
  const spec = parseSlideCountSpec(source, { allowBareNumber: true })
    ?? parseSlideCountSpec(slideCountHint, { allowBareNumber: true });
  if (spec && spec.max <= FIRST_FILL_HONOR_MAX) {
    const range = formatSlideCountRange(spec);
    const missClause = spec.min > FIRST_FILL_SLIDE_COUNT_THIS_TURN
      ? ` A ${FIRST_FILL_SLIDE_COUNT_THIS_TURN}-slide artifact is incomplete for this request and must trigger/avoid a repair.`
      : '';
    return [
      `Slide count: ${slideCountHint || range}.`,
      `Emit ${range} complete slides in THIS artifact (hard cap ${spec.max}; exceeding it is a failed overshoot); do not stop at a default ${FIRST_FILL_SLIDE_COUNT_THIS_TURN}-slide compact deck.${missClause}`,
    ].join(' ');
  }
  return `Slide count: ${slideCountHint || FIRST_FILL_SLIDE_COUNT_GUIDANCE}.`;
}

export function extractTemplateCloneFillSlideCountHintFromPrompt(
  prompt: string | null | undefined,
): string | null {
  const match = /Slide count hint:\s*([^\n.]+)/i.exec(String(prompt ?? ''));
  return normalizeTemplateCloneFillSlideCountHint(match?.[1]?.trim() ?? null);
}

export function buildTemplateCloneContentFillSeed(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  templateTitle?: string | null;
  hasSourceMaterial?: boolean;
  slideCountHint?: string | number | null;
  seedShellCount?: number | null;
}): string {
  const visible = extractTemplateCloneUserFacingRequest(options);
  const topic = deriveTemplateCloneTopicLabel(visible);
  const templateTitle = options.templateTitle?.trim() || '';
  const rawBrief = String(options.sourceBrief ?? '').trim();
  const combinedBrief = [options.sourceBrief, options.pendingPrompt, options.userInstruction]
    .filter(Boolean)
    .join('\n\n');
  const brief = compactTemplateCloneFillSourceBrief(combinedBrief);
  const hasAttachedSource =
    options.hasSourceMaterial
    ?? (briefLooksLikeAttachedSource(rawBrief) || briefLooksLikeAttachedSource(brief));
  const websiteOutline = buildWebsiteServiceIntroOutlineInstruction(
    [visible, brief, combinedBrief].filter(Boolean).join('\n\n'),
  );
  const parts = [
    visible,
    '',
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    'Daemon Clone already seeded a LOOK preview into `deck.html`. This turn emits a JSON outline only — the host slot-fills that seed. Do NOT rewrite deck HTML.',
    hasAttachedSource
      ? 'Fill REAL presentation CONTENT for this request and any attached source materials (Canvas/Drive/files) — not the cloned demo copy.'
      : 'Fill REAL presentation CONTENT for this create (user prompt may be empty; invent clear topical copy — do not paste boilerplate leads into titles).',
    'The visible request above is a BRIEF/TOPIC. Expand it into a real presentation with domain knowledge. Do NOT paste the request onto the cover or body slides.',
    topic ? `Cover topic (use as the title — not the instruction): ${topic}.` : '',
    options.seedShellCount != null
      ? renderJsonOutlineSlideCountRequirement(options.seedShellCount)
      : '',
    ...templateCloneContentFillHardRules({
      seedShellCount: options.seedShellCount ?? null,
      // The exact count already sits near the top of this prompt. Keep one
      // authoritative count sentence instead of repeating it in hard rules.
      includeSlideCountRequirement: options.seedShellCount == null,
    }),
    websiteOutline ?? '',
  ].filter((line) => line !== '');
  if (templateTitle) {
    parts.push(`Selected template: ${templateTitle}.`);
  }
  const visibleSlideCount =
    parseTemplateCloneFillSlideCountTarget(visible) ?? parseSlideCountTarget(visible);
  const pluginOrUiHint = options.slideCountHint;
  // Typed `5페이지` beats Home/Canvas quick-length ranges (`6-8` auto, `5-6` short).
  const slideCountHintSource =
    visibleSlideCount != null && isSlideCountRangeHint(pluginOrUiHint)
      ? visibleSlideCount
      : (pluginOrUiHint ?? visibleSlideCount);
  const requestedLine = formatUserRequestedSlideCountLine(slideCountHintSource);
  if (requestedLine) {
    parts.push(requestedLine);
  }
  const slideCountHint = normalizeTemplateCloneFillSlideCountHint(slideCountHintSource);
  if (slideCountHint) {
    parts.push(`Slide count hint: ${slideCountHint}.`);
  } else {
    parts.push(
      `Slide count hint: ${FIRST_FILL_SLIDE_COUNT_THIS_TURN} (default for first template fill; close ${FIRST_FILL_SLIDE_COUNT_THIS_TURN} complete slides this turn.)`,
    );
  }
  if (brief) {
    parts.push('', '[Source brief]', brief);
  }
  return parts.join('\n');
}

/** Legacy rollback path: model emits the final deck HTML; no JSON slot-fill marker. */
export function buildTemplateClonePromptFillSeed(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  templateTitle?: string | null;
  hasSourceMaterial?: boolean;
  slideCountHint?: string | number | null;
  /**
   * 루프550 — LOOK seed에 실제로 존재하는 slide shell 개수. 있으면 정량·강제
   * slide-count 순응 문구(`renderSlideCountRequirementInstruction`)와 세션
   * 초입 힌트(`renderSlideCountSeedHeaderHint`)를 emit해 MiniMax가 slide
   * count를 정확히 맞추도록 유도한다.
   */
  seedShellCount?: number | null;
}): string {
  const visible = extractTemplateCloneUserFacingRequest(options);
  const topic = deriveTemplateCloneTopicLabel(visible);
  const templateTitle = options.templateTitle?.trim() || '';
  const rawBrief = String(options.sourceBrief ?? '').trim();
  const combinedBrief = [options.sourceBrief, options.pendingPrompt, options.userInstruction]
    .filter(Boolean)
    .join('\n\n');
  const brief = compactTemplateCloneFillSourceBrief(combinedBrief);
  const hasAttachedSource =
    options.hasSourceMaterial
    ?? (briefLooksLikeAttachedSource(rawBrief) || briefLooksLikeAttachedSource(brief));
  const websiteOutline = buildWebsiteServiceIntroOutlineInstruction(
    [visible, brief, combinedBrief].filter(Boolean).join('\n\n'),
  );
  const visibleSlideCount = parseSlideCountTarget(visible);
  const slideCountHintSource =
    visibleSlideCount != null && isSlideCountRangeHint(options.slideCountHint)
      ? visibleSlideCount
      : (options.slideCountHint ?? visibleSlideCount);
  const slideCountHint = normalizeTemplateCloneFillSlideCountHint(slideCountHintSource);
  const requestedLine = formatUserRequestedSlideCountLine(slideCountHintSource);
  // 루프550 — seed 상단 정량 힌트(있으면).
  const seedHeaderHint = renderSlideCountSeedHeaderHint(options.seedShellCount ?? null);
  // 루프550 — hard rules 라인 (정량·강제 slide-count 요구).
  const slideCountRequirementLine =
    renderSlideCountRequirementInstruction(options.seedShellCount ?? null);
  const promptFillQualityLines = [
    SLIDE_DECK_UNIQUE_SLOT_FILL_LINE,
    FILL_PER_SLIDE_KICKER_LINE,
    SLIDE_DECK_TOPIC_LOCK_INSTRUCTION_WITHOUT_KPI_BAN,
    FILL_MUSIC_DECO_GLYPH_BAN_LINE,
  ];
  const parts = [
    visible,
    '',
    TEMPLATE_CLONE_PROMPT_FILL_MARKER,
    // 1007-N01 — when N is known, the seed-header hint stays first and the
    // short quality lines sit on the next lines. Count text is unchanged.
    ...(seedHeaderHint ? [seedHeaderHint, ...promptFillQualityLines] : []),
    'A visual deck template was selected. Create ONE complete final deck artifact now.',
    'Emit slides immediately; do not stop after </head>.',
    'Emit `<artifact type="deck" identifier="deck">` with a complete HTML document and filled slides. Do not emit JSON outline.',
    'Never emit `<artifact type="deck-patch">` on this create turn — this is a first fill, not a surgical edit. Emit ONE full `<artifact type="deck">` only.',
    'Use the selected template kit in the system prompt as visual authority: palette, typography, motif, layout rhythm, and slide chrome.',
    'Use the cloned `deck.html` only as a look reference. Do not treat it as an existing-deck edit, copy demo placeholders, or paste this host contract onto slides.',
    'Chat status may describe the deck, but the artifact must contain that many `<section class="slide">` (or equivalent slide hosts). Never claim 9 slides while emitting only a cover.',
    'Do not invent quantitative KPIs, headcount, NPS, market size ($XB), or pricing unless the brief/source materials state them. Prefer qualitative product claims and named features over fabricated metrics.',
    'Every KPI/stat cell must be a complete card (number + label inside one bordered shell). Do not leave bare .stat-number/.stat-label siblings or empty .stat-card shells.',
    'Neo / Block Frame cards (`.nb-card`, `.intro-card`, `.feature-card`): put title AND body text INSIDE the same card element. Never leave description divs as grid siblings of `.nb-card` — that breaks the 3-column layout.',
    'Diagram grids (`1fr auto 1fr`): keep left cluster + arrow + right result only. Put checklists BELOW the diagram grid, not as a fourth grid child.',
    'Reuse LOOK seed :root tokens already on disk. Do not re-emit full kit CSS in <head>. Never emit var(--pink) without defining tokens.',
    'If the kit is neo-brutal Block Frame (hero-frame, .slide-1…N, --pink/--cream), keep that DOM. Do not emit IB magazine chrome (mast, ribbon, h1.display, cover-meta, foot, or 학습 노트).',
    'Cover title must be a product/brand name derived from the brief or URL host (keep Latin host spelling; do not phonetic-Hangulize). Never leave a raw URL or truncated host crumb like "www.example.com 사이".',
    hasAttachedSource
      ? 'Fill REAL presentation CONTENT for this request and any attached source materials (Canvas/Drive/files). Prefer facts from the source over invented numbers.'
      : 'Fill REAL presentation CONTENT for this create; expand THIS brief with concrete domain knowledge — still do not invent company metrics.',
    'The visible request above is THIS turn\'s brief/topic. Do NOT paste the user instruction, this host contract, or any system-prompt worked example onto the cover or body slides.',
    topic ? `Cover topic (use as the title, not the instruction): ${topic}.` : '',
    SLIDE_DECK_QUALITY_BAR_INSTRUCTION,
    SLIDE_DECK_LAYOUT_VARIETY_INSTRUCTION,
    SLIDE_DECK_COPY_DENSITY_INSTRUCTION,
    // 루프554 — N이 있으면 seed 상단 힌트만 쓰고 여기 장문 요구는 생략.
    // 중복 "Return EXACTLY N" + quality 장문이 2장 조기 종료를 유도함.
    // 1007-N01 — no header: keep-count line, then the same short quality lines.
    ...(seedHeaderHint ? [] : [slideCountRequirementLine, ...promptFillQualityLines]),
    requestedLine,
    templateClonePromptFillSlideCountInstruction({ slideCountHint, slideCountHintSource }),
    websiteOutline
      ?? 'If the source is a website or product URL, build a real service-introduction deck: problem/context, product promise, core workflow, key features, user/team use cases, integration/security/operation notes, adoption path, and closing. Do not stop at a shallow brand intro.',
    'Every content slide needs 3-4 concrete cards/bullets/paragraphs derived from the brief/source. A slide with only a section number and one generic title is incomplete.',
    'HTML structure guard: close badges, section labels, header pills, and number pills before opening grids/cards. Never nest the whole slide grid inside a `.header-pill`, `.title-pill`, `.tag`, or badge element.',
    'Every slide must be 1920x1080, fixed-size, overflow hidden, and navigable as a deck, not a scrolling article.',
    'Do not stop after a status sentence, outline, or partial `<head>`; close `</html></artifact>`.',
  ].filter((line) => line !== '');
  if (templateTitle) {
    parts.push(`Selected template: ${templateTitle}.`);
  }
  if (brief) {
    parts.push('', '[Source brief]', brief);
  }
  return parts.join('\n');
}

/**
 * 1007-N01 슬라이스 B — official-look 리치 fill 시드(opt-in, 기본 OFF).
 *
 * 기존 `buildTemplateClonePromptFillSeed`(prompt-fill HTML artifact 계약: EXACTLY
 * N·topic-lock·KPI-ban·cover-brand·1920×1080·close artifact)를 **그대로 재사용**
 * 하고, 그 위에 official-look 밀도 계약(`buildRichOfficialLookDensityBlock`)만
 * 덧붙인다. [Source brief] 블록은 항상 맨 끝에 오도록 density 블록을 그 앞에
 * 삽입한다. 롤백 = 모드 스위치 OFF(이 함수 미호출) 또는 커밋 revert.
 */
export function buildTemplateCloneRichOfficialLookFillSeed(
  options: Parameters<typeof buildTemplateClonePromptFillSeed>[0],
): string {
  const base = buildTemplateClonePromptFillSeed(options)
    .replace(
      'A visual deck template was selected. Create ONE complete final deck artifact now.',
      'A visual deck template was selected and its complete LOOK seed already exists on disk. Fill every seed slide now.',
    )
    .replace(
      'Emit slides immediately; do not stop after </head>.',
      'Emit replacement slide sections immediately; do not regenerate the document head.',
    )
    .replace(
      'Emit `<artifact type="deck" identifier="deck">` with a complete HTML document and filled slides. Do not emit JSON outline.',
      'Emit ONE `<artifact type="deck-patch" identifier="deck">` containing every filled replacement slide. Do not emit JSON outline.',
    )
    .replace(
      'Never emit `<artifact type="deck-patch">` on this create turn — this is a first fill, not a surgical edit. Emit ONE full `<artifact type="deck">` only.',
      'This is a full first-fill patch, not a surgical edit: replace EVERY seed slide exactly once in ascending 0-based `data-slide-index` order.',
    )
    .replace(
      'Use the cloned `deck.html` only as a look reference. Do not treat it as an existing-deck edit, copy demo placeholders, or paste this host contract onto slides.',
      'Use the cloned `deck.html` as the patch target and visual authority. Replace its demo content; do not copy demo placeholders or paste this host contract onto slides.',
    )
    .replace(
      'Reuse LOOK seed :root tokens already on disk. Do not re-emit full kit CSS in <head>. Never emit var(--pink) without defining tokens.',
      'Reuse LOOK seed :root tokens and classes already on disk. Do not emit `<!doctype>`, `<html>`, `<head>`, `<body>`, global `<style>`, or navigation `<script>` inside the patch.',
    )
    .replace(
      'Do not stop after a status sentence, outline, or partial `<head>`; close `</html></artifact>`.',
      'Do not stop after a status sentence or partial slide list; close `</artifact>` only after every indexed replacement section is present.',
    );
  const densityBlock = buildRichOfficialLookDensityBlock().join('\n');
  const patchContract = [
    '[Official-rich deck-patch contract — READ LAST]',
    'Output shape: `<artifact type="deck-patch" identifier="deck"><section class="slide …" data-slide-index="0">…</section>…</artifact>`.',
    'Every replacement section MUST include `class="slide"` and its explicit 0-based `data-slide-index`. Start at 0, use each index once, keep ascending order, and include the exact requested/seed slide count.',
    'Use replacement sections only (no append/remove operations). Keep the selected kit class vocabulary, CSS variables, motif/deco elements, palette, typography, borders, shadows, and layout rhythm in the authored slide markup.',
    'The host merges these sections into the existing standalone deck, preserving its CSS/fonts/scripts. Never repeat the document shell or global stylesheet.',
  ].join('\n');
  const briefMarker = '\n\n[Source brief]';
  const briefIdx = base.indexOf(briefMarker);
  if (briefIdx === -1) {
    return `${base}\n${densityBlock}\n${patchContract}`;
  }
  // [Source brief] 는 맨 끝 블록이어야 하므로 density 계약을 그 앞에 끼운다.
  return `${base.slice(0, briefIdx)}\n${densityBlock}\n${patchContract}${base.slice(briefIdx)}`;
}

/**
 * 루프550 — handleSend 시점에 디스크 LOOK seed 개수가 확정되면 fallback 상수를
 * 정량 문구로 치환한다. Home 큐잉은 clone 전에 seed를 만들어 N을 모를 수 있다.
 */
export function applyQuantitativeSlideCountInstruction(
  prompt: string,
  seedShellCount: number | null | undefined,
): string {
  const next = String(prompt ?? '');
  if (
    seedShellCount == null
    || !Number.isFinite(seedShellCount)
    || seedShellCount <= 0
  ) {
    return next;
  }
  const n = Math.max(1, Math.floor(seedShellCount));
  const jsonSlotFill = isTemplateCloneContentFillPrompt(next);
  const requirement = jsonSlotFill
    ? renderJsonOutlineSlideCountRequirement(n)
    : renderSlideCountRequirementInstruction(n);
  const header = jsonSlotFill
    ? renderJsonOutlineSlideCountRequirement(n)
    : renderSlideCountSeedHeaderHint(n);
  // The seed builder may already have stamped its own count. User-requested
  // counts win, so keep one authoritative quantitative requirement.
  let out = next.replace(
    /^Seed contains \d+ slides\. Return EXACTLY \d+ <section class="slide"> elements\.\s*$/gim,
    '',
  ).replace(
    /^Seed contains \d+ slide layouts\. Return EXACTLY \d+ entries in slides\[\]\.\s*$/gim,
    '',
  ).trim();
  if (out.includes(`Return EXACTLY ${n}`)) {
    if (header && !out.includes(`Seed contains ${n}`)) {
      out = `${header}\n${out}`;
    }
    return out;
  }
  const genericJsonRequirement = renderJsonOutlineSlideCountRequirement(null);
  if (jsonSlotFill && out.includes(genericJsonRequirement)) {
    out = out.replace(genericJsonRequirement, requirement);
  } else if (out.includes(SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION)) {
    out = out.replace(SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION, requirement);
  } else if (!out.includes(requirement)) {
    out = `${out.trim()}\n${requirement}`;
  }
  if (header && !out.includes(`Seed contains ${n}`)) {
    out = `${header}\n${out}`;
  }
  return out;
}

const CANVAS_CREATE_DELIVERABLE_DUMP_RE =
  /\[Deliverable instruction\]|\[Selected slide template(?:\s+priority)?\]|\[Quick settings\]/i;

/** Home create stores the model-facing canvas dump as pendingPrompt. */
export function looksLikeCanvasCreateDeliverableDump(text: unknown): boolean {
  return CANVAS_CREATE_DELIVERABLE_DUMP_RE.test(String(text ?? ''));
}

/**
 * 루프420 — Auto-send must never ship the [Deliverable instruction] dump.
 * Staging `pure-prompt` sent that whole contract to MiniMax and failed.
 */
export function sanitizeCreateAutoSendSeed(text: unknown): string {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  if (isTemplateCloneHostFillPrompt(raw)) return raw;
  if (looksLikeCanvasCreateDeliverableDump(raw)) {
    const brief = extractTemplateCloneUserFacingRequest({ pendingPrompt: raw });
    // Keep real user briefs even when they say "만들어줘". Only drop
    // Home/Canvas scaffolding and the empty-topic fallback fill copy.
    if (!brief || looksLikeCanvasCreateBoilerplate(brief)) {
      return '';
    }
    return brief;
  }
  return raw;
}

/**
 * Auto-send seed after daemon Clone.
 *
 * ProjectView used to prefer the in-memory `pendingPrompt` from createProject
 * (the full `canvasCreateSlidesRunPrompt` dump) over the queued fill seed.
 * That sent a surgical existing-deck-edit turn WITHOUT the fill marker, so
 * the model left Clone's prompt-stuffed headings intact and stalled on `<head>`.
 *
 * When a fill is queued, the fill seed ALWAYS wins — even if pendingPrompt
 * is still the raw create prompt.
 */
export function resolveTemplateCloneAutoSendSeed(input: {
  queuedFillSeed?: string | null;
  pendingPrompt?: string | null;
  fillQueued: boolean;
}): string {
  const queued = String(input.queuedFillSeed ?? '').trim();
  const pending = String(input.pendingPrompt ?? '').trim();
  if (input.fillQueued) {
    if (isTemplateCloneContentFillPrompt(queued)) return queued;
    if (isTemplateCloneContentFillPrompt(pending)) return pending;
    if (queued) return queued;
    return buildTemplateCloneContentFillSeed({ pendingPrompt: pending });
  }
  if (isTemplateCloneHostFillPrompt(queued)) return queued;
  if (isTemplateCloneHostFillPrompt(pending)) return pending;
  return sanitizeCreateAutoSendSeed(queued) || sanitizeCreateAutoSendSeed(pending);
}

/** Cloned `deck.html` must never ride along on a content-fill turn. */
export function isCanonicalDeckAttachment(attachment: {
  path?: string | null;
  name?: string | null;
}): boolean {
  const path = String(attachment.path || attachment.name || '').trim();
  const base = path.split('/').pop() ?? path;
  return /^deck(?:[-_.].*)?\.html?$/i.test(base);
}

export function withoutCanonicalDeckAttachments<T extends {
  path?: string | null;
  name?: string | null;
}>(attachments: readonly T[] | null | undefined): T[] {
  return (attachments ?? []).filter((attachment) => !isCanonicalDeckAttachment(attachment));
}

export function queueTemplateCloneContentFill(options: {
  projectId: string;
  seed: string;
  attachments?: ChatAttachment[];
}): void {
  const projectId = options.projectId.trim();
  if (!projectId || !options.seed.trim()) return;
  try {
    // Do NOT set od:auto-send-first here — App/create owns that flag so
    // suppressAutoSendForFailedDriveImport (and similar) cannot be bypassed.
    window.sessionStorage.setItem(autoSendSeedStorageKey(projectId), options.seed);
    window.sessionStorage.setItem(templateCloneContentFillFlagKey(projectId), '1');
    const attachments = withoutCanonicalDeckAttachments(options.attachments);
    if (attachments.length > 0) {
      window.sessionStorage.setItem(
        `od:auto-send-attachments:${projectId}`,
        JSON.stringify(attachments),
      );
    } else {
      window.sessionStorage.removeItem(`od:auto-send-attachments:${projectId}`);
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
}

/** Store a Clone follow-up seed without arming the JSON slot-fill recovery path. */
export function queueTemplateClonePromptFill(options: {
  projectId: string;
  seed: string;
  attachments?: ChatAttachment[];
}): void {
  const projectId = options.projectId.trim();
  if (!projectId || !options.seed.trim()) return;
  try {
    window.sessionStorage.setItem(autoSendSeedStorageKey(projectId), options.seed);
    window.sessionStorage.removeItem(templateCloneContentFillFlagKey(projectId));
    const attachments = withoutCanonicalDeckAttachments(options.attachments);
    if (attachments.length > 0) {
      window.sessionStorage.setItem(
        `od:auto-send-attachments:${projectId}`,
        JSON.stringify(attachments),
      );
    } else {
      window.sessionStorage.removeItem(`od:auto-send-attachments:${projectId}`);
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export function readQueuedAutoSendSeed(projectId: string): string {
  try {
    return window.sessionStorage.getItem(autoSendSeedStorageKey(projectId))?.trim() || '';
  } catch {
    return '';
  }
}

export function isTemplateCloneContentFillQueued(projectId: string): boolean {
  try {
    return window.sessionStorage.getItem(templateCloneContentFillFlagKey(projectId)) === '1';
  } catch {
    return false;
  }
}

export function clearTemplateCloneContentFillQueue(projectId: string): void {
  try {
    window.sessionStorage.removeItem(templateCloneContentFillFlagKey(projectId));
    window.sessionStorage.removeItem(autoSendSeedStorageKey(projectId));
    window.sessionStorage.removeItem(`od:auto-send-attachments:${projectId}`);
  } catch {
    /* ignore */
  }
}

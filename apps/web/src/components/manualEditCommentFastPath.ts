import type { ChatCommentAttachment } from '../types';
import { MANUAL_EDIT_STYLE_PROPS, type ManualEditPatch, type ManualEditStyles } from '../edit-mode/types';

export interface ManualEditCommentFastPathResult {
  patches: ManualEditPatch[];
  label: string;
}

const COLOR_KEYWORDS: Array<[RegExp, string]> = [
  [/(?:노란색|노랑|yellow)/i, '#facc15'],
  [/(?:빨간색|빨강|red)/i, '#ef4444'],
  [/(?:파란색|파랑|blue)/i, '#3b82f6'],
  [/(?:초록색|초록|녹색|green)/i, '#22c55e'],
  [/(?:검은색|검정|black)/i, '#000000'],
  [/(?:흰색|하얀색|화이트|white)/i, '#ffffff'],
  [/(?:회색|그레이|gray|grey)/i, '#6b7280'],
];

/**
 * Deterministic comment edits (quoted text replacement, explicit colors,
 * font multipliers, visibility emphasis) bypass the model when the
 * attachment comment matches a narrow parser. The model still owns
 * ambiguous or structural requests via element-patch / deck-patch.
 *
 * Rationale for restoring the fast-path (2026-07-29):
 *   - Even with the dedicated `buildAutoContinueScopedCommentEditPrompt`
 *     retry prompt, the model KEEPS emitting empty `<artifact
 *     type="element-patch">` for simple requests like
 *     "'김개발 작업물' 로 멘트 수정" or "글자 크게 해줘". Three
 *     auto-continue retries burn ~15s and still land on the generic
 *     `incomplete_output` banner (user report on staging).
 *   - This fast-path handles the deterministic subset locally so those
 *     model glitches never cost the user a full retry cycle. Anything
 *     the parser cannot recognise (ambiguous natural language, pod
 *     comments, visual annotations, image attachments) still flows to
 *     the model with the dedicated retry prompt as before.
 */
export function buildManualEditCommentFastPath(input: {
  attachment: ChatCommentAttachment;
  currentStyles: Partial<ManualEditStyles>;
}): ManualEditCommentFastPathResult | null {
  const { attachment, currentStyles } = input;
  const note = attachment.comment.trim();
  if (!note) return null;
  if (!isElementLevelComment(attachment)) return null;
  const effectiveStyles = mergeStyleFallbacks(attachment.style, currentStyles);

  const patches: ManualEditPatch[] = [];

  // Remove-element pattern must run FIRST so a "delete this" comment
  // is never misread as a text-replacement whose value happens to
  // contain 삭제/지워/제거.
  if (parseRemoveElement(note)) {
    return {
      patches: [{ id: attachment.elementId, kind: 'remove-element' }],
      label: 'Comment remove element',
    };
  }

  const text = parseTextReplacement(note);
  if (text !== null) {
    patches.push({ id: attachment.elementId, kind: 'set-text', value: text });
  }

  const styles = {
    ...parseStylePatch(note, effectiveStyles),
    ...parseVisibilityEmphasisPatch(note, effectiveStyles),
    ...parseStandaloneSizeKeyword(note, effectiveStyles),
    ...parseTextDecorationPatch(note),
    ...parseTextAlignPatch(note),
  };
  if (Object.keys(styles).length > 0) {
    patches.push({ id: attachment.elementId, kind: 'set-style', styles });
  }

  if (patches.length === 0) return null;
  return { patches, label: 'Comment quick edit' };
}

/**
 * True when the user's comment is explicitly a "delete this" request
 * against the pinned element. Distinct from `set-text` because
 * removing the element (rather than emptying its text) is the correct
 * outcome for phrases like "이 슬라이드 제목 지워줘".
 */
function parseRemoveElement(note: string): boolean {
  // Korean glyphs are non-word chars in JS \b so word-boundary anchors
  // would drop matches like "삭제해줘" (the `\b` after 줘 becomes
  // ambiguous). Match the Korean removal verbs plainly and let the
  // English ones keep the boundary check to avoid false positives on
  // "removal-adjacent" filler words.
  const removeCueKo = /(?:삭제|제거|없애|지워|숨겨|숨기)(?:해|해줘|주세요|주기|바랍|해라|주라|해라|줘)?/;
  const removeCueEn = /(?:remove|delete|hide|erase)\s+(?:this|the\s+\w+)?\s*(?:element|section|block|item|now)?\b/i;
  if (!removeCueKo.test(note) && !removeCueEn.test(note)) return false;
  // Guard against "삭제해줘 → 새 문구" mixed requests: if the note also
  // carries a quoted or → text-replacement, prefer set-text so the
  // user's intended new text still lands. remove-element should be a
  // dedicated request, not one clause of a compound edit.
  if (/["'\u201C\u201D\u2018\u2019]/.test(note) && /(?:=>|→|->|로\s*변경|로\s*수정)/i.test(note)) {
    return false;
  }
  return true;
}

function mergeStyleFallbacks(
  fallback: ChatCommentAttachment['style'] | undefined,
  preferred: Partial<ManualEditStyles>,
): Partial<ManualEditStyles> {
  const out: Partial<ManualEditStyles> = { ...preferred };
  if (!fallback) return out;
  const fallbackStyles = fallback as Partial<ManualEditStyles>;
  for (const key of MANUAL_EDIT_STYLE_PROPS) {
    const preferredValue = out[key];
    const fallbackValue = fallbackStyles[key];
    if (
      (typeof preferredValue !== 'string' || preferredValue.trim() === '')
      && typeof fallbackValue === 'string'
      && fallbackValue.trim()
    ) {
      out[key] = fallbackValue;
    }
  }
  return out;
}

function isElementLevelComment(attachment: ChatCommentAttachment): boolean {
  if (attachment.selectionKind === 'pod') return false;
  if (attachment.selectionKind === 'visual') return false;
  if (attachment.imageAttachments && attachment.imageAttachments.length > 0) return false;
  const id = attachment.elementId.trim();
  if (!id || id.startsWith('pin-') || id.startsWith('file-comment-')) return false;
  return true;
}

function parseTextReplacement(note: string): string | null {
  const quoted = matchFirst(note, [
    /(?:텍스트|문구|글자|내용|이름|제목|타이틀|title|멘트|카피|copy)[^"'\u201C\u201D\u2018\u2019\n]{0,24}["\u201C\u201D'\u2018\u2019]([^"\u201C\u201D'\u2018\u2019\n]{1,240})["\u201C\u201D'\u2018\u2019]\s*(?:로|으로)?\s*(?:변경|수정|바꿔|교체|replace|change)?/i,
    /(?:=>|→|->)\s*["\u201C\u201D'\u2018\u2019]([^"\u201C\u201D'\u2018\u2019\n]{1,240})["\u201C\u201D'\u2018\u2019]/i,
    /["\u201C\u201D'\u2018\u2019]([^"\u201C\u201D'\u2018\u2019\n]{1,240})["\u201C\u201D'\u2018\u2019]\s*(?:로|으로)\s*(?:멘트\s*)?(?:변경|수정|바꿔|교체|replace|change)/i,
  ]);
  if (quoted) return quoted.trim();

  const plain = matchFirst(note, [
    /(?:텍스트|문구|글자|내용|이름|제목|타이틀|title|멘트|카피|copy)[^:\n]{0,12}:\s*([^\n]{1,160})$/i,
    /(?:replace|change)\s+(?:text|copy|label)\s+(?:to|with)\s+([^\n]{1,160})$/i,
  ]);
  if (plain) return stripTrailingInstructionNoise(plain);

  const natural = note.match(
    /(?:이름|제목|타이틀|타이들|헤딩|title|name|heading|텍스트|문구|내용|글자|멘트|카피|copy)[을를]\s*['"\u201C\u201D\u2018\u2019]?([가-힣A-Za-z0-9 _.\-()!?]{1,80}?)['"\u201C\u201D\u2018\u2019]?\s*(?:로|으로)\s*(?:변경|수정|바꿔|교체|해줘|바꿔줘|change|replace)?\s*[.\u3002!?]?\s*$/i,
  );
  if (natural?.[1]) {
    const value = stripTrailingInstructionNoise(natural[1]);
    if (looksLikeStyleModifier(value)) return null;
    return value;
  }
  return null;
}

function looksLikeStyleModifier(value: string): boolean {
  if (/^(?:크게|작게|얇게|굵게|볼드|보통|regular|normal|bold)$/i.test(value)) return true;
  if (/색$/.test(value)) return true;
  if (parseColorKeyword(value)) return true;
  if (/^(?:크\s*게|작\s*게|얇\s*게|굵\s*게)/.test(value)) return true;
  return false;
}

function parseVisibilityEmphasisPatch(
  note: string,
  currentStyles: Partial<ManualEditStyles>,
): Partial<ManualEditStyles> {
  const visibilityCue =
    /(?:눈에\s*(?:잘\s*)?띄게|돋보이게|(?:더\s*)?(?:잘\s*)?보이게|(?:텍스트|글자|글씨|이름|제목).*(?:눈에|돋보|강조)|(?:stand\s*out|more\s*visible|prominent|emphasize|highlight))/i;
  if (!visibilityCue.test(note)) return {};

  const styles: Partial<ManualEditStyles> = {};
  const explicitWeight = parseFontWeight(note);
  if (explicitWeight) {
    styles.fontWeight = explicitWeight;
  } else if (
    !currentStyles.fontWeight
    || currentStyles.fontWeight === '400'
    || currentStyles.fontWeight === 'normal'
  ) {
    styles.fontWeight = '700';
  }

  const explicitSize = parseFontSize(note, currentStyles.fontSize);
  if (explicitSize) {
    styles.fontSize = explicitSize;
  } else {
    const base = parsePx(currentStyles.fontSize);
    if (base) {
      styles.fontSize = `${trimNumber(Math.min(320, Math.max(base + 4, base * 1.25)))}px`;
    }
  }

  const textColor = parseColorForKind(note, 'text');
  if (textColor) styles.color = textColor;

  return styles;
}

function parseStylePatch(
  note: string,
  currentStyles: Partial<ManualEditStyles>,
): Partial<ManualEditStyles> {
  const styles: Partial<ManualEditStyles> = {};
  const fontSize = parseFontSize(note, currentStyles.fontSize);
  if (fontSize) styles.fontSize = fontSize;

  const textColor = parseColorForKind(note, 'text');
  if (textColor) styles.color = textColor;

  const backgroundColor = parseColorForKind(note, 'background');
  if (backgroundColor) styles.backgroundColor = backgroundColor;

  const fontWeight = parseFontWeight(note);
  if (fontWeight) styles.fontWeight = fontWeight;
  return styles;
}

function parseFontSize(note: string, currentFontSize?: string): string | null {
  const absolute = note.match(
    /(?:폰트\s*크기|폰트\s*사이즈|글자\s*크기|글씨\s*크기|font-size|font\s*size)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(px|rem|em|%)\b/i,
  );
  if (absolute) return `${absolute[1]}${absolute[2]}`;

  const multiplier =
    note.match(
      /(?:폰트|글자|글씨|텍스트|font|text)[^\n]{0,20}?(\d+(?:\.\d+)?|두|두\s*)\s*(?:배|x)\s*(?:키|크|확대|increase|larger|bigger)?/i,
    )
    ?? note.match(
      /(\d+(?:\.\d+)?|두|두\s*)\s*(?:배|x)\s*(?:폰트|글자|글씨|텍스트|font|text)[^\n]{0,16}?(?:키|크|확대|increase|larger|bigger)?/i,
    );
  if (!multiplier) return null;
  const base = parsePx(currentFontSize);
  if (!base) return null;
  const factor = parseMultiplier(multiplier[1]);
  if (!factor) return null;
  const next = Math.max(1, Math.min(320, base * factor));
  return `${trimNumber(next)}px`;
}

function parseColorForKind(note: string, kind: 'text' | 'background'): string | null {
  const scoped =
    kind === 'text'
      ? /(?:글자색|글씨색|텍스트\s*색|텍스트색|font\s*color|text\s*color|color)[^\n]{0,24}|(?:글자|글씨|텍스트)[을를]\s*[^\n]{0,20}?(?:빨간색|빨강|파란색|파랑|노란색|노랑|초록색|초록|녹색|검은색|검정|흰색|하얀색|화이트|회색|그레이|red|blue|yellow|green|black|white|gray|grey|#[0-9a-f]{3,8})/i
      : /(?:배경색|배경\s*색|background(?:\s*color)?)[^\n]{0,24}|(?:배경|바탕|바닥)[을를]\s*[^\n]{0,20}?(?:빨간색|빨강|파란색|파랑|노란색|노랑|초록색|초록|녹색|검은색|검정|흰색|하얀색|화이트|회색|그레이|red|blue|yellow|green|black|white|gray|grey|#[0-9a-f]{3,8})/i;
  const match = note.match(scoped);
  if (!match) return null;
  const scope = match[0];
  const hex = scope.match(/#[0-9a-f]{3,8}\b/i)?.[0] ?? null;
  if (hex) return normalizeHexColor(hex);
  return parseColorKeyword(scope);
}

function parseFontWeight(note: string): string | null {
  if (/(?:굵게|볼드|bold|font-weight)[^\n]{0,12}(?:해|변경|키|increase)?/i.test(note)) return '700';
  if (/(?:얇게|보통|regular|normal)[^\n]{0,12}(?:해|변경)?/i.test(note)) return '400';
  return null;
}

/**
 * Handles "크게 해줘" / "작게" without an explicit multiplier — a very
 * common shape that `parseFontSize`'s multiplier regex misses because
 * there's no `배` or number. Bumps the current fontSize by ±25% so the
 * user gets a visible change instead of dropping to auto-continue.
 * When the comment ALSO carries a visibility emphasis or explicit
 * multiplier that already produced a fontSize, this returns {} to
 * avoid stomping the more precise value.
 */
function parseStandaloneSizeKeyword(
  note: string,
  currentStyles: Partial<ManualEditStyles>,
): Partial<ManualEditStyles> {
  const enlarge = /(?:^|[\s.,;])(?:더\s*)?(?:크게|커지게|키워|키워줘|larger|bigger|increase\s+size)/i;
  const shrink = /(?:^|[\s.,;])(?:더\s*)?(?:작게|작아지게|줄여|줄여줘|smaller|reduce\s+size|decrease\s+size)/i;
  const wantsEnlarge = enlarge.test(note);
  const wantsShrink = shrink.test(note);
  if (!wantsEnlarge && !wantsShrink) return {};
  const base = parsePx(currentStyles.fontSize);
  if (!base) return {};
  const factor = wantsShrink ? 0.8 : 1.25;
  const min = wantsShrink ? Math.max(8, base - 4) : Math.max(base + 2, base * factor);
  const max = wantsShrink ? Math.min(base - 2, base * factor) : Math.min(320, base + 24);
  const next = wantsShrink
    ? Math.max(min, Math.min(base * factor, max))
    : Math.max(min, Math.min(max, base * factor));
  return { fontSize: `${trimNumber(next)}px` };
}

/**
 * Recognises underline / strikethrough / no-decoration requests. Sets
 * `textDecoration` directly so the model doesn't have to re-encode the
 * user's plain-language emphasis into set-outer-html.
 */
function parseTextDecorationPatch(note: string): Partial<ManualEditStyles> {
  if (/(?:밑줄(?:\s*그어|\s*표시|\s*추가)?|underline)/i.test(note)) {
    return { textDecoration: 'underline' };
  }
  if (/(?:취소선|가로줄|strikethrough|strike\s*through|line-through)/i.test(note)) {
    return { textDecoration: 'line-through' };
  }
  if (/(?:밑줄\s*(?:제거|지워|없애|해제)|no\s*underline|remove\s+underline)/i.test(note)) {
    return { textDecoration: 'none' };
  }
  return {};
}

/**
 * Recognises alignment requests ("가운데 정렬", "왼쪽으로", "center
 * align", etc). Maps to `textAlign` on the target element.
 */
function parseTextAlignPatch(note: string): Partial<ManualEditStyles> {
  if (/(?:가운데|중앙|중간|center)\s*(?:정렬|맞춤|align|배치)?/i.test(note)) {
    return { textAlign: 'center' };
  }
  if (/(?:왼쪽|좌측|left)\s*(?:정렬|맞춤|align|배치)?/i.test(note)) {
    return { textAlign: 'left' };
  }
  if (/(?:오른쪽|우측|right)\s*(?:정렬|맞춤|align|배치)?/i.test(note)) {
    return { textAlign: 'right' };
  }
  if (/(?:양쪽|justify)\s*(?:정렬|맞춤|align)?/i.test(note)) {
    return { textAlign: 'justify' };
  }
  return {};
}

function matchFirst(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function stripTrailingInstructionNoise(value: string): string {
  return value
    .replace(/\s*(?:그리고|and)\s+.*$/i, '')
    .replace(/[.\u3002]\s*$/, '')
    .trim();
}

function parsePx(value?: string): number | null {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseMultiplier(value: string | undefined): number | null {
  const normalized = String(value ?? '').replace(/\s+/g, '').trim();
  if (normalized === '두') return 2;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function normalizeHexColor(value: string): string {
  return value.length === 4
    ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase()
    : value.toLowerCase();
}

function parseColorKeyword(value: string): string | null {
  for (const [re, color] of COLOR_KEYWORDS) {
    if (re.test(value)) return color;
  }
  return null;
}

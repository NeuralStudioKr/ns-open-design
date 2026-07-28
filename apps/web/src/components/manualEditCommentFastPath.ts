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
  const text = parseTextReplacement(note);
  if (text !== null) {
    patches.push({ id: attachment.elementId, kind: 'set-text', value: text });
  }

  const styles = parseStylePatch(note, effectiveStyles);
  if (Object.keys(styles).length > 0) {
    patches.push({ id: attachment.elementId, kind: 'set-style', styles });
  }

  if (patches.length === 0) return null;
  return { patches, label: 'Comment quick edit' };
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
    if ((typeof preferredValue !== 'string' || preferredValue.trim() === '') && typeof fallbackValue === 'string' && fallbackValue.trim()) {
      out[key] = fallbackValue;
    }
  }
  return out;
}

function isElementLevelComment(attachment: ChatCommentAttachment): boolean {
  if (attachment.selectionKind === 'pod') return false;
  if (attachment.imageAttachments && attachment.imageAttachments.length > 0) return false;
  const id = attachment.elementId.trim();
  if (!id || id.startsWith('pin-') || id.startsWith('file-comment-')) return false;
  if (attachment.filePath && attachment.filePath !== attachment.filePath.trim()) return false;
  return true;
}

function parseTextReplacement(note: string): string | null {
  const quoted = matchFirst(note, [
    /(?:텍스트|문구|글자|내용|이름|제목|타이틀|title)[^"'“”‘’\n]{0,24}["“”'‘’]([^"“”'‘’\n]{1,240})["“”'‘’]\s*(?:로|으로)?\s*(?:변경|수정|바꿔|교체|replace|change)?/i,
    /(?:=>|→|->)\s*["“”'‘’]([^"“”'‘’\n]{1,240})["“”'‘’]/i,
    /["“”'‘’]([^"“”'‘’\n]{1,240})["“”'‘’]\s*(?:로|으로)\s*(?:변경|수정|바꿔|교체|replace|change)/i,
  ]);
  if (quoted) return quoted.trim();

  const plain = matchFirst(note, [
    /(?:텍스트|문구|글자|내용|이름|제목|타이틀|title)[^:\n]{0,12}:\s*([^\n]{1,160})$/i,
    /(?:replace|change)\s+(?:text|copy|label)\s+(?:to|with)\s+([^\n]{1,160})$/i,
  ]);
  if (plain) return stripTrailingInstructionNoise(plain);

  // Natural-language replacement: "이름을 X로", "제목을 X로 변경".
  // Only accept when the sentence carries a strong replacement verb OR
  // ends immediately after the "로/으로" marker — otherwise phrases like
  // "이름을 크게" (font-size) or "글자를 빨간색으로" (color) would
  // incorrectly steal the text field.
  const natural = note.match(
    /(?:이름|제목|타이틀|타이들|헤딩|title|name|heading|텍스트|문구|내용|글자)[을를]\s*['"“”‘’]?([가-힣A-Za-z0-9 _.\-()!?]{1,80}?)['"“”‘’]?\s*(?:로|으로)\s*(?:변경|수정|바꿔|교체|해줘|바꿔줘|change|replace)?\s*[.。!?]?\s*$/i,
  );
  if (natural?.[1]) {
    const value = stripTrailingInstructionNoise(natural[1]);
    if (looksLikeStyleModifier(value)) return null;
    return value;
  }
  return null;
}

/**
 * Reject natural-language replacement candidates that actually name a
 * style modifier (size / weight / color). The style parser owns those
 * — accepting them here would rewrite the target's text with the
 * modifier keyword itself (e.g. "글자를 빨간색으로" → text "빨간색").
 */
function looksLikeStyleModifier(value: string): boolean {
  if (/^(?:크게|작게|얇게|굵게|볼드|보통|regular|normal|bold)$/i.test(value)) return true;
  if (/색$/.test(value)) return true;
  if (parseColorKeyword(value)) return true;
  if (/^(?:크\s*게|작\s*게|얇\s*게|굵\s*게)/.test(value)) return true;
  return false;
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
  const absolute = note.match(/(?:폰트\s*크기|폰트\s*사이즈|글자\s*크기|글씨\s*크기|font-size|font\s*size)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(px|rem|em|%)\b/i);
  if (absolute) return `${absolute[1]}${absolute[2]}`;

  const multiplier = note.match(/(?:폰트|글자|글씨|텍스트|font|text)[^\n]{0,20}?(\d+(?:\.\d+)?|두|두\s*)\s*(?:배|x)\s*(?:키|크|확대|increase|larger|bigger)?/i)
    ?? note.match(/(\d+(?:\.\d+)?|두|두\s*)\s*(?:배|x)\s*(?:폰트|글자|글씨|텍스트|font|text)[^\n]{0,16}?(?:키|크|확대|increase|larger|bigger)?/i);
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
      // Text color: literal "글자색"/"글씨색"/"텍스트색"/"font-color" tokens
      // OR "글자를/글씨를/텍스트를 … 빨간색/파란색/..." natural sentences
      // where a color keyword follows the object marker within a short
      // window. The natural pattern is anchored to "글자/글씨/텍스트[을를]"
      // so it never fires on ambiguous prose.
      ? /(?:글자색|글씨색|텍스트\s*색|텍스트색|font\s*color|text\s*color|color)[^\n]{0,24}|(?:글자|글씨|텍스트)[을를]\s*[^\n]{0,20}?(?:빨간색|빨강|파란색|파랑|노란색|노랑|초록색|초록|녹색|검은색|검정|흰색|하얀색|화이트|회색|그레이|red|blue|yellow|green|black|white|gray|grey|#[0-9a-f]{3,8})/i
      // Background color: literal "배경색"/"background" tokens OR
      // "배경을 … 빨간색/..." style natural sentences.
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
    .replace(/[.。]\s*$/, '')
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

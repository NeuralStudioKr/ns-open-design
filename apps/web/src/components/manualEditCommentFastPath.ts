import type { ChatCommentAttachment } from '../types';
import type { ManualEditPatch, ManualEditStyles } from '../edit-mode/types';

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

  const patches: ManualEditPatch[] = [];
  const text = parseTextReplacement(note);
  if (text !== null) {
    patches.push({ id: attachment.elementId, kind: 'set-text', value: text });
  }

  const styles = parseStylePatch(note, currentStyles);
  if (Object.keys(styles).length > 0) {
    patches.push({ id: attachment.elementId, kind: 'set-style', styles });
  }

  if (patches.length === 0) return null;
  return { patches, label: 'Comment quick edit' };
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
    /(?:텍스트|문구|글자|내용)[^"'“”‘’\n]{0,24}["“”'‘’]([^"“”'‘’\n]{1,240})["“”'‘’]\s*(?:로|으로)?\s*(?:변경|수정|바꿔|교체|replace|change)/i,
    /(?:=>|→|->)\s*["“”'‘’]([^"“”'‘’\n]{1,240})["“”'‘’]/i,
    /["“”'‘’]([^"“”'‘’\n]{1,240})["“”'‘’]\s*(?:로|으로)\s*(?:변경|수정|바꿔|교체|replace|change)/i,
  ]);
  if (quoted) return quoted.trim();

  const plain = matchFirst(note, [
    /(?:텍스트|문구|글자|내용)[^:\n]{0,12}:\s*([^\n]{1,160})$/i,
    /(?:replace|change)\s+(?:text|copy|label)\s+(?:to|with)\s+([^\n]{1,160})$/i,
  ]);
  return plain ? stripTrailingInstructionNoise(plain) : null;
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

  const multiplier = note.match(/(?:폰트|글자|글씨|텍스트|font|text)[^\n]{0,20}?(\d+(?:\.\d+)?)\s*(?:배|x)\s*(?:키|크|확대|increase|larger|bigger)?/i)
    ?? note.match(/(\d+(?:\.\d+)?)\s*(?:배|x)\s*(?:폰트|글자|글씨|텍스트|font|text)[^\n]{0,16}?(?:키|크|확대|increase|larger|bigger)?/i);
  if (!multiplier) return null;
  const base = parsePx(currentFontSize);
  if (!base) return null;
  const next = Math.max(1, Math.min(320, base * Number(multiplier[1])));
  return `${trimNumber(next)}px`;
}

function parseColorForKind(note: string, kind: 'text' | 'background'): string | null {
  const scoped =
    kind === 'text'
      ? /(?:글자색|글씨색|텍스트\s*색|텍스트색|font\s*color|text\s*color|color)[^\n]{0,24}/i
      : /(?:배경색|배경\s*색|background(?:\s*color)?)[^\n]{0,24}/i;
  const match = note.match(scoped);
  if (!match) return null;
  const scope = match[0];
  const hex = scope.match(/#[0-9a-f]{3,8}\b/i)?.[0] ?? null;
  if (hex) return normalizeHexColor(hex);
  for (const [re, value] of COLOR_KEYWORDS) {
    if (re.test(scope)) return value;
  }
  return null;
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

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function normalizeHexColor(value: string): string {
  return value.length === 4
    ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase()
    : value.toLowerCase();
}

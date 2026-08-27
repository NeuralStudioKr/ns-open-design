import { isTeamverEmbedMode } from './designApiBase';

const SLIDE_TITLE_RE = /^Slide\s+(\d+)$/i;

const TITLE_MAP: Record<string, string> = {
  Document: '문서',
  Presentation: '슬라이드',
  Spreadsheet: '스프레드시트',
  PDF: 'PDF',
};

const LINE_MAP: Record<string, string> = {
  'No readable text found.': '읽을 수 있는 텍스트가 없습니다.',
  'No readable slides found.': '읽을 수 있는 슬라이드가 없습니다.',
  'No readable sheets found.': '읽을 수 있는 시트가 없습니다.',
  'No readable cell values found.': '읽을 수 있는 셀 값이 없습니다.',
  'Text preview is unavailable. Use Open or Download to inspect the PDF.':
    '텍스트 미리보기를 할 수 없습니다. 열기 또는 다운로드로 PDF를 확인하세요.',
};

/** Daemon office-preview chrome → Teamver Korean. Standalone keeps English. */
export function localizeOfficePreviewTitleForEmbed(title: string): string {
  const trimmed = String(title ?? '').trim();
  const slide = trimmed.match(SLIDE_TITLE_RE);
  if (slide) return `슬라이드 ${slide[1]}`;
  return TITLE_MAP[trimmed] ?? trimmed;
}

export function localizeOfficePreviewLineForEmbed(line: string): string {
  const trimmed = String(line ?? '');
  return LINE_MAP[trimmed] ?? trimmed;
}

export function localizeOfficePreviewTitle(title: string): string {
  return isTeamverEmbedMode() ? localizeOfficePreviewTitleForEmbed(title) : title;
}

export function localizeOfficePreviewLine(line: string): string {
  return isTeamverEmbedMode() ? localizeOfficePreviewLineForEmbed(line) : line;
}

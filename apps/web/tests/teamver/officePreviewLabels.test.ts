import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  localizeOfficePreviewLineForEmbed,
  localizeOfficePreviewTitleForEmbed,
} from '../../src/teamver/officePreviewLabels';

describe('localizeOfficePreviewTitleForEmbed', () => {
  it('maps daemon office chrome to Korean', () => {
    expect(localizeOfficePreviewTitleForEmbed('Document')).toBe('문서');
    expect(localizeOfficePreviewTitleForEmbed('Presentation')).toBe('슬라이드');
    expect(localizeOfficePreviewTitleForEmbed('Spreadsheet')).toBe('스프레드시트');
    expect(localizeOfficePreviewTitleForEmbed('Slide 3')).toBe('슬라이드 3');
    expect(localizeOfficePreviewTitleForEmbed('Q3 실적.xlsx')).toBe('Q3 실적.xlsx');
  });
});

describe('localizeOfficePreviewLineForEmbed', () => {
  it('maps daemon empty-state copy to Korean', () => {
    expect(localizeOfficePreviewLineForEmbed('No readable text found.')).toBe(
      '읽을 수 있는 텍스트가 없습니다.',
    );
    expect(localizeOfficePreviewLineForEmbed('실제 본문')).toBe('실제 본문');
  });
});

describe('DocumentPreviewViewer leftover pin', () => {
  it('localizes office preview chrome in FileViewer', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/FileViewer.tsx'),
      'utf8',
    );
    expect(source).toContain('localizeOfficePreviewTitle(preview.title)');
    expect(source).toContain('localizeOfficePreviewTitle(section.title)');
    expect(source).toContain('localizeOfficePreviewLine(line)');
  });
});

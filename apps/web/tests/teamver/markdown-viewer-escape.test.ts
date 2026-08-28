import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MarkdownViewer leftover pin', () => {
  it('closes the download menu on Escape and uses persist export titles', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/FileViewer.tsx'),
      'utf8',
    );
    expect(source).toContain('function MarkdownViewer(');
    expect(source).toContain('if (e.key === \'Escape\') setDownloadMenuOpen(false)');
    expect(source).toContain('ref={downloadMenuRef}');
    expect(source).toContain('resolveExportDownloadTitle(undefined, file.name)');
    expect(source).not.toContain('file.name.replace(/\\.mdx?$/i, \'\') || file.name');
    expect(source).not.toContain('file.name.replace(/\\.(jsx|tsx)$/i, \'\') || file.name');
  });

  it('defaults save-as-template name from persist export title not deck.html slug', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/FileViewer.tsx'),
      'utf8',
    );
    expect(source).toContain('function openSaveAsTemplateModal()');
    expect(source).toContain('exportTitle.trim() || t(\'fileViewer.templateNameDefault\')');
    expect(source).not.toContain('file.name.replace(/\\.html?$/i, \'\') || t(\'fileViewer.templateNameDefault\')');
    expect(source).toContain('다운로드 및 내보내기');
    expect(source).not.toContain('다운로드 및보내기');
  });

  it('localizes image/template modal kickers in embed', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/FileViewer.tsx'),
      'utf8',
    );
    expect(source).toContain("embedUiLabel('IMAGE', '이미지')");
    expect(source).toContain("embedUiLabel('TEMPLATE', '템플릿')");
    expect(source).not.toContain('<div className="kicker">IMAGE</div>');
    expect(source).not.toContain('<div className="kicker">TEMPLATE</div>');
  });

  it('passes embed locale into the redirect-loop blocked preview', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/components/FileViewer.tsx'),
      'utf8',
    );
    expect(source).toContain(
      'buildRedirectLoopBlockedDoc({ embed: isTeamverEmbedMode() })',
    );
  });
});

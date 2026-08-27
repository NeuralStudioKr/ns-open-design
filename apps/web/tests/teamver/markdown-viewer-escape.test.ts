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
});

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  applyFileViewerPreviewEscapeAction,
  resolveFileViewerPreviewEscapeAction,
} from '../../src/teamver/fileViewerPreviewEscape';

const closed: Parameters<typeof resolveFileViewerPreviewEscapeAction>[0] = {
  presentMenuOpen: false,
  zoomMenuOpen: false,
  agentToolsOpen: false,
  deployMenuOpen: false,
  downloadMenuOpen: false,
  inTabPresent: false,
  deployModalOpen: false,
};

describe('resolveFileViewerPreviewEscapeAction', () => {
  it('closes deploy or download chrome without a React-module shareMenuOpen flag', () => {
    expect(resolveFileViewerPreviewEscapeAction({
      ...closed,
      deployMenuOpen: true,
    })).toBe('close-share-menus');
    expect(resolveFileViewerPreviewEscapeAction({
      ...closed,
      downloadMenuOpen: true,
    })).toBe('close-share-menus');
    expect(resolveFileViewerPreviewEscapeAction(closed)).toBe('noop');
  });
});

describe('FileViewer HtmlViewer escape wiring', () => {
  it('does not read an undeclared shareMenuOpen in HtmlViewer', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../src/components/FileViewer.tsx'),
      'utf8',
    );
    const htmlViewer = source.slice(source.indexOf('function HtmlViewer('));
    const escapeBlock = htmlViewer.match(
      /resolveFileViewerPreviewEscapeAction\(\{[\s\S]*?\}\)/,
    )?.[0] ?? '';
    expect(escapeBlock).toContain('deployMenuOpen');
    expect(escapeBlock).not.toMatch(/\bshareMenuOpen\b/);
    expect(htmlViewer).not.toMatch(/setShareMenuOpen\(/);
    expect(htmlViewer).toMatch(/preview escape failed/);
  });
});

describe('applyFileViewerPreviewEscapeAction', () => {
  it('invokes only the matching setter', () => {
    const calls: string[] = [];
    applyFileViewerPreviewEscapeAction('close-share-menus', {
      closePresentMenu: () => calls.push('present'),
      closeZoomMenu: () => calls.push('zoom'),
      closeArtifactTools: () => calls.push('tools'),
      closeShareMenus: () => calls.push('share'),
      exitInTabPresent: () => calls.push('present-tab'),
      closeDeployModal: () => calls.push('deploy'),
    });
    expect(calls).toEqual(['share']);
  });
});

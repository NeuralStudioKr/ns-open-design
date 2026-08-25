import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  applyFileViewerPreviewEscapeAction,
  resolveFileViewerPreviewEscapeAction,
  runFileViewerPreviewMessageHandler,
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
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('preview escape'");
  });
});

describe('runFileViewerPreviewMessageHandler', () => {
  it('swallows a leftover throw so the embed tree stays up', () => {
    expect(() => {
      runFileViewerPreviewMessageHandler('slide-state', () => {
        throw new ReferenceError('shareMenuOpen is not defined');
      });
    }).not.toThrow();
  });

  it('runs a healthy handler', () => {
    let ran = false;
    runFileViewerPreviewMessageHandler('slide-state', () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it('logs under a generic [preview] label (FileViewer and PreviewModal share it)', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../src/teamver/fileViewerPreviewEscape.ts'),
      'utf8',
    );
    expect(source).toContain('[preview]');
    expect(source).not.toContain('[HtmlViewer] preview');
  });
});

describe('FileViewer HtmlViewer preview message guards', () => {
  it('guards slide-state, handshake, scroll, viewport, comment, and inspect iframe handlers', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../src/components/FileViewer.tsx'),
      'utf8',
    );
    const htmlViewer = source.slice(source.indexOf('function HtmlViewer('));
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('slide-state'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('preview-scroll'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('preview-scroll-request'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('dc-viewport'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('deck-host-viewport'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('srcdoc-ready'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('redirect-loop'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('url-bridge-ready'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('comment-targets'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('comment-overlay'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('inspect-target'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('od-edit-bridge'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('stacked-deck-ready'");
    expect(htmlViewer).toContain("runFileViewerPreviewMessageHandler('preview escape'");
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

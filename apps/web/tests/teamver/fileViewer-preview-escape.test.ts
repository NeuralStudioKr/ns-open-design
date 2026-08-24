import { describe, expect, it } from 'vitest';
import {
  resolveFileViewerPreviewEscapeAction,
  type FileViewerEscapeChrome,
} from '../../src/teamver/fileViewerPreviewEscape';

const idle: FileViewerEscapeChrome = {
  presentMenuOpen: false,
  zoomMenuOpen: false,
  agentToolsOpen: false,
  shareMenuOpen: false,
  deployMenuOpen: false,
  downloadMenuOpen: false,
  inTabPresent: false,
  deployModalOpen: false,
};

describe('FileViewer preview Escape from iframe', () => {
  it('dismisses one chrome layer at a time', () => {
    expect(resolveFileViewerPreviewEscapeAction({
      ...idle,
      presentMenuOpen: true,
      inTabPresent: true,
    })).toBe('close-present-menu');
    expect(resolveFileViewerPreviewEscapeAction({
      ...idle,
      zoomMenuOpen: true,
      downloadMenuOpen: true,
    })).toBe('close-zoom-menu');
    expect(resolveFileViewerPreviewEscapeAction({
      ...idle,
      agentToolsOpen: true,
      shareMenuOpen: true,
    })).toBe('close-artifact-tools');
    expect(resolveFileViewerPreviewEscapeAction({
      ...idle,
      deployMenuOpen: true,
    })).toBe('close-share-menus');
    expect(resolveFileViewerPreviewEscapeAction({
      ...idle,
      inTabPresent: true,
    })).toBe('exit-in-tab-present');
    expect(resolveFileViewerPreviewEscapeAction({
      ...idle,
      deployModalOpen: true,
    })).toBe('close-deploy-modal');
    expect(resolveFileViewerPreviewEscapeAction(idle)).toBe('noop');
  });
});

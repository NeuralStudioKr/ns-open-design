import { PREVIEW_ESCAPE_MESSAGE } from '../runtime/srcdoc';

export { PREVIEW_ESCAPE_MESSAGE };

export type FileViewerEscapeChrome = {
  presentMenuOpen: boolean;
  zoomMenuOpen: boolean;
  agentToolsOpen: boolean;
  /** React-module viewer only. HtmlViewer folds share into deploy/download. */
  shareMenuOpen?: boolean;
  deployMenuOpen: boolean;
  downloadMenuOpen: boolean;
  inTabPresent: boolean;
  deployModalOpen: boolean;
};

export type FileViewerEscapeAction =
  | 'close-present-menu'
  | 'close-zoom-menu'
  | 'close-artifact-tools'
  | 'close-share-menus'
  | 'exit-in-tab-present'
  | 'close-deploy-modal'
  | 'noop';

/** One chrome layer per Escape — same order as FileViewer document keydown. */
export function resolveFileViewerPreviewEscapeAction(
  chrome: FileViewerEscapeChrome,
): FileViewerEscapeAction {
  if (chrome.presentMenuOpen) return 'close-present-menu';
  if (chrome.zoomMenuOpen) return 'close-zoom-menu';
  if (chrome.agentToolsOpen) return 'close-artifact-tools';
  if (chrome.shareMenuOpen || chrome.deployMenuOpen || chrome.downloadMenuOpen) {
    return 'close-share-menus';
  }
  if (chrome.inTabPresent) return 'exit-in-tab-present';
  if (chrome.deployModalOpen) return 'close-deploy-modal';
  return 'noop';
}

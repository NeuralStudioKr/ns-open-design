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

export type FileViewerEscapeSetters = {
  closePresentMenu: () => void;
  closeZoomMenu: () => void;
  closeArtifactTools: () => void;
  closeShareMenus: () => void;
  exitInTabPresent: () => void;
  closeDeployModal: () => void;
};

/** Apply one Escape layer. Callers must wrap this so a setter throw cannot kill the tree. */
export function applyFileViewerPreviewEscapeAction(
  action: FileViewerEscapeAction,
  setters: FileViewerEscapeSetters,
): void {
  if (action === 'close-present-menu') setters.closePresentMenu();
  else if (action === 'close-zoom-menu') setters.closeZoomMenu();
  else if (action === 'close-artifact-tools') setters.closeArtifactTools();
  else if (action === 'close-share-menus') setters.closeShareMenus();
  else if (action === 'exit-in-tab-present') setters.exitInTabPresent();
  else if (action === 'close-deploy-modal') setters.closeDeployModal();
}

/**
 * Iframe `message` handlers run in a layout/effect. A leftover identifier
 * or malformed payload throw must not take down the Teamver embed boundary.
 */
export function runFileViewerPreviewMessageHandler(
  label: string,
  run: () => void,
): void {
  try {
    run();
  } catch (err) {
    console.error(`[preview] ${label} failed`, err);
  }
}

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('Teamver embed export + Drive publish UI', () => {
  it('removes the standalone Open in Teamver Drive menu item (loop 173)', () => {
    expect(
      existsSync(resolve(webRoot, 'src/teamver/components/TeamverOpenDrivePublishMenuItem.tsx')),
    ).toBe(false);
    const fileViewer = readSource('src/components/FileViewer.tsx');
    expect(fileViewer).not.toContain('TeamverOpenDrivePublishMenuItem');
    expect(fileViewer).toContain('TEAMVER_DRIVE_ASSET_LINK_LABEL');
  });

  it('labels embed export as 보내기 and routes Drive publish through a modal', () => {
    const fileViewer = readSource('src/components/FileViewer.tsx');
    expect(fileViewer).toContain("embedUiLabel('Export', '보내기')");
    expect(fileViewer).toContain('TeamverExportMenu');
    expect(fileViewer).toContain('TeamverPublishDriveModal');
    expect(fileViewer).toContain('const showImageExport = canShare && !isTeamverEmbedMode()');
    const exportMenu = readSource('src/teamver/components/TeamverExportMenu.tsx');
    expect(exportMenu).toContain('teamver-open-publish-drive-modal-pdf');
    expect(exportMenu).toContain('teamver-open-publish-drive-modal-html');
    expect(fileViewer).toContain('exportProjectAsHtml');
    expect(fileViewer).toContain('requireRenderedExport: isTeamverEmbedMode()');
  });

  it('uses slide-only Drive publish with segmented PDF/HTML choice', () => {
    const messaging = readSource('src/teamver/drivePublishMessaging.ts');
    expect(messaging).toContain('DRIVE_PUBLISH_FORMAT_OPTIONS');
    expect(messaging).toContain('label: "PDF"');
    expect(messaging).toContain('label: "HTML"');
    const panel = readSource('src/teamver/components/TeamverPublishDrivePanel.tsx');
    expect(panel).toContain('selectedFormat');
    expect(panel).toContain('teamver-drive-format-benefit');
    expect(panel).toContain('teamver-drive-format-option-');
    expect(panel).toContain('resolveInitialPublishFormat');
    expect(panel).toContain('writeLastPublishFormat');
    expect(panel).toContain('deck: true');
    expect(panel).toMatch(/ready\.length > 0[\s\S]*?clearPdfExportBlocked/);
    const exportMenu = readSource('src/teamver/components/TeamverExportMenu.tsx');
    expect(exportMenu).not.toContain('share-menu-item-subtitle');
    const modal = readSource('src/teamver/components/TeamverPublishDriveModal.tsx');
    expect(modal).toContain('modalSubtitle');
  });

  it('locks Korean copy on the Drive publish flow', () => {
    const messaging = readSource('src/teamver/drivePublishMessaging.ts');
    expect(messaging).toContain('PDF로 드라이브에 올리기');
    expect(messaging).toContain('HTML로 드라이브에 올리기');
    const panel = readSource('src/teamver/components/TeamverPublishDrivePanel.tsx');
    expect(panel).toContain('저장 위치');
    expect(panel).toContain('찾아보기');
    expect(panel).toContain('형식');
    expect(panel).toContain('formatPublishErrorCodeForUser');
  });

  it('collapses publish history by default in the modal panel', () => {
    const panel = readSource('src/teamver/components/TeamverPublishDrivePanel.tsx');
    expect(panel).toContain('TeamverDrivePublishHistory');
    expect(panel).toContain('defaultCollapsed');
    const history = readSource('src/teamver/components/TeamverDrivePublishHistory.tsx');
    expect(history).toContain('teamver-drive-history-toggle');
    expect(history).toContain('teamver-drive-history-deferred');
  });

  it('surfaces a re-login CTA when BFF calls return 401', () => {
    const helper = readSource('src/teamver/teamverBffAuthError.ts');
    expect(helper).toContain('isTeamverBffUnauthorizedError');
    expect(helper).toContain('redirectToTeamverLoginFromEmbed');

    const panel = readSource('src/teamver/components/TeamverPublishDrivePanel.tsx');
    expect(panel).toContain('teamver-drive-panel-auth-required');
    expect(panel).toContain('teamver-drive-panel-login');
    expect(panel).toContain('setAuthRequired(true)');

    const history = readSource('src/teamver/components/TeamverDrivePublishHistory.tsx');
    expect(history).toContain('teamver-drive-history-auth-required');
    expect(history).toContain('teamver-drive-history-login');
    expect(history).toContain('outputs_unavailable');

    const importModal = readSource('src/teamver/components/TeamverDriveImportModal.tsx');
    expect(importModal).toContain('teamver-drive-import-auth-required');
    expect(importModal).toContain('teamver-drive-import-login');
    expect(importModal).toContain('scopesHydrated');

    const picker = readSource('src/teamver/components/TeamverDrivePickerModal.tsx');
    expect(picker).toContain('teamver-drive-picker-auth-required');
    expect(picker).toContain('teamver-drive-picker-login');
    expect(picker).toContain('loadTeamverDriveBrowsePageCachedForSignal');
  });

  it('closes the publish modal on Escape', () => {
    const modal = readSource('src/teamver/components/TeamverPublishDriveModal.tsx');
    expect(modal).toContain('Escape');
    expect(modal).toContain('onClose()');
    expect(modal).toContain('useTeamverDriveModalFocusTrap');
  });

  it('supports partial publish toasts with follow-up actions', () => {
    const fileViewer = readSource('src/components/FileViewer.tsx');
    expect(fileViewer).toContain('imageExportSnapshotDataUrlRef.current = null');
    expect(fileViewer).toContain('buildDrivePublishToastContent');
    expect(fileViewer).toContain('canOfferAlternateDrivePublishFormat');
    expect(fileViewer).toContain('detailLinks');
    expect(fileViewer).toContain('로도 올리기');
    expect(fileViewer).toContain('initialFormat');
    expect(fileViewer).toContain('setDrivePublishFocusNonce(null)');
  });

  it('keeps the format type union in publishToDrive', () => {
    const publish = readSource('src/teamver/publishToDrive.ts');
    expect(publish).toContain('TeamverPublishDriveFormat');
    expect(publish).toContain('"html" | "pdf"');
    expect(publish).not.toContain('"zip" | "pdf"');
  });
});

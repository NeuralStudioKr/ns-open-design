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
    const exportMenu = readSource('src/teamver/components/TeamverExportMenu.tsx');
    expect(exportMenu).toContain('teamver-open-publish-drive-modal-pdf');
    expect(exportMenu).toContain('teamver-open-publish-drive-modal-html');
    expect(fileViewer).toContain('exportProjectAsHtml');
    expect(fileViewer).toContain('requireRenderedExport: isTeamverEmbedMode()');
  });

  it('uses slide-only Drive publish with segmented PDF/HTML choice', () => {
    const messaging = readSource('src/teamver/drivePublishMessaging.ts');
    expect(messaging).toContain('DRIVE_PUBLISH_FORMAT_OPTIONS');
    expect(messaging).toContain('PDF · 팀 공유');
    expect(messaging).toContain('HTML · Drive 미리보기');
    const panel = readSource('src/teamver/components/TeamverPublishDrivePanel.tsx');
    expect(panel).toContain('selectedFormat');
    expect(panel).toContain('teamver-drive-format-segment');
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
    expect(publish).toContain('"html" | "zip" | "pdf"');
  });
});

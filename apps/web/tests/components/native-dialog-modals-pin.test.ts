import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileWorkspace = readFileSync(join(here, '../../src/components/FileWorkspace.tsx'), 'utf8');
const chatPane = readFileSync(join(here, '../../src/components/ChatPane.tsx'), 'utf8');
const designFiles = readFileSync(join(here, '../../src/components/DesignFilesPanel.tsx'), 'utf8');
const previewModal = readFileSync(join(here, '../../src/components/PreviewModal.tsx'), 'utf8');
const examplesTab = readFileSync(join(here, '../../src/components/ExamplesTab.tsx'), 'utf8');
const tasksView = readFileSync(join(here, '../../src/components/TasksView.tsx'), 'utf8');
const routinesSection = readFileSync(join(here, '../../src/components/RoutinesSection.tsx'), 'utf8');
const memorySection = readFileSync(join(here, '../../src/components/MemorySection.tsx'), 'utf8');
const designSystemsTab = readFileSync(join(here, '../../src/components/DesignSystemsTab.tsx'), 'utf8');
const settingsDialog = readFileSync(join(here, '../../src/components/SettingsDialog.tsx'), 'utf8');
const conversationsMenu = readFileSync(join(here, '../../src/components/ConversationsMenu.tsx'), 'utf8');
const exportsSrc = readFileSync(join(here, '../../src/runtime/exports.ts'), 'utf8');

describe('Teamver embed native dialog replacements', () => {
  it('FileWorkspace confirms file delete and sketch close in a viewer modal', () => {
    expect(fileWorkspace).not.toMatch(/\bconfirm\(/);
    expect(fileWorkspace).not.toMatch(/\balert\(/);
    expect(fileWorkspace).toContain('pendingWorkspaceConfirm');
    expect(fileWorkspace).toContain('requestDelete');
    expect(fileWorkspace).toContain('requestDeleteMany');
    expect(fileWorkspace).toContain('discardSketch');
    expect(fileWorkspace).toContain('workspace.deleteFileConfirm');
    expect(fileWorkspace).toContain('sketch.closeConfirm');
  });

  it('DesignFilesPanel surfaces rename failures in the banner', () => {
    expect(designFiles).not.toMatch(/\balert\(/);
    expect(designFiles).toContain('formatProjectRenameErrorForUser');
    expect(designFiles).toContain('setRenameError');
  });

  it('browser PDF fallback throws instead of alerting', () => {
    expect(exportsSrc).not.toMatch(/\balert\(['"`]/);
    expect(exportsSrc).toContain('BROWSER_PDF_POPUP_BLOCKED');
    expect(exportsSrc).toContain('BROWSER_PDF_PRINT_FAILED');
    expect(exportsSrc).toContain('throw new Error(BROWSER_PDF_POPUP_BLOCKED)');
  });

  it('PreviewModal surfaces export failures in a banner', () => {
    expect(previewModal).not.toMatch(/\balert\(/);
    expect(previewModal).toContain('setExportNotice');
    expect(previewModal).toContain('common.exportImageFailed');
    expect(previewModal).toContain('formatExportFailureMessageForUser');
    expect(previewModal).toContain('preview-export-error-banner');
    expect(previewModal).toContain('exportAsZip(activeHtml, exportTitle, { deck: activeDeck })');
    expect(previewModal).toContain('exportAsHtml(activeHtml, exportTitle, { deck: activeDeck })');
  });

  it('ExamplesTab surfaces PDF export failures in a banner', () => {
    expect(examplesTab).not.toMatch(/\.catch\(\(\) => \{\}\)/);
    expect(examplesTab).toContain('setExportNotice');
    expect(examplesTab).toContain('formatExportFailureMessageForUser');
    expect(examplesTab).toContain('example-export-error-banner');
    expect(examplesTab).toContain('exportAsZip(html, exportTitle, { deck: isDeck })');
    expect(examplesTab).toContain('exportAsHtml(html, exportTitle, { deck: isDeck })');
  });

  it('desktop leftover confirms use ViewerConfirmModal', () => {
    expect(tasksView).not.toMatch(/\bwindow\.confirm\(/);
    expect(routinesSection).not.toMatch(/\bwindow\.confirm\(/);
    expect(memorySection).not.toMatch(/\bwindow\.confirm\(/);
    expect(designSystemsTab).not.toMatch(/\bwindow\.confirm\(/);
    expect(settingsDialog).not.toMatch(/\bconfirm\(/);
    expect(tasksView).toContain('ViewerConfirmModal');
    expect(routinesSection).toContain('ViewerConfirmModal');
    expect(memorySection).toContain('ViewerConfirmModal');
    expect(designSystemsTab).toContain('ViewerConfirmModal');
    expect(settingsDialog).toContain('ViewerConfirmModal');
    expect(settingsDialog).toContain('settings.mediaProviderClearConfirm');
    expect(conversationsMenu).not.toMatch(/\bconfirm\(/);
    expect(conversationsMenu).toContain('ViewerConfirmModal');
    expect(conversationsMenu).toContain('conv.deleteConfirm');
  });

  it('ChatPane deletes a conversation from a viewer modal', () => {
    expect(chatPane).not.toMatch(/\bconfirm\(/);
    expect(chatPane).toContain('chat.deleteConversationConfirm');
    expect(chatPane).toContain('setPendingDelete(true)');
    expect(chatPane).toContain('modal-backdrop viewer-modal-backdrop');
  });
});

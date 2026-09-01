import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fileWorkspace = readFileSync(join(here, '../../src/components/FileWorkspace.tsx'), 'utf8');
const chatPane = readFileSync(join(here, '../../src/components/ChatPane.tsx'), 'utf8');
const designFiles = readFileSync(join(here, '../../src/components/DesignFilesPanel.tsx'), 'utf8');
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

  it('ChatPane deletes a conversation from a viewer modal', () => {
    expect(chatPane).not.toMatch(/\bconfirm\(/);
    expect(chatPane).toContain('chat.deleteConversationConfirm');
    expect(chatPane).toContain('setPendingDelete(true)');
    expect(chatPane).toContain('modal-backdrop viewer-modal-backdrop');
  });
});

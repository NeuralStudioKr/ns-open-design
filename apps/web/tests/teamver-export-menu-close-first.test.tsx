// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamverExportMenu } from '../src/teamver/components/TeamverExportMenu';
import type { Dict } from '../src/i18n/types';

const t = (key: keyof Dict) => String(key);

function renderMenu(overrides: Partial<ComponentProps<typeof TeamverExportMenu>> = {}) {
  const props: ComponentProps<typeof TeamverExportMenu> = {
    t,
    fileName: 'deck.html',
    showPptxExport: true,
    canPptx: true,
    streaming: false,
    showImageExport: true,
    showMarkdownExport: true,
    savingTemplate: false,
    templateNote: null,
    onCloseMenu: vi.fn(),
    onOpenDrivePublish: vi.fn(),
    onOpenImageExport: vi.fn(),
    onOpenSaveAsTemplate: vi.fn(),
    fireShareExport: vi.fn(),
    exportPdf: vi.fn(),
    exportPptx: vi.fn(),
    exportHtml: vi.fn(),
    exportZip: vi.fn(),
    exportMarkdown: vi.fn(),
    ...overrides,
  };
  render(<TeamverExportMenu {...props} />);
  return props;
}

describe('TeamverExportMenu', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('closes the menu before starting local download exports', () => {
    vi.useFakeTimers();
    const props = renderMenu();

    fireEvent.click(screen.getByTestId('teamver-export-pdf'));

    expect(props.onCloseMenu).toHaveBeenCalledTimes(1);
    expect(props.fireShareExport).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();

    expect(props.fireShareExport).toHaveBeenCalledTimes(1);
    expect(props.fireShareExport).toHaveBeenCalledWith('pdf', expect.any(Function));
  });

  it('closes the menu before opening Drive publish modals', () => {
    vi.useFakeTimers();
    const props = renderMenu();

    fireEvent.click(screen.getByTestId('teamver-open-publish-drive-modal-pdf'));

    expect(props.onCloseMenu).toHaveBeenCalledTimes(1);
    expect(props.onOpenDrivePublish).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();

    expect(props.onOpenDrivePublish).toHaveBeenCalledWith('pdf');
  });
});

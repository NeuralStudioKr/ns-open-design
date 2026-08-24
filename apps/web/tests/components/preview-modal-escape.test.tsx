// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewModal } from '../../src/components/PreviewModal';
import { PREVIEW_ESCAPE_MESSAGE } from '../../src/runtime/srcdoc';

const baseProps = {
  title: 'Template preview',
  views: [{ id: 'main', label: 'Main', html: '<p>hi</p>' }],
  exportTitleFor: (id: string) => id,
};

describe('PreviewModal Escape from a focused preview iframe', () => {
  afterEach(() => {
    cleanup();
  });

  it('closes when the sandboxed iframe posts od:preview-escape', () => {
    const onClose = vi.fn();
    const { container } = render(
      <PreviewModal {...baseProps} onClose={onClose} />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe?.contentWindow).toBeTruthy();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: PREVIEW_ESCAPE_MESSAGE },
          source: iframe!.contentWindow,
        }),
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores od:preview-escape from another window', () => {
    const onClose = vi.fn();
    render(<PreviewModal {...baseProps} onClose={onClose} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: PREVIEW_ESCAPE_MESSAGE },
          source: window,
        }),
      );
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('exits fullscreen first, then closes on a second iframe Escape', () => {
    const onClose = vi.fn();
    const { container } = render(
      <PreviewModal {...baseProps} onClose={onClose} />,
    );
    const fsButton = container.querySelector(
      'button[title="Fullscreen"]',
    ) as HTMLButtonElement;
    fireEvent.click(fsButton);
    const stage = container.querySelector('.ds-modal') as HTMLElement;
    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(true);

    const iframe = container.querySelector('iframe');
    expect(iframe?.contentWindow).toBeTruthy();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: PREVIEW_ESCAPE_MESSAGE },
          source: iframe!.contentWindow,
        }),
      );
    });
    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: PREVIEW_ESCAPE_MESSAGE },
          source: iframe!.contentWindow,
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

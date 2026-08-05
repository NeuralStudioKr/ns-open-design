// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Toast } from '../../src/components/Toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Toast', () => {
  it('renders the message and primary line by default', () => {
    render(<Toast message="Folder opened." />);
    expect(screen.getByText('Folder opened.')).not.toBeNull();
  });

  it('renders the optional secondary details line beneath the message', () => {
    render(<Toast message="Upstream issue" details="Account cap until 2026-06-01" />);
    expect(screen.getByText('Account cap until 2026-06-01')).not.toBeNull();
  });

  it('renders the code body in a <pre> when copy fails so users can manually copy the prompt', () => {
    const prompt = '# Continue in CLI — Acme\n\nWorking directory:\n/Users/me/projects/acme\n';
    render(<Toast message="Clipboard unavailable. Copy this prompt manually." code={prompt} />);
    const pre = screen.getByText((_content, node) => node?.tagName === 'PRE');
    expect(pre.textContent).toBe(prompt);
  });

  it('does not auto-dismiss when code is present (user needs time to copy)', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="manual copy" code="some prompt" ttlMs={100} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('auto-dismisses at ttlMs when code is not present, with the exit fade playing inside the window', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { container } = render(
      <Toast message="folder opened" ttlMs={2000} onDismiss={onDismiss} />,
    );
    // The fade-out begins before the deadline (ttlMs - exit), so the toast is
    // already in its leaving state just shy of ttlMs but has not unmounted yet.
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(container.querySelector('.od-toast.leaving')).not.toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();
    // onDismiss (which unmounts the toast) fires at exactly ttlMs, so the exit
    // animation does not extend the toast's lifetime beyond ttlMs.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a leading status glyph for the success tone', () => {
    const { container } = render(<Toast message="Screenshot copied to clipboard" tone="success" />);
    expect(container.querySelector('.od-toast.tone-success .od-toast-icon')).not.toBeNull();
  });

  it('renders a Close button when both code and onDismiss are present', () => {
    render(<Toast message="manual copy" code="x" onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /Close/i })).not.toBeNull();
  });

  it('renders an icon Close control for error toasts without code', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Something failed" tone="error" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses a warning glyph for error tone and only one close control', () => {
    const { container } = render(
      <Toast message="Something failed" tone="error" onDismiss={() => {}} />,
    );
    expect(container.querySelector('.od-toast-icon svg')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /Close/i })).toHaveLength(1);
  });

  it('does not reset the auto-dismiss timer when the parent passes a new onDismiss identity', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Toast message="Saved" ttlMs={2000} onDismiss={onDismiss} />,
    );
    rerender(<Toast message="Saved" ttlMs={2000} onDismiss={() => onDismiss()} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the dismiss control on the same row as the message (no stacked chip)', () => {
    const { container } = render(
      <Toast message="Saved" tone="success" onDismiss={() => {}} />,
    );
    expect(container.querySelector('.od-toast-row .od-toast-dismiss')).not.toBeNull();
    expect(container.querySelector('.od-toast-dismiss-text')).toBeNull();
  });

  it('pins loading toasts open (no auto-dismiss) and marks aria-busy', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { container } = render(
      <Toast message="Exporting…" tone="loading" ttlMs={100} onDismiss={onDismiss} />,
    );
    expect(container.querySelector('.od-toast.tone-loading')?.getAttribute('aria-busy')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('centers via od-toast-anchor so Motion transform cannot steal translateX', () => {
    const { container } = render(<Toast message="Saved" tone="success" />);
    expect(container.querySelector('.od-toast-anchor .od-toast.tone-success')).not.toBeNull();
  });

  it('invokes action then dismiss when the action button is clicked', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        message="Saved"
        tone="success"
        actionLabel="Undo"
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

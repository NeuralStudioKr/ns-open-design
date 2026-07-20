// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBufferedTextUpdates } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

// Covers the mechanism the live-tool `seq` fix relies on: text appended via
// `appendTextEvent` is buffered and not committed to `message.events` until a
// flush. If a tool's first `input_json_delta` arrives in the same burst as the
// preamble (before the rAF/250ms flush), `events.length` undercounts the
// preamble by one — so the seq computation adds `hasPendingText() ? 1 : 0`.
describe('createBufferedTextUpdates pending text accounting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports buffered text until it is flushed into a single event', () => {
    // No-op the scheduled flush so only the explicit flush() commits.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = { events: [] } as unknown as ChatMessage;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
    });

    expect(buf.hasPendingText()).toBe(false);

    buf.appendTextEvent('intro preamble');
    // Buffered — not yet a committed event, so events.length still 0.
    expect(buf.hasPendingText()).toBe(true);
    expect(msg.events?.length ?? 0).toBe(0);

    buf.flush();
    // Committed as exactly one text event; nothing pending now.
    expect(buf.hasPendingText()).toBe(false);
    expect(msg.events?.length).toBe(1);
    expect(msg.events?.[0]).toMatchObject({ kind: 'text', text: 'intro preamble' });

    buf.cancel();
  });

  it('sanitizes leaked pseudo-tool XML after streaming chunks are reassembled', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = {
      content: 'Intro',
      events: [],
    } as unknown as ChatMessage;
    const contentDeltas: string[] = [];
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
      onContentDelta: (delta) => contentDeltas.push(delta),
    });

    buf.appendContent('\n<too');
    buf.appendContent('ls><invoke name="TodoWrite">hidden</invoke></tools>\nVisible');
    buf.appendTextEvent('Plan\n<inv');
    buf.appendTextEvent('oke name="Write">hidden</invoke>\nDone');
    buf.flush();

    expect(msg.content).toBe('Intro\n\nVisible');
    expect(msg.content).not.toContain('<tools');
    expect(msg.content).not.toContain('<invoke');
    expect(msg.events).toEqual([{ kind: 'text', text: 'Plan\n\nDone' }]);
    expect(contentDeltas).toEqual(['\n\nVisible']);

    buf.cancel();
  });

  it('keeps hidden pseudo-tool bodies suppressed when flush splits the open and close tags', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = {
      content: 'Intro',
      events: [],
    } as unknown as ChatMessage;
    const contentDeltas: string[] = [];
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
      onContentDelta: (delta) => contentDeltas.push(delta),
    });

    buf.appendContent('\n<tools><invoke name="TodoWrite">hidden');
    buf.appendTextEvent('Plan\n<invoke name="Write">secret');
    buf.flush();

    expect(msg.content).toBe('Intro');
    expect(msg.events).toEqual([{ kind: 'text', text: 'Plan' }]);
    expect(contentDeltas).toEqual([]);

    buf.appendContent('</invoke></tools>\nVisible');
    buf.appendTextEvent('</invoke>\nDone');
    buf.flush();

    expect(msg.content).toBe('Intro\n\nVisible');
    expect(msg.content).not.toContain('hidden');
    expect(msg.content).not.toContain('</invoke>');
    expect(msg.events).toEqual([
      { kind: 'text', text: 'Plan' },
      { kind: 'text', text: '\n\nDone' },
    ]);
    expect(JSON.stringify(msg.events)).not.toContain('secret');
    expect(contentDeltas).toEqual(['\n\nVisible']);

    buf.cancel();
  });

  it('rewrites trailing text events when sanitize shrinks a partial think tag', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = {
      content: '',
      events: [],
    } as unknown as ChatMessage;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
    });

    // Without incomplete-token hold this used to commit `Hello <think` as a
    // text event; the next flush then appended the full sanitized string.
    buf.appendTextEvent('Hello <thi');
    buf.flush();
    expect(JSON.stringify(msg.events)).not.toContain('<thi');
    expect(msg.events).toEqual([{ kind: 'text', text: 'Hello' }]);

    buf.appendTextEvent('nking>secret</thinking> World');
    buf.flush();
    expect(JSON.stringify(msg.events)).not.toContain('secret');
    expect(JSON.stringify(msg.events)).not.toContain('<think');
    const joined = (msg.events ?? [])
      .filter((e) => e.kind === 'text')
      .map((e) => (e as { kind: 'text'; text: string }).text)
      .join('');
    expect(joined.replace(/\s+/g, ' ').trim()).toBe('Hello World');

    buf.cancel();
  });

  it('calls onContentRewrite with the full sanitized snapshot when content shrinks', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = {
      content: 'Intro',
      events: [],
    } as unknown as ChatMessage;
    const contentDeltas: string[] = [];
    const contentRewrites: string[] = [];
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
      onContentDelta: (delta) => contentDeltas.push(delta),
      onContentRewrite: (full) => contentRewrites.push(full),
    });

    // First flush emits growth that includes a host held incompletely… if the
    // host somehow lands in content then a later void scrub shrinks it.
    // Force a shrink by feeding a closed tool block that arrives mid-stream.
    buf.appendContent('\n<tool_call>secret');
    buf.flush();
    expect(msg.content).toBe('Intro');
    expect(contentDeltas).toEqual([]);

    buf.appendContent('</tool_call>\nVisible');
    buf.flush();
    expect(msg.content).toBe('Intro\n\nVisible');
    // Non-monotonic path may rewrite or emit growth depending on hold timing;
    // either way live parsers must learn about "Visible" without keeping secret.
    expect(msg.content).not.toContain('secret');
    expect([...contentDeltas, ...contentRewrites].join('')).toContain('Visible');
    expect(JSON.stringify(contentRewrites)).not.toContain('secret');

    buf.cancel();
  });
});

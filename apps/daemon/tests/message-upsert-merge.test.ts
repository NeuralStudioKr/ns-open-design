import { describe, expect, it } from 'vitest';

import {
  isDurableChatErrorEvent,
  mergeMessageEvents,
  mergeMessageUpsertPayload,
} from '../src/storage/message-upsert-merge.js';

describe('message-upsert-merge', () => {
  it('recognizes durable status:error events', () => {
    expect(isDurableChatErrorEvent({
      kind: 'status',
      label: 'error',
      detail: '요청을 처리하지 못했습니다. 내용을 확인한 뒤 다시 시도하세요.',
      code: 'BAD_REQUEST',
    })).toBe(true);
    expect(isDurableChatErrorEvent({
      kind: 'status',
      label: 'error',
      detail: 'auto',
      code: 'auto_continue_incomplete_output',
    })).toBe(false);
  });

  it('preserves durable errors when a later non-empty events upsert omits them (cache-miss / PG)', () => {
    // Simulates Postgres HA: first PUT persisted the error card; a later
    // streaming-buffer PUT arrives with cache cold so merge must use the
    // durable existing row (not an empty cache).
    const existing = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'partial',
      runStatus: 'failed',
      events: [
        { kind: 'text', text: 'partial' },
        {
          kind: 'status',
          label: 'error',
          detail: '요청을 처리하지 못했습니다. 내용을 확인한 뒤 다시 시도하세요.',
          code: 'BAD_REQUEST',
        },
      ],
      endedAt: 100,
    };
    const incoming = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'partial more',
      runStatus: 'succeeded',
      events: [
        { kind: 'text', text: 'partial more' },
        { kind: 'tool_use', id: 't1', name: 'Write', input: {} },
      ],
      endedAt: 200,
    };

    expect(mergeMessageEvents(incoming.events, undefined)).toEqual(incoming.events);
    const durable = mergeMessageUpsertPayload(existing, incoming);
    expect(durable.runStatus).toBe('failed');
    expect(durable.events).toEqual([
      { kind: 'text', text: 'partial more' },
      { kind: 'tool_use', id: 't1', name: 'Write', input: {} },
      {
        kind: 'status',
        label: 'error',
        detail: '요청을 처리하지 못했습니다. 내용을 확인한 뒤 다시 시도하세요.',
        code: 'BAD_REQUEST',
      },
    ]);
  });

  it('keeps existing events when incoming omits the field', () => {
    const existing = {
      id: 'a',
      events: [{ kind: 'status', label: 'error', detail: 'timeout', code: 'timeout' }],
      runStatus: 'failed',
    };
    const incoming = { id: 'a', content: 'x', runStatus: 'failed' };
    expect(mergeMessageUpsertPayload(existing, incoming).events).toEqual(existing.events);
  });

  it('keeps durable errors when a late append snapshot races ahead of an error upsert', () => {
    // appendMessageAgentEvent scheduled write A (text only) after client PUT B
    // already persisted status:error on PG — merge must keep the error.
    const pgDurable = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'hello',
      runStatus: 'failed',
      events: [
        { kind: 'text', text: 'hello' },
        {
          kind: 'status',
          label: 'error',
          detail: '요청을 처리하지 못했습니다. 내용을 확인한 뒤 다시 시도하세요.',
          code: 'BAD_REQUEST',
        },
      ],
    };
    const lateAppendSnapshot = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'hello world',
      runStatus: 'running',
      events: [
        { kind: 'text', text: 'hello' },
        { kind: 'text', text: ' world' },
      ],
    };
    const durable = mergeMessageUpsertPayload(pgDurable, lateAppendSnapshot);
    expect(durable.runStatus).toBe('failed');
    expect(durable.events?.some((event) =>
      event
      && typeof event === 'object'
      && (event as { label?: string }).label === 'error'
      && (event as { code?: string }).code === 'BAD_REQUEST',
    )).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import {
  isDurableChatErrorEvent,
  isPreservedChatErrorEvent,
  mergeMessageEvents,
  mergeMessageUpsertPayload,
} from '../src/storage/message-upsert-merge.js';

describe('message-upsert-merge', () => {
  it('recognizes durable vs preserved status:error events', () => {
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
    expect(isPreservedChatErrorEvent({
      kind: 'status',
      label: 'error',
      detail: 'auto',
      code: 'auto_continue_incomplete_output',
    })).toBe(true);
  });

  it('preserves auto-continue notices and incomplete_output under stale streaming PUTs', () => {
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
          detail: '슬라이드 결과물이 생성되지 않았습니다.',
          code: 'incomplete_output',
        },
        {
          kind: 'status',
          label: 'error',
          detail: '결과물이 완성되지 않아 자동으로 이어쓰기를 시도합니다…',
          code: 'auto_continue_incomplete_output',
        },
      ],
    };
    const incoming = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'partial more',
      runStatus: 'running',
      events: [
        { kind: 'text', text: 'partial more' },
      ],
    };
    const durable = mergeMessageUpsertPayload(existing, incoming);
    expect(durable.runStatus).toBe('failed');
    expect(durable.events).toEqual([
      { kind: 'text', text: 'partial more' },
      {
        kind: 'status',
        label: 'error',
        detail: '슬라이드 결과물이 생성되지 않았습니다.',
        code: 'incomplete_output',
      },
      {
        kind: 'status',
        label: 'error',
        detail: '결과물이 완성되지 않아 자동으로 이어쓰기를 시도합니다…',
        code: 'auto_continue_incomplete_output',
      },
    ]);
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

  it('does not wipe durable producedFiles when a later PUT sends an empty array', () => {
    const existing = {
      id: 'a',
      runStatus: 'succeeded',
      producedFiles: [{ name: 'deck.html', path: 'deck.html', kind: 'html', size: 12 }],
      preTurnFileNames: ['deck.html'],
    };
    const incoming = {
      id: 'a',
      runStatus: 'succeeded',
      content: '',
      producedFiles: [],
      preTurnFileNames: [],
    };
    const durable = mergeMessageUpsertPayload(existing, incoming);
    expect(durable.producedFiles).toEqual(existing.producedFiles);
    expect(durable.preTurnFileNames).toEqual(existing.preTurnFileNames);
  });

  it('preserves slideTurnKind when a later PUT omits the field', () => {
    const existing = {
      id: 'a',
      runStatus: 'succeeded',
      slideTurnKind: 'edit' as const,
    };
    const incoming = {
      id: 'a',
      runStatus: 'succeeded',
      content: '',
    };
    expect(mergeMessageUpsertPayload(existing, incoming).slideTurnKind).toBe('edit');
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

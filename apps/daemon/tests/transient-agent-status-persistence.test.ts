import { describe, expect, it } from 'vitest';
import { __forTestRunSseEventToPersistedAgentEvent } from '../src/server.js';

function persistAgent(data: unknown) {
  return __forTestRunSseEventToPersistedAgentEvent('agent', data);
}

describe('run agent event persistence', () => {
  it.each([
    ['waiting_for_first_output'],
    ['tool_call'],
    ['tool_call_update'],
    ['session_update'],
  ])('drops transient ACP status %s', (label) => {
    expect(persistAgent({
      type: 'status',
      label,
      detail: 'protocol-internal status',
    })).toBeNull();
  });

  it('keeps visible status events', () => {
    expect(persistAgent({
      type: 'status',
      label: 'model',
      model: 'claude-sonnet-4',
    })).toEqual({
      kind: 'status',
      label: 'model',
      detail: 'claude-sonnet-4',
    });

    expect(persistAgent({
      type: 'status',
      label: 'streaming',
      detail: 'first token',
    })).toEqual({
      kind: 'status',
      label: 'streaming',
      detail: 'first token',
    });
  });
});

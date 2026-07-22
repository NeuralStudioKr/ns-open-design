// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => true),
}));

import { useProjectFileEvents } from '../../src/providers/project-events';

class MockEventSource {
  static instances: MockEventSource[] = [];
  constructor(_url: string) {
    MockEventSource.instances.push(this);
  }
  addEventListener(): void {}
  close(): void {}
}

describe('useProjectFileEvents in Teamver embed', () => {
  it('does not open headerless EventSource connections', () => {
    renderHook(() =>
      useProjectFileEvents('p1', true, () => {}, {
        EventSourceCtor: MockEventSource as unknown as typeof EventSource,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(0);
  });
});

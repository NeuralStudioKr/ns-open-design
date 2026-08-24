import { describe, expect, it, vi } from 'vitest';

import {
  rememberTeamverProjectS3Prefix,
  subscribeTeamverProjectS3Prefix,
  clearAllTeamverProjectS3PrefixCache,
} from '../../src/teamver/teamverProjectS3PrefixCache';

describe('teamverProjectS3PrefixCache', () => {
  it('notifies subscribers when the scoped prefix is remembered', () => {
    clearAllTeamverProjectS3PrefixCache();
    const listener = vi.fn();
    const unsubscribe = subscribeTeamverProjectS3Prefix('ws-1', 'project-1', listener);

    rememberTeamverProjectS3Prefix('ws-1', 'project-1', 'tenants/ws/projects/p1');
    expect(listener).toHaveBeenCalledTimes(1);

    rememberTeamverProjectS3Prefix('ws-1', 'project-1', 'tenants/ws/projects/p1');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    rememberTeamverProjectS3Prefix('ws-1', 'project-1', 'tenants/ws/projects/p2');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

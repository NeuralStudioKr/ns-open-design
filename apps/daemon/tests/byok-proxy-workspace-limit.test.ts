import { afterEach, describe, expect, it } from 'vitest';

import {
  maxByokProxyStreamsPerWorkspace,
  resetWorkspaceProxySlotsForTests,
  tryAcquireWorkspaceProxySlot,
  workspaceProxyActiveCountForTests,
} from '../src/byok-proxy-workspace-limit.js';

describe('byok-proxy-workspace-limit', () => {
  const previous = process.env.OD_BYOK_PROXY_MAX_PER_WORKSPACE;

  afterEach(() => {
    resetWorkspaceProxySlotsForTests();
    if (previous === undefined) delete process.env.OD_BYOK_PROXY_MAX_PER_WORKSPACE;
    else process.env.OD_BYOK_PROXY_MAX_PER_WORKSPACE = previous;
  });

  it('defaults to 8 concurrent streams per workspace', () => {
    delete process.env.OD_BYOK_PROXY_MAX_PER_WORKSPACE;
    expect(maxByokProxyStreamsPerWorkspace()).toBe(8);
  });

  it('rejects new slots when the workspace cap is reached', () => {
    process.env.OD_BYOK_PROXY_MAX_PER_WORKSPACE = '2';
    const first = tryAcquireWorkspaceProxySlot('ws-1');
    const second = tryAcquireWorkspaceProxySlot('ws-1');
    const third = tryAcquireWorkspaceProxySlot('ws-1');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(third).toBeNull();
    expect(workspaceProxyActiveCountForTests('ws-1')).toBe(2);
    second?.release();
    expect(workspaceProxyActiveCountForTests('ws-1')).toBe(1);
    const fourth = tryAcquireWorkspaceProxySlot('ws-1');
    expect(fourth).not.toBeNull();
  });
});

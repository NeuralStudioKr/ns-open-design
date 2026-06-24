import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { readTeamverIdentityFromRequest } from '../src/teamver-project-access.js';

function fakeRequest(headers: Record<string, string>): Request {
  return { headers } as Request;
}

describe('readTeamverIdentityFromRequest', () => {
  it('prefers X-Workspace-Id over session-check workspace header', () => {
    const identity = readTeamverIdentityFromRequest(
      fakeRequest({
        'x-teamver-user-id': 'user-1',
        'x-teamver-workspace-id': 'ws-session',
        'x-workspace-id': 'ws-active',
      }),
    );
    expect(identity).toEqual({ userId: 'user-1', workspaceId: 'ws-active' });
  });

  it('falls back to X-Teamver-Workspace-Id when client header is absent', () => {
    const identity = readTeamverIdentityFromRequest(
      fakeRequest({
        'x-teamver-user-id': 'user-1',
        'x-teamver-workspace-id': 'ws-session',
      }),
    );
    expect(identity?.workspaceId).toBe('ws-session');
  });

  it('returns null when user id is missing', () => {
    expect(
      readTeamverIdentityFromRequest(
        fakeRequest({ 'x-teamver-workspace-id': 'ws-1' }),
      ),
    ).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  HOSTED_MANAGED_CHAT_ENDPOINT,
  isHostedManagedChatRouteMissingError,
  LEGACY_MINIMAX_CHAT_ENDPOINT,
  resolveMiniMaxChatEndpoint,
} from '../../src/teamver/hostedManagedChat';

describe('hosted managed chat web switch', () => {
  it('keeps the legacy route when the web flag is off', () => {
    expect(resolveMiniMaxChatEndpoint({
      flag: '0',
      isStagingHost: true,
    })).toBe(LEGACY_MINIMAX_CHAT_ENDPOINT);
  });

  it('selects the shadow route only on the staging host with the flag on', () => {
    expect(resolveMiniMaxChatEndpoint({
      flag: '1',
      isStagingHost: true,
    })).toBe(HOSTED_MANAGED_CHAT_ENDPOINT);
  });

  it('keeps production on the legacy route even if the flag is accidentally on', () => {
    expect(resolveMiniMaxChatEndpoint({
      flag: '1',
      isStagingHost: false,
    })).toBe(LEGACY_MINIMAX_CHAT_ENDPOINT);
  });

  it('treats only a missing shadow route as a legacy fallback signal', () => {
    expect(isHostedManagedChatRouteMissingError(new Error('proxy 404: no body'))).toBe(true);
    expect(isHostedManagedChatRouteMissingError(new Error('proxy 503: unavailable'))).toBe(false);
  });
});

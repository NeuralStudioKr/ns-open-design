import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  claimCreateAutoSend,
  createAutoSendClaimHeld,
  releaseCreateAutoSendClaim,
  shouldRearmCreateAutoSend,
  shouldRetryFailedCreateAutoSend,
} from '../../src/teamver/createAutoSendLatch';

describe('create auto-send latch', () => {
  it('lets only the first caller claim a project', () => {
    const claims = new Set<string>();
    expect(claimCreateAutoSend('p1', claims)).toBe(true);
    expect(claimCreateAutoSend('p1', claims)).toBe(false);
    expect(createAutoSendClaimHeld('p1', claims)).toBe(true);
    expect(claimCreateAutoSend('p2', claims)).toBe(true);
  });

  it('releases a claim so a failed attempt can retry once', () => {
    const claims = new Set<string>();
    expect(claimCreateAutoSend('p1', claims)).toBe(true);
    releaseCreateAutoSendClaim('p1', claims);
    expect(createAutoSendClaimHeld('p1', claims)).toBe(false);
    expect(claimCreateAutoSend('p1', claims)).toBe(true);
  });

  it('does not restore the session flag after handleSend has started', () => {
    expect(shouldRearmCreateAutoSend({
      autoSent: false,
      dispatched: false,
      abortActive: false,
    })).toBe(true);
    expect(shouldRearmCreateAutoSend({
      autoSent: false,
      dispatched: true,
      abortActive: false,
    })).toBe(false);
    expect(shouldRearmCreateAutoSend({
      autoSent: true,
      dispatched: false,
      abortActive: false,
    })).toBe(false);
    expect(shouldRearmCreateAutoSend({
      autoSent: false,
      dispatched: false,
      abortActive: true,
    })).toBe(false);
  });

  it('does not retry a failed create send once a user row is visible', () => {
    expect(shouldRetryFailedCreateAutoSend({
      messageCount: 0,
      abortActive: false,
      streamingThisConversation: false,
      embedSubmitDisabled: false,
      retryCount: 0,
      maxRetries: 5,
    })).toBe(true);
    expect(shouldRetryFailedCreateAutoSend({
      messageCount: 2,
      abortActive: false,
      streamingThisConversation: false,
      embedSubmitDisabled: false,
      retryCount: 0,
      maxRetries: 5,
    })).toBe(false);
    expect(shouldRetryFailedCreateAutoSend({
      messageCount: 0,
      abortActive: true,
      streamingThisConversation: false,
      embedSubmitDisabled: false,
      retryCount: 0,
      maxRetries: 5,
    })).toBe(false);
    expect(shouldRetryFailedCreateAutoSend({
      messageCount: 0,
      abortActive: false,
      streamingThisConversation: false,
      embedSubmitDisabled: false,
      retryCount: 5,
      maxRetries: 5,
    })).toBe(false);
  });

  it('ProjectView claims before handleSend and does not rearm after dispatch', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src/components/ProjectView.tsx'),
      'utf8',
    );
    const effect = source.slice(
      source.indexOf('PluginLoopHome auto-send:'),
      source.indexOf('Wire the Critique Theater'),
    );
    expect(effect).toContain('if (createAutoSendClaimHeld(project.id)) return;');
    expect(effect).toContain('if (!claimCreateAutoSend(project.id)) return;');
    const claimAt = effect.indexOf('if (!claimCreateAutoSend(project.id)) return;');
    const dispatchAt = effect.indexOf('autoSendDispatched = true;');
    const sendAt = effect.indexOf('const ok = await handleSend(seed, attachments, [], {');
    expect(claimAt).toBeGreaterThan(0);
    expect(claimAt).toBeLessThan(dispatchAt);
    expect(dispatchAt).toBeLessThan(sendAt);
    expect(effect).toContain('shouldRearmCreateAutoSend({');
    expect(effect).toContain('shouldRetryFailedCreateAutoSend({');
    expect(effect).not.toContain('if (!autoSentRef.current && autoSendInFlightRef.current)');
  });
});

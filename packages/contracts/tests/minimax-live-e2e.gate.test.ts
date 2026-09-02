import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  hasMiniMaxLiveKey,
  resolveMiniMaxLiveApiKeyFromEnv,
  resolveMiniMaxLiveConfig,
} from './helpers/minimax-live-env.js';

describe('minimax live e2e gate (0901-N02)', () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of [
      'TEAMVER_MINIMAX_API_KEY',
      'OD_MINIMAX_API_KEY',
      'MINIMAX_API_KEY',
    ]) {
      prev[name] = process.env[name];
    }
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('does not claim a live key when all MiniMax env aliases are empty', () => {
    delete process.env.TEAMVER_MINIMAX_API_KEY;
    delete process.env.OD_MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    expect(resolveMiniMaxLiveApiKeyFromEnv()).toBe('');
    expect(hasMiniMaxLiveKey({ loadDeployEnv: false })).toBe(false);
  });

  it('resolves TEAMVER_MINIMAX_API_KEY before OD/MINIMAX aliases', () => {
    delete process.env.TEAMVER_MINIMAX_API_KEY;
    delete process.env.OD_MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    process.env.OD_MINIMAX_API_KEY = 'sk-od';
    process.env.MINIMAX_API_KEY = 'sk-raw';
    expect(resolveMiniMaxLiveConfig({ loadDeployEnv: false }).apiKey).toBe('sk-od');
    process.env.TEAMVER_MINIMAX_API_KEY = 'sk-teamver';
    expect(resolveMiniMaxLiveConfig({ loadDeployEnv: false }).apiKey).toBe('sk-teamver');
  });

  it('live clone-fill suite is gated — no HTTP in this file', () => {
    expect(typeof hasMiniMaxLiveKey).toBe('function');
  });
});

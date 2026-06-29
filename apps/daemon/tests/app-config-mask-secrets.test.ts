import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  isMaskedSecretValue,
  maskAgentCliEnvSecrets,
  validateAgentCliEnv,
  writeAppConfig,
  readAppConfig,
} from '../src/app-config.js';

describe('maskAgentCliEnvSecrets', () => {
  it('masks secret env values while preserving path/profile fields', () => {
    const masked = maskAgentCliEnvSecrets({
      claude: {
        ANTHROPIC_API_KEY: 'sk-ant-livesecret',
        ANTHROPIC_AUTH_TOKEN: 'oauth-tok-livevalue',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        CLAUDE_BIN: '/usr/local/bin/claude',
      },
      codex: {
        CODEX_API_KEY: 'sk-codex-livesecret',
        OPENAI_API_KEY: 'sk-openai-livesecret',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
      amr: {
        VELA_RUNTIME_KEY: 'vela-runtime-livesecret',
        VELA_LINK_URL: 'https://vela.example/link',
        OPEN_DESIGN_AMR_PROFILE: 'team',
      },
    });

    expect(masked).toBeDefined();
    expect(masked!.claude!.ANTHROPIC_API_KEY).toBe('***cret');
    expect(masked!.claude!.ANTHROPIC_AUTH_TOKEN).toBe('***alue');
    expect(masked!.claude!.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com');
    expect(masked!.claude!.CLAUDE_BIN).toBe('/usr/local/bin/claude');
    expect(masked!.codex!.CODEX_API_KEY).toBe('***cret');
    expect(masked!.codex!.OPENAI_API_KEY).toBe('***cret');
    expect(masked!.codex!.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    expect(masked!.amr!.VELA_RUNTIME_KEY).toBe('***cret');
    expect(masked!.amr!.VELA_LINK_URL).toBe('https://vela.example/link');
    expect(masked!.amr!.OPEN_DESIGN_AMR_PROFILE).toBe('team');
  });

  it('returns the input shape unchanged when input is undefined', () => {
    expect(maskAgentCliEnvSecrets(undefined)).toBeUndefined();
  });

  it('isMaskedSecretValue accepts only the strict sentinel envelope', () => {
    expect(isMaskedSecretValue('***abcd')).toBe(true);
    expect(isMaskedSecretValue('***')).toBe(true);
    expect(isMaskedSecretValue('***ab')).toBe(true);
    expect(isMaskedSecretValue('***abcdefgh')).toBe(true);
    // Real user-typed values that happen to start with *** but are too long /
    // contain forbidden characters must NOT be mistaken for the sentinel.
    expect(isMaskedSecretValue('***toolongtailsection')).toBe(false);
    expect(isMaskedSecretValue('***abcd!')).toBe(false);
    expect(isMaskedSecretValue('sk-ant-real')).toBe(false);
    expect(isMaskedSecretValue('')).toBe(false);
    expect(isMaskedSecretValue(123)).toBe(false);
  });

  it('the mask output always round-trips through isMaskedSecretValue', () => {
    // Even when the raw tail contains URL-unsafe characters (which Anthropic
    // keys never do, but defense-in-depth) the output must remain a valid
    // sentinel so the PUT guard recognizes it.
    const masked = maskAgentCliEnvSecrets({
      claude: { ANTHROPIC_API_KEY: 'abc=/+xyz' },
    })!;
    const tailMasked = masked.claude!.ANTHROPIC_API_KEY!;
    expect(isMaskedSecretValue(tailMasked)).toBe(true);
  });
});

describe('validateAgentCliEnv with masked previous values', () => {
  it('preserves the previous secret when the caller echoes the masked sentinel back', () => {
    const previous = {
      claude: {
        ANTHROPIC_API_KEY: 'sk-ant-real',
        CLAUDE_BIN: '/old/claude',
      },
    } as const;

    const validated = validateAgentCliEnv(
      {
        claude: {
          ANTHROPIC_API_KEY: '***real',
          CLAUDE_BIN: '/new/claude',
        },
      },
      { previous: { ...previous } },
    );

    expect(validated!.claude!.ANTHROPIC_API_KEY).toBe('sk-ant-real');
    expect(validated!.claude!.CLAUDE_BIN).toBe('/new/claude');
  });

  it('accepts a fresh secret that does not look like the masked sentinel', () => {
    const validated = validateAgentCliEnv(
      {
        claude: { ANTHROPIC_API_KEY: 'sk-ant-rotated' },
      },
      {
        previous: {
          claude: { ANTHROPIC_API_KEY: 'sk-ant-old' },
        },
      },
    );
    expect(validated!.claude!.ANTHROPIC_API_KEY).toBe('sk-ant-rotated');
  });
});

describe('writeAppConfig round-trip with masked echo', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-mask-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('does not clobber stored secret when client echoes the masked value back', async () => {
    await writeAppConfig(dataDir, {
      agentCliEnv: {
        claude: { ANTHROPIC_API_KEY: 'sk-ant-real-secret' },
      },
    });

    await writeAppConfig(dataDir, {
      agentCliEnv: {
        claude: { ANTHROPIC_API_KEY: '***cret' },
      },
    });

    const config = await readAppConfig(dataDir);
    expect(config.agentCliEnv?.claude?.ANTHROPIC_API_KEY).toBe('sk-ant-real-secret');
  });
});

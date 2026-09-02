import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const MINIMAX_KEY_ENV_NAMES = [
  'TEAMVER_MINIMAX_API_KEY',
  'OD_MINIMAX_API_KEY',
  'MINIMAX_API_KEY',
] as const;

function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Load deploy/teamver env files when process env is empty (local vitest). */
export function loadMiniMaxLiveEnvFromDeployFiles(): void {
  for (const name of ['.env', '.env.staging']) {
    const file = path.join(REPO_ROOT, 'deploy/teamver', name);
    if (!existsSync(file)) continue;
    const parsed = parseDotEnv(readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (!String(process.env[key] ?? '').trim()) {
        process.env[key] = value;
      }
    }
  }
}

export function normalizeMiniMaxLiveBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim() || 'https://api.minimax.io/v1';
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === 'api.minimaxi.com' || host === 'api.minimaxi.chat') {
      url.hostname = 'api.minimax.io';
      return url.toString().replace(/\/$/, '');
    }
    return trimmed.replace(/\/$/, '');
  } catch {
    return trimmed.replace(/api\.minimaxi\.com/gi, 'api.minimax.io').replace(/\/$/, '');
  }
}

export function resolveMiniMaxLiveApiKeyFromEnv(): string {
  for (const name of MINIMAX_KEY_ENV_NAMES) {
    const value = String(process.env[name] ?? '').trim();
    if (value) return value;
  }
  return '';
}

export type MiniMaxLiveConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function resolveMiniMaxLiveConfig(options?: {
  loadDeployEnv?: boolean;
}): MiniMaxLiveConfig {
  if (options?.loadDeployEnv !== false) {
    loadMiniMaxLiveEnvFromDeployFiles();
  }
  return {
    apiKey: resolveMiniMaxLiveApiKeyFromEnv(),
    baseUrl: normalizeMiniMaxLiveBaseUrl(
      String(process.env.TEAMVER_MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1'),
    ),
    model: String(process.env.TEAMVER_MINIMAX_CHAT_MODEL ?? 'MiniMax-M3').trim() || 'MiniMax-M3',
  };
}

export function hasMiniMaxLiveKey(options?: { loadDeployEnv?: boolean }): boolean {
  return Boolean(resolveMiniMaxLiveConfig(options).apiKey);
}

export function appendMiniMaxChatCompletionsPath(baseUrl: string): string {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/v\d+(\/|$)/.test(pathname)
    ? `${pathname}/chat/completions`
    : `${pathname}/v1/chat/completions`;
  return url.toString();
}

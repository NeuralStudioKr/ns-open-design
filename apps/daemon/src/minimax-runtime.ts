/**
 * Teamver MiniMax managed-provider runtime helpers (daemon-side).
 *
 * Commit 1 skeleton — key/baseUrl/model/max_tokens policy. The actual
 * `/api/proxy/minimax/stream` route lands in Commit 2 (54-1).
 */

export const MINIMAX_PROVIDER_ID = 'minimax' as const;
export const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
export const MINIMAX_DEFAULT_CHAT_MODEL = 'MiniMax-M3';

/** Prefer Teamver-namespaced key; keep OD/media aliases for shared ops. */
export function resolveTeamverMiniMaxApiKeyFromEnv(): string {
  return (
    (process.env.TEAMVER_MINIMAX_API_KEY ?? '').trim()
    || (process.env.OD_MINIMAX_API_KEY ?? '').trim()
    || (process.env.MINIMAX_API_KEY ?? '').trim()
  );
}

export function isMiniMaxEnabledFromEnv(): boolean {
  const raw = (process.env.TEAMVER_MINIMAX_ENABLED ?? '').trim().toLowerCase();
  if (!raw) return Boolean(resolveTeamverMiniMaxApiKeyFromEnv());
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function resolveMiniMaxBaseUrl(): string {
  const raw = (process.env.TEAMVER_MINIMAX_BASE_URL ?? '').trim();
  if (!raw) return MINIMAX_DEFAULT_BASE_URL;
  // Historical typo domain — normalize to canonical api.minimax.io.
  return raw.replace(/api\.minimaxi\.com/gi, 'api.minimax.io');
}

export function resolveMiniMaxChatModel(): string {
  return (process.env.TEAMVER_MINIMAX_CHAT_MODEL ?? '').trim()
    || MINIMAX_DEFAULT_CHAT_MODEL;
}

export function isMiniMaxChatTarget(model: string, baseUrl?: string): boolean {
  const normalizedModel = model.trim().toLowerCase();
  const normalizedBase = (baseUrl ?? '').trim().toLowerCase();
  if (normalizedBase.includes('api.minimax.io') || normalizedBase.includes('api.minimaxi.com')) {
    return true;
  }
  return (
    normalizedModel === 'minimax-m3'
    || normalizedModel.startsWith('minimax-m3')
    || normalizedModel.startsWith('minimax-m2')
  );
}

/** MiniMax-M3 rejects / ignores max_tokens — omit on outbound chat requests. */
export function shouldOmitMaxTokens(model: string, baseUrl?: string): boolean {
  return isMiniMaxChatTarget(model, baseUrl);
}

export function resolveMiniMaxToolLoopLimit(): number {
  const raw = Number(process.env.TEAMVER_AI_TOOL_LOOP_LIMIT ?? '');
  if (Number.isFinite(raw) && raw > 0 && raw <= 6) return Math.floor(raw);
  return 3;
}

export function resolveDesignDefaultProvider(): 'minimax' | 'anthropic' | string {
  return (process.env.TEAMVER_DESIGN_DEFAULT_PROVIDER ?? '').trim().toLowerCase() || 'anthropic';
}

/**
 * Teamver MiniMax managed-provider runtime helpers (daemon-side).
 */

export const MINIMAX_PROVIDER_ID = 'minimax' as const;
export const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
export const MINIMAX_DEFAULT_CHAT_MODEL = 'MiniMax-M3';
export const MINIMAX_API_PROTOCOL = 'minimax';

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

export function normalizeMiniMaxBaseUrl(baseUrl: string | undefined | null): string {
  const trimmed = (baseUrl ?? '').trim();
  if (!trimmed) return MINIMAX_DEFAULT_BASE_URL;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (host === 'api.minimaxi.com' || host === 'api.minimaxi.chat') {
      url.hostname = 'api.minimax.io';
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    return trimmed.replace(/api\.minimaxi\.com/gi, 'api.minimax.io');
  }
  return trimmed.replace(/\/$/, '');
}

export function resolveMiniMaxBaseUrl(): string {
  const raw = (process.env.TEAMVER_MINIMAX_BASE_URL ?? '').trim();
  return normalizeMiniMaxBaseUrl(raw || MINIMAX_DEFAULT_BASE_URL);
}

export function resolveMiniMaxChatModel(): string {
  return (process.env.TEAMVER_MINIMAX_CHAT_MODEL ?? '').trim()
    || MINIMAX_DEFAULT_CHAT_MODEL;
}

export function isMiniMaxChatTarget(model: string, baseUrl?: string | null): boolean {
  const normalizedModel = model.trim().toLowerCase();
  if (normalizedModel === MINIMAX_DEFAULT_CHAT_MODEL.toLowerCase()
    || normalizedModel.startsWith('minimax-')) {
    return true;
  }
  const rawBase = (baseUrl ?? '').trim();
  if (!rawBase) return false;
  const normalizedBase = normalizeMiniMaxBaseUrl(baseUrl).toLowerCase();
  return normalizedBase.includes('api.minimax.io');
}

/** MiniMax-M3 rejects / ignores max_tokens — omit on outbound chat requests. */
export function shouldOmitMiniMaxMaxTokens(model: string, baseUrl?: string | null): boolean {
  return isMiniMaxChatTarget(model, baseUrl);
}

/** @deprecated use shouldOmitMiniMaxMaxTokens */
export const shouldOmitMaxTokens = shouldOmitMiniMaxMaxTokens;

export function resolveMiniMaxToolLoopLimit(): number {
  const raw = Number(process.env.TEAMVER_AI_TOOL_LOOP_LIMIT ?? '');
  if (Number.isInteger(raw) && raw > 0 && raw <= 6) return raw;
  if (Number.isFinite(raw) && raw > 0 && raw <= 6) return Math.floor(raw);
  return 3;
}

export function resolveDesignDefaultProvider(): 'minimax' | 'anthropic' | string {
  return (process.env.TEAMVER_DESIGN_DEFAULT_PROVIDER ?? '').trim().toLowerCase() || 'anthropic';
}

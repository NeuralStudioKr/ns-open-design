export const MINIMAX_PROVIDER_ID = 'minimax' as const;
export const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
export const MINIMAX_DEFAULT_CHAT_MODEL = 'MiniMax-M3';
export const MINIMAX_API_PROTOCOL = 'minimax';

export function resolveTeamverMiniMaxApiKeyFromEnv(): string {
  return (
    (process.env.TEAMVER_MINIMAX_API_KEY ?? '').trim()
    || (process.env.OD_MINIMAX_API_KEY ?? '').trim()
    || (process.env.MINIMAX_API_KEY ?? '').trim()
  );
}

export function resolveMiniMaxBaseUrl(): string {
  return (process.env.TEAMVER_MINIMAX_BASE_URL ?? '').trim()
    || MINIMAX_DEFAULT_BASE_URL;
}

export function resolveMiniMaxChatModel(): string {
  return (process.env.TEAMVER_MINIMAX_CHAT_MODEL ?? '').trim()
    || MINIMAX_DEFAULT_CHAT_MODEL;
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
    return trimmed;
  }
  return trimmed.replace(/\/$/, '');
}

export function isMiniMaxChatTarget(model: string, baseUrl?: string | null): boolean {
  const normalizedModel = model.trim().toLowerCase();
  const normalizedBase = normalizeMiniMaxBaseUrl(baseUrl).toLowerCase();
  return normalizedModel === MINIMAX_DEFAULT_CHAT_MODEL.toLowerCase()
    || normalizedModel.startsWith('minimax-')
    || normalizedBase.includes('api.minimax.io');
}

export function shouldOmitMiniMaxMaxTokens(model: string, baseUrl?: string | null): boolean {
  return isMiniMaxChatTarget(model, baseUrl);
}

export function resolveMiniMaxToolLoopLimit(): number {
  const raw = Number(process.env.TEAMVER_AI_TOOL_LOOP_LIMIT ?? '');
  if (Number.isInteger(raw) && raw > 0 && raw <= 6) return raw;
  return 3;
}

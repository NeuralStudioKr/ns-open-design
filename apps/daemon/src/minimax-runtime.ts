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

/** MiniMax-M3 rejects / ignores legacy `max_tokens` — omit that field. */
export function shouldOmitMiniMaxMaxTokens(model: string, baseUrl?: string | null): boolean {
  return isMiniMaxChatTarget(model, baseUrl);
}

/** Official MiniMax-M3 recommended output cap (docs: 128K, max 512K). */
export const MINIMAX_RECOMMENDED_MAX_COMPLETION_TOKENS = 131_072;
/** Floor so a Teamver deck HTML turn is not clipped at the provider default. */
export const MINIMAX_DECK_MIN_MAX_COMPLETION_TOKENS = 32_000;

/**
 * MiniMax OpenAI-compat docs: use `max_completion_tokens`, not `max_tokens`.
 * Omitting both falls back to a low provider default, which truncates deck
 * HTML as `incomplete-html-document-shell`.
 */
export function resolveMiniMaxMaxCompletionTokens(requested?: number | null): number {
  const fromEnv = Number(process.env.TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS ?? '');
  if (Number.isInteger(fromEnv) && fromEnv >= 1024 && fromEnv <= 524_288) {
    return fromEnv;
  }
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
    return Math.max(Math.floor(requested), MINIMAX_DECK_MIN_MAX_COMPLETION_TOKENS);
  }
  return MINIMAX_RECOMMENDED_MAX_COMPLETION_TOKENS;
}

export type MiniMaxThinkingType = 'disabled' | 'adaptive' | 'enabled';

/**
 * MiniMax-M3 thinking is on by default and counts toward the output budget.
 * Teamver deck generation needs HTML first, so default is disabled.
 */
export function resolveMiniMaxThinkingType(): MiniMaxThinkingType {
  const raw = (process.env.TEAMVER_MINIMAX_THINKING ?? 'disabled').trim().toLowerCase();
  if (raw === 'adaptive' || raw === 'enabled' || raw === 'on' || raw === '1') {
    return raw === 'adaptive' ? 'adaptive' : 'enabled';
  }
  return 'disabled';
}

export function buildMiniMaxThinkingParam(): { thinking: { type: 'disabled' | 'adaptive' } } | Record<string, never> {
  const mode = resolveMiniMaxThinkingType();
  if (mode === 'enabled') return {};
  return { thinking: { type: mode === 'adaptive' ? 'adaptive' : 'disabled' } };
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

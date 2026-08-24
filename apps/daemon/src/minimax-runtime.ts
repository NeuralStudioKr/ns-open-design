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

/**
 * Official OpenAI-compat Chat Completions limits for MiniMax-M3
 * (platform.minimax.io/docs/api-reference/text-chat-openai):
 * recommended 131072 (128K), maximum 524288 (512K). Other M2.x models are
 * 65536 / 204800 — Teamver P0 is MiniMax-M3 only.
 */
export const MINIMAX_M3_RECOMMENDED_MAX_COMPLETION_TOKENS = 131_072;
export const MINIMAX_M3_MAX_COMPLETION_TOKENS = 524_288;
/** Floor so a Teamver deck HTML turn is not clipped at the provider default. */
export const MINIMAX_DECK_MIN_MAX_COMPLETION_TOKENS = 32_000;
/** @deprecated use MINIMAX_M3_RECOMMENDED_MAX_COMPLETION_TOKENS */
export const MINIMAX_RECOMMENDED_MAX_COMPLETION_TOKENS =
  MINIMAX_M3_RECOMMENDED_MAX_COMPLETION_TOKENS;

/** Official recommended sampling for MiniMax-M3 (range temperature [0,2], top_p [0,1]). */
export const MINIMAX_M3_RECOMMENDED_TEMPERATURE = 1;
export const MINIMAX_M3_RECOMMENDED_TOP_P = 0.95;

function clampMiniMaxMaxCompletionTokens(value: number): number {
  return Math.min(
    MINIMAX_M3_MAX_COMPLETION_TOKENS,
    Math.max(MINIMAX_DECK_MIN_MAX_COMPLETION_TOKENS, Math.floor(value)),
  );
}

/**
 * MiniMax OpenAI-compat docs: use `max_completion_tokens`, not `max_tokens`.
 * Omitting both falls back to a low provider default, which truncates deck
 * HTML as `incomplete-html-document-shell`. Always clamp to the official
 * M3 maximum (512K) and a deck-safe floor (32K).
 */
export function resolveMiniMaxMaxCompletionTokens(requested?: number | null): number {
  const fromEnv = Number(process.env.TEAMVER_MINIMAX_MAX_COMPLETION_TOKENS ?? '');
  if (Number.isInteger(fromEnv) && fromEnv >= 1) {
    return clampMiniMaxMaxCompletionTokens(fromEnv);
  }
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
    return clampMiniMaxMaxCompletionTokens(requested);
  }
  return MINIMAX_M3_RECOMMENDED_MAX_COMPLETION_TOKENS;
}

/** Official MiniMax-M3 thinking types. `enabled` is an env alias for `adaptive`. */
export type MiniMaxThinkingType = 'disabled' | 'adaptive';

/**
 * OpenAI-compat MiniMax-M3: omitting `thinking` enables adaptive thinking
 * (counts toward `max_completion_tokens` and can leak `<think>` into content).
 * Teamver deck HTML needs tokens for markup, so default is disabled.
 */
export function resolveMiniMaxThinkingType(): MiniMaxThinkingType {
  const raw = (process.env.TEAMVER_MINIMAX_THINKING ?? 'disabled').trim().toLowerCase();
  if (raw === 'adaptive' || raw === 'enabled' || raw === 'on' || raw === '1') {
    return 'adaptive';
  }
  return 'disabled';
}

export function buildMiniMaxThinkingParam(): { thinking: { type: MiniMaxThinkingType } } {
  return { thinking: { type: resolveMiniMaxThinkingType() } };
}

export function resolveMiniMaxTemperature(): number {
  const raw = (process.env.TEAMVER_MINIMAX_TEMPERATURE ?? '').trim();
  if (!raw) return MINIMAX_M3_RECOMMENDED_TEMPERATURE;
  const fromEnv = Number(raw);
  if (Number.isFinite(fromEnv) && fromEnv >= 0 && fromEnv <= 2) return fromEnv;
  return MINIMAX_M3_RECOMMENDED_TEMPERATURE;
}

export function resolveMiniMaxTopP(): number {
  const raw = (process.env.TEAMVER_MINIMAX_TOP_P ?? '').trim();
  if (!raw) return MINIMAX_M3_RECOMMENDED_TOP_P;
  const fromEnv = Number(raw);
  if (Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv <= 1) return fromEnv;
  return MINIMAX_M3_RECOMMENDED_TOP_P;
}

export function resolveMiniMaxServiceTier(): 'standard' | 'priority' | undefined {
  const raw = (process.env.TEAMVER_MINIMAX_SERVICE_TIER ?? '').trim().toLowerCase();
  if (raw === 'priority' || raw === 'standard') return raw;
  return undefined;
}

export type MiniMaxChatCompletionExtras = {
  max_completion_tokens: number;
  thinking: { type: MiniMaxThinkingType };
  temperature: number;
  top_p: number;
  stream_options?: { include_usage: true };
  reasoning_split?: true;
  service_tier?: 'standard' | 'priority';
};

/**
 * Official MiniMax-M3 Chat Completions extras for the OpenAI-compat route.
 * Always sends `thinking` (never omit — omit means thinking on).
 * `reasoning_split` is only set when thinking is adaptive so `<think>`
 * does not land in `content` / deck HTML.
 */
export function buildMiniMaxChatCompletionExtras(options?: {
  requestedMaxCompletionTokens?: number | null;
  includeUsage?: boolean;
}): MiniMaxChatCompletionExtras {
  const thinkingType = resolveMiniMaxThinkingType();
  const extras: MiniMaxChatCompletionExtras = {
    max_completion_tokens: resolveMiniMaxMaxCompletionTokens(
      options?.requestedMaxCompletionTokens,
    ),
    thinking: { type: thinkingType },
    temperature: resolveMiniMaxTemperature(),
    top_p: resolveMiniMaxTopP(),
  };
  if (options?.includeUsage !== false) {
    extras.stream_options = { include_usage: true };
  }
  if (thinkingType === 'adaptive') {
    extras.reasoning_split = true;
  }
  const tier = resolveMiniMaxServiceTier();
  if (tier) extras.service_tier = tier;
  return extras;
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

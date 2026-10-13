import {
  resolveMiniMaxBaseUrl,
  resolveMiniMaxChatModel,
} from './minimax-runtime.js';

/**
 * Parallel, opt-in hosted chat contract.
 *
 * This module deliberately owns no Express registration and does not alter the
 * legacy provider routes. `chat-routes.ts` registers the generic endpoint only
 * when the flag is explicitly enabled, so removing the flag is a complete
 * rollback to the current production path.
 */
export const HOSTED_MANAGED_CHAT_ROUTE = '/api/proxy/chat/stream';
export const HOSTED_MANAGED_CHAT_FLAG = 'TEAMVER_HOSTED_CHAT_API_ENABLED';

const FORBIDDEN_PUBLIC_FIELDS = Object.freeze([
  'apiKey',
  'useManagedApiKey',
  'apiProtocol',
  'provider',
  'model',
  'baseUrl',
  'apiVersion',
  'maxTokens',
] as const);

export type HostedManagedChatRuntime = {
  /** Server-only adapter selector. Never serialize this object to the client. */
  providerId: 'minimax';
  baseUrl: string;
  model: string;
};

export type HostedManagedChatValidation =
  | { ok: true }
  | { ok: false; fields: string[] };

export function isHostedManagedChatApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env[HOSTED_MANAGED_CHAT_FLAG] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Reject client-controlled provider routing instead of silently ignoring it. */
export function validateHostedManagedChatBody(
  body: Record<string, unknown> | null | undefined,
): HostedManagedChatValidation {
  if (!body) return { ok: true };
  const fields = FORBIDDEN_PUBLIC_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
  return fields.length > 0 ? { ok: false, fields: [...fields] } : { ok: true };
}

/**
 * Resolve the first private adapter without exposing its identity to the web.
 * A future registry can replace this function while the public route remains
 * unchanged.
 */
export function resolveHostedManagedChatRuntime(): HostedManagedChatRuntime {
  return {
    providerId: 'minimax',
    baseUrl: resolveMiniMaxBaseUrl(),
    model: resolveMiniMaxChatModel(),
  };
}

export const HOSTED_MANAGED_CHAT_PUBLIC_ERRORS = Object.freeze({
  unavailable: 'AI service is temporarily unavailable',
  incompleteJson: 'AI response ended before the requested outline completed',
  incompleteArtifact: 'AI response ended before the requested artifact completed',
  unreadable: 'AI service returned an unreadable response',
});

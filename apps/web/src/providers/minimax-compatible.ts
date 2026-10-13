/**
 * MiniMax chat completions provider. MiniMax-M3 is OpenAI-wire-compatible,
 * but Teamver routes it through a dedicated daemon endpoint so the server can
 * inject the managed MiniMax key without exposing it to the browser.
 */
import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint, type ProxyContext } from './api-proxy';
import {
  isHostedManagedChatRouteMissingError,
  LEGACY_MINIMAX_CHAT_ENDPOINT,
  resolveMiniMaxChatEndpoint,
} from '../teamver/hostedManagedChat';

export async function streamMessageMiniMax(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  const endpoint = resolveMiniMaxChatEndpoint();
  if (endpoint === LEGACY_MINIMAX_CHAT_ENDPOINT) {
    return streamProxyEndpoint(
      endpoint,
      cfg,
      system,
      history,
      signal,
      handlers,
      context,
    );
  }

  let hostedError: Error | null = null;
  await streamProxyEndpoint(
    endpoint,
    cfg,
    system,
    history,
    signal,
    {
      ...handlers,
      onError: (error) => {
        hostedError = error;
      },
    },
    context,
  );
  if (!hostedError) return;
  if (!isHostedManagedChatRouteMissingError(hostedError)) {
    handlers.onError(hostedError);
    return;
  }
  return streamProxyEndpoint(
    LEGACY_MINIMAX_CHAT_ENDPOINT,
    cfg,
    system,
    history,
    signal,
    handlers,
    context,
  );
}

/**
 * MiniMax chat completions provider. MiniMax-M3 is OpenAI-wire-compatible,
 * but Teamver routes it through a dedicated daemon endpoint so the server can
 * inject the managed MiniMax key without exposing it to the browser.
 */
import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint, type ProxyContext } from './api-proxy';

export async function streamMessageMiniMax(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  return streamProxyEndpoint(
    '/api/proxy/minimax/stream',
    cfg,
    system,
    history,
    signal,
    handlers,
    context,
  );
}

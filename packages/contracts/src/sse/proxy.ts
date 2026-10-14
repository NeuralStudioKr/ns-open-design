import type {
  ProxyStreamDeltaPayload,
  ProxyStreamEndPayload,
  ProxyStreamProgressPayload,
  ProxyStreamStartPayload,
} from '../api/proxy.js';
import type { SseErrorPayload } from '../errors.js';
import type { SseTransportEvent } from './common.js';

export const PROXY_SSE_PROTOCOL_VERSION = 1;

export type ProxySseEvent =
  | SseTransportEvent<'start', ProxyStreamStartPayload>
  | SseTransportEvent<'progress', ProxyStreamProgressPayload>
  | SseTransportEvent<'delta', ProxyStreamDeltaPayload>
  | SseTransportEvent<'error', SseErrorPayload>
  | SseTransportEvent<'end', ProxyStreamEndPayload>;

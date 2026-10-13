import { isTeamverStagingDesignHost } from './stagingDesignHost';
import { readTeamverViteEnv } from './teamverViteEnv';

export const HOSTED_MANAGED_CHAT_ENDPOINT = '/api/proxy/chat/stream';
export const LEGACY_MINIMAX_CHAT_ENDPOINT = '/api/proxy/minimax/stream';
export const HOSTED_MANAGED_CHAT_WEB_FLAG = 'VITE_TEAMVER_HOSTED_CHAT_API_ENABLED';

function isEnabledValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

/**
 * Shadow transport is staging-only even if a production image is accidentally
 * baked with the flag. OFF always preserves the existing provider endpoint.
 */
type HostedManagedChatWebSwitch = {
  flag?: string;
  isStagingHost?: boolean;
};

export function shouldUseHostedManagedChatApi(
  override: HostedManagedChatWebSwitch = {},
): boolean {
  const flag = override.flag ?? readTeamverViteEnv(HOSTED_MANAGED_CHAT_WEB_FLAG);
  const isStagingHost = override.isStagingHost ?? isTeamverStagingDesignHost();
  return isEnabledValue(flag) && isStagingHost;
}

export function resolveMiniMaxChatEndpoint(
  override?: HostedManagedChatWebSwitch,
): string {
  return shouldUseHostedManagedChatApi(override)
    ? HOSTED_MANAGED_CHAT_ENDPOINT
    : LEGACY_MINIMAX_CHAT_ENDPOINT;
}

/** A disabled shadow route is the rollback signal; other errors stay visible. */
export function isHostedManagedChatRouteMissingError(error: unknown): boolean {
  return error instanceof Error && /^proxy\s+404:/i.test(error.message);
}

import { useEffect } from 'react';

import { fetchDaemonAppVersion } from './daemonAppVersion';
import { isTeamverEmbedMode } from './designApiBase';

/**
 * Embed-only — primes the shared app-version cache once per page load.
 *
 * `/api/version` currently reports the semver/channel tuple, not a deploy
 * revision or bundle hash, so periodic polling cannot reliably detect staging
 * deploy drift. Keep the endpoint for analytics/About metadata, but do not
 * keep an open tab polling the daemon.
 */
export function useTeamverAppVersionAutoReload(): void {
  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    if (typeof window === 'undefined') return;

    void fetchDaemonAppVersion();
  }, []);
}

export const __TEAMVER_AUTO_RELOAD_INTERNALS = {
  fetchDaemonAppVersion,
};

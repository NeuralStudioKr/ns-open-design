import { useEffect, useRef } from 'react';

import { isTeamverEmbedMode } from './designApiBase';

const VERSION_POLL_INTERVAL_MS = 60_000;
const VERSION_AUTO_RELOAD_DELAY_MS = 5_000;

type AppVersionResponse = {
  version?: { version?: unknown } | null;
};

async function fetchCurrentAppVersion(): Promise<string | null> {
  try {
    const resp = await fetch('/api/version', { cache: 'no-store' });
    if (!resp.ok) return null;
    const json = (await resp.json()) as AppVersionResponse;
    const next = json?.version?.version;
    return typeof next === 'string' && next.trim() ? next.trim() : null;
  } catch {
    return null;
  }
}

function emitReloadMarker(fromVersion: string, toVersion: string): void {
  try {
    console.info(
      JSON.stringify({
        metric: 'teamver_fe_auto_reload',
        ts: Date.now(),
        fromVersion,
        toVersion,
      }),
    );
  } catch {
    // structured marker is best-effort; never throw from telemetry path.
  }
}

/**
 * Embed-only — guards against the post-deploy "stale FE bundle vs fresh
 * daemon" failure mode by polling `/api/version` and reloading the SPA
 * shell when a new daemon version is observed.
 *
 * Background (user-reported, staging):
 *   After each deploy, an open browser tab kept its in-memory React app
 *   (old bundle) while the daemon swapped to a new build. The first
 *   project-mutation call into the new daemon would 502 / 4xx with codes
 *   like `teamver_project_s3_prefix_required` because the FE/daemon
 *   contract had shifted (e.g. new identity-header expectations, new
 *   register-on-404 timing). `cmd+shift+r` always recovered — that's the
 *   browser flushing its cached SPA shell and downloading the new bundle.
 *
 * Strategy:
 *   - On mount, fetch `/api/version` and remember it as the baseline.
 *   - Re-fetch on a 60s timer and whenever the tab regains visibility.
 *   - On the first observed mismatch, schedule `location.reload()` after
 *     a short delay so an in-flight network request can settle and the
 *     user can read the toast banner. The reload is deferred while the
 *     tab is hidden so we don't churn background tabs.
 *
 * Out of scope: an in-flight LLM run can still race the reload — that's
 * acceptable here because the user-reported failure mode is *already* a
 * broken run that the user is retrying manually. The auto-reload turns
 * that recovery loop into a one-time event instead.
 */
export function useTeamverAppVersionAutoReload(options?: {
  pollIntervalMs?: number;
  reloadDelayMs?: number;
  /**
   * Override the reload function (tests). Defaults to `window.location.reload`.
   * Must accept no arguments.
   */
  reload?: () => void;
}): void {
  const baselineRef = useRef<string | null>(null);
  const reloadScheduledRef = useRef(false);

  useEffect(() => {
    if (!isTeamverEmbedMode()) return;
    if (typeof window === 'undefined') return;

    const pollIntervalMs = options?.pollIntervalMs ?? VERSION_POLL_INTERVAL_MS;
    const reloadDelayMs = options?.reloadDelayMs ?? VERSION_AUTO_RELOAD_DELAY_MS;
    const reload = options?.reload ?? (() => window.location.reload());

    let cancelled = false;
    let pendingReloadHandle: ReturnType<typeof setTimeout> | null = null;

    const isTabVisible = (): boolean => {
      if (typeof document === 'undefined') return true;
      return document.visibilityState !== 'hidden';
    };

    const scheduleReload = (fromVersion: string, toVersion: string) => {
      if (reloadScheduledRef.current) return;
      reloadScheduledRef.current = true;
      emitReloadMarker(fromVersion, toVersion);
      console.info(
        `[teamver] app version changed (${fromVersion} → ${toVersion}); reloading SPA shell in ${reloadDelayMs}ms`,
      );
      pendingReloadHandle = setTimeout(() => {
        pendingReloadHandle = null;
        // Don't reload a hidden tab — wait for the user to come back so we
        // don't disrupt unrelated background work (e.g. another iframe).
        if (!isTabVisible()) {
          reloadScheduledRef.current = false;
          return;
        }
        try {
          reload();
        } catch (err) {
          console.warn('[teamver] auto-reload failed', err);
          reloadScheduledRef.current = false;
        }
      }, reloadDelayMs);
    };

    const checkVersion = async () => {
      if (cancelled || reloadScheduledRef.current) return;
      // Polling a hidden tab burns daemon RPS for nothing; the visibility
      // listener will retry the moment focus returns.
      if (!isTabVisible()) return;

      const current = await fetchCurrentAppVersion();
      if (cancelled || reloadScheduledRef.current || current == null) return;

      if (baselineRef.current == null) {
        baselineRef.current = current;
        return;
      }
      if (baselineRef.current === current) return;
      scheduleReload(baselineRef.current, current);
    };

    void checkVersion();

    const interval = setInterval(() => {
      void checkVersion();
    }, pollIntervalMs);

    const onVisibilityChange = () => {
      if (isTabVisible()) void checkVersion();
    };
    const onPageShow = () => {
      void checkVersion();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    window.addEventListener('pageshow', onPageShow);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (pendingReloadHandle != null) {
        clearTimeout(pendingReloadHandle);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      window.removeEventListener('pageshow', onPageShow);
    };
    // Hook is intentionally fire-and-forget per mount; options are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export const __TEAMVER_AUTO_RELOAD_INTERNALS = {
  fetchCurrentAppVersion,
};

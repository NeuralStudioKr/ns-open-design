import {
  TeamverClient,
  createLocalStorageWorkspaceStore,
  snakeToCamelDeep,
  AuthenticationError,
  NetworkError,
  type WorkspaceListItem,
} from "@teamver/app-sdk";
import {
  isTeamverEmbedMode,
  isBootstrapAuthMode,
  resolveTeamverDesignApiBase,
  resolveTeamverDesignApiCrossOriginFallback,
  resolveDesignBffRefreshUrl,
  prepareTeamverLoginNavigation,
} from "./designApiBase";
import { handleEmbedPassiveUnauthorized } from "./teamverEmbedPassiveAuth";
import {
  clearOrphanTeamverAuthCookies,
  isOrphanTeamverJwtAuthFailure,
} from "./teamverAuthOrphanJwt";
import { hasProbableTeamverAuthCookie } from "./teamverAuthCookieHints";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";
import {
  peekTeamverAuthReturnPending,
  isLikelyTeamverAuthReturnNavigation,
} from "./teamverAuthReturn";
import {
  acquireBffRefreshLeader,
  awaitLeaderResult,
  releaseBffRefreshLeader,
  remainingBffRefreshLeaderLockMs,
} from "./teamverBffRefreshLeader";
import { isMainSsoGateError } from "./teamverMainSsoGate";

/** Post–app-sdk shape (`snakeToCamelDeep` on `/auth/session`). */
export type DesignAuthSessionUser = {
  userId?: string;
  email?: string;
  displayName?: string;
  name?: string;
  imageUrl?: string | null;
  s3ImageUrl?: string | null;
  profileImageUrl?: string | null;
};

export type DesignAuthSession = {
  authenticated: boolean;
  authSource?: string | null;
  appKey?: string | null;
  user?: DesignAuthSessionUser | null;
  defaultWorkspaceId?: string | null;
  workspaces?: WorkspaceListItem[];
};

let cachedClient: TeamverClient | null = null;

function isSdkAuthRefreshRequest(input: Parameters<typeof fetch>[0], init?: RequestInit): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "POST") return false;
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  try {
    const parsed =
      typeof window !== "undefined"
        ? new URL(rawUrl, window.location.href)
        : new URL(rawUrl);
    return parsed.pathname.endsWith("/auth/refresh");
  } catch {
    return rawUrl.endsWith("/auth/refresh");
  }
}

const DESIGN_BFF_SDK_REFRESH_DISABLED_RESPONSE = JSON.stringify({
  error: { code: "design_sdk_auth_refresh_disabled" },
});

function fetchDesignBffSdk(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  if (isSdkAuthRefreshRequest(input, init)) {
    return Promise.resolve(
      new Response(DESIGN_BFF_SDK_REFRESH_DISABLED_RESPONSE, {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return fetch(input, init);
}

export function getDesignBffClient(): TeamverClient | null {
  if (!isTeamverEmbedMode()) return null;
  const base = resolveTeamverDesignApiBase();
  if (base === null) return null;
  if (!cachedClient) {
    const apiBaseUrl = base === "" ? "/teamver-bff" : `${base}/api/v1`;
    cachedClient = new TeamverClient({
      apiBaseUrl,
      refreshUrl: resolveDesignBffRefreshUrl(),
      appKey: "design",
      tokenStore: null,
      workspaceStore: createLocalStorageWorkspaceStore({
        activeKey: "teamver_design_active_workspace_id",
        lastByUserKey: "teamver_design_last_workspace_by_user",
      }),
      withCredentials: true,
      fetch: fetchDesignBffSdk,
      onAuthExpired: () => {
        // Do not prepareDesignAuthSessionReload() here — that clears session
        // caches before we know recovery failed, and looks like a spontaneous
        // logout ("teamver Design 불러오는 중…"). Cache prep runs only when
        // passive auth actually redirects to Main sign-in.
        handleEmbedPassiveUnauthorized("bff");
      },
    });
  }
  return cachedClient;
}

export const TEAMVER_BFF_REQUEST_OPTIONS = {
  skipAuthHeader: true,
  // Design embed handles cookie refresh explicitly via refreshDesignAuthCookie().
  // Keep SDK auto-recovery off so ordinary BFF 401s do not spam
  // /teamver-bff/auth/refresh or redirect before the embed auth layer decides.
  skipAuthRecovery: true,
} as const;

const SESSION_PROBE_OPTIONS = TEAMVER_BFF_REQUEST_OPTIONS;

async function postAuthRefresh(
  url: string,
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    let bodyText = "";
    try {
      bodyText = typeof response.text === "function" ? await response.text() : "";
    } catch {
      bodyText = "";
    }
    return { ok: response.ok, status: response.status, bodyText };
  } catch {
    return { ok: false, status: 0, bodyText: "" };
  }
}

/** Match daemon / Drive HA Set-Cookie settle delay. */
const DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS = 400;

/**
 * Cross-tab-coordinated POST /auth/refresh.
 *
 * `_refresh_apps_tokens_coalesced` on the BE is a single-process cache; two
 * tabs on the same origin can each race Main `/api/apps/auth/refresh` with
 * the same rotating refresh_token — one wins the rotation, the other lands
 * in soft sticky decline. We elect a leader via
 * `acquireBffRefreshLeader()` (`localStorage` + `BroadcastChannel`):
 *
 * - **Leader** — POSTs `/auth/refresh` and broadcasts the outcome.
 * - **Follower** — waits `LEADER_WAIT_MS` for the leader's broadcast. On
 *   success it verifies via `probe` / `ensure` and reuses the sibling's
 *   Set-Cookie. On hard 400 it stops early. On timeout / unverifiable
 *   success it falls back to its own POST so a stuck leader cannot
 *   permanently block recovery.
 */
async function postAuthRefreshCoordinated(
  url: string,
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const role = acquireBffRefreshLeader();
  if (role === "follower") {
    const applyObserved = async (
      observed: { ok: boolean; status: number },
    ): Promise<{ ok: boolean; status: number; bodyText: string } | null> => {
      if (observed.ok) {
        // Peer Set-Cookie may still be settling across ALB — brief delay before
        // probe/ensure so we do not fall through into a duplicate POST.
        await new Promise((resolve) =>
          setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS),
        );
        if (
          (await probeDesignBffSessionAuthenticated())
          || (await ensureDesignBffSessionAuthenticated())
        ) {
          return { ok: true, status: observed.status || 200, bodyText: "" };
        }
        await new Promise((resolve) =>
          setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS),
        );
        if (
          (await probeDesignBffSessionAuthenticated())
          || (await ensureDesignBffSessionAuthenticated())
        ) {
          return { ok: true, status: observed.status || 200, bodyText: "" };
        }
        // Peer already rotated Main refresh — do not POST again; soft sticky
        // + later probe/ensure will pick up the sibling cookie.
        return { ok: false, status: 401, bodyText: "" };
      }
      if (observed.status === 400) {
        if (
          (await probeDesignBffSessionAuthenticated())
          || (await ensureDesignBffSessionAuthenticated())
        ) {
          return { ok: true, status: 200, bodyText: "" };
        }
        return { ok: false, status: 400, bodyText: "" };
      }
      return null;
    };

    let observed = await awaitLeaderResult();
    if (observed) {
      const applied = await applyObserved(observed);
      if (applied) return applied;
      // Peer ok but cookie not visible yet — fall through only if lock gone.
    }
    // Primary wait timed out (or peer ok unverifiable). If lock still held,
    // extend once for the remaining TTL instead of racing Main refresh.
    const remaining = remainingBffRefreshLeaderLockMs();
    if (remaining > 50) {
      observed = await awaitLeaderResult(Math.min(remaining + 200, 1_500));
      if (observed) {
        const applied = await applyObserved(observed);
        if (applied) return applied;
      }
    }
    // Lock expired / no broadcast — fall through to our own POST.
  }
  const result = await postAuthRefresh(url);
  releaseBffRefreshLeader({ ok: result.ok, status: result.status });
  return result;
}

function resolveDesignBffSessionUrl(): string {
  return resolveDesignBffRefreshUrl().replace(/\/auth\/refresh\/?$/, "/auth/session");
}

function resolveDesignBffSessionProbeUrl(): string {
  return resolveDesignBffRefreshUrl().replace(/\/auth\/refresh\/?$/, "/auth/session-probe");
}

/**
 * Read-only session check for sticky-decline / re-login gates.
 * Uses `/auth/session-probe` ONLY (no ensure/refresh side effects).
 *
 * WARNING: When access is past absolute expiry, probe returns false even if
 * refresh_token can still revive the session. Soft-sticky recovery must escalate
 * to {@link ensureDesignBffSessionAuthenticated} / POST refresh — not probe alone.
 *
 * When the probe endpoint returns 404 (older/misconfigured nginx without the
 * public `session-probe` location) we deliberately return `false` instead of
 * falling back to `/auth/session`: that fallback triggers `ensure_bff_session`
 * on design-api, which can rotate cookies via a Main `/auth/refresh` call —
 * defeating the purpose of a read-only probe and causing cross-tab HA rotation
 * races when the caller was gating on "is the session still alive".
 */
export async function probeDesignBffSessionAuthenticated(): Promise<boolean> {
  try {
    const probeResponse = await fetch(resolveDesignBffSessionProbeUrl(), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    // design-api session-probe: 204 = valid BFF session, 401 = expired.
    if (probeResponse.status === 204) return true;
    if (probeResponse.status === 401 || probeResponse.status === 403) return false;
    if (probeResponse.ok) {
      // Tests / transitional proxies may return JSON; prefer authenticated flag.
      const body = (await probeResponse.json().catch(() => null)) as {
        authenticated?: unknown;
      } | null;
      if (body && typeof body === "object" && "authenticated" in body) {
        return body.authenticated === true;
      }
    }

    // 404 / other unknown status → treat as "cannot confirm alive" without
    // triggering ensure. Callers that need to actually refresh will escalate
    // to ensureDesignBffSessionAuthenticated on the next ladder rung.
    return false;
  } catch {
    return false;
  }
}

/**
 * GET `/auth/session` — runs `ensure_bff_session` on design-api so near/past-skew
 * access can refresh with Set-Cookie on the main response (unlike session-probe).
 */
export async function ensureDesignBffSessionAuthenticated(): Promise<boolean> {
  try {
    const response = await fetch(resolveDesignBffSessionUrl(), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { authenticated?: unknown };
    return body.authenticated === true;
  } catch {
    return false;
  }
}

let authRefreshDeclinedForSession = false;
/**
 * soft (401): HA race — later GET /auth/session may recover without POST refresh.
 * hard (400): account/malformed — do not keep probing session (ensure can re-hit Main).
 */
let authRefreshDeclineKind: "none" | "soft" | "hard" = "none";
let unauthenticatedRefreshAttempted = false;
/** Allows BFF refresh retry on sign-in return. */
let authRecoveryRefreshActive = false;
/** One-shot load recovery — pending flag / referrer must not stick across probes. */
let embedAuthRecoveryLoadUsed = false;
/** Coalesce parallel refreshDesignAuthCookie() from Drive modal burst. */
let inFlightAuthRefresh: Promise<boolean> | null = null;
/**
 * After refresh 401 + live session, suppress further POST /auth/refresh briefly
 * so HA races do not rotate tokens in a loop. Probe/ensure still allowed; if
 * those fail, suppress is broken so one POST can revive expired access.
 */
const DESIGN_BFF_REFRESH_POST_SUPPRESS_MS = 30_000;
let authRefreshPostSuppressedUntil = 0;
/**
 * Soft sticky must not permanently block POST when access is expired but
 * refresh_token is valid (nginx auth_request returns 401 until FE refreshes).
 * Cooldown limits Main refresh spam while session is truly dead.
 */
const DESIGN_BFF_SOFT_FORCE_POST_COOLDOWN_MS = 15_000;
let authRefreshSoftForcePostAt = 0;
/**
 * After soft/hard sticky, survival probe/ensure ladders must not re-run on every
 * C1/passive/daemon 401 — that spams GET /auth/session-probe. Soft `mark…Declined`
 * seeds attempts=1 (decline-time ladder already probed); hard leaves attempts=0
 * so the first `tryHardStickySurvival` still probes. Later calls within this
 * cooldown skip the ladder (soft may still force-POST under its own cooldown).
 */
const DESIGN_BFF_STICKY_SURVIVAL_PROBE_COOLDOWN_MS = 60_000;
let authRefreshStickySurvivalProbeAt = 0;
let authRefreshStickySurvivalLastOk = false;
let authRefreshStickySurvivalAttempts = 0;

/** @internal vitest */
export function resetDesignAuthRefreshDeclinedForTests(): void {
  authRefreshDeclinedForSession = false;
  authRefreshDeclineKind = "none";
  unauthenticatedRefreshAttempted = false;
  authRecoveryRefreshActive = false;
  embedAuthRecoveryLoadUsed = false;
  inFlightAuthRefresh = null;
  authRefreshPostSuppressedUntil = 0;
  authRefreshSoftForcePostAt = 0;
  authRefreshStickySurvivalProbeAt = 0;
  authRefreshStickySurvivalLastOk = false;
  authRefreshStickySurvivalAttempts = 0;
}

function resolveAuthRecoveryLoad(options?: FetchDesignAuthSessionOptions): boolean {
  if (options?.resetRefreshState) {
    embedAuthRecoveryLoadUsed = true;
    return true;
  }
  if (embedAuthRecoveryLoadUsed) return false;
  // Peek only — pending must survive an early unauthenticated probe so login
  // redirect defer still works. One-shot is tracked by embedAuthRecoveryLoadUsed.
  const recovery =
    peekTeamverAuthReturnPending() || isLikelyTeamverAuthReturnNavigation();
  if (recovery) embedAuthRecoveryLoadUsed = true;
  return recovery;
}

function setAuthRecoveryRefreshActive(active: boolean): void {
  authRecoveryRefreshActive = active;
}

function resetDesignAuthRefreshDeclined(): void {
  authRefreshDeclinedForSession = false;
  authRefreshDeclineKind = "none";
  authRefreshStickySurvivalProbeAt = 0;
  authRefreshStickySurvivalLastOk = false;
  authRefreshStickySurvivalAttempts = 0;
  // Sticky clear means a recovery path may succeed — allow runtime-config again.
  runtimeConfigAuthBlocked = false;
}

function noteAuthRefreshPostSuppressed(): void {
  authRefreshPostSuppressedUntil = Date.now() + DESIGN_BFF_REFRESH_POST_SUPPRESS_MS;
}

function markAuthRefreshDeclined(kind: "soft" | "hard"): void {
  authRefreshDeclinedForSession = true;
  authRefreshDeclineKind = kind;
  // Dead refresh credentials: never probe nginx-gated runtime-config until
  // sticky is cleared. Do not wait for a 401 on /runtime-config itself.
  runtimeConfigAuthBlocked = true;
  // Drop warm /auth/session cache so focus force:false cannot keep serving
  // authenticated=true without a live cookie (DevTools 401 storms).
  cachedSession = null;
  if (kind === "soft") {
    // Soft 401 path already ran probe×2+ensure (+ the failing POST). Seed both
    // survival and force-POST cooldowns so the next soft recovery (daemon,
    // registry, Drive, passive) does not immediately re-spam refresh/probe.
    authRefreshStickySurvivalProbeAt = Date.now();
    authRefreshStickySurvivalLastOk = false;
    authRefreshStickySurvivalAttempts = 1;
    authRefreshSoftForcePostAt = Date.now();
  }
  // Hard 400: no prior probe ladder — leave survival counters at 0 so the
  // first tryHardStickySurvival can still detect a sibling Set-Cookie.
}

/** True when sticky decline or logged-out memory should skip BFF/daemon auth ladders. */
export function shouldSkipTeamverBffAuthCalls(): boolean {
  // Soft + hard sticky: C1 / 「다시 시도」 own recovery. Soft used to stay open
  // for S3-prefix BFF reads, but that re-opened withDesignBffCookieAuthRecovery
  // 401×2 storms (usage/publish/preview/billing). Prefix is cache-only while
  // declined; miss fails soft until sticky clears.
  if (isDesignAuthRefreshDeclined()) return true;
  if (isTeamverEmbedMode() && !isTeamverEmbedSessionAuthenticated()) return true;
  return false;
}

/** Public clear for daemon/Drive soft-retry recovery paths. */
export function clearDesignAuthRefreshDecline(): void {
  resetDesignAuthRefreshDeclined();
}

/** True when sticky decline is hard (400) — Drive must not resetRefreshState. */
export function isDesignAuthRefreshDeclineHard(): boolean {
  return authRefreshDeclinedForSession && authRefreshDeclineKind === "hard";
}

function shouldAttemptCookieRefresh(): boolean {
  if (authRefreshDeclinedForSession) return false;
  if (isBootstrapAuthMode()) {
    return authRecoveryRefreshActive || isTeamverEmbedSessionAuthenticated();
  }
  if (hasProbableTeamverAuthCookie() || isTeamverEmbedSessionAuthenticated()) return true;
  return !unauthenticatedRefreshAttempted;
}

function isDesignBffUnauthorizedStatus(err: unknown): boolean {
  // SDK maps HTTP 401 → AuthenticationError (status:401). NetworkError is for
  // transport failures; tests may still throw NetworkError({ status: 401 }).
  // Duck-type on `status` so partial SDK mocks (missing AuthenticationError
  // export) still recover correctly.
  if (!(err instanceof Error)) return false;
  return (err as { status?: unknown }).status === 401;
}

/** Cookie-only SSO: retry a BFF request once after refresh (tokenStore is null). */
export async function withDesignBffCookieAuthRecovery<T>(
  request: () => Promise<T>,
): Promise<T> {
  // Soft/hard sticky: do not even hit the BFF — callers that forgot
  // shouldSkipTeamverBffAuthCalls used to produce one 401 per call.
  if (authRefreshDeclinedForSession) {
    throw new AuthenticationError({ status: 401, message: "session_expired" });
  }
  try {
    return await request();
  } catch (err) {
    if (!isDesignBffUnauthorizedStatus(err)) throw err;

    // Main HS256 SSO gate — Apps refresh cannot mint/fix Main cookies.
    // Mismatch recovery is started by driveApi / handleTeamverDriveAuthFailure /
    // callers; do not Apps-refresh here.
    if (isMainSsoGateError(err)) throw err;

    // Soft/hard sticky owns recovery via C1 / explicit retry. Do not
    // delay-retry the sibling GET — that doubled 401 noise on every usage /
    // publish / preview caller that missed shouldSkipTeamverBffAuthCalls.
    if (authRefreshDeclinedForSession) {
      throw err;
    }

    const refreshed = await refreshDesignAuthCookie();
    if (refreshed) {
      try {
        return await request();
      } catch (postRefreshErr) {
        // Refresh succeeded but nginx auth_request/handler still 401. Access
        // may have been rotated on the losing ALB node — give the browser a
        // beat to apply the sibling Set-Cookie, then retry once more.
        if (!isDesignBffUnauthorizedStatus(postRefreshErr)) throw postRefreshErr;
        await new Promise((resolve) =>
          setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS),
        );
        try {
          return await request();
        } catch (secondErr) {
          // Second retry after refresh still failed. If ensure /auth/session
          // now returns authenticated (Set-Cookie on main response revived
          // access), give the request one final shot before giving up.
          if (!isDesignBffUnauthorizedStatus(secondErr)) throw secondErr;
          if (await ensureDesignBffSessionAuthenticated()) {
            resetDesignAuthRefreshDeclined();
            noteAuthRefreshPostSuppressed();
            return await request();
          }
          throw secondErr;
        }
      }
    }

    // Refresh failed (often soft-sticky now). Soft sticky owns recovery via C1 —
    // do not delay-retry the doomed sibling GET (extra nginx 401). HA sibling
    // cookies are picked up by sticky-quiet probe / explicit retry instead.
    if (authRefreshDeclinedForSession) {
      throw err;
    }

    await new Promise((resolve) => setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS));
    try {
      const recovered = await request();
      resetDesignAuthRefreshDeclined();
      return recovered;
    } catch (retryErr) {
      if (!isDesignBffUnauthorizedStatus(retryErr)) throw retryErr;
      if (authRefreshDeclinedForSession) throw retryErr;
      // Access-expired case (no sticky yet): ensure /auth/session can Set-Cookie.
      if (await ensureDesignBffSessionAuthenticated()) {
        resetDesignAuthRefreshDeclined();
        noteAuthRefreshPostSuppressed();
        try {
          return await request();
        } catch (postEnsureErr) {
          if (!isDesignBffUnauthorizedStatus(postEnsureErr)) throw postEnsureErr;
          throw postEnsureErr;
        }
      }
      throw retryErr;
    }
  }
}

/** Default age before proactive refresh ahead of mutating daemon routes. */
export const TEAMVER_EMBED_PROACTIVE_AUTH_REFRESH_MS = 2 * 60 * 1000;

/**
 * Refresh BFF cookies before a mutating daemon call when a long-running turn
 * may have outlived the nginx auth_request access token.
 */
export async function refreshTeamverEmbedAuthBeforeMutating(options?: {
  activityStartedAt?: number;
  minAgeMs?: number;
}): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (!isBootstrapAuthMode() && !isTeamverEmbedSessionAuthenticated()) return;
  // Soft/hard sticky: C1 / explicit retry owns recovery — do not POST from
  // every long-turn mutating daemon call.
  if (authRefreshDeclinedForSession) return;
  const minAgeMs = options?.minAgeMs ?? TEAMVER_EMBED_PROACTIVE_AUTH_REFRESH_MS;
  const startedAt = options?.activityStartedAt;
  if (startedAt != null && Date.now() - startedAt < minAgeMs) return;
  await refreshDesignAuthCookie();
}

async function trySoftStickyRecovery(options?: {
  /** When false (default for soft-sticky background), skip all survival network. */
  allowForcePost?: boolean;
}): Promise<boolean> {
  // Background callers (Drive/daemon refresh without allowSoftForcePost): C1
  // sticky-quiet probe and explicit escalate/「다시 시도」 own recovery. Do not
  // re-open probe×2+ensure after the 60s survival window from every refresh().
  if (!options?.allowForcePost) {
    return false;
  }

  authRefreshStickySurvivalAttempts += 1;
  const skipProbeLadder =
    authRefreshStickySurvivalAttempts > 1
    && Date.now() - authRefreshStickySurvivalProbeAt
      < DESIGN_BFF_STICKY_SURVIVAL_PROBE_COOLDOWN_MS
    && !authRefreshStickySurvivalLastOk;

  const clearSoftAfterConfirmedSession = async (): Promise<boolean> => {
    // ensure may Set-Cookie after absolute access expiry, but stale-grace
    // authenticated:true alone must not clear sticky (nginx still dead →
    // runtime-config 401 + refresh/probe storm). Match quiet hydrate: probe
    // live + authenticated session JSON before clear.
    await ensureDesignBffSessionAuthenticated();
    if (!(await probeDesignBffSessionAuthenticated())) return false;
    const client = getDesignBffClient();
    if (!client) return false;
    try {
      const value = await probeDesignAuthSession(client);
      if (!value.authenticated) return false;
    } catch {
      return false;
    }
    authRefreshStickySurvivalLastOk = true;
    resetDesignAuthRefreshDeclined();
    noteAuthRefreshPostSuppressed();
    return true;
  };

  if (!skipProbeLadder) {
    authRefreshStickySurvivalProbeAt = Date.now();
    // 1) Cheap read-only probe (sibling Set-Cookie may already be live).
    if (await probeDesignBffSessionAuthenticated()) {
      if (await clearSoftAfterConfirmedSession()) return true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS));
      if (await probeDesignBffSessionAuthenticated()) {
        if (await clearSoftAfterConfirmedSession()) return true;
      }
    }

    // 2) ensure via GET /auth/session — can refresh + Set-Cookie on the main response.
    //    session-probe alone cannot revive absolute-expired access.
    if (await clearSoftAfterConfirmedSession()) return true;
    authRefreshStickySurvivalLastOk = false;
  }

  // 3) One POST /auth/refresh under cooldown (allowForcePost already required).
  const now = Date.now();
  if (now - authRefreshSoftForcePostAt < DESIGN_BFF_SOFT_FORCE_POST_COOLDOWN_MS) {
    return false;
  }
  authRefreshSoftForcePostAt = now;
  const bffResult = await postAuthRefreshCoordinated(resolveDesignBffRefreshUrl());
  if (bffResult.ok) {
    if (await clearSoftAfterConfirmedSession()) {
      authRefreshPostSuppressedUntil = 0;
      return true;
    }
    authRefreshStickySurvivalLastOk = false;
    return false;
  }
  if (await clearSoftAfterConfirmedSession()) return true;
  // Force-POST already failed and ensure just failed — do not leave a stale
  // "try ensure again" expectation for the next 15s window.
  authRefreshStickySurvivalLastOk = false;
  return false;
}

async function tryHardStickySurvival(): Promise<boolean> {
  authRefreshStickySurvivalAttempts += 1;
  const skipProbe =
    authRefreshStickySurvivalAttempts > 1
    && Date.now() - authRefreshStickySurvivalProbeAt
      < DESIGN_BFF_STICKY_SURVIVAL_PROBE_COOLDOWN_MS
    && !authRefreshStickySurvivalLastOk;
  if (skipProbe) return false;

  authRefreshStickySurvivalProbeAt = Date.now();
  // Hard sticky: probe only — ensure /auth/session can re-hit Main refresh.
  if (await probeDesignBffSessionAuthenticated()) {
    authRefreshStickySurvivalLastOk = true;
    return true;
  }
  authRefreshStickySurvivalLastOk = false;
  return false;
}

export type RefreshDesignAuthCookieOptions = {
  /**
   * Soft sticky: allow one cooldown-gated POST /auth/refresh.
   * Default false — background polls must not re-open refresh/probe storms.
   * Pass true from C1 escalate and explicit 「다시 시도」 only.
   */
  allowSoftForcePost?: boolean;
};

/** BFF silent refresh via design-api (Apps JWT stored server-side). */
export async function refreshDesignAuthCookie(
  options?: RefreshDesignAuthCookieOptions,
): Promise<boolean> {
  if (inFlightAuthRefresh) return inFlightAuthRefresh;

  const run = (async (): Promise<boolean> => {
    // Soft sticky (401) must not be terminal for the tab lifetime.
    // Hard sticky (400): never POST again, but a live probe/ensure means the
    // cookie still works (HA false-400 / sibling winner) — treat as recovered
    // without clearing hard until explicit reset (avoids 400 spam).
    if (authRefreshDeclinedForSession) {
      if (authRefreshDeclineKind === "hard") {
        return await tryHardStickySurvival();
      }
      return await trySoftStickyRecovery({
        allowForcePost: options?.allowSoftForcePost === true,
      });
    }

    // Refresh 401 + live session: suppress POST spam while access still works.
    // If probe fails (access expired during suppress), break suppress and POST.
    if (authRefreshPostSuppressedUntil > Date.now()) {
      if (await probeDesignBffSessionAuthenticated()) return true;
      if (await ensureDesignBffSessionAuthenticated()) {
        noteAuthRefreshPostSuppressed();
        return true;
      }
      authRefreshPostSuppressedUntil = 0;
    }

    if (!shouldAttemptCookieRefresh()) return false;

    const isBareAttempt =
      !isTeamverEmbedSessionAuthenticated() &&
      !isBootstrapAuthMode() &&
      !hasProbableTeamverAuthCookie();
    if (isBareAttempt) {
      unauthenticatedRefreshAttempted = true;
    }

    const bffResult = await postAuthRefreshCoordinated(resolveDesignBffRefreshUrl());
    if (bffResult.ok) {
      resetDesignAuthRefreshDeclined();
      authRefreshPostSuppressedUntil = 0;
      return true;
    }
    if (bffResult.status === 401) {
      // HA rotation race: losing node returns 401 while access is still usable
      // and a sibling may already have Set-Cookie'd a fresh session. Probe /
      // ensure before sticky-declining.
      if (await probeDesignBffSessionAuthenticated()) {
        noteAuthRefreshPostSuppressed();
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS));
      if (await probeDesignBffSessionAuthenticated()) {
        noteAuthRefreshPostSuppressed();
        return true;
      }
      if (await ensureDesignBffSessionAuthenticated()) {
        noteAuthRefreshPostSuppressed();
        return true;
      }
      markAuthRefreshDeclined("soft");
      if (isOrphanTeamverJwtAuthFailure(bffResult.status, bffResult.bodyText)) {
        console.info(
          '[teamver] auth: orphan JWT detected on BFF refresh; clearing Main BE cookie',
          { status: bffResult.status },
        );
        void clearOrphanTeamverAuthCookies();
      }
      return false;
    }
    if (bffResult.status === 400) {
      // Account missing / malformed refresh — hard sticky without POST spam.
      // Later refreshDesignAuthCookie calls may probe/ensure for survival (§14 M3)
      // but must not POST /auth/refresh until resetRefreshState / sign-in.
      markAuthRefreshDeclined("hard");
      if (isOrphanTeamverJwtAuthFailure(bffResult.status, bffResult.bodyText)) {
        console.info(
          '[teamver] auth: orphan JWT detected on BFF refresh; clearing Main BE cookie',
          { status: bffResult.status },
        );
        void clearOrphanTeamverAuthCookies();
      }
    }
    return false;
  })();

  inFlightAuthRefresh = run.finally(() => {
    inFlightAuthRefresh = null;
  });
  return inFlightAuthRefresh;
}

/** Sign-in / post-login return — bust caches so the next probe is not stale. */
export function prepareDesignAuthSessionReload(): void {
  prepareTeamverLoginNavigation();
  resetDesignAuthRefreshState();
  invalidateDesignAuthSessionCache();
}

/**
 * Sticky 400/401 guard reset — only for events that legitimately indicate auth
 * state may have changed (post sign-in return, explicit user retry, or a fresh
 * cookie hint appearing). Visibility/focus alone must NOT call this, otherwise
 * `/teamver-bff/auth/refresh` keeps spamming 400 on every tab switch when the
 * underlying account is missing/deleted.
 */
export function resetDesignAuthRefreshState(): void {
  resetDesignAuthRefreshDeclined();
  unauthenticatedRefreshAttempted = false;
  embedAuthRecoveryLoadUsed = false;
  authRefreshPostSuppressedUntil = 0;
  authRefreshSoftForcePostAt = 0;
}

/** Sticky 400 from `/teamver-bff/auth/refresh` — UI may offer explicit retry. */
export function isDesignAuthRefreshDeclined(): boolean {
  return authRefreshDeclinedForSession;
}

/**
 * Re-allow a single HttpOnly-only refresh attempt (cross-tab login) without
 * clearing the sticky 400 decline guard.
 */
export function resetDesignAuthBareRefreshAttempt(): void {
  unauthenticatedRefreshAttempted = false;
}

function normalizeDesignAuthSession(raw: unknown): DesignAuthSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.authenticated !== "boolean") return null;
  return raw as DesignAuthSession;
}

async function probeDesignAuthSession(client: TeamverClient): Promise<DesignAuthSession> {
  const raw = await client.http.get<unknown>("/auth/session", SESSION_PROBE_OPTIONS);
  const session = normalizeDesignAuthSession(raw);
  if (session) return session;
  throw new NetworkError({
    status: 404,
    message: "Invalid session response (expected JSON from design-api BFF)",
  });
}

function shouldUseDesignApiSessionFallback(err: unknown): boolean {
  if (!(err instanceof NetworkError)) return false;
  return err.status === 0 || err.status === 404 || err.status === 502;
}

async function fetchDesignAuthSessionCrossOriginFallback(): Promise<DesignAuthSession | null> {
  const origin = resolveTeamverDesignApiCrossOriginFallback();
  if (!origin) return null;
  const url = `${origin.replace(/\/+$/, "")}/api/v1/auth/session`;
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return normalizeDesignAuthSession(snakeToCamelDeep(body));
  } catch {
    return null;
  }
}

export type FetchDesignAuthSessionOptions = {
  /** Bypass short-lived cache — tab focus / explicit re-auth. */
  force?: boolean;
  /**
   * Clear sticky refresh-decline markers before probing. Use only for events
   * that justify retrying a previously-declined refresh (explicit user retry,
   * post sign-in return). Auto-refresh on visibility/focus must leave this
   * unset, otherwise a 400 from `/teamver-bff/auth/refresh` (e.g. deleted
   * account) repeats on every tab switch.
   */
  resetRefreshState?: boolean;
};

let inFlightSession: Promise<DesignAuthSession | null> | null = null;
let cachedSession: { value: DesignAuthSession | null; at: number } | null = null;
const SESSION_CACHE_MS = 60_000;
/** Grace window for returning last-known-good session after transient probe failures. */
const STALE_SESSION_GRACE_MS = 15 * 60_000;

function peekAuthenticatedSessionCache(maxAgeMs: number): DesignAuthSession | null {
  if (!cachedSession?.value?.authenticated) return null;
  if (Date.now() - cachedSession.at > maxAgeMs) return null;
  return cachedSession.value;
}

function isTransientSessionProbeError(err: unknown): boolean {
  // SDK maps HTTP 401 → AuthenticationError (not NetworkError). Duck-type status
  // so dead-cookie 401s never promote a 15m stale authenticated session.
  if (err instanceof Error) {
    const status = Number((err as { status?: unknown }).status);
    if (status === 401 || status === 403) return false;
  }
  if (!(err instanceof NetworkError)) return true;
  const status = err.status ?? 0;
  return status === 0 || status >= 500 || status === 502 || status === 503 || status === 504;
}

/** @internal vitest */
export function resetDesignAuthSessionCacheForTests(): void {
  inFlightSession = null;
  cachedSession = null;
}

/**
 * Clear the short-lived `/auth/session` cache so the next probe re-hits the
 * BFF. Decline markers (`authRefreshDeclinedForSession`,
 * `unauthenticatedRefreshAttempted`) are **intentionally preserved** — see
 * `resetDesignAuthRefreshState` for the explicit reset path used by sign-in
 * return, user retry button, and "new cookie hint detected".
 */
export function invalidateDesignAuthSessionCache(): void {
  cachedSession = null;
}

/** Session snapshot metadata for workspace store reconciliation (loop 425). */
export function readCachedDesignAuthSessionMeta(): {
  fetchedAt: number;
  defaultWorkspaceId: string | null;
} | null {
  if (!cachedSession?.value?.authenticated) return null;
  const defaultWorkspaceId = (cachedSession.value.defaultWorkspaceId ?? "").trim() || null;
  return { fetchedAt: cachedSession.at, defaultWorkspaceId };
}

async function loadDesignAuthSessionOnce(): Promise<DesignAuthSession | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  const loadSession = async (): Promise<DesignAuthSession> => {
    try {
      return await probeDesignAuthSession(client);
    } catch (err) {
      if (shouldUseDesignApiSessionFallback(err)) {
        const fallback = await fetchDesignAuthSessionCrossOriginFallback();
        if (fallback) return fallback;
      }
      throw err;
    }
  };

  const loadWithAuthRecovery = (): Promise<DesignAuthSession> =>
    withDesignBffCookieAuthRecovery(loadSession);

  let session = await loadWithAuthRecovery();
  if (session.authenticated) return session;

  // Plan B cookie SSO — only when refresh credentials may exist (skip bare 400 spam).
  if (shouldAttemptCookieRefresh()) {
    const refreshed = await refreshDesignAuthCookie();
    if (refreshed) {
      session = await loadWithAuthRecovery();
      if (session.authenticated) return session;
    }
  }

  return session;
}

export async function fetchDesignAuthSession(
  options?: FetchDesignAuthSessionOptions,
): Promise<DesignAuthSession | null> {
  const force = options?.force ?? false;
  const recoveryLoad = resolveAuthRecoveryLoad(options);

  if (options?.resetRefreshState) {
    resetDesignAuthRefreshState();
  }

  setAuthRecoveryRefreshActive(recoveryLoad);

  // Soft/hard sticky + no explicit reset (C1 / focus): never hydrate via
  // loadDesignAuthSessionOnce (cookie recovery) while declined — clearing soft
  // before hydrate re-opened POST /auth/refresh storms. Probe first; bare GET
  // /auth/session hydrate; soft clears only after authenticated===true. Hard
  // keeps decline.
  if (authRefreshDeclinedForSession) {
    if (inFlightSession) {
      return inFlightSession;
    }
    const runStickyQuiet = async (): Promise<DesignAuthSession | null> => {
      try {
        if (!(await probeDesignBffSessionAuthenticated())) {
          cachedSession = null;
          return null;
        }
        const client = getDesignBffClient();
        if (!client) return null;
        let value: DesignAuthSession;
        try {
          // Bare ensure hydrate — no withDesignBffCookieAuthRecovery.
          value = await probeDesignAuthSession(client);
        } catch {
          cachedSession = null;
          return null;
        }
        if (!value.authenticated) {
          cachedSession = null;
          return value;
        }
        if (authRefreshDeclineKind === "soft") {
          resetDesignAuthRefreshDeclined();
        }
        cachedSession = { value, at: Date.now() };
        return value;
      } catch (err) {
        const stale = peekAuthenticatedSessionCache(STALE_SESSION_GRACE_MS);
        if (stale && isTransientSessionProbeError(err)) {
          return stale;
        }
        throw err;
      }
    };
    inFlightSession = runStickyQuiet().finally(() => {
      inFlightSession = null;
      setAuthRecoveryRefreshActive(false);
    });
    return inFlightSession;
  }

  if (force) {
    invalidateDesignAuthSessionCache();
    if (inFlightSession) {
      await inFlightSession.catch(() => null);
    }
  } else if (inFlightSession) {
    return inFlightSession;
  }

  if (
    !force &&
    cachedSession &&
    Date.now() - cachedSession.at < SESSION_CACHE_MS
  ) {
    return cachedSession.value;
  }

  const run = async (): Promise<DesignAuthSession | null> => {
    try {
      const value = await loadDesignAuthSessionOnce();
      if (value?.authenticated) {
        cachedSession = { value, at: Date.now() };
      } else {
        cachedSession = null;
      }
      return value;
    } catch (err) {
      const stale = peekAuthenticatedSessionCache(STALE_SESSION_GRACE_MS);
      if (stale && isTransientSessionProbeError(err)) {
        return stale;
      }
      throw err;
    }
  };

  inFlightSession = run().finally(() => {
    inFlightSession = null;
    setAuthRecoveryRefreshActive(false);
  });
  return inFlightSession;
}

export type FetchTeamverRuntimeConfigOptions = {
  /** Bypass short-lived cache — workspace switch / explicit reload. */
  force?: boolean;
};

let runtimeConfigInflight: Promise<TeamverRuntimeConfigResponse | null> | null = null;
let cachedRuntimeConfig: { value: TeamverRuntimeConfigResponse | null; at: number } | null = null;
/**
 * After a 401/session_expired on `/runtime-config`, skip opportunistic refetches
 * (visibility/pageshow) until embed session is authenticated again. Avoids
 * DevTools spam when BFF cookie is dead but the tab keeps refocusing.
 * See docs-teamver/43_runtime_config_visibility_401.md.
 */
let runtimeConfigAuthBlocked = false;
const RUNTIME_CONFIG_CACHE_MS = 60_000;
function noteRuntimeConfigUnauthorized(): void {
  runtimeConfigAuthBlocked = true;
}

/** Clear 401 backoff — called when embed session becomes authenticated. */
export function clearTeamverRuntimeConfigAuthBlock(): void {
  runtimeConfigAuthBlocked = false;
}

/** True after /runtime-config 401 or sticky refresh decline. */
export function isTeamverRuntimeConfigAuthBlocked(): boolean {
  return runtimeConfigAuthBlocked || isDesignAuthRefreshDeclined();
}

/** @internal vitest */
export function resetTeamverRuntimeConfigCacheForTests(): void {
  runtimeConfigInflight = null;
  cachedRuntimeConfig = null;
  runtimeConfigAuthBlocked = false;
}

export async function fetchTeamverRuntimeConfig(
  options?: FetchTeamverRuntimeConfigOptions,
): Promise<TeamverRuntimeConfigResponse | null> {
  const force = options?.force ?? false;

  // Session gate: unauthenticated embed must not hit nginx auth_request (401).
  if (isTeamverEmbedMode() && !isTeamverEmbedSessionAuthenticated()) {
    return null;
  }

  // Dead cookie / sticky decline: never hit nginx or cookie recovery ladders
  // (including force=true from App session-changed) until sticky is cleared by
  // a successful auth path — otherwise workspace/re-login spam keeps 401ing.
  if (runtimeConfigAuthBlocked || isDesignAuthRefreshDeclined()) {
    return cachedRuntimeConfig?.value ?? null;
  }

  if (!force && runtimeConfigInflight) return runtimeConfigInflight;
  if (
    !force &&
    cachedRuntimeConfig &&
    Date.now() - cachedRuntimeConfig.at < RUNTIME_CONFIG_CACHE_MS
  ) {
    return cachedRuntimeConfig.value;
  }

  const client = getDesignBffClient();
  if (!client) return null;

  const run = (async (): Promise<TeamverRuntimeConfigResponse | null> => {
    try {
      // Never run withDesignBffCookieAuthRecovery here. force=true used to POST
      // /auth/refresh + session-probe×2 on every dead-cookie reload (workspace /
      // session-changed), flooding DevTools while sticky was still clear. Also
      // do not preflight with /auth/session-probe: a dead cookie makes that
      // endpoint return a visible 401 in DevTools. One runtime-config 401 is
      // enough to enter backoff.
      const getOnce = () =>
        client.http.get<TeamverRuntimeConfigResponse>("/runtime-config", {
          ...TEAMVER_BFF_REQUEST_OPTIONS,
        });

      let value: TeamverRuntimeConfigResponse;
      try {
        value = await getOnce();
      } catch (firstErr) {
        if (!isDesignBffUnauthorizedStatus(firstErr)) {
          throw firstErr;
        }
        // force=true (workspace / re-login): one HA sibling wait + retry GET.
        // Opportunistic visibility: stop after first 401 (docs-teamver/43).
        if (!force) {
          noteRuntimeConfigUnauthorized();
          return null;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS),
        );
        try {
          value = await getOnce();
        } catch (retryErr) {
          if (isDesignBffUnauthorizedStatus(retryErr)) {
            noteRuntimeConfigUnauthorized();
            return null;
          }
          throw retryErr;
        }
      }
      runtimeConfigAuthBlocked = false;
      cachedRuntimeConfig = { value, at: Date.now() };
      return value;
    } catch (err) {
      if (isDesignBffUnauthorizedStatus(err)) {
        noteRuntimeConfigUnauthorized();
      }
      return null;
    } finally {
      runtimeConfigInflight = null;
    }
  })();

  runtimeConfigInflight = run;
  return run;
}

export type TeamverRuntimeConfigResponse = {
  configured: boolean;
  apiProtocol?: string;
  baseUrl?: string;
  model?: string;
  apiKeyConfigured?: boolean;
};

export type TeamverWorkspacePermissions = {
  workspaceId?: string;
  appEnabled?: boolean;
  appDisabledReason?: string | null;
  isMember?: boolean;
};

export async function fetchTeamverWorkspacePermissions(
  workspaceId: string,
): Promise<TeamverWorkspacePermissions | null> {
  // Hard sticky / logged-out via shouldSkip…. Soft sticky must also skip —
  // permissions GET + recovery retry used to 401-storm beside C1.
  if (shouldSkipTeamverBffAuthCalls() || isDesignAuthRefreshDeclined()) return null;
  const client = getDesignBffClient();
  if (!client) return null;
  const trimmed = workspaceId.trim();
  if (!trimmed) return null;
  try {
    return await withDesignBffCookieAuthRecovery(() =>
      client.http.get<TeamverWorkspacePermissions>(
        `/permissions/${encodeURIComponent(trimmed)}`,
        {
          workspaceId: trimmed,
          ...TEAMVER_BFF_REQUEST_OPTIONS,
        },
      ),
    );
  } catch {
    return null;
  }
}

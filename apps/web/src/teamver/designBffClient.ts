import {
  TeamverClient,
  createLocalStorageWorkspaceStore,
  snakeToCamelDeep,
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
} from "./teamverBffRefreshLeader";

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
    const observed = await awaitLeaderResult();
    if (observed) {
      if (observed.ok) {
        if (
          (await probeDesignBffSessionAuthenticated())
          || (await ensureDesignBffSessionAuthenticated())
        ) {
          return { ok: true, status: observed.status || 200, bodyText: "" };
        }
        // Peer reported success but our tab cannot observe the cookie yet
        // — fall through to our own POST (BE 30s coalesce still de-dupes).
      } else if (observed.status === 400) {
        return { ok: false, status: 400, bodyText: "" };
      }
    }
    // Timeout / non-terminal peer failure. Fall through to our own POST.
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
 * Prefers `/auth/session-probe` (no ensure/refresh). Falls back to `/auth/session`
 * JSON when probe is unavailable (older nginx without the public location).
 *
 * WARNING: When access is past absolute expiry, probe returns false even if
 * refresh_token can still revive the session. Soft-sticky recovery must escalate
 * to {@link ensureDesignBffSessionAuthenticated} / POST refresh — not probe alone.
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

    // Older deploys may 404 the public probe location — fall back to session JSON.
    if (probeResponse.status !== 404) return false;

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
/** Wait for sibling Set-Cookie before soft-sticky (HA rotation race). */
const DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS = 400;
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
}

function noteAuthRefreshPostSuppressed(): void {
  authRefreshPostSuppressedUntil = Date.now() + DESIGN_BFF_REFRESH_POST_SUPPRESS_MS;
}

function markAuthRefreshDeclined(kind: "soft" | "hard"): void {
  authRefreshDeclinedForSession = true;
  authRefreshDeclineKind = kind;
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
  try {
    return await request();
  } catch (err) {
    if (!isDesignBffUnauthorizedStatus(err)) throw err;

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

    // Refresh declined (soft-sticky or bare-attempt guard). Wait for a sibling
    // Set-Cookie and retry once; if still 401, ensure /auth/session to try
    // reviving absolute-expired access on the main response.
    await new Promise((resolve) => setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS));
    try {
      const recovered = await request();
      resetDesignAuthRefreshDeclined();
      return recovered;
    } catch (retryErr) {
      if (!isDesignBffUnauthorizedStatus(retryErr)) throw retryErr;
      // Access-expired case: session-probe alone cannot revive access, but
      // ensure_bff_session on GET /auth/session can Set-Cookie a fresh access
      // on the main response. Try that before surfacing a hard 401 to callers.
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
      // ensure failed too. If /auth/session-probe reports alive (sibling
      // Set-Cookie in flight, or BFF session is valid but this particular
      // BFF call hit a stale acl), clear sticky so later calls recover.
      if (await probeDesignBffSessionAuthenticated()) {
        resetDesignAuthRefreshDeclined();
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
  const minAgeMs = options?.minAgeMs ?? TEAMVER_EMBED_PROACTIVE_AUTH_REFRESH_MS;
  const startedAt = options?.activityStartedAt;
  if (startedAt != null && Date.now() - startedAt < minAgeMs) return;
  await refreshDesignAuthCookie();
}

async function trySoftStickyRecovery(): Promise<boolean> {
  // 1) Cheap read-only probe (sibling Set-Cookie may already be live).
  if (await probeDesignBffSessionAuthenticated()) {
    resetDesignAuthRefreshDeclined();
    return true;
  }
  await new Promise((resolve) => setTimeout(resolve, DESIGN_BFF_COOKIE_RECOVERY_RETRY_DELAY_MS));
  if (await probeDesignBffSessionAuthenticated()) {
    resetDesignAuthRefreshDeclined();
    return true;
  }

  // 2) ensure via GET /auth/session — can refresh + Set-Cookie on the main response.
  //    session-probe alone cannot revive absolute-expired access.
  if (await ensureDesignBffSessionAuthenticated()) {
    resetDesignAuthRefreshDeclined();
    noteAuthRefreshPostSuppressed();
    return true;
  }

  // 3) One POST /auth/refresh under cooldown — required when nginx auth_request
  //    already blocks /api/* because access expired and ensure also failed.
  const now = Date.now();
  if (now - authRefreshSoftForcePostAt < DESIGN_BFF_SOFT_FORCE_POST_COOLDOWN_MS) {
    return false;
  }
  authRefreshSoftForcePostAt = now;
  const bffResult = await postAuthRefreshCoordinated(resolveDesignBffRefreshUrl());
  if (bffResult.ok) {
    resetDesignAuthRefreshDeclined();
    authRefreshPostSuppressedUntil = 0;
    return true;
  }
  if (await ensureDesignBffSessionAuthenticated()) {
    resetDesignAuthRefreshDeclined();
    noteAuthRefreshPostSuppressed();
    return true;
  }
  return false;
}

/** BFF silent refresh via design-api (Apps JWT stored server-side). */
export async function refreshDesignAuthCookie(): Promise<boolean> {
  if (inFlightAuthRefresh) return inFlightAuthRefresh;

  const run = (async (): Promise<boolean> => {
    // Soft sticky (401) must not be terminal for the tab lifetime.
    // Hard sticky (400) stays closed until explicit resetRefreshState / sign-in.
    if (authRefreshDeclinedForSession) {
      if (authRefreshDeclineKind === "hard") return false;
      return await trySoftStickyRecovery();
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
      // Account missing / malformed refresh — hard sticky without HA soft-retry.
      // Explicit resetRefreshState / sign-in return clears this; do not re-probe.
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
  if (!(err instanceof NetworkError)) return true;
  const status = err.status ?? 0;
  if (status === 401 || status === 403) return false;
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

/** Clear 401 backoff — called when embed session becomes authenticated. */
export function clearTeamverRuntimeConfigAuthBlock(): void {
  runtimeConfigAuthBlocked = false;
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

  // 401 backoff: cookie expired while UI still thought it was signed in.
  if (!force && runtimeConfigAuthBlocked) {
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
      const value = await withDesignBffCookieAuthRecovery(() =>
        client.http.get<TeamverRuntimeConfigResponse>("/runtime-config", {
          ...TEAMVER_BFF_REQUEST_OPTIONS,
        }),
      );
      runtimeConfigAuthBlocked = false;
      cachedRuntimeConfig = { value, at: Date.now() };
      return value;
    } catch (err) {
      if (err instanceof NetworkError && err.status === 401) {
        runtimeConfigAuthBlocked = true;
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

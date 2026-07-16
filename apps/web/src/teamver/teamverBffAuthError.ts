import { NetworkError } from "@teamver/app-sdk";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";

/**
 * True when an error thrown from a teamver Design BFF call represents an
 * expired / missing HttpOnly session (HTTP 401).
 *
 * Two shapes are recognized:
 *
 *  - `NetworkError` from `@teamver/app-sdk` — every call that goes through
 *    `getDesignBffClient().http.*` throws this on non-2xx.
 *
 *  - `Error("teamver_drive_fetch_failed:<status>")` — plain fetch helpers in
 *    `driveApi.ts` (`GET /teamver-bff/drive/api/…`) do not use the SDK
 *    client, so the status is encoded in the message. Historical BFF error
 *    strings like `"401 Unauthorized"` also match, defensive-only.
 *
 * `invalid token` from Main BE pass-through is intentionally excluded — it
 * often reflects HA cookie decode races or upstream JWT shape mismatches that
 * recover on retry while the embed session flag is still true.
 */
export function isTeamverBffUnauthorizedError(err: unknown): boolean {
  if (err instanceof NetworkError && err.status === 401) return true;
  if (err instanceof Error) {
    const message = err.message || "";
    if (/teamver_drive_fetch_failed:\s*401\b/.test(message)) return true;
    if (/\b401\b.*unauthorized/i.test(message)) return true;
    if (/\bsession_expired\b/i.test(message)) return true;
  }
  return false;
}

export type TeamverBffAuthFailureKind = "none" | "transient" | "relogin";

/** Distinguish recoverable auth blips from confirmed logout for embed UI. */
export function classifyTeamverBffAuthFailure(err: unknown): TeamverBffAuthFailureKind {
  if (!isTeamverBffUnauthorizedError(err)) return "none";
  return isTeamverEmbedSessionAuthenticated() ? "transient" : "relogin";
}

/** Retry-first copy while embed session memory still says authenticated. */
export const TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE =
  "연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.";

/** Apply relogin vs retry-first UI for BFF 401 catch blocks. Returns true when handled. */
export function handleTeamverBffAuthFailure(
  err: unknown,
  handlers: {
    onRelogin: () => void;
    onTransient: () => void;
  },
): boolean {
  const kind = classifyTeamverBffAuthFailure(err);
  if (kind === "relogin") {
    handlers.onRelogin();
    return true;
  }
  if (kind === "transient") {
    handlers.onTransient();
    return true;
  }
  return false;
}

/**
 * Route the browser back to Main sign-in while preserving the current embed
 * URL as `returnTo`, so `/auth/callback` lands the user back on the exact
 * project/file they were viewing. Intended for user-initiated CTA clicks
 * (e.g. "다시 로그인" button in a 401 banner) — do NOT call from a passive
 * fetch catch, use `useTeamverEmbed`'s session gate for that path.
 */
export function redirectToTeamverLoginFromEmbed(): void {
  if (typeof window === "undefined") return;
  const returnTo = resolveEmbedAuthReturnPath(
    window.location.pathname,
    window.location.search,
  );
  redirectToTeamverLoginPreservingRoute({ returnTo });
}

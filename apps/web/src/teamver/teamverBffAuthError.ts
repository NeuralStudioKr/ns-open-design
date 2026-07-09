import { NetworkError } from "@teamver/app-sdk";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";

/**
 * True when an error thrown from a Teamver Design BFF call represents an
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
 * When staging routes a request to a peer node whose
 * `DESIGN_BFF_SESSION_SECRET` differs from ours the middleware silently
 * fails to decode `teamver_bff_v1` and every protected route (drive
 * folder/shared-drive, publish, project outputs, refresh) returns 401
 * together. Detecting the class here lets each UI surface distinguish that
 * from a real fetch failure and offer an explicit re-login CTA instead of
 * "please try again", which just loops.
 */
export function isTeamverBffUnauthorizedError(err: unknown): boolean {
  if (err instanceof NetworkError && err.status === 401) return true;
  if (err instanceof Error) {
    const message = err.message || "";
    if (/teamver_drive_fetch_failed:\s*401\b/.test(message)) return true;
    if (/\b401\b.*unauthorized/i.test(message)) return true;
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

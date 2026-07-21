import { NetworkError } from "@teamver/app-sdk";
import { isTeamverEmbedMode } from "./designApiBase";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
import { TeamverDaemonUnauthorizedError } from "./teamverDaemonHeaders";
import { handleEmbedPassiveUnauthorized } from "./teamverEmbedPassiveAuth";
import {
  isDesignAuthRefreshDeclined,
  isDesignAuthRefreshDeclineHard,
} from "./designBffClient";
import {
  isTeamverDriveMainSsoGateError,
  isTeamverDriveMainSsoRequiredError,
  isTeamverDriveMainSsoUserMismatchError,
} from "./driveApi";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";
import { beginMainSsoMismatchRecovery } from "./mainSsoMismatchRecovery";

function isSdkHttpUnauthorized(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  if (status !== 401) return false;
  // AuthenticationError / NetworkError / TeamverApiError all carry `status`.
  const name = (err as { name?: unknown }).name;
  if (typeof name === "string" && /Error$/.test(name)) return true;
  return err instanceof NetworkError;
}

/**
 * True when an error thrown from a teamver Design BFF call represents an
 * expired / missing HttpOnly session (HTTP 401).
 *
 * Recognized shapes:
 *
 *  - SDK `AuthenticationError` / `TeamverApiError` / `NetworkError` with
 *    ``status === 401`` — `@teamver/app-sdk` maps HTTP 401 to
 *    ``AuthenticationError`` via ``mapHttpErrorBody``; transport failures use
 *    ``NetworkError``.
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
  if (isSdkHttpUnauthorized(err)) return true;
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
  if (isTeamverEmbedSessionAuthenticated()) return "transient";
  // Soft sticky means we still believe HA recovery may succeed — do not escalate
  // Drive/publish UI to re-login CTA from memory alone.
  if (isDesignAuthRefreshDeclined() && !isDesignAuthRefreshDeclineHard()) return "transient";
  return "relogin";
}

/** Retry-first copy while embed session memory still says authenticated. */
export const TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE =
  "연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.";

/**
 * Auth UX priority (embed):
 * 1) Prevent refresh races (BFF probe read-only, Set-Cookie suppress, HA coalesce)
 * 2) Silent recovery (refresh + ensure session + soft-retry; soft sticky can force POST)
 * 3) In-place "다시 시도" — never ask users to close the tab for a refresh blip
 * 4) Re-login only after confirmed session loss (ensure/probe authenticated:false)
 */

/** Pick retry-first vs re-login copy based on embed session memory. */
export function formatTeamverEmbedAuthRequiredMessage(
  logoutMessage: string,
  transientMessage = TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE,
): string {
  if (!isTeamverEmbedMode()) return logoutMessage;
  if (isTeamverEmbedSessionAuthenticated()) return transientMessage;
  if (isDesignAuthRefreshDeclined() && !isDesignAuthRefreshDeclineHard()) return transientMessage;
  return logoutMessage;
}

export function isTeamverDaemonUnauthorizedError(err: unknown): err is TeamverDaemonUnauthorizedError {
  return err instanceof TeamverDaemonUnauthorizedError;
}

/** User-facing copy for export/save/conversation failures after auth recovery. */
export function formatTeamverEmbedOperationFailureMessage(
  err: unknown,
  fallback: string,
  options?: {
    logoutMessage?: string;
    transientMessage?: string;
  },
): string {
  const logoutMessage =
    options?.logoutMessage
    ?? "로그인 세션이 만료되었습니다. 다시 로그인한 뒤 시도하세요.";
  const transientMessage = options?.transientMessage ?? TEAMVER_EMBED_TRANSIENT_AUTH_MESSAGE;

  if (isTeamverDaemonUnauthorizedError(err) || isTeamverBffUnauthorizedError(err)) {
    return formatTeamverEmbedAuthRequiredMessage(logoutMessage, transientMessage);
  }

  if (err instanceof Error) {
    const message = err.message.trim();
    if (message) {
      if (
        message.includes("연결을 확인하지 못했습니다")
        || message.includes("로그인 세션이 만료")
      ) {
        return message;
      }
      if (
        message === "teamver_daemon_unauthorized"
        || /\b401\b.*unauthorized/i.test(message)
        || /\bsession_expired\b/i.test(message)
      ) {
        return formatTeamverEmbedAuthRequiredMessage(logoutMessage, transientMessage);
      }
      return message;
    }
  }

  return fallback;
}

/** Surface passive-auth recovery when a mutating/export path still sees auth loss. */
export function notifyTeamverEmbedAuthFailureIfNeeded(
  err: unknown,
  reason: "daemon" | "bff",
): void {
  if (!isTeamverEmbedMode()) return;
  if (isTeamverDaemonUnauthorizedError(err) || isTeamverBffUnauthorizedError(err)) {
    handleEmbedPassiveUnauthorized(reason);
    return;
  }
  if (err instanceof Error) {
    const message = err.message.trim();
    if (
      message === "teamver_daemon_unauthorized"
      || /\b401\b.*unauthorized/i.test(message)
      || /\bsession_expired\b/i.test(message)
    ) {
      handleEmbedPassiveUnauthorized(reason);
    }
  }
}

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
 * Drive browse/publish catch helper: Main SSO gate first, then Design BFF auth.
 *
 * ``main_sso_user_mismatch`` silently rebinds via Main logout + cold start
 * (no operator-facing "accounts differ" copy). ``main_sso_required`` still
 * surfaces the normal re-login CTA.
 */
export function handleTeamverDriveAuthFailure(
  err: unknown,
  handlers: {
    onRelogin: () => void;
    onTransient: () => void;
  },
): boolean {
  if (isTeamverDriveMainSsoUserMismatchError(err)) {
    void beginMainSsoMismatchRecovery();
    // Recovery shows its own friendly loading toast — do not paint transient
    // "연결을 확인하지 못했습니다" error UI that looks like a hard failure.
    return true;
  }
  // Main SSO missing/expired: while Design embed still looks signed-in this is
  // usually an HA cookie race — prefer in-place retry, not 「다시 로그인」.
  // Relogin CTA only after Design memory also says logged out.
  if (isTeamverDriveMainSsoRequiredError(err)) {
    if (isTeamverEmbedSessionAuthenticated()) {
      handlers.onTransient();
      return true;
    }
    handlers.onRelogin();
    return true;
  }
  if (isTeamverDriveMainSsoGateError(err)) {
    handlers.onRelogin();
    return true;
  }
  return handleTeamverBffAuthFailure(err, {
    onRelogin: handlers.onRelogin,
    onTransient: handlers.onTransient,
  });
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

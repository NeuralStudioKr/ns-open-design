/**
 * Silent recovery when browser Main SSO cookie user ≠ Design BFF session user.
 *
 * Parent-domain `teamver_access_token` was overwritten (e.g. another tab logged
 * into Main as a different account). Showing "accounts differ" is operator
 * jargon — clear both cookies and cold-start login so one account owns both.
 */

import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
import { clearOrphanTeamverAuthCookies } from "./teamverAuthOrphanJwt";
import {
  clearDesignAuthSessionFull,
  redirectToTeamverLoginPreservingRoute,
} from "./designAuthFlow";

const RECOVER_FLAG = "teamver_main_sso_mismatch_recover";
const RECOVER_COOLDOWN_MS = 45_000;

let recoverInflight: Promise<void> | null = null;

function readRecoverStamp(): number {
  if (typeof sessionStorage === "undefined") return 0;
  const raw = sessionStorage.getItem(RECOVER_FLAG);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function writeRecoverStamp(at: number): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(RECOVER_FLAG, String(at));
}

/** True when a silent mismatch recover already ran recently (avoid redirect loops). */
export function wasMainSsoMismatchRecoverAttemptedRecently(): boolean {
  const stamp = readRecoverStamp();
  if (!stamp) return false;
  return Date.now() - stamp < RECOVER_COOLDOWN_MS;
}

/**
 * Clear mismatched Main + Design sessions and redirect to Main sign-in with
 * returnTo. No user-facing "account mismatch" copy — page navigates away.
 *
 * Coalesced + cooldown-guarded so parallel Drive 401s only recover once.
 */
export function beginMainSsoMismatchRecovery(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  if (recoverInflight) return recoverInflight;

  recoverInflight = (async () => {
    const alreadyAttempted = wasMainSsoMismatchRecoverAttemptedRecently();
    if (!alreadyAttempted) {
      writeRecoverStamp(Date.now());
      try {
        await clearOrphanTeamverAuthCookies();
        await clearDesignAuthSessionFull();
      } catch {
        // best-effort — redirect still rebinds via cold start
      }
    }
    const returnTo = resolveEmbedAuthReturnPath(
      window.location.pathname,
      window.location.search,
    );
    redirectToTeamverLoginPreservingRoute({ returnTo });
  })().finally(() => {
    recoverInflight = null;
  });

  return recoverInflight;
}

/** @internal vitest */
export function resetMainSsoMismatchRecoveryForTests(): void {
  recoverInflight = null;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(RECOVER_FLAG);
  }
}

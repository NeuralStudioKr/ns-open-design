/**
 * Proactive Main SSO ↔ Design BFF alignment (Stage 2).
 * Mismatch → same silent recovery as Drive `main_sso_user_mismatch` (Stage 0).
 */

import type { DesignAuthSession } from "./designBffClient";
import { pauseDesignBffAuthDuringTransition } from "./designBffClient";
import { beginMainSsoMismatchRecovery, wasMainSsoMismatchRecoverAttemptedRecently } from "./mainSsoMismatchRecovery";
import { checkMainSsoUserMatchesSession } from "./teamverMainSsoUserProbe";
import { isTeamverEmbedMode } from "./designApiBase";

let reconcileInflight: Promise<boolean> | null = null;

/**
 * @returns true when mismatch recovery started (caller should stop applying session UI).
 */
export async function maybeReconcileMainSsoWithDesignSession(
  session: DesignAuthSession | null | undefined,
): Promise<boolean> {
  if (!isTeamverEmbedMode()) return false;
  if (!session?.authenticated) return false;
  if (wasMainSsoMismatchRecoverAttemptedRecently()) return false;

  if (reconcileInflight) {
    return reconcileInflight;
  }

  reconcileInflight = (async (): Promise<boolean> => {
    const match = await checkMainSsoUserMatchesSession(session);
    if (match !== "mismatch") return false;
    pauseDesignBffAuthDuringTransition();
    await beginMainSsoMismatchRecovery();
    return true;
  })().finally(() => {
    reconcileInflight = null;
  });

  return reconcileInflight;
}

/** @internal vitest */
export function resetMainSsoUserReconcileForTests(): void {
  reconcileInflight = null;
}

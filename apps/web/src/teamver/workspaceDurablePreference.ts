/**
 * Whether a resolved workspace may become the account's durable "last used"
 * pick (0908-N01 slice G, mirroring Main FE T3).
 *
 * `syncTeamverWorkspaceFromSession` ends with an unconditional
 * `store.setLastForUser(userId, active)`. When the resolve was a reconcile —
 * the stored workspace was absent from the session list and the code fell
 * through to the account default — that line promotes a value the system handed
 * over into the record of what the *user* chose. After that the original pick
 * is unrecoverable even once it reappears on the session list.
 *
 * The active/header key still moves in every case, so blocking the promotion
 * cannot strand requests on a workspace the session rejects.
 *
 * @returns `false` only for an unrequested move away from an existing pick.
 */
export function mayPromoteWorkspaceToDurablePreference(input: {
  /** `store.get()` before this resolve — `null` on a first-ever entry. */
  storedBefore: string | null | undefined;
  resolved: string | null | undefined;
  /** A parent-app switch, launch seed, or boot realign asked for this one. */
  requestedByCaller: boolean;
}): boolean {
  if (input.requestedByCaller) return true;

  const before = input.storedBefore?.trim() || null;
  // First-ever entry: there is no earlier pick to protect, so the seed is the
  // pick. Without this, a brand new user would never get a durable record.
  if (!before) return true;

  const resolved = input.resolved?.trim() || null;
  // Confirming the value already stored is a no-op, not a move.
  if (!resolved || resolved === before) return true;

  return false;
}

import type { ChatMessage } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { isTerminalRunStatus } from "./usageAttribution";

/**
 * Embed BYOK usage + billing — **daemon authoritative** (§4.11).
 *
 * On `PUT …/messages/:id` with `telemetryFinalized`, the daemon runs
 * `reportByokTeamverUsageAndBillingFromDaemon` (M2M internal billing + usage).
 * This hook intentionally no-ops for BYOK turns so the browser tab lifecycle
 * cannot drop Registry commit / ledger rows.
 *
 * Hosted daemon runs (`message.runId` set) were already skipped — M2M bridge
 * on run finalize handles those.
 */
export async function maybeReportTeamverUsageAfterSave(
  _projectId: string,
  message: ChatMessage,
  options: { telemetryFinalized?: boolean },
): Promise<void> {
  if (!options.telemetryFinalized) return;
  if (!isTeamverEmbedMode()) return;
  if (!isTerminalRunStatus(message.runStatus)) return;
  if (message.runId?.trim()) return;
  // BYOK — daemon message PUT hook owns usage + billing.
}

/** @internal vitest — retained for tests that reset dedupe state on legacy paths. */
export function resetTeamverReportedRunIdsForTests(): void {
  // no-op — dedupe lives on daemon `reportedRuns` for BYOK.
}

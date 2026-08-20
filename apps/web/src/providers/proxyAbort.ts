import { fetchTeamverDaemon } from "../teamver/teamverDaemonHeaders";

/**
 * Stop-button vs page-exit cancellation policy (PR1 §3.5).
 *
 * `streamProxyEndpoint` registers an abort listener on the incoming
 * `AbortSignal`. When that signal aborts, it inspects `signal.reason`:
 *   - `EXPLICIT_PROXY_STOP_REASON` / `FILL_MOTIF_SVG_DUMP_STOP_REASON`
 *     / `FILL_HEAD_KIT_DUMP_STOP_REASON`
 *     → fires `POST /api/proxy/abort { streamId }` with `keepalive: true`
 *     so the daemon cancels the upstream LLM `fetch()`. User Stop uses
 *     the first reason; Motif-SVG / head-kit hang aborts use the others
 *     (still incomplete — persist salvage + auto-continue must run).
 *   - anything else (page navigation, route swap, replay, browser tab
 *     close) → no abort POST is sent. The daemon lets the upstream
 *     stream drain naturally so background tool work (image gen, S3
 *     writes) finishes and the run-end sync-up commits.
 *
 * The constant is exported as a Symbol-like string with a fixed value so
 * call sites can compare cheaply (`signal.reason === EXPLICIT_PROXY_STOP_REASON`).
 * Using a plain string keeps the reason wire-serializable in case the
 * AbortSignal crosses an iframe / structured-clone boundary, where a
 * real Symbol would not survive.
 */
export const EXPLICIT_PROXY_STOP_REASON = "od:user-stop" as const;

export type ExplicitProxyStopReason = typeof EXPLICIT_PROXY_STOP_REASON;

/**
 * Mid-stream fill hang: Motif `<svg>` opened before a cover heading.
 * Cancels the upstream LLM (same as Stop) but is NOT a user stop — persist
 * + auto-continue must still run with the SVG excerpt discarded.
 */
export const FILL_MOTIF_SVG_DUMP_STOP_REASON = "od:fill-motif-svg-dump" as const;

export type FillMotifSvgDumpStopReason = typeof FILL_MOTIF_SVG_DUMP_STOP_REASON;

/**
 * Mid-stream fill hang: `<head>` / prelude `<style>` grew past ~800
 * characters with no titled slide. Cancels upstream like Motif-SVG
 * abort so persist can salvage a brief cover instead of burning the turn.
 */
export const FILL_HEAD_KIT_DUMP_STOP_REASON = "od:fill-head-kit-dump" as const;

export type FillHeadKitDumpStopReason = typeof FILL_HEAD_KIT_DUMP_STOP_REASON;

export function shouldRequestUpstreamProxyAbort(reason: unknown): boolean {
  return (
    reason === EXPLICIT_PROXY_STOP_REASON
    || reason === FILL_MOTIF_SVG_DUMP_STOP_REASON
    || reason === FILL_HEAD_KIT_DUMP_STOP_REASON
  );
}

/** Aborted streams that should finalize via onDone (incomplete) instead of silent return. */
export function shouldFinalizeAbortedStreamAsIncomplete(reason: unknown): boolean {
  return (
    reason === FILL_MOTIF_SVG_DUMP_STOP_REASON
    || reason === FILL_HEAD_KIT_DUMP_STOP_REASON
  );
}

/**
 * Fire-and-forget `POST /api/proxy/abort { streamId }` with `keepalive`
 * so the request survives synchronous local abort + connection teardown
 * happening immediately after. The daemon's `/api/proxy/abort` handler
 * always answers 200 (with `{ aborted: boolean }`) so a missed-race POST
 * after natural stream completion is benign.
 *
 * Intentionally not awaited by callers: the FE Stop button needs to
 * abort the local fetch ASAP for UI responsiveness, and the abort POST
 * is a best-effort signal to the daemon — if it gets lost we degrade to
 * the legacy behavior (FE looks stopped, daemon finishes upstream in
 * background and sync-ups complete normally).
 */
export function requestProxyAbort(
  streamId: string,
  options?: { conversationId?: string | null },
): void {
  if (!streamId) return;
  const conversationId = options?.conversationId?.trim();
  try {
    void fetchTeamverDaemon("/api/proxy/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamId,
        ...(conversationId ? { conversationId } : {}),
      }),
      keepalive: true,
    }).catch(() => {
      // best-effort — if the abort POST fails the daemon falls back to
      // background completion and sync-up still runs.
    });
  } catch {
    // ignore — never throw out of an abort path; the UI must still stop.
  }
}

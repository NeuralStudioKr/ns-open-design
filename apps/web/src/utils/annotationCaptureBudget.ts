/**
 * Shared timing for PreviewDrawOverlay ↔ FileViewer capture handshake.
 * Keep overlay race budgets >= the worst-case path inside
 * `captureExportImageSnapshot` so box/memo annotations do not fall back to
 * marks-only while the srcDoc bridge is still warming up.
 */

/** Draw-overlay iframe readiness poll in FileViewer (`drawCaptureReadyRef`). */
export const DRAW_CAPTURE_READY_DEADLINE_MS = 8_500;

/** Lazy srcDoc shell spin-up before snapshot bridge activation. */
export const ANNOTATION_LAZY_SHELL_WAIT_MS = 500;

/** Per-attempt timeouts for the srcDoc snapshot bridge during annotation send. */
export const ANNOTATION_SNAPSHOT_BRIDGE_RETRY_MS = [2_500, 3_000] as const;

const ANNOTATION_BRIDGE_RETRY_SUM_MS = ANNOTATION_SNAPSHOT_BRIDGE_RETRY_MS.reduce(
  (sum, ms) => sum + ms,
  0,
);

/** Small cushion for iframe load / transport activation after readiness. */
export const ANNOTATION_CAPTURE_POST_READY_BUFFER_MS = 500;

/** Exported for unit tests that assert budget arithmetic. */
export const ANNOTATION_BRIDGE_RETRY_TOTAL_MS = ANNOTATION_BRIDGE_RETRY_SUM_MS;

/** Overlay wait when box marks, memo+mark, or click targets need slide context. */
export const ANNOTATION_SLIDE_CONTEXT_CAPTURE_BUDGET_MS =
  DRAW_CAPTURE_READY_DEADLINE_MS +
  ANNOTATION_LAZY_SHELL_WAIT_MS +
  ANNOTATION_BRIDGE_RETRY_SUM_MS +
  ANNOTATION_CAPTURE_POST_READY_BUFFER_MS;

/** Default overlay wait when no marks-only fast path applies. */
export const ANNOTATION_CAPTURE_BUDGET_MS = 10_000;

/** Pen-only ink can fall back sooner; bounds still carry placement. */
export const ANNOTATION_CAPTURE_FAST_FALLBACK_MS = 7_000;

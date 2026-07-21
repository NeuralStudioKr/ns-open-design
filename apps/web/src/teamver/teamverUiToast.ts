/**
 * Lightweight Teamver UI toast bus — App mounts a single Toast listener.
 * Prefer friendly, non-operator copy (no SSO / cookie / mismatch jargon).
 */

export const TEAMVER_UI_TOAST_EVENT = "teamver-ui-toast";

export type TeamverUiToastTone = "default" | "success" | "error" | "loading";

export type TeamverUiToastDetail = {
  message: string;
  details?: string;
  tone?: TeamverUiToastTone;
  ttlMs?: number;
  role?: "status" | "alert";
};

export function showTeamverUiToast(detail: TeamverUiToastDetail): void {
  if (typeof window === "undefined") return;
  const message = detail.message.trim();
  if (!message) return;
  window.dispatchEvent(
    new CustomEvent<TeamverUiToastDetail>(TEAMVER_UI_TOAST_EVENT, {
      detail: {
        message,
        details: detail.details?.trim() || undefined,
        tone: detail.tone ?? "default",
        ttlMs: detail.ttlMs,
        role: detail.role ?? "status",
      },
    }),
  );
}

export function subscribeTeamverUiToast(
  handler: (detail: TeamverUiToastDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (event: Event) => {
    const custom = event as CustomEvent<TeamverUiToastDetail>;
    const detail = custom.detail;
    if (!detail?.message?.trim()) return;
    handler(detail);
  };
  window.addEventListener(TEAMVER_UI_TOAST_EVENT, onEvent);
  return () => window.removeEventListener(TEAMVER_UI_TOAST_EVENT, onEvent);
}

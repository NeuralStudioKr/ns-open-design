/**
 * Sentry drop filters — Teamver 136 Slack 알림 중요도·제외 정책.
 * Mirror: ns-teamver-fe-v2/web/src/lib/sentryEventFilters.ts
 */

const EXCLUDE_MESSAGE_PATTERNS: RegExp[] = [
  /invalid credentials/i,
  /incorrect password/i,
  /authentication failed/i,
  /not authenticated/i,
  /unauthorized/i,
  /permission denied/i,
  /forbidden/i,
  /access[_ ]denied/i,
  /token expired/i,
  /session expired/i,
  /network error/i,
  /failed to fetch/i,
  /load failed/i,
  /aborterror/i,
  /the user aborted/i,
  /request aborted/i,
  /econnaborted/i,
  /err_canceled/i,
  /csrf/i,
];

function collectEventText(event: {
  message?: string;
  exception?: { values?: Array<{ type?: string; value?: string }> };
  logentry?: { message?: string; formatted?: string };
}): string {
  const parts: string[] = [];
  if (event.message) parts.push(event.message);
  if (event.logentry?.message) parts.push(event.logentry.message);
  if (event.logentry?.formatted) parts.push(event.logentry.formatted);
  for (const ex of event.exception?.values ?? []) {
    if (ex.type) parts.push(ex.type);
    if (ex.value) parts.push(ex.value);
  }
  return parts.join("\n");
}

function statusCodeFromEvent(event: {
  tags?: Record<string, unknown> | Array<{ key?: string; value?: string }>;
  contexts?: Record<string, unknown>;
}): number | null {
  const tags = event.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (t?.key === "http.status_code" || t?.key === "status_code") {
        const n = Number(t.value);
        if (Number.isFinite(n)) return n;
      }
    }
  } else if (tags && typeof tags === "object") {
    const raw =
      (tags as Record<string, unknown>)["http.status_code"] ??
      (tags as Record<string, unknown>)["status_code"];
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const response = (event.contexts as { response?: { status_code?: number } } | undefined)
    ?.response;
  if (response?.status_code != null) return Number(response.status_code);
  return null;
}

/** true면 Sentry로 보내지 않음 */
export function shouldDropSentryEvent(event: Record<string, unknown>): boolean {
  const status = statusCodeFromEvent(event as Parameters<typeof statusCodeFromEvent>[0]);
  if (status === 401 || status === 403 || status === 429) return true;

  const text = collectEventText(event as Parameters<typeof collectEventText>[0]);
  if (!text) return false;
  return EXCLUDE_MESSAGE_PATTERNS.some((re) => re.test(text));
}

export const SENTRY_IGNORE_ERRORS: Array<string | RegExp> = [
  "Network Error",
  "Failed to fetch",
  "Load failed",
  "AbortError",
  /^AbortError:/i,
  /The user aborted a request/i,
  /Request aborted/i,
  /Invalid credentials/i,
  /Unauthorized/i,
  /Forbidden/i,
];

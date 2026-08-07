/** Teamver embed display / parse helpers for absolute times (KST). */

export const TEAMVER_DISPLAY_TIME_ZONE = "Asia/Seoul";

/** Values below this are treated as Unix seconds (not ms). */
const UNIX_MS_THRESHOLD = 1e12;

const NAIVE_DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/;

/**
 * Normalize registry / Canvas / Main timestamps to epoch milliseconds.
 * - number/numeric string: seconds if &lt; 1e12, else ms
 * - Date
 * - ISO with offset / Z
 * - naive ISO (`2026-08-05T07:11:00`) → UTC (Main Canvas often omits Z)
 */
export function parseTeamverTimestampMs(raw: unknown, fallback = 0): number {
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : fallback;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 0 && raw < UNIX_MS_THRESHOLD ? Math.round(raw * 1000) : raw;
  }
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return fallback;
    return n > 0 && n < UNIX_MS_THRESHOLD ? Math.round(n * 1000) : n;
  }

  const naive = NAIVE_DATETIME_RE.exec(trimmed);
  if (naive) {
    const asUtc = `${naive[1]}T${naive[2]}Z`;
    const utcMs = Date.parse(asUtc);
    if (Number.isFinite(utcMs)) return utcMs;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Absolute KST label for Canvas modal meta — null when raw is not a date. */
export function formatTeamverTimestampKst(
  raw: unknown,
  locale = "ko",
): string | null {
  const ms = parseTeamverTimestampMs(raw, Number.NaN);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat(locale || "ko", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: TEAMVER_DISPLAY_TIME_ZONE,
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

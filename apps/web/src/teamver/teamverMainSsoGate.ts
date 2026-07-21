/**
 * Main HS256 SSO gate tokens shared by Drive browse, publish, canvas, and
 * Design BFF cookie recovery. Kept dependency-free so designBffClient can
 * skip Apps refresh without importing driveApi (cycle).
 */

export type TeamverMainSsoGateCode = "main_sso_required" | "main_sso_user_mismatch";

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

/** Pull Main SSO gate token from a BFF/Drive JSON body (detail/code/error). */
export function extractMainSsoGateCodeFromBody(body: unknown): TeamverMainSsoGateCode | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const candidates: unknown[] = [record.detail, record.code, record.error];
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    candidates.push(nested.message, nested.code);
  }
  for (const candidate of candidates) {
    const token = normalizeToken(candidate);
    if (token === "main_sso_user_mismatch") return "main_sso_user_mismatch";
    if (token === "main_sso_required") return "main_sso_required";
  }
  return null;
}

/**
 * Resolve Main SSO gate code from thrown SDK/Drive errors.
 * Prefers ``responseBody`` (AuthenticationError/NetworkError), then message.
 */
export function extractMainSsoGateCodeFromError(err: unknown): TeamverMainSsoGateCode | null {
  if (!err || typeof err !== "object") return null;
  const body = (err as { responseBody?: unknown }).responseBody;
  const fromBody = extractMainSsoGateCodeFromBody(body);
  if (fromBody) return fromBody;

  if (err instanceof Error) {
    const message = err.message.trim().toLowerCase();
    if (
      message === "main_sso_user_mismatch"
      || message === "teamver_drive_main_sso_user_mismatch"
    ) {
      return "main_sso_user_mismatch";
    }
    if (
      message === "main_sso_required"
      || message === "teamver_drive_main_sso_required"
    ) {
      return "main_sso_required";
    }
  }
  return null;
}

export function isMainSsoGateError(err: unknown): boolean {
  return extractMainSsoGateCodeFromError(err) != null;
}

export function isMainSsoUserMismatchError(err: unknown): boolean {
  return extractMainSsoGateCodeFromError(err) === "main_sso_user_mismatch";
}

export function isMainSsoRequiredError(err: unknown): boolean {
  return extractMainSsoGateCodeFromError(err) === "main_sso_required";
}

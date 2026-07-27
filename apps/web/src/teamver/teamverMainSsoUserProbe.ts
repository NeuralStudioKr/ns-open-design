/**
 * Best-effort compare: visible Main HS256 SSO cookie user vs Design BFF session.
 *
 * Does not verify JWT signatures — same contract as BE `main_sso_user_mismatches_bff`
 * and Stage 0 recovery (redirect to Main login, no data exposure).
 */

import type { DesignAuthSession } from "./designBffClient";

const MAIN_ACCESS_COOKIE = "teamver_access_token=";

export type MainSsoSessionMatch = "match" | "mismatch" | "unknown";

function readCookieValue(namePrefix: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(namePrefix)) {
      const raw = part.slice(namePrefix.length).trim();
      return raw ? decodeURIComponent(raw) : null;
    }
  }
  return null;
}

export function readMainSsoAccessTokenFromDocumentCookie(): string | null {
  return readCookieValue(MAIN_ACCESS_COOKIE);
}

export function readUnverifiedJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;
  try {
    const segment = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readUserIdFromJwtPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  for (const key of ["user_id", "userId", "sub"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function readMainSsoUserIdFromDocumentCookie(): string | null {
  const token = readMainSsoAccessTokenFromDocumentCookie();
  if (!token) return null;
  return readUserIdFromJwtPayload(readUnverifiedJwtPayload(token));
}

export async function hashMainSsoUserId(userId: string): Promise<string> {
  const normalized = userId.trim().toLowerCase();
  if (!normalized) return "";
  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    const data = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Vitest/node fallback without Web Crypto
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function resolveDesignSessionUserId(session: DesignAuthSession): string | null {
  const fromUser = session.user?.userId?.trim();
  if (fromUser) return fromUser;
  const legacy = (session as { userId?: string }).userId?.trim();
  return legacy || null;
}

export async function checkMainSsoUserMatchesSession(
  session: DesignAuthSession,
): Promise<MainSsoSessionMatch> {
  if (!session.authenticated) return "unknown";

  const liveMainUserId = readMainSsoUserIdFromDocumentCookie();
  if (!liveMainUserId) return "unknown";

  const expectedHash = session.mainSsoIdentityHash?.trim();
  if (expectedHash) {
    const liveHash = await hashMainSsoUserId(liveMainUserId);
    return liveHash === expectedHash ? "match" : "mismatch";
  }

  const designUserId = resolveDesignSessionUserId(session);
  if (!designUserId) return "unknown";
  return liveMainUserId.toLowerCase() === designUserId.toLowerCase() ? "match" : "mismatch";
}

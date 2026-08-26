/**
 * Best-effort compare: Main HS256 SSO user vs Design BFF session.
 *
 * Plan A (0825-N01): prefer server ``mainSsoStatus`` from GET /auth/session.
 * Cookie JWT decode is fallback only when status is absent/unknown (legacy /
 * non-embed). HttpOnly Plan B cookies are invisible to document.cookie.
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
  // Web Crypto only — keep this module client-bundle safe (no `node:crypto`).
  const subtle = globalThis.crypto?.subtle;
  if (typeof subtle?.digest !== "function") {
    throw new Error("Web Crypto subtle.digest is required to hash Main SSO user ids");
  }
  const data = new TextEncoder().encode(normalized);
  const digest = await subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

  const serverStatus = session.mainSsoStatus?.trim().toLowerCase();
  if (serverStatus === "mismatch") return "mismatch";
  if (serverStatus === "match") return "match";

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

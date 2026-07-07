import type { AppTheme } from "../types";
import { peekTeamverAuthReturnPending } from "./teamverAuthReturn";
import { isTeamverEmbedMode } from "./designApiBase";

const COSMETIC_LAUNCH_PARAMS = ["theme", "locale"] as const;
const LAUNCH_PREFS_KEY = "teamver:embed-launch-prefs";

type LaunchPrefs = {
  theme?: AppTheme;
  locale?: string;
};

function isThemePreference(value: string | null): value is AppTheme {
  return value === "light" || value === "dark" || value === "system";
}

export function isTeamverAuthCallbackPath(pathname = window.location.pathname): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/auth/callback";
}

/** Main FE → Design return may still be in flight — avoid a second login redirect. */
export function shouldDeferEmbedLoginRedirect(): boolean {
  if (!isTeamverEmbedMode()) return false;
  if (isTeamverAuthCallbackPath()) return true;
  if (peekTeamverAuthReturnPending()) return true;
  return false;
}

export function stripCosmeticLaunchSearchParams(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of COSMETIC_LAUNCH_PARAMS) {
    params.delete(key);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/** Store return path without theme/locale so auth hops don't loop cosmetic query params. */
export function resolveEmbedAuthReturnPath(pathname: string, search = ""): string {
  const stripped = stripCosmeticLaunchSearchParams(search);
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${path}${stripped}`;
}

export function normalizeEmbedAuthReturnDestination(returnTo: string, fallback = "/"): string {
  const trimmed = returnTo.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  const queryIndex = trimmed.indexOf("?");
  if (queryIndex === -1) return trimmed || fallback;
  const pathname = trimmed.slice(0, queryIndex) || "/";
  const search = stripCosmeticLaunchSearchParams(trimmed.slice(queryIndex));
  return `${pathname}${search}` || fallback;
}

function stashLaunchPrefs(prefs: LaunchPrefs): void {
  if (!prefs.theme && !prefs.locale) return;
  try {
    sessionStorage.setItem(LAUNCH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // sessionStorage blocked
  }
}

export function consumeEmbedLaunchPrefs(): LaunchPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(LAUNCH_PREFS_KEY);
    sessionStorage.removeItem(LAUNCH_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LaunchPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Main FE appends `?theme=` / `?locale=` on cross-app launch. Read once,
 * stash for App boot, and strip from the address bar to avoid auth-loop URLs
 * like `/auth/callback/?theme=system`.
 */
export function scrubCosmeticLaunchParamsFromBrowserUrl(): LaunchPrefs {
  if (typeof window === "undefined") return {};
  const url = new URL(window.location.href);
  const themeRaw = url.searchParams.get("theme");
  const localeRaw = url.searchParams.get("locale");
  const prefs: LaunchPrefs = {};
  if (isThemePreference(themeRaw)) prefs.theme = themeRaw;
  if (localeRaw?.trim()) prefs.locale = localeRaw.trim();

  let changed = false;
  for (const key of COSMETIC_LAUNCH_PARAMS) {
    if (!url.searchParams.has(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  if (changed) {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
  if (prefs.theme || prefs.locale) stashLaunchPrefs(prefs);
  return prefs;
}

export function finishEmbedAuthNavigation(returnTo: string, fallback = "/"): void {
  const destination = normalizeEmbedAuthReturnDestination(returnTo, fallback);
  window.location.replace(destination);
}

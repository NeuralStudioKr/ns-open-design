/**
 * Teamver build-time env — safe during Next.js SSR/static export (`import.meta.env` may be absent).
 *
 * Known keys must use static `process.env.VITE_*` access so Next can inline
 * values from `next.config.ts` `env` into the client bundle. Dynamic
 * `process.env[key]` is opaque to the bundler and always undefined in the browser.
 */
const STATIC_TEAMVER_VITE_ENV: Record<string, string | undefined> = {
  VITE_TEAMVER_EMBED: typeof process !== "undefined" ? process.env.VITE_TEAMVER_EMBED : undefined,
  VITE_TEAMVER_DESIGN_API_URL:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_DESIGN_API_URL : undefined,
  VITE_TEAMVER_BOOTSTRAP_ENABLED:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_BOOTSTRAP_ENABLED : undefined,
  VITE_TEAMVER_MAIN_LOGIN_URL:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_MAIN_LOGIN_URL : undefined,
  VITE_TEAMVER_BRAND_TITLE:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_BRAND_TITLE : undefined,
  VITE_TEAMVER_BRAND_SUBTITLE:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_BRAND_SUBTITLE : undefined,
  VITE_TEAMVER_FAVICON_URL:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_FAVICON_URL : undefined,
  VITE_TEAMVER_LOGO_URL:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_LOGO_URL : undefined,
  VITE_TEAMVER_LOGO_URL_DARK:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_LOGO_URL_DARK : undefined,
  VITE_TEAMVER_NAV_MARK_URL:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_NAV_MARK_URL : undefined,
  VITE_TEAMVER_HERO_TITLE:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_HERO_TITLE : undefined,
  VITE_TEAMVER_HERO_SUBTITLE:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_HERO_SUBTITLE : undefined,
  VITE_TEAMVER_SITE_URL:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_SITE_URL : undefined,
  VITE_TEAMVER_OG_IMAGE_URL:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_OG_IMAGE_URL : undefined,
  VITE_TEAMVER_OG_TITLE:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_OG_TITLE : undefined,
  VITE_TEAMVER_DRIVE_PUBLISH_FOLDER_ID:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_DRIVE_PUBLISH_FOLDER_ID : undefined,
  VITE_TEAMVER_DRIVE_PUBLISH_SHARED_DRIVE_ID:
    typeof process !== "undefined"
      ? process.env.VITE_TEAMVER_DRIVE_PUBLISH_SHARED_DRIVE_ID
      : undefined,
  VITE_TEAMVER_EXPORT_ASYNC_JOBS_ENABLED:
    typeof process !== "undefined"
      ? process.env.VITE_TEAMVER_EXPORT_ASYNC_JOBS_ENABLED
      : undefined,
  VITE_TEAMVER_DRAW_ANNOTATION_ENABLE:
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_DRAW_ANNOTATION_ENABLE : undefined,
  VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE:
    typeof process !== "undefined"
      ? process.env.VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE
      : undefined,
  VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE:
    typeof process !== "undefined"
      ? process.env.VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE
      : undefined,
};

export function readTeamverViteEnv(key: string): string | undefined {
  const fromStatic = STATIC_TEAMVER_VITE_ENV[key];
  if (typeof fromStatic === "string" && fromStatic.trim()) {
    return fromStatic.trim();
  }

  if (typeof process !== "undefined") {
    const fromProcess = process.env[key];
    if (typeof fromProcess === "string" && fromProcess.trim()) {
      return fromProcess.trim();
    }
  }

  const metaEnv = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  const fromMeta = metaEnv?.[key];
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim();
  }
  return undefined;
}

export function isTeamverViteDev(): boolean {
  const metaEnv = typeof import.meta !== "undefined" ? import.meta.env : undefined;
  if (metaEnv?.DEV === true) return true;
  return typeof process !== "undefined" && process.env.NODE_ENV === "development";
}

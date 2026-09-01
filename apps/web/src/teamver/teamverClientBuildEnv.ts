/** Teamver bake-time env keys inlined into the Next.js client bundle via `next.config.ts`. */
export const TEAMVER_CLIENT_BUILD_ENV_KEYS = [
  'VITE_TEAMVER_EMBED',
  'VITE_TEAMVER_BOOTSTRAP_ENABLED',
  'VITE_TEAMVER_MAIN_LOGIN_URL',
  'VITE_TEAMVER_API_PROTOCOL',
  'VITE_TEAMVER_API_MODEL',
  'VITE_TEAMVER_API_BASE_URL',
  'VITE_TEAMVER_DESIGN_API_URL',
  'VITE_TEAMVER_MAIN_API_URL',
  'VITE_TEAMVER_BRAND_SUBTITLE',
  'VITE_TEAMVER_BRAND_TITLE',
  'VITE_TEAMVER_FAVICON_URL',
  'VITE_TEAMVER_LOGO_URL',
  'VITE_TEAMVER_LOGO_DARK_URL',
  'VITE_TEAMVER_NAV_MARK_URL',
  'VITE_TEAMVER_HERO_TITLE',
  'VITE_TEAMVER_HERO_SUBTITLE',
  'VITE_TEAMVER_SITE_URL',
  'VITE_TEAMVER_OG_IMAGE_URL',
  'VITE_TEAMVER_DRAW_ANNOTATION_ENABLE',
  'VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE',
  'VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE',
  'VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE',
  'VITE_MESSAGE_PERSIST_THROTTLE_MS',
] as const;

export function readTeamverClientBuildEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TEAMVER_CLIENT_BUILD_ENV_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

/** Teamver embed build-time env (Next static export / Turbopack). */
interface ImportMetaEnv {
  readonly VITE_TEAMVER_EMBED?: string;
  readonly VITE_TEAMVER_BOOTSTRAP_ENABLED?: string;
  readonly VITE_TEAMVER_MAIN_LOGIN_URL?: string;
  readonly VITE_TEAMVER_API_PROTOCOL?: string;
  readonly VITE_TEAMVER_API_MODEL?: string;
  readonly VITE_TEAMVER_API_BASE_URL?: string;
  readonly VITE_TEAMVER_DESIGN_API_URL?: string;
  readonly VITE_TEAMVER_MAIN_API_URL?: string;
  readonly VITE_TEAMVER_BRAND_SUBTITLE?: string;
  readonly VITE_TEAMVER_BRAND_TITLE?: string;
  readonly VITE_TEAMVER_FAVICON_URL?: string;
  readonly VITE_TEAMVER_LOGO_URL?: string;
  readonly VITE_TEAMVER_LOGO_DARK_URL?: string;
  readonly VITE_TEAMVER_NAV_MARK_URL?: string;
  readonly VITE_TEAMVER_HERO_TITLE?: string;
  readonly VITE_TEAMVER_HERO_SUBTITLE?: string;
  /** Opt-in PPTX export in Teamver embed (prd default off). */
  readonly VITE_TEAMVER_PPTX_EXPORT_ENABLE?: string;
  /** BYOK streaming daemon message PUT throttle (ms). Set at Docker build via deploy .env. */
  readonly VITE_MESSAGE_PERSIST_THROTTLE_MS?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
  /** @deprecated PPTX export is always on; bake-time value ignored. */
  readonly VITE_TEAMVER_PPTX_EXPORT_ENABLE?: string;
  readonly VITE_TEAMVER_EXPORT_ASYNC_JOBS_ENABLED?: string;
  readonly VITE_TEAMVER_DRAW_ANNOTATION_ENABLE?: string;
  /** Staging HTML source-tab copy. Off in prod embed unless =1. */
  readonly VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE?: string;
  /** Manual Edit box resize/move/promote drag. Off in prod embed unless =1. */
  readonly VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE?: string;
  /** Template clone fill mode. Default prompt; deterministic is opt-in rollback-safe path. */
  readonly VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE?: string;
  readonly VITE_TEAMVER_SITE_URL?: string;
  readonly VITE_TEAMVER_OG_IMAGE_URL?: string;
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

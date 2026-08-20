/** Static paths under `apps/web/public/teamver/`. */
export const TEAMVER_BRAND_ASSETS = {
  /** Full wordmark — light theme (black glyphs on transparent). Source: slide_bk. */
  logoLight: "/teamver/teamver-slide-light.png",
  /** Full wordmark — dark theme (white glyphs on transparent). Source: slide_wh. */
  logoDark: "/teamver/teamver-slide-dark.png",
  /** Compact rail mark (slide `Logo-icon.svg`). */
  navMark: "/teamver/Logo-icon.svg",
  /** fe-v2 favicon assets are not vendored; compact mark works in tab + apple-touch. */
  favicon: "/teamver/Logo-icon.svg",
  favicon32: "/teamver/Logo-icon.svg",
  /** Open Graph / Twitter card (1200×630). Source: slide_opengraph. */
  ogImage: "/teamver/teamver-slide-opengraph.png",
} as const;

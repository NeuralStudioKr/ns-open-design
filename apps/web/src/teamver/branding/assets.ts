/** Static paths under `apps/web/public/teamver/`. */
export const TEAMVER_BRAND_ASSETS = {
  /** Full wordmark — light theme (light background). */
  logoLight: "/teamver/teamver-design-light.png",
  /** Full wordmark — dark theme (dark background). */
  logoDark: "/teamver/teamver-design-dark.png",
  /** Compact rail mark (slide `Logo-icon.svg`). */
  navMark: "/teamver/Logo-icon.svg",
  /** fe-v2 favicon assets are not vendored; compact mark works in tab + apple-touch. */
  favicon: "/teamver/Logo-icon.svg",
  favicon32: "/teamver/Logo-icon.svg",
  /** Open Graph / Twitter card (1200×630). */
  ogImage: "/teamver/teamver-design-opengraph.png",
} as const;

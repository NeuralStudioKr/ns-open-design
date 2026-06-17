/** Static paths under `apps/web/public/teamver/` — sourced from ns-teamver-fe-v2 / ns-teamver-slide. */
export const TEAMVER_BRAND_ASSETS = {
  /** Full wordmark — light surfaces (fe-v2 `Logo.svg`). */
  logoLight: "/teamver/Logo.svg",
  /** Full wordmark — dark surfaces (fe-v2 `Logo-dark.svg`). */
  logoDark: "/teamver/Logo-dark.svg",
  /** Compact rail mark (slide `Logo-icon.svg`). */
  navMark: "/teamver/Logo-icon.svg",
  /** fe-v2 favicon assets are not vendored; compact mark works in tab + apple-touch. */
  favicon: "/teamver/Logo-icon.svg",
  favicon32: "/teamver/Logo-icon.svg",
} as const;

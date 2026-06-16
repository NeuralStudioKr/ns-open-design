/** Teamver build-time env — safe during Next.js SSR/static export (`import.meta.env` may be absent). */
export function readTeamverViteEnv(key: string): string | undefined {
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

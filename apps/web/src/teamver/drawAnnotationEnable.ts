import { isTeamverEmbedMode } from './designApiBase';
import { readTeamverViteEnv } from './teamverViteEnv';

function isTeamverStagingDesignHost(): boolean {
  const siteUrl = readTeamverViteEnv('VITE_TEAMVER_SITE_URL')?.toLowerCase() ?? '';
  if (siteUrl.includes('stg-design.teamver.com')) return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'stg-design.teamver.com';
}

/**
 * Teamver embed draw/mark annotation toolbar.
 * Default off in embed until capture + upload are stable in production.
 * Staging enables via `VITE_TEAMVER_DRAW_ANNOTATION_ENABLE=1` at image bake time.
 */
export function isTeamverDrawAnnotationEnabled(): boolean {
  const fromEnv = readTeamverViteEnv('VITE_TEAMVER_DRAW_ANNOTATION_ENABLE')?.toLowerCase();
  if (fromEnv === '1' || fromEnv === 'true' || fromEnv === 'yes') return true;
  if (fromEnv === '0' || fromEnv === 'false' || fromEnv === 'no') return false;
  if (!isTeamverEmbedMode()) return true;
  return isTeamverStagingDesignHost();
}

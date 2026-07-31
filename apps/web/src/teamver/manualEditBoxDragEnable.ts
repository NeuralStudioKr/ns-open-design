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
 * Teamver embed WIP chrome for Manual Edit ship-gates:
 * - box drag (resize handles + move/promote)
 * - file revision undo/redo toolbar + history panel
 *
 * Default off in production embed until those tracks are prod-ready.
 * Staging enables via `VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE=1` at image bake
 * time, or automatically on stg-design when the flag is unset.
 * Manual Edit mode toggle + inspector panel stay available either way.
 */
export function isTeamverManualEditBoxDragEnabled(): boolean {
  const fromEnv = readTeamverViteEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE')?.toLowerCase();
  if (fromEnv === '1' || fromEnv === 'true' || fromEnv === 'yes') return true;
  if (fromEnv === '0' || fromEnv === 'false' || fromEnv === 'no') return false;
  if (!isTeamverEmbedMode()) return true;
  return isTeamverStagingDesignHost();
}

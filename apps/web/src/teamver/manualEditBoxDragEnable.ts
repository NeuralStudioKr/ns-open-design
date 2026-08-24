import { readTeamverViteEnv } from './teamverViteEnv';

/**
 * Teamver embed chrome for Manual Edit box drag (resize handles + move/promote)
 * and the linked file-revision undo/redo toolbar.
 *
 * Default **on** after 51/52/53 ship-gate on staging. Opt out with
 * `VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE=0` (or false/no) at image bake time.
 * Manual Edit mode toggle + inspector panel stay available either way.
 */
export function isTeamverManualEditBoxDragEnabled(): boolean {
  const fromEnv = readTeamverViteEnv('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE')?.toLowerCase();
  if (fromEnv === '0' || fromEnv === 'false' || fromEnv === 'no') return false;
  if (fromEnv === '1' || fromEnv === 'true' || fromEnv === 'yes') return true;
  return true;
}

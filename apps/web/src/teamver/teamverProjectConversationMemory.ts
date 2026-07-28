const STORAGE_KEY = "teamver:project-last-conversation";

type MemoryMap = Record<string, string>;

function readMap(): MemoryMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as MemoryMap;
  } catch {
    return {};
  }
}

function writeMap(map: MemoryMap): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage may be unavailable in embedded / private modes.
  }
}

/** Remember the last conversation the user had open in a project (this tab). */
export function rememberTeamverProjectConversation(
  projectId: string,
  conversationId: string,
): void {
  const id = projectId.trim();
  const conversation = conversationId.trim();
  if (!id || !conversation) return;
  const map = readMap();
  if (map[id] === conversation) return;
  map[id] = conversation;
  writeMap(map);
}

export function readRememberedTeamverProjectConversation(
  projectId: string,
): string | null {
  const id = projectId.trim();
  if (!id) return null;
  const remembered = readMap()[id];
  return typeof remembered === "string" && remembered.trim() ? remembered.trim() : null;
}

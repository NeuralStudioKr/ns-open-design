/** Canvas → Design T2 handoff query (no Drive asset). */

const SESSION_PARAM = "teamverCanvasSessionId";
const ARTIFACT_PARAM = "teamverCanvasArtifactId";
const REV_PARAM = "teamverCanvasRev";
const INTENT_PARAM = "teamverDriveIntent";

export type TeamverCanvasLaunchHandoff = {
  sessionId: string;
  artifactId: string;
  revision?: string;
};

export function readTeamverCanvasLaunchHandoff(): TeamverCanvasLaunchHandoff | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get(SESSION_PARAM)?.trim() ?? "";
  const artifactId = params.get(ARTIFACT_PARAM)?.trim() ?? "";
  if (!sessionId || !artifactId) return null;
  const revision = params.get(REV_PARAM)?.trim() || undefined;
  return { sessionId, artifactId, revision };
}

export function isCanvasCreateSlidesIntent(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(INTENT_PARAM) === "create-slides";
}

export function consumeTeamverCanvasLaunchHandoff(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete(SESSION_PARAM);
  url.searchParams.delete(ARTIFACT_PARAM);
  url.searchParams.delete(REV_PARAM);
  // Keep intent deletion with canvas consume when this was a canvas handoff;
  // Drive handoff has its own consume that also clears intent.
  if (url.searchParams.get(INTENT_PARAM) === "create-slides") {
    url.searchParams.delete(INTENT_PARAM);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function buildTeamverCanvasLaunchHandoffQuery(handoff: TeamverCanvasLaunchHandoff): string {
  const params = new URLSearchParams();
  params.set(SESSION_PARAM, handoff.sessionId.trim());
  params.set(ARTIFACT_PARAM, handoff.artifactId.trim());
  if (handoff.revision?.trim()) params.set(REV_PARAM, handoff.revision.trim());
  params.set(INTENT_PARAM, "create-slides");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

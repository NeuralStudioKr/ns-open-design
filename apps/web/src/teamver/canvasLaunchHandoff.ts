/** Canvas → Design T2 handoff query (no Drive asset). */

const SESSION_PARAM = "teamverCanvasSessionId";
const ARTIFACT_PARAM = "teamverCanvasArtifactId";
const REV_PARAM = "teamverCanvasRev";
const TITLE_PARAM = "teamverCanvasTitle";
const PREVIEW_PARAM = "teamverCanvasPreview";
const THREAD_PARAM = "teamverCanvasThread";
const SECTIONS_PARAM = "teamverCanvasSections";
const UPDATED_PARAM = "teamverCanvasUpdatedAt";
const INTENT_PARAM = "teamverDriveIntent";

export type TeamverCanvasLaunchHandoff = {
  sessionId: string;
  artifactId: string;
  revision?: string;
  /** Display-only fields from Main URL (optional). */
  title?: string;
  preview?: string;
  threadTitle?: string;
  sectionCount?: number;
  updatedAt?: string;
};

function readOptionalParam(params: URLSearchParams, key: string, max = 240): string | undefined {
  const value = params.get(key)?.trim();
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function readTeamverCanvasLaunchHandoff(): TeamverCanvasLaunchHandoff | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get(SESSION_PARAM)?.trim() ?? "";
  const artifactId = params.get(ARTIFACT_PARAM)?.trim() ?? "";
  if (!sessionId || !artifactId) return null;
  const revision = readOptionalParam(params, REV_PARAM, 80);
  const title = readOptionalParam(params, TITLE_PARAM, 80);
  const preview = readOptionalParam(params, PREVIEW_PARAM, 180);
  const threadTitle = readOptionalParam(params, THREAD_PARAM, 80);
  const updatedAt = readOptionalParam(params, UPDATED_PARAM, 80) || revision;
  const sectionsRaw = params.get(SECTIONS_PARAM)?.trim() ?? "";
  const sectionCountParsed = Number(sectionsRaw);
  const sectionCount =
    sectionsRaw && Number.isFinite(sectionCountParsed) && sectionCountParsed > 0
      ? Math.min(Math.floor(sectionCountParsed), 999)
      : undefined;
  return {
    sessionId,
    artifactId,
    ...(revision ? { revision } : {}),
    ...(title ? { title } : {}),
    ...(preview ? { preview } : {}),
    ...(threadTitle ? { threadTitle } : {}),
    ...(sectionCount != null ? { sectionCount } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
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
  url.searchParams.delete(TITLE_PARAM);
  url.searchParams.delete(PREVIEW_PARAM);
  url.searchParams.delete(THREAD_PARAM);
  url.searchParams.delete(SECTIONS_PARAM);
  url.searchParams.delete(UPDATED_PARAM);
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
  if (handoff.title?.trim()) params.set(TITLE_PARAM, handoff.title.trim());
  if (handoff.preview?.trim()) params.set(PREVIEW_PARAM, handoff.preview.trim());
  if (handoff.threadTitle?.trim()) params.set(THREAD_PARAM, handoff.threadTitle.trim());
  if (handoff.sectionCount != null && handoff.sectionCount > 0) {
    params.set(SECTIONS_PARAM, String(handoff.sectionCount));
  }
  if (handoff.updatedAt?.trim()) params.set(UPDATED_PARAM, handoff.updatedAt.trim());
  params.set(INTENT_PARAM, "create-slides");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

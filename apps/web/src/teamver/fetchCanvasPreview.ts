import { NetworkError } from "@teamver/app-sdk";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  shouldSkipTeamverBffAuthCalls,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { requireActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";
import type { TeamverCanvasLaunchHandoff } from "./canvasLaunchHandoff";

export type TeamverCanvasPreview = {
  sessionId: string;
  artifactId: string;
  title?: string;
  preview?: string;
  threadTitle?: string;
  sectionCount?: number;
  headings?: string[];
  updatedAt?: string;
};

type CanvasPreviewResponse = {
  sessionId?: string;
  artifactId?: string;
  title?: string | null;
  preview?: string | null;
  threadTitle?: string | null;
  sectionCount?: number | null;
  headings?: string[] | null;
  updatedAt?: string | null;
};

/**
 * Live Canvas meta for one-confirm (no project required).
 * Falls back silently — callers keep URL handoff on failure.
 */
export async function fetchTeamverCanvasPreview(
  handoff: Pick<TeamverCanvasLaunchHandoff, "sessionId" | "artifactId">,
): Promise<TeamverCanvasPreview | null> {
  const client = getDesignBffClient();
  if (!client) return null;
  if (shouldSkipTeamverBffAuthCalls()) return null;

  const sessionId = handoff.sessionId.trim();
  const artifactId = handoff.artifactId.trim();
  if (!sessionId || !artifactId) return null;

  try {
    const workspaceId = await requireActiveTeamverWorkspaceId();
    await assertTeamverDesignAppEnabled(workspaceId);

    const query = new URLSearchParams({
      sessionId,
      artifactId,
    });
    const response = await withDesignBffCookieAuthRecovery(() =>
      client.http.get<CanvasPreviewResponse>(`/canvas/preview?${query.toString()}`, {
        workspaceId,
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      }),
    );

    const headings = Array.isArray(response.headings)
      ? response.headings.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : [];
    return {
      sessionId: response.sessionId?.trim() || sessionId,
      artifactId: response.artifactId?.trim() || artifactId,
      ...(response.title?.trim() ? { title: response.title.trim() } : {}),
      ...(response.preview?.trim() ? { preview: response.preview.trim() } : {}),
      ...(response.threadTitle?.trim() ? { threadTitle: response.threadTitle.trim() } : {}),
      ...(typeof response.sectionCount === "number" && response.sectionCount > 0
        ? { sectionCount: response.sectionCount }
        : {}),
      ...(headings.length > 0 ? { headings } : {}),
      ...(response.updatedAt?.trim() ? { updatedAt: response.updatedAt.trim() } : {}),
    };
  } catch (err) {
    if (err instanceof NetworkError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    return null;
  }
}

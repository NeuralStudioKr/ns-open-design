import { useEffect, useState } from 'react';

import { shouldUseTeamverAuthenticatedProjectRawFetch } from '../teamver/designApiBase';
import {
  clearProjectRawFileMissing,
  isProjectRawFileKnownMissing,
  markProjectRawFileMissing,
} from '../utils/projectFileFetchCache';
import { fetchProjectFilePresignedGet } from '../utils/projectFilePresign';

export type ProjectFileSignedUrlState = {
  src: string | null;
  loading: boolean;
  failed: boolean;
  /** Object confirmed missing via mint 404 — callers must not `/raw/` fallback. */
  missing: boolean;
  expiresAt: string | null;
};

type HookOptions = {
  enabled?: boolean;
  trustExists?: boolean;
};

/**
 * Resolve a short-lived S3 GET URL for Teamver embed image loads.
 */
export function useProjectFileSignedUrl(
  projectId: string | null | undefined,
  filePath: string | null | undefined,
  rev?: string | number | null,
  options: HookOptions = {},
): ProjectFileSignedUrlState {
  const enabled = options.enabled !== false;
  const trustExists = Boolean(options.trustExists);
  const usePresign = enabled && shouldUseTeamverAuthenticatedProjectRawFetch();
  const [state, setState] = useState<ProjectFileSignedUrlState>({
    src: null,
    loading: Boolean(usePresign && projectId && filePath),
    failed: false,
    missing: false,
    expiresAt: null,
  });

  useEffect(() => {
    const id = typeof projectId === 'string' ? projectId.trim() : '';
    const path = typeof filePath === 'string' ? filePath.trim() : '';
    if (!usePresign || !id || !path) {
      setState({ src: null, loading: false, failed: false, missing: false, expiresAt: null });
      return;
    }
    if (!trustExists && isProjectRawFileKnownMissing(id, path)) {
      setState({ src: null, loading: false, failed: true, missing: true, expiresAt: null });
      return;
    }

    let cancelled = false;
    setState({ src: null, loading: true, failed: false, missing: false, expiresAt: null });

    void (async () => {
      const result = await fetchProjectFilePresignedGet(id, path);
      if (cancelled) return;
      if (result.kind === 'ready') {
        clearProjectRawFileMissing(id, path);
        setState({
          src: result.mint.url,
          loading: false,
          failed: false,
          missing: false,
          expiresAt: result.mint.expiresAt,
        });
        return;
      }
      if (result.kind === 'missing') {
        markProjectRawFileMissing(id, path);
        setState({ src: null, loading: false, failed: true, missing: true, expiresAt: null });
        return;
      }
      setState({ src: null, loading: false, failed: true, missing: false, expiresAt: null });
    })().catch(() => {
      if (cancelled) return;
      setState({ src: null, loading: false, failed: true, missing: false, expiresAt: null });
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, projectId, rev, trustExists, usePresign]);

  return state;
}

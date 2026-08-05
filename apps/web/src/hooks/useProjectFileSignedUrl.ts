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
  expiresAt: string | null;
};

type HookOptions = {
  enabled?: boolean;
  trustExists?: boolean;
};

/**
 * Resolve a short-lived S3 GET URL for Teamver embed image loads.
 * Falls back to `{ src: null, failed: true }` so callers can use `/raw/` blob.
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
    expiresAt: null,
  });

  useEffect(() => {
    const id = typeof projectId === 'string' ? projectId.trim() : '';
    const path = typeof filePath === 'string' ? filePath.trim() : '';
    if (!usePresign || !id || !path) {
      setState({ src: null, loading: false, failed: false, expiresAt: null });
      return;
    }
    if (!trustExists && isProjectRawFileKnownMissing(id, path)) {
      setState({ src: null, loading: false, failed: true, expiresAt: null });
      return;
    }

    let cancelled = false;
    setState({ src: null, loading: true, failed: false, expiresAt: null });

    void (async () => {
      const minted = await fetchProjectFilePresignedGet(id, path);
      if (cancelled) return;
      if (!minted) {
        setState({ src: null, loading: false, failed: true, expiresAt: null });
        return;
      }
      clearProjectRawFileMissing(id, path);
      setState({
        src: minted.url,
        loading: false,
        failed: false,
        expiresAt: minted.expiresAt,
      });
    })().catch(() => {
      if (cancelled) return;
      setState({ src: null, loading: false, failed: true, expiresAt: null });
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, projectId, rev, trustExists, usePresign]);

  return state;
}

/** @internal vitest helper */
export function markPresignMissAsRawMissing(projectId: string, path: string): void {
  markProjectRawFileMissing(projectId, path);
}

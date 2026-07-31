import { useEffect, useState } from 'react';

import { projectRawUrl } from '../providers/registry';
import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';

/**
 * Teamver embed project files must be fetched with daemon auth headers.
 * Bare `/api/projects/.../raw/...` on `<img src>` can fail when cookies or
 * workspace headers are required for the request to succeed.
 */
export function useAuthenticatedProjectFileObjectUrl(
  projectId: string | null | undefined,
  filePath: string | null | undefined,
): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const path = String(filePath || '').trim();
    if (!projectId || !path) {
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    let revokeUrl: string | null = null;

    void (async () => {
      try {
        const resp = await fetchTeamverDaemon(projectRawUrl(projectId, path), {
          cache: 'no-store',
          teamverProjectId: projectId,
        });
        if (!resp.ok || cancelled) return;
        const blob = await resp.blob();
        if (cancelled || blob.size <= 0) return;
        const mime = String(blob.type || '').toLowerCase();
        // Reject HTML/JSON error bodies that somehow returned 200 — those
        // surface as broken <img> alt text in the chat thumbnail.
        if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') {
          return;
        }
        revokeUrl = URL.createObjectURL(blob);
        setObjectUrl(revokeUrl);
      } catch {
        if (!cancelled) setObjectUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      setObjectUrl(null);
    };
  }, [filePath, projectId]);

  return objectUrl;
}

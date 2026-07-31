import { useCallback, useState } from 'react';

import { projectRawUrl } from '../providers/registry';
import {
  loadAuthenticatedProjectFileBlob,
  useAuthenticatedProjectFileObjectUrl,
} from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { isTeamverEmbedMode } from '../teamver/designApiBase';

type AuthenticatedProjectFileImageProps = {
  projectId: string;
  path: string;
  alt?: string;
  className?: string;
  /** When false, skip authenticated raw GET (e.g. file already deleted). */
  fetchEnabled?: boolean;
  /** Refetch blob when the backing file changes (e.g. file mtime). */
  rev?: string | number;
  /**
   * File is known to exist in the project index (design panel row, staged
   * upload). Bypasses session 404 cache and drawing-path fetch guards.
   */
  trustExists?: boolean;
};

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (typeof FileReader === 'undefined') return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Renders a project file image. In Teamver embed, fetches with daemon auth
 * headers and uses a blob URL so thumbnails/previews do not show broken alt text.
 */
export function AuthenticatedProjectFileImage({
  projectId,
  path,
  alt = '',
  className,
  fetchEnabled = true,
  rev,
  trustExists = false,
}: AuthenticatedProjectFileImageProps) {
  const embed = isTeamverEmbedMode();
  const shouldFetch = fetchEnabled && embed;
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fallbackDataUrl, setFallbackDataUrl] = useState<string | null>(null);
  const objectUrl = useAuthenticatedProjectFileObjectUrl(
    shouldFetch ? projectId : null,
    shouldFetch ? path : null,
    shouldFetch ? `${rev ?? ''}:${reloadNonce}` : null,
    shouldFetch ? trustExists : false,
  );
  const src = embed ? (fallbackDataUrl || objectUrl) : projectRawUrl(projectId, path);

  const handleImageError = useCallback(() => {
    if (!shouldFetch || fallbackDataUrl) return;
    void (async () => {
      const blob = await loadAuthenticatedProjectFileBlob(projectId, path, { trustExists });
      if (!blob) {
        setReloadNonce((value) => value + 1);
        return;
      }
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl) {
        setFallbackDataUrl(dataUrl);
        return;
      }
      setReloadNonce((value) => value + 1);
    })();
  }, [fallbackDataUrl, path, projectId, shouldFetch, trustExists]);

  if (!fetchEnabled) return null;
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      onError={shouldFetch ? handleImageError : undefined}
    />
  );
}

import { useCallback, useEffect, useState } from 'react';

import { projectRawUrl } from '../providers/registry';
import {
  loadAuthenticatedProjectFileBlob,
  useAuthenticatedProjectFileObjectUrl,
} from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { Icon } from './Icon';

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

function projectRawUrlWithRev(projectId: string, path: string, rev?: string | number): string {
  const base = projectRawUrl(projectId, path);
  if (rev == null || rev === '') return base;
  return `${base}?v=${encodeURIComponent(String(rev))}`;
}

/**
 * Renders a project file image. In Teamver embed, fetches with daemon auth
 * headers and uses a blob URL; falls back to same-origin raw URL when fetch
 * fails but the file is reachable with session cookies.
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
  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
  const [useDirectRawUrl, setUseDirectRawUrl] = useState(false);
  const { src: objectUrl, loading, failed } = useAuthenticatedProjectFileObjectUrl(
    shouldFetch ? projectId : null,
    shouldFetch ? path : null,
    shouldFetch ? `${rev ?? ''}:${reloadNonce}` : null,
    shouldFetch ? trustExists : false,
  );
  const directRawUrl = projectRawUrlWithRev(projectId, path, rev);
  const authenticatedSrc = fallbackBlobUrl || objectUrl;
  const tryDirectRawUrl = useDirectRawUrl
    || (shouldFetch && failed && !loading && !authenticatedSrc);
  const src = embed
    ? (tryDirectRawUrl ? directRawUrl : authenticatedSrc)
    : directRawUrl;

  useEffect(() => {
    if (!shouldFetch) return;
    if (!failed || loading || authenticatedSrc) return;
    setUseDirectRawUrl(true);
  }, [authenticatedSrc, failed, loading, shouldFetch]);

  useEffect(() => {
    return () => {
      if (fallbackBlobUrl) URL.revokeObjectURL(fallbackBlobUrl);
    };
  }, [fallbackBlobUrl]);

  const handleImageError = useCallback(() => {
    if (!shouldFetch) return;
    if (!tryDirectRawUrl && !fallbackBlobUrl) {
      setUseDirectRawUrl(true);
      return;
    }
    if (fallbackBlobUrl) return;
    void (async () => {
      const blob = await loadAuthenticatedProjectFileBlob(projectId, path, { trustExists });
      if (!blob) {
        setReloadNonce((value) => value + 1);
        return;
      }
      setFallbackBlobUrl(URL.createObjectURL(blob));
    })();
  }, [fallbackBlobUrl, path, projectId, shouldFetch, trustExists, tryDirectRawUrl]);

  if (!fetchEnabled) return null;

  const loadingClass = `authenticated-project-file-image-loading${className ? ` ${className}` : ''}`;

  if (!src) {
    if (shouldFetch && failed && !loading && !tryDirectRawUrl) {
      return (
        <span
          className={`authenticated-project-file-image-failed${className ? ` ${className}` : ''}`}
          role="img"
          aria-label={alt || 'Image unavailable'}
        >
          <Icon name="file" size={12} />
        </span>
      );
    }
    return <div className={loadingClass} aria-hidden />;
  }

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

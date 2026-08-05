import { useCallback, useMemo, useState } from 'react';
import { projectRawUrl } from '../providers/registry';
import {
  useAuthenticatedProjectFileObjectUrl,
} from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { shouldUseTeamverAuthenticatedProjectRawFetch } from '../teamver/designApiBase';
import { buildAuthenticatedProjectRawImageUrl } from '../utils/authenticatedProjectRawImageUrl';
import { clearProjectRawFileMissing, isProjectRawFileKnownMissing } from '../utils/projectFileFetchCache';
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
   * upload). Enables basename/uploads/assets alternates and brief background
   * retry — never set for chat-history drawing screenshots that are gone.
   */
  trustExists?: boolean;
  /** Design panel / file viewer — use same-origin raw URL (browser cookies). */
  allowBackgroundRetry?: boolean;
};

const TRUSTED_IMAGE_ERROR_RETRIES = 2;

/**
 * Renders a project file image. In Teamver embed, chat thumbnails fetch via
 * daemon auth + blob URL to avoid 404 console noise. Indexed design-panel /
 * file-viewer previews use the same-origin raw URL directly — the browser
 * handles cookies, 304, and image/* MIME correctly (blob normalization was
 * dropping valid 200 responses).
 */
export function AuthenticatedProjectFileImage({
  projectId,
  path,
  alt = '',
  className,
  fetchEnabled = true,
  rev,
  trustExists = false,
  allowBackgroundRetry = false,
}: AuthenticatedProjectFileImageProps) {
  const useAuthenticatedFetch = shouldUseTeamverAuthenticatedProjectRawFetch();
  const [errorRetry, setErrorRetry] = useState(0);
  const preferDirectRawUrl =
    fetchEnabled
    && useAuthenticatedFetch
    && trustExists
    && allowBackgroundRetry;
  const directRawSrc = useMemo(
    () => (preferDirectRawUrl
      ? buildAuthenticatedProjectRawImageUrl(projectId, path, { rev, retry: errorRetry })
      : null),
    [errorRetry, path, preferDirectRawUrl, projectId, rev],
  );
  const shouldBlobFetch = fetchEnabled
    && useAuthenticatedFetch
    && !preferDirectRawUrl
    && (trustExists || !isProjectRawFileKnownMissing(projectId, path));
  const fetchRev = rev != null ? `${rev}:${errorRetry}` : errorRetry;
  const { src: objectUrl, loading, failed } = useAuthenticatedProjectFileObjectUrl(
    shouldBlobFetch ? projectId : null,
    shouldBlobFetch ? path : null,
    shouldBlobFetch ? fetchRev : null,
    shouldBlobFetch ? trustExists : false,
    shouldBlobFetch ? allowBackgroundRetry : false,
  );
  const fallbackDirectRawSrc = useMemo(
    () => (
      fetchEnabled
      && useAuthenticatedFetch
      && trustExists
      && !preferDirectRawUrl
      && failed
      && !loading
        ? buildAuthenticatedProjectRawImageUrl(projectId, path, { rev, retry: errorRetry })
        : null
    ),
    [
      errorRetry,
      failed,
      fetchEnabled,
      loading,
      path,
      preferDirectRawUrl,
      projectId,
      rev,
      trustExists,
      useAuthenticatedFetch,
    ],
  );
  const src = preferDirectRawUrl
    ? directRawSrc
    : useAuthenticatedFetch
      ? (objectUrl ?? fallbackDirectRawSrc)
      : projectRawUrl(projectId, path);

  const handleImageError = useCallback(() => {
    if (!trustExists || errorRetry >= TRUSTED_IMAGE_ERROR_RETRIES) return;
    clearProjectRawFileMissing(projectId, path);
    setErrorRetry((count) => count + 1);
  }, [errorRetry, path, projectId, trustExists]);

  if (!fetchEnabled) return null;

  const loadingClass = `authenticated-project-file-image-loading${className ? ` ${className}` : ''}`;

  if (!src) {
    if (shouldBlobFetch && failed && !loading) {
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
      onError={handleImageError}
    />
  );
}

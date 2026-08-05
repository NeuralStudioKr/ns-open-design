import { useCallback, useMemo, useState } from 'react';
import { projectRawUrl } from '../providers/registry';
import {
  useAuthenticatedProjectFileObjectUrl,
} from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { useProjectFileSignedUrl } from '../hooks/useProjectFileSignedUrl';
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
 * Renders a project file image. In Teamver embed, chat thumbnails prefer a
 * session-gated S3 presigned GET (no daemon byte proxy). Indexed design-panel /
 * file-viewer previews keep the same-origin raw URL. Authenticated `/raw/`
 * blob fetch remains the fallback when presign is disabled or fails.
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
  const [presignImgFailed, setPresignImgFailed] = useState(false);
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

  const shouldTryPresign = fetchEnabled
    && useAuthenticatedFetch
    && !preferDirectRawUrl
    && !presignImgFailed
    && (trustExists || !isProjectRawFileKnownMissing(projectId, path));
  const signed = useProjectFileSignedUrl(
    shouldTryPresign ? projectId : null,
    shouldTryPresign ? path : null,
    shouldTryPresign ? (rev != null ? `${rev}:${errorRetry}` : errorRetry) : null,
    { enabled: shouldTryPresign, trustExists },
  );

  const shouldBlobFetch = fetchEnabled
    && useAuthenticatedFetch
    && !preferDirectRawUrl
    && (presignImgFailed || signed.failed)
    && !signed.loading
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
      ? (signed.src && !presignImgFailed
          ? signed.src
          : (objectUrl ?? fallbackDirectRawSrc))
      : projectRawUrl(projectId, path);

  const handleImageError = useCallback(() => {
    if (signed.src && !presignImgFailed && src === signed.src) {
      setPresignImgFailed(true);
      return;
    }
    if (!trustExists || errorRetry >= TRUSTED_IMAGE_ERROR_RETRIES) return;
    clearProjectRawFileMissing(projectId, path);
    setErrorRetry((count) => count + 1);
  }, [errorRetry, path, presignImgFailed, projectId, signed.src, src, trustExists]);

  if (!fetchEnabled) return null;

  const loadingClass = `authenticated-project-file-image-loading${className ? ` ${className}` : ''}`;
  const waitingOnPresign = shouldTryPresign && signed.loading && !signed.src;
  const waitingOnBlob = shouldBlobFetch && loading && !objectUrl;

  if (!src) {
    if ((shouldBlobFetch && failed && !loading) || (shouldTryPresign && signed.failed && !shouldBlobFetch)) {
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
    if (waitingOnPresign || waitingOnBlob) {
      return <div className={loadingClass} aria-hidden />;
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

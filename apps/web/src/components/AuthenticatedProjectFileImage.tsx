import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { projectRawUrl } from '../providers/registry';
import {
  useAuthenticatedProjectFileObjectUrl,
} from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { useProjectFileSignedUrl } from '../hooks/useProjectFileSignedUrl';
import { shouldUseTeamverAuthenticatedProjectRawFetch } from '../teamver/designApiBase';
import { buildAuthenticatedProjectRawImageUrl } from '../utils/authenticatedProjectRawImageUrl';
import { clearProjectRawFileMissing, isProjectRawFileKnownMissing } from '../utils/projectFileFetchCache';
import { isEphemeralDrawingScreenshotPath } from '../utils/projectFilePaths';
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
  /**
   * Design panel / file viewer — allow `/raw/` scratch fallback when S3 mint
   * 404s (upload→sync-up race). Chat history must leave this false.
   */
  allowBackgroundRetry?: boolean;
  /** Replace the default broken-file icon when the image cannot be loaded. */
  failedFallback?: ReactNode;
};

const TRUSTED_IMAGE_ERROR_RETRIES = 2;

/**
 * Renders a project file image. In Teamver embed, prefers a session-gated S3
 * presigned GET so image bytes skip the daemon. `/raw/` is only a fallback when
 * mint is disabled/unavailable, or (trusted indexed files) when S3 lags scratch.
 * Mint 404 for untrusted chat drawings does **not** fall back to `/raw/`.
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
  failedFallback,
}: AuthenticatedProjectFileImageProps) {
  const useAuthenticatedFetch = shouldUseTeamverAuthenticatedProjectRawFetch();
  const [errorRetry, setErrorRetry] = useState(0);
  const [presignImgFailed, setPresignImgFailed] = useState(false);
  // Capture missing-at-mount so remounts of deleted files never re-enter the
  // scratch-race `/raw/` path (refs reset on remount; session cache does not).
  const [startedKnownMissing] = useState(() => isProjectRawFileKnownMissing(projectId, path));

  // Keep projectId/path wired even after a mint 404 — the signed-url hook
  // short-circuits on the missing cache. Passing null would reset `missing`
  // and lose the terminal failed UI.
  const shouldTryPresign = fetchEnabled && useAuthenticatedFetch && !presignImgFailed;
  const signed = useProjectFileSignedUrl(
    shouldTryPresign ? projectId : null,
    shouldTryPresign ? path : null,
    shouldTryPresign ? (rev != null ? `${rev}:${errorRetry}` : errorRetry) : null,
    {
      enabled: shouldTryPresign,
      trustExists,
      // Remounts that already knew the file was missing must not bypass the
      // session cache (would re-POST /presign-get on every open).
      allowBackgroundRetry: allowBackgroundRetry && !startedKnownMissing,
    },
  );

  // Mint unavailable (disabled/5xx): `/raw/` is appropriate.
  // Mint 404 scratch race (indexed file, S3 lag): one `/raw/` attempt only when
  // this mount did not start already-known-missing. Remounts stay quiet.
  const allowScratchRaceRaw =
    signed.missing
    && trustExists
    && allowBackgroundRetry
    && !startedKnownMissing;
  const allowRawFallback = signed.failed
    && !signed.loading
    && (
      !signed.missing
      || allowScratchRaceRaw
    );

  const shouldBlobFetch = fetchEnabled
    && useAuthenticatedFetch
    && (presignImgFailed || allowRawFallback)
    && !startedKnownMissing
    && (trustExists || !isProjectRawFileKnownMissing(projectId, path))
    // Chat-history drawings: never `/raw/` fallback (mint unavailable or 404).
    // Presign miss → failed glyph; avoids N× daemon proxy for GC'd screenshots.
    && !(!trustExists && isEphemeralDrawingScreenshotPath(path));
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
      && allowBackgroundRetry
      && !startedKnownMissing
      && failed
      && !loading
        ? buildAuthenticatedProjectRawImageUrl(projectId, path, { rev, retry: errorRetry })
        : null
    ),
    [
      allowBackgroundRetry,
      errorRetry,
      failed,
      fetchEnabled,
      loading,
      path,
      projectId,
      rev,
      startedKnownMissing,
      trustExists,
      useAuthenticatedFetch,
    ],
  );
  const src = useAuthenticatedFetch
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
  const terminalMissing =
    (startedKnownMissing || signed.missing)
    && !allowRawFallback
    && !signed.loading;

  if (!src) {
    if (
      terminalMissing
      || (shouldBlobFetch && failed && !loading)
      || (shouldTryPresign && signed.failed && !shouldBlobFetch && !signed.loading)
      || (startedKnownMissing && !signed.loading)
    ) {
      if (failedFallback !== undefined) return <>{failedFallback}</>;
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

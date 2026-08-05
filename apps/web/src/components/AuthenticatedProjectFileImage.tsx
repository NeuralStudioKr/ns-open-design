import { projectRawUrl } from '../providers/registry';
import {
  useAuthenticatedProjectFileObjectUrl,
} from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { isProjectRawFileKnownMissing } from '../utils/projectFileFetchCache';
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
  /** Design panel / staged upload only — bounded post-404 background retry. */
  allowBackgroundRetry?: boolean;
};

/**
 * Renders a project file image. In Teamver embed, fetches with daemon auth
 * headers and uses a blob URL so thumbnails do not spam raw GET 404s.
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
  const embed = isTeamverEmbedMode();
  const shouldFetch = fetchEnabled && embed && !isProjectRawFileKnownMissing(projectId, path);
  const { src: objectUrl, loading, failed } = useAuthenticatedProjectFileObjectUrl(
    shouldFetch ? projectId : null,
    shouldFetch ? path : null,
    shouldFetch ? rev ?? null : null,
    shouldFetch ? trustExists : false,
    shouldFetch ? allowBackgroundRetry : false,
  );
  const src = embed ? objectUrl : projectRawUrl(projectId, path);

  if (!fetchEnabled) return null;

  const loadingClass = `authenticated-project-file-image-loading${className ? ` ${className}` : ''}`;

  if (!src) {
    if (shouldFetch && failed && !loading) {
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
    />
  );
}

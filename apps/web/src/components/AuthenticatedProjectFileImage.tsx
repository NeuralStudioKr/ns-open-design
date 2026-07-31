import { projectRawUrl } from '../providers/registry';
import { useAuthenticatedProjectFileObjectUrl } from '../hooks/useAuthenticatedProjectFileObjectUrl';
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
};

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
}: AuthenticatedProjectFileImageProps) {
  const embed = isTeamverEmbedMode();
  const shouldFetch = fetchEnabled && embed;
  const objectUrl = useAuthenticatedProjectFileObjectUrl(
    shouldFetch ? projectId : null,
    shouldFetch ? path : null,
    shouldFetch ? rev : null,
  );
  const src = embed ? objectUrl : projectRawUrl(projectId, path);
  if (!fetchEnabled || !src) return null;
  return <img src={src} alt={alt} className={className} />;
}

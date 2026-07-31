import { projectRawUrl } from '../providers/registry';
import { useAuthenticatedProjectFileObjectUrl } from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { isTeamverEmbedMode } from '../teamver/designApiBase';

type AuthenticatedProjectFileImageProps = {
  projectId: string;
  path: string;
  alt?: string;
  className?: string;
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
}: AuthenticatedProjectFileImageProps) {
  const embed = isTeamverEmbedMode();
  const objectUrl = useAuthenticatedProjectFileObjectUrl(
    embed ? projectId : null,
    embed ? path : null,
  );
  const src = embed ? objectUrl : projectRawUrl(projectId, path);
  if (!src) return null;
  return <img src={src} alt={alt} className={className} />;
}

import { projectRawUrl } from '../providers/registry';

/** Same-origin raw image URL with optional cache-bust query for `<img src>`. */
export function buildAuthenticatedProjectRawImageUrl(
  projectId: string,
  path: string,
  options?: { rev?: string | number | null; retry?: number },
): string {
  const base = projectRawUrl(projectId, path);
  const params = new URLSearchParams();
  if (options?.rev != null && String(options.rev).length > 0) {
    params.set('v', String(options.rev));
  }
  if (typeof options?.retry === 'number' && options.retry > 0) {
    params.set('r', String(options.retry));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

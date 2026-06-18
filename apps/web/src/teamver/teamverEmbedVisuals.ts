import { resolveTeamverMainOrigin } from "./designApiBase";

type WorkspaceLike = {
  name?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  code?: string | null;
  s3ImageUrl?: string | null;
  s3_image_url?: string | null;
  imagePath?: string | null;
  image_path?: string | null;
};

type UserLike = {
  imageUrl?: string | null;
  image_url?: string | null;
  s3ImageUrl?: string | null;
  s3_image_url?: string | null;
  profileImageUrl?: string | null;
  profile_image_url?: string | null;
};

/** Main FE `workspaceNameInitial` 와 동일 — 첫 글자 1자 (한글·이모지 포함). */
export function workspaceNameInitial(
  workspace: WorkspaceLike | null | undefined,
): string {
  const name =
    workspace?.name?.trim() ||
    workspace?.displayName?.trim() ||
    workspace?.display_name?.trim() ||
    workspace?.code?.trim() ||
    "";
  if (!name) return "?";
  const first = [...name][0];
  if (!first) return "?";
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

export function readWorkspaceImageUrl(
  workspace: WorkspaceLike | null | undefined,
): string | null {
  if (!workspace) return null;
  const raw =
    workspace.s3ImageUrl?.trim() ||
    workspace.s3_image_url?.trim() ||
    workspace.imagePath?.trim() ||
    workspace.image_path?.trim() ||
    null;
  return resolveTeamverAssetUrl(raw);
}

export function readUserImageUrl(user: UserLike | null | undefined): string | null {
  if (!user) return null;
  const raw =
    user.imageUrl?.trim() ||
    user.image_url?.trim() ||
    user.s3ImageUrl?.trim() ||
    user.s3_image_url?.trim() ||
    user.profileImageUrl?.trim() ||
    user.profile_image_url?.trim() ||
    null;
  return resolveTeamverAssetUrl(raw);
}

/** Main FE `resolveProfileImageUrl` — 상대 경로는 Teamver 메인 오리진 기준. */
export function resolveTeamverAssetUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = resolveTeamverMainOrigin().replace(/\/+$/, "");
  return trimmed.startsWith("/") ? `${origin}${trimmed}` : `${origin}/${trimmed}`;
}

export function readDisplayInitial(label: string | null | undefined): string {
  const trimmed = label?.trim();
  if (!trimmed) return "?";
  const first = [...trimmed][0];
  if (!first) return "?";
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

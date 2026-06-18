import { resolveTeamverMainOrigin } from "./designApiBase";
import type { DesignAuthSessionUser } from "./designBffClient";

type WorkspaceLike = {
  name?: string | null;
  displayName?: string | null;
  code?: string | null;
  s3ImageUrl?: string | null;
  imagePath?: string | null;
};

/** Main FE `workspaceNameInitial` 와 동일 — 첫 글자 1자 (한글·이모지 포함). */
export function workspaceNameInitial(
  workspace: WorkspaceLike | null | undefined,
): string {
  const name =
    workspace?.name?.trim() ||
    workspace?.displayName?.trim() ||
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
    workspace.imagePath?.trim() ||
    null;
  return resolveTeamverAssetUrl(raw);
}

export function readUserImageUrl(
  user: DesignAuthSessionUser | null | undefined,
): string | null {
  if (!user) return null;
  const raw =
    user.imageUrl?.trim() ||
    user.s3ImageUrl?.trim() ||
    user.profileImageUrl?.trim() ||
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

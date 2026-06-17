import { useTeamverEmbed } from "./useTeamverEmbed";

/** @deprecated use useTeamverEmbed */
export function useTeamverSession(enabled: boolean) {
  const embed = useTeamverEmbed(enabled);
  return {
    loading: embed.loading,
    authenticated: embed.authenticated,
    userLabel: embed.userLabel,
    defaultWorkspaceId: embed.activeWorkspaceId,
    error: embed.error,
  };
}

export type { TeamverEmbedState } from "./useTeamverEmbed";

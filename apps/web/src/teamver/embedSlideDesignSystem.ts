import type { DesignSystemSummary } from '../types';

export type EmbedSlideDesignSystemPick = Pick<
  DesignSystemSummary,
  'id' | 'title' | 'source' | 'status' | 'isEditable'
>;

function isPublishedDesignSystem(system: EmbedSlideDesignSystemPick): boolean {
  return (system.status ?? 'draft') === 'published';
}

/** Embed slide MVP: workspace default → built-in `default` → first official preset → personal. */
export function resolveEmbedSlideDesignSystemId(input: {
  explicitId: string | null | undefined;
  workspaceDefaultId: string | null | undefined;
  designSystems: EmbedSlideDesignSystemPick[];
}): string | null {
  const explicit = input.explicitId?.trim();
  if (explicit) return explicit;

  const catalog = input.designSystems.filter((system) => Boolean(system.title?.trim()));
  const workspaceDefault = input.workspaceDefaultId?.trim();
  if (workspaceDefault && catalog.some((system) => system.id === workspaceDefault)) {
    return workspaceDefault;
  }

  const builtInDefault = catalog.find((system) => system.id === 'default');
  if (builtInDefault && isPublishedDesignSystem(builtInDefault)) {
    return builtInDefault.id;
  }

  const officialPreset = catalog.find(
    (system) =>
      system.source !== 'user'
      && system.isEditable !== true
      && isPublishedDesignSystem(system),
  );
  if (officialPreset) return officialPreset.id;

  const personal = catalog.find(
    (system) =>
      (system.source === 'user' || system.isEditable === true)
      && isPublishedDesignSystem(system),
  );
  return personal?.id ?? null;
}

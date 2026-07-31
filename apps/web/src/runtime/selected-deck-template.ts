import type { ProjectMetadata } from '@open-design/contracts';

export type SelectedDeckTemplateMetadata = {
  id: string;
  title?: string;
};

export type DeckTemplateSendMeta = {
  skillIds?: string[];
  context?: {
    pluginIds?: string[];
    skillIds?: string[];
  };
};

export function selectedDeckTemplateMetadata(
  metadata: ProjectMetadata | null | undefined,
): SelectedDeckTemplateMetadata | null {
  const id = metadata?.selectedDeckTemplateId?.trim();
  if (!id) return null;
  const title = metadata?.selectedDeckTemplateTitle?.trim() || undefined;
  return { id, title };
}

/**
 * Keep the project's selected deck template first in per-turn skillIds so
 * API-mode / daemon ad-hoc skills cannot be shadowed by the scenario plugin.
 * Do not inject the visual template into context.pluginIds — that slot is for
 * the deck scenario / applied plugin only.
 */
export function enrichChatSendMetaWithProjectDeckTemplate<T extends DeckTemplateSendMeta>(
  meta: T | undefined,
  metadata: ProjectMetadata | null | undefined,
): T | undefined {
  const selected = selectedDeckTemplateMetadata(metadata);
  if (!selected) return meta;
  const existingSkillIds = meta?.skillIds ?? [];
  const priorPluginIds = (meta?.context?.pluginIds ?? []).filter((id) => id !== selected.id);
  const priorContextSkillIds = meta?.context?.skillIds ?? [];
  const skillIds = [selected.id, ...existingSkillIds.filter((id) => id !== selected.id)];
  const contextSkillIds = [
    selected.id,
    ...priorContextSkillIds.filter((id) => id !== selected.id),
  ];
  const { pluginIds: _dropTemplateFromPlugins, ...restContext } = meta?.context ?? {};
  return {
    ...(meta ?? ({} as T)),
    skillIds,
    context: {
      ...restContext,
      ...(priorPluginIds.length > 0 ? { pluginIds: priorPluginIds } : {}),
      skillIds: contextSkillIds,
    },
  };
}

/** Project metadata wins — URL/web-fetch turns must not route via scenario plugin only. */
export function resolveDeckTemplateSkillId(
  metadata: ProjectMetadata | null | undefined,
  meta?: DeckTemplateSendMeta,
): string | null {
  const fromMetadata = selectedDeckTemplateMetadata(metadata)?.id ?? null;
  if (fromMetadata) return fromMetadata;
  const fromSkillIds = meta?.skillIds?.find((id) => id.trim()) ?? null;
  if (fromSkillIds) return fromSkillIds.trim();
  const fromPluginIds = meta?.context?.pluginIds?.find((id) => id.trim()) ?? null;
  return fromPluginIds?.trim() || null;
}

/** Scenario plugin skill is secondary to the selected visual template. */
export function resolveScenarioPluginIdForLocalSkill(
  metadata: ProjectMetadata | null | undefined,
  meta: DeckTemplateSendMeta | undefined,
  appliedPluginSnapshotPluginId?: string | null,
): string | null {
  const templateId = selectedDeckTemplateMetadata(metadata)?.id ?? null;
  const snapshotId = appliedPluginSnapshotPluginId?.trim() || null;
  if (snapshotId && snapshotId !== templateId) return snapshotId;
  const pluginIds = meta?.context?.pluginIds ?? [];
  const scenarioId = pluginIds.find((id) => {
    const trimmed = id.trim();
    return trimmed.length > 0 && trimmed !== templateId;
  });
  return scenarioId?.trim() || null;
}

export function wrapSelectedDeckTemplateSkillBody(
  skillBody: string,
  templateTitle: string,
): string {
  const title = templateTitle.trim() || 'selected deck template';
  return [
    '# Teamver selected deck template guard',
    '',
    `Template: ${title}`,
    'Treat this template as the primary visual contract for this run.',
    'Preserve its palette, typography, layout rhythm, spacing, motif language, and first-slide mood in the generated deck.',
    "If an active design system is also present, use it only as secondary brand context; do not replace the selected template's visual language with the design system default.",
    '',
    skillBody.trim(),
  ].join('\n');
}

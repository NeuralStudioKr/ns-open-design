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
    '# Teamver selected deck template guard (MUST FOLLOW)',
    '',
    `Template: ${title}`,
    '',
    'The user explicitly picked this template in the Canvas → Slide launch step.',
    'It is NOT a suggestion — it is the primary visual contract for this run.',
    'REQUIRED:',
    "- Reproduce this template's exact color palette, background treatment, typography (fonts / weights / sizes), grid, spacing rhythm, icon / motif language, and first-slide mood.",
    '- Match the same slide chrome, section markers, footers, page numbers, and text-block shapes described below.',
    "- If example HTML is included below, USE IT as the layout scaffold — do not invent a generic dark/light deck.",
    'FORBIDDEN:',
    "- Do not fall back to a default / neutral deck look because the source material is unrelated to the template's theme; adapt the content to the template, not the template to the content.",
    "- Do not replace this template's visual language with an active design system's default styling; the design system (if any) is secondary brand context, not the primary look.",
    '- Do not silently ignore the specification below because a section feels long — every clause is binding.',
    '',
    '--- Template specification follows ---',
    '',
    skillBody.trim(),
  ].join('\n');
}

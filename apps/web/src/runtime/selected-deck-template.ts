import type { ProjectMetadata } from '@open-design/contracts';

export type SelectedDeckTemplateMetadata = {
  id: string;
  title?: string;
};

export type DeckTemplateSendMeta = {
  skillIds?: string[];
  /**
   * Per-turn pin from Canvas/Drive → Slide confirm. Required because
   * `patchProject({ selectedDeckTemplateId })` can land after the first
   * send already composed against a stale React `project.metadata`.
   */
  selectedDeckTemplateId?: string;
  selectedDeckTemplateTitle?: string;
  /** Per-turn overlay so first-turn Canvas launches skip discovery even if project metadata is stale. */
  skipDiscoveryBrief?: boolean;
  context?: {
    pluginIds?: string[];
    skillIds?: string[];
  };
};

export function selectedDeckTemplateMetadata(
  metadata: ProjectMetadata | null | undefined,
  turnMeta?: Pick<DeckTemplateSendMeta, 'selectedDeckTemplateId' | 'selectedDeckTemplateTitle'> | null,
): SelectedDeckTemplateMetadata | null {
  const fromProject = metadata?.selectedDeckTemplateId?.trim();
  if (fromProject) {
    const title = metadata?.selectedDeckTemplateTitle?.trim() || undefined;
    return { id: fromProject, title };
  }
  const fromTurn = turnMeta?.selectedDeckTemplateId?.trim();
  if (fromTurn) {
    const title = turnMeta?.selectedDeckTemplateTitle?.trim() || undefined;
    return { id: fromTurn, title };
  }
  return null;
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
  const selected = selectedDeckTemplateMetadata(metadata, meta);
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
  const selectedTitle =
    selected.title
    || meta?.selectedDeckTemplateTitle?.trim()
    || metadata?.selectedDeckTemplateTitle?.trim()
    || undefined;
  return {
    ...(meta ?? ({} as T)),
    skillIds,
    selectedDeckTemplateId: selected.id,
    ...(selectedTitle ? { selectedDeckTemplateTitle: selectedTitle } : {}),
    ...(meta?.skipDiscoveryBrief === true || metadata?.skipDiscoveryBrief === true
      ? { skipDiscoveryBrief: true }
      : {}),
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
  const fromMetadata = selectedDeckTemplateMetadata(metadata, meta)?.id ?? null;
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
  const templateId = selectedDeckTemplateMetadata(metadata, meta)?.id ?? null;
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
    '',
    'The user explicitly picked this template in the Canvas → Slide launch step.',
    'Treat it as the primary visual contract for this deck: reproduce the palette,',
    "background treatment, typography (fonts / weights / sizes), grid, spacing rhythm,",
    'motif language, and first-slide mood described in the specification below.',
    'If an example HTML scaffold is included below, prefer it over inventing new',
    'layout markup so the deck actually looks like the template the user picked.',
    '',
    'Content-vs-template reconciliation: the source material and the template can',
    'have different subjects (e.g. business report content picked with a terminal',
    "template). Do NOT refuse or return an empty artifact in that case — restyle",
    "the source content into this template's visual language, even if the topic",
    'does not match the template thumbnail. Keep the source structure, headings,',
    'callouts, tables, images, and smart blocks intact; only the LOOK follows the',
    "template. An imperfect template match is always better than no deck at all.",
    '',
    "If an active design system is also present, use it only as secondary brand",
    "context; do not silently replace this template's visual language with the",
    'design system default. A Neutral Modern / Starter design system must NOT',
    'turn a pastel cream template into a dark sparse corporate deck.',
    '',
    'When a Template visual kit (from example.html) is present below, treat its',
    'CSS tokens, fonts, and first-slide cue as mandatory — reproduce them with',
    'inline styles (or one short body `<style>`), including decorative motif',
    'density. Sparse title-only slides that ignore the kit are a failure.',
    '',
    '--- Template specification follows ---',
    '',
    skillBody.trim(),
  ].join('\n');
}

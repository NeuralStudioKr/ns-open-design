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
  // Per-turn pin wins over project metadata. Canvas/Drive confirm can
  // `patchProject` then send on the same tick while React still holds a
  // previous template id — turn meta is the user's latest pick.
  const fromTurn = turnMeta?.selectedDeckTemplateId?.trim();
  if (fromTurn) {
    const title = turnMeta?.selectedDeckTemplateTitle?.trim() || undefined;
    return { id: fromTurn, title };
  }
  const fromProject = metadata?.selectedDeckTemplateId?.trim();
  if (fromProject) {
    const title = metadata?.selectedDeckTemplateTitle?.trim() || undefined;
    return { id: fromProject, title };
  }
  return null;
}

/** Chat chip label — prefer title, then a readable id fallback (never hide the chip). */
export function formatSelectedDeckTemplateChipLabel(
  selected: SelectedDeckTemplateMetadata | null | undefined,
): string | null {
  if (!selected?.id) return null;
  const title = selected.title?.trim();
  if (title) return title;
  return selected.id
    .replace(/^example-/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || selected.id;
}

/**
 * Resolve the template chip for a user message after refresh.
 * Order: message runContext → project metadata → skillIds that look like a deck template pin.
 */
export function resolveSelectedDeckTemplateChipLabel(input: {
  projectMetadata?: ProjectMetadata | null;
  runContext?: {
    selectedDeckTemplateId?: string;
    selectedDeckTemplateTitle?: string;
    skillIds?: string[];
    contextSkillIds?: string[];
  } | null;
}): string | null {
  const fromMessage = selectedDeckTemplateMetadata(null, {
    selectedDeckTemplateId: input.runContext?.selectedDeckTemplateId,
    selectedDeckTemplateTitle: input.runContext?.selectedDeckTemplateTitle,
  });
  if (fromMessage) return formatSelectedDeckTemplateChipLabel(fromMessage);

  const fromProject = selectedDeckTemplateMetadata(input.projectMetadata);
  if (fromProject) return formatSelectedDeckTemplateChipLabel(fromProject);

  // Legacy messages: enrich put the template id first in skillIds without
  // selectedDeckTemplate* fields on runContext.
  const skillIds = input.runContext?.skillIds ?? [];
  const firstSkill = skillIds[0]?.trim();
  if (
    firstSkill
    && (firstSkill.startsWith('example-')
      || firstSkill.startsWith('html-ppt-')
      || firstSkill.includes('ppt-'))
  ) {
    return formatSelectedDeckTemplateChipLabel({ id: firstSkill });
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
): (T & DeckTemplateSendMeta) | undefined {
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
      // Persist on the user message so ChatPane can re-show the template chip
      // after project re-entry without relying only on live project.metadata.
      selectedDeckTemplateId: selected.id,
      ...(selectedTitle ? { selectedDeckTemplateTitle: selectedTitle } : {}),
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
    'Treat it as the primary visual contract for this deck.',
    '',
    'Token-safe content-swap: use the **Template visual kit** (+ Template scaffold',
    'map of slide classes/roles when present). Bind kit palette/fonts/Motif sprites',
    'and replace visible content for the user brief. Do NOT dump or rewrite a full',
    'example.html document in the prompt/output (input/output token risk).',
    '',
    'Content-vs-template reconciliation: the source material and the template can',
    'have different subjects (e.g. business report content picked with a terminal',
    "template). Do NOT refuse or return an empty artifact in that case — swap the",
    "source TEXT into this template's look, even if the topic does not match the",
    'template thumbnail. Keep source structure/headings/callouts/tables; only the',
    'LOOK follows the template.',
    '',
    "If an active design system is also present, use it only as secondary brand",
    "context; do not silently replace this template's visual language with the",
    'design system default. A Neutral Modern / Starter design system must NOT',
    'turn a pastel cream template into a dark sparse corporate deck.',
    '',
    'Do not substitute drawn template motifs with emoji or invent ellipse daisy SVGs.',
    'When a Template visual kit (from example.html) is present below, treat its',
    'CSS tokens, fonts, Motif sprites, and scaffold map as mandatory — reproduce',
    'them with inline styles or one short body `<style>` after slide 1.',
    'If complete motif SVGs are provided, copy at least one provided SVG onto the cover.',
    'Sparse title-only slides that ignore the kit are a failure.',
    '',
    '--- Template specification follows ---',
    '',
    skillBody.trim(),
  ].join('\n');
}

/** Kit-miss / asset-load failure fallback — template-title cues only (no Daisy bias). */
export function selectedDeckTemplateTitleStub(templateTitle: string): string {
  const title = templateTitle.trim() || 'selected deck template';
  return [
    '# Selected visual template (title-only fallback)',
    '',
    `Template: ${title}`,
    'The Template visual kit could not be loaded this turn — still treat this selected template as the visual contract.',
    'Infer palette / typography / motif ONLY from this template title and any Visual summary cues in the prompt.',
    'Do NOT invent a Daisy Days cream/`#F5F0E6`/Fredoka look unless this template title/summary explicitly implies that identity.',
    'Never fall back to Neutral slate `#0f172a`, OD skeleton terracotta `#c96442` (unless that hex is part of this template), emoji ornament rows, or ellipse daisy SVGs.',
    'Prefer simple CSS shapes / chunky borders in the inferred template palette when Motif sprites are unavailable.',
    'Do not fall back to the default simple-deck / scenario look.',
  ].join('\n');
}

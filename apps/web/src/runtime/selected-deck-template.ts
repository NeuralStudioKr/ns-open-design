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

/** True when a skill/plugin id is the visual deck template pin (not a normal skill). */
export function looksLikeDeckTemplateSkillId(id: string | null | undefined): boolean {
  const trimmed = id?.trim() ?? '';
  if (!trimmed) return false;
  return (
    trimmed.startsWith('example-')
    || trimmed.startsWith('html-ppt-')
    || /(?:^|-)ppt(?:-|$)/i.test(trimmed)
  );
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
  if (firstSkill && looksLikeDeckTemplateSkillId(firstSkill)) {
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
    'map of slide classes/roles when present). Bind kit palette/fonts/compact motif cues',
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
    'CSS tokens, fonts, compact motif/deco cues, and scaffold map as mandatory — reproduce',
    'them with inline styles or one short body `<style>` after slide 1.',
    'Body-first output contract: start the deck artifact body as',
    '`<!doctype html><html lang="ko"><body style="margin:0;background:<kit surface>"><section class="slide" style="…background:<kit surface>…" ...>`.',
    'Do not emit `<head>`, `<title>`, meta tags, a full example.html stylesheet, or a large SVG block before the first filled slide.',
    'Full-bleed surface: kit paper hex must cover html/body AND every `.slide` edge-to-edge — no white top/bottom bands from an inner-only cream panel.',
    'Prefer kit Motif vocabulary for decorative density: capped Motif sprites AFTER title/lead and/or Decorations CSS `.deco-pill` / pill-* / capsule / `.deco`. Never invent generic CSS circles when the kit has pills/sprites. Never open Motif `<svg>` before cover copy; skip huge SVG `<style>` dumps.',
    'On first Clone content-fill: title-first, then kit Motif vocabulary (capped sprites and/or `.deco-pill` CSS). Never open Motif `<svg>` before cover title; never invent generic circles when the kit has pills/sprites.',
    'Sparse title-only slides that ignore the kit are a failure; Motif-before-title hangs are also a failure.',
    '',
    'Content quality bar: every non-divider slide needs a headline, takeaway, and',
    'concrete support (specific bullets, metrics, examples, risks, actions, timeline,',
    'comparison, or decision criteria). Reject raw user prompts, template demo',
    'captions, and placeholder copy as slide content; keep HTML compact.',
    '',
    'Content expansion: the user brief is a TOPIC to research and explain, not slide',
    'text. Write domain-specific copy (named APIs, architecture, examples, trade-offs)',
    'at the stated audience depth. Never paste "만들어줘" instructions or restated',
    'topic words ("Expo 소개") as the only body. A deck that only echoes the prompt',
    'is a failed deliverable.',
    '',
    'First content fill after a daemon Clone LOOK seed is CREATE (status: "슬라이드 초안 작성 중"),',
    'not a surgical edit of the seeded deck.html. Prefer a compact complete deck artifact',
    '(body-first, short style, no Motif SVG dump) over rewriting the full cloned head/CSS.',
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

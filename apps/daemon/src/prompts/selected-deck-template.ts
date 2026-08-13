export type SelectedDeckTemplateMetadata = {
  id: string;
  title?: string;
};

export function readSelectedDeckTemplateFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): SelectedDeckTemplateMetadata | null {
  const id =
    typeof metadata?.selectedDeckTemplateId === 'string'
      ? metadata.selectedDeckTemplateId.trim()
      : '';
  if (!id) return null;
  const rawTitle =
    typeof metadata?.selectedDeckTemplateTitle === 'string'
      ? metadata.selectedDeckTemplateTitle.trim()
      : '';
  // exactOptionalPropertyTypes: omit key when absent (do not set title: undefined).
  return rawTitle ? { id, title: rawTitle } : { id };
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
    'Dual-path (safe rollout): when a **Template scaffold (CONTENT-SWAP BASE)** is',
    'included below, prefer starting FROM that HTML and replacing only visible',
    'text/content when you can finish the deck. The **Template visual kit**',
    '(when present) remains the mandatory token/motif checklist and fallback.',
    '',
    'When only a Template visual kit is present (no scaffold): bind kit tokens /',
    'Motif sprites — still never fall back to Neutral Modern / OD skeleton terracotta.',
    '',
    'Content-vs-template reconciliation: the source material and the template can',
    'have different subjects (e.g. business report content picked with a terminal',
    "template). Do NOT refuse or return an empty artifact in that case — swap the",
    "source TEXT into this template's scaffold/look, even if the topic does not",
    'match the template thumbnail.',
    '',
    "If an active design system is also present, use it only as secondary brand",
    "context; do not silently replace this template's visual language with the",
    'design system default.',
    'Do not substitute drawn template motifs with emoji or invent ellipse daisy SVGs.',
    '',
    '--- Template specification follows ---',
    '',
    skillBody.trim(),
  ].join('\n');
}

export function selectedDeckTemplateTitleStub(templateTitle: string): string {
  return [
    '# Selected visual template (title-only fallback)',
    '',
    `Template: ${templateTitle.trim()}`,
    "The user explicitly picked this template but its full specification could not be loaded on this run.",
    "Match this template's visible style as closely as your prior knowledge of it allows and infer palette / typography / layout tokens from the title if unknown.",
    "Do not default to a neutral dark/light deck if you have any signal about this template's identity.",
    "Do not replace template motif cues with emoji; approximate them with CSS/SVG/HTML shapes.",
  ].join('\n');
}

/**
 * When project metadata names a visual template, that body owns the primary
 * skill slot. Scenario/plugin snapshot skills must not overwrite it.
 *
 * Do not append the full Simple Deck (or other scenario) body as a secondary
 * composed skill — that historically reclaimed visuals over the selected
 * template. Deck structure / deliverable contracts already live in the Teamver
 * compact deck rules and scenario-only plugin block.
 */
export function preferSelectedDeckTemplateSkill(input: {
  selected: SelectedDeckTemplateMetadata | null;
  templateBody?: string | null;
  currentSkillBody?: string | null;
  currentSkillName?: string | null;
  secondarySkillBody?: string | null;
  secondarySkillName?: string | null;
}): { skillBody: string; skillName: string } | null {
  const selected = input.selected;
  if (!selected) return null;
  const templateBody = input.templateBody?.trim()
    || (selected.title ? selectedDeckTemplateTitleStub(selected.title) : '');
  if (!templateBody) return null;
  const title = selected.title?.trim() || input.currentSkillName?.trim() || selected.id;
  const skillBody = wrapSelectedDeckTemplateSkillBody(templateBody, title);
  return {
    skillBody,
    skillName: title,
  };
}

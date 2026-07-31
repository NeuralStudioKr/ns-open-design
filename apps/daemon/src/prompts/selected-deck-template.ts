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
    'Treat this template as the primary visual contract for this run.',
    'Preserve its palette, typography, layout rhythm, spacing, motif language, and first-slide mood in the generated deck.',
    "If an active design system is also present, use it only as secondary brand context; do not replace the selected template's visual language with the design system default.",
    '',
    skillBody.trim(),
  ].join('\n');
}

export function selectedDeckTemplateTitleStub(templateTitle: string): string {
  return [
    '# Selected visual template',
    '',
    `Template: ${templateTitle.trim()}`,
    "Match this selected deck template's visible style as closely as possible.",
  ].join('\n');
}

/**
 * When project metadata names a visual template, that body owns the primary
 * skill slot. Scenario/plugin snapshot skills must not overwrite it.
 */
export function preferSelectedDeckTemplateSkill(input: {
  selected: SelectedDeckTemplateMetadata | null;
  templateBody?: string | null;
  currentSkillBody?: string | null;
  currentSkillName?: string | null;
}): { skillBody: string; skillName: string } | null {
  const selected = input.selected;
  if (!selected) return null;
  const templateBody = input.templateBody?.trim()
    || (selected.title ? selectedDeckTemplateTitleStub(selected.title) : '');
  if (!templateBody) return null;
  const title = selected.title?.trim() || input.currentSkillName?.trim() || selected.id;
  return {
    skillBody: wrapSelectedDeckTemplateSkillBody(templateBody, title),
    skillName: title,
  };
}

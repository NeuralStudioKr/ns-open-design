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

export function selectedDeckTemplateTitleStub(templateTitle: string): string {
  return [
    '# Selected visual template (title-only fallback)',
    '',
    `Template: ${templateTitle.trim()}`,
    "The user explicitly picked this template but its full specification could not be loaded on this run.",
    "Match this template's visible style as closely as your prior knowledge of it allows and infer palette / typography / layout tokens from the title if unknown.",
    "Do not default to a neutral dark/light deck if you have any signal about this template's identity.",
  ].join('\n');
}

/**
 * When project metadata names a visual template, that body owns the primary
 * skill slot. Scenario/plugin snapshot skills must not overwrite it — but
 * their body is kept as a secondary composed skill so deck structure /
 * deliverable contracts from example-simple-deck are not lost.
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
  let skillBody = wrapSelectedDeckTemplateSkillBody(templateBody, title);
  const secondary = input.secondarySkillBody?.trim() || '';
  if (
    secondary
    && secondary !== templateBody
    && !skillBody.includes(secondary)
  ) {
    const secondaryName =
      input.secondarySkillName?.trim() || input.currentSkillName?.trim() || 'scenario';
    skillBody += `\n\n---\n\n## Composed skill — ${secondaryName}\n\n${secondary}`;
  }
  return {
    skillBody,
    skillName: title,
  };
}

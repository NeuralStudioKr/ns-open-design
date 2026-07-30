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
  const title =
    typeof metadata?.selectedDeckTemplateTitle === 'string'
      ? metadata.selectedDeckTemplateTitle.trim() || undefined
      : undefined;
  return { id, title };
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

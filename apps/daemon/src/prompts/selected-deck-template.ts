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
    'Prefer THIS kit\'s Motif vocabulary for decorative density: capped Motif sprites AFTER title/lead and/or this kit\'s named deco CSS classes. Never invent generic CSS circles or import another template\'s ornaments. Never open Motif `<svg>` before cover copy; skip huge SVG `<style>` dumps.',
    'On first Clone content-fill: title-first, then THIS kit\'s Motif vocabulary. Never open Motif `<svg>` before cover title.',
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

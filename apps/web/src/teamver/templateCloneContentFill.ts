/**
 * After daemon template Clone seeds LOOK into deck.html, queue one AI turn that
 * fills REAL content while preserving the template visual kit.
 *
 * Clone alone must never leave the user's "만들어줘" instruction as slide copy.
 */

import type { ChatAttachment } from '../types';

export const TEMPLATE_CLONE_CONTENT_FILL_MARKER = '[Template clone content fill]';

export function isTemplateCloneContentFillPrompt(text: string | null | undefined): boolean {
  return String(text ?? '').includes(TEMPLATE_CLONE_CONTENT_FILL_MARKER);
}

export function templateCloneContentFillFlagKey(projectId: string): string {
  return `od:template-clone-content-fill:${projectId}`;
}

export function autoSendSeedStorageKey(projectId: string): string {
  return `od:auto-send-seed:${projectId}`;
}

/** Canvas boilerplate only — user topic lines may still contain "만들어줘". */
export function looksLikeCanvasCreateBoilerplate(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t === '첨부한 자료를 바탕으로 슬라이드 덱을 만들어줘.') return true;
  if (/^첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드\s*덱을?\s*만들어\s*줘\.?$/u.test(t)) return true;
  if (/첨부(?:한)?\s*.+\s*바탕으로/.test(t) && /\[Deliverable instruction\]/i.test(t)) {
    return true;
  }
  if (/^(?:User instruction|Deliverable instruction|Source brief|Quick settings)\s*[:：]/i.test(t)) {
    return true;
  }
  return false;
}

export function looksLikeInstructionNotSlideCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (looksLikeCanvasCreateBoilerplate(t)) return true;
  if (/(?:만들어|작성|생성)\s*(?:줘|주세요)|설명해?\s*(?:줘|주세요)/i.test(t)) return true;
  if (/^(?:please\s+)?(?:make|create|build|write|generate)\s+/i.test(t)) return true;
  if (/피피티|PPT|슬라이드\s*덱/i.test(t) && /(?:만들어|작성|생성|설명)/i.test(t)) return true;
  return false;
}

/**
 * Short cover-topic label from a "만들어줘" request.
 * "expo에 대해서 설명하는 피피티 만들어줘. 시니어 개발자 레벨." → "expo"
 */
export function deriveTemplateCloneTopicLabel(request: string): string {
  const t = request.trim();
  if (!t) return '';
  const aboutKo = t.match(
    /^(.+?)\s*(?:에\s*대해(?:서)?|에\s*관한)\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)/i,
  )?.[1]?.trim();
  if (aboutKo && aboutKo.length >= 2 && !looksLikeCanvasCreateBoilerplate(aboutKo)) {
    return aboutKo.slice(0, 60);
  }
  const aboutEn = t.match(
    /(?:about|on)\s+(.+?)(?:\s+(?:slides?|deck|presentation|ppt)\b|[.?!]|$)/i,
  )?.[1]?.trim();
  if (aboutEn && aboutEn.length >= 2 && !looksLikeInstructionNotSlideCopy(aboutEn)) {
    return aboutEn.slice(0, 60);
  }
  return '';
}

/**
 * Keep facts the model needs (headings, preview, user topic, quick settings).
 * Drop Home/Canvas create scaffolding that used to be dumped as [Source brief]
 * and drowned the actual topic.
 */
export function compactTemplateCloneFillSourceBrief(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  const parts: string[] = [];
  const push = (label: string, value: string | null | undefined, max = 600) => {
    const v = String(value ?? '').trim();
    if (!v) return;
    parts.push(`${label}: ${v.slice(0, max)}`);
  };

  push('Canvas title', /Canvas title\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push('Drive source file', /Drive source file\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push('Drive source MIME', /Drive source MIME\s*[:：]\s*(.+)$/im.exec(text)?.[1]);
  push(
    'Visible headings',
    /(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*(.+)$/im.exec(text)?.[1],
  );
  push(
    'Source preview',
    /Source preview\s*[:：]\s*([\s\S]*?)(?=\n(?:Canvas |Drive |Visible |User |Selected |\[)|$)/i
      .exec(text)?.[1],
    600,
  );
  const userInstr = /\[?User instruction\]?\s*[:：]?\s*\n?([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected |\[)|$)/i
    .exec(text)?.[1]?.trim();
  if (userInstr && !looksLikeCanvasCreateBoilerplate(userInstr)) {
    push('User instruction', userInstr, 400);
  }
  const quick = /\[Quick settings\]\s*\n?([\s\S]*?)(?=\n\[|$)/i.exec(text)?.[1]?.trim();
  if (quick) parts.push(`Quick settings:\n${quick}`);

  if (parts.length > 0) return parts.join('\n').slice(0, 1400);
  if (/\[Deliverable instruction\]|\[Selected slide template/i.test(text)) return '';
  if (looksLikeCanvasCreateBoilerplate(text) || looksLikeInstructionNotSlideCopy(text)) {
    return '';
  }
  return text.slice(0, 1400);
}

/** Prefer the real topic line over Canvas boilerplate / full run prompts. */
export function extractTemplateCloneUserFacingRequest(input: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
}): string {
  const candidates: string[] = [];
  const push = (raw: string | null | undefined) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const userInstr = /\[?User instruction\]?\s*[:：]?\s*\n?([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected |\[)|$)/i
      .exec(text)?.[1]?.trim();
    if (userInstr) candidates.push(userInstr);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^\[/.test(trimmed)) continue;
      if (/^(?:Deliverable instruction|Source brief|Quick settings|Selected slide template)/i.test(trimmed)) {
        continue;
      }
      candidates.push(trimmed.replace(/^User instruction\s*[:：]\s*/i, '').trim());
    }
  };
  push(input.userInstruction);
  push(input.sourceBrief);
  push(input.pendingPrompt);

  for (const candidate of candidates) {
    if (!candidate || looksLikeCanvasCreateBoilerplate(candidate)) continue;
    if (candidate.length > 500) continue;
    return candidate;
  }
  return '첨부한 자료를 바탕으로 슬라이드 내용을 채워줘.';
}

export function buildTemplateCloneContentFillSeed(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  templateTitle?: string | null;
  slideCountHint?: string | number | null;
}): string {
  const visible = extractTemplateCloneUserFacingRequest(options);
  const topic = deriveTemplateCloneTopicLabel(visible);
  const templateTitle = options.templateTitle?.trim() || '';
  const brief = compactTemplateCloneFillSourceBrief(
    [options.sourceBrief, options.pendingPrompt, options.userInstruction]
      .filter(Boolean)
      .join('\n\n'),
  );
  const parts = [
    visible,
    '',
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    'A daemon Clone already wrote template LOOK into on-disk `deck.html` as a preview seed. Do NOT copy or rewrite that document.',
    'Emit a compact body-first `<artifact type="deck" identifier="deck">` with REAL topical slides. Bind the Template visual kit (palette / fonts / Motif SVGs) from the system prompt.',
    topic ? `Cover topic (use as the title — not the instruction): ${topic}.` : '',
    'Hard rules:',
    '- FORBIDDEN: `<head>`, copying cloned `deck.html`, dumping a long `<style>` block before slide 1, status "수정 반영 중".',
    '- Body-first: the first 1200 characters after `<artifact` MUST include `<body` and one complete `<section class="slide">` with real topical copy (not "…").',
    '- Status sentence if any: "슬라이드 초안 작성 중" — this is a CREATE fill, not an edit of the clone.',
    '- Do NOT paste user instructions ("만들어줘", "만들어 주세요", Canvas boilerplate) into slide titles or subtitles.',
    '- Bind kit palette/fonts and paste Motif SVGs from the kit. Neutral Modern / OD skeleton terracotta is a failed deliverable.',
    '- Prefer content-driven slide roles (cover / body / list / cards / quote…). Do not mirror the template example\'s page count or order.',
    '- Close `</artifact>` in this same response; do not finish with prose only.',
    'Content quality:',
    '- Replace every Clone placeholder ("…", "개요", "핵심 포인트", "다음 단계", "Presentation") with real topical copy.',
    '- Honor stated audience/level (e.g. 시니어 개발자 = architecture/internals/trade-offs, not a beginner intro).',
    '- Each body slide needs a real title plus 2–4 concrete bullets or a real paragraph. No "핵심 메시지를 정리합니다" filler.',
    '- Use attached source / Visible headings when present. Invent only to fill gaps — never invent a different product.',
    '- Minimum 6 slides unless the user or Quick settings asked for a specific count.',
  ].filter((line) => line !== '');
  if (templateTitle) {
    parts.push(`Selected template: ${templateTitle}.`);
  }
  if (options.slideCountHint != null && String(options.slideCountHint).trim()) {
    parts.push(`Slide count hint: ${String(options.slideCountHint).trim()}.`);
  }
  if (brief) {
    parts.push('', '[Source brief]', brief);
  }
  return parts.join('\n');
}

/**
 * Auto-send seed after daemon Clone.
 *
 * ProjectView used to prefer the in-memory `pendingPrompt` from createProject
 * (the full `canvasCreateSlidesRunPrompt` dump) over the queued fill seed.
 * That sent a surgical existing-deck-edit turn WITHOUT the fill marker, so
 * the model left Clone's prompt-stuffed headings intact.
 *
 * When a fill is queued, the fill seed ALWAYS wins — even if pendingPrompt
 * is still the raw create prompt.
 */
export function resolveTemplateCloneAutoSendSeed(input: {
  queuedFillSeed?: string | null;
  pendingPrompt?: string | null;
  fillQueued: boolean;
}): string {
  const queued = String(input.queuedFillSeed ?? '').trim();
  const pending = String(input.pendingPrompt ?? '').trim();
  if (input.fillQueued) {
    if (queued.includes(TEMPLATE_CLONE_CONTENT_FILL_MARKER)) return queued;
    if (pending.includes(TEMPLATE_CLONE_CONTENT_FILL_MARKER)) return pending;
    if (queued) return queued;
    return buildTemplateCloneContentFillSeed({ pendingPrompt: pending });
  }
  if (queued.includes(TEMPLATE_CLONE_CONTENT_FILL_MARKER)) return queued;
  return queued || pending;
}

export function queueTemplateCloneContentFill(options: {
  projectId: string;
  seed: string;
  attachments?: ChatAttachment[];
}): void {
  const projectId = options.projectId.trim();
  if (!projectId || !options.seed.trim()) return;
  try {
    window.sessionStorage.setItem(`od:auto-send-first:${projectId}`, '1');
    window.sessionStorage.setItem(autoSendSeedStorageKey(projectId), options.seed);
    window.sessionStorage.setItem(templateCloneContentFillFlagKey(projectId), '1');
    if (options.attachments && options.attachments.length > 0) {
      window.sessionStorage.setItem(
        `od:auto-send-attachments:${projectId}`,
        JSON.stringify(options.attachments),
      );
    } else {
      window.sessionStorage.removeItem(`od:auto-send-attachments:${projectId}`);
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export function readQueuedAutoSendSeed(projectId: string): string {
  try {
    return window.sessionStorage.getItem(autoSendSeedStorageKey(projectId))?.trim() || '';
  } catch {
    return '';
  }
}

export function isTemplateCloneContentFillQueued(projectId: string): boolean {
  try {
    return window.sessionStorage.getItem(templateCloneContentFillFlagKey(projectId)) === '1';
  } catch {
    return false;
  }
}

export function clearTemplateCloneContentFillQueue(projectId: string): void {
  try {
    window.sessionStorage.removeItem(templateCloneContentFillFlagKey(projectId));
    window.sessionStorage.removeItem(autoSendSeedStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

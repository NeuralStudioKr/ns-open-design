/**
 * After daemon template Clone seeds LOOK into deck.html, queue one AI turn that
 * fills REAL content while preserving the template visual kit.
 *
 * Clone alone must never leave the user's "만들어줘" instruction as slide copy.
 */

import type { ChatAttachment } from '../types';
import {
  briefLooksLikeAttachedSource,
  CANVAS_CREATE_SLIDES_PROMPT,
  HOME_CREATE_SLIDES_PROMPT,
  HOME_FILL_SLIDES_PROMPT,
  isSlideCreateBoilerplateLine,
} from './slideCreateBoilerplate';

export const TEMPLATE_CLONE_CONTENT_FILL_MARKER = '[Template clone content fill]';

export function templateCloneContentFillFlagKey(projectId: string): string {
  return `od:template-clone-content-fill:${projectId}`;
}

export function autoSendSeedStorageKey(projectId: string): string {
  return `od:auto-send-seed:${projectId}`;
}

/** Canvas/Home boilerplate only — user topic lines may still contain "만들어줘". */
export function looksLikeCanvasCreateBoilerplate(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (isSlideCreateBoilerplateLine(t)) return true;
  if (t === CANVAS_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_CREATE_SLIDES_PROMPT) return true;
  if (t === HOME_FILL_SLIDES_PROMPT) return true;
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
 * Prefer the real topic line over Canvas boilerplate / full run prompts.
 * Kept user-facing (may still say "만들어줘") for chat display.
 */
export function extractTemplateCloneUserFacingRequest(input: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
}): string {
  const candidates: string[] = [];
  const push = (raw: string | null | undefined) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const bracketUser = /\[User instruction\]\s*\n([\s\S]*?)(?=\n\n\[|$)/i.exec(text)?.[1]?.trim();
    if (bracketUser) candidates.push(bracketUser);
    const userInstr = /\[?User instruction\]?\s*[:：]\s*\n?([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected |\[)|$)/i
      .exec(text)?.[1]?.trim();
    if (userInstr) candidates.push(userInstr);
    // Prefer the lead line before deliverable protocol blocks.
    const beforeDeliverable = text.split(/\n\n\[Deliverable instruction\]/i)[0]?.trim() ?? text;
    for (const line of beforeDeliverable.split(/\r?\n/)) {
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
  // Never claim "첨부한 자료" when the user may not have attached anything.
  return HOME_FILL_SLIDES_PROMPT;
}

export function buildTemplateCloneContentFillSeed(options: {
  userInstruction?: string | null;
  sourceBrief?: string | null;
  pendingPrompt?: string | null;
  templateTitle?: string | null;
  hasSourceMaterial?: boolean;
}): string {
  const visible = extractTemplateCloneUserFacingRequest(options);
  const templateTitle = options.templateTitle?.trim() || '';
  const brief = String(options.sourceBrief ?? '').trim().slice(0, 1400);
  const hasAttachedSource =
    options.hasSourceMaterial
    ?? briefLooksLikeAttachedSource(brief);
  const parts = [
    visible,
    '',
    TEMPLATE_CLONE_CONTENT_FILL_MARKER,
    'Attached `deck.html` already has the selected template LOOK (CSS, fonts, Motif SVG, layout shells) from a daemon Clone.',
    hasAttachedSource
      ? 'Fill REAL presentation CONTENT for this request and any attached source materials.'
      : 'Fill REAL presentation CONTENT for this user request (no separate source attachment may be present).',
    'Hard rules:',
    '- Do NOT paste user instructions ("만들어줘", "만들어 주세요", Canvas boilerplate) into slide titles or subtitles.',
    '- Preserve the cloned template visual kit (palette hex, font-family, deco/SVG motifs, shell class language). Neutral Modern / OD skeleton terracotta is a failed deliverable.',
    '- You MAY emit a full `<artifact type="deck" identifier="deck">` that rewrites visible text and adjusts slide count/layouts for the topic — keep the template look, not the template demo page lineup.',
    '- Prefer content-driven slide roles (cover / body / list / cards / quote…). Do not mirror the template example\'s page count or order.',
    '- Close `</artifact>` in this same response; do not finish with prose only.',
  ];
  if (templateTitle) {
    parts.push(`Selected template: ${templateTitle}.`);
  }
  if (brief) {
    parts.push('', '[Source brief]', brief);
  }
  return parts.join('\n');
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

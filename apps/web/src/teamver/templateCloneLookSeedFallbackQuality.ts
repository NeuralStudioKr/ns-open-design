import {
  buildTemplateCloneLookSeedFallbackObserve,
  type TemplateCloneLookSeedFallbackObserve,
} from '@open-design/contracts';
import { devLog } from '../lib/devLog';

/**
 * 루프537 — LOOK seed 배너 낙착만 남긴다. persist HTML / Retry / 카피는 바꾸지 않는다.
 */
export function observeTemplateCloneLookSeedFallback(input: {
  source?: string | null;
  reason?: string | null;
  genericBrief?: boolean;
  fillMode?: string | null;
  templateId?: string | null;
}): TemplateCloneLookSeedFallbackObserve | null {
  try {
    const payload = buildTemplateCloneLookSeedFallbackObserve(input);
    devLog.info('[teamver] look-seed-fallback', payload);
    return payload;
  } catch (error) {
    devLog.warn('[teamver] look-seed-fallback observe failed', error);
    return null;
  }
}

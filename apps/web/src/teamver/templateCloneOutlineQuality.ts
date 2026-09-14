import {
  buildTemplateCloneOutlineQualityObserve,
  type TemplateCloneOutlineQualityObserve,
} from '@open-design/contracts';
import { devLog } from '../lib/devLog';

/**
 * 루프526 — JSON outline generator 품질만 남긴다. persist HTML은 바꾸지 않는다.
 */
export function observeTemplateCloneOutlineQuality(input: {
  rawFinalText?: string | null;
  kind?: string | null;
  templateId?: string | null;
}): TemplateCloneOutlineQualityObserve | null {
  try {
    const payload = buildTemplateCloneOutlineQualityObserve(input);
    devLog.info('[teamver] outline-quality', payload);
    return payload;
  } catch (error) {
    devLog.warn('[teamver] outline-quality observe failed', error);
    return null;
  }
}

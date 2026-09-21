import {
  buildTemplateClonePersistQualityObserve,
  type TemplateClonePersistQualityObserve,
  type TemplateClonePersistQualityPhase,
} from '@open-design/contracts';
import { devLog } from '../lib/devLog';

/**
 * 루프523 — Persist HTML을 바꾸지 않고 distinct-shell / title-only rate만 남긴다.
 * 측정 실패는 persist를 막지 않는다.
 */
export function observeTemplateClonePersistQuality(input: {
  phase: TemplateClonePersistQualityPhase;
  html?: string | null;
  beforeHtml?: string | null;
  applied?: boolean;
  templateId?: string | null;
}): TemplateClonePersistQualityObserve | null {
  try {
    const payload = buildTemplateClonePersistQualityObserve(input);
    devLog.info('[teamver] persist-quality', payload);
    return payload;
  } catch (error) {
    devLog.warn('[teamver] persist-quality observe failed', error);
    return null;
  }
}

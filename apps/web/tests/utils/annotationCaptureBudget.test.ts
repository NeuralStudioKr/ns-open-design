import { describe, expect, it } from 'vitest';

import {
  ANNOTATION_BRIDGE_RETRY_TOTAL_MS,
  ANNOTATION_CAPTURE_BUDGET_MS,
  ANNOTATION_CAPTURE_FAST_FALLBACK_MS,
  ANNOTATION_CAPTURE_POST_READY_BUFFER_MS,
  ANNOTATION_LAZY_SHELL_WAIT_MS,
  ANNOTATION_SLIDE_CONTEXT_CAPTURE_BUDGET_MS,
  ANNOTATION_SNAPSHOT_BRIDGE_RETRY_MS,
  DRAW_CAPTURE_READY_DEADLINE_MS,
} from '../../src/utils/annotationCaptureBudget';

describe('annotationCaptureBudget', () => {
  it('sizes slide-context budget to cover FileViewer draw-capture pipeline', () => {
    const bridgeRetrySum = ANNOTATION_SNAPSHOT_BRIDGE_RETRY_MS.reduce((sum, ms) => sum + ms, 0);
    expect(bridgeRetrySum).toBe(ANNOTATION_BRIDGE_RETRY_TOTAL_MS);
    expect(ANNOTATION_SLIDE_CONTEXT_CAPTURE_BUDGET_MS).toBe(
      DRAW_CAPTURE_READY_DEADLINE_MS +
        ANNOTATION_LAZY_SHELL_WAIT_MS +
        bridgeRetrySum +
        ANNOTATION_CAPTURE_POST_READY_BUFFER_MS,
    );
    expect(ANNOTATION_SLIDE_CONTEXT_CAPTURE_BUDGET_MS).toBeGreaterThan(
      ANNOTATION_CAPTURE_FAST_FALLBACK_MS,
    );
    expect(ANNOTATION_SLIDE_CONTEXT_CAPTURE_BUDGET_MS).toBeGreaterThan(
      ANNOTATION_CAPTURE_BUDGET_MS,
    );
  });
});

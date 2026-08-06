// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  manualEditTargetIsDescendantOfInDocument,
  resolveManualEditGraphicContainerId,
} from '../../src/edit-mode/manual-edit-target-resolve';

describe('manual-edit-target-resolve', () => {
  it('detects ancestry via data-od-source-path ids', () => {
    const dom = new JSDOM(`
      <section class="slide">
        <div data-od-source-path="path-0-1">
          <svg data-od-source-path="path-0-1-0"><circle /></svg>
        </div>
      </section>
    `);
    const doc = dom.window.document;

    expect(manualEditTargetIsDescendantOfInDocument(doc, 'path-0-1-0', 'path-0-1')).toBe(true);
    expect(manualEditTargetIsDescendantOfInDocument(doc, 'path-0-1', 'path-0-1-0')).toBe(false);
    expect(manualEditTargetIsDescendantOfInDocument(doc, 'path-0-1', 'path-0-1')).toBe(false);

    dom.window.close();
  });

  it('redirects inner svg id to absolute graphic wrapper', () => {
    const dom = new JSDOM(`
      <div data-od-source-path="path-0-1" style="position:absolute;left:10px;top:20px;width:400px;height:300px">
        <svg data-od-source-path="path-0-1-0" width="200" height="200"></svg>
      </div>
    `);
    const doc = dom.window.document;

    expect(resolveManualEditGraphicContainerId(doc, 'path-0-1-0')).toBe('path-0-1');
    expect(resolveManualEditGraphicContainerId(doc, 'path-0-1')).toBe('path-0-1');

    dom.window.close();
  });
});

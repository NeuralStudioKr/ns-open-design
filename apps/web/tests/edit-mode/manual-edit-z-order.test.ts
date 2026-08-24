// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  buildZOrderStylePatch,
  canAdjustZOrderTarget,
  collectZStackEntries,
  computeZOrderPatchForElement,
  computeZOrderPatchForTargetWithFallback,
  computeZOrderStyleForElement,
  computeZOrderValue,
  isZOrderEligiblePosition,
  mergeZOrderCapabilities,
  readEffectiveZIndex,
  readStackZFromZIndexStyle,
  resolveZOrderContext,
  resolveZOrderContextFromTargets,
  resolveZOrderContextWithFallback,
  resolveZOrderKeyboardAction,
  sortZStack,
  zOrderCapabilities,
} from '../../src/edit-mode/manual-edit-z-order';

describe('manual-edit-z-order', () => {
  it('sorts by z-index then DOM order', () => {
    expect(sortZStack([
      { domIndex: 2, z: 0 },
      { domIndex: 0, z: 1 },
      { domIndex: 1, z: 1 },
    ])).toEqual([
      { domIndex: 2, z: 0 },
      { domIndex: 0, z: 1 },
      { domIndex: 1, z: 1 },
    ]);
  });

  it('brings an auto-z sibling forward with z-index 1', () => {
    const dom = new JSDOM(`
      <section>
        <div id="a" style="position:absolute;left:0;top:0;width:40px;height:40px"></div>
        <div id="b" style="position:absolute;left:10px;top:10px;width:40px;height:40px"></div>
      </section>
    `);
    const doc = dom.window.document;
    const section = doc.querySelector('section')!;
    const a = doc.getElementById('a')!;
    const b = doc.getElementById('b')!;
    const entries = collectZStackEntries(section, dom.window);
    expect(entries).toHaveLength(2);
    expect(computeZOrderValue(entries, 0, 'forward')).toBe('1');
    expect(computeZOrderStyleForElement(a, 'forward')).toBe('1');
    expect(readEffectiveZIndex(b, dom.window)).toBe(0);

    dom.window.close();
  });

  it('sends the top sibling backward', () => {
    const dom = new JSDOM(`
      <section>
        <div id="a" style="position:absolute;left:0;top:0;width:40px;height:40px;z-index:2"></div>
        <div id="b" style="position:absolute;left:10px;top:10px;width:40px;height:40px;z-index:5"></div>
      </section>
    `);
    const doc = dom.window.document;
    const section = doc.querySelector('section')!;
    const b = doc.getElementById('b')!;
    const entries = collectZStackEntries(section, dom.window);
    expect(computeZOrderStyleForElement(b, 'backward')).toBe('1');
    expect(zOrderCapabilities(entries, 1)).toMatchObject({
      forward: false,
      backward: true,
      front: false,
      back: true,
    });

    dom.window.close();
  });

  it('resolves capabilities for a mapped target id', () => {
    const dom = new JSDOM(`
      <section>
        <div data-od-source-path="path-0-0" style="position:absolute;left:0;top:0;width:80px;height:80px"></div>
        <div data-od-source-path="path-0-1" style="position:absolute;left:20px;top:20px;width:80px;height:80px"></div>
      </section>
    `);
    const ctx = resolveZOrderContext(dom.window.document, 'path-0-0');
    expect(ctx?.capabilities).toMatchObject({
      forward: true,
      backward: false,
      front: true,
      back: false,
    });

    dom.window.close();
  });

  it('supports relative and static siblings in the z stack', () => {
    expect(canAdjustZOrderTarget('relative')).toBe(true);
    expect(canAdjustZOrderTarget('sticky')).toBe(true);
    expect(canAdjustZOrderTarget('static')).toBe(true);
    expect(isZOrderEligiblePosition('absolute')).toBe(true);

    const dom = new JSDOM(`
      <section>
        <div id="flow-a" style="position:relative;width:80px;height:80px"></div>
        <div id="flow-b" style="position:relative;width:80px;height:80px;z-index:2"></div>
      </section>
    `);
    const doc = dom.window.document;
    const section = doc.querySelector('section')!;
    const flowA = doc.getElementById('flow-a') as HTMLElement;
    const entries = collectZStackEntries(section, dom.window);
    expect(entries).toHaveLength(2);
    expect(computeZOrderPatchForElement(flowA, 'forward')).toEqual({
      zIndex: '3',
    });
    expect(buildZOrderStylePatch('static', '4')).toEqual({
      position: 'relative',
      zIndex: '4',
    });

    dom.window.close();
  });

  it('merges z-order capabilities across multiple targets', () => {
    expect(mergeZOrderCapabilities([
      { forward: true, backward: false, front: true, back: false },
      { forward: false, backward: true, front: false, back: true },
    ])).toEqual({
      forward: false,
      backward: false,
      front: false,
      back: false,
    });
    expect(mergeZOrderCapabilities([
      { forward: true, backward: true, front: true, back: true },
      { forward: true, backward: false, front: true, back: false },
    ])).toEqual({
      forward: true,
      backward: false,
      front: true,
      back: false,
    });
  });

  it('allows z-index 0 as a valid step result', () => {
    const dom = new JSDOM(`
      <section>
        <div id="a" style="position:absolute;left:0;top:0;width:40px;height:40px;z-index:1"></div>
        <div id="b" style="position:absolute;left:10px;top:10px;width:40px;height:40px;z-index:2"></div>
        <div id="c" style="position:absolute;left:20px;top:20px;width:40px;height:40px;z-index:3"></div>
      </section>
    `);
    const doc = dom.window.document;
    const b = doc.getElementById('b')!;
    expect(computeZOrderPatchForElement(b, 'backward')).toEqual({ zIndex: '0' });

    dom.window.close();
  });

  it('includes svg siblings in the z stack', () => {
    const dom = new JSDOM(`
      <section>
        <svg id="icon" style="position:absolute;left:0;top:0;width:40px;height:40px;z-index:3"></svg>
        <div id="box" style="position:absolute;left:10px;top:10px;width:40px;height:40px"></div>
      </section>
    `);
    const section = dom.window.document.querySelector('section')!;
    expect(collectZStackEntries(section, dom.window)).toHaveLength(2);

    dom.window.close();
  });

  it('reads stack z from z-index style values', () => {
    expect(readStackZFromZIndexStyle('')).toBe(0);
    expect(readStackZFromZIndexStyle('auto')).toBe(0);
    expect(readStackZFromZIndexStyle('5')).toBe(5);
    expect(readStackZFromZIndexStyle('-2')).toBe(-2);
    expect(readStackZFromZIndexStyle('nope')).toBe(0);
  });

  it('resolves capabilities from target catalog when live DOM is unavailable', () => {
    const targets = [
      {
        id: 'back',
        parentKey: 'slide',
        cssPosition: 'absolute',
        siblingIndex: 0,
        stackZ: 1,
        styles: { zIndex: '1' },
      },
      {
        id: 'front',
        parentKey: 'slide',
        cssPosition: 'absolute',
        siblingIndex: 1,
        stackZ: 3,
        styles: { zIndex: '3' },
      },
    ] as const;

    const ctx = resolveZOrderContextFromTargets(targets, 'back');
    expect(ctx?.capabilities).toMatchObject({
      forward: true,
      backward: false,
      front: true,
      back: false,
    });

    const fallback = resolveZOrderContextWithFallback(null, targets, 'front');
    expect(fallback?.capabilities).toMatchObject({
      forward: false,
      backward: true,
      front: false,
      back: true,
    });
  });

  it('computes z-order patches from target catalog when DOM is unavailable', () => {
    const targets = [
      {
        id: 'back',
        parentKey: 'slide',
        cssPosition: 'absolute',
        siblingIndex: 0,
        stackZ: 1,
        styles: { zIndex: '1' },
      },
      {
        id: 'front',
        parentKey: 'slide',
        cssPosition: 'absolute',
        siblingIndex: 1,
        stackZ: 3,
        styles: { zIndex: '3' },
      },
    ] as const;

    expect(computeZOrderPatchForTargetWithFallback(null, targets, 'back', 'forward')).toEqual({
      zIndex: '4',
    });
    expect(computeZOrderPatchForTargetWithFallback(null, targets, 'front', 'backward')).toEqual({
      zIndex: '0',
    });
  });

  it('maps bracket shortcuts to z-order actions', () => {
    const input = document.createElement('input');
    expect(resolveZOrderKeyboardAction({
      key: ']',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      target: document.body,
    })).toBe('forward');
    expect(resolveZOrderKeyboardAction({
      key: '[',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      target: document.body,
    })).toBe('backward');
    const primary = { metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, repeat: false };
    expect(resolveZOrderKeyboardAction({
      key: ']',
      ...primary,
      target: document.body,
    })).toBe('front');
    expect(resolveZOrderKeyboardAction({
      key: '[',
      ...primary,
      target: document.body,
    })).toBe('back');
    expect(resolveZOrderKeyboardAction({
      key: ']',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      target: input,
    })).toBeNull();
  });
});

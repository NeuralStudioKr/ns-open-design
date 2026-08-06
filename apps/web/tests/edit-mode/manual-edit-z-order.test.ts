// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  collectZStackEntries,
  computeZOrderStyleForElement,
  computeZOrderValue,
  readEffectiveZIndex,
  readStackZFromZIndexStyle,
  resolveZOrderContext,
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

  it('reads stack z from z-index style values', () => {
    expect(readStackZFromZIndexStyle('')).toBe(0);
    expect(readStackZFromZIndexStyle('auto')).toBe(0);
    expect(readStackZFromZIndexStyle('5')).toBe(5);
    expect(readStackZFromZIndexStyle('-2')).toBe(-2);
    expect(readStackZFromZIndexStyle('nope')).toBe(0);
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

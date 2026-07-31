// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  contentRectToHostRect,
  contentRectToHostRectInWorkspace,
  hostDeltaToContentDelta,
  measureIframeHostScale,
  measureIframeOffsetInHost,
} from '../../src/edit-mode/preview-coords';

describe('preview-coords', () => {
  it('scales content rects and pointer deltas', () => {
    expect(contentRectToHostRect(
      { x: 10, y: 20, width: 100, height: 50 },
      0.5,
    )).toEqual({ x: 5, y: 10, width: 50, height: 25 });
    expect(hostDeltaToContentDelta(20, 10, 0.5)).toEqual({ dx: 40, dy: 20 });
  });

  it('measures iframe CSS scale from visual vs layout width', () => {
    const frame = document.createElement('iframe');
    Object.defineProperty(frame, 'offsetWidth', { value: 800 });
    frame.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 400, height: 300,
      top: 0, left: 0, right: 400, bottom: 300,
      toJSON: () => ({}),
    }) as DOMRect;
    expect(measureIframeHostScale(frame)).toBe(0.5);
  });

  it('maps content rects through iframe offset + scale into the workspace', () => {
    const host = document.createElement('div');
    const frame = document.createElement('iframe');
    host.getBoundingClientRect = () => ({
      x: 100, y: 50, width: 1000, height: 800,
      top: 50, left: 100, right: 1100, bottom: 850,
      toJSON: () => ({}),
    }) as DOMRect;
    frame.getBoundingClientRect = () => ({
      x: 140, y: 90, width: 400, height: 300,
      top: 90, left: 140, right: 540, bottom: 390,
      toJSON: () => ({}),
    }) as DOMRect;
    Object.defineProperty(frame, 'offsetWidth', { value: 800 });
    Object.defineProperty(frame, 'offsetHeight', { value: 600 });
    Object.defineProperty(host, 'clientLeft', { value: 0 });
    Object.defineProperty(host, 'clientTop', { value: 0 });
    Object.defineProperty(host, 'scrollLeft', { value: 0 });
    Object.defineProperty(host, 'scrollTop', { value: 0 });
    Object.defineProperty(frame, 'clientLeft', { value: 0 });
    Object.defineProperty(frame, 'clientTop', { value: 0 });

    expect(measureIframeOffsetInHost(frame, host)).toEqual({ x: 40, y: 40 });
    expect(contentRectToHostRectInWorkspace(
      { x: 20, y: 10, width: 100, height: 50 },
      frame,
      host,
    )).toEqual({
      // origin (40,40) + content * 0.5
      x: 50,
      y: 45,
      width: 50,
      height: 25,
    });
  });

  it('includes host scroll and borders so absolute overlay coords match content space', () => {
    const host = document.createElement('div');
    const frame = document.createElement('iframe');
    // Visible: iframe appears 20px below host border box top, but host is
    // scrolled by 80 and has a 2px border — absolute `top` must be 102.
    host.getBoundingClientRect = () => ({
      x: 0, y: 0, width: 400, height: 300,
      top: 0, left: 0, right: 400, bottom: 300,
      toJSON: () => ({}),
    }) as DOMRect;
    frame.getBoundingClientRect = () => ({
      x: 24, y: 20, width: 200, height: 100,
      top: 20, left: 24, right: 224, bottom: 120,
      toJSON: () => ({}),
    }) as DOMRect;
    Object.defineProperty(frame, 'offsetWidth', { value: 400 });
    Object.defineProperty(frame, 'offsetHeight', { value: 200 });
    Object.defineProperty(host, 'clientLeft', { value: 2 });
    Object.defineProperty(host, 'clientTop', { value: 2 });
    Object.defineProperty(host, 'scrollLeft', { value: 40 });
    Object.defineProperty(host, 'scrollTop', { value: 80 });
    Object.defineProperty(frame, 'clientLeft', { value: 4 });
    Object.defineProperty(frame, 'clientTop', { value: 4 });

    // scale = 200/400 = 0.5 → iframe border contributes 4*0.5 = 2
    expect(measureIframeOffsetInHost(frame, host)).toEqual({
      x: 24 - 0 - 2 + 40 + 2, // 64
      y: 20 - 0 - 2 + 80 + 2, // 100
    });
  });

  it('falls back safely when frame/host are missing', () => {
    expect(measureIframeHostScale(null)).toBe(1);
    expect(measureIframeOffsetInHost(null, null)).toEqual({ x: 0, y: 0 });
    expect(contentRectToHostRectInWorkspace(
      { x: 10, y: 20, width: 30, height: 40 },
      null,
      null,
      2,
    )).toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });
});

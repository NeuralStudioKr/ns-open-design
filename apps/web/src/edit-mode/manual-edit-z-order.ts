import { findManualEditPreviewTarget } from './manual-edit-host-preview';
import { isManualEditKeyboardTextTarget } from './manual-edit-keyboard';
import { isMacPlatform } from '../utils/platform';
import type { ManualEditStyles, ManualEditTarget } from './types';

export type ZOrderAction = 'forward' | 'backward' | 'front' | 'back';

export type ZStackEntry = {
  domIndex: number;
  z: number;
};

export type ZOrderCapabilities = {
  forward: boolean;
  backward: boolean;
  front: boolean;
  back: boolean;
};

export const DISABLED_Z_ORDER_CAPABILITIES: ZOrderCapabilities = {
  forward: false,
  backward: false,
  front: false,
  back: false,
};

export type ZOrderResolveOptions = {
  deck?: boolean;
  activeSlideIndex?: number | null;
};

export function isZOrderEligiblePosition(cssPosition: string | null | undefined): boolean {
  const value = String(cssPosition ?? 'static').toLowerCase();
  return (
    value === 'absolute'
    || value === 'fixed'
    || value === 'relative'
    || value === 'sticky'
    || value === 'static'
  );
}

export function canAdjustZOrderTarget(cssPosition: string | null | undefined): boolean {
  return isZOrderEligiblePosition(cssPosition);
}

export function isZStackParticipant(el: Element, view: Window): boolean {
  if (!(el instanceof view.HTMLElement) && !(el instanceof view.SVGElement)) return false;
  const pos = view.getComputedStyle(el).position;
  return (
    pos === 'absolute'
    || pos === 'fixed'
    || pos === 'relative'
    || pos === 'sticky'
    || pos === 'static'
  );
}

export function readEffectiveZIndex(el: Element, view: Window): number {
  if (!isZStackParticipant(el, view)) return Number.NEGATIVE_INFINITY;
  const raw = view.getComputedStyle(el).zIndex;
  if (!raw || raw === 'auto') return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortZStack(entries: readonly ZStackEntry[]): ZStackEntry[] {
  return [...entries].sort((a, b) => (a.z - b.z) || (a.domIndex - b.domIndex));
}

export function collectZStackEntries(parent: Element, view: Window): ZStackEntry[] {
  const entries: ZStackEntry[] = [];
  Array.from(parent.children).forEach((child, domIndex) => {
    if (!isZStackParticipant(child, view)) return;
    entries.push({ domIndex, z: readEffectiveZIndex(child, view) });
  });
  return entries;
}

export function zOrderCapabilities(
  entries: readonly ZStackEntry[],
  targetDomIndex: number,
): ZOrderCapabilities {
  const disabled = { forward: false, backward: false, front: false, back: false };
  if (entries.length < 2) return disabled;
  const sorted = sortZStack(entries);
  const idx = sorted.findIndex((entry) => entry.domIndex === targetDomIndex);
  if (idx < 0) return disabled;
  return {
    forward: idx < sorted.length - 1,
    backward: idx > 0,
    front: idx < sorted.length - 1,
    back: idx > 0,
  };
}

export function computeZOrderValue(
  entries: readonly ZStackEntry[],
  targetDomIndex: number,
  action: ZOrderAction,
): string | null {
  if (entries.length < 2) return null;
  const sorted = sortZStack(entries);
  const idx = sorted.findIndex((entry) => entry.domIndex === targetDomIndex);
  if (idx < 0) return null;
  switch (action) {
    case 'forward': {
      if (idx >= sorted.length - 1) return null;
      const next = sorted[idx + 1]!;
      return String(next.z + 1);
    }
    case 'backward': {
      if (idx <= 0) return null;
      const prev = sorted[idx - 1]!;
      return String(prev.z - 1);
    }
    case 'front': {
      if (idx >= sorted.length - 1) return null;
      const maxZ = sorted.reduce((max, entry) => Math.max(max, entry.z), Number.NEGATIVE_INFINITY);
      return String(maxZ + 1);
    }
    case 'back': {
      if (idx <= 0) return null;
      const minZ = sorted.reduce((min, entry) => Math.min(min, entry.z), Number.POSITIVE_INFINITY);
      return String(minZ - 1);
    }
    default:
      return null;
  }
}

export function buildZOrderStylePatch(
  cssPosition: string | null | undefined,
  zIndex: string,
): Partial<ManualEditStyles> {
  const value = String(cssPosition ?? 'static').toLowerCase();
  if (value === 'static') {
    return { position: 'relative', zIndex };
  }
  return { zIndex };
}

export function mergeZOrderCapabilities(
  capabilities: readonly ZOrderCapabilities[],
): ZOrderCapabilities | null {
  if (capabilities.length === 0) return null;
  return {
    forward: capabilities.every((cap) => cap.forward),
    backward: capabilities.every((cap) => cap.backward),
    front: capabilities.every((cap) => cap.front),
    back: capabilities.every((cap) => cap.back),
  };
}

export function computeZOrderPatchForElement(
  el: Element,
  action: ZOrderAction,
): Partial<ManualEditStyles> | null {
  const view = el.ownerDocument?.defaultView;
  const parent = el.parentElement;
  if (!view || !parent) return null;
  if (!isZStackParticipant(el, view)) return null;
  const domIndex = Array.from(parent.children).indexOf(el);
  if (domIndex < 0) return null;
  const entries = collectZStackEntries(parent, view);
  const zIndex = computeZOrderValue(entries, domIndex, action);
  if (zIndex === null) return null;
  return buildZOrderStylePatch(view.getComputedStyle(el).position, zIndex);
}

export function computeZOrderStyleForElement(
  el: HTMLElement,
  action: ZOrderAction,
): string | null {
  return computeZOrderPatchForElement(el, action)?.zIndex ?? null;
}

export function collectZStackEntriesFromTargets(
  targets: readonly ManualEditTarget[],
  targetId: string,
  options?: ZOrderResolveOptions,
): { entries: ZStackEntry[]; domIndex: number } | null {
  const target = targets.find((item) => item.id === targetId);
  if (!target?.parentKey || !canAdjustZOrderTarget(target.cssPosition)) return null;
  const siblings = targets.filter((item) => {
    if (!canAdjustZOrderTarget(item.cssPosition)) return false;
    if (item.parentKey !== target.parentKey) return false;
    if (options?.deck && typeof options.activeSlideIndex === 'number') {
      return item.slideIndex === undefined || item.slideIndex === options.activeSlideIndex;
    }
    return true;
  });
  if (siblings.length === 0) return null;
  const entries = siblings.map((item) => ({
    domIndex: item.siblingIndex ?? 0,
    z: item.stackZ ?? readStackZFromZIndexStyle(item.styles.zIndex),
  }));
  const domIndex = target.siblingIndex ?? siblings.findIndex((item) => item.id === targetId);
  if (domIndex < 0) return null;
  return { entries, domIndex };
}

export function resolveZOrderContextFromTargets(
  targets: readonly ManualEditTarget[],
  targetId: string,
  options?: ZOrderResolveOptions,
): {
  capabilities: ZOrderCapabilities;
  domIndex: number;
} | null {
  const collected = collectZStackEntriesFromTargets(targets, targetId, options);
  if (!collected) return null;
  return {
    capabilities: zOrderCapabilities(collected.entries, collected.domIndex),
    domIndex: collected.domIndex,
  };
}

export function resolveZOrderContextWithFallback(
  doc: Document | null | undefined,
  targets: readonly ManualEditTarget[],
  targetId: string,
  options?: ZOrderResolveOptions,
): {
  capabilities: ZOrderCapabilities;
  domIndex: number;
} | null {
  return resolveZOrderContext(doc, targetId)
    ?? resolveZOrderContextFromTargets(targets, targetId, options);
}

export function resolveZOrderContext(
  doc: Document | null | undefined,
  targetId: string,
): {
  capabilities: ZOrderCapabilities;
  domIndex: number;
} | null {
  if (!doc || !targetId) return null;
  const el = findManualEditPreviewTarget(doc, targetId);
  const view = doc.defaultView;
  const parent = el?.parentElement;
  if (!el || !view || !parent) return null;
  if (!isZStackParticipant(el, view)) return null;
  const domIndex = Array.from(parent.children).indexOf(el);
  if (domIndex < 0) return null;
  const entries = collectZStackEntries(parent, view);
  return {
    capabilities: zOrderCapabilities(entries, domIndex),
    domIndex,
  };
}

export function computeZOrderPatchForTargetId(
  doc: Document | null | undefined,
  targetId: string,
  action: ZOrderAction,
): Partial<ManualEditStyles> | null {
  if (!doc || !targetId) return null;
  const el = findManualEditPreviewTarget(doc, targetId);
  if (!el) return null;
  return computeZOrderPatchForElement(el, action);
}

export function computeZOrderPatchForTargetWithFallback(
  doc: Document | null | undefined,
  targets: readonly ManualEditTarget[],
  targetId: string,
  action: ZOrderAction,
  options?: ZOrderResolveOptions,
): Partial<ManualEditStyles> | null {
  if (!targetId) return null;
  if (doc) {
    const el = findManualEditPreviewTarget(doc, targetId);
    if (el) {
      const patch = computeZOrderPatchForElement(el, action);
      if (patch) return patch;
    }
  }
  const collected = collectZStackEntriesFromTargets(targets, targetId, options);
  const target = targets.find((item) => item.id === targetId);
  if (!collected || !target) return null;
  const zIndex = computeZOrderValue(collected.entries, collected.domIndex, action);
  if (zIndex === null) return null;
  return buildZOrderStylePatch(target.cssPosition, zIndex);
}

export function computeZOrderStyleForTargetId(
  doc: Document | null | undefined,
  targetId: string,
  action: ZOrderAction,
): string | null {
  return computeZOrderPatchForTargetId(doc, targetId, action)?.zIndex ?? null;
}

export function zOrderHistoryLabel(action: ZOrderAction): string {
  switch (action) {
    case 'forward':
      return 'Bring forward';
    case 'backward':
      return 'Send backward';
    case 'front':
      return 'Bring to front';
    case 'back':
      return 'Send to back';
    default:
      return 'Z-order';
  }
}

/** Effective stack z for layer sort badges — `auto`/empty → 0. */
export function readStackZFromZIndexStyle(value: string | null | undefined): number {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === 'auto') return 0;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type ZOrderKeyboardInput = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'repeat' | 'shiftKey' | 'target'
>;

/**
 * Layer z-order shortcuts (manual edit, selected roots):
 * `]` forward · `[` backward · ⌘/Ctrl+`]` front · ⌘/Ctrl+`[` back.
 */
export function resolveZOrderKeyboardAction(event: ZOrderKeyboardInput): ZOrderAction | null {
  if (event.altKey || event.shiftKey || event.repeat) return null;
  if (isManualEditKeyboardTextTarget(event.target)) return null;
  const primary = isMacPlatform()
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (event.key === ']') return primary ? 'front' : 'forward';
  if (event.key === '[') return primary ? 'back' : 'backward';
  return null;
}

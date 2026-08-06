import { findManualEditPreviewTarget } from './manual-edit-host-preview';
import { isAnchoredCssPosition } from './resize-math';

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

export function canAdjustZOrderTarget(cssPosition: string | null | undefined): boolean {
  return isAnchoredCssPosition(cssPosition);
}

export function isZStackParticipant(el: Element, view: Window): boolean {
  const pos = view.getComputedStyle(el).position;
  return pos === 'absolute' || pos === 'fixed';
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
    if (!(child instanceof view.HTMLElement)) return;
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

export function computeZOrderStyleForElement(
  el: HTMLElement,
  action: ZOrderAction,
): string | null {
  const view = el.ownerDocument?.defaultView;
  const parent = el.parentElement;
  if (!view || !parent) return null;
  if (!isZStackParticipant(el, view)) return null;
  const domIndex = Array.from(parent.children).indexOf(el);
  if (domIndex < 0) return null;
  const entries = collectZStackEntries(parent, view);
  return computeZOrderValue(entries, domIndex, action);
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

export function computeZOrderStyleForTargetId(
  doc: Document | null | undefined,
  targetId: string,
  action: ZOrderAction,
): string | null {
  if (!doc || !targetId) return null;
  const el = findManualEditPreviewTarget(doc, targetId);
  if (!el) return null;
  return computeZOrderStyleForElement(el, action);
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

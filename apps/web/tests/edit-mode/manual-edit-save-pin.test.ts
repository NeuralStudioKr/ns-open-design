import { describe, expect, it } from 'vitest';
import {
  MANUAL_EDIT_SAVE_PIN_MAX_MS,
  MANUAL_EDIT_SAVE_PIN_MS,
  createManualEditSourcePin,
  isManualEditSourcePinFresh,
  manualEditHistoryConfirmCanSkipDiskFetch,
  manualEditHistoryConfirmTrustsLocal,
  preferManualEditPinnedSource,
  preferManualEditPinnedSourceOverLive,
  resolveManualEditSavePinTipRevision,
  shouldReleaseManualEditSavePinForTip,
  tipContentForManualEditSavePin,
} from '../../src/edit-mode/manual-edit-save-pin';

describe('manual edit save pin', () => {
  const saved = '<html><body><h1>Edited</h1></body></html>';
  const stale = '<html><body><h1>Original</h1></body></html>';

  it('prefers the pinned source when a post-save refetch returns stale HTML', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(preferManualEditPinnedSource(pinned, stale, 1_000 + 100)).toBe(saved);
  });

  it('prefers the pinned source when a post-save refetch returns null', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(preferManualEditPinnedSource(pinned, null, 1_000 + 100)).toBe(saved);
  });

  it('does not override when the refetch already matches the pin', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(preferManualEditPinnedSource(pinned, saved, 1_000 + 100)).toBeNull();
  });

  it('keeps holding a soft-expired pin while disk is still stale', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    const now = 1_000 + MANUAL_EDIT_SAVE_PIN_MS;
    expect(isManualEditSourcePinFresh(pinned, now)).toBe(false);
    expect(preferManualEditPinnedSource(pinned, stale, now)).toBe(saved);
    expect(preferManualEditPinnedSource(pinned, null, now)).toBe(saved);
  });

  it('releases the pin after the hard cap so a permanently lagging disk can win', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    const now = 1_000 + MANUAL_EDIT_SAVE_PIN_MAX_MS;
    expect(preferManualEditPinnedSource(pinned, stale, now)).toBeNull();
  });

  it('suppresses a stale liveHtml candidate while the pin is active', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(preferManualEditPinnedSourceOverLive(pinned, stale, 1_000 + 100)).toBe(saved);
    expect(preferManualEditPinnedSourceOverLive(pinned, saved, 1_000 + 100)).toBeNull();
  });

  it('lets history confirm trust a pinned local save over a lagging GET', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(manualEditHistoryConfirmTrustsLocal(saved, stale, pinned, 1_000 + 50)).toBe(true);
    expect(manualEditHistoryConfirmTrustsLocal(saved, stale, pinned, 1_000 + MANUAL_EDIT_SAVE_PIN_MAX_MS)).toBe(false);
    expect(manualEditHistoryConfirmTrustsLocal(saved, saved, null)).toBe(true);
  });

  it('lets history confirm trust authored last-stable bytes when the pin was cleared after a matching fetch', () => {
    // Pin cleared after disk briefly matched; a later stale GET must not
    // surface "file changed outside manual edit mode".
    expect(manualEditHistoryConfirmTrustsLocal(saved, stale, null, Date.now(), saved)).toBe(true);
    expect(manualEditHistoryConfirmTrustsLocal(saved, stale, null, Date.now(), stale)).toBe(false);
  });

  it('skips disk fetch when pin or authored already matches the save payload', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    expect(manualEditHistoryConfirmCanSkipDiskFetch(saved, pinned, 1_000 + 50)).toBe(true);
    expect(manualEditHistoryConfirmCanSkipDiskFetch(saved, null, Date.now(), saved)).toBe(true);
    expect(manualEditHistoryConfirmCanSkipDiskFetch(saved, null, Date.now(), stale)).toBe(false);
    expect(
      manualEditHistoryConfirmCanSkipDiskFetch(saved, pinned, 1_000 + MANUAL_EDIT_SAVE_PIN_MAX_MS),
    ).toBe(false);
  });

  it('does not skip disk fetch when warm tip already differs from expected (tip yield)', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    const tip = '<html><body><h1>Agent tip</h1></body></html>';
    // Stale pin+expected must not skip past a warmer tip (기획 50 undo/retention).
    expect(manualEditHistoryConfirmCanSkipDiskFetch(saved, pinned, 1_000 + 50, saved, tip)).toBe(false);
    expect(manualEditHistoryConfirmCanSkipDiskFetch(saved, null, 1_000 + 50, tip, tip)).toBe(false);
    // Tip===expected still allows authored/pin skip.
    expect(manualEditHistoryConfirmCanSkipDiskFetch(tip, null, 1_000 + 50, tip, tip)).toBe(true);
  });

  it('yields pin when tip content already matches fetch and differs from pin', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    const tip = '<html><body><h1>Agent tip</h1></body></html>';
    expect(shouldReleaseManualEditSavePinForTip(pinned, tip, tip, 1_000 + 100)).toBe(true);
    expect(preferManualEditPinnedSource(pinned, tip, 1_000 + 100, tip)).toBeNull();
    // Stale fetch that is not the tip still loses to the pin.
    expect(preferManualEditPinnedSource(pinned, stale, 1_000 + 100, tip)).toBe(saved);
    expect(shouldReleaseManualEditSavePinForTip(pinned, stale, tip, 1_000 + 100)).toBe(false);
    // Matching pin is unchanged.
    expect(preferManualEditPinnedSource(pinned, saved, 1_000 + 100, tip)).toBeNull();
    expect(preferManualEditPinnedSourceOverLive(pinned, tip, 1_000 + 100, tip)).toBeNull();
  });

  it('after tip yield, history confirm does not trust a stale expected save over tip disk', () => {
    const pinned = createManualEditSourcePin(saved, 1_000);
    const tip = '<html><body><h1>Agent tip</h1></body></html>';
    expect(preferManualEditPinnedSource(pinned, tip, 1_000 + 100, tip)).toBeNull();
    // Caller cleared pin; authored/disk are tip — undo/edit expected tip trusts local.
    expect(manualEditHistoryConfirmTrustsLocal(tip, stale, null, 1_000 + 100, tip, tip)).toBe(true);
    // Stale expected save must not win when disk already shows tip.
    expect(manualEditHistoryConfirmTrustsLocal(saved, tip, null, 1_000 + 100, tip, tip)).toBe(false);
    // Without tipContent arg, authored===expected still trusts (legacy path).
    expect(manualEditHistoryConfirmTrustsLocal(tip, stale, null, 1_000 + 100, tip)).toBe(true);
  });

  it('resolves tip content via active → head → last revision (pure pin helper)', () => {
    const tip = '<html><body><h1>Tip</h1></body></html>';
    const mid = '<html><body><h1>Mid</h1></body></html>';
    const stack = {
      revisions: [
        { id: 'r1', sequence: 1 },
        { id: 'r2', sequence: 2 },
        { id: 'r3', sequence: 3 },
      ],
      headRevisionId: 'r3',
    };
    const cache = new Map<string, string>([
      ['r2', mid],
      ['r3', tip],
    ]);
    const read = (id: string) => cache.get(id) ?? null;
    expect(resolveManualEditSavePinTipRevision(stack, 2)?.id).toBe('r2');
    expect(tipContentForManualEditSavePin(stack, 2, read)).toBe(mid);
    expect(tipContentForManualEditSavePin(stack, null, read)).toBe(tip);
    expect(tipContentForManualEditSavePin(stack, 99, read)).toBe(tip);
    expect(tipContentForManualEditSavePin({ revisions: [], headRevisionId: null }, 1, read)).toBeNull();
  });

  it('tip yield × undo retention: skipDiskFetch and trustsLocal agree on tip≠expected', () => {
    const tip = '<html><body><h1>Agent tip</h1></body></html>';
    const pinned = createManualEditSourcePin(saved, 1_000);
    // Pin still holds stale save while tip warmed — both gates refuse blind trust.
    expect(manualEditHistoryConfirmCanSkipDiskFetch(saved, pinned, 1_000 + 50, saved, tip)).toBe(false);
    expect(manualEditHistoryConfirmTrustsLocal(saved, tip, null, 1_000 + 100, tip, tip)).toBe(false);
    // After yield, undo/retention on tip itself is local-trusted + skippable.
    expect(manualEditHistoryConfirmCanSkipDiskFetch(tip, null, 1_000 + 100, tip, tip)).toBe(true);
    expect(manualEditHistoryConfirmTrustsLocal(tip, stale, null, 1_000 + 100, tip, tip)).toBe(true);
  });
});

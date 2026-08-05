import type { ManualEditTarget } from './types';

type Waiter = {
  resolve: (target: ManualEditTarget | null) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type ManualEditRemeasureAwaiter = {
  waitFor(id: string, timeoutMs?: number): Promise<ManualEditTarget | null>;
  complete(id: string, target: ManualEditTarget | null): void;
  cancelAll(): void;
};

/** Await `od-edit-rect` for a target id (with timeout) during geometry handoff. */
export function createManualEditRemeasureAwaiter(): ManualEditRemeasureAwaiter {
  const waitersById = new Map<string, Waiter[]>();

  function removeWaiter(id: string, resolve: (target: ManualEditTarget | null) => void) {
    const list = waitersById.get(id);
    if (!list) return;
    const next = list.filter((waiter) => waiter.resolve !== resolve);
    if (next.length === 0) waitersById.delete(id);
    else waitersById.set(id, next);
  }

  return {
    waitFor(id, timeoutMs = 500) {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          removeWaiter(id, resolve);
          resolve(null);
        }, timeoutMs);
        const list = waitersById.get(id) ?? [];
        list.push({ resolve, timeoutId });
        waitersById.set(id, list);
      });
    },
    complete(id, target) {
      const list = waitersById.get(id);
      if (!list?.length) return;
      waitersById.delete(id);
      for (const waiter of list) {
        clearTimeout(waiter.timeoutId);
        waiter.resolve(target);
      }
    },
    cancelAll() {
      for (const list of waitersById.values()) {
        for (const waiter of list) {
          clearTimeout(waiter.timeoutId);
          waiter.resolve(null);
        }
      }
      waitersById.clear();
    },
  };
}

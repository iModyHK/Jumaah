import { useSyncExternalStore } from 'react';
import type { LiveKhutbah, LiveSessionSnapshot } from '@jumaah/shared';
import { loadSession, type StoredSession } from '@jumaah/ui';

export type Screen = 'pick' | 'live';

export interface ConflictInfo {
  message: string;
  activeSince: string;
  deviceId: string;
}

export interface AppState {
  session: StoredSession | null;
  screen: Screen;
  /** Last authoritative snapshot (server push, HTTP, or the localStorage cache). */
  serverSnapshot: LiveSessionSnapshot | null;
  /** `serverSnapshot` with the pending (un-acked) command queue applied on top — what the UI renders. */
  snapshot: LiveSessionSnapshot | null;
  khutbah: LiveKhutbah | null;
  connected: boolean;
  everConnected: boolean;
  displays: number;
  clockOffsetMs: number;
  /** Number of commands waiting for a server ack. */
  pending: number;
  conflict: ConflictInfo | null;
}

export interface Store<T> {
  getState(): T;
  setState(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const store = createStore<AppState>({
  session: loadSession(),
  screen: 'pick',
  serverSnapshot: null,
  snapshot: null,
  khutbah: null,
  connected: false,
  everConnected: false,
  displays: 0,
  clockOffsetMs: 0,
  pending: 0,
  conflict: null,
});

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

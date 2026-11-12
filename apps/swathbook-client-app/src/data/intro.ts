import { useSyncExternalStore } from 'react';

import { deviceStorage } from '@/lib/device-storage';

/**
 * Whether this device has seen the welcome intro. A tiny store rather than
 * React state so navigation and the tab gate read the same value in the same
 * tick (marking it seen and then navigating can't race).
 */

const KEY = 'swathbook.intro-seen';

type State = { ready: boolean; seen: boolean };

let state: State = { ready: false, seen: false };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Read the saved flag once at startup. */
export async function loadIntroState() {
  if (state.ready) return;
  const saved = await deviceStorage.getItem(KEY).catch(() => null);
  set({ ready: true, seen: saved === '1' });
}

export function markIntroSeen() {
  set({ ready: true, seen: true });
  void deviceStorage.setItem(KEY, '1');
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useIntroState() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

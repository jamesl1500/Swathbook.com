import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock calls below are hoisted above this import by Vitest.
import { deviceStorage } from './device-storage';

const store = vi.hoisted(() => new Map<string, string>());

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => void store.set(key, value)),
  deleteItemAsync: vi.fn(async (key: string) => void store.delete(key)),
}));

beforeEach(() => store.clear());

describe('deviceStorage (native)', () => {
  it('round-trips a small value', async () => {
    await deviceStorage.setItem('k', 'hello');
    expect(await deviceStorage.getItem('k')).toBe('hello');
  });

  it('splits values larger than SecureStore likes into chunks', async () => {
    const session = 'x'.repeat(4000);
    await deviceStorage.setItem('session', session);
    expect(store.get('session.n')).toBe('3');
    expect(await deviceStorage.getItem('session')).toBe(session);
  });

  it('drops leftover chunks when a value shrinks', async () => {
    await deviceStorage.setItem('session', 'x'.repeat(4000));
    await deviceStorage.setItem('session', 'short');
    expect(store.has('session.1')).toBe(false);
    expect(store.has('session.2')).toBe(false);
    expect(await deviceStorage.getItem('session')).toBe('short');
  });

  it('reads a missing or half-written value as nothing', async () => {
    expect(await deviceStorage.getItem('nope')).toBeNull();
    store.set('broken.n', '2');
    store.set('broken.0', 'half');
    expect(await deviceStorage.getItem('broken')).toBeNull();
  });

  it('removes every chunk', async () => {
    await deviceStorage.setItem('session', 'x'.repeat(4000));
    await deviceStorage.removeItem('session');
    expect(store.size).toBe(0);
  });
});

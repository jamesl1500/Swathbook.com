import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small key-value storage on the device: the Supabase session and a few app
 * flags (e.g. whether the intro has been seen).
 *
 * Native: the iOS Keychain / Android Keystore via expo-secure-store. Sessions
 * can outgrow SecureStore's comfortable value size (~2KB), so values are
 * split into chunks: `<key>.n` holds the count, `<key>.0…` the parts.
 *
 * Web: localStorage. Absent during server rendering, where nobody is signed in.
 */

type DeviceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const CHUNK = 1800;

async function chunkCount(key: string) {
  return Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
}

const secureStorage: DeviceStorage = {
  async getItem(key) {
    const count = await chunkCount(key);
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some((part) => part == null) ? null : parts.join('');
  },
  async setItem(key, value) {
    const previous = await chunkCount(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((part, i) => SecureStore.setItemAsync(`${key}.${i}`, part)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
    // Drop leftover chunks from a longer previous value.
    for (let i = parts.length; i < previous; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
  async removeItem(key) {
    const count = await chunkCount(key);
    await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

const hasWindow = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const webStorage: DeviceStorage = {
  async getItem(key) {
    if (!hasWindow()) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    if (!hasWindow()) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the session lasts until the tab closes.
    }
  },
  async removeItem(key) {
    if (!hasWindow()) return;
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};

export const deviceStorage: DeviceStorage = Platform.OS === 'web' ? webStorage : secureStorage;

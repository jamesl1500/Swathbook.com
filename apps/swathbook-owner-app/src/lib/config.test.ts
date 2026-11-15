import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig(env: Record<string, string>, dev: boolean) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
  return import('./config');
}

const hosted = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  EXPO_PUBLIC_SITE_URL: 'https://www.swathbook.com',
};

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { __DEV__?: boolean }).__DEV__;
});

describe('config', () => {
  it('is configured with HTTPS URLs', async () => {
    expect((await loadConfig(hosted, false)).config.isConfigured).toBe(true);
  });

  it("won't run a release build against plain HTTP (sessions would travel in the clear)", async () => {
    expect((await loadConfig({ ...hosted, EXPO_PUBLIC_SUPABASE_URL: 'http://192.168.1.20:55421' }, false)).config.isConfigured).toBe(false);
  });

  it('allows the local stack in development', async () => {
    const { config } = await loadConfig({ ...hosted, EXPO_PUBLIC_SUPABASE_URL: 'http://192.168.1.20:55421', EXPO_PUBLIC_SITE_URL: 'http://192.168.1.20:3000' }, true);
    expect(config.isConfigured).toBe(true);
  });

  it('only links to pages of the web app', async () => {
    const { webUrl } = await loadConfig(hosted, false);
    expect(webUrl('/dashboard/billing')).toBe('https://www.swathbook.com/dashboard/billing');
    expect(webUrl('//evil.example')).toBe('https://www.swathbook.com');
    expect(webUrl('https://evil.example')).toBe('https://www.swathbook.com');
  });
});

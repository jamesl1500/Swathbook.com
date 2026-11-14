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
    const { config } = await loadConfig(hosted, false);
    expect(config).toMatchObject({ supabaseUrl: 'https://abc.supabase.co', siteUrl: 'https://www.swathbook.com', isConfigured: true });
  });

  it("won't run a release build against plain HTTP", async () => {
    const { config } = await loadConfig({ ...hosted, EXPO_PUBLIC_SITE_URL: 'http://192.168.1.20:3000' }, false);
    expect(config.isConfigured).toBe(false);
  });

  it('allows the local stack in development', async () => {
    const { config } = await loadConfig(
      { ...hosted, EXPO_PUBLIC_SUPABASE_URL: 'http://192.168.1.20:55421', EXPO_PUBLIC_SITE_URL: 'http://192.168.1.20:3000' },
      true,
    );
    expect(config.isConfigured).toBe(true);
  });

  it('defaults the site to production', async () => {
    const { config } = await loadConfig({ ...hosted, EXPO_PUBLIC_SITE_URL: '' }, false);
    expect(config.siteUrl).toBe('https://www.swathbook.com');
  });
});

describe('assetUrl and manageBookingUrl', () => {
  it('builds public asset URLs only for safe paths', async () => {
    const { assetUrl } = await loadConfig(hosted, false);
    expect(assetUrl('b1/logo-1.png')).toBe('https://abc.supabase.co/storage/v1/object/public/business-assets/b1/logo-1.png');
    expect(assetUrl('b1/photos/p-2.webp')).toMatch(/photos\/p-2\.webp$/);
    expect(assetUrl('../other-bucket/x.png')).toBeNull();
    expect(assetUrl('b1/../../x.png')).toBeNull();
    expect(assetUrl('https://evil.example/x.png')).toBeNull();
    expect(assetUrl(null)).toBeNull();
  });

  it('only links real booking tokens', async () => {
    const { manageBookingUrl } = await loadConfig(hosted, false);
    expect(manageBookingUrl('a'.repeat(64))).toBe(`https://www.swathbook.com/booking/${'a'.repeat(64)}`);
    expect(manageBookingUrl('../../dashboard')).toBe('https://www.swathbook.com');
  });
});

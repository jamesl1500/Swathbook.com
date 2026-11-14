import { describe, expect, it } from 'vitest';

import { checkBaseUrl, isLocalHost } from './url';

describe('checkBaseUrl', () => {
  it('accepts HTTPS everywhere and trims trailing slashes', () => {
    expect(checkBaseUrl('https://www.swathbook.com/', { dev: false })).toBe('https://www.swathbook.com');
    expect(checkBaseUrl('https://abc.supabase.co', { dev: true })).toBe('https://abc.supabase.co');
  });

  it('refuses plain HTTP in release builds, even to this machine', () => {
    expect(checkBaseUrl('http://www.swathbook.com', { dev: false })).toBeNull();
    expect(checkBaseUrl('http://localhost:3000', { dev: false })).toBeNull();
  });

  it('allows plain HTTP in development only to local addresses', () => {
    expect(checkBaseUrl('http://localhost:3000', { dev: true })).toBe('http://localhost:3000');
    expect(checkBaseUrl('http://127.0.0.1:55421', { dev: true })).toBe('http://127.0.0.1:55421');
    expect(checkBaseUrl('http://192.168.1.20:3000', { dev: true })).toBe('http://192.168.1.20:3000');
    expect(checkBaseUrl('http://my-laptop.local:3000', { dev: true })).toBe('http://my-laptop.local:3000');
    expect(checkBaseUrl('http://example.com', { dev: true })).toBeNull();
  });

  it('rejects junk, credentials, queries and other schemes', () => {
    expect(checkBaseUrl(undefined, { dev: true })).toBeNull();
    expect(checkBaseUrl('', { dev: true })).toBeNull();
    expect(checkBaseUrl('not a url', { dev: true })).toBeNull();
    expect(checkBaseUrl('https://user:pass@www.swathbook.com', { dev: false })).toBeNull();
    expect(checkBaseUrl('https://www.swathbook.com/?next=evil', { dev: false })).toBeNull();
    expect(checkBaseUrl('javascript:alert(1)', { dev: true })).toBeNull();
    expect(checkBaseUrl('ftp://www.swathbook.com', { dev: true })).toBeNull();
  });
});

describe('isLocalHost', () => {
  it.each(['localhost', '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.0.10', 'box.local'])('treats %s as local', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each(['172.32.0.1', '8.8.8.8', 'swathbook.com', 'localhost.evil.com', '192.168.1.1.evil.com'])('treats %s as remote', (host) => {
    expect(isLocalHost(host)).toBe(false);
  });
});

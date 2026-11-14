/**
 * Which server URLs the app may talk to. The session's access token goes to
 * the Supabase and site URLs, so in a release build both must be HTTPS. Plain
 * HTTP is only allowed in development, and only to this machine or the local
 * network (a phone talking to a laptop running the stack).
 */

const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[a-z0-9-]+\.local)$/i;

export function isLocalHost(hostname: string) {
  return PRIVATE_HOST.test(hostname);
}

/** A usable base URL (no path, query or credentials), or null. */
export function checkBaseUrl(value: string | undefined, { dev }: { dev: boolean }): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const secure = url.protocol === 'https:';
  const localHttp = url.protocol === 'http:' && dev && isLocalHost(url.hostname);
  if (!secure && !localHttp) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

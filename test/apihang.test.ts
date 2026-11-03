import { afterEach, describe, expect, it, vi } from 'vitest';

// A read that never answers must give up and be tried again, not hold its slot forever
describe('api read timeout', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('retries a hung GET', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { origin: 'http://x', href: 'http://x/', hash: '' });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('dispatchEvent', () => true);
    let calls = 0;
    vi.stubGlobal('fetch', (_u: unknown, init: RequestInit) => {
      calls++;
      if (calls === 1) return new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
      return Promise.resolve(new Response('{"data":[]}', { status: 200 }));
    });
    const { api } = await import('../app/src/core/api');
    const p = api('/accounts', { fresh: true });
    await vi.advanceTimersByTimeAsync(26000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toEqual({ data: [] });
    expect(calls).toBe(2);
  });
});

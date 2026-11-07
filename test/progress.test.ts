import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// The loading bar reports real request counts: stages, pages and a percentage that never invents progress
describe('load progress', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });
  it('is off outside a load and counts only requests made during one', async () => {
    const p = await import('../app/src/core/progress');
    expect(p.loadView().on).toBe(false);
    p.progReq('/api/v1/accounts').done();
    const end = p.loadBegin();
    expect(p.loadView()).toMatchObject({ on: true, pct: 0, text: 'Starting' });
    const a = p.progReq('/api/v1/accounts'), b = p.progReq('/api/v1/budgets');
    expect(p.loadView().text).toBe('Sending request to Firefly');
    a.stage('sending'); a.stage('receiving');
    expect(p.loadView().text).toBe('Receiving accounts from Firefly');
    a.done();
    expect(p.loadView()).toMatchObject({ pct: 50, detail: '1 of 2 requests' });
    b.done();
    expect(p.loadView()).toMatchObject({ text: 'Processing', pct: 99 });     // never 100 before the page is drawn
    end();
    expect(p.loadView().on).toBe(false);
  });
  it('says which page of a long list is being fetched, and that Firefly is being retried', async () => {
    const p = await import('../app/src/core/progress');
    const end = p.loadBegin();
    const first = p.progReq('/api/v1/transactions'); first.done();
    p.progPages('/api/v1/transactions', 12);
    const next = p.progReq('/api/v1/transactions?page=2');
    expect(p.loadView().text).toBe('Fetching transactions (page 2 of 12)');
    next.done();
    const again = p.progReq('/api/v1/transactions?page=3');
    expect(p.loadView().text).toBe('Fetching transactions (page 3 of 12)');
    again.stage('retrying', 2);
    expect(p.loadView()).toMatchObject({ text: 'Firefly is slow, retrying (2 of 3)', retrying: true });
    const before = p.loadView().pct;
    again.done(); p.progReq('/api/v1/x').stage('queued');
    expect(p.loadView().pct).toBeGreaterThanOrEqual(before);      // never goes backwards
    end();
  });
  it('overlapping loads keep the numbers until the last one ends', async () => {
    const p = await import('../app/src/core/progress');
    const e1 = p.loadBegin(), e2 = p.loadBegin();
    p.progReq('/api/v1/bills').done();
    e1(); e1();
    expect(p.loadView().on).toBe(true);
    e2();
    expect(p.loadView().on).toBe(false);
  });
  it('api requests report their stages, retries included', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { origin: 'http://x', href: 'http://x/', hash: '' });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('dispatchEvent', () => true);
    let calls = 0, mid = '';
    const p = await import('../app/src/core/progress');
    vi.stubGlobal('fetch', () => {
      calls++;
      if (calls === 1) { mid = p.loadView().text; return Promise.resolve(new Response('', { status: 502 })); }
      return Promise.resolve(new Response('{"data":[]}', { status: 200 }));
    });
    const { api } = await import('../app/src/core/api');
    const end = p.loadBegin();
    const pr = api('/accounts', { fresh: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(mid).toBe('Sending request to Firefly');
    expect(p.loadView()).toMatchObject({ text: 'Firefly is slow, retrying (1 of 3)', retrying: true });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pr).resolves.toEqual({ data: [] });
    expect(p.loadView()).toMatchObject({ text: 'Processing', retrying: false });
    end();
  });
  it('is wired in and stays out of the way', () => {
    const css = readFileSync('app/assets/money.css', 'utf8'), router = readFileSync('app/src/core/router.ts', 'utf8');
    expect(readFileSync('app/src/main.ts', 'utf8')).toContain("import './features/loadbar'");
    expect((router.match(/loadBegin\(\)/g) || []).length).toBe(3);      // page loads, pull to refresh, Recalculate
    expect(css).toMatch(/html\.ff-out \.ld \{ display: none; \}/);      // the "can't reach" screen takes over
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.ld\.idle/);
    expect(css).toMatch(/\.ld-sr \{ position: absolute/);
    expect(readFileSync('app/src/features/loadbar.ts', 'utf8')).toMatch(/role', 'status'/);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import glance from '../app/glance.js';

const env = (globalThis as any).process.env;
beforeEach(() => { env.DASH_PASSWORD = 'correct horse'; env.FIREFLY_TOKEN = 'tok'; });

const acc = (name: string, bal: string, extra: Record<string, unknown> = {}) => ({ id: name, attributes: { name, type: 'asset', current_balance: bal, currency_code: 'USD', active: true, account_role: 'defaultAsset', include_net_worth: true, ...extra } });
const ACCOUNTS = [acc('Checking', '1500.00'), acc('Savings', '500.50'), acc('Visa', '-300.00', { account_role: 'ccAsset' }), acc('Old', '999', { active: false }), acc('Euro', '40', { currency_code: 'EUR' })];
const bill = (name: string, amt: string, dates: string[], extra: Record<string, unknown> = {}) => ({ id: name, attributes: { name, amount_min: amt, amount_max: amt, currency_code: 'USD', active: true, pay_dates: dates, ...extra } });
const BILLS = [bill('Rent', '800', ['2026-11-12']), bill('Phone', '50', ['2026-11-20']), bill('Gym', '30', ['2026-11-07']), bill('Paused', '999', ['2026-11-09'], { active: false })];
const O = { today: '2026-11-09', days: 14, buffer: 100 };

function req({ method = 'GET', args = {} as any, auth = '', session = '', down = false } = {}) {
  const calls: string[] = [];
  const r: any = { method, args, headersIn: { Authorization: auth, 'X-Money': session ? '1' : undefined }, headersOut: {}, variables: { money_session: session }, status: 0, text: '', calls };
  r.return = (s: number, t = '') => { r.status = s; r.text = t; };
  r.subrequest = async (uri: string, o: { args: string }) => {
    calls.push(uri + '?' + o.args);
    if (down) return { status: 502, responseText: '' };
    const data = uri.endsWith('/accounts') ? ACCOUNTS : uri.endsWith('/bills') ? BILLS : [];
    return { status: 200, responseText: JSON.stringify({ data, meta: { pagination: { total_pages: 1 } } }) };
  };
  return r;
}
async function keyFor() { const r = req({ session: '1', args: { key: '1' } }); await glance.endpoint(r); return JSON.parse(r.text).key as string; }

describe('glance.js numbers', () => {
  const g = glance.glance(ACCOUNTS, BILLS, O);
  it('adds bank balances in the main currency, leaving out cards, inactive and other-currency accounts', () => {
    expect(g.currency).toBe('USD');
    expect(g.balance).toBe(2000.5);
  });
  it('takes off card balances, bills due within the window (overdue ones too), and the cushion', () => {
    expect(g.cardsOwed).toBe(300);
    expect(g.billsDue).toBe(880);            // rent 800 + phone 50 (day 11 of 14) + gym 30 (overdue); the paused bill is skipped
    expect(g.safeToSpend).toBe(Math.floor(2000.5 - 300 - 880 - 100));
  });
  it('never goes below zero', () => {
    expect(glance.glance(ACCOUNTS, BILLS, { ...O, buffer: 5000 }).safeToSpend).toBe(0);
  });
  it('finds the next bill, counting an overdue one as due today', () => {
    expect(g.nextBill).toMatchObject({ name: 'Gym', date: '2026-11-09', inDays: 0, overdue: true });
    const none = glance.glance(ACCOUNTS, [BILLS[0], BILLS[1]], O);
    expect(none.nextBill).toMatchObject({ name: 'Rent', date: '2026-11-12', inDays: 3, overdue: false });
    expect(glance.glance(ACCOUNTS, [], O).nextBill).toBeNull();
  });
  it('only counts bills inside the window, but still names a later next bill', () => {
    const short = glance.glance(ACCOUNTS, [bill('Phone', '50', ['2026-12-30'])], { ...O, days: 7 });
    expect(short.billsDue).toBe(0);
    expect(short.nextBill).toMatchObject({ name: 'Phone', inDays: 51 });
  });
  it('says it in words', () => {
    expect(glance.words(g)).toBe('$720 safe to spend · Gym is overdue');
    expect(glance.words(glance.glance(ACCOUNTS, [BILLS[0]], O))).toBe('$800 safe to spend · Rent in 3 days');
    expect(glance.words({ ...g, nextBill: null })).toContain('no bills due');
    expect(glance.words({ ...g, safeToSpend: 1234, nextBill: null })).toMatch(/^\$1,234 /);
  });
});

describe('glance.js endpoint', () => {
  it('gives the key only to a signed-in app', async () => {
    const anon = req({ args: { key: '1' } }); await glance.endpoint(anon);
    expect(anon.status).toBe(401);
    expect((await keyFor()).length).toBeGreaterThan(20);
  });
  it('uses a different key from the Apple Pay one, and changes it with the password', async () => {
    const a = await keyFor();
    env.DASH_PASSWORD = 'another one';
    expect(await keyFor()).not.toBe(a);
    const r = req({ auth: 'Bearer ' + a }); await glance.endpoint(r);
    expect(r.status).toBe(401);
  });
  it('refuses a missing or wrong key, and anything but GET', async () => {
    for (const auth of ['', 'Bearer nope', 'Basic abc']) { const r = req({ auth }); await glance.endpoint(r); expect(r.status).toBe(401); expect(r.calls).toEqual([]); }
    const p = req({ method: 'POST' }); await glance.endpoint(p); expect(p.status).toBe(405);
  });
  it('answers the numbers as JSON, never cached', async () => {
    const r = req({ auth: 'Bearer ' + await keyFor(), args: { today: '2026-11-09' } }); await glance.endpoint(r);
    const b = JSON.parse(r.text);
    expect(r.status).toBe(200);
    expect(r.headersOut['Cache-Control']).toBe('no-store');
    expect(b).toMatchObject({ ok: true, asOf: '2026-11-09', safeToSpend: 720, text: '$720 safe to spend · Gym is overdue' });
  });
  it('answers plain text for a Shortcut', async () => {
    const r = req({ auth: 'Bearer ' + await keyFor(), args: { format: 'text', today: '2026-11-09' } }); await glance.endpoint(r);
    expect(r.text).toBe('$720 safe to spend · Gym is overdue\n');
    expect(r.headersOut['Content-Type']).toContain('text/plain');
  });
  it('takes days and buffer from the address, within limits', async () => {
    const r = req({ auth: 'Bearer ' + await keyFor(), args: { today: '2026-11-09', days: '500', buffer: '-5' } }); await glance.endpoint(r);
    expect(JSON.parse(r.text)).toMatchObject({ days: 60, buffer: 100 });
  });
  it('gives no numbers at all when Firefly is down', async () => {
    const key = await keyFor();
    const j = req({ auth: 'Bearer ' + key, down: true }); await glance.endpoint(j);
    expect(j.status).toBe(503);
    expect(JSON.parse(j.text)).toEqual({ ok: false, error: 'Firefly is not reachable' });
    const t = req({ auth: 'Bearer ' + key, down: true, args: { format: 'text' } }); await glance.endpoint(t);
    expect(t.status).toBe(503);
    expect(t.text).not.toMatch(/\d/);
  });
});

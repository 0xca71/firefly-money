import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monthRange } from '../app/src/core/base';
import { normGroup } from '../app/src/core/feed';
import { createMockApi } from '../app/src/demo/mockapi';
import { creep, creepCard, creepChart, creepRows, fixedPayees, rhythm, rhythmCards, toTx, yoy, yoyRanges, yoyCard, trendsHtml, type TMonth, type TTx } from '../app/src/features/trends';

const clean = (h: unknown) => { const s = String(h); expect(s).not.toMatch(/NaN|Infinity|undefined/); return s; };
const months = (n: number, endMonth = 9, y = 2026): TMonth[] => Array.from({ length: n }, (_, i) => { const r = monthRange(y, endMonth - n + 1 + i); return { start: r.start, end: r.end, label: r.label, short: r.short }; });
const out = (date: string, amount: number, payee: string, category = 'Misc', bill = false): TTx => ({ date, amount, kind: 'out', category, payee, bill });
const inc = (date: string, amount: number): TTx => ({ date, amount, kind: 'in', category: 'Salary', payee: 'Acme', bill: false });
// income, a fixed rent and some everyday spending in each month, with the given growth per month
const world = (n: number, incomeUp: number, flexUp: number) => months(n).flatMap((m, i) => [
  inc(m.start, 3000 * (1 + incomeUp * i)), out(m.start, 1000, 'Landlord', 'Rent'),
  ...[3, 10, 17, 24].map(d => out(m.start.slice(0, 8) + String(d).padStart(2, '0'), 100 * (1 + flexUp * i), 'Shop ' + m.start.slice(0, 7) + d, 'Fun')),
]);

describe('fixed payees', () => {
  const ms = months(12);
  it('are the ones that charge about the same in nearly every month', () => {
    const txs = world(12, 0, 0);
    expect([...fixedPayees(txs, ms)]).toEqual(['Landlord']);
  });
  it('count a bill-linked charge, not a once-in-a-while payee', () => {
    const txs = [...world(12, 0, 0), out('2026-05-09', 800, 'Dentist'), out('2026-05-09', 99, 'Cable', 'Bills', true)];
    expect(fixedPayees(txs, ms).has('Dentist')).toBe(false);
  });
  it('ignore a payee that is used often every month (a coffee shop)', () => {
    const coffee = ms.flatMap(m => [2, 5, 9, 12].map(d => out(m.start.slice(0, 8) + String(d).padStart(2, '0'), 5, 'Beans')));
    expect(fixedPayees([...world(12, 0, 0), ...coffee], ms).has('Beans')).toBe(false);
  });
});

describe('lifestyle creep', () => {
  const run = (income: number, flex: number, n = 12) => creep(creepRows(world(n, income, flex), months(n)));
  it('warns when everyday spending grows faster than income', () => {
    const c = run(0.002, 0.04);
    expect(c).toMatchObject({ enough: true, tone: 'warn', head: 'Creeping up' });
    expect(c.text).toMatch(/^Everyday spending rose \d+% while income rose \d+%/);
    expect(c.growth.flex!).toBeGreaterThan(c.growth.income! + 0.05);
    expect(c.shareNow!).toBeGreaterThan(c.shareThen!);
  });
  it('is fine when income grows faster', () => {
    expect(run(0.03, 0.005)).toMatchObject({ tone: 'good', head: 'Income is ahead' });
  });
  it('is fine when both stay flat', () => {
    expect(run(0, 0)).toMatchObject({ tone: 'good', text: expect.stringContaining('held steady') });
  });
  it('splits fixed bills from everyday spending', () => {
    const rows = creepRows(world(12, 0, 0), months(12));
    expect(rows[0]).toMatchObject({ income: 3000, fixed: 1000, flex: 400 });
  });
  it('needs 6 months, and some income', () => {
    expect(run(0, 0, 4)).toMatchObject({ enough: false, head: 'Needs more history' });
    expect(creep(creepRows(world(12, 0, 0).filter(t => t.kind === 'out'), months(12))).enough).toBe(false);
  });
  it('draws without NaN, even with no spending', () => {
    clean(creepCard(run(0.002, 0.04), creepRows(world(12, 0.002, 0.04), months(12))));
    clean(creepChart(creepRows([], months(12)), 'x'));
  });
  it('treats refunds as less spending, not income', () => {
    const g = normGroup({ id: '1', attributes: { transactions: [{ transaction_journal_id: '1', type: 'deposit', date: '2026-05-04T12:00:00-05:00', amount: '30', tags: ['Refund'], category_name: 'Fun', source_name: 'Shop' }] } });
    expect(toTx([g])).toEqual([{ date: '2026-05-04', amount: -30, kind: 'out', category: 'Fun', payee: 'Shop', bill: false }]);
  });
});

describe('year over year', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 20, 12)); });
  afterEach(() => vi.useRealTimers());
  const ly = (cat: string, amt: number) => out('2025-10-05', amt, cat, cat), now = (cat: string, amt: number) => out('2026-10-05', amt, cat, cat);
  it('compares the days so far with the same days a year ago', () => {
    const r = yoyRanges('2026-10-20');
    expect(r.nowRange).toEqual({ start: '2026-10-01', end: '2026-10-20' });
    expect(r.prevRange).toEqual({ start: '2025-10-01', end: '2025-10-20' });
    expect(r.partial).toBe(true);
  });
  it('uses last month in full in the first days of a month', () => {
    const r = yoyRanges('2026-10-03');
    expect(r.nowRange).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(r.prevRange).toEqual({ start: '2025-09-01', end: '2025-09-30' });
  });
  it('says what went up and which category drove it', () => {
    const y = yoy([ly('Dining', 100), ly('Gas', 100), now('Dining', 250), now('Gas', 100)], yoyRanges('2026-10-20'));
    expect(y).toMatchObject({ enough: true, tone: 'warn', head: 'Spending is up', now: 350, prev: 200 });
    expect(y.text).toBe('You’ve spent $350, 75% more than the same days of October 2025, mostly Dining (+$150).');
    clean(yoyCard(y));
  });
  it('says when it is down, or about the same', () => {
    expect(yoy([ly('Dining', 300), now('Dining', 100)], yoyRanges('2026-10-20'))).toMatchObject({ tone: 'good', head: 'Spending is down' });
    expect(yoy([ly('Dining', 300), now('Dining', 305)], yoyRanges('2026-10-20'))).toMatchObject({ tone: 'good', head: 'About the same' });
  });
  it('has nothing to say without last year', () => {
    const y = yoy([now('Dining', 100)], yoyRanges('2026-10-20'));
    expect(y).toMatchObject({ enough: false, head: 'No year-ago data' });
    clean(yoyCard(y));
  });
});

describe('weekday and time-of-month rhythm', () => {
  const ms = months(12);
  // 20 per day, 5x on Saturdays, and a one-off $3000 trip that must not count
  const days = ms.flatMap(m => { const o: TTx[] = []; for (let d = m.start; d <= m.end; d = new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10)) o.push(out(d, new Date(d + 'T12:00:00').getDay() === 6 ? 100 : 20, 'Shop ' + d)); return o; });
  it('finds the weekday that costs most, ignoring one-off big purchases', () => {
    const r = rhythm([...days, out('2026-03-10', 3000, 'Resort')], ms);
    expect(r.enough).toBe(true);
    expect(r.weekdays.indexOf(Math.max(...r.weekdays))).toBe(5);
    expect(r.weekHead).toBe('Saturdays');
    expect(r.weekText).toMatch(/^You spend most on Saturdays: \d+% above a typical day/);
    expect(Math.max(...r.parts)).toBeLessThan(0.15);
    clean(rhythmCards(r));
  });
  it('finds the part of the month that costs most', () => {
    const r = rhythm(days.map(t => t.date.slice(8) >= '22' ? { ...t, amount: 60 } : t), ms);
    expect(r.partHead).toBe('Day 22 on');
    expect(r.partText).toMatch(/^Spending runs highest in the last week of the month/);
  });
  it('says even when nothing stands out', () => {
    const r = rhythm(days.map(t => ({ ...t, amount: 20 })), ms);
    expect(r).toMatchObject({ tone: 'good', weekHead: 'Even all week', partHead: 'Even all month' });
  });
  it('leaves out bills and rent, which land on set days', () => {
    const r = rhythm([...days.map(t => ({ ...t, amount: 20 })), ...ms.map(m => out(m.start, 2000, 'Landlord', 'Rent', true))], ms);
    expect(r.partHead).toBe('Even all month');
  });
  it('needs enough purchases', () => {
    expect(rhythm(days.slice(0, 10), ms).enough).toBe(false);
    clean(rhythmCards(rhythm([], ms)));
  });
});

describe('with the demo data', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 20, 12)); });
  afterEach(() => vi.useRealTimers());
  const api = createMockApi(new Date(2026, 9, 20)), ms = months(12, 8);
  const txs = toTx(((api('/transactions', { start: '2025-09-01', end: '2026-10-20', type: 'all', limit: '100000' }) as any).data).map(normGroup));
  it('shows lifestyle creep over the last year', () => {
    const c = creep(creepRows(txs, ms));
    expect(c).toMatchObject({ enough: true, tone: 'warn' });
    expect(c.growth.flex!).toBeGreaterThan(c.growth.income! + 0.05);
  });
  it('finds a weekend and a payday-week pattern', () => {
    const r = rhythm(txs, ms);
    expect(r.enough).toBe(true);
    expect([5, 6]).toContain(r.weekdays.indexOf(Math.max(...r.weekdays)));
    expect(r.weekdays[5] + r.weekdays[6]).toBeGreaterThan(0.2);
    expect(r.parts[3]).toBeLessThan(0);
  });
  it('compares this month with the same month last year', () => {
    const y = yoy(txs, yoyRanges('2026-10-20'));
    expect(y.enough).toBe(true);
    clean(yoyCard(y));
  });
});

describe('when Firefly can’t be reached', () => {
  it('shows no numbers, only a note', async () => {
    vi.resetModules();
    vi.doMock('../app/src/core/api', () => ({ getAll: () => Promise.reject(new Error('down')) }));
    const { trendsHtml: t } = await import('../app/src/features/trends');
    const h = String(await t({ creep: true, yoy: true, rhythm: true }));
    expect(h).toContain('Couldn’t load the trends');
    expect(h).not.toContain('<svg');
    vi.doUnmock('../app/src/core/api');
  });
  it('draws nothing when every trend card is off', async () => { expect(await trendsHtml({ creep: false, yoy: false, rhythm: false })).toBe(''); });
});

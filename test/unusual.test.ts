import { describe, expect, it } from 'vitest';
import { createMockApi } from '../app/src/demo/mockapi';
import { normGroup } from '../app/src/core/feed';
import { type Charge, chargesOf, findUnusual, trends } from '../app/src/features/unusual';

let n = 0;
const ch = (key: string, date: string, amount: number, cat = 'Dining'): Charge => ({ id: String(++n), date, key, payee: key, payeeId: '', cat, amount });
// A merchant with a charge every 10 days from 2026-05-01
const usual = (key: string, amount: number, cat = 'Dining') => Array.from({ length: 16 }, (_, i) => ch(key, new Date(Date.UTC(2026, 4, 1 + i * 10)).toISOString().slice(0, 10), amount + (i % 3), cat));
const TODAY = '2026-10-20';

describe('unusual charges', () => {
  it('flags a charge far above the merchant’s usual, not a normal one', () => {
    const f = findUnusual([...usual('pharmacy', 23, 'Health'), ch('pharmacy', '2026-10-15', 189, 'Health'), ch('pharmacy', '2026-10-17', 25, 'Health')], TODAY).flags;
    expect(f.map(x => x.kind)).toEqual(['spike']);
    expect(f[0].charge.amount).toBe(189);
    expect(Math.round(f[0].typical)).toBe(24);
  });
  it('flags a repeat within a day, once, unless the merchant routinely does it', () => {
    const dup = [ch('burrito', '2026-10-18', 18.5), ch('burrito', '2026-10-18', 18.5)];
    expect(findUnusual([...usual('burrito', 15), ...dup], TODAY).flags.map(x => x.kind)).toEqual(['duplicate']);
    const routine = [ch('coffee', '2026-08-02', 4.5), ch('coffee', '2026-08-02', 4.5), ch('coffee', '2026-10-18', 4.5), ch('coffee', '2026-10-18', 4.5)];
    expect(findUnusual([...usual('coffee', 6), ...routine], TODAY).flags.filter(x => x.kind === 'duplicate')).toEqual([]);
  });
  it('flags a large first-time merchant only once there is history to compare with', () => {
    const base = usual('grocer', 60, 'Groceries').concat(usual('cafe', 12), usual('gas', 40, 'Gas'));
    expect(findUnusual([...base, ch('dentist', '2026-10-17', 420, 'Health')], TODAY).flags.map(x => x.kind)).toEqual(['new-large']);
    expect(findUnusual([...base, ch('bakery', '2026-10-17', 9.75)], TODAY).flags).toEqual([]);
    expect(findUnusual([ch('grocer', '2026-10-01', 60), ch('dentist', '2026-10-17', 420)], TODAY).flags).toEqual([]);
  });
  it('judges a thin merchant by its category', () => {
    const cat = Array.from({ length: 12 }, (_, i) => ch('m' + i, '2026-0' + (5 + (i % 4)) + '-1' + (i % 9), 40 + i, 'Dining'));
    const f = findUnusual([...cat, ch('newplace', '2026-10-10', 300, 'Dining')], TODAY).flags;
    expect(f.map(x => x.charge.payee)).toEqual(['newplace']);
    expect(f[0].kind).toBe('spike');
  });
  it('lists nothing for quiet spending, and ignores charges older than 30 days', () => {
    expect(findUnusual([...usual('cafe', 12), ch('cafe', '2026-09-10', 500)], TODAY).flags).toEqual([]);
  });
});

describe('merchant trends', () => {
  const hist = (key: string, amts: number[]) => amts.flatMap((a, i) => [ch(key, '2026-0' + (7 + i) + '-05', a), ch(key, '2026-0' + (7 + i) + '-12', a)]);
  it('ranks who rose and fell against the same days of the last three months, and who is new', () => {
    const c = [...hist('rise', [20, 20, 20]), ch('rise', '2026-10-03', 90), ...hist('fall', [100, 100, 100]), ch('fall', '2026-10-03', 20),
      ...hist('flat', [30, 30, 30]), ch('flat', '2026-10-04', 30), ch('flat', '2026-10-11', 30), ch('fresh', '2026-10-08', 55)];
    const t = trends(c, TODAY);
    expect(t.risers.map(x => x.key)).toEqual(['rise']);
    expect(t.fallers.map(x => x.key)).toEqual(['fall']);
    expect(t.fresh.map(x => x.key)).toEqual(['fresh']);
    expect(Math.round(t.risers[0].delta)).toBe(50);
  });
  it('doesn’t call anything new when there is under two months of history', () => {
    expect(trends([ch('a', '2026-10-02', 20), ch('b', '2026-09-25', 20)], TODAY).fresh).toEqual([]);
  });
});

describe('demo data', () => {
  it('has the planted charges and no pile of false alarms', () => {
    const api = createMockApi(new Date(2026, 9, 20)), raw = (api('/transactions', { type: 'withdrawal', start: '2026-05-01', end: '2026-10-20', limit: '100000' }) as any).data;
    const u = findUnusual(chargesOf(raw.map(normGroup)), '2026-10-20');
    const by = (p: string) => u.flags.find(f => f.charge.payee === p);
    expect(by('Burrito Bar')?.kind).toBe('duplicate');
    expect(by('Pharmacy Plus')?.kind).toBe('spike');
    expect(by('Dental Care Associates')?.kind).toBe('new-large');
    expect(u.flags.length).toBeLessThanOrEqual(6);
    expect(u.fresh.map(x => x.payee)).toContain('Sunrise Bakery');
  });
});

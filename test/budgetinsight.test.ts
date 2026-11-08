import { describe, expect, it } from 'vitest';
import { budgetCard, budgetInsight, type BMonth } from '../app/src/features/budgetinsight';
import { budgetMonthsChart, budgetPaceChart } from '../app/src/features/charts';

const clean = (h: unknown) => { const s = String(h); expect(s).not.toMatch(/NaN|Infinity|undefined/); return s; };
// A 30-day month starting on `start` (the 1st of a 30-day month here) with the given spending on days 1.. and an amount
const month = (n: number, spent: number[], limit: number, len = 30): BMonth => {
  const daily = Array(len).fill(0); spent.forEach((v, i) => { daily[i] = v; });
  const m = String(n).padStart(2, '0');
  return { start: `2026-${m}-01`, end: `2026-${m}-${len}`, label: 'Month ' + n, short: 'M' + n, spent: daily.reduce((a, b) => a + b, 0), limit, daily };
};
const steady = (n: number, per: number, limit: number) => month(n, Array(30).fill(per), limit);

describe('budget insight', () => {
  const past = [steady(6, 10, 400), steady(7, 12, 400), steady(8, 15, 400), steady(9, 10, 400)];
  it('judges this month by its pace so far', () => {
    const ok = budgetInsight([...past, month(10, Array(10).fill(10), 400)], '2026-10-10', 85);
    expect(ok.live).toBe(true);
    expect(ok.tone).toBe('good');
    expect(ok.head).toBe('On track');
    expect(ok.ahead).toBe(300);
    expect(ok.daysLeft).toBe(20);
    expect(ok.safeDaily).toBeCloseTo(300 / 21, 5);
    const fast = budgetInsight([...past, month(10, Array(10).fill(20), 400)], '2026-10-10', 85);
    expect(fast.tone).toBe('warn');
    expect(fast.head).toBe('Ahead of pace');
    const over = budgetInsight([...past, month(10, Array(10).fill(50), 400)], '2026-10-10', 85);
    expect(over.tone).toBe('over');
    expect(over.text).toContain('$100 over');
  });
  it('compares with the usual month and with last month, day for day', () => {
    // average of 10, 12, 15, 10 a day = 11.75; by day 10 that is 117.50 in all; last month 100 by day 10
    const i = budgetInsight([...past, month(10, Array(10).fill(15), 400)], '2026-10-10', 85);
    expect(i.avgSpend).toBeCloseTo(352.5, 5);
    expect(i.usual).toHaveLength(30);
    expect(i.vsUsual).toBeCloseTo(150 - 117.5, 5);
    expect(i.vsLast).toBeCloseTo(150 - 100, 5);
  });
  it('counts streaks, months over and the worst month from the months that had an amount', () => {
    const ms = [steady(5, 20, 400), steady(6, 10, 400), steady(7, 9, 400), month(8, Array(30).fill(20), 400), steady(9, 10, 400), steady(10, 10, 400)];
    const i = budgetInsight(ms, '2026-11-05', 85);          // the month on show (October) is over
    expect(i.live).toBe(false);
    expect(i.streak).toEqual({ kind: 'under', n: 2 });  // Sep and Oct; Aug was over
    expect(i.overCount).toBe(2);
    expect(i.counted).toBe(6);
    expect(i.worst).toEqual({ label: 'Month 5', by: 200 });
    expect(i.head).toBe('Stayed within');
  });
  it('copes with no amount, no history and a month that has not started', () => {
    const bare = budgetInsight([month(10, [30], 0)], '2026-10-10', 85);
    expect(bare.tone).toBe('none');
    expect(bare.avgSpend).toBeNull();
    expect(bare.usual).toEqual([]);
    const early = budgetInsight([steady(9, 10, 400), month(10, [10], 400)], '2026-10-01', 85);
    expect(early.ahead).toBeNull();
    expect(early.text).toContain('left of');
    const fut = budgetInsight([steady(9, 10, 400), month(10, [], 400)], '2026-09-20', 85);
    expect(fut.live).toBe(false);
    expect(fut.head).toBe('Not started');
  });
});

describe('budget charts and cards', () => {
  it('draw without NaN for empty, zero and full data', () => {
    clean(budgetMonthsChart([{ label: 'A', short: 'A', spent: 0, limit: 0 }], 85, 'x'));
    const s = clean(budgetMonthsChart([{ label: 'A', short: 'A', spent: 50, limit: 100 }, { label: 'B', short: 'B', spent: 150, limit: 100, go: '#/x' }], 85, 'x'));
    expect(s).toContain('viewBox="0 0 360 150"');
    expect(s).not.toContain('preserveAspectRatio');
    expect(s.match(/class="bar"/g)).toHaveLength(2);
    expect(s.match(/class="lim"/g)).toHaveLength(2);
    clean(budgetPaceChart([], [], 0, 30, 0, ['Oct', 'Usual'], 'x'));
    const p = clean(budgetPaceChart([5, 10, 20], [4, 8, 12, 16], 300, 30, 250, ['Oct', 'Usual'], 'x'));
    expect(p).toContain('class="ahead"');
    expect(p).not.toContain('preserveAspectRatio');
  });
  it('shows a verdict, the numbers and both charts', () => {
    const ms = [steady(8, 10, 400), steady(9, 12, 400), month(10, Array(10).fill(10), 400)];
    const card = clean(budgetCard({ id: '7', name: 'Food', active: true }, budgetInsight(ms, '2026-10-10', 85), 85));
    expect(card).toContain('On track');
    expect(card).toContain('Average month');
    expect(card).toContain('Safe per day');
    expect(card).toContain('Month by month');
    expect(card).toContain('Pace through the month');
    expect(card).toContain('#/transactions?budget=7');
  });
});

import { describe, expect, it } from 'vitest';
import { projectMonthly, usualDay } from '../app/src/features/projections';

const h = (date: string, amount: number) => ({ date, amount });
const run = (hist: ReturnType<typeof h>[], from = '2026-11-04', to = '2027-02-28', known?: Record<string, number>) =>
  projectMonthly({ key: 'k', name: 'Card', day: usualDay(hist), hist, known }, from, to).map(p => [p.date, p.amount, p.basis]);

describe('projections: variable monthly outflows', () => {
  it('uses last month when there is no year of history', () => {
    expect(run([h('2026-09-10', 400), h('2026-10-10', 520), h('2026-11-10', 0.01)].slice(0, 2), '2026-11-04', '2026-12-31'))
      .toEqual([['2026-11-10', 520, 'Oct'], ['2026-12-10', 520, 'Nov']]);
  });
  it('averages last month and the same month last year', () => {
    const r = run([h('2025-12-10', 900), h('2026-10-10', 500)], '2026-11-04', '2026-12-31');
    expect(r[1]).toEqual(['2026-12-10', 700, 'Nov & Dec 2025']);
  });
  it('uses the same month last year when last month is missing', () => {
    expect(run([h('2025-11-10', 300), h('2025-12-10', 800), h('2026-08-10', 100)], '2026-11-04', '2026-12-31').map(r => r[2]))
      .toEqual(['Nov 2025', 'Nov & Dec 2025']);
  });
  it('skips months already in the history and starts after a known payoff', () => {
    expect(run([h('2026-10-10', 500), h('2026-11-02', 480)], '2026-11-04', '2026-12-31')).toEqual([['2026-12-10', 480, 'Nov']]);
    expect(run([h('2026-10-10', 500)], '2026-11-04', '2026-12-31', { '2026-11': 650 })).toEqual([['2026-12-10', 650, 'Nov']]);
  });
  it('drops dates already past, clamps the day to short months, and projects nothing without history', () => {
    expect(run([h('2026-10-31', 100)], '2026-11-04', '2027-02-28').map(r => r[0])).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
    expect(run([h('2026-10-02', 100)], '2026-11-04', '2026-11-30')).toEqual([]);
    expect(run([], '2026-11-04', '2026-12-31')).toEqual([]);
  });
});

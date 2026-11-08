import { describe, expect, it } from 'vitest';
import { anomaly, backtest, cashBands, coverage, median, monthEnd, quantile, rng } from '../app/src/features/predict';
import { paceForecast } from '../app/src/features/projections';

// A made-up year: rent on day 1, bills early, a noisy even trickle after, with one holiday-sized month
function months(n: number, seed = 5) {
  const r = rng(seed);
  return [...Array(n)].map((_, i) => [...Array(30)].map((_, d) => (d === 0 ? 1800 : d < 6 ? 60 : 55 + r() * 70) * (i === 4 && d > 20 ? 4 : 1)));
}
const total = (m: number[]) => m.reduce((s, v) => s + v, 0);

describe('stats', () => {
  it('median and quantile', () => {
    expect(median([5, 1, 3])).toBe(3); expect(median([1, 2, 3, 4])).toBe(2.5); expect(median([])).toBe(0);
    expect(quantile([1, 2, 3, 4, 5], .5)).toBe(3); expect(quantile([0, 10], .1)).toBe(1);
  });
  it('rng repeats for a seed', () => { expect([rng(1)(), rng(1)()]).toEqual([rng(1)(), rng(1)()]); expect(rng(1)()).not.toBe(rng(2)()); });
});

describe('monthEnd', () => {
  const hist = months(8).slice(0, 7).reverse();       // newest first
  it('is repeatable and between the range ends', () => {
    const cur = months(8)[7].slice(0, 12), spent = total(cur), a = monthEnd(spent, 12, 30, hist)!;
    expect(a).toEqual(monthEnd(spent, 12, 30, hist));
    expect(a.lo).toBeLessThanOrEqual(a.mid); expect(a.mid).toBeLessThanOrEqual(a.hi); expect(a.lo).toBeGreaterThanOrEqual(spent);
    expect(a.low).toBe(false);
  });
  it('flags low data under 3 past months, and gives nothing with none', () => {
    expect(monthEnd(1900, 5, 30, hist.slice(0, 2))!.low).toBe(true);
    expect(monthEnd(1900, 5, 30, [])).toBeNull();
    expect(monthEnd(1900, 0, 30, hist)).toBeNull();
    expect(monthEnd(1900, 30, 30, hist)).toBeNull();
  });
  it('matches the old call with one past month', () => {
    const prev = hist[0], spent = total(months(8)[7].slice(0, 10));
    expect(monthEnd(spent, 10, 30, [prev])!.mid).toBeCloseTo(paceForecast(spent, 10, 30, prev), 6);
  });
  it('one odd month moves it less than the old last-month-only call', () => {
    const sane = hist.slice(1), odd = [hist[0].map(v => v * 4), ...sane], spent = 2300, newer = monthEnd(spent, 10, 30, odd)!.mid, old = paceForecast(spent, 10, 30, odd[0]);
    expect(newer).toBeLessThan(old);
  });
  it('is at least as accurate as the old pace on a year of history, and the range mostly holds', () => {
    const m = months(14, 11), old = backtest(m, (s, d, n, p) => paceForecast(s, d, n, p[0])), now = backtest(m, (s, d, n, p) => monthEnd(s, d, n, p)?.mid ?? 0);
    expect(now.n).toBe(old.n);
    expect(now.mape).toBeLessThanOrEqual(old.mape);
    const c = coverage(m); expect(c.n).toBeGreaterThan(10); expect(c.share).toBeGreaterThan(.6);
  });
});

describe('anomaly', () => {
  const h = [100, 104, 98, 102, 101, 99];
  it('flags a spike and a collapse, not normal drift', () => {
    expect(anomaly(h, 240).flag).toBe('high'); expect(anomaly(h, 5).flag).toBe('low'); expect(anomaly(h, 105).flag).toBeNull();
  });
  it('ignores an old spike in the history', () => { expect(anomaly([100, 102, 99, 900, 101, 100], 103).flag).toBeNull(); });
  it('needs enough history; handles identical history', () => {
    expect(anomaly([100, 100, 100], 900).flag).toBeNull();
    expect(anomaly([50, 50, 50, 50], 120).flag).toBe('high'); expect(anomaly([50, 50, 50, 50], 52).flag).toBeNull();
  });
});

describe('cashBands', () => {
  const ev = [{ day: 3, amount: 2000, kind: 'Payday' }, { day: 5, amount: -900, kind: 'Bill' }, { day: 12, amount: -350, kind: 'Projected' }, { day: 20, amount: -600, kind: 'Card' }, { day: 30, amount: 2000, kind: 'Payday' }];
  it('orders p10 <= p50 <= p90, is repeatable, and fixed items have no spread', () => {
    const b = cashBands(1000, 40, ev)!;
    expect(b).toEqual(cashBands(1000, 40, ev)); expect(b.p10).toHaveLength(41);
    b.p50.forEach((v, i) => { expect(b.p10[i]).toBeLessThanOrEqual(v); expect(v).toBeLessThanOrEqual(b.p90[i]); });
    expect(b.p90[2] - b.p10[2]).toBe(0);          // before anything flexible
    expect(b.p90[40] - b.p10[40]).toBeGreaterThan(50);
    expect(b.p50[40]).toBeGreaterThan(3000); expect(b.p50[40]).toBeLessThan(3300);
  });
  it('reports the chance of going below zero', () => {
    expect(cashBands(1000, 40, ev)!.pBelowZero).toBe(0);
    expect(cashBands(-100, 40, ev)!.pBelowZero).toBe(1);
    expect(cashBands(300, 40, ev)!.minP10).toBeLessThan(300);
  });
  it('gives nothing when there is too little scheduled', () => { expect(cashBands(1000, 30, ev.slice(0, 2))).toBeNull(); });
});

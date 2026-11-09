import { describe, expect, it } from 'vitest';
import { activityDays } from '../app/src/features/charts';
import { duplicateOf } from '../app/src/features/txform';
import { INVEST_RE } from '../app/src/features/moneyhealth';
import { lessRefundTx, netted, type Refund } from '../app/src/features/refunds';
import { normGroup } from '../app/src/core/feed';

const refund = (x: Partial<Refund> = {}): Refund => ({ jid: '9', date: '2026-10-10', amount: 30, category: 'Shopping', payee: 'Amazon', budgetId: '2', budget: 'Fun', known: true, ...x });
const entry = (v: number) => ({ name: 'USD', difference: v.toFixed(2), difference_float: v });
const range = { start: '2026-10-01', end: '2026-10-31' };
const wd = (id: string, date: string, amount: number) => ({ id, attributes: { transactions: [{ transaction_journal_id: id, type: 'withdrawal', date, amount: String(amount), description: 'x' }] } });

describe('Spent agrees across widgets', () => {
  const tx = [wd('1', '2026-10-10', 100), wd('2', '2026-10-12', 100)], rs = [refund()];
  it('day-by-day views net refunds like the insight total', () => {
    const days = lessRefundTx(tx, rs)!.map(normGroup).reduce((s, g) => s + g.total, 0);
    expect(days).toBe(170);
    expect(-(netted('/insight/expense/total', range, [entry(-200)], rs)[0].difference_float as number)).toBe(170);
    const buys = lessRefundTx(tx, rs)!.map(normGroup).flatMap(g => g.splits.map(x => ({ date: String(x.date), amount: x.amount })));
    expect(activityDays(buys, '2026-10-08', '2026-10-14', '2026-10-14', 2000).reduce((s, d) => s + d.v, 0)).toBe(170);
  });
  it('a refund does not count as a purchase and leaves null alone', () => {
    const buys = lessRefundTx(tx, rs)!.map(normGroup).flatMap(g => g.splits.map(x => ({ date: String(x.date), amount: x.amount })));
    expect(activityDays(buys, '2026-10-08', '2026-10-14', '2026-10-14', 2000).reduce((s, d) => s + d.n, 0)).toBe(2);
    expect(lessRefundTx(null, rs)).toBeNull();
  });
  it('a transfer changes neither earned nor spent', () => {
    // transfers are neither deposits nor withdrawals, so the insight totals (and these) never see them
    expect(netted('/insight/expense/total', range, [entry(-200)], [])[0].difference_float).toBe(-200);
    expect(lessRefundTx(tx, [])).toBe(tx);
  });
});

describe('one-offs', () => {
  const one = refund({ jid: '5', amount: 800, oneOff: true });
  it('come off spending but never off income', () => {
    expect(netted('/insight/expense/total', range, [entry(-1000)], [one])[0].difference_float).toBe(-200);
    expect(netted('/insight/income/total', range, [entry(3000)], [one])[0].difference_float).toBe(3000);
    expect(netted('/insight/income/category', range, [entry(3000)], [{ ...one, category: 'USD' }])[0].difference_float).toBe(3000);
  });
});

describe('investments stay out of bank balances', () => {
  it('matches brokerage-style names only', () => {
    expect(['Fidelity Brokerage', 'Roth IRA', 'Coinbase crypto'].every(n => INVEST_RE.test(n))).toBe(true);
    expect(['Checking', 'Savings'].some(n => INVEST_RE.test(n))).toBe(false);
  });
});

describe('duplicate warning', () => {
  const have = [{ attributes: { transactions: [{ type: 'withdrawal', description: 'Coffee', amount: '4.50', date: '2026-10-10T08:00:00+00:00' }] } }];
  const body = (d: string, a: string) => ({ transactions: [{ type: 'withdrawal', description: d, amount: a, date: '2026-10-10' }] });
  it('spots the same description, amount and day', () => {
    expect(duplicateOf(have, body(' coffee ', '4.5'))).toBe(true);
    expect(duplicateOf(have, body('Coffee', '5'))).toBe(false);
    expect(duplicateOf(have, body('Tea', '4.5'))).toBe(false);
    expect(duplicateOf([], body('Coffee', '4.5'))).toBe(false);
  });
});

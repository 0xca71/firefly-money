import { describe, expect, it } from 'vitest';
import { auditSubs } from '../app/src/features/subaudit';
import { subChargesHref } from '../app/src/features/subauditview';

const c = (date: string, amount: number, payee: string, billId = '') => ({ date, amount, payeeId: payee.toLowerCase(), payee, billId });
const monthly = (payee: string, amount: number, months: number[], day = 4, billId = '') => months.map(m => c('2026-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0'), amount, payee, billId));

describe('auditSubs', () => {
  it('totals the monthly and yearly cost, biggest first, and includes ones already linked to a bill', () => {
    const a = auditSubs([...monthly('Music', 10, [6, 7, 8, 9, 10]), ...monthly('Gym', 40, [6, 7, 8, 9, 10], 8, '3'), c('2025-11-02', 120, 'Domain'), c('2026-11-02', 120, 'Domain')], '2026-11-04');
    expect(a.items.map(i => i.payee)).toEqual(['Gym', 'Music', 'Domain']);
    expect(a.items[0]).toMatchObject({ billId: '3', perMonth: 40, perYear: 480 });
    expect(a.yearly).toBe(720);
  });
  it('flags a price rise against the earlier charges, and creep since the first', () => {
    const a = auditSubs([...monthly('Stream', 15.49, [6, 7, 8, 9]), c('2026-10-04', 17.99, 'Stream')], '2026-10-20');
    expect(a.items[0].hike).toEqual({ from: 15.49, to: 17.99, pct: 16 });
    expect(a.hikes).toBe(1);
    const b = auditSubs([...monthly('Cloud', 5, [4, 5]), ...monthly('Cloud', 6, [6, 7]), ...monthly('Cloud', 6, [8, 9, 10])], '2026-10-20');
    expect(b.items[0].hike).toBeNull();
    expect(b.items[0].creep).toMatchObject({ from: 5, to: 6 });
  });
  it('marks one late, then quiet after 60 days without a charge, and leaves quiet ones out of the totals', () => {
    const base = monthly('Vault', 9.99, [3, 4, 5, 6, 7]);      // last charge 2026-07-04
    expect(auditSubs(base, '2026-07-20').items[0].status).toBe('ok');
    expect(auditSubs(base, '2026-08-20').items[0]).toMatchObject({ status: 'late', daysSince: 47 });
    const q = auditSubs([...base, ...monthly('Music', 10, [5, 6, 7, 8, 9])], '2026-09-20');
    expect(q.items.find(i => i.payee === 'Vault')).toMatchObject({ status: 'quiet', daysSince: 78 });
    expect(q).toMatchObject({ quiet: 1, yearly: 120, monthly: 10, quietYearly: 119.88 });
  });
  it('lists the next due date and what is due within a week', () => {
    const a = auditSubs(monthly('Music', 10, [6, 7, 8, 9, 10]), '2026-10-30');
    expect(a.items[0]).toMatchObject({ next: '2026-11-04', status: 'ok', dueSoon: true });
    expect(a.dueSoon).toBe(1);
  });
  it('finds nothing in everyday shopping, and handles no charges', () => {
    expect(auditSubs([], '2026-10-20').items).toEqual([]);
    expect(auditSubs(['2026-09-01', '2026-09-03', '2026-09-09', '2026-09-21'].map((d, i) => c(d, [64, 12, 88, 23][i], 'Grocer')), '2026-10-20').items).toEqual([]);
  });
  it('links to a search on the payee', () => {
    expect(decodeURIComponent(subChargesHref('Music "Plus"').split('search=')[1])).toBe('destination_account_is:"Music Plus"');
  });
});

describe('subscriptions card', () => {
  it('is a small Overview card that is offered under Add cards, not shown by default', async () => {
    const { DASH_NAMES } = await import('../app/src/features/dashboard');
    expect(DASH_NAMES.subs).toBe('Subscriptions');
  });
});

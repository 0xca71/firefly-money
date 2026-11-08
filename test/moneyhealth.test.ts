import { describe, expect, it } from 'vitest';
import { balancePoints, debtInsight, debtPanel, feesIn, feesPanel, interestPaid, lastTwelve, monthsText, runway, runwayPanel, type FeeSplit } from '../app/src/features/moneyhealth';
import { simulate, type LoanModel } from '../app/src/pages/loans';
import { createMockApi } from '../app/src/demo/mockapi';

const clean = (h: unknown) => { const s = String(h); expect(s).not.toMatch(/NaN|Infinity|undefined/); return s; };

describe('savings runway', () => {
  const accts = [
    { name: 'Checking', role: 'defaultAsset', balance: 3000 }, { name: 'Savings', role: 'savingAsset', balance: 6000 },
    { name: 'Emergency Fund', role: 'savingAsset', balance: 4000 }, { name: 'Brokerage', role: 'savingAsset', balance: 50000 },
  ];
  it('counts months of average spending covered, leaving investments out', () => {
    const r = runway(accts, [2000, 2000, 2000], 6)!;
    expect(r.cash).toBe(3000);
    expect(r.savings).toBe(10000);
    expect(r.months).toBeCloseTo(6.5, 5);
    expect(r.cashMonths).toBeCloseTo(1.5, 5);
    expect(r.tone).toBe('good');
  });
  it('measures the emergency fund against the goal, from the account named for it', () => {
    const r = runway(accts, [2000, 2000, 2000], 6)!;
    expect(r.fundName).toBe('Emergency Fund');
    expect(r.target).toBe(12000);
    expect(r.pct).toBeCloseTo(33.33, 1);
    expect(r.gap).toBe(8000);
    expect(runway(accts, [2000, 2000, 2000], 3)!.target).toBe(6000);
    const all = runway(accts.filter(a => a.name !== 'Emergency Fund'), [2000], 3)!;
    expect(all.fundName).toBe('Savings');
    expect(all.pct).toBe(100);
    expect(all.gap).toBe(0);
  });
  it('rates the cushion and ignores months before any spending', () => {
    expect(runway([{ name: 'A', role: 'defaultAsset', balance: 1000 }], [0, 1000, 1000], 6)!.months).toBe(1);
    expect(runway([{ name: 'A', role: 'defaultAsset', balance: 1000 }], [0, 1000, 1000], 6)!.tone).toBe('over');
    expect(runway([{ name: 'A', role: 'defaultAsset', balance: 4000 }], [1000], 6)!.tone).toBe('warn');
    expect(runway(accts, [0, 0, 0], 6)).toBeNull();
    expect(runway([], [500], 6)!.months).toBe(0);
  });
  it('words months', () => {
    expect(monthsText(0.4)).toBe('under a month');
    expect(monthsText(4.26)).toBe('4.3 months');
    expect(monthsText(14.4)).toBe('14 months');
    expect(monthsText(500)).toBe('10+ years');
  });
  it('draws with no broken numbers', () => {
    const s = clean(runwayPanel(runway(accts, [2000, 2000, 2000], 6)!));
    expect(s).toContain('Savings runway');
    expect(s).toContain('data-onchange="App.fundMonths(this.value)"');
    expect(s).toContain('goal');
    clean(runwayPanel(runway([], [500], 6)!));
  });
});

describe('debt payoff', () => {
  const loan = (over: Partial<LoanModel> = {}): LoanModel => ({ id: '1', name: 'Car', debt: 10000, rate: 0.005, interest: '6', period: 'yearly', planned: true, pay: 400, ...over });
  it('works out interest paid from what was repaid beyond the principal', () => {
    expect(interestPaid(10000, 4000, 6500, 0)).toBe(500);
    expect(interestPaid(10000, 4000, 6000, 0)).toBe(0);
    expect(interestPaid(10000, 400, 9900, 500)).toBe(400);           // interest written to the loan as charges is already in "borrowed"
    expect(interestPaid(0, 0, 0)).toBe(0);
  });
  it('compares the plan with paying as now, and a bit more each month', () => {
    const model = [loan({ id: '1', debt: 3000, pay: 200 }), loan({ id: '2', name: 'Phone', debt: 8000, pay: 300, rate: 0.01 })];
    const base = simulate(model, 0, 'now'), sim = simulate(model, 0, 'snowball'), plus = simulate(model, 100, 'snowball');
    const d = debtInsight(1234, base, sim, plus, 100);
    expect(d.paid).toBe(1234);
    expect(d.left).toBeCloseTo(sim.interest, 5);
    expect(d.saved!.interest).toBeGreaterThan(0);
    expect(d.saved!.months).toBeGreaterThan(0);
    expect(d.more!.interest).toBeGreaterThan(0);
    expect(d.more!.extra).toBe(100);
  });
  it('shows no saving when nothing changes or a loan has no payment', () => {
    const one = [loan()], same = simulate(one, 0, 'now');
    const d = debtInsight(0, same, same, simulate(one, 0, 'now'), 100);
    expect(d.saved).toBeNull();
    expect(d.more).toBeNull();
    const stuck = simulate([loan({ pay: 0 })], 0, 'now');
    expect(stuck.months).toBeNull();
    expect(debtInsight(0, stuck, stuck, stuck, 100).saved).toBeNull();
    const fixed = [loan({ fixed: true })];
    expect(debtInsight(0, simulate(fixed, 0, 'now'), simulate(fixed, 0, 'snowball'), simulate(fixed, 100, 'snowball'), 100).more).toBeNull();
  });
  it('samples the balance curve and ends on the last month', () => {
    const plan = Array.from({ length: 61 }, (_, i) => 6000 - i * 100), now = Array.from({ length: 41 }, (_, i) => Math.max(0, 6000 - i * 150));
    const pts = balancePoints(plan, now, 60, i => 'M' + i);
    expect(pts.length).toBeLessThanOrEqual(25);
    expect(pts[0]).toEqual({ label: 'M0', a: 6000, b: 6000 });
    expect(pts.at(-1)!.label).toBe('M60');
    expect(pts.at(-1)!.b).toBe(0);
  });
  it('draws with no broken numbers', () => {
    const model = [loan({ debt: 3000, pay: 200 }), loan({ id: '2', debt: 8000, pay: 300, rate: 0.01 })];
    const base = simulate(model, 0, 'now'), sim = simulate(model, 0, 'snowball'), plus = simulate(model, 100, 'snowball');
    const s = clean(debtPanel(debtInsight(900, base, sim, plus, 100), sim.totals, base.totals, i => 'M' + i, 'Mar 2030'));
    expect(s).toContain('Interest paid so far');
    expect(s).toContain('Your plan saves');
    expect(s).toContain('Another $100 a month');
    expect(s).toContain('viewBox');
    const stuck = simulate([loan({ pay: 0 })], 0, 'now');
    expect(clean(debtPanel(debtInsight(0, stuck, stuck, stuck, 100), stuck.totals, stuck.totals, i => 'M' + i, ''))).toContain('Not yet');
  });
});

describe('fees and interest', () => {
  const today = '2026-11-08';
  const tx = (date: string, description: string, amount: number, over: Partial<FeeSplit> = {}): FeeSplit => ({ type: 'withdrawal', date, amount, description, category: '', destination_id: '9', destination_name: 'Bank', ...over });
  it('lists the last twelve calendar months', () => {
    const m = lastTwelve(today);
    expect(m.length).toBe(12);
    expect(m[0]).toEqual({ key: '2025-12', label: 'Dec' });
    expect(m[11]).toEqual({ key: '2026-11', label: 'Nov' });
    expect(lastTwelve('2026-01-31')[0].key).toBe('2025-02');
  });
  it('finds fees and interest by wording, as whole words, in the year only', () => {
    const f = feesIn([
      tx('2026-10-05', 'ATM fee', 3), tx('2026-09-05', 'Card interest charge', 40), tx('2026-02-01', 'Annual fee', 95, { destination_name: 'Issuer', destination_id: '8' }),
      tx('2026-10-06', 'Coffee', 4), tx('2026-10-07', 'Fee refund', 5, { type: 'deposit' }), tx('2025-10-07', 'Old fee', 50), tx('2025-12-01', 'Overdraft', 20),
      tx('2026-10-08', 'Lunch', 12, { category: 'Fees' }),
    ], today);
    expect(f.count).toBe(5);
    expect(f.total).toBe(3 + 40 + 95 + 20 + 12);
    expect(f.interest).toBe(40);
    expect(f.fees).toBe(130);
    expect(f.avg).toBeCloseTo(170 / 12, 5);
    expect(f.months.find(m => m.key === '2026-10')!.v).toBe(15);
    expect(f.sources[0]).toMatchObject({ name: 'Issuer', v: 95, href: '#/account/8' });
    expect(f.sources.find(s => s.name === 'Bank')!.v).toBe(75);
    expect(f.biggest).toEqual({ what: 'Annual fee', amount: 95, date: '2026-02-01' });
  });
  it('draws with no broken numbers, and nothing when there are none', () => {
    const f = feesIn([tx('2026-10-05', 'ATM fee', 3), tx('2026-09-05', 'Card interest', 40)], today);
    const s = clean(feesPanel(f));
    expect(s).toContain('Fees and interest');
    expect(s).toContain('$43');
    expect(s).toContain('2 charges');
    expect(feesPanel(feesIn([tx('2026-10-06', 'Coffee', 4)], today))).toBe('');
  });
  it('finds fees, interest and a loan in the demo data', () => {
    const api = createMockApi(new Date(2026, 10, 8)), gs = (api('/transactions', { start: '2025-12-01', end: '2026-11-08', type: 'withdrawal', limit: '5000' }) as any).data;
    const f = feesIn(gs.flatMap((g: any) => g.attributes.transactions.map((x: any) => ({ type: x.type, date: x.date, amount: +x.amount, description: x.description, category: x.category_name || '', destination_id: x.destination_id, destination_name: x.destination_name }))), '2026-11-08');
    expect(f.interest).toBeGreaterThan(100);
    expect(f.fees).toBeGreaterThan(100);
    expect(f.sources.map(s => s.name)).toEqual(expect.arrayContaining(['Riverside Auto Finance', 'Rewards Card issuer']));
    expect(f.total).toBeLessThan(2500);
  });
});

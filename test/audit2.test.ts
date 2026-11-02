import { describe, expect, it } from 'vitest';
import { parseAmount } from '../app/src/core/base';
import { closestTarget, examples, parseQuestion, spendSubject } from '../app/src/pages/ask';
import { nextBillDate } from '../app/src/pages/bills';
import { simulate, rollsOnly } from '../app/src/pages/loans';
import { isCashOut, yearStats } from '../app/src/pages/year';

const L = { categories: [{ id: '1', name: 'Rent', notes: '' }, { id: '2', name: 'Food & Groceries', notes: '' }], budgets: [], tags: [], expense: [{ id: '9', name: 'Costco' }] } as never;
const T = '2026-11-02';

describe('Ask: a question about something Money cannot match', () => {
  it('finds the subject of a spending question', () => {
    expect(spendSubject('How much did I spend on groceries this year?')).toBe('groceries');
    expect(spendSubject('how much did i spend on my coffee in march')).toBe('coffee');
    expect(spendSubject('How much did I spend this month?')).toBe('');
    expect(spendSubject('how much did i spend on stuff')).toBe('');
  });
  it('does not turn it into the total spending', () => {
    const q = parseQuestion('How much did I spend on dentist this year?', L, T);
    expect(q.intent).toBe('unmatched');
    expect(q.unmatched).toBe('dentist');
    expect(parseQuestion('How much did I spend on groceries this year?', L, T).intent).toBe('unmatched');     // only “Food & Groceries” exists
  });
  it('still answers a plain spending question and a matched one', () => {
    expect(parseQuestion('how much did I spend this month', L, T).intent).toBe('spent');
    expect(parseQuestion('how much did I spend on rent this year', L, T).intent).toBe('spentOn');
  });
  it('offers the closest name', () => {
    expect(closestTarget('groceries', L)?.name).toBe('Food & Groceries');
    expect(closestTarget('rnt', L)?.name).toBe('Rent');
    expect(closestTarget('dentist', L)).toBeNull();
  });
  it('only suggests a spending example for a category that exists', () => {
    expect(examples({ categories: [] }).some(x => /spend on/.test(x))).toBe(false);
    expect(examples({ categories: [{ id: '1', name: 'Rent', notes: '' }] }).some(x => /spend on Rent/.test(x))).toBe(true);
  });
});

describe('Bills: the next date', () => {
  const at = (o: Record<string, unknown>) => ({ date: '2026-02-26T00:00:00-05:00', repeat_freq: 'yearly', skip: 0, pay_dates: [], ...o });
  it('works out a yearly bill from its schedule when Firefly sends no date', () => {
    expect(nextBillDate(at({}), '2026-11-02')).toBe('2027-02-26');
  });
  it('uses the dates Firefly gives first', () => {
    expect(nextBillDate(at({ pay_dates: ['2027-01-10T00:00:00-05:00'] }), '2026-11-02')).toBe('2027-01-10');
    expect(nextBillDate(at({ next_expected_match: '2027-01-12' }), '2026-11-02')).toBe('2027-01-12');
  });
  it('steps by the skip, and clamps a 31st to the month length', () => {
    expect(nextBillDate({ date: '2026-01-31', repeat_freq: 'monthly', skip: 1 }, '2026-02-01')).toBe('2026-03-31');
    expect(nextBillDate({ date: '2026-01-31', repeat_freq: 'monthly', skip: 0 }, '2026-02-01')).toBe('2026-02-28');
    expect(nextBillDate({ date: '2026-10-05', repeat_freq: 'weekly', skip: 1 }, '2026-11-02')).toBe('2026-11-02');
  });
  it('returns nothing once a bill has ended', () => {
    expect(nextBillDate(at({ end_date: '2026-12-31' }), '2026-11-02')).toBeNull();
  });
});

describe('Loan planner: fixed instalments and rollover', () => {
  const loan = (id: string, debt: number, pay: number, o = {}) => ({ id, name: id, debt, rate: 0, interest: '', period: '', planned: true, pay, ...o });
  it('does not put extra or rolled-over money on a fixed loan', () => {
    const r = simulate([loan('phone', 1200, 100, { fixed: true }), loan('card', 500, 100)], 0, 'snowball');
    expect(r.loans.find(l => l.id === 'phone')!.paidOff).toBe(12);     // runs its 12 instalments, not sooner
    expect(r.loans.find(l => l.id === 'card')!.paidOff).toBe(5);
  });
  it('still rolls onto a loan that can take it, and says it only gets paid that way', () => {
    const r = simulate([loan('a', 300, 100), loan('b', 1000, 0)], 0, 'snowball'), b = r.loans.find(l => l.id === 'b')!;
    expect(b.paidOff).not.toBeNull();
    expect(rollsOnly(b)).toBe(true);
    expect(rollsOnly(r.loans.find(l => l.id === 'a')!)).toBe(false);
  });
});

describe('Year in Money: cash withdrawals', () => {
  it('spots cash taken out', () => {
    expect(isCashOut({ destination_type: 'Cash account', destination_name: '(cash)' })).toBe(true);
    expect(isCashOut({ destination_type: 'Expense account', destination_name: 'Cash' })).toBe(true);
    expect(isCashOut({ destination_type: 'Expense account', destination_name: 'Cashew Cafe' })).toBe(false);
  });
  it('leaves cash out of places, the biggest purchase and the days with a purchase', () => {
    const buys = [{ date: '2026-01-02', amount: 20, payee: 'Cafe', description: 'Coffee' }];
    const st = yearStats(buys, '2026-01-01', '2026-01-03');
    expect(st.biggest!.payee).toBe('Cafe');
    expect(st.free).toBe(2);
  });
});

describe('parseAmount', () => {
  it('rejects a number with the wrong grouping', () => {
    expect(parseAmount('1.5.2')).toBeNull();
    expect(parseAmount('1,234.50')).toBe(1234.5);
  });
});

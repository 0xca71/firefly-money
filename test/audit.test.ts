import { describe, expect, it } from 'vitest';
import { parseAmount } from '../app/src/core/base';
import { normAccount } from '../app/src/core/lists';
import { billDays, billDueDates, billEnds } from '../app/src/pages/bills';
import { limitTotal } from '../app/src/pages/budgets';
import { cardDue } from '../app/src/features/insights';
import { samePoint } from '../app/src/pages/overview';

const bill = (name: string, pay: string[], paid: string[] = [], more: Record<string, unknown> = {}) => ({
  id: name, attributes: { name, amount_min: '100', amount_max: '100', pay_dates: pay.map(d => d + 'T00:00:00-04:00'), paid_dates: paid.map(d => ({ transaction_group_id: 'g' + d, date: d + 'T00:00:00-04:00' })), ...more } });
const NOV = { start: '2026-11-01', end: '2026-11-30' };

describe('loan direction', () => {
  it('reads liability_direction into the account', () => {
    expect(normAccount({ id: '1', attributes: { name: 'Car', type: 'liability', liability_direction: 'debit' } }).direction).toBe('debit');
    expect(normAccount({ id: '2', attributes: { name: 'Old', type: 'liability' } }).direction).toBe('');
  });
});

describe('bill calendar and Recap totals', () => {
  it('keeps unpaid dates in the month, and does not slice by the number of paid dates', () => {
    const { days, sum } = billDays([bill('Rent', ['2026-11-30'], ['2026-11-01'])], '2026-11-02', NOV);
    expect(Object.keys(days).sort()).toEqual(['2026-11-01', '2026-11-30']);
    expect(sum).toEqual({ paid: 100, due: 100, late: 0 });
  });
  it('leaves out dates Firefly lists past the month', () => {
    const { sum } = billDays([bill('Tuition', ['2027-01-10']), bill('Insurance', ['2027-02-26'])], '2026-11-02', NOV);
    expect(sum).toEqual({ paid: 0, due: 0, late: 0 });
    expect(billDueDates(bill('x', ['2026-10-30', '2026-11-05', '2027-01-10']).attributes, NOV)).toEqual(['2026-11-05']);
  });
  it('marks an unpaid date before today as overdue', () => {
    expect(billDays([bill('Rent', ['2026-11-01'])], '2026-11-02', NOV).sum).toEqual({ paid: 0, due: 0, late: 100 });
  });
  it('works for a month that starts mid-month', () => {
    const { days } = billDays([bill('Rent', ['2026-10-30', '2026-11-14', '2026-11-15'])], '2026-11-02', { start: '2026-10-15', end: '2026-11-14' });
    expect(Object.keys(days).sort()).toEqual(['2026-10-30', '2026-11-14']);
  });
});

describe('bills that end', () => {
  it('describes the end and renew-by dates', () => {
    expect(billEnds({ end_date: '2099-03-01', extension_date: '2099-02-01' })).toContain('Ends');
    expect(billEnds({ end_date: '2099-03-01', extension_date: '2099-02-01' })).toContain('Renew or cancel by');
    expect(billEnds({ end_date: '2020-03-01' })).toContain('Ended');
    expect(billEnds({})).toBe('');
  });
});

describe('budget limits', () => {
  const week = (id: string, start: string, end: string, amount = 70) => ({ id, amount, start, end });
  it('adds up several weekly limits instead of keeping the last one', () => {
    const parts = [week('1', '2026-11-01', '2026-11-07'), week('2', '2026-11-08', '2026-11-14'), week('3', '2026-11-15', '2026-11-21'), week('4', '2026-11-22', '2026-11-28'), week('5', '2026-11-29', '2026-12-05')];
    expect(limitTotal(parts, NOV)).toBe(70 * 4 + 20);      // the last week counts for its 2 days in November
  });
  it('counts one limit for the whole month in full', () => {
    expect(limitTotal([week('1', '2026-11-01', '2026-11-30', 500)], NOV)).toBe(500);
  });
});

describe('Overview comparisons', () => {
  it('compares this month so far with last month up to the same day', () => {
    expect(samePoint({ start: '2026-11-01' }, { start: '2026-10-01', end: '2026-10-31' }, '2026-11-01')).toEqual({ start: '2026-10-01', end: '2026-10-01' });
    expect(samePoint({ start: '2026-03-01' }, { start: '2026-02-01', end: '2026-02-28' }, '2026-03-31')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('small errors', () => {
  it('rejects an amount with two decimal marks', () => {
    expect(parseAmount('1.5.2')).toBeNull();
    expect(parseAmount('1,5,2')).toBeNull();
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1.234.567')).toBe(1234567);
    expect(parseAmount('4,5')).toBe(4.5);
  });
  it('clamps a card due on the 31st to the next month’s length', () => {
    expect(cardDue(new Date(2026, 0, 31, 15), 31).getMonth()).toBe(0);
    const d = cardDue(new Date(2026, 0, 31, 15), 30);      // due the 30th, passed: February has 28 days
    expect([d.getMonth(), d.getDate()]).toEqual([1, 28]);
    const e = cardDue(new Date(2026, 3, 30, 15), 31);      // April 30 -> due Apr 30 (clamped this month)
    expect([e.getMonth(), e.getDate()]).toEqual([3, 30]);
  });
});

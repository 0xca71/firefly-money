import { describe, expect, it } from 'vitest';
import { DEMO_DASH } from '../app/src/demo/layout';

describe('demo Overview layout', () => {
  const width = { s: 1, m: 2, l: 6 } as Record<string, number>;
  it('lists each card once, in the screenshot order', () => {
    expect(DEMO_DASH.order).toEqual(['activity', 'insights', 'networth', 'earned', 'spent', 'attention', 'safe', 'bills', 'cash', 'cards', 'heatmap', 'budgets', 'loans', 'payees',
      'flow', 'spending', 'income', 'goals', 'pace', 'savings', 'cashflow', 'recent']);
    expect(new Set(DEMO_DASH.order).size).toBe(DEMO_DASH.order.length);
  });
  it('fills every six-unit row exactly', () => {
    const rows: number[] = []; let used = 0;
    for (const k of DEMO_DASH.order) {
      const w = width[(DEMO_DASH.size as Record<string, string>)[k]];
      if (used + w > 6) { rows.push(used); used = 0; }
      used += w;
    }
    rows.push(used);
    expect(rows).toEqual([6, 6, 6, 6, 6, 6, 6, 6, 6]);
  });
  it('groups the rows as in the screenshot', () => {
    const groups: string[][] = []; let row: string[] = [], used = 0;
    for (const k of DEMO_DASH.order) {
      const w = width[(DEMO_DASH.size as Record<string, string>)[k]];
      if (used + w > 6) { groups.push(row); row = []; used = 0; }
      row.push(k); used += w;
    }
    groups.push(row);
    expect(groups.map(g => g.join(' '))).toEqual(['activity', 'insights', 'networth earned spent attention safe', 'bills cash cards', 'heatmap budgets loans payees',
      'flow spending income', 'goals pace savings', 'cashflow', 'recent']);
  });
  it('shows the non-default cards and hides none', () => {
    expect(DEMO_DASH.shown).toEqual(expect.arrayContaining(['cash', 'cards', 'heatmap', 'loans', 'payees', 'flow', 'income', 'goals', 'pace', 'savings', 'recent']));
    expect(DEMO_DASH.hidden).toEqual([]);
    expect(DEMO_DASH.opts.activity.range).toBe('all');
  });
});

import { describe, expect, it } from 'vitest';
import { normGroup } from '../app/src/core/feed';
import { spotsOf } from '../app/src/pages/map';

const tx = (id: string, payee: string, amount: number, lat?: number, lng?: number, type = 'withdrawal') => normGroup({
  id, attributes: { transactions: [{ transaction_journal_id: id, type, date: '2026-10-10T12:00:00Z', amount: String(amount), description: payee, destination_name: payee, destination_type: 'Expense account', source_name: 'Card', latitude: lat ?? null, longitude: lng ?? null }] },
});

describe('map', () => {
  it('groups purchases by payee and place, biggest first', () => {
    const spots = spotsOf([
      tx('1', 'Blue Bottle', 5, 40.7411, -73.9897), tx('2', 'Blue Bottle', 6, 40.74112, -73.98968),
      tx('3', 'Blue Bottle', 4, 40.7527, -73.9772), tx('4', 'Grocer', 80, 40.73, -73.99),
      tx('5', 'Online', 20), tx('6', 'Refund', 9, 40.7, -73.9, 'deposit'),
    ]);
    expect(spots.map(s => [s.name, s.groups.length, s.total])).toEqual([['Grocer', 1, 80], ['Blue Bottle', 2, 11], ['Blue Bottle', 1, 4]]);
  });
});

describe('places tab', () => {
  it('is the third To do tab and routes under To do', async () => {
    const { readFileSync } = await import('node:fs');
    const dom = readFileSync('app/src/core/dom.ts', 'utf8'), router = readFileSync('app/src/core/router.ts', 'utf8'), main = readFileSync('app/src/main.ts', 'utf8');
    expect(dom).toMatch(/href="#\/places"/);
    expect(router).toMatch(/r\.name === 'places' \? 'review'/);
    expect(main).toContain("./pages/places");
  });
});

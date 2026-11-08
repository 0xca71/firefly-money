import { describe, expect, it } from 'vitest';
import { normGroup } from '../app/src/core/feed';
import { todoTabs } from '../app/src/core/dom';
import { learn } from '../app/src/features/stores';
import { spotsOf, suggestStores } from '../app/src/pages/map';

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

describe('places tab (store suggestions under To do)', () => {
  const walmart = (id: string) => tx(id, 'WAL-MART #3826', 30);
  const box = () => { document.body.innerHTML = '<section id="storeList" hidden></section>'; return document.getElementById('storeList')!; };
  it('lists a purchase naming a store with its learned place, even before it is on the Map', async () => {
    localStorage.clear(); learn('walmart:3826', { lat: 36.3, lng: -94.1, addr: '2110 W Walnut St', src: 'learned' });
    const b = box(); await suggestStores([walmart('1'), walmart('2')], true);
    expect(b.hidden).toBe(false);
    expect(b.textContent).toContain('2 purchases name a store');
    expect(b.textContent).toContain('3826');
    expect(b.textContent).toContain('2110 W Walnut St');
    expect(b.textContent).not.toContain('Stores found');
    expect(b.querySelectorAll('[data-onclick^="App.pinStore("]').length).toBe(1);
  });
  it('says there is nothing to pin when every purchase has a place, but the Map panel just hides', async () => {
    localStorage.clear();
    const placed = [tx('3', 'WAL-MART #3826', 30, 36.3, -94.1)];
    let b = box(); await suggestStores(placed, true);
    expect(b.hidden).toBe(false); expect(b.textContent).toContain('No places to pin');
    b = box(); await suggestStores(placed, false);
    expect(b.hidden).toBe(true);
  });
  it('is the third To do tab and highlights To do', () => {
    expect(String(todoTabs('places'))).toMatch(/<a href="#\/places" class="on">Places<\/a>/);
    expect(String(todoTabs('review'))).toMatch(/href="#\/places" class="">/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { normGroup } from '../app/src/core/feed';
import { todoTabs } from '../app/src/core/dom';
import { learn } from '../app/src/features/stores';
import { App } from '../app/src/core/base';
import { spotsOf, suggestStores } from '../app/src/pages/map';

vi.mock('../app/src/core/router', async orig => ({ ...(await orig<typeof import('../app/src/core/router')>()), route: vi.fn(async () => {}) }));

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

describe('places tab: pin several stores in one go', () => {
  afterEach(() => vi.unstubAllGlobals());
  const wm = (id: string, n: string) => tx(id, 'WAL-MART #' + n, 30);
  const setup = async () => {
    localStorage.clear();
    learn('walmart:1111', { lat: 1, lng: 1, addr: 'One St', src: 'learned' });
    learn('walmart:2222', { lat: 2, lng: 2, addr: 'Two St', src: 'learned' });
    learn('walmart:3333', { lat: 3, lng: 3, addr: 'Three St', src: 'learned' });
    document.body.innerHTML = '<section id="storeList" hidden></section>';
    await suggestStores([wm('a', '1111'), wm('b', '2222'), wm('c', '3333')], true);
    return document.getElementById('storeList')!;
  };
  const stubPut = (failId?: string) => {
    const puts: { id: string, lat: unknown, lng: unknown, zoom: unknown }[] = [];
    vi.stubGlobal('location', { origin: 'http://x', href: 'http://x/', hash: '' });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', async (u: string, init: RequestInit) => {
      const id = String(u).split('/').pop()!, t = JSON.parse(String(init.body)).transactions[0];
      puts.push({ id, lat: t.latitude, lng: t.longitude, zoom: t.zoom_level });
      return id === failId ? new Response('{"message":"nope"}', { status: 422 }) : new Response('{"data":{}}', { status: 200 });
    });
    return puts;
  };
  it('selects nothing by default, and "Select all" ticks every store', async () => {
    const b = await setup();
    expect(b.querySelectorAll('input[type=checkbox]:checked').length).toBe(0);
    expect(b.textContent).toContain('Select all');
    App.pinAll(true);
    expect(b.querySelectorAll('input[type=checkbox]:checked').length).toBe(4);   // 3 stores + the select-all box
    expect(b.textContent).toContain('3 selected');
    expect(b.textContent).toContain('Pin 3 stores · 3 purchases');
    App.pinAll(false);
    expect(b.textContent).toContain('Select all');
  });
  it('writes nothing until the button is tapped, then pins every selected store and offers Undo', async () => {
    const b = await setup(), puts = stubPut();
    App.pinTick(0, true); App.pinTick(2, true);
    expect(puts.length).toBe(0);
    await App.pinSelected();
    expect(puts.map(p => p.id).sort()).toEqual(['a', 'c']);
    expect(puts.find(p => p.id === 'a')).toMatchObject({ lat: 1, lng: 1, zoom: 16 });
    expect(puts.find(p => p.id === 'c')).toMatchObject({ lat: 3, lng: 3, zoom: 16 });
    expect(b.textContent).toContain('Pinned 2 stores');
    puts.length = 0;
    await App.pinUndo();
    expect(puts.map(p => [p.id, p.lat, p.lng, p.zoom]).sort()).toEqual([['a', null, null, null], ['c', null, null, null]]);
  });
  it('reports a store Firefly refused, keeps it selected, and still pins the rest', async () => {
    const b = await setup(), puts = stubPut('b');
    App.pinAll(true);
    await App.pinSelected();
    expect(puts.length).toBe(3);
    expect(b.textContent).toContain('Firefly didn’t accept 1');
    expect(b.textContent).toContain('Walmart #2222');
    expect(b.textContent).toContain('1 selected');
    expect(b.textContent).toContain('Pinned 2 stores');
  });
});

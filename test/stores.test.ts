import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { normGroup } from '../app/src/core/feed';
import { CHAINS, candidates, learn, learned, parseDataset, parseDescriptor, parseOsm, rankPlaces, wantedStores, away, type Want } from '../app/src/features/stores';

const tx = (id: string, desc: string, payee = desc, lat?: number, lng?: number) => normGroup({
  id, attributes: { transactions: [{ transaction_journal_id: id, type: 'withdrawal', date: '2026-10-10T12:00:00Z', amount: '20', description: desc, destination_name: payee, destination_type: 'Expense account', source_name: 'Card', latitude: lat ?? null, longitude: lng ?? null }] },
});

describe('store descriptor parser', () => {
  it.each([
    ['WAL-MART #3826', 'walmart', '3826'], ['WALMART SUPERCENTER #0412 AUSTIN TX', 'walmart', '412'], ['WM SUPERCENTER #5260', 'walmart', '5260'],
    ['TARGET T-1234 SEATTLE', 'target', '1234'], ['TARGET 00001234', 'target', '1234'], ['COSTCO WHSE #0123', 'costco', '123'],
    ['THE HOME DEPOT #6804', 'homedepot', '6804'], ["LOWE'S #01234", 'lowes', '1234'], ['STARBUCKS STORE 12345', 'starbucks', '12345'],
    ["MCDONALD'S F12345", 'mcdonalds', '12345'], ['WHOLEFDS ABC #10005', 'wholefoods', '10005'], ['CVS/PHARMACY #01234', 'cvs', '1234'],
    ['SAFEWAY #0892', 'safeway', '892'], ['PUBLIX #1234', 'publix', '1234'], ['ALDI 72014', 'aldi', '72014'], ['7-ELEVEN 34567', '7eleven', '34567'],
  ])('%s', (raw, chain, num) => expect(parseDescriptor(raw)).toMatchObject({ chain, num, key: chain + ':' + num }));
  it('needs a store number', () => {
    expect(parseDescriptor('WALMART.COM')).toBeNull();
    expect(parseDescriptor('Blue Bottle Coffee')).toBeNull();
    expect(parseDescriptor('')).toBeNull();
  });
  it('has unique chain ids and OSM patterns the server accepts', () => {
    expect(new Set(CHAINS.map(c => c.id)).size).toBe(CHAINS.length);
    for (const c of CHAINS) expect(c.osm).toMatch(/^[a-z0-9.]{2,30}$/);
  });
});

describe('store lists', () => {
  const atp = { type: 'FeatureCollection', features: [
    { properties: { ref: '3826', 'addr:housenumber': '1', 'addr:street': 'Main St', 'addr:city': 'Austin', 'addr:state': 'TX' }, geometry: { type: 'Point', coordinates: [-97.7, 30.3] } },
    { properties: { ref: 'nope' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    { properties: { ref: '0412' }, geometry: { type: 'Point', coordinates: [-122.3, 47.6] } },
  ] };
  it('reads AllThePlaces GeoJSON, the compact file and plain arrays', () => {
    const a = parseDataset(atp);
    expect(a.get('3826')![0]).toMatchObject({ lat: 30.3, lng: -97.7, addr: '1 Main St, Austin, TX' });
    expect(a.has('412')).toBe(true);
    expect([...a.keys()].sort()).toEqual(['3826', '412']);
    expect(parseDataset({ v: 1, s: [['3826', 30.3, -97.7, '1 Main St']] }).get('3826')![0].addr).toBe('1 Main St');
    expect(parseDataset([{ ref: '9', lat: 1, lon: 2, address: 'x' }]).get('9')![0]).toMatchObject({ lat: 1, lng: 2 });
    expect(parseDataset('<html>').size).toBe(0);
  });
  it('keeps every store that shares a number and ranks the nearest to your other pins first', () => {
    const d = parseDataset({ s: [['1', 40.7, -74, 'NY'], ['1', 34, -118, 'LA']] }).get('1')!;
    expect(d).toHaveLength(2);
    const r = rankPlaces(d, [{ lat: 34.05, lng: -118.2 }]);
    expect(r[0].addr).toBe('LA');
    expect(away(r[0])!).toBeLessThan(away(r[1])!);
    expect(rankPlaces(d, []).map(p => p.addr)).toEqual(['NY', 'LA']);
  });
  it('reads OpenStreetMap answers, only for this store number', () => {
    const els = { elements: [
      { type: 'node', lat: 30.3, lon: -97.7, tags: { ref: '3826', 'addr:housenumber': '1', 'addr:street': 'Main St', 'addr:city': 'Austin' } },
      { type: 'way', center: { lat: 1, lon: 2 }, tags: { ref: '99' } }, { type: 'node', lat: 5, lon: 6, tags: {} },
    ] };
    expect(parseOsm(els, '3826')).toEqual([{ lat: 30.3, lng: -97.7, addr: '1 Main St, Austin', src: 'osm' }]);
    expect(parseOsm({}, '1')).toEqual([]);
  });
});

describe('finding a store', () => {
  beforeEach(() => localStorage.clear());
  const w: Want = { key: 'walmart:3826', label: 'Walmart', num: '3826', chain: 'walmart', osm: 'walmart', groups: [], total: 0 };
  const list = async () => parseDataset({ s: [['3826', 30.3, -97.7, 'Dataset']] });
  const osm = async () => [{ lat: 1, lng: 2, addr: 'OSM', src: 'osm' as const }];
  it('uses a store you confirmed before, over the lists', async () => {
    learn(w.key, { lat: 9, lng: 8, addr: 'Mine', src: 'dataset' });
    expect(await candidates(w, [], { list, osm, online: true })).toMatchObject([{ lat: 9, lng: 8, src: 'learned' }]);
    expect((await candidates(w, [], { list, osm, online: true, skipLearned: true }))[0].addr).toBe('Dataset');
  });
  it('asks OpenStreetMap only when switched on and nothing else matches', async () => {
    let asked = 0;
    const spy = async () => { asked++; return osm(); };
    expect(await candidates(w, [], { list: async () => null, osm: spy, online: false })).toEqual([]);
    expect(asked).toBe(0);
    expect((await candidates(w, [], { list: async () => null, osm: spy, online: true }))[0].src).toBe('osm');
    await candidates(w, [], { list, osm: spy, online: true });
    expect(asked).toBe(1);
  });
  it('remembers confirmed stores and keeps only the newest 400', () => {
    for (let i = 0; i < 405; i++) learn('walmart:' + i, { lat: 1, lng: 2, addr: '', src: 'dataset' });
    expect(Object.keys(learned())).toHaveLength(400);
    expect(learned()['walmart:404']).toBeTruthy();
    expect(learned()['walmart:0']).toBeUndefined();
  });
});

describe('purchases that name a store', () => {
  it('groups unplaced purchases by chain and store, skipping placed ones', () => {
    const ws = wantedStores([tx('1', 'WAL-MART #3826'), tx('2', 'WALMART SUPERCENTER #3826'), tx('3', 'WAL-MART #3826', 'Walmart', 30, -97), tx('4', 'Blue Bottle'), tx('5', 'TARGET T-1234'), tx('6', 'Gas', 'Costco', undefined, undefined)]);
    expect(ws.map(x => [x.key, x.groups.length])).toEqual([['walmart:3826', 2], ['target:1234', 1]]);
  });
});

describe('store data files and server', () => {
  const dir = 'app/assets/stores';
  it('are compact, numbered and within the size limit', () => {
    let total = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const text = readFileSync(dir + '/' + f, 'utf8');
      total += text.length;
      expect(text.length, f).toBeLessThan(2_500_000);
      const d = JSON.parse(text);
      expect(d.chain + '.json').toBe(f);
      expect(CHAINS.some(c => c.id === d.chain), f).toBe(true);
      expect(d.s.length).toBe(d.n);
      expect(parseDataset(d).size, f).toBeGreaterThan(50);
    }
    expect(total).toBeLessThan(8_000_000);
  });
  it('Walmart #3826 is Lubbock, TX', () => {
    const w = parseDataset(JSON.parse(readFileSync(dir + '/walmart.json', 'utf8'))).get('3826')!;
    expect(w).toHaveLength(1);
    expect(w[0].addr).toContain('Lubbock');
    expect(Math.abs(w[0].lat - 33.59)).toBeLessThan(0.1);
  });
  it('the OSM proxy is rate-limited, read-only and only takes a chain pattern and a number', () => {
    const conf = readFileSync('app/default.conf.template', 'utf8'), at = conf.indexOf('location ~ "^/osm/');
    const block = conf.slice(at, conf.indexOf('\n    }', at));
    expect(block).toContain('limit_req zone=api');
    expect(block).toContain('limit_except GET { deny all; }');
    expect(block).toContain('[a-z0-9.]{2,30}');
    expect(block).toContain('[0-9]{1,6}');
  });
});

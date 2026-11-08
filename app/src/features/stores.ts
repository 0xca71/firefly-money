import { type Group, payeeOf } from '../core/feed';
import { LS } from '../core/helpers';

/* ================= Stores: which real store a purchase was made at =================
   A card statement says "WAL-MART #3826". Chain + store number is enough to find the place, in this order:
   1. stores you confirmed before (kept in a synced setting, so every device knows them),
   2. the bundled store lists, app/assets/stores/<chain>.json (AllThePlaces-style: store number, address, position),
   3. only if you turn it on, OpenStreetMap, asked through this server (/osm/ in default.conf.template).
   Only the chain and the store number ever leave this server; nothing is saved to a purchase until you tap. */

export type Chain = { id: string, label: string, re: RegExp, num?: RegExp, osm: string };
// Matches the chain in the payee or description; num (optional) picks the number out of what follows when it isn't "#123"
export const CHAINS: Chain[] = [
  { id: 'walmart', label: 'Walmart', re: /\b(wal[\s-]?mart|wm\s+supercenter|walmart)\b/i, osm: 'walmart' },
  { id: 'sams', label: 'Sam’s Club', re: /\bsam['’]?s\s*(club|cl)\b/i, osm: 'sam.s.club' },
  { id: 'target', label: 'Target', re: /\btarget\b(?!\s*(?:corp|\.com))/i, num: /\bt[\s-]?0*(\d{3,5})\b/i, osm: 'target' },
  { id: 'costco', label: 'Costco', re: /\bcostco\s*(whse|wholesale)?\b/i, osm: 'costco' },
  { id: 'kroger', label: 'Kroger', re: /\bkroger\b/i, osm: 'kroger' },
  { id: 'safeway', label: 'Safeway', re: /\bsafeway\b/i, osm: 'safeway' },
  { id: 'publix', label: 'Publix', re: /\bpublix\b/i, osm: 'publix' },
  { id: 'aldi', label: 'Aldi', re: /\baldi\b/i, osm: 'aldi' },
  { id: 'wholefoods', label: 'Whole Foods', re: /\b(whole\s*foods|wholefds)\b/i, osm: 'whole.foods' },
  { id: 'traderjoes', label: 'Trader Joe’s', re: /\btrader\s*joe/i, osm: 'trader.joe' },
  { id: 'heb', label: 'H-E-B', re: /\bh-?e-?b\b/i, osm: 'h.e.b' },
  { id: 'meijer', label: 'Meijer', re: /\bmeijer\b/i, osm: 'meijer' },
  { id: 'foodlion', label: 'Food Lion', re: /\bfood\s*lion\b/i, osm: 'food.lion' },
  { id: 'cvs', label: 'CVS', re: /\bcvs\b/i, osm: 'cvs' },
  { id: 'walgreens', label: 'Walgreens', re: /\bwalgreens?\b/i, osm: 'walgreens' },
  { id: 'riteaid', label: 'Rite Aid', re: /\brite\s*aid\b/i, osm: 'rite.aid' },
  { id: 'homedepot', label: 'The Home Depot', re: /\bhome\s*depot\b/i, osm: 'home.depot' },
  { id: 'lowes', label: 'Lowe’s', re: /\blowe['’]?s\b/i, osm: 'lowe' },
  { id: 'bestbuy', label: 'Best Buy', re: /\bbest\s*buy\b/i, osm: 'best.buy' },
  { id: 'dollargeneral', label: 'Dollar General', re: /\bdollar\s*general\b|\bdg\s+store\b/i, osm: 'dollar.general' },
  { id: 'dollartree', label: 'Dollar Tree', re: /\bdollar\s*tree\b/i, osm: 'dollar.tree' },
  { id: 'familydollar', label: 'Family Dollar', re: /\bfamily\s*dollar\b/i, osm: 'family.dollar' },
  { id: 'starbucks', label: 'Starbucks', re: /\bstarbucks\b/i, osm: 'starbucks' },
  { id: 'mcdonalds', label: 'McDonald’s', re: /\bmc\s*donald/i, num: /\bf0*(\d{3,6})\b/i, osm: 'mcdonald' },
  { id: 'dunkin', label: 'Dunkin’', re: /\bdunkin/i, osm: 'dunkin' },
  { id: 'chickfila', label: 'Chick-fil-A', re: /\bchick[\s-]?fil[\s-]?a\b/i, osm: 'chick.fil.a' },
  { id: 'chipotle', label: 'Chipotle', re: /\bchipotle\b/i, osm: 'chipotle' },
  { id: 'panera', label: 'Panera Bread', re: /\bpanera\b/i, osm: 'panera' },
  { id: 'wawa', label: 'Wawa', re: /\bwawa\b/i, osm: 'wawa' },
  { id: 'sheetz', label: 'Sheetz', re: /\bsheetz\b/i, osm: 'sheetz' },
  { id: '7eleven', label: '7-Eleven', re: /\b7[\s-]?eleven\b|\b7-11\b/i, osm: '7.eleven' },
];

export type Parsed = { chain: string, label: string, num: string, key: string, osm: string };
const stripZeros = (n: string) => n.replace(/^0+(?=\d)/, '');
// "WAL-MART #3826" → walmart, 3826. Needs a store number: without one there is no single store to find.
export function parseDescriptor(raw: string): Parsed | null {
  const s = String(raw || '');
  for (const c of CHAINS) {
    const m = c.re.exec(s);
    if (!m) continue;
    const rest = s.slice(m.index + m[0].length), whole = s;
    const n = /(?:#|\bstore\s*(?:no\.?|number)?|\bstr\b|\bno\.?)\s*0*(\d{2,6})\b/i.exec(rest)
      || (c.num && (c.num.exec(rest) || c.num.exec(whole)))
      || /(?:^|[\s-])0*(\d{3,6})\b(?!\s*(?:am|pm|\/))/i.exec(rest);
    if (!n) return null;
    const num = stripZeros(n[1]);
    return { chain: c.id, label: c.label, num, key: c.id + ':' + num, osm: c.osm };
  }
  return null;
}

/* ---------- Places ---------- */
export type Place = { lat: number, lng: number, addr: string, src: 'learned' | 'dataset' | 'osm', note?: string };
const ok = (lat: unknown, lng: unknown) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat as number) <= 90 && Math.abs(lng as number) <= 180 && !(lat === 0 && lng === 0);
const clean = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim();

// A store list in any of three shapes: the compact file dev/update_stores.py writes ({ s: [[ref, lat, lng, address], …] }),
// AllThePlaces GeoJSON (features with properties.ref and a [lng, lat] point), or a plain array of
// { ref | n | number | store, lat, lng | lon, addr | address }. Returns store number → places (a number can repeat across countries).
export function parseDataset(json: unknown): Map<string, Place[]> {
  const out = new Map<string, Place[]>();
  const j = json as any;
  const items: any[] = Array.isArray(j) ? j : Array.isArray(j?.s) ? j.s.map((r: any[]) => ({ ref: r[0], lat: r[1], lng: r[2], addr: r[3] })) : Array.isArray(j?.features) ? j.features : [];
  for (const it of items) {
    const p = it?.properties || it || {}, c = it?.geometry?.coordinates;
    const ref = clean(p.ref ?? p.n ?? p.number ?? p.store ?? p.branch ?? p.store_number);
    const lat = Number(c ? c[1] : p.lat ?? p.latitude), lng = Number(c ? c[0] : p.lng ?? p.lon ?? p.longitude);
    const digits = /(\d{1,6})\s*$/.exec(ref);
    if (!digits || !ok(lat, lng)) continue;
    const addr = clean(p['addr:full'] || p.addr || p.address || [p.street_address || p['addr:street_address'] || [p['addr:housenumber'], p['addr:street']].filter(Boolean).join(' '), p.city || p['addr:city'], p.state || p['addr:state'], p.postcode || p['addr:postcode']].filter(Boolean).join(', '));
    const k = stripZeros(digits[1]);
    out.set(k, [...(out.get(k) || []), { lat, lng, addr, src: 'dataset' }]);
  }
  return out;
}

// An OpenStreetMap (Overpass) answer: the elements whose ref is this store number, with their address
export function parseOsm(json: unknown, num: string): Place[] {
  const els: any[] = (json as any)?.elements || [], out: Place[] = [];
  for (const e of els) {
    const t = e?.tags || {}, lat = Number(e.lat ?? e.center?.lat), lng = Number(e.lon ?? e.center?.lon);
    if (!ok(lat, lng) || stripZeros(clean(t.ref).replace(/\D+/g, '')) !== num) continue;
    const addr = clean([[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:city'], t['addr:state'], t['addr:postcode']].filter(Boolean).join(', '));
    out.push({ lat, lng, addr, src: 'osm' });
  }
  return out;
}

export const dist = (a: { lat: number, lng: number }, b: { lat: number, lng: number }) => {     // km, haversine
  const r = (d: number) => d * Math.PI / 180, dl = r(b.lat - a.lat), dg = r(b.lng - a.lng);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dg / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
// Nearest first to the places you already pinned (a Walmart #3826 near where you shop beats one across the country)
export function rankPlaces(cands: Place[], anchors: { lat: number, lng: number }[]): Place[] {
  if (!anchors.length) return cands.slice();
  const near = (c: Place) => Math.min(...anchors.map(a => dist(a, c)));
  return cands.map(c => ({ ...c, note: undefined, d: near(c) })).sort((x, y) => x.d - y.d).map(({ d, ...c }) => ({ ...c, away: d }) as Place & { away: number });
}
export const away = (p: Place) => (p as Place & { away?: number }).away;

/* ---------- Purchases without a place that name a store ---------- */
export type Want = { key: string, label: string, num: string, chain: string, osm: string, groups: Group[], total: number };
export function wantedStores(groups: Group[]): Want[] {
  const by = new Map<string, Want>();
  for (const g of groups) {
    if (g.type !== 'withdrawal' || g.splits.some(s => s.lat != null && s.lng != null)) continue;
    const p = parseDescriptor(g.splits[0]?.description) || parseDescriptor(String(payeeOf(g).name));
    if (!p) continue;
    const w = by.get(p.key) || { key: p.key, label: p.label, num: p.num, chain: p.chain, osm: p.osm, groups: [], total: 0 };
    w.groups.push(g); w.total += g.total; by.set(p.key, w);
  }
  return [...by.values()].sort((a, b) => b.groups.length - a.groups.length || b.total - a.total);
}

/* ---------- Learned stores (a synced setting: see SYNCED in sync.ts) ---------- */
type Learned = Record<string, { lat: number, lng: number, addr: string }>;
const MAX_LEARNED = 400;
export const learned = (): Learned => { const v = LS.get('stores', {}); return v && typeof v === 'object' ? v as Learned : {}; };
export function learn(key: string, p: Place) {
  const all = learned(); delete all[key];
  all[key] = { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), addr: p.addr };
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_LEARNED))) delete all[k];
  LS.set('stores', all);
}

/* ---------- Finding candidates ---------- */
const lists = new Map<string, Promise<Map<string, Place[]> | null>>();
// The bundled list for a chain, or null when there isn't one (or the server answered the page instead of a file)
export function chainList(chain: string, get: (u: string) => Promise<unknown> = fetchJson): Promise<Map<string, Place[]> | null> {
  if (!lists.has(chain)) lists.set(chain, get('/assets/stores/' + chain + '.json').then(parseDataset, () => null).then(m => m && m.size ? m : null));
  return lists.get(chain)!;
}
async function fetchJson(u: string): Promise<unknown> {
  const r = await fetch(u, { credentials: 'same-origin' });
  if (!r.ok || !/json/i.test(r.headers.get('content-type') || '')) throw new Error('no list');
  return r.json();
}
export const osmOn = () => !!LS.get('storeOsm', false);
export function osmLookup(w: Pick<Want, 'osm' | 'num'>, get: (u: string) => Promise<unknown> = fetchJson): Promise<Place[]> {
  return get('/osm/' + w.osm + '/' + w.num).then(j => parseOsm(j, w.num), () => []);
}
// Candidates for one store, best first: what you confirmed before, then the bundled list, then (only if turned on) OpenStreetMap
export async function candidates(w: Want, anchors: { lat: number, lng: number }[], io: { list?: typeof chainList, osm?: typeof osmLookup, online?: boolean, skipLearned?: boolean } = {}): Promise<Place[]> {
  const known = io.skipLearned ? undefined : learned()[w.key];
  if (known) return [{ ...known, src: 'learned' }];
  const hits = (await (io.list || chainList)(w.chain))?.get(w.num);
  if (hits) return rankPlaces(hits, anchors).slice(0, 3);
  if (!(io.online ?? osmOn())) return [];
  return rankPlaces(await (io.osm || osmLookup)(w), anchors).slice(0, 3);
}

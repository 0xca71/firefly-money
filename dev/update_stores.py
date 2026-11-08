#!/usr/bin/env python3
"""Refreshes app/assets/stores/<chain>.json, the offline store lists the Map page uses (app/src/features/stores.ts).

Source: AllThePlaces (https://www.alltheplaces.xyz, CC0), the newest weekly run. Its zip is ~3 GB, so this reads only
the files it needs with HTTP range requests. Each chain is trimmed to [store number, lat, lng, address].
Chains whose AllThePlaces file is empty this week (some scrapers are blocked week to week) fall back to the newest of the
last few runs that has data. Walmart's store numbers aren't in AllThePlaces; its list comes from a public store-number list
(ilyazub/walmart-store-locator) geocoded with the US Census batch geocoder, and only new addresses are geocoded.
Fails soft: if the source is down, or a chain's file is missing or came back empty (some chains block the scraper in
some weeks), the file already in the repo is kept. Exit code is 0 either way; the workflow opens a PR only if files changed.
"""
import csv, io, json, os, re, sys, urllib.request, uuid, zipfile

LATEST = 'https://data.alltheplaces.xyz/runs/latest.json'
HISTORY = 'https://data.alltheplaces.xyz/runs/history.json'
BACK = 12                       # newest runs to look through for a chain that is empty in the latest
WALMART_CSV = 'https://raw.githubusercontent.com/ilyazub/walmart-store-locator/master/output/walmart_stores.csv'
CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'assets', 'stores')
# chain id (same ids as CHAINS in stores.ts) -> AllThePlaces spider names, first one with data wins
CHAINS = {
    'sams': ['sams_club_us'], 'target': ['target_us'], 'costco': ['costco_ca_gb_us', 'costco_us'],
    'kroger': ['kroger_us'], 'safeway': ['safeway'], 'publix': ['publix_us'], 'aldi': ['aldi_sud_us'],
    'wholefoods': ['whole_foods'], 'traderjoes': ['trader_joes_us'], 'heb': ['h_e_b_us'], 'meijer': ['meijer_us'],
    'foodlion': ['food_lion_us'], 'cvs': ['cvs_us'], 'walgreens': ['walgreens'], 'riteaid': ['rite_aid_us'],
    'homedepot': ['home_depot'], 'lowes': ['lowes_us'], 'bestbuy': ['best_buy'], 'dollargeneral': ['dollar_general_us'],
    'dollartree': ['dollar_tree_us'], 'familydollar': ['family_dollar_us'], 'starbucks': ['starbucks_us'],
    'mcdonalds': ['mcdonalds'], 'dunkin': ['dunkin_us'], 'chickfila': ['chick_fil_a'], 'chipotle': ['chipotle'],
    'panera': ['panera_bread_us'], 'wawa': ['wawa'], 'sheetz': ['sheetz'], '7eleven': ['7_eleven_us'],
}
MAX_FILE = 2_500_000            # bytes per chain; a chain over this is cut to its first stores (and says so)
UA = {'User-Agent': 'firefly-money store list refresh (+https://github.com/Muffy0906/firefly-money)'}

def get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

class RangeFile(io.RawIOBase):
    """A read-only file on top of HTTP range requests, with a block cache, so zipfile can open a remote zip."""
    BLOCK = 1 << 20
    def __init__(self, url):
        self.url, self.pos, self.cache = url, 0, {}
        req = urllib.request.Request(url, method='HEAD', headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r: self.size = int(r.headers['Content-Length'])
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def _block(self, i):
        if i not in self.cache:
            if len(self.cache) > 40: self.cache.clear()
            a = i * self.BLOCK; b = min(self.size, a + self.BLOCK) - 1
            self.cache[i] = get(self.url, {'Range': 'bytes=%d-%d' % (a, b)}, 120)
        return self.cache[i]
    def readinto(self, buf):
        n = min(len(buf), self.size - self.pos)
        if n <= 0: return 0
        out = bytearray()
        while len(out) < n:
            i, o = divmod(self.pos + len(out), self.BLOCK)
            out += self._block(i)[o:o + n - len(out)]
        buf[:n] = out; self.pos += n
        return n

def addr_of(p):
    street = p.get('addr:street_address') or ' '.join(x for x in [p.get('addr:housenumber'), p.get('addr:street')] if x)
    return ', '.join(str(x).strip() for x in [street, p.get('addr:city'), p.get('addr:state')] if x)

# Some chains keep the number the statement shows in a link rather than in ref
NUM_IN_LINK = {'walgreens': r'/id=(\d+)', 'bestbuy': r'-(\d{1,5})\.html$'}
REF_OK = r'[A-Za-z]{0,2}-?\d{1,7}'
def number(chain, p):
    ref = str(p.get('ref') or '').strip()
    if re.fullmatch(REF_OK, ref): return ref
    m = chain in NUM_IN_LINK and re.search(NUM_IN_LINK[chain], ref + ' ' + str(p.get('website') or ''))
    return m.group(1) if m else ''

def trim(geojson, chain):
    rows = []
    for f in geojson.get('features', []):
        p, g = f.get('properties') or {}, f.get('geometry') or {}
        c = g.get('coordinates')
        ref = number(chain, p)
        if not ref or not c or len(c) < 2: continue          # real store numbers only (some chains use slugs)
        rows.append([ref, round(c[1], 5), round(c[0], 5), addr_of(p)])
    return rows

def write(chain, rows, run):
    rows.sort(key=lambda r: r[0])
    def dump(rs): return json.dumps({'v': 1, 'chain': chain, 'run': run, 'n': len(rs), 's': rs}, ensure_ascii=False, separators=(',', ':')) + '\n'
    text = dump(rows)
    while len(text.encode()) > MAX_FILE: rows = rows[:int(len(rows) * .9)]; text = dump(rows)
    path = os.path.join(OUT, chain + '.json')
    old = open(path).read() if os.path.exists(path) else ''
    # only the run id differs: not a change, so the weekly job doesn't open an empty-looking PR
    if re.sub(r'"run":"[^"]*",', '', old) == re.sub(r'"run":"[^"]*",', '', text): return False
    open(path, 'w').write(text); return True

class Runs:
    """The newest AllThePlaces runs: which spiders had data in each, and their zips, opened only when needed."""
    def __init__(self):
        latest = json.loads(get(LATEST, timeout=30))
        try: hist = json.loads(get(HISTORY, timeout=60))[-BACK:][::-1]
        except Exception: hist = []
        self.list = [latest] + [h for h in hist if h.get('run_id') != latest.get('run_id') and h.get('output_url')][:BACK - 1]
        self.stats, self.zips = {}, {}
    def features(self, r):
        k = r['run_id']
        if k not in self.stats:
            try: self.stats[k] = {x['spider']: x.get('features', 0) for x in json.loads(get(r['stats_url'], timeout=60))['results']}
            except Exception: self.stats[k] = {}
        return self.stats[k]
    def zip(self, r):
        k = r['run_id']
        if k not in self.zips:
            z = zipfile.ZipFile(RangeFile(r['output_url']))
            self.zips[k] = (z, {os.path.basename(n)[:-len('.geojson')]: n for n in z.namelist() if n.endswith('.geojson')})
        return self.zips[k]

def atp(chain, spiders, runs):
    """Rows for a chain from the newest run that has any; returns (rows, run id)."""
    for r in runs.list:
        have = runs.features(r)
        for sp in spiders:
            if r is not runs.list[0] and not have.get(sp): continue
            try:
                z, names = runs.zip(r)
                if sp not in names: continue
                rows = trim(json.loads(z.read(names[sp])), chain)
            except Exception: continue            # a damaged or empty file in this run: try the next
            if len(rows) >= 100: return rows, r['run_id']
    return [], ''

def nice(a):
    """'2020 S MUSKOGEE AVE, TAHLEQUAH, OK, 74464' -> 'Muskogee' style words, state kept in capitals"""
    parts = [p.strip() for p in a.split(',')]
    return ', '.join([p.title() for p in parts[:-2]] + parts[-2:-1] + parts[-1:])

NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&addressdetails=1&street=%s&postalcode=%s'
def nominatim(todo, cap=800):
    """The few addresses the Census couldn't match, one at a time at OpenStreetMap's allowed pace (1 a second)."""
    import time, urllib.parse
    out = {}
    for i, st, z in todo[:cap]:
        try:
            j = json.loads(get(NOMINATIM % (urllib.parse.quote(st), z), timeout=20))
            if j:
                a = j[0].get('address', {}); city = a.get('city') or a.get('town') or a.get('village') or a.get('hamlet') or ''
                out[i] = (float(j[0]['lat']), float(j[0]['lon']), ', '.join(x for x in [st, city, a.get('ISO3166-2-lvl4', '')[-2:], z] if x))
        except Exception: pass
        time.sleep(1.1)
    return out

def census(rows):
    """[(id, street, zip)] -> {id: (lat, lng, 'STREET, CITY, ST')} from the Census batch geocoder (matches only)."""
    out = {}
    for a in range(0, len(rows), 4000):
        buf = io.StringIO(); w = csv.writer(buf)
        for i, st, z in rows[a:a + 4000]: w.writerow([i, st, '', '', z])
        b = uuid.uuid4().hex
        body = ('--%s\r\nContent-Disposition: form-data; name="benchmark"\r\n\r\nPublic_AR_Current\r\n--%s\r\nContent-Disposition: form-data; name="addressFile"; filename="a.csv"\r\nContent-Type: text/csv\r\n\r\n%s\r\n--%s--\r\n' % (b, b, buf.getvalue(), b)).encode()
        req = urllib.request.Request(CENSUS, data=body, headers={**UA, 'Content-Type': 'multipart/form-data; boundary=' + b})
        with urllib.request.urlopen(req, timeout=300) as r: text = r.read().decode()
        for x in csv.reader(io.StringIO(text)):
            if len(x) > 5 and x[2] == 'Match' and ',' in x[5]:
                lng, lat = x[5].split(','); out[x[0]] = (float(lat), float(lng), nice(x[4]))
    return out

def walmart(run):
    """Walmart: a public store-number list, geocoded. Addresses already geocoded in the file in the repo are reused."""
    path = os.path.join(OUT, 'walmart.json')
    known = {}
    if os.path.exists(path):
        try: known = {r[0]: r for r in json.load(open(path))['s']}
        except Exception: pass
    rows = list(csv.DictReader(io.StringIO(get(WALMART_CSV, timeout=60).decode('utf-8-sig'))))
    todo = [(r['storeId'], r['address'].split(',')[0].strip(), r['postalCode']) for r in rows if r['storeId'] not in known and re.fullmatch(r'\d{1,5}', r['storeId'])]
    got = census(todo) if todo else {}
    got.update(nominatim([t for t in todo if t[0] not in got]))
    out = [known[r['storeId']] for r in rows if r['storeId'] in known]
    out += [[i, round(v[0], 5), round(v[1], 5), v[2]] for i, v in got.items()]
    print('%-14s %6d in the list, %d new geocoded, %d not found' % ('walmart', len(rows), len(got), len(todo) - len(got)))
    return out

def main():
    try:
        runs = Runs(); run = runs.list[0].get('run_id', '')
        runs.zip(runs.list[0])
    except Exception as e:
        print('Source unavailable, keeping the existing store lists:', e); return
    os.makedirs(OUT, exist_ok=True)
    changed = 0
    try:
        rows = walmart(run)
        if len(rows) > 1000: changed += write('walmart', rows, run)
    except Exception as e:
        print('%-14s failed, kept: %s' % ('walmart', e))
    for chain, spiders in CHAINS.items():
        try:
            rows, used = atp(chain, spiders, runs)
            if not rows: print('%-14s no data in the last %d runs, kept' % (chain, BACK)); continue
            did = write(chain, rows, used); changed += did
            print('%-14s %6d stores%s%s' % (chain, len(rows), '' if used == run else ' (from run %s)' % used, '' if did else ' (unchanged)'))
        except Exception as e:
            print('%-14s failed, kept: %s' % (chain, e))
    print('Run %s: %d file(s) changed' % (run, changed))

if __name__ == '__main__': main()

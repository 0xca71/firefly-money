#!/usr/bin/env python3
"""Refreshes app/assets/stores/<chain>.json, the offline store lists the Map page uses (app/src/features/stores.ts).

Source: AllThePlaces (https://www.alltheplaces.xyz, CC0), the newest weekly run. Its zip is ~3 GB, so this reads only
the files it needs with HTTP range requests. Each chain is trimmed to [store number, lat, lng, address].
Fails soft: if the source is down, or a chain's file is missing or came back empty (some chains block the scraper in
some weeks), the file already in the repo is kept. Exit code is 0 either way; the workflow opens a PR only if files changed.
"""
import io, json, os, re, sys, urllib.request, zipfile

LATEST = 'https://data.alltheplaces.xyz/runs/latest.json'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'assets', 'stores')
# chain id (same ids as CHAINS in stores.ts) -> AllThePlaces spider names, first one with data wins
CHAINS = {
    'walmart': ['walmart_us'], 'sams': ['sams_club_us'], 'target': ['target_us'], 'costco': ['costco_ca_gb_us', 'costco_us'],
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

def trim(geojson):
    rows = []
    for f in geojson.get('features', []):
        p, g = f.get('properties') or {}, f.get('geometry') or {}
        c = g.get('coordinates')
        ref = str(p.get('ref') or '').strip()
        if not re.fullmatch(r'[A-Za-z]{0,2}-?\d{1,7}', ref) or not c or len(c) < 2: continue   # real store numbers only (some chains use slugs)
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

def main():
    try:
        latest = json.loads(get(LATEST, timeout=30))
        zf = zipfile.ZipFile(RangeFile(latest['output_url']))
        names = {os.path.basename(n)[:-len('.geojson')]: n for n in zf.namelist() if n.endswith('.geojson')}
    except Exception as e:
        print('Source unavailable, keeping the existing store lists:', e); return
    run = latest.get('run_id', '')
    os.makedirs(OUT, exist_ok=True)
    changed = 0
    for chain, spiders in CHAINS.items():
        try:
            rows = []
            for s in spiders:
                if s in names:
                    rows = trim(json.loads(zf.read(names[s])))
                    if rows: break
            if not rows: print('%-14s no data this run, kept' % chain); continue
            did = write(chain, rows, run); changed += did
            print('%-14s %6d stores%s' % (chain, len(rows), '' if did else ' (unchanged)'))
        except Exception as e:
            print('%-14s failed, kept: %s' % (chain, e))
    print('Run %s: %d file(s) changed' % (run, changed))

if __name__ == '__main__': main()

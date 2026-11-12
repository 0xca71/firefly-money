/* The online demo (npm run build:demo, published to GitHub Pages). It runs before the app and answers the
   app's /api/v1 calls in the browser with made-up data from mockapi.ts, so the demo needs no server at all.
   It's signed in from the start (nothing checks the session) and adds a small "Demo" badge that links to the repo.
   When built with GOATCOUNTER set, it also counts visits to each page for GoatCounter (no cookies, no personal data). */
import { tr } from '../core/i18n';
import { DEMO_DASH } from './layout';
import { NotFound, createMockApi } from './mockapi';

// The demo opens in the Glass theme, with the Overview arranged by layout.ts (this runs before boot.js
// reads the theme). The demo starts fresh on every page load, for every visitor
// and device: whatever was saved before (theme, layout, Customize picks, What's new, edits' leftovers) is wiped first,
// and the data is made up in memory, so a reload or a new visit always shows the same starting point.
window.MONEY_DEMO = true;
try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* storage blocked */ }
try { indexedDB.databases?.().then(dbs => dbs.forEach(d => d.name && indexedDB.deleteDatabase(d.name))).catch(() => {}); } catch (e) { /* no IndexedDB */ }
try { caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {}); } catch (e) { /* no Cache Storage */ }
try { navigator.serviceWorker?.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {}); } catch (e) { /* no service workers */ }
try {
  {
    localStorage.setItem('moneyTheme', 'glass');
    localStorage.setItem('money.nwMonths', '60');
    localStorage.setItem('money.dash', JSON.stringify(DEMO_DASH));
  }
} catch (e) { /* storage blocked */ }

const handle = createMockApi();
const realFetch = window.fetch.bind(window);
const json = { 'Content-Type': 'application/json' };

window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const u = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (u.pathname.endsWith('/api/money-session')) return new Response(null, { status: 204 });   // sign in or out
  if (u.pathname.endsWith('/api/money-alive')) return new Response(null, { status: 204, headers: { 'X-Money-Server': '1' } });   // the connection ping's "is Money there?"
  if (u.pathname.endsWith('/api/money-ingest')) return new Response(JSON.stringify({ key: 'demo-key' }), { status: 200, headers: json });   // Settings → Apple Pay
  const at = u.pathname.indexOf('/api/v1/');
  if (at < 0) return realFetch(input, init);
  await new Promise(r => setTimeout(r, 60 + Math.random() * 120));   // feels like a real server
  const method = (init.method || 'GET').toUpperCase().replace('HEAD', 'GET');      // HEAD: the connection ping
  const q = Object.fromEntries(u.searchParams);
  try {
    let body = {};
    try { body = typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch (e) { /* not JSON */ }
    const out = handle(u.pathname.slice(at + '/api/v1'.length), q, method, body && typeof body === 'object' ? body : {});
    if (out === null) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(out), { status: 200, headers: json });
  } catch (e) {
    if (e instanceof NotFound) return new Response(JSON.stringify({ message: 'Resource not found' }), { status: 404, headers: json });
    return new Response(JSON.stringify({ message: 'The demo doesn’t support that.' }), { status: 500, headers: json });
  }
};

// No offline service worker: the app registers /sw.js at the site root, which on GitHub Pages isn't the demo's
try { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('Not in the demo')); } catch (e) { /* ignore */ }

// GoatCounter counts the address without the #, so every page would look like the front page. Count the page
// part of the hash instead (#/reports, not #/transactions?category=…), and count again on every page change.
type GoatCounter = { path?: (p: string) => string, count?: () => void };
const gc: GoatCounter = ((window as unknown as { goatcounter?: GoatCounter }).goatcounter = { path: () => location.pathname + (location.hash.split('?')[0] || '#/') });
addEventListener('hashchange', () => gc.count?.());

addEventListener('DOMContentLoaded', () => {
  const a = document.createElement('a');
  a.className = 'demo-badge';
  a.href = 'https://github.com/Muffy0906/firefly-money';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = tr('Demo · made-up data · Get Money ↗');
  document.body.append(a);
  // On a wide screen, centre it on the page, not on the window (the sidebar takes the left edge)
  const place = () => {
    const m = document.querySelector('main');
    a.style.left = innerWidth > 900 && m && m.offsetParent ? Math.round(m.getBoundingClientRect().left + m.getBoundingClientRect().width / 2) + 'px' : '';
  };
  place(); addEventListener('resize', place); addEventListener('hashchange', () => setTimeout(place, 50));
  new MutationObserver(place).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  setInterval(place, 1000);
});

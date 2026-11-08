// Glanceable numbers for an iPhone widget or Shortcut, run inside nginx (njs). Loaded by default.conf.template.
//
// GET /api/money-glance with "Authorization: Bearer <key>" answers a tiny JSON: how much is safe to spend today and
// when the next bill is due. Scriptable widgets, Shortcuts and lock-screen text can't sign in, so they send a key,
// like the Apple Pay Shortcut does (app/ingest.js), but this one is a different key: it only lets someone read these
// two numbers, never add anything. Settings → Widgets shows it (GET ?key=1 with a session). It is made from
// DASH_PASSWORD and FIREFLY_TOKEN, so changing either gives a new key and the old one stops working.
//
// It asks Firefly every time and keeps nothing: when Firefly can't be reached the answer is a 503 with no numbers
// (never the last ones). The estimate is deliberately plain and on the careful side: bank balance, minus what's owed
// on credit cards, minus bills still due in the next `days` days (default 14), minus a cushion (default $100), and it
// leaves out income that hasn't arrived yet. Forecast in the app can show more because it also projects paydays.
//
// njs supports less JavaScript than a browser: no for…of, and no await inside a call's arguments.
import crypto from 'crypto';

const FF = '/__firefly/api/v1';     // the internal location that forwards to Firefly with its token
const env = k => process.env[k] || '';
const mac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('base64url');
function same(a, b) {
  const x = mac('money-compare', a), y = mac('money-compare', b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}
const key = () => mac(env('FIREFLY_TOKEN'), 'money-glance\n' + env('DASH_PASSWORD'));

const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const between = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const SYM = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', INR: '₹', JPY: '¥' };
const money = (n, cur) => { const s = SYM[cur]; const t = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '-' : '') + (s || '') + t + (s ? '' : ' ' + cur); };
const billAmount = at => at.amount_avg != null ? num(at.amount_avg) : (num(at.amount_min) + num(at.amount_max)) / 2;

async function ff(r, path, args) {
  const res = await r.subrequest(FF + path, { method: 'GET', args: args || '' });
  if (res.status !== 200) throw new Error('Firefly answered ' + res.status);
  return JSON.parse(res.responseText || 'null');
}
async function all(r, path, args) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const d = await ff(r, path, (args ? args + '&' : '') + 'limit=500&page=' + page);
    out.push.apply(out, (d && d.data) || []);
    const meta = d && d.meta && d.meta.pagination;
    if (!meta || page >= (meta.total_pages || 1)) break;
  }
  return out;
}

// The numbers, from the accounts and bills Firefly sends. Pure, so the tests can check it without a server.
function glance(accounts, bills, o) {
  const today = o.today, days = o.days, buffer = o.buffer;
  const banks = accounts.filter(x => { const a = x.attributes || {}; return a.type === 'asset' && a.active !== false && a.include_net_worth !== false && a.account_role !== 'ccAsset'; });
  // Money in one currency: the one most of the cash is in
  const totals = {};
  banks.forEach(x => { const c = x.attributes.currency_code || ''; totals[c] = (totals[c] || 0) + Math.abs(num(x.attributes.current_balance)); });
  let cur = '', top = -1;
  Object.keys(totals).forEach(c => { if (totals[c] > top) { top = totals[c]; cur = c; } });
  const inCur = x => (x.attributes.currency_code || '') === cur;
  const balance = banks.filter(inCur).reduce((s, x) => s + num(x.attributes.current_balance), 0);
  const owed = accounts.filter(x => { const a = x.attributes || {}; return a.type === 'asset' && a.account_role === 'ccAsset' && a.active !== false && (a.currency_code || '') === cur && num(a.current_balance) < 0; })
    .reduce((s, x) => s - num(x.attributes.current_balance), 0);
  const end = addDays(today, days);
  let due = 0, next = null;
  bills.forEach(b => {
    const at = b.attributes || {};
    if (at.active === false || (at.currency_code || '') !== cur) return;
    const dates = (at.pay_dates || []).map(d => String(d).slice(0, 10)).sort();
    const amt = billAmount(at);
    dates.forEach(d => {
      // Unpaid from before today counts as due today
      if (d <= end) due += amt;
      const when = d < today ? today : d;
      if (!next || when < next.date) next = { name: at.name || 'Bill', date: when, inDays: between(today, when), amount: Math.round(amt * 100) / 100, overdue: d < today };
    });
  });
  const safe = Math.max(0, Math.floor(balance - owed - due - buffer));
  return { currency: cur, balance: Math.round(balance * 100) / 100, cardsOwed: Math.round(owed * 100) / 100, billsDue: Math.round(due * 100) / 100, buffer, days, safeToSpend: safe, nextBill: next };
}

function words(g) {
  const b = g.nextBill;
  const bill = !b ? 'no bills due' : (b.overdue ? b.name + ' is overdue' : b.inDays === 0 ? b.name + ' is due today' : b.inDays === 1 ? b.name + ' is due tomorrow' : b.name + ' in ' + b.inDays + ' days');
  return money(g.safeToSpend, g.currency) + ' safe to spend · ' + bill;
}

function reply(r, status, body, text) {
  r.headersOut['Cache-Control'] = 'no-store';
  r.headersOut['Content-Type'] = text ? 'text/plain; charset=utf-8' : 'application/json';
  r.return(status, text ? body + '\n' : JSON.stringify(body));
}

async function endpoint(r) {
  if (r.method !== 'GET') return reply(r, 405, 'Use GET.', true);
  const q = r.args || {};
  // Signed in to the app: the key for the widget
  if (q.key === '1') {
    if (r.variables.money_session !== '1' || !r.headersIn['X-Money']) return reply(r, 401, 'Sign in to Money first.', true);
    return reply(r, 200, { key: key() });
  }
  const auth = /^Bearer\s+(\S+)$/i.exec(r.headersIn['Authorization'] || '');
  if (!env('DASH_PASSWORD') || !auth || !same(auth[1], key())) return reply(r, 401, 'Wrong key: copy it again from Money → Settings → Widgets.', true);
  const text = q.format === 'text';
  // The phone knows its own date; the server only knows its own time zone
  const today = /^\d{4}-\d{2}-\d{2}$/.test(q.today || '') && !isNaN(Date.parse(q.today)) ? q.today : iso(new Date());
  const days = Math.min(60, Math.max(1, parseInt(q.days, 10) || 14)), bufferRaw = parseFloat(q.buffer);
  const buffer = isFinite(bufferRaw) && bufferRaw >= 0 ? bufferRaw : 100;
  try {
    const accounts = await all(r, '/accounts', 'type=asset');
    const bills = await all(r, '/bills', 'start=' + today.slice(0, 8) + '01&end=' + addDays(today, 60));
    const g = glance(accounts, bills, { today, days, buffer });
    g.ok = true; g.asOf = today; g.text = words(g);
    return text ? reply(r, 200, g.text, true) : reply(r, 200, g);
  } catch (e) {
    // Never the last numbers: if Firefly can't be reached, there are none
    return text ? reply(r, 503, 'Firefly is not reachable', true) : reply(r, 503, { ok: false, error: 'Firefly is not reachable' });
  }
}

export default { endpoint, glance, words };

import { tr } from '../core/i18n';
import { type Html, html, htmlList } from '../core/html';
import { getAll } from '../core/api';
import { money0, monthRange, nowMonth, todayIso, txHref, type Range } from '../core/base';
import { normGroup } from '../core/feed';
import { addDays, daysBetween } from '../core/helpers';
import { barChart, changeBars, smoothPath } from './charts';
import { isRefundTag } from './refunds';

/* ================= Trend insights (Reports) =================
   Three slow-moving questions, answered from the last 12 full months of transactions, whatever dates the report shows:
   lifestyle creep (does everyday spending grow faster than income?), this month against the same month last year,
   and which weekdays and parts of the month you spend most. Worked out here from the transactions; nothing is kept
   (and nothing is shown when Firefly can't be reached). Tested in test/trends.test.ts. */
export type TTx = { date: string, amount: number, kind: 'in' | 'out', category: string, payee: string, bill: boolean };
export type TMonth = { start: string, end: string, label: string, short: string };
export type CreepRow = { m: TMonth, income: number, fixed: number, flex: number };
export type Tone = 'good' | 'warn' | 'none';

const day = (d: string) => d.slice(0, 10);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : 0; };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const inMonth = (m: { start: string, end: string }, d: string) => d >= m.start && d <= m.end;
const pct = (v: number) => Math.round(Math.abs(v) * 100);
export const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');

// Withdrawals are spending, refunds (income tagged Refund) come off spending, other deposits are income; transfers are neither
export function toTx(groups: ReturnType<typeof normGroup>[]): TTx[] {
  return groups.flatMap(g => g.splits.flatMap((s): TTx[] => {
    if (s.type === 'withdrawal') return [{ date: day(s.date), amount: s.amount, kind: 'out', category: s.category, payee: s.destination_name, bill: !!s.bill_id }];
    if (s.type === 'deposit' && s.tags.some(isRefundTag)) return [{ date: day(s.date), amount: -s.amount, kind: 'out', category: s.category, payee: s.source_name, bill: false }];
    if (s.type === 'deposit') return [{ date: day(s.date), amount: s.amount, kind: 'in', category: s.category, payee: s.source_name, bill: false }];
    return [];
  }));
}

// Payees that charge about the same once or twice in nearly every month (rent, phone, gym, insurance): the fixed part of spending.
// A charge linked to a bill counts as fixed too.
export function fixedPayees(txs: TTx[], months: TMonth[]): Set<string> {
  const by = new Map<string, number[][]>();     // payee → each month's charges
  txs.forEach(t => {
    if (t.kind !== 'out' || t.amount <= 0 || !t.payee) return;
    const i = months.findIndex(m => inMonth(m, t.date));
    if (i < 0) return;
    if (!by.has(t.payee)) by.set(t.payee, months.map(() => []));
    by.get(t.payee)![i].push(t.amount);
  });
  const active = months.filter(m => txs.some(t => t.kind === 'out' && t.amount > 0 && inMonth(m, t.date))).length, out = new Set<string>();
  by.forEach((ms, payee) => {
    const present = ms.filter(c => c.length), totals = present.map(sum), mid = median(totals);
    if (present.length < Math.max(4, Math.ceil(active * .75)) || median(present.map(c => c.length)) > 2) return;
    if (totals.filter(v => Math.abs(v - mid) <= mid * .35).length >= Math.ceil(present.length * .75)) out.add(payee);
  });
  return out;
}

export const isFixed = (t: TTx, fixed: Set<string>) => t.bill || fixed.has(t.payee);

export function creepRows(txs: TTx[], months: TMonth[], fixed = fixedPayees(txs, months)): CreepRow[] {
  return months.map(m => {
    const mt = txs.filter(t => inMonth(m, t.date));
    return { m, income: sum(mt.filter(t => t.kind === 'in').map(t => t.amount)),
      fixed: sum(mt.filter(t => t.kind === 'out' && isFixed(t, fixed)).map(t => t.amount)), flex: sum(mt.filter(t => t.kind === 'out' && !isFixed(t, fixed)).map(t => t.amount)) };
  });
}

export type Creep = {
  enough: boolean, tone: Tone, head: string, text: string,
  growth: { income: number | null, fixed: number | null, flex: number | null },     // the last half of the months against the half before
  shareThen: number | null, shareNow: number | null,                                 // everyday spending as a share of income
};
const grow = (a: number, b: number) => a > 0 ? (b - a) / a : null;
const move = (g: number | null) => g == null ? tr('is new') : Math.abs(g) < .01 ? tr('held steady') : tr(g > 0 ? 'rose {percent}%' : 'fell {percent}%', { percent: pct(g) });
export function creep(rows: CreepRow[]): Creep {
  const half = rows.length >> 1, a = rows.slice(0, half), b = rows.slice(rows.length - half);
  const live = rows.filter(r => r.income || r.fixed || r.flex).length, none = { income: null, fixed: null, flex: null };
  if (live < 6 || half < 3 || median(a.map(r => r.income)) <= 0) return { enough: false, tone: 'none', head: 'Needs more history', text: tr('Lifestyle creep needs at least 6 months of income and spending.'), growth: none, shareThen: null, shareNow: null };
  const med = (rs: CreepRow[], k: 'income' | 'fixed' | 'flex') => median(rs.map(r => r[k]));     // the middle month, so a yearly bonus or a trip doesn't tip it
  const [ai, bi, af, bf, ax, bx] = [med(a, 'income'), med(b, 'income'), med(a, 'fixed'), med(b, 'fixed'), med(a, 'flex'), med(b, 'flex')];
  const growth = { income: grow(ai, bi), fixed: grow(af, bf), flex: grow(ax, bx) }, shareThen = ax / ai, shareNow = bi > 0 ? bx / bi : null;
  const gi = growth.income ?? 0, gx = growth.flex ?? 0, n = half, span = tr("over the last {count} months vs. the {count} before", { count: n });
  let tone: Tone = 'good', head: string, text: string;
  if (gx > gi + .05 && gx > .03) { tone = 'warn'; head = 'Creeping up'; text = tr("Everyday spending {spending} while income {income} {period}.", { spending: move(growth.flex), income: move(growth.income), period: span }); }
  else if (gx > gi + .02 && gx > .02) { tone = 'warn'; head = 'Edging up'; text = tr("Everyday spending {spending} while income {income} {period}.", { spending: move(growth.flex), income: move(growth.income), period: span }); }
  else if (gx <= gi) { head = 'Income is ahead'; text = tr("Income {income} and everyday spending {spending} {period}.", { spending: move(growth.flex), income: move(growth.income), period: span }); }
  else { head = 'In step'; text = tr("Everyday spending {spending} and income {income} {period}.", { spending: move(growth.flex), income: move(growth.income), period: span }); }
  return { enough: true, tone, head, text, growth, shareThen, shareNow };
}

/* ---------- This month against the same month last year ---------- */
export type Yoy = {
  enough: boolean, tone: Tone, head: string, text: string, title: string,
  now: number, prev: number, rows: { name: string, now: number, prev: number }[], nowRange: { start: string, end: string }, prevRange: { start: string, end: string },
};
// The month to compare: the one under way, so far (its days to date against the same number of days a year before). In its first
// days that says little, so then it is last month in full.
export function yoyRanges(today: string) {
  const [y, m] = nowMonth(), cur = monthRange(y, m), gone = daysBetween(cur.start, today) + 1, full = gone < 7;
  const mo = full ? monthRange(y, m - 1) : cur, ly = monthRange(mo.y, mo.m - 12);
  const nowRange = { start: mo.start, end: full ? mo.end : today }, ago = daysBetween(mo.start, nowRange.end);
  return { month: mo, lastYear: ly, nowRange, prevRange: { start: ly.start, end: addDays(ly.start, Math.min(ago, daysBetween(ly.start, ly.end))) }, partial: !full, title: mo.label.replace(/ \d+$/, '') };
}
export function yoy(txs: TTx[], r: { nowRange: { start: string, end: string }, prevRange: { start: string, end: string }, month: { label: string, y: number }, lastYear: { label: string }, partial: boolean }): Yoy {
  const by = (range: { start: string, end: string }) => { const mp = new Map<string, number>(); txs.forEach(t => { if (t.kind === 'out' && inMonth(range, t.date)) mp.set(t.category || 'Uncategorized', (mp.get(t.category || 'Uncategorized') || 0) + t.amount); }); return mp; };
  const [n, p] = [by(r.nowRange), by(r.prevRange)], now = sum([...n.values()]), prev = sum([...p.values()]);
  const namedUncategorized = txs.some(t => t.category === 'Uncategorized' && t.kind === 'out' && (inMonth(r.nowRange, t.date) || inMonth(r.prevRange, t.date)));
  const rows = [...new Set([...n.keys(), ...p.keys()])].map(name => ({ name: name === 'Uncategorized' && !namedUncategorized ? tr('Uncategorized') : name, now: n.get(name) || 0, prev: p.get(name) || 0 }));
  const what = r.partial ? tr('So far this month') : r.month.label, vs = r.partial ? tr("the same days of {month}", { month: r.lastYear.label }) : r.lastYear.label;
  const base = { now, prev, rows, nowRange: r.nowRange, prevRange: r.prevRange, title: tr("{now} vs. {before}", { now: what, before: r.lastYear.label }) };
  if (prev < 1) return { ...base, enough: false, tone: 'none', head: 'No year-ago data', text: tr("Nothing was spent in {month} to compare with.", { month: r.lastYear.label }) };
  const g = (now - prev) / prev, lead = [...rows].sort((a, b) => (b.now - b.prev) * Math.sign(g || 1) - (a.now - a.prev) * Math.sign(g || 1))[0];
  const why = lead && Math.abs(lead.now - lead.prev) >= 1 && (lead.now - lead.prev) * Math.sign(g || 1) > 0 ? tr(", mostly {category} ({change})", { category: lead.name, change: (lead.now > lead.prev ? '+' : '−') + money0(Math.abs(lead.now - lead.prev)) }) : '';
  if (Math.abs(g) < .03) return { ...base, enough: true, tone: 'good', head: 'About the same', text: tr(r.partial ? 'You’ve spent {amount}, about the same as {before}.' : 'You spent {amount}, about the same as {before}.', { amount: money0(now), before: vs }) };
  return { ...base, enough: true, tone: g > 0 ? 'warn' : 'good', head: g > 0 ? 'Spending is up' : 'Spending is down',
    text: tr(r.partial ? (g > 0 ? 'You’ve spent {amount}, {percent}% more than {before}{reason}.' : 'You’ve spent {amount}, {percent}% less than {before}{reason}.') : (g > 0 ? 'You spent {amount}, {percent}% more than {before}{reason}.' : 'You spent {amount}, {percent}% less than {before}{reason}.'), { amount: money0(now), percent: pct(g), before: vs, reason: why }) };
}

/* ---------- Which weekdays and parts of the month you spend most ---------- */
export type Rhythm = {
  enough: boolean, tone: Tone, weekHead: string, weekText: string, partHead: string, partText: string,
  weekdays: number[],        // each weekday (Monday first) against a typical day, as a share (0.25 = 25% more)
  parts: number[],           // the same for days 1–7, 8–14, 15–21 and the rest of each month
  typical: number,
};
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], WEEKDAYS_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
export const PARTS = ['Days 1–7', 'Days 8–14', 'Days 15–21', 'Day 22 on'], PARTS_LONG = ['the first week of the month', 'the second week of the month', 'the third week of the month', 'the last week of the month'];
const dow = (d: string) => (new Date(d + 'T12:00:00').getDay() + 6) % 7;
const partOf = (start: string, d: string) => Math.min(3, Math.floor(daysBetween(start, d) / 7));
// Everyday spending only (bills and rent land on set days), and without one-off big purchases (over 4x a typical large purchase)
export function rhythm(txs: TTx[], months: TMonth[], fixed = fixedPayees(txs, months)): Rhythm {
  const spend = txs.filter(t => t.kind === 'out' && t.amount > 0 && !isFixed(t, fixed)), sorted = spend.map(t => t.amount).sort((a, b) => a - b);
  const cap = (sorted[Math.floor(sorted.length * .9)] || 0) * 4, buys = spend.filter(t => t.amount <= cap);
  const wd = Array(7).fill(0), wn = Array(7).fill(0), pt = Array(4).fill(0), pn = Array(4).fill(0);
  months.forEach(m => { for (let d = m.start, i = 0; d <= m.end && i < 40; d = addDays(d, 1), i++) { wn[dow(d)]++; pn[partOf(m.start, d)]++; } });
  buys.forEach(t => { const m = months.find(x => inMonth(x, t.date)); if (m) { wd[dow(t.date)] += t.amount; pt[partOf(m.start, t.date)] += t.amount; } });
  const days = sum(wn), typical = days ? sum(wd) / days : 0, none = { enough: false, tone: 'none' as Tone, weekHead: '', weekText: '', partHead: '', partText: '', weekdays: [], parts: [], typical };
  if (months.length < 3 || buys.length < 30 || typical <= 0) return none;
  const weekdays = wd.map((v, i) => wn[i] ? v / wn[i] / typical - 1 : 0), parts = pt.map((v, i) => pn[i] ? v / pn[i] / typical - 1 : 0);
  const hi = (xs: number[]) => xs.indexOf(Math.max(...xs)), lo = (xs: number[]) => xs.indexOf(Math.min(...xs)), w = hi(weekdays), p = hi(parts);
  const even = weekdays[w] < .15, evenP = parts[p] < .1;
  return { enough: true, tone: even && evenP ? 'good' : 'warn', typical, weekdays, parts,
    weekHead: even ? 'Even all week' : WEEKDAYS_LONG[w],
    weekText: even ? tr('Your spending is spread evenly across the week.') : tr("You spend most on {day}: {percent}% above a typical day. Quietest: {quietest}.", { day: tr(WEEKDAYS_LONG[w]), percent: pct(weekdays[w]), quietest: tr(WEEKDAYS_LONG[lo(weekdays)]) }),
    partHead: evenP ? 'Even all month' : PARTS[p],
    partText: evenP ? tr('Your spending is spread evenly through the month.') : tr("Spending runs highest in {part}: {percent}% above a typical day. Lightest: {quietest}.", { part: tr(PARTS_LONG[p]), percent: pct(parts[p]), quietest: tr(PARTS_LONG[lo(parts)]) }) };
}

/* ---------- Drawing ---------- */
const short$ = (v: number) => v >= 1e6 ? '$' + +(v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? '$' + +(v / 1e3).toFixed(1) + 'k' : '$' + Math.round(v);
const niceMax = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
export const CREEP_COLORS = ['var(--income)', 'var(--muted)', 'var(--spend)'];
// Income, fixed and everyday spending by month as three lines (the same drawing and text rules as the other line charts)
export function creepChart(rows: CreepRow[], label: string) {
  const W = innerWidth < 600 ? 360 : 640, H = innerWidth < 600 ? 220 : 280, pl = 46, pr = 8, pt = 10, pb = 26, n = rows.length, base = H - pb;
  const max = niceMax(Math.max(1, ...rows.flatMap(r => [r.income, r.fixed, r.flex])) / 4) * 4;
  const x = (i: number) => pl + (W - pl - pr) * (n < 2 ? .5 : i / (n - 1)), y = (v: number) => pt + (base - pt) * (1 - v / max);
  const line = (pick: (r: CreepRow) => number, c: string, w: number) => html`<path class="draw" pathLength="1" d="${smoothPath(rows.map((r, i) => [x(i), y(pick(r))]))}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const grid = htmlList([0, 1, 2, 3, 4].map(k => { const v = max * k / 4, yy = y(v).toFixed(1); return html`<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}"/><text x="${pl - 8}" y="${(+yy + 4).toFixed(1)}" text-anchor="end">${short$(v)}</text>`; }));
  const every = Math.max(1, Math.ceil(n / (W < 500 ? 4 : 6))), ticks = htmlList(rows.map((r, i) => (i % every || x(n - 1) - x(i) < 50) && i !== n - 1 ? '' : html`<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${r.m.short}</text>`));
  const step = (W - pl - pr) / Math.max(1, n - 1);
  const hits = htmlList(rows.map((r, i) => { const a = Math.max(pl, x(i) - step / 2), b = Math.min(W - pr, x(i) + step / 2);
    return html`<rect x="${a.toFixed(1)}" width="${(b - a).toFixed(1)}" y="0" height="${base}" fill="transparent" data-tip="${r.m.label + '\n' + tr("Income {income}\nFixed {fixed}\nEveryday {everyday}", { income: money0(r.income), fixed: money0(r.fixed), everyday: money0(r.flex) })}" data-go="${txHref({}, r.m as Range)}"/>`; }));
  return html`<svg class="lines" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}"><g class="grid">${grid}</g>${line(r => r.fixed, CREEP_COLORS[1], 2.2)}${line(r => r.flex, CREEP_COLORS[2], 2.6)}${line(r => r.income, CREEP_COLORS[0], 2.6)}${ticks}${hits}</svg><div class="legend"><span><i style="background:${CREEP_COLORS[0]}"></i>Income</span><span><i style="background:${CREEP_COLORS[1]}"></i>Fixed bills</span><span><i style="background:${CREEP_COLORS[2]}"></i>Everyday spending</span></div>`;
}
const chip = (tone: Tone, head: string) => html`<span class="chip ${tone === 'none' ? '' : tone}">${tr(head)}</span>`;
const verdict = (head: string, tone: Tone, text: string) => html`<p class="tr-verdict">${chip(tone, head)} ${text}</p>`;
const signed = (v: number | null) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + pct(v) + '%';
const gcls = (v: number | null, upBad: boolean) => v == null || Math.abs(v) < .01 ? '' : (v > 0) === upBad ? 'up' : 'down';

export function creepCard(c: Creep, rows: CreepRow[]): Html {
  const stat = (l: string, v: Html | string, cls = '') => html`<div><dt>${tr(l)}</dt><dd class="num ${cls}">${v}</dd></div>`;
  const stats = c.enough ? html`<dl class="tr-stats">${stat('Income', signed(c.growth.income), gcls(c.growth.income, false))}${stat('Fixed bills', signed(c.growth.fixed), gcls(c.growth.fixed, true))}${stat('Everyday spending', signed(c.growth.flex), gcls(c.growth.flex, true))}${c.shareNow != null && c.shareThen != null ? stat('Everyday share of income', tr("{now}% (was {before}%)", { now: Math.round(c.shareNow * 100), before: Math.round(c.shareThen * 100) }), c.shareNow > c.shareThen + .02 ? 'up' : '') : ''}</dl>` : '';
  return html`<section class="panel chart tr-card"><h2>Lifestyle creep</h2><p class="lead">Income, fixed bills and everyday spending, month by month</p>${verdict(c.head, c.tone, c.text)}${c.enough ? creepChart(rows, tr("Income, fixed bills and everyday spending over the last 12 months")) : ''}${stats}</section>`;
}
export function yoyCard(y: Yoy): Html {
  const chg = y.enough ? changeBars(y.rows.map(r => ({ ...r })), 6) : '';
  return html`<section class="panel tr-card"><h2>Year over year</h2><p class="lead">${y.title}</p>${verdict(y.head, y.tone, y.text)}${y.enough ? html`<div class="tr-vs"><span class="num">${money0(y.now)}</span><span class="sub-s">${tr("vs. {amount} a year ago", { amount: money0(y.prev) })}</span></div>` : ''}${chg ? html`<h3 class="tr-h">Biggest changes by category</h3>${chg}` : ''}</section>`;
}
const pctFmt = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';
export function rhythmCards(r: Rhythm): Html {
  if (!r.enough) return html`<section class="panel tr-card"><h2>When you spend</h2><p class="lead">Weekdays and parts of the month</p>${verdict('Needs more history', 'none', tr('This needs a few months of everyday purchases.'))}</section>`;
  const bars = (vals: number[], names: string[], label: string) => barChart(vals.map((v, i) => ({ label: tr(names[i]), v: Math.round(v * 100) })), pctFmt, tr(label), { w: 320, h: 180 });
  return html`<section class="panel chart tr-card"><h2>Spending by weekday</h2><p class="lead">${tr("Against a typical day (about {amount}), everyday spending only", { amount: money0(r.typical) })}</p>${verdict(r.weekHead, r.weekdays.every(v => v < .15) ? 'good' : 'warn', r.weekText)}${bars(r.weekdays, WEEKDAYS, 'Everyday spending on each weekday against a typical day')}</section><section class="panel chart tr-card"><h2>Spending through the month</h2><p class="lead">Against a typical day, everyday spending only</p>${verdict(r.partHead, r.parts.every(v => v < .1) ? 'good' : 'warn', r.partText)}${bars(r.parts, PARTS, 'Everyday spending in each part of the month against a typical day')}</section>`;
}

// The last 12 full months of transactions, and the month to compare a year back. A failed request throws: the caller shows no trends.
export async function loadTrends(today = todayIso()) {
  const [y, m] = nowMonth(), months: TMonth[] = [];
  for (let k = 12; k >= 1; k--) { const r = monthRange(y, m - k); months.push({ start: r.start, end: r.end, label: r.label, short: r.short + (k === 12 || r.m === 0 ? ' ’' + String(r.y).slice(2) : '') }); }
  const r = yoyRanges(today), from = [months[0].start, r.prevRange.start].sort()[0];
  const txs = toTx((await getAll('/transactions', { start: from, end: today, type: 'all' })).map(normGroup));
  const rows = creepRows(txs.filter(t => t.date <= months[11].end), months);
  return { rows, creep: creep(rows), yoy: yoy(txs, r), rhythm: rhythm(txs.filter(t => t.date <= months[11].end), months) };
}
export async function trendsHtml(want: { creep: boolean, yoy: boolean, rhythm: boolean }): Promise<Html | string> {
  if (!want.creep && !want.yoy && !want.rhythm) return '';
  try {
    const t = await loadTrends();
    return html`<div class="trends"><h2 class="tr-title">Trends</h2><p class="sub-s tr-note">The last 12 full months, whatever dates are picked above.</p>${want.creep ? creepCard(t.creep, t.rows) : ''}<div class="flow report-cols">${want.yoy ? yoyCard(t.yoy) : ''}${want.rhythm ? rhythmCards(t.rhythm) : ''}</div></div>`;
  } catch (e) { return html`<div class="trends"><h2 class="tr-title">Trends</h2><p class="sub-s tr-note">Couldn’t load the trends. Try again in a moment.</p></div>`; }
}

import { api, getAll } from '../core/api';
import { S, arr, num, type ApiData } from '../core/base';
import { normGroup } from '../core/feed';
import { LS } from '../core/helpers';

/* ================= Refunds =================
   A refund is an income transaction (deposit) tagged "Refund", into the account the purchase was paid from, with the
   purchase's category. When it's made from the purchase, it's also linked to it with Firefly's "Refund" link type.
   Firefly counts it as income and leaves budgets alone (only expenses have a budget), so Reports, Budgets and the
   overview take refunds off spending instead: by category and payee from the refund itself, by budget from the
   purchase it's linked to. */
export const REFUND_TAG = 'Refund';
export const isRefundTag = (t: string) => t.trim().toLowerCase() === REFUND_TAG.toLowerCase();
export type Refund = { jid: string, date: string, amount: number, category: string, payee: string, budgetId: string, budget: string, known: boolean, oneOff?: boolean };

// Firefly's "Refund" link type (it comes with Firefly; it can be renamed or deleted)
export async function refundLinkType(): Promise<ApiData | null> {
  const types = S.linkTypes || (S.linkTypes = await getAll('/link-types').catch(() => null));
  return (types || []).find(t => isRefundTag(String(t.attributes.name || ''))) || null;
}
// The purchase a refund is linked to: its budget, and whether one was found at all
// (kept until something is changed here, since links and budgets can change)
const ORIGINAL = new Map<string, Promise<{ budgetId: string, budget: string, known: boolean }>>();
let originalAt = 0;
function originalOf(jid: string) {
  if (originalAt < S.dirtyAt) { ORIGINAL.clear(); originalAt = Date.now(); }
  if (!ORIGINAL.has(jid)) ORIGINAL.set(jid, (async () => {
    const type = await refundLinkType();
    if (!type) return { budgetId: '', budget: '', known: false };
    const links = await getAll('/transaction-journals/' + jid + '/links');
    const l = links.find(x => String(x.attributes.link_type_id) === String(type.id));
    if (!l) return { budgetId: '', budget: '', known: false };
    const other = String(String(l.attributes.outward_id) === jid ? l.attributes.inward_id : l.attributes.outward_id);
    const g = normGroup((await api('/transaction-journals/' + other)).data), s = g.splits.find(x => x.jid === other) || g.splits[0];
    return s && s.type === 'withdrawal' ? { budgetId: s.budget_id, budget: s.budget_name, known: true } : { budgetId: '', budget: '', known: false };
  })().catch(() => { ORIGINAL.delete(jid); return { budgetId: '', budget: '', known: false }; }));
  return ORIGINAL.get(jid)!;
}
// Big one-off purchases (a laptop, a flight) can be left out of Spent, the trends and the pace: tag them "One-off" and
// switch "Leave out one-offs" on in Settings. They come off spending the way refunds do, but never off income.
export const ONEOFF_TAG = 'One-off';
export const skipOneOffs = () => !!LS.get('skipOneOffs', false);
async function oneOffsIn(start: string, end: string): Promise<Refund[]> {
  const gs = await getAll('/tags/' + encodeURIComponent(ONEOFF_TAG) + '/transactions', { start, end, type: 'withdrawal' }).catch(() => []);
  return gs.map(normGroup).flatMap(g => g.splits).filter(s => s.type === 'withdrawal' && s.tags.some(t => t.trim().toLowerCase() === ONEOFF_TAG.toLowerCase()))
    .map(s => ({ jid: s.jid, date: String(s.date).slice(0, 10), amount: Math.abs(s.amount), category: s.category, payee: s.destination_name, budgetId: s.budget_id, budget: s.budget_name, known: true, oneOff: true }));
}
// The refunds dated start..end (and the one-offs, when they're left out)
export async function refundsIn(start: string, end: string): Promise<Refund[]> {
  const [rs, one] = await Promise.all([refundsOnly(start, end), skipOneOffs() ? oneOffsIn(start, end) : []]);
  return [...rs, ...one];
}
async function refundsOnly(start: string, end: string): Promise<Refund[]> {
  const gs = await getAll('/tags/' + encodeURIComponent(REFUND_TAG) + '/transactions', { start, end, type: 'deposit' }).catch(() => []);
  const splits = gs.map(normGroup).flatMap(g => g.splits).filter(s => s.type === 'deposit' && s.tags.some(isRefundTag));
  return Promise.all(splits.map(async s => ({ jid: s.jid, date: String(s.date).slice(0, 10), amount: Math.abs(s.amount), category: s.category, payee: s.source_name, ...await originalOf(s.jid) })));
}
export const refundTotal = (rs: Refund[], start = '', end = '9999') => rs.filter(r => r.date >= start && r.date <= end).reduce((s, r) => s + r.amount, 0);
// Refund amounts added up by name (category, payee or budget)
export function refundsBy(rs: Refund[], key: (r: Refund) => string) {
  const m = new Map<string, number>();
  rs.forEach(r => { const k = key(r); if (k) m.set(k, (m.get(k) || 0) + r.amount); });
  return m;
}
// An /insight/… answer with refunds taken off its entries, matched by name; never below zero
export function lessRefunds(res: ApiData, by: Map<string, number>): ApiData[] {
  return arr(res).map(x => {
    const r = by.get(x.name); if (!r) return x;
    const v = num(x.difference_float ?? x.difference), left = Math.sign(v) * Math.max(0, Math.abs(v) - r);
    return { ...x, difference: left.toFixed(2), difference_float: left };
  });
}
// A one-entry /insight/… total (or no-category, no-budget) less an amount
export function lessTotal(res: ApiData, amount: number): ApiData[] {
  const xs = arr(res); if (!amount || !xs.length) return xs;
  const v = num(xs[0].difference_float ?? xs[0].difference), left = Math.sign(v) * Math.max(0, Math.abs(v) - amount);
  return [{ ...xs[0], difference: left.toFixed(2), difference_float: left }, ...xs.slice(1)];
}
// Budgets (from /budgets) with refunds of their purchases taken off what they spent
export function budgetsLessRefunds(budgets: ApiData[], rs: Refund[]): ApiData[] {
  const by = refundsBy(rs, r => r.budgetId);
  if (!by.size) return budgets;
  return budgets.map(b => {
    const r = by.get(String(b.id)); if (!r) return b;
    const spent = (b.attributes.spent || []) as ApiData[], sum = spent.reduce((s, x) => s + num(x.sum), 0);
    const back = Math.min(r, Math.max(0, -sum));
    return { ...b, attributes: { ...b.attributes, spent: [...spent, { sum: back.toFixed(2), currency_code: (spent[0] || {}).currency_code }] } };
  });
}
// An /insight/… answer for start..end with the refunds in rs (which may cover a longer range) taken off spending, and off
// income too, since Firefly counted them there. Answers this doesn't know are returned as they are.
export function netted(path: string, range: { start: string, end: string }, res: ApiData, rs: Refund[]): ApiData {
  rs = rs.filter(r => r.date >= range.start && r.date <= range.end);
  if (!rs.length) return res;
  switch (path) {
    case '/insight/expense/total': return lessTotal(res, refundTotal(rs));
    case '/insight/income/total': return lessTotal(res, refundTotal(rs.filter(r => !r.oneOff)));
    case '/insight/expense/category': return lessRefunds(res, refundsBy(rs, r => r.category));
    case '/insight/income/category': return lessRefunds(res, refundsBy(rs.filter(r => !r.oneOff), r => r.category));
    case '/insight/expense/no-category': return lessTotal(res, refundTotal(rs.filter(r => !r.category)));
    case '/insight/expense/budget': return lessRefunds(res, refundsBy(rs, r => r.budget));
    case '/insight/expense/no-budget': return lessTotal(res, refundTotal(rs.filter(r => r.known && !r.budgetId)));
    case '/insight/expense/expense': return lessRefunds(res, refundsBy(rs, r => r.payee));
    case '/insight/income/revenue': return lessRefunds(res, refundsBy(rs.filter(r => !r.oneOff), r => r.payee));
    default: return res;
  }
}
// api() for an /insight/… answer, with refunds netted as above. rs: the refunds, when the caller has them for a longer range.
export async function insight(path: string, range: { start: string, end: string }, rs?: Promise<Refund[]>) {
  const [res, r] = await Promise.all([api(path, { params: range }), rs || refundsIn(range.start, range.end)]);
  return netted(path, range, res, r);
}

// Withdrawals (raw /transactions groups) with the refunds in rs taken off, as one negative "withdrawal" per refund dated
// on its day, so the day-by-day views (heatmap, pace, activity) add up to the same Spent as the insight totals.
// null (Firefly not answering) stays null.
export const REFUND_ROW = 'refund-net';
export function lessRefundTx(tx: ApiData[] | null, rs: Refund[]): ApiData[] | null {
  if (!tx || !rs.length) return tx;
  return [...tx, ...rs.map(r => ({ id: REFUND_ROW, attributes: { transactions: [{ transaction_journal_id: r.jid, type: 'withdrawal', date: r.date, amount: String(-r.amount), description: r.oneOff ? 'One-off' : 'Refund', category_name: r.category }] } }))];
}

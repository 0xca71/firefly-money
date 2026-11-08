/* Finds charges that repeat on a schedule (subscriptions, utilities, insurance) in a list of past withdrawals,
   so they can become bills. Pure logic with no side effects, tested in test/subs.test.ts. */

export interface Charge { date: string; amount: number; payeeId: string; payee: string; billId?: string }
export interface Recurring {
  payeeId: string; payee: string; freq: string; skip: number; every: string; count: number;
  amount: number; min: number; max: number; last: string; next: string; rose: null | { from: number; to: number }; billId?: string;
}

// Firefly's repeat_freq (plus skip) for each pattern, and the gap in days it allows between charges
const FREQS = [
  { freq: 'weekly', skip: 0, every: 'week', lo: 6, hi: 8, min: 4 },
  { freq: 'weekly', skip: 1, every: '2 weeks', lo: 13, hi: 16, min: 3 },
  { freq: 'monthly', skip: 0, every: 'month', lo: 26, hi: 34, min: 3 },
  { freq: 'quarterly', skip: 0, every: 'quarter', lo: 85, hi: 98, min: 3 },
  { freq: 'half-year', skip: 0, every: '6 months', lo: 172, hi: 192, min: 2 },
  { freq: 'yearly', skip: 0, every: 'year', lo: 350, hi: 380, min: 2 },
];
const DAY = 864e5;
const t = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round2 = (x: number) => Math.round(x * 100) / 100;

// The date one period after `from`; monthly steps keep the day of the month (clamped to short months)
export function nextDate(from: string, freq: string, skip = 0) {
  const n = skip + 1, d = new Date(t(from));
  if (freq === 'weekly') return iso(+d + 7 * n * DAY);
  const months = ({ monthly: 1, quarterly: 3, 'half-year': 6, yearly: 12 } as Record<string, number>)[freq] * n, day = d.getUTCDate();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(Date.UTC(y, m, Math.min(day, last), 12));
}

// opts.all: also keep payees already linked to a bill and ones that have gone quiet (for the subscription audit)
// opts.tolerance: how far (as a share of the typical amount) a charge may be off and still count as the same bill
export function findRecurring(charges: Charge[], today: string, opts: { tolerance?: number, all?: boolean } = {}): Recurring[] {
  const tol = opts.tolerance ?? 0.25, now = t(today), groups = new Map<string, Charge[]>();
  charges.forEach(c => {
    if (!(c.amount > 0) || !c.date) return;
    const k = c.payeeId || c.payee.trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  });
  const out: Recurring[] = [];
  groups.forEach(list => {
    if (!opts.all && list.some(c => c.billId)) return;          // already linked to a bill
    // Several charges on one day count once (a split, or a refund and a new charge)
    const byDay = new Map<string, Charge>();
    list.forEach(c => { const d = c.date.slice(0, 10), was = byDay.get(d); byDay.set(d, was ? { ...was, amount: was.amount + c.amount } : c); });
    const cs = [...byDay.values()].sort((a, b) => t(a.date) - t(b.date));
    if (cs.length < 2) return;
    const gaps = cs.slice(1).map((c, i) => (t(c.date) - t(cs[i].date)) / DAY), gap = median(gaps);
    const f = FREQS.find(x => gap >= x.lo && gap <= x.hi);
    if (!f || cs.length < f.min) return;
    // Most gaps must fit the pattern (one missed or moved charge is fine)
    if (gaps.filter(g => g >= f.lo - 2 && g <= f.hi + 2).length < Math.ceil(gaps.length * 0.75)) return;
    // ...and so must most amounts, judged against the recent ones (prices change)
    const recent = cs.slice(-Math.max(f.min, 6)), typical = median(recent.map(c => c.amount));
    const near = recent.filter(c => Math.abs(c.amount - typical) <= typical * tol);
    if (near.length < Math.ceil(recent.length * 0.75)) return;
    // Still going: the last charge isn't long overdue
    const last = cs[cs.length - 1];
    if ((now - t(last.date)) / DAY > (opts.all ? 400 : f.hi * 1.5 + 5)) return;
    // A fixed price (the charges before the last one all the same) that went up: suggest the new price
    const before = cs.slice(0, -1).slice(-5).map(c => c.amount), was = median(before), fixed = before.every(a => Math.abs(a - was) <= was * 0.01);
    const rose = fixed && last.amount > was * 1.02 && last.amount - was >= 0.5 && Math.abs(last.amount - typical) <= typical * tol ? { from: round2(was), to: round2(last.amount) } : null;
    const amounts = rose ? [last.amount] : near.map(c => c.amount);
    out.push({ payeeId: last.payeeId, payee: last.payee, freq: f.freq, skip: f.skip, every: f.every, count: cs.length, amount: round2(rose ? last.amount : typical),
      min: round2(Math.min(...amounts)), max: round2(Math.max(...amounts)), last: last.date.slice(0, 10), next: nextDate(last.date, f.freq, f.skip), rose, ...(last.billId ? { billId: last.billId } : {}) });
  });
  // Biggest yearly cost first
  const PER_YEAR: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, 'half-year': 2, yearly: 1 };
  const perYear = (r: Recurring) => r.amount * PER_YEAR[r.freq] / (r.skip + 1);
  return out.sort((a, b) => perYear(b) - perYear(a));
}

// Bills whose latest linked charge came in above the bill's highest amount (a price rise to update)
export function billRises(charges: Charge[], bills: { id: string; max: number }[]) {
  const out: Record<string, { last: number; date: string }> = {};
  bills.forEach(b => {
    const cs = charges.filter(c => c.billId === b.id).sort((x, y) => t(y.date) - t(x.date));
    if (cs[0] && b.max > 0 && cs[0].amount > b.max * 1.01) out[b.id] = { last: cs[0].amount, date: cs[0].date.slice(0, 10) };
  });
  return out;
}

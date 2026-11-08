import { type Charge, findRecurring, type Recurring } from './subs';

/* ================= Subscription audit =================
   Every repeating charge in the past year's spending, with what it costs a month and a year, whether the latest charge was
   a price rise, when it is due next, and whether it has gone quiet (no charge when one was expected, or none for 60+ days).
   Worked out here from the charges; nothing is kept. Tested in test/subaudit.test.ts. */
export type SubStatus = 'ok' | 'late' | 'quiet';
export interface SubItem extends Recurring {
  perMonth: number; perYear: number; status: SubStatus; daysSince: number; daysLate: number; dueSoon: boolean;
  hike: null | { from: number; to: number; pct: number };       // the latest charge against the ones before it
  creep: null | { from: number; to: number; pct: number; since: string };   // the latest charge against the first one in the year
}
export interface SubAudit { items: SubItem[]; monthly: number; yearly: number; hikes: number; quiet: number; late: number; quietYearly: number; dueSoon: number }

const DAY = 864e5, PER_YEAR: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, 'half-year': 2, yearly: 1 };
const t = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z');
const r2 = (x: number) => Math.round(x * 100) / 100;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const QUIET_DAYS = 60;

export function auditSubs(charges: Charge[], today: string): SubAudit {
  const now = t(today), recurring = findRecurring(charges, today, { all: true });
  const items: SubItem[] = recurring.map(r => {
    // That payee's charges, one per day, oldest first
    const byDay = new Map<string, number>();
    charges.filter(c => c.amount > 0 && c.date && (c.payeeId || c.payee.trim().toLowerCase()) === (r.payeeId || r.payee.trim().toLowerCase()))
      .forEach(c => byDay.set(c.date.slice(0, 10), (byDay.get(c.date.slice(0, 10)) || 0) + c.amount));
    const days = [...byDay.keys()].sort(), amts = days.map(d => byDay.get(d)!), latest = amts[amts.length - 1], first = amts[0];
    const before = median(amts.slice(0, -1).slice(-5));
    const hike = amts.length > 1 && latest > before * 1.02 && latest - before >= 0.5 ? { from: r2(before), to: r2(latest), pct: Math.round((latest / before - 1) * 100) } : null;
    const creep = !hike && amts.length > 2 && latest > first * 1.05 && latest - first >= 1 ? { from: r2(first), to: r2(latest), pct: Math.round((latest / first - 1) * 100), since: days[0] } : null;
    const perYear = r.amount * PER_YEAR[r.freq] / (r.skip + 1), period = (t(r.next) - t(r.last)) / DAY;
    const daysSince = Math.round((now - t(r.last)) / DAY), daysLate = Math.round((now - t(r.next)) / DAY), grace = Math.max(5, Math.round(period * 0.15));
    const status: SubStatus = daysLate <= grace ? 'ok' : daysSince >= QUIET_DAYS ? 'quiet' : 'late';
    const until = Math.round((t(r.next) - now) / DAY);
    return { ...r, perYear: r2(perYear), perMonth: r2(perYear / 12), status, daysSince, daysLate, dueSoon: status === 'ok' && until >= 0 && until <= 7, hike, creep };
  });
  const live = items.filter(i => i.status !== 'quiet'), quiet = items.filter(i => i.status === 'quiet');
  const yearly = r2(live.reduce((s, i) => s + i.perYear, 0));
  return { items, yearly, monthly: r2(yearly / 12), hikes: items.filter(i => i.hike).length, quiet: quiet.length, late: items.filter(i => i.status === 'late').length,
    quietYearly: r2(quiet.reduce((s, i) => s + i.perYear, 0)), dueSoon: items.filter(i => i.dueSoon).length };
}

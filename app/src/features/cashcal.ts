/* Cash flow calendar: the next 30 days, one cell per day, from the same scheduled events as the Forecast.
   Pure logic (tested in test/cashcal.test.ts). Each day has what comes in and goes out, the projected balance at
   the end of it, and how likely it is to be below zero (share of the simulated runs, when there is a band). */
export interface CalEvent { date: string, amount: number, off?: boolean, kind: string, label: string }
export interface CalDay { iso: string, i: number, inn: number, out: number, bal: number, low: number, pNeg: number, risk: boolean, tightest: boolean, events: CalEvent[] }
export const CAL_DAYS = 30;
/* A day is "at risk" when the point forecast is below zero or at least 1 run in 10 ends the day below zero (p10 < 0). */
export const RISK = .1;
export function cashCalendar(o: { dates: string[], bal: number[], events: CalEvent[], pNeg?: number[], p10?: number[], days?: number }): CalDay[] {
  const n = Math.min(o.days ?? CAL_DAYS, o.dates.length, o.bal.length), by: Record<string, CalEvent[]> = {};
  o.events.forEach(e => { if (!e.off && e.amount) (by[e.date] = by[e.date] || []).push(e); });
  const out: CalDay[] = [];
  for (let i = 0; i < n; i++) {
    const iso = o.dates[i], ev = by[iso] || [], pNeg = o.pNeg && o.pNeg.length > i ? o.pNeg[i] : o.bal[i] < 0 ? 1 : 0;
    out.push({ iso, i, events: ev, inn: ev.reduce((t, e) => t + (e.amount > 0 ? e.amount : 0), 0), out: ev.reduce((t, e) => t + (e.amount < 0 ? -e.amount : 0), 0),
      bal: o.bal[i], low: o.p10 && o.p10.length > i ? o.p10[i] : o.bal[i], pNeg: o.bal[i] < 0 ? Math.max(pNeg, .5) : pNeg, risk: o.bal[i] < 0 || pNeg >= RISK, tightest: false });
  }
  let t = -1;
  out.forEach((d, i) => { if (t < 0 || d.bal < out[t].bal) t = i; });
  if (t >= 0) out[t].tightest = true;
  return out;
}

import { monthRange, nowMonth } from '../core/base';
import { FF, type FfState } from '../core/api';
import { html } from '../core/html';

/* ================= Overview live strip =================
   A slim row under the Overview heading: a pulsing dot with "Synced 3s ago", and two small rings that fill as the
   day and the month pass. Honest about the connection: the age is when Firefly last answered (core/api.ts FF.okAt,
   refreshed by the 5-second ping), and while Firefly, this server or the network can't be reached it says so and
   shows no age and no pulse. Money keeps no copy of your data, so nothing here is ever "live" from a saved copy.
   Cheap: one 1-second timer that only touches text, ring arcs move once a minute, the pulse is a CSS animation of
   transform and opacity only, and nothing runs while the tab is hidden. */
const R = 8, C = 2 * Math.PI * R;
const at = (iso: string, plus = 0) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d + plus).getTime(); };

// Fraction (0..1) of the local day that has passed (a 23- or 25-hour DST day included)
export function dayFrac(now: number): number {
  const d = new Date(now), s = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return Math.max(0, Math.min(1, (now - s) / (e - s)));
}
// Fraction (0..1) of a period from the start of its first day to the end of its last
export function periodFrac(now: number, start: string, end: string): number {
  const s = at(start), e = at(end, 1);
  return e > s ? Math.max(0, Math.min(1, (now - s) / (e - s))) : 0;
}
export function agoText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 3 ? 'now' : s < 90 ? s + 's ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago';
}
// The sync line: only an answered Firefly gets an age; every other state says what is wrong and no time
export function syncText(state: FfState, why: string, okAt: number, now: number): string {
  if (state === 'ok') return okAt ? 'Synced ' + agoText(now - okAt) : 'Synced';
  if (state === 'offline') return 'Offline';
  if (state === 'auth') return 'Token rejected';
  if (state === 'down') return why === 'money' ? 'Money server down' : 'Firefly unreachable';
  return 'Checking…';
}
const pct = (f: number) => Math.round(f * 100);
const arc = (f: number) => (C * f).toFixed(2) + ' ' + C.toFixed(2);
const ringSvg = (kind: string, f: number) =>
  html`<svg viewBox="0 0 20 20" aria-hidden="true"><circle class="b" cx="10" cy="10" r="${R}"/><circle class="s" data-ring="${kind}" cx="10" cy="10" r="${R}" stroke-dasharray="${arc(f)}"/></svg>`;

export function liveStrip() {
  const now = Date.now(), [y, m] = nowMonth(), mr = monthRange(y, m), d = dayFrac(now), mo = periodFrac(now, mr.start, mr.end);
  return html`<div class="live" role="group" aria-label="Sync status and progress of today and this month" data-ff="${FF.state}"><span class="live-sync" role="status"><i aria-hidden="true"></i><span data-live="sync">${syncText(FF.state, FF.why, FF.okAt, now)}</span></span><span class="live-ring" title="Share of today that has passed">${ringSvg('day', d)}<span>Day <b data-live="day">${pct(d)}%</b></span></span><span class="live-ring" title="Share of this month that has passed">${ringSvg('month', mo)}<span>Month <b data-live="month">${pct(mo)}%</b></span></span></div>`;
}

let ringsAt = 0;
function tick(force = false) {
  const strips = document.querySelectorAll<HTMLElement>('.live');
  if (!strips.length || document.visibilityState !== 'visible') return;
  const now = Date.now(), text = syncText(FF.state, FF.why, FF.okAt, now);
  const rings = force || now - ringsAt >= 6e4;
  let day = 0, mo = 0;
  if (rings) { ringsAt = now; const [y, m] = nowMonth(), mr = monthRange(y, m); day = dayFrac(now); mo = periodFrac(now, mr.start, mr.end); }
  strips.forEach(s => {
    s.dataset.ff = FF.state;
    const set = (k: string, v: string) => { const n = s.querySelector('[data-live="' + k + '"]'); if (n && n.textContent !== v) n.textContent = v; };
    set('sync', text);
    if (!rings) return;
    set('day', pct(day) + '%'); set('month', pct(mo) + '%');
    s.querySelector('[data-ring="day"]')?.setAttribute('stroke-dasharray', arc(day));
    s.querySelector('[data-ring="month"]')?.setAttribute('stroke-dasharray', arc(mo));
  });
}
setInterval(() => tick(), 1000);
addEventListener('money-ff', () => tick());
document.addEventListener('visibilitychange', () => tick(true));

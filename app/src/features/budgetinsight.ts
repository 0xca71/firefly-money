import { type Html, html, htmlList } from '../core/html';
import { money0 } from '../core/base';
import { daysBetween } from '../core/helpers';
import { budgetMonthsChart, budgetPaceChart } from './charts';

/* ================= Budget insights =================
   What each budget did in earlier months and how this month compares: the average month, the usual pace through a month,
   this month's pace against it and against last month, where it is heading, streaks and the worst month. All worked out
   from the months' spending and amounts (budgets.ts loads them); nothing is kept. Tested in test/budgetinsight.test.ts. */
export type BMonth = { start: string, end: string, label: string, short: string, spent: number, limit: number, daily: number[] };
export type Tone = 'good' | 'warn' | 'over' | 'none';
export type BInsight = {
  months: BMonth[];                                      // oldest first; the last is the month on show
  past: BMonth[];                                        // earlier months in which the budget was in use
  live: boolean;                                         // the month on show includes today
  spent: number; limit: number; len: number; gone: number;
  avgSpend: number | null;                               // average of the earlier months
  usual: number[];                                       // their average running total, day by day
  vsUsual: number | null; vsLast: number | null;         // spent so far minus the same days of the usual month / last month
  ahead: number | null;                                  // month-end total at the pace so far
  daysLeft: number; safeDaily: number | null;
  streak: { kind: 'under' | 'over', n: number } | null;
  worst: { label: string, by: number } | null;           // the month it went furthest over its amount
  overCount: number; counted: number;                    // months over, of the months that had an amount
  tone: Tone; head: string; text: string;
};
const cum = (v: number[]) => { let t = 0; return v.map(x => (t += x)); };
const used = (m: BMonth) => m.limit > 0 || m.spent > 0;
const lenOf = (m: BMonth) => daysBetween(m.start, m.end) + 1;
export const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');

export function budgetInsight(months: BMonth[], today: string, alertPct: number): BInsight {
  const cur = months[months.length - 1], len = lenOf(cur), live = today >= cur.start && today <= cur.end;
  const gone = live ? daysBetween(cur.start, today) + 1 : today > cur.end ? len : 0;
  const past = months.slice(0, -1).filter(used), done = live ? past : used(cur) ? [...past, cur] : past;
  const avgSpend = past.length ? past.reduce((s, m) => s + m.spent, 0) / past.length : null;
  // The usual running total: each earlier month's, a month shorter than this one holding at its last total
  const curves = past.map(m => cum(m.daily)), usual = curves.length ? Array.from({ length: len }, (_, d) => curves.reduce((s, c) => s + (c[Math.min(d, c.length - 1)] || 0), 0) / curves.length) : [];
  const last = months.length > 1 ? months[months.length - 2] : null, lastCum = last && used(last) ? cum(last.daily) : [];
  const spent = cur.spent, limit = cur.limit, at = Math.max(1, gone) - 1;
  const vsUsual = live && usual.length ? spent - usual[Math.min(at, usual.length - 1)] : null;
  const vsLast = live && lastCum.length ? spent - lastCum[Math.min(at, lastCum.length - 1)] : null;
  const ahead = live && gone >= 3 && spent > 0 ? spent / gone * len : null;
  const daysLeft = live ? len - gone : 0, safeDaily = live && limit > spent ? (limit - spent) / (daysLeft + 1) : null;
  let streak: BInsight['streak'] = null;
  const rated = done.filter(m => m.limit > 0);
  for (let i = rated.length - 1; i >= 0; i--) {
    const kind = rated[i].spent > rated[i].limit ? 'over' : 'under';
    if (!streak) streak = { kind, n: 1 }; else if (streak.kind === kind) streak.n++; else break;
  }
  let worst: BInsight['worst'] = null;
  for (const m of rated) { const by = m.spent - m.limit; if (by > 0 && (!worst || by > worst.by)) worst = { label: m.label, by }; }
  const overCount = rated.filter(m => m.spent > m.limit).length;
  let tone: Tone = 'none', head = '', text = '';
  if (!limit) { head = 'No amount set'; text = avgSpend != null ? 'Averages ' + money0(avgSpend) + ' a month.' : spent ? money0(spent) + ' spent so far.' : 'Nothing spent yet.'; }
  else if (!live) {
    if (!gone) { head = 'Not started'; text = 'Nothing spent yet.'; }
    else if (spent > limit) { tone = 'over'; head = 'Went over'; text = money0(spent - limit) + ' over the ' + money0(limit) + ' budget.'; }
    else { tone = 'good'; head = 'Stayed within'; text = money0(limit - spent) + ' to spare of ' + money0(limit) + '.'; }
  } else if (spent > limit) { tone = 'over'; head = 'Over budget'; text = money0(spent - limit) + ' over with ' + plural(daysLeft, 'day') + ' to go.'; }
  else if (spent / limit * 100 >= alertPct) { tone = 'warn'; head = 'Nearly used up'; text = Math.round(spent / limit * 100) + '% used with ' + plural(daysLeft, 'day') + ' to go' + (safeDaily != null ? ' · ' + money0(safeDaily) + ' a day to stay within.' : '.'); }
  else if (ahead != null && ahead > limit) { tone = 'warn'; head = 'Ahead of pace'; text = 'Heading for ' + money0(ahead) + ' of ' + money0(limit) + (safeDaily != null ? ' · ' + money0(safeDaily) + ' a day keeps you within.' : '.'); }
  else { tone = 'good'; head = 'On track'; text = ahead != null ? 'Heading for about ' + money0(ahead) + ' of ' + money0(limit) + '.' : money0(limit - spent) + ' left of ' + money0(limit) + '.'; }
  return { months, past, live, spent, limit, len, gone, avgSpend, usual, vsUsual, vsLast, ahead, daysLeft, safeDaily, streak, worst, overCount, counted: rated.length, tone, head, text };
}

// ± amount for a stat: "−$40" (under) or "+$40" (over), green when under
const diff = (v: number | null, what: string) => v == null ? null : Math.abs(v) < 1 ? ['On par', 'neutral', what] as const : [(v > 0 ? '+' : '−') + money0(Math.abs(v)), v > 0 ? 'up' : 'down', what] as const;

// One budget's card: the verdict, the numbers, the months as bars and the month's pace
export function budgetCard(b: { id: string, name: string, active: boolean }, ins: BInsight, alertPct: number): Html {
  const stat = (label: string, val: Html | string, cls = '') => html`<div><dt>${label}</dt><dd class="num ${cls}">${val}</dd></div>`;
  const vu = diff(ins.vsUsual, 'usual'), vl = diff(ins.vsLast, 'last month');
  const stats = [
    ins.avgSpend != null ? stat('Average month', money0(ins.avgSpend)) : '',
    vu ? stat('vs. usual pace', vu[0], vu[1]) : '',
    vl ? stat('vs. last month', vl[0], vl[1]) : '',
    ins.live && ins.ahead != null ? stat('Month-end at this pace', money0(ins.ahead), ins.limit && ins.ahead > ins.limit ? 'up' : '') : '',
    ins.live && ins.safeDaily != null ? stat('Safe per day', money0(ins.safeDaily) + ' · ' + plural(ins.daysLeft + 1, 'day') + ' left') : '',
    ins.streak && ins.streak.n >= 2 ? stat(ins.streak.kind === 'under' ? 'Within budget' : 'Over budget', ins.streak.n + ' months running', ins.streak.kind === 'over' ? 'up' : 'down') : '',
    ins.counted ? stat('Over its amount', ins.overCount + ' of ' + plural(ins.counted, 'month'), ins.overCount ? 'up' : '') : '',
    ins.worst ? stat('Worst month', ins.worst.label + ' · ' + money0(ins.worst.by) + ' over', 'up') : '',
  ].filter(Boolean);
  const pts = ins.months.map(m => ({ label: m.label, short: m.short, spent: m.spent, limit: m.limit, go: '#/transactions?budget=' + b.id + '&start=' + m.start + '&end=' + m.end }));
  const cur = ins.months[ins.months.length - 1], now = cum(cur.daily).slice(0, ins.live ? ins.gone : ins.len);
  const history = ins.months.filter(used).length > 1 ? html`<div class="bi-chart"><h3>Month by month</h3>${budgetMonthsChart(pts, alertPct, 'Spent and budgeted by month for ' + b.name)}<div class="legend"><span><i style="background:var(--good)"></i>Within</span><span><i style="background:var(--spend)"></i>Over</span><span><i class="tick"></i>Budget</span></div></div>` : '';
  const pace = ins.live || ins.usual.length ? html`<div class="bi-chart"><h3>Pace through the month</h3>${budgetPaceChart(now, ins.usual, cur.limit, ins.len, ins.live && ins.ahead != null ? ins.ahead : 0, [cur.short, 'Usual'], 'Spending through the month for ' + b.name)}<div class="legend"><span><i style="background:var(--accent)"></i>${cur.short}</span>${ins.usual.length ? html`<span><i class="dash"></i>Usual (${plural(ins.past.length, 'month')})</span>` : ''}${cur.limit ? html`<span><i class="tick"></i>Budget</span>` : ''}</div></div>` : '';
  return html`<article class="panel binsight"${b.active ? '' : html` style="opacity:.6"`}><header><a class="desc" href="#/transactions?budget=${b.id}">${b.name}</a>${ins.head ? html`<span class="chip ${ins.tone === 'over' ? 'bad' : ins.tone === 'none' ? '' : ins.tone}">${ins.head}</span>` : ''}</header><p class="bi-verdict">${ins.text}</p>${stats.length ? html`<dl class="bi-stats">${htmlList(stats)}</dl>` : ''}${history}${pace}</article>`;
}

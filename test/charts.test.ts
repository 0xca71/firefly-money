import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { barChart, paceChart, twoLines, shareChart, sparkBars } from '../app/src/features/charts';

const clean = (h: unknown) => { const s = String(h); expect(s).not.toMatch(/NaN|Infinity|undefined/); return s; };

describe('paceChart', () => {
  it('draws this month up to today against all of last month', () => {
    const s = clean(paceChart([10, 0, 25], Array(30).fill(5), 31, ['Oct', 'Sep']));
    expect(s.match(/class="draw/g)).toHaveLength(2);
    expect(s).toContain('class="pace-dot"');
  });
  it('copes with a first day, an empty month and nothing last month', () => {
    clean(paceChart([12], [], 31, ['Oct', 'Sep']));
    clean(paceChart([], [], 30, ['Nov', 'Oct']));
    clean(paceChart([0, 0, 0], [0, 0], 28, ['Feb', 'Jan']));
  });
});

describe('barChart', () => {
  it('puts losing months below the line and leaves months without income empty', () => {
    const s = clean(barChart([{ label: 'May', v: 40 }, { label: 'Jun', v: -15 }, { label: 'Jul', v: null }], v => v + '%', 'Savings rate'));
    expect(s.match(/class="bar /g)).toHaveLength(1);
    expect(s).toContain('class="bar neg"');
    expect(s).toContain('Jul · no income');
  });
  it('copes with every month at zero', () => { clean(barChart([{ label: 'A', v: 0 }, { label: 'B', v: 0 }], v => v + '%', 'x')); });
});

describe('spent card bars', () => {
  const css = readFileSync('app/assets/money.css', 'utf8');
  it('never stretch with the card: fixed height, foot-aligned, round corners', () => {
    const rules = css.split('\n').filter(l => /\.cards\.bento \.panel\.stat \.sbars \{/.test(l));
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach(l => { expect(l).not.toMatch(/flex:\s*1/); expect(l).toMatch(/clamp\(56px, 26cqi, 130px\)/); });
    expect(css).toMatch(/\.sbars\[style\*="--sx"\] \.bar \{ rx: calc\(2px \/ var\(--sx, 1\)\)/);
  });
  it('are measured from zero', () => {
    const s = clean(sparkBars([10, 20], 20));
    expect(s).toContain('height="13.0"'); expect(s).toContain('height="26.0"');
  });
});

describe('sparkBars', () => {
  it('marks the last month and survives all zeros', () => {
    expect(clean(sparkBars([5, 10, 0, 20], 20))).toContain('class="bar now"');
    clean(sparkBars([0, 0, 0], 0));
  });
  it('gives each month a tip when asked', () => {
    const s = clean(sparkBars([5, 10], 10, ['Sep · $5', 'Oct · $10']));
    expect(s.match(/data-tip=/g)).toHaveLength(2);
    expect(s).toContain('data-tip="Oct · $10"');
    expect(clean(sparkBars([5, 10], 10))).not.toContain('data-tip');
  });
});

describe('shareChart', () => {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((name, i) => ({ name, v: 90 - i * 10 }));
  it('gives the biggest six a colour and a slice, and sums the rest past the limit', () => {
    const s = clean(shareChart(rows, 'mid', 'x', { limit: 7 }));
    expect(s.match(/class="part"/g)).toHaveLength(8);      // 7 listed and "Everything else" (2 more)
    expect(s).toContain('2 more');
    expect(s.match(/class="seg"/g)).toHaveLength(7);       // 6 coloured slices and one grey one for the rest
    expect(s).toContain('>20%<');                           // A: 90 of 450
  });
  it('lists a single leftover by name, can leave out the donut, and is empty with nothing spent', () => {
    expect(clean(shareChart(rows.slice(0, 3), 'mid', 'x', { limit: 2 }))).toContain('>C<');
    expect(String(shareChart(rows, 'mid', 'x', { ring: false }))).not.toContain('class="donut"');
    expect(String(shareChart([{ name: 'A', v: 0 }], 'mid', 'x'))).toBe('');
  });
});

describe('bento ring cards', () => {
  const css = readFileSync('app/assets/money.css', 'utf8');
  it('Top payees and Income sources get the same ring-fills-card rules as Where it went; Goals fills like the lists', () => {
    for (const sel of ['.share { flex: 1;', '.share .parts { align-self: stretch;', '.share { grid-template-columns: minmax(104px, min(46%, 340px))'])
      expect(css).toContain('.cards.bento .w:is([data-w="spending"], [data-w="payees"], [data-w="income"]) ' + sel);
    expect(css).toContain('.cards.bento .w[data-w="safe"] > .panel { display: flex;');
    expect(css).toMatch(/\.w:is\(\[data-w="spending"\], \[data-w="payees"\], \[data-w="income"\], \[data-w="goals"\], \[data-w="cash"\]/);
  });
});

describe('legend swatches match the plotted series', () => {
  const css = readFileSync('app/assets/money.css', 'utf8'), src = readFileSync('app/src/features/budgetinsight.ts', 'utf8');
  it('budget pace legend: current solid accent, projection dotted, usual dashed muted, budget dashed warn', () => {
    expect(css).toMatch(/\.bpace \.lim \{ stroke: var\(--warn\); stroke-width: 1\.5; stroke-dasharray: 2 4/);
    expect(css).toMatch(/\.bpace \.ahead \{ stroke: var\(--accent\); stroke-width: 2; stroke-dasharray: 2 5/);
    expect(css).toMatch(/\.legend i\.lg-ln \{[^}]*border-top: var\(--w, 2px\) var\(--s, solid\) var\(--c\)/);
    expect(src).toContain('--c:var(--accent);--w:2.6px');                                  // solid line, as drawn (2.6)
    expect(src).toContain('--c:var(--accent);--w:2px;--s:dotted');                         // projection
    expect(src).toContain('--c:var(--muted);--w:2px;--s:dashed');                          // usual
    expect(src).toContain('--c:var(--warn);--w:1.5px;--s:dashed');                         // budget
    expect(src).not.toContain('lg-dash');
  });
  it('line-chart legends use line swatches with the drawn widths', () => {
    const t = twoLines([{ label: 'a', a: 1, b: 2 }, { label: 'b', a: 2, b: 3 }] as never, ['A', 'B'], ['#111', '#222'], 'x');
    expect(String(t)).toContain('class="lg-ln" style="--c:#111;--w:2.6px"'); expect(String(t)).toContain('class="lg-ln" style="--c:#222;--w:2.2px"');
    const p = String(paceChart([1, 2, 3], [1, 2, 3], 30, ['This', 'Last']));
    expect(p).toContain('--c:var(--accent);--w:2.6px'); expect(p).toContain('--c:var(--muted);--w:2px;--o:.7');
  });
});

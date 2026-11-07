import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTIVITY_RANGES, activityCell, activityDays, activityPanel, activityRange } from '../app/src/features/charts';
import { TILE_OPTS, tileOpt } from '../app/src/features/dashboard';

const css = readFileSync('app/assets/money.css', 'utf8');
const reports = readFileSync('app/src/pages/reports.ts', 'utf8');
const buys = [{ date: '2026-11-03', amount: 20 }, { date: '2026-02-10', amount: 5 }];

describe('Overview activity grid', () => {
  it('ranges end today and start 1, 3, 6 months back, the year start, or the first purchase', () => {
    expect(activityRange('1m', '2026-11-07', '')).toEqual({ start: '2026-10-08', end: '2026-11-07' });
    expect(activityRange('3m', '2026-11-07', '').start).toBe('2026-08-08');
    expect(activityRange('6m', '2026-11-07', '').start).toBe('2026-05-08');
    expect(activityRange('year', '2026-11-07', '').start).toBe('2026-01-01');
    expect(activityRange('all', '2026-11-07', '2019-04-02').start).toBe('2019-04-02');
  });
  it('defaults to this year and offers 1M to all history', () => {
    expect(tileOpt('activity', 'range')).toBe('year');
    expect(TILE_OPTS.activity[0].options).toEqual(Object.keys(ACTIVITY_RANGES));
  });
  it('lifts the 53-week cap for the tile so all history shows', () => {
    expect(activityDays(buys, '2019-01-01', '2026-11-07', '2026-11-07').length).toBe(371);
    expect(activityDays(buys, '2019-01-01', '2026-11-07', '2026-11-07', 2000).length).toBe(2868);
  });
  it('the tile has pressed-state range chips, the table alternative', () => {
    const h = String(activityPanel(buys, '2026-10-08', '2026-11-07', { range: '1m' }));
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain("App.dashOpt('activity','range','all')");
    expect(h).toContain('Show as table');
    expect(h).toContain('--agm:14px');
    expect(activityCell(5)).toBe(activityCell(53));
  });
  it('an empty range still shows the chips, so another can be picked', () => {
    expect(String(activityPanel([], '2026-10-08', '2026-11-07', { range: '1m' }))).toContain('No spending in this range');
  });
  it('is on the Overview by default and never uses saved data', () => {
    const o = readFileSync('app/src/pages/overview.ts', 'utf8');
    expect(readFileSync('app/src/features/dashboard.ts', 'utf8')).toMatch(/DASH_DEFAULT = \[[^\]]*'activity'/);
    expect(o).toContain('Firefly isn’t answering');
  });
});

describe('Reports layout', () => {
  it('has a gap under the activity grid and keeps the share cards in the justified flow', () => {
    expect(css).toMatch(/\.report-gap:not\(:empty\) \{ margin-bottom: 20px/);
    expect(reports).toContain('<div class="flow report-cols">');
    expect(reports).toContain('class="report-gap"');
  });
  it('the range chips are 44px tall on a phone', () => {
    expect(css).toMatch(/\.ag-range \.btn \{ flex: 1 1 0; min-width: 0; min-height: 44px/);
  });
  it('every range has the same fixed-height grid, so switching chips shifts nothing', () => {
    expect(css).toMatch(/\.ag-scroll \{ height: 150px/);
    expect(css).toMatch(/\.ag-blank \{ height: 150px/);
    expect(css).toMatch(/\.panel \.ag-lead \{ min-height: 2\.6em; margin-bottom: 8px/);
    expect(css).toMatch(/\.panel:has\(\.ag-scroll, \.ag-blank\) \{ padding: 18px 20px 12px/);
    for (const r of ['1m', 'year', 'all']) expect(String(activityPanel(buys, '2019-01-01', '2026-11-07', { range: r }))).toContain('--agm:14px');
  });
  it('a chip press redraws only the Activity card, not the page', () => {
    const dash = readFileSync('app/src/features/dashboard.ts', 'utf8'), ov = readFileSync('app/src/pages/overview.ts', 'utf8');
    expect(dash).toMatch(/k === 'activity' && App\.activityRedraw/);
    expect(ov).toMatch(/sec\.replaceWith\(next\)/);
    expect(ov).toMatch(/const methods = \{ attMore, activityRedraw, nwRedraw \}/);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { agoText, dayFrac, periodFrac, syncText } from '../app/src/features/live';

const css = readFileSync('app/assets/money.css', 'utf8'), src = readFileSync('app/src/features/live.ts', 'utf8'), page = readFileSync('app/src/pages/overview.ts', 'utf8');

describe('live strip', () => {
  it('day and period progress', () => {
    expect(dayFrac(new Date(2026, 10, 8, 0, 0).getTime())).toBe(0);
    expect(dayFrac(new Date(2026, 10, 8, 12, 0).getTime())).toBeCloseTo(0.5, 3);
    expect(periodFrac(new Date(2026, 10, 16, 0, 0).getTime(), '2026-11-01', '2026-11-30')).toBeCloseTo(0.5, 3);
    expect(periodFrac(new Date(2020, 0, 1).getTime(), '2026-11-01', '2026-11-30')).toBe(0);
    expect(periodFrac(new Date(2030, 0, 1).getTime(), '2026-11-01', '2026-11-30')).toBe(1);
  });
  it('shows an age only while Firefly answers; never a saved-copy "live"', () => {
    const now = 1e12;
    expect(syncText('ok', '', now - 12e3, now)).toBe('Synced 12s ago');
    expect(syncText('ok', '', now - 1e3, now)).toBe('Synced now');
    for (const s of ['down', 'auth', 'offline', 'checking'] as const) expect(syncText(s, '', now - 5e3, now)).not.toMatch(/Synced|ago/);
    expect(syncText('down', 'money', now, now)).toBe('Money server down');
    expect(syncText('down', '', now, now)).toBe('Firefly unreachable');
    expect(agoText(120e3)).toBe('2 min ago');
  });
  it('is cheap: pulse is transform/opacity only, paused when hidden or reduced motion, no backdrop-filter, one 1s text timer', () => {
    const block = css.slice(css.indexOf('Overview live strip'), css.indexOf('Getting started card'));
    expect(block).toMatch(/@keyframes live-pulse \{[^}]*opacity[^}]*transform[^}]*\}/);
    expect(block).not.toMatch(/backdrop-filter|filter:|box-shadow/);
    expect(block).toMatch(/prefers-reduced-motion: reduce[^}]*animation: none/);
    expect(block).toMatch(/data-ff="ok"\] \.live-sync > i::after \{ animation/);
    expect(src).toMatch(/visibilityState !== 'visible'\) return/);
    expect(src).not.toMatch(/requestAnimationFrame/);
    expect((src.match(/setInterval/g) || []).length).toBe(1);
  });
  it('sits on the Overview under the heading', () => {
    expect(page).toMatch(/\$\{liveStrip\(\)\}\$\{gettingStarted\(\)\}/);
  });
});

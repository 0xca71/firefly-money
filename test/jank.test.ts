import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const morph = readFileSync('app/src/core/morph.ts', 'utf8'), pill = readFileSync('app/src/features/pill.ts', 'utf8'), css = readFileSync('app/assets/money.css', 'utf8');

describe('frame drops', () => {
  it('the month wave nudges cards with translate/scale (compositor), never an additive transform (main thread)', () => {
    expect(morph).not.toMatch(/composite:\s*'add'/);
    expect(morph).toMatch(/translate: dx, scale: \.985/);
  });
  it('tweened charts and rolling digits get a layer of their own, so a frame repaints them and not the card', () => {
    expect(morph).toMatch(/const lift = .*willChange = 'transform'/);
    expect((morph.match(/\blift\(v\)/g) || []).length).toBe(2);       // both chart morphs
    expect((morph.match(/\bdrop\(v\)/g) || []).length).toBe(2);
    expect(css).toMatch(/\.odo-s \{[^}]*will-change: transform/);
  });
  it('the edge glow paints only near the pointer and on its own layer', () => {
    const ring = css.slice(css.indexOf('.edge::before {'), css.indexOf('.edge-f:not(:focus)'));
    expect(ring).toMatch(/clip-path: circle\(calc\(var\(--edge-r\) \+ 10px\) at calc\(var\(--ex\)/);
    expect(ring).toMatch(/will-change: transform/);
  });
  it('a redraw measures everything before it changes anything (amounts roll in batches)', () => {
    expect(morph).toMatch(/function rollAll\(/);
    expect(morph).not.toMatch(/\bfunction roll\(/);
    const m = morph.slice(morph.indexOf('export function morph('));
    expect(m).not.toMatch(/near\((?!e\.getBoundingClientRect\(\)\)\)|c\.getBoundingClientRect)/);
    expect(m.indexOf('measured.forEach')).toBeLessThan(m.indexOf('glideRows('));
  });
  it('pills rescan only when a control changes, and read every control before writing any', () => {
    expect(pill).toMatch(/const control = /);
    expect(pill).toMatch(/const inControl = /);
    const scan = pill.slice(pill.indexOf('function scan()'), pill.indexOf('let queued'));
    expect(scan.indexOf('jobs.push')).toBeLessThan(scan.indexOf('jobs.forEach'));
    expect(scan).not.toMatch(/querySelectorAll[^;]*\.forEach\(mount\)/);
  });
  it('no animation in the app uses the additive composite', () => {
    for (const f of ['core/morph.ts', 'features/pill.ts', 'features/polish.ts', 'pages/transactions.ts']) expect(readFileSync('app/src/' + f, 'utf8')).not.toMatch(/composite:/);
  });
});

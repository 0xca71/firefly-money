// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* WCAG AA (4.5:1) for body text in every theme, read from money.css. Solid themes: text on the page and on cards.
   Glass and Frosted put text on translucent cards over a moving or photographic backdrop, so each is checked over the
   worst backdrops it can show (the page colour and each glow at the strength money.css paints it). */
const css = readFileSync(new URL('../app/assets/money.css', import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
type RGBA = [number, number, number, number];
const parse = (v: string | undefined): RGBA | null => {
  if (!v) return null; v = v.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v); if (m) { const h = m[1]; return [0, 1, 2].map(i => parseInt(h[i] + h[i], 16)).concat(1) as RGBA; }
  m = /^#([0-9a-f]{6})$/i.exec(v); if (m) return [0, 2, 4].map(i => parseInt(m![1].slice(i, i + 2), 16)).concat(1) as RGBA;
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(v);
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
};
const over = (top: RGBA, under: RGBA, alpha = top[3]): RGBA => [0, 1, 2].map(i => top[i] * alpha + under[i] * (1 - alpha)).concat(1) as RGBA;
const lum = (c: RGBA) => { const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a: RGBA, b: RGBA) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

// every `html[data-theme="x"]` (optionally `[data-scene="y"]`) block that sets variables
const blocks: Record<string, Record<string, string>> = {};
for (const m of css.matchAll(/(?:^|\n)\s*(html\[data-theme="([a-z]+)"\](?:\[data-scene="([a-z]+)"\])?)\s*\{([^}]*)\}/g)) {
  const vars: Record<string, string> = {};
  for (const d of m[4].split(';')) { const i = d.indexOf(':'); if (i > 0 && d.trim().startsWith('--')) vars[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  const id = m[2] + (m[3] ? ':' + m[3] : ''); blocks[id] = { ...blocks[id], ...vars };
}
const themes = Object.keys(blocks).filter(k => !k.includes(':') && blocks[k]['--text']);
const get = (k: string, v: string): RGBA => parse(blocks[k][v] ?? blocks[k.split(':')[0]][v]) as RGBA;
const mixed = (c: RGBA, strength: number, under: RGBA): RGBA => over(c, under, strength);

// Backdrops the card can sit on, and the card's surface over each (worst case: the lightest layer on top for light text, the darkest for dark text)
function surfaces(k: string): RGBA[] {
  const [theme] = k.split(':'), bg = get(k, '--bg');
  if (theme === 'glass') {
    const spots = [bg, mixed(get(k, '--glow1'), .42, bg), mixed(get(k, '--glow2'), .30, bg), mixed(get(k, '--glow3'), .40, bg), mixed(get(k, '--good'), .16, bg)];
    const tint = parseFloat(blocks[k]['--glass-tint'] ?? blocks.glass['--glass-tint']) / 100, base = get(k, '--glass-base');
    return spots.map(b => over([255, 255, 255, 1], mixed(base, tint, b), .11));
  }
  if (theme === 'frosted') {
    const night = k.endsWith(':night'), tint = parseFloat(blocks[k]['--glass-tint'] ?? blocks.frosted['--glass-tint']) / 100, base = get(k, '--glass-base');
    const spots = night ? [bg, mixed(get(k, '--glow1'), .34, bg), mixed(get(k, '--glow3'), .30, bg), get(k, '--glow2')]
      : [bg, mixed(get(k, '--glow1'), .75, bg), mixed(get(k, '--glow3'), .55, bg), mixed(get(k, '--glow2'), .95, bg), over([40, 32, 28, .5], bg)];
    const cards = spots.map(b => night ? over([255, 255, 255, 1], mixed(base, tint, b), .10) : over([255, 255, 255, 1], mixed(base, tint, b), .18));
    const sheet = night ? parse('rgba(26, 21, 36, .82)') : parse('rgba(250, 243, 235, .8)');
    return [...cards, ...spots.map(b => over(sheet!, b))];
  }
  const panel = get(k, '--panel');
  return [bg, over(panel, bg)];
}
const keys = Object.keys(blocks).filter(k => themes.includes(k.split(':')[0]) && (!k.includes(':') || k.startsWith('frosted:')) && (blocks[k]['--text'] || k.includes(':')));

describe('theme contrast (WCAG AA, 4.5:1)', () => {
  it('finds all the themes', () => { expect(themes.length).toBeGreaterThanOrEqual(18); expect(themes).toEqual(expect.arrayContaining(['glass', 'frosted', 'light', 'dark'])); });
  for (const k of keys) {
    it(k + ': text and muted text read on every surface', () => {
      const text = get(k, '--text'), muted = get(k, '--muted'), bad: string[] = [];
      surfaces(k).forEach((s, i) => {
        for (const [name, c] of [['text', text], ['muted', muted]] as const) { const r = ratio(c, s); if (r < 4.5) bad.push(name + ' on surface ' + i + ' = ' + r.toFixed(2)); }
      });
      expect(bad).toEqual([]);
    });
    it(k + ': money colours read as text, and button text reads on its fill', () => {
      const bad: string[] = [];
      surfaces(k).forEach((s, i) => {
        for (const v of ['good', 'spend', 'warn']) { const c = parse(blocks[k]['--' + v + '-t'] ?? blocks[k.split(':')[0]]['--' + v + '-t']) || get(k, '--' + v); if (c) { const r = ratio(c, s); if (r < 4.5) bad.push(v + ' on surface ' + i + ' = ' + r.toFixed(2)); } }
      });
      const acc = parse(blocks[k]['--accent'] ?? blocks[k.split(':')[0]]['--accent']), on = parse(blocks[k]['--on-accent'] ?? blocks[k.split(':')[0]]['--on-accent']);
      if (acc && on && ratio(on, acc) < 4.5) bad.push('on-accent on accent = ' + ratio(on, acc).toFixed(2));
      expect(bad).toEqual([]);
    });
  }
});

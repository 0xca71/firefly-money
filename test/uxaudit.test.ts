import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/assets/money.css', 'utf8');


describe('UI UX Pro Max audit fixes', () => {
  it('gives small buttons, search and Timeline links a 44px tap area on touch screens', () => {
    const block = css.slice(css.indexOf('@media (pointer: coarse)'));
    for (const sel of ['.btn.small', '.tl-go', '.search-btn']) expect(block).toContain(sel + '::after');
    expect(block).toMatch(/width: max\(100%, 44px\); height: max\(100%, 44px\)/);
    expect(block).toContain('.search-btn { position: fixed; }');
  });
  it('keeps the budget and tag hints at full muted contrast, with no faded copy under 4.5:1', () => {
    expect(css).not.toMatch(/\.bud-s, \.tag-s \{[^}]*opacity/);
  });
  it('keeps small text at 10.5px or more', () => {
    expect(css).toContain('.av.sm { width: 26px; height: 26px; font-size: 11px; }');
    expect(css).not.toContain('.eyebrow { font-size: 9.5px; }');
  });
});

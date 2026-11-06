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

describe('Motion fluidity', () => {
  it('uses shared decelerating easing for page, card, drawer and press motion', () => {
    expect(css).toContain('--ease-out: cubic-bezier(.2, .8, .2, 1)');
    expect(css).toContain('#view.enter > * { animation: fadeUp .26s var(--ease-out) both; }');
    expect(css).toContain('transform .3s var(--ease-glide)');
    expect(css).toMatch(/\.btn, \.round[^}]*transform \.18s var\(--ease-out\)/);
    expect(css).not.toMatch(/\.drawer \{[^}]*transition: transform \.2\d?s ease;/);
  });
  it('keeps the global reduced-motion kill switch', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \*, \*::before, \*::after \{ animation: none !important; transition: none !important; \} \}/);
  });
});

describe('Motion polish', () => {
  it('slides the skeleton shimmer with a transform, not background-position', () => {
    expect(css).toContain('@keyframes shimmerX { to { transform: translateX(100%); } }');
    expect(css).toMatch(/\.sk::after \{[^}]*animation: shimmerX/);
    expect(css).not.toMatch(/\.sk \{[^}]*animation: shimmer /);
  });
  it('gives dialogs a spring only when linear() easing and motion are allowed', () => {
    expect(css).toMatch(/@supports \(animation-timing-function: linear\(0, 1\)\) \{ @media \(prefers-reduced-motion: no-preference\) \{ dialog:not\(\.whatsnew\)\[open\] \{ animation: wn-in \.42s var\(--ease-spring\)/);
  });
  it('shares one hover duration token and gives donut segments press feedback', () => {
    expect(css).toContain('--t-hover: .14s');
    expect(css).toContain('.donut .seg:active');
    expect(css).not.toMatch(/transition:[^;}]* \.1[25]s[,;]/);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/assets/money.css', 'utf8');
const at = css.indexOf('Sidebar fits the window');
const block = css.slice(at);

describe('Sidebar height fit', () => {
  it('scales rows, headings and padding with the viewport height on desktop', () => {
    expect(block).toContain('@media (min-width: 901px)');
    expect(block).toMatch(/--row: clamp\(\d+px, calc\(\(100vh/);
    expect(block).toMatch(/\.side \.nav a, \.side \.foot \.nav a \{ min-height: var\(--row\)/);
    expect(block).toMatch(/\.side \.nav-h \{ height: var\(--hh\)/);
    expect(block).toMatch(/html\.side-mini \.side \.nav-h \{ height: var\(--hm\)/);
  });
  it('keeps desktop mouse rows at 24px or more', () => {
    expect(Number(/--row: clamp\((\d+)px/.exec(block)![1])).toBeGreaterThanOrEqual(24);
  });
  it('keeps big touch rows and scrolls instead when the window is too short', () => {
    expect(block).toMatch(/\(pointer: coarse\) \{\s*\.side \{ --row: 40px/);
    expect(css).toMatch(/\.side \{ position: sticky;[^}]*overflow-y: auto/);
  });
});

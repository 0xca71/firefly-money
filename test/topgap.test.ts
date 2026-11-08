import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/assets/money.css', 'utf8');

describe('mobile space above the page heading', () => {
  it('keeps the iOS Home Screen --edge small but never drops the safe-area inset', () => {
    const m = css.match(/html\.ios-web \{ --edge: (\d+)px; \}/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(12);
    expect(css).toContain('html.shell:not(.ab-row) main#view { padding-top: calc(env(safe-area-inset-top, 0px) + var(--edge) + 4px)');
  });
});
